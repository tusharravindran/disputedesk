// PayPal credentials: saved from the Settings page (database) take precedence over environment variables.
import "server-only";
import { sql } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/secrets";

export type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  webhookId: string | null;
  apiBase: string;
  source: "settings" | "environment" | "none";
};

const SANDBOX = "https://api-m.sandbox.paypal.com";
let cached: PayPalConfig | null = null;

export async function getPayPalConfig(): Promise<PayPalConfig> {
  if (cached) return cached;
  const rows = await sql<{ key: string; value: string }[]>`
    SELECT key, value FROM settings WHERE key IN ('paypal_client_id', 'paypal_client_secret', 'paypal_webhook_id')`;
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const apiBase = process.env.PAYPAL_API_BASE ?? SANDBOX;

  if (s.paypal_client_id && s.paypal_client_secret) {
    cached = {
      clientId: s.paypal_client_id,
      clientSecret: decrypt(s.paypal_client_secret),
      webhookId: s.paypal_webhook_id || null,
      apiBase,
      source: "settings",
    };
  } else {
    const clientId = process.env.PAYPAL_CLIENT_ID ?? "";
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET ?? "";
    cached = {
      clientId,
      clientSecret,
      webhookId: process.env.PAYPAL_WEBHOOK_ID || null,
      apiBase,
      source: clientId && clientSecret ? "environment" : "none",
    };
  }
  return cached;
}

export async function savePayPalSettings(clientId: string, clientSecret: string, webhookId: string | null) {
  await sql.begin(async (tx) => {
    for (const [key, value] of [
      ["paypal_client_id", clientId],
      ["paypal_client_secret", encrypt(clientSecret)],
      ["paypal_webhook_id", webhookId ?? ""],
    ])
      await tx`
        INSERT INTO settings (key, value) VALUES (${key}, ${value})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  });
  cached = null;
}

export async function clearPayPalSettings() {
  await sql`DELETE FROM settings WHERE key LIKE 'paypal_%'`;
  cached = null;
}
