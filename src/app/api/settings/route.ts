import { NextResponse } from "next/server";
import { z } from "zod";
import { clearPayPalSettings, getPayPalConfig, savePayPalSettings } from "@/lib/config";
import { PayPalError, requestToken } from "@/lib/paypal";
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

  const switching = current.clientId !== clientId;
  await savePayPalSettings(clientId, clientSecret, webhookId || null);
  if (!switching) return NextResponse.json({ ok: true, switched: false });

  await resetWorkspace();
  const sync = await syncAfterSwitch();
  return NextResponse.json({ ok: true, switched: true, ...sync });
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
