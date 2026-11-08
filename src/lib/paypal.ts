// Minimal PayPal REST client. Docs: https://developer.paypal.com/api/rest
import "server-only";

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
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new PayPalError(res.status, json, path);
  return json as T;
}

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

export const listDisputes = () =>
  paypal<{ items?: Array<PP> }>("/v1/customer/disputes?page_size=50");

export const getDispute = (id: string) => paypal<PP>(`/v1/customer/disputes/${id}`);

export type EvidenceInput = {
  evidence_type: string;
  notes?: string;
  evidence_info?: { tracking_info?: Array<{ carrier_name: string; tracking_number: string }> };
};

/** Provide evidence (multipart/form-data; the JSON payload goes in the "input" part). */
export function provideEvidence(id: string, evidences: EvidenceInput[]) {
  const form = new FormData();
  form.append("input", new Blob([JSON.stringify({ evidences })], { type: "application/json" }));
  return paypal<PP>(`/v1/customer/disputes/${id}/provide-evidence`, { method: "POST", form });
}

/** Accept the buyer's claim and refund. accept_claim_type must be listed in allowed_response_options. */
export const acceptClaim = (id: string, note: string, acceptClaimType = "REFUND") =>
  paypal<PP>(`/v1/customer/disputes/${id}/accept-claim`, {
    body: { note, accept_claim_type: acceptClaimType },
  });

/** Offer a partial refund. Only valid while dispute_life_cycle_stage is INQUIRY. */
export const makeOffer = (id: string, note: string, amount: { currency_code: string; value: string }) =>
  paypal<PP>(`/v1/customer/disputes/${id}/make-offer`, {
    body: { note, offer_amount: amount, offer_type: "REFUND" },
  });

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

export const getOrder = (id: string) => paypal<PP>(`/v2/checkout/orders/${id}`);
