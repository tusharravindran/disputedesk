// Minimal PayPal REST client (server-only). Docs: https://developer.paypal.com/api/rest
import "server-only";

// PayPal responses are large, loosely-typed JSON; the agent reads them as data.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PP = Record<string, any>;

const BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

export class PayPalError extends Error {
  constructor(public status: number, public body: unknown, path: string) {
    super(`PayPal ${status} on ${path}: ${JSON.stringify(body)}`);
  }
}

export async function paypal<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; form?: FormData } = {},
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${await accessToken()}` };
  let body: BodyInit | undefined;
  if (init.form) body = init.form;
  else if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (body ? "POST" : "GET"),
    headers,
    body,
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new PayPalError(res.status, json, path);
  return json as T;
}

// ---------- Orders v2 ----------
export type OrderItem = { name: string; sku: string; price: string; quantity: number };

export function createOrder(items: OrderItem[], shipping?: { name: string; address: Record<string, string> }) {
  const total = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0).toFixed(2);
  return paypal<{ id: string; status: string }>("/v2/checkout/orders", {
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: total,
            breakdown: { item_total: { currency_code: "USD", value: total } },
          },
          items: items.map((i) => ({
            name: i.name,
            sku: i.sku,
            quantity: String(i.quantity),
            unit_amount: { currency_code: "USD", value: i.price },
            category: "PHYSICAL_GOODS",
          })),
          ...(shipping ? { shipping: { name: { full_name: shipping.name }, address: shipping.address } } : {}),
        },
      ],
    },
  });
}

export const captureOrder = (id: string) =>
  paypal<PP>(`/v2/checkout/orders/${id}/capture`, { method: "POST", body: {} });

export const getOrder = (id: string) => paypal<PP>(`/v2/checkout/orders/${id}`);

export const getCapture = (id: string) => paypal<PP>(`/v2/payments/captures/${id}`);

// ---------- Disputes v1 ----------
export const listDisputes = () =>
  paypal<{ items?: Array<PP> }>("/v1/customer/disputes?page_size=50");

export const getDispute = (id: string) => paypal<PP>(`/v1/customer/disputes/${id}`);

// ---------- Webhooks v1 ----------
export async function verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const res = await paypal<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
    body: {
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    },
  });
  return res.verification_status === "SUCCESS";
}
