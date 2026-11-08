import { getPayPalConfig } from "@/lib/config";
import { mask } from "@/lib/secrets";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

const SOURCE_LABEL = {
  settings: "Saved on this page",
  environment: "From environment variables",
  none: "Not connected",
} as const;

export default async function SettingsPage() {
  const cfg = await getPayPalConfig();
  const passwordRequired = !!process.env.ADMIN_PASSWORD || process.env.NODE_ENV === "production";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-zinc-500">Connect DisputeDesk to your own PayPal sandbox app.</p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Current PayPal connection</h2>
        <dl className="mt-2 grid grid-cols-[140px_1fr] gap-y-1 text-sm">
          <dt className="text-zinc-500">Status</dt>
          <dd>
            <span className={`rounded-full px-2 py-0.5 text-xs ${cfg.source === "none" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"}`}>
              {SOURCE_LABEL[cfg.source]}
            </span>
          </dd>
          <dt className="text-zinc-500">Client ID</dt>
          <dd className="font-mono text-xs">{cfg.clientId ? mask(cfg.clientId) : "—"}</dd>
          <dt className="text-zinc-500">Environment</dt>
          <dd>Sandbox</dd>
          <dt className="text-zinc-500">Webhook</dt>
          <dd>{cfg.webhookId ? "Signature verification on" : "Not configured"}</dd>
        </dl>
      </section>

      <SettingsForm source={cfg.source} passwordRequired={passwordRequired} />
    </div>
  );
}
