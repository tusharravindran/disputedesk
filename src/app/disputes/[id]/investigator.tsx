"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Evidence = { type: string; description: string; carrier?: string; tracking_number?: string };
type Verdict = "fight" | "refund" | "offer";
type Draft = {
  verdict: Verdict; confidence: number; summary: string;
  evidence: Evidence[]; risks: string[]; offer_amount?: string; message_to_buyer: string;
};
type TraceEntry = { tool: string; args: Record<string, unknown>; result: unknown; ms: number };
export type Run = {
  id: number; status: string; verdict: string | null; confidence: number | null; summary: string | null;
  draft: Draft | null; trace: TraceEntry[]; model: string | null;
};
export type SentAction = { action: Verdict; amount: string | null; status: string; created_at: string; message: string };

const TOOL_LABELS: Record<string, string> = {
  get_dispute: "Read the dispute and buyer messages",
  get_order: "Pulled the original PayPal order",
  get_shipment_tracking: "Checked carrier tracking",
  get_buyer_history: "Looked up buyer history",
  submit_recommendation: "Wrote recommendation",
};

const VERDICT_STYLE: Record<Verdict, { label: string; cls: string; button: string }> = {
  fight: { label: "Fight with evidence", cls: "bg-emerald-600", button: "Submit evidence to PayPal" },
  refund: { label: "Accept & refund", cls: "bg-zinc-700", button: "Accept claim & refund" },
  offer: { label: "Offer partial refund", cls: "bg-indigo-600", button: "Send offer via PayPal" },
};

/** Minimal SSE reader for a POST response body. */
async function* readSSE(res: Response) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = chunk.match(/^event: (.*)$/m)?.[1];
      const data = chunk.match(/^data: (.*)$/m)?.[1];
      if (event && data) yield { event, data: JSON.parse(data) };
    }
  }
}

export function Investigator({
  disputeId, amount, isDemo, initialRun, sent,
}: { disputeId: string; amount: number; isDemo: boolean; initialRun: Run | null; sent: SentAction | null }) {
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(initialRun);
  const [live, setLive] = useState<TraceEntry[] | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState(initialRun?.draft?.message_to_buyer ?? "");
  const [action, setAction] = useState<Verdict>((initialRun?.draft?.verdict as Verdict) ?? "fight");
  const [offer, setOffer] = useState(initialRun?.draft?.offer_amount ?? (amount / 2).toFixed(2));
  const [open, setOpen] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  async function investigate() {
    setLive([]);
    setError(null);
    setThinking(true);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/investigate`, { method: "POST" });
      for await (const { event, data } of readSSE(res)) {
        if (event === "reset") setLive([]); // restarted on a fallback model
        if (event === "thinking") setThinking(true);
        if (event === "step") {
          setThinking(false);
          setLive((l) => [...(l ?? []), data.entry]);
        }
        if (event === "error") setError(data.message);
        if (event === "run") {
          setRun(data);
          if (data.draft) {
            setMessage(data.draft.message_to_buyer);
            setAction(data.draft.verdict);
            if (data.draft.offer_amount) setOffer(data.draft.offer_amount);
          }
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLive(null);
      setThinking(false);
      router.refresh();
    }
  }

  async function respond() {
    setSending(true);
    setError(null);
    const res = await fetch(`/api/disputes/${disputeId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, message, ...(action === "offer" ? { offer_amount: offer } : {}) }),
    });
    const json = await res.json();
    setSending(false);
    if (!res.ok) setError(`${json.error}${json.details ? `: ${JSON.stringify(json.details)}` : ""}`);
    router.refresh();
  }

  const busy = live !== null;
  const trace = live ?? run?.trace ?? [];
  const draft = !busy && run?.status === "done" ? run.draft : null;
  const v = draft ? VERDICT_STYLE[draft.verdict] : null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-medium">AI investigation</h2>
            <p className="text-xs text-zinc-500">
              The agent gathers evidence from PayPal and your store, then recommends a response.
              {run?.model && !busy && <> · {run.model}</>}
            </p>
          </div>
          {!sent && (
            <button
              onClick={investigate}
              disabled={busy}
              className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy ? "Investigating…" : run ? "Re-run" : "Investigate"}
            </button>
          )}
        </div>

        {(trace.length > 0 || busy) && (
          <ol className="mt-4 space-y-1">
            {trace.map((t, i) => (
              <li key={i} className="animate-[fadein_.3s_ease-out] rounded-lg border border-zinc-100">
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
            {busy && (
              <li className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-500">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                {thinking ? "Thinking…" : "Working…"}
              </li>
            )}
          </ol>
        )}
        {run?.status === "error" && !busy && (
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

          {sent ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <b>{VERDICT_STYLE[sent.action].label}</b>{" "}
              {sent.status === "simulated" ? "recorded (sample dispute, not sent to PayPal)" : "sent to PayPal"} on{" "}
              <time suppressHydrationWarning>
                {new Date(sent.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              </time>.
              <p className="mt-1 whitespace-pre-wrap text-emerald-800">“{sent.message}”</p>
            </div>
          ) : (
            <>
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Your response</h3>
                <div className="mt-1 inline-flex rounded-lg border border-zinc-200 p-0.5 text-sm">
                  {(["fight", "refund", "offer"] as Verdict[]).map((a) => (
                    <button
                      key={a}
                      onClick={() => setAction(a)}
                      disabled={a === "fight" && draft.evidence.length === 0}
                      className={`rounded-md px-3 py-1 capitalize disabled:opacity-40 ${action === a ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
                    >
                      {a}{a === draft.verdict && " ★"}
                    </button>
                  ))}
                </div>
                {action === "offer" && (
                  <label className="ml-3 text-sm">
                    $<input value={offer} onChange={(e) => setOffer(e.target.value)} className="w-24 rounded border border-zinc-300 px-2 py-1" />
                    <span className="text-zinc-400"> of ${amount.toFixed(2)}</span>
                  </label>
                )}
              </div>

              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Message (edit before sending)</h3>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5}
                  className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm" />
              </div>

              <div className="flex items-center gap-3">
                <button onClick={respond} disabled={sending || !message.trim()}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
                  {sending ? "Sending…" : VERDICT_STYLE[action].button}
                </button>
                <span className="text-xs text-zinc-400">
                  {isDemo ? "Sample dispute: recorded locally, not sent to PayPal." : "Nothing is sent without your approval."}
                </span>
              </div>
            </>
          )}
        </section>
      )}

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
