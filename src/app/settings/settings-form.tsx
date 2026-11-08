"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Result = { ok?: boolean; switched?: boolean; synced?: number; webhook?: string; error?: string };

const REPO_URL = "https://github.com/tusharravindran/disputedesk";

export function SettingsForm({ source, passwordRequired }: { source: "settings" | "environment" | "none"; passwordRequired: boolean }) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [webhookId, setWebhookId] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function call(method: "POST" | "DELETE", body: object) {
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/settings", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: Result = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    setBusy(false);
    setResult(json);
    if (res.ok) {
      setClientSecret("");
      router.refresh();
    }
  }

  const input = "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm";

  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
      <div>
        <h2 className="font-medium">Connect a PayPal sandbox app</h2>
        <p className="text-sm text-zinc-500">
          Find these at{" "}
          <a href="https://developer.paypal.com/dashboard/applications/sandbox" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
            developer.paypal.com → Apps &amp; Credentials
          </a>{" "}
          (Sandbox, Merchant app with Disputes enabled). Keys are checked with PayPal before saving; the secret is stored encrypted and never shown again.
        </p>
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          call("POST", { clientId, clientSecret, webhookId: webhookId || undefined, adminPassword: adminPassword || undefined });
        }}
      >
        <label className="block text-sm">
          Client ID
          <input className={input} value={clientId} onChange={(e) => setClientId(e.target.value)} required autoComplete="off" />
        </label>
        <label className="block text-sm">
          Client secret
          <input className={input} type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} required autoComplete="new-password" />
        </label>
        <label className="block text-sm">
          Webhook ID <span className="text-zinc-400">(optional)</span>
          <input
            className={input}
            value={webhookId}
            onChange={(e) => setWebhookId(e.target.value)}
            placeholder="Leave empty: DisputeDesk creates the webhook in your PayPal app automatically"
            autoComplete="off"
          />
        </label>
        {passwordRequired && (
          <label className="block text-sm">
            Admin password
            <input className={input} type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required autoComplete="current-password" />
            <span className="mt-1 block text-xs text-zinc-500">
              Judges: the password is in the{" "}
              <a href={`${REPO_URL}#try-it-with-your-own-paypal-sandbox`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                README on GitHub
              </a>
              . Saving is only allowed with the correct password.
            </span>
          </label>
        )}

        <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>
            I understand that switching to a <b>different</b> PayPal app clears this DisputeDesk workspace (disputes, orders, AI runs and
            sent responses), re-adds the sample disputes, and syncs the new account&apos;s disputes. Nothing is changed on PayPal.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button disabled={busy || !confirmed} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
            {busy ? "Checking with PayPal…" : "Save & connect"}
          </button>
          {source === "settings" && (
            <button
              type="button"
              disabled={busy || !confirmed}
              onClick={() => call("DELETE", { adminPassword: adminPassword || undefined })}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50"
            >
              Use environment keys instead
            </button>
          )}
        </div>
      </form>

      {result?.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{result.error}</p>}
      {result?.ok && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {result.switched
            ? `Connected to the new PayPal app. Workspace reset, sample disputes re-added, ${result.synced ?? 0} real dispute(s) synced.`
            : result.webhook
              ? "Settings saved. Same PayPal app, so your data was kept."
              : "Switched back to the environment keys."}
          {result.webhook && <span className="mt-1 block">Webhook: {result.webhook}.</span>}
        </p>
      )}
    </section>
  );
}
