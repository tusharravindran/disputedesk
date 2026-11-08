import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { REASONS } from "@/lib/reasons";
import { Investigator, type Run } from "./investigator";

export const dynamic = "force-dynamic";

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d] = await sql`
    SELECT d.*, o.items, o.buyer_email, o.tracking
    FROM disputes d LEFT JOIN orders o ON o.capture_id = d.capture_id
    WHERE d.id = ${id}`;
  if (!d) notFound();
  const [run] = await sql<Run[]>`
    SELECT id, status, verdict, confidence, summary, draft, trace, model
    FROM agent_runs WHERE dispute_id = ${id} ORDER BY id DESC LIMIT 1`;

  const messages: Array<{ posted_by: string; time_posted: string; content: string }> = d.raw.messages ?? [];
  const items: Array<{ name: string; quantity: string }> = d.items ?? [];
  const daysLeft = d.respond_by ? Math.ceil((new Date(d.respond_by).getTime() - Date.now()) / 86400_000) : null;

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">← All disputes</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs text-zinc-500">{d.id}{d.is_demo && " · sample"}</div>
          <h1 className="text-2xl font-semibold">{REASONS[d.reason] ?? d.reason}</h1>
          <p className="text-sm text-zinc-500">
            ${Number(d.amount).toFixed(2)} · {d.buyer_email ?? "unknown buyer"} · {items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}
          </p>
        </div>
        {daysLeft !== null && (
          <div className={`rounded-lg px-3 py-2 text-sm ${daysLeft <= 3 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
            Respond within <b>{daysLeft} days</b>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Investigator disputeId={d.id} initialRun={run ?? null} />

        <aside className="space-y-4">
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-medium">Buyer messages</h2>
            {messages.length === 0 && <p className="mt-2 text-sm text-zinc-500">None.</p>}
            {messages.map((m, i) => (
              <div key={i} className="mt-2 rounded-lg bg-zinc-50 p-2 text-sm">
                <div className="text-xs text-zinc-500">{m.posted_by} · {new Date(m.time_posted).toLocaleDateString()}</div>
                {m.content}
              </div>
            ))}
          </section>
          <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
            <h2 className="font-medium">Shipment</h2>
            {d.tracking ? (
              <dl className="mt-2 grid grid-cols-[90px_1fr] gap-y-1">
                <dt className="text-zinc-500">Carrier</dt><dd>{d.tracking.carrier}</dd>
                <dt className="text-zinc-500">Tracking</dt><dd className="font-mono text-xs">{d.tracking.number}</dd>
                <dt className="text-zinc-500">Status</dt><dd>{d.tracking.status}</dd>
                <dt className="text-zinc-500">Delivered</dt><dd>{d.tracking.delivered_at ? new Date(d.tracking.delivered_at).toLocaleDateString() : "—"}</dd>
              </dl>
            ) : (
              <p className="mt-2 text-red-600">No tracking on file.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
