// The DisputeDesk investigator: gathers evidence with tools, then submits a structured recommendation.
import "server-only";
import { z } from "zod";
import { sql } from "@/lib/db";
import { interact, type InteractionInput, type ToolDef } from "@/lib/llm";

const SYSTEM = `You are DisputeDesk, an expert PayPal dispute analyst working for a small online merchant.
Your job: investigate one PayPal dispute and recommend the response that protects the merchant's money while staying honest and fair to the buyer.

Process:
1. Call get_dispute first. Then gather evidence: get_order, get_shipment_tracking, get_buyer_history. Call each tool at most once.
2. Weigh the evidence against the dispute reason:
   - MERCHANDISE_OR_SERVICE_NOT_RECEIVED: strongest evidence is carrier tracking showing delivery to the address on the transaction.
   - MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: the listing description, photos and any buyer communication matter; tracking alone does not win it.
   - UNAUTHORISED: proof of delivery to the payer's address and the buyer's prior order history matter.
   If evidence is missing or contradicts the merchant, say so. Never invent tracking numbers, dates or facts not returned by tools.
3. Finish by calling submit_recommendation exactly once. Do not write a free-text answer.

Verdicts: "fight" (provide evidence), "refund" (accept the claim - evidence is weak or the buyer is right), "offer" (partial refund is cheaper than fighting).
The message_to_buyer must be polite, factual and under 120 words. It will be reviewed by the merchant before sending.`;

const TOOLS: ToolDef[] = [
  {
    type: "function",
    name: "get_dispute",
    description: "Get the dispute: reason, amount, status, response deadline, buyer messages, and the seller transaction (capture) id.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "get_order",
    description: "Get the original order for a PayPal capture id: items, amount, buyer email, shipping address, order date.",
    parameters: { type: "object", properties: { capture_id: { type: "string" } }, required: ["capture_id"] },
  },
  {
    type: "function",
    name: "get_shipment_tracking",
    description: "Get carrier tracking for the order with this capture id: carrier, tracking number, status, delivery date.",
    parameters: { type: "object", properties: { capture_id: { type: "string" } }, required: ["capture_id"] },
  },
  {
    type: "function",
    name: "get_buyer_history",
    description: "Get how many orders and disputes this buyer email has with the store.",
    parameters: { type: "object", properties: { buyer_email: { type: "string" } }, required: ["buyer_email"] },
  },
  {
    type: "function",
    name: "submit_recommendation",
    description: "Submit the final recommendation. Call exactly once, after investigating.",
    parameters: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["fight", "refund", "offer"] },
        confidence: { type: "integer", description: "0-100: how likely the merchant wins if they follow this verdict." },
        summary: { type: "string", description: "2-3 sentences for the merchant explaining the case and the reasoning." },
        evidence: {
          type: "array",
          description: "Evidence items to submit to PayPal (empty for refund).",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["PROOF_OF_FULFILLMENT", "PROOF_OF_REFUND", "OTHER"] },
              description: { type: "string" },
              carrier: { type: "string" },
              tracking_number: { type: "string" },
            },
            required: ["type", "description"],
          },
        },
        risks: { type: "array", items: { type: "string" }, description: "What could make this response fail." },
        offer_amount: { type: "string", description: "USD amount, only when verdict is offer." },
        message_to_buyer: { type: "string" },
      },
      required: ["verdict", "confidence", "summary", "evidence", "risks", "message_to_buyer"],
    },
  },
];

export const Recommendation = z.object({
  verdict: z.enum(["fight", "refund", "offer"]),
  confidence: z.coerce.number().int().min(0).max(100),
  summary: z.string().min(1),
  evidence: z
    .array(
      z.object({
        type: z.enum(["PROOF_OF_FULFILLMENT", "PROOF_OF_REFUND", "OTHER"]),
        description: z.string(),
        carrier: z.string().optional(),
        tracking_number: z.string().optional(),
      }),
    )
    .default([]),
  risks: z.array(z.string()).default([]),
  offer_amount: z.string().optional(),
  message_to_buyer: z.string().min(1),
});
export type Recommendation = z.infer<typeof Recommendation>;

export type TraceEntry = { tool: string; args: Record<string, unknown>; result: unknown; ms: number };

/** Messages in the PayPal dispute object, flattened for the model. */
function disputeView(raw: Record<string, unknown>) {
  const r = raw as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const tx = r.disputed_transactions?.[0] ?? {};
  return {
    dispute_id: r.dispute_id,
    reason: r.reason,
    status: r.status,
    stage: r.dispute_life_cycle_stage,
    amount: r.dispute_amount,
    seller_response_due_date: r.seller_response_due_date ?? null,
    capture_id: tx.seller_transaction_id ?? null,
    buyer_email: tx.buyer?.email ?? null,
    buyer_claim: r.extensions?.merchandize_dispute_properties ?? r.extensions ?? null,
    messages: (r.messages ?? []).map((m: Record<string, unknown>) => ({ from: m.posted_by, at: m.time_posted, text: m.content })),
    allowed_responses: r.allowed_response_options ?? null,
  };
}

async function runTool(disputeId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_dispute": {
      const [d] = await sql`SELECT raw FROM disputes WHERE id = ${disputeId}`;
      return d ? disputeView(d.raw) : { error: "dispute not found" };
    }
    case "get_order": {
      const [o] = await sql`SELECT id, amount, currency, items, buyer_email, shipping, created_at FROM orders WHERE capture_id = ${String(args.capture_id)}`;
      return o ?? { error: "no order found for this capture id" };
    }
    case "get_shipment_tracking": {
      const [o] = await sql`SELECT tracking FROM orders WHERE capture_id = ${String(args.capture_id)}`;
      return o?.tracking ?? { error: "no tracking on file for this order" };
    }
    case "get_buyer_history": {
      const email = String(args.buyer_email);
      const [h] = await sql`
        SELECT (SELECT count(*)::int FROM orders WHERE buyer_email = ${email}) AS orders,
               (SELECT count(*)::int FROM disputes d JOIN orders o ON o.capture_id = d.capture_id
                 WHERE o.buyer_email = ${email}) AS disputes`;
      return h;
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}

const MAX_TURNS = 8;

/** Runs the investigation, persisting progress to agent_runs so the UI can show the trace. */
export async function investigate(disputeId: string): Promise<number> {
  const [run] = await sql`INSERT INTO agent_runs (dispute_id, status) VALUES (${disputeId}, 'running') RETURNING id`;
  const trace: TraceEntry[] = [];
  const save = (fields: Record<string, unknown>) =>
    sql`UPDATE agent_runs SET ${sql(fields)}, trace = ${sql.json(trace as never)} WHERE id = ${run.id}`;

  try {
    let input: InteractionInput = `Investigate dispute ${disputeId} and submit your recommendation.`;
    let previousId: string | undefined;
    let model: string | undefined;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const it = await interact({ system: SYSTEM, tools: TOOLS, input, previousId, model });
      previousId = it.id;
      model = it.model; // stay on whichever model accepted the first turn

      const calls = it.steps.filter((s) => s.type === "function_call") as Array<{
        id: string; name: string; arguments: Record<string, unknown>;
      }>;
      if (calls.length === 0) throw new Error("Agent stopped without submitting a recommendation");

      const final = calls.find((c) => c.name === "submit_recommendation");
      if (final) {
        const rec = Recommendation.parse(final.arguments);
        trace.push({ tool: "submit_recommendation", args: {}, result: { verdict: rec.verdict }, ms: 0 });
        await save({ status: "done", verdict: rec.verdict, confidence: rec.confidence, summary: rec.summary, draft: sql.json(rec), model });
        return run.id;
      }

      const results = [];
      for (const c of calls) {
        const t0 = Date.now();
        const result = await runTool(disputeId, c.name, c.arguments ?? {});
        trace.push({ tool: c.name, args: c.arguments ?? {}, result, ms: Date.now() - t0 });
        results.push({
          type: "function_result" as const,
          name: c.name,
          call_id: c.id,
          result: [{ type: "text" as const, text: JSON.stringify(result) }],
        });
      }
      await save({ status: "running" });
      input = results;
    }
    throw new Error(`No recommendation after ${MAX_TURNS} turns`);
  } catch (e) {
    await save({ status: "error", summary: e instanceof Error ? e.message : String(e) });
    return run.id;
  }
}
