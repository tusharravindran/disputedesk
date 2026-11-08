"use client";

import { useState } from "react";

type Evidence = { type: string; description: string; carrier?: string; tracking_number?: string };
type Draft = {
  verdict: "fight" | "refund" | "offer"; confidence: number; summary: string;
  evidence: Evidence[]; risks: string[]; offer_amount?: string; message_to_buyer: string;
};
export type Run = {
  id: number; status: string; verdict: string | null; confidence: number | null; summary: string | null;
  draft: Draft | null; trace: Array<{ tool: string; args: Record<string, unknown>; result: unknown; ms: number }>; model: string | null;
};

const TOOL_LABELS: Record<string, string> = {
  get_dispute: "Read the dispute and buyer messages",
  get_order: "Pulled the original PayPal order",
  get_shipment_tracking: "Checked carrier tracking",
  get_buyer_history: "Looked up buyer history",
  submit_recommendation: "Wrote recommendation",
};

const VERDICT_STYLE = {
  fight: { label: "Fight with evidence", cls: "bg-emerald-600" },
  refund: { label: "Accept & refund", cls: "bg-zinc-700" },
  offer: { label: "Offer partial refund", cls: "bg-indigo-600" },
};

export function Investigator({ disputeId, initialRun }: { disputeId: string; initialRun: Run | null }) {
  const [run, setRun] = useState<Run | null>(initialRun);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialRun?.draft?.message_to_buyer ?? "");
  const [open, setOpen] = useState<number | null>(null);

  async function investigate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/investigate`, { method: "POST" });
      const r: Run = await res.json();
      setRun(r);
      setMessage(r.draft?.message_to_buyer ?? "");
    } finally {
      setBusy(false);
    }
  }

  const draft = run?.status === "done" ? run.draft : null;
  const v = draft ? VERDICT_STYLE[draft.verdict] : null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">AI investigation</h2>
            <p className="text-xs text-zinc-500">
              The agent gathers evidence from PayPal and your store, then recommends a response.
              {run?.model && <> · {run.model}</>}
            </p>
          </div>
          <button
            onClick={investigate}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy ? "Investigating…" : run ? "Re-run" : "Investigate"}
          </button>
        </div>

        {busy && (
          <div className="mt-4 space-y-2">
            {Object.values(TOOL_LABELS).map((l, i) => (
              <div key={l} className="h-6 animate-pulse rounded bg-zinc-100" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        )}

        {!busy && run && (
          <ol className="mt-4 space-y-1">
            {run.trace.map((t, i) => (
              <li key={i} className="rounded-lg border border-zinc-100">
                <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm" onClick={() => setOpen(open === i ? null : i)}>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-700">✓</span>
                  <span>{TOOL_LABELS[t.tool] ?? t.tool}</span>
                  <span className="ml-auto font-mono text-xs text-zinc-400">{t.tool}</span>
                </button>
                {open === i && (
                  <pre className="max-h-64 overflow-auto border-t border-zinc-100 bg-zinc-50 p-3 text-xs">
                    {JSON.stringify(t.result, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}
        {!busy && run?.status === "error" && (
          <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">Investigation failed: {run.summary}</p>
        )}
      </section>

      {draft && v && (
        <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-sm font-medium text-white ${v.cls}`}>{v.label}</span>
            <span className="text-sm text-zinc-500">{draft.confidence}% confidence</span>
            <div className="ml-auto h-2 w-32 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full bg-emerald-500" style={{ width: `${draft.confidence}%` }} />
            </div>
          </div>
          <p className="text-sm">{draft.summary}</p>

          {draft.evidence.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Evidence to submit</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {draft.evidence.map((e, i) => (
                  <li key={i} className="rounded-lg bg-emerald-50 p-2">
                    <span className="font-mono text-xs text-emerald-700">{e.type}</span> — {e.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {draft.risks.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Risks</h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-zinc-600">
                {draft.risks.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Message to buyer (edit before sending)</h3>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button disabled className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white opacity-50" title="Coming next: submits to PayPal">
              Approve &amp; send to PayPal
            </button>
            <span className="self-center text-xs text-zinc-400">Nothing is sent without your approval.</span>
          </div>
        </section>
      )}
    </div>
  );
}
