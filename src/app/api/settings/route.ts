import { NextResponse } from "next/server";
import { z } from "zod";
import { clearPayPalSettings, getPayPalConfig, savePayPalSettings } from "@/lib/config";
import { ensureWebhook, PayPalError, requestToken } from "@/lib/paypal";
import { mask, safeEqual } from "@/lib/secrets";
import { resetWorkspace, syncAfterSwitch } from "@/lib/workspace";

const Body = z.object({
  clientId: z.string().trim().min(10).max(200),
  clientSecret: z.string().trim().min(10).max(200),
  webhookId: z.string().trim().max(100).optional(),
  adminPassword: z.string().optional(),
});

/** Editing settings needs ADMIN_PASSWORD in production; local development is open. */
function authorized(password: string | undefined) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return process.env.NODE_ENV !== "production";
  return !!password && safeEqual(password, expected);
}

export async function GET() {
  const cfg = await getPayPalConfig();
  return NextResponse.json({
    source: cfg.source,
    clientId: cfg.clientId ? mask(cfg.clientId) : null,
    webhookConfigured: !!cfg.webhookId,
    passwordRequired: !!process.env.ADMIN_PASSWORD || process.env.NODE_ENV === "production",
  });
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Client ID and secret look invalid" }, { status: 400 });
  const { clientId, clientSecret, webhookId, adminPassword } = parsed.data;
  if (!authorized(adminPassword)) return NextResponse.json({ error: "Wrong admin password" }, { status: 401 });

  const current = await getPayPalConfig();
  try {
    await requestToken(clientId, clientSecret, current.apiBase); // validate before touching any data
  } catch (e) {
    const detail = e instanceof PayPalError ? (e.body as { error_description?: string })?.error_description : undefined;
    return NextResponse.json({ error: `PayPal rejected these keys${detail ? `: ${detail}` : ""}` }, { status: 400 });
  }

  // Register the dispute webhook in the merchant's PayPal app automatically (needs a public HTTPS URL).
  let webhook: { id: string | null; status: string };
  const hookUrl = webhookUrl(req);
  if (webhookId) webhook = { id: webhookId, status: "provided" };
  else if (!hookUrl) webhook = { id: null, status: "skipped: PayPal needs a public HTTPS URL (works once deployed)" };
  else {
    try {
      webhook = { id: await ensureWebhook(clientId, clientSecret, current.apiBase, hookUrl), status: "registered" };
    } catch (e) {
      console.error("[settings] webhook registration failed", e);
      webhook = { id: null, status: "failed: check that the app has webhooks enabled" };
    }
  }

  const switching = current.clientId !== clientId;
  await savePayPalSettings(clientId, clientSecret, webhook.id);
  if (!switching) return NextResponse.json({ ok: true, switched: false, webhook: webhook.status });

  await resetWorkspace();
  const sync = await syncAfterSwitch();
  return NextResponse.json({ ok: true, switched: true, webhook: webhook.status, ...sync });
}

/** Public URL PayPal should call, from PUBLIC_URL or the request's host. Null when not reachable by PayPal. */
function webhookUrl(req: Request): string | null {
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const base = process.env.PUBLIC_URL ?? (host ? `${proto}://${host}` : null);
  if (!base || !base.startsWith("https://") || /localhost|127\.0\.0\.1/.test(base)) return null;
  return `${base.replace(/\/$/, "")}/api/webhooks/paypal`;
}

/** Forget saved keys and fall back to the environment's keys (also resets the workspace). */
export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!authorized(body?.adminPassword)) return NextResponse.json({ error: "Wrong admin password" }, { status: 401 });
  const before = (await getPayPalConfig()).clientId;
  await clearPayPalSettings();
  const after = await getPayPalConfig();
  if (before === after.clientId) return NextResponse.json({ ok: true, switched: false });
  await resetWorkspace();
  const sync = after.source === "none" ? { synced: 0 } : await syncAfterSwitch();
  return NextResponse.json({ ok: true, switched: true, ...sync });
}
