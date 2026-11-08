import { sql } from "@/lib/db";
import { SyncButton } from "./sync-button";

export const dynamic = "force-dynamic";

type Row = {
  id: string; reason: string | null; status: string | null; stage: string | null;
  amount: string | null; currency: string | null; respond_by: Date | null; created_at: Date;
};

const REASONS: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Item not received",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Not as described",
  UNAUTHORISED: "Unauthorized",
  CREDIT_NOT_PROCESSED: "Credit not processed",
  DUPLICATE_TRANSACTION: "Duplicate",
  INCORRECT_AMOUNT: "Incorrect amount",
  PAYMENT_BY_OTHER_MEANS: "Paid by other means",
  CANCELED_RECURRING_BILLING: "Canceled subscription",
  OTHER: "Other",
};

export default async function DisputesPage() {
  const [disputes, [stats]] = await Promise.all([
    sql<Row[]>`SELECT id, reason, status, stage, amount, currency, respond_by, created_at FROM disputes ORDER BY created_at DESC`,
    sql<{ open: number; at_risk: string | null; orders: number }[]>`
      SELECT (SELECT count(*)::int FROM disputes WHERE status NOT IN ('RESOLVED')) AS open,
             (SELECT sum(amount) FROM disputes WHERE status NOT IN ('RESOLVED')) AS at_risk,
             (SELECT count(*)::int FROM orders) AS orders`,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Disputes</h1>
          <p className="text-sm text-zinc-500">Live from your PayPal account via webhooks.</p>
        </div>
        <SyncButton />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          ["Open disputes", String(stats.open)],
          ["Money at risk", `$${Number(stats.at_risk ?? 0).toFixed(2)}`],
          ["Orders processed", String(stats.orders)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{k}</div>
            <div className="mt-1 text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2">Dispute</th><th className="px-4 py-2">Reason</th>
              <th className="px-4 py-2">Amount</th><th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Respond by</th>
            </tr>
          </thead>
          <tbody>
            {disputes.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                No disputes yet. Buy something in the demo store, then open a dispute as the sandbox buyer.
              </td></tr>
            )}
            {disputes.map((d) => (
              <tr key={d.id} className="border-t border-zinc-100">
                <td className="px-4 py-2 font-mono text-xs">{d.id}</td>
                <td className="px-4 py-2">{REASONS[d.reason ?? ""] ?? d.reason}</td>
                <td className="px-4 py-2">${Number(d.amount ?? 0).toFixed(2)}</td>
                <td className="px-4 py-2"><span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{d.status}</span></td>
                <td className="px-4 py-2 text-zinc-500">{d.respond_by ? new Date(d.respond_by).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
