import { sql } from "@/lib/db";
import Link from "next/link";
import { REASONS } from "@/lib/reasons";
import { SyncButton } from "./sync-button";

export const dynamic = "force-dynamic";

const OUTCOME_LABEL: Record<string, string> = { responded_fight: "Evidence sent", refunded: "Refunded", offered: "Offer sent" };

type Row = {
  id: string; reason: string | null; status: string | null; stage: string | null;
  amount: string | null; currency: string | null; respond_by: Date | null; created_at: Date;
  is_demo: boolean; outcome: string | null; verdict: string | null; confidence: number | null;
};

type Stats = { open: number; at_risk: string | null; defended: string | null; handled: number; avg_secs: string | null };

export default async function DisputesPage() {
  const [disputes, [stats]] = await Promise.all([
    sql<Row[]>`
      SELECT d.id, d.reason, d.status, d.stage, d.amount, d.currency, d.respond_by, d.created_at, d.is_demo, d.outcome, r.verdict, r.confidence
      FROM disputes d
      LEFT JOIN LATERAL (SELECT verdict, confidence FROM agent_runs WHERE dispute_id = d.id AND status = 'done' ORDER BY id DESC LIMIT 1) r ON true
      ORDER BY d.is_demo, d.created_at DESC`,
    sql<Stats[]>`
      SELECT (SELECT count(*)::int FROM disputes WHERE outcome IS NULL AND status <> 'RESOLVED') AS open,
             (SELECT sum(amount) FROM disputes WHERE outcome IS NULL AND status <> 'RESOLVED') AS at_risk,
             (SELECT sum(amount) FROM disputes WHERE outcome = 'responded_fight') AS defended,
             (SELECT count(*)::int FROM disputes WHERE outcome IS NOT NULL) AS handled,
             (SELECT avg(extract(epoch FROM finished_at - created_at)) FROM agent_runs
               WHERE status = 'done' AND finished_at IS NOT NULL) AS avg_secs`,
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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Needs response", String(stats.open), "open disputes"],
          ["Money at risk", `$${Number(stats.at_risk ?? 0).toFixed(2)}`, "in open disputes"],
          ["Defended", `$${Number(stats.defended ?? 0).toFixed(2)}`, `${stats.handled} disputes handled`],
          ["AI investigation", stats.avg_secs ? `${Math.round(Number(stats.avg_secs))}s` : "—", "average time per dispute"],
        ].map(([k, v, sub]) => (
          <div key={k} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{k}</div>
            <div className="mt-1 text-2xl font-semibold">{v}</div>
            <div className="text-xs text-zinc-400">{sub}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2">Dispute</th><th className="px-4 py-2">Reason</th>
              <th className="px-4 py-2">Amount</th><th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Respond by</th><th className="px-4 py-2">AI verdict</th>
            </tr>
          </thead>
          <tbody>
            {disputes.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                No disputes yet. Buy something in the demo store, then open a dispute as the sandbox buyer.
              </td></tr>
            )}
            {disputes.map((d) => (
              <tr key={d.id} className="border-t border-zinc-100">
                <td className="px-4 py-2 font-mono text-xs"><Link href={`/disputes/${d.id}`} className="text-indigo-600 hover:underline">{d.id}</Link>{d.is_demo && <span className="ml-1 rounded bg-zinc-100 px-1 text-[10px] text-zinc-500">sample</span>}</td>
                <td className="px-4 py-2">{REASONS[d.reason ?? ""] ?? d.reason}</td>
                <td className="px-4 py-2">${Number(d.amount ?? 0).toFixed(2)}</td>
                <td className="px-4 py-2">{d.outcome
                  ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">{OUTCOME_LABEL[d.outcome] ?? d.outcome}</span>
                  : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Needs response</span>}</td>
                <td className="px-4 py-2 text-zinc-500">{d.respond_by ? new Date(d.respond_by).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-2">{d.verdict ? <span className="capitalize">{d.verdict} <span className="text-zinc-400">· {d.confidence}%</span></span> : <span className="text-zinc-400">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
