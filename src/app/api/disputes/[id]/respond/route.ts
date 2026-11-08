import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { acceptClaim, getDispute, makeOffer, PayPalError, provideEvidence, type EvidenceInput } from "@/lib/paypal";
import { Recommendation } from "@/lib/agent";
import { saveDispute } from "@/lib/disputes";

const Body = z.object({
  action: z.enum(["fight", "refund", "offer"]),
  message: z.string().trim().min(1).max(2000),
  offer_amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
});

const OUTCOME = { fight: "responded_fight", refund: "refunded", offer: "offered" } as const;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Merchant-approved response. This is the only code path that changes anything on PayPal. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("invalid request");
  const { action, message, offer_amount } = parsed.data;

  const [d] = await sql`SELECT id, amount, currency, stage, outcome, is_demo FROM disputes WHERE id = ${id}`;
  if (!d) return bad("dispute not found", 404);

  const [run] = await sql`SELECT id, draft FROM agent_runs WHERE dispute_id = ${id} AND status = 'done' ORDER BY id DESC LIMIT 1`;
  const rec = run ? Recommendation.safeParse(run.draft).data : undefined;

  if (action === "fight" && !rec?.evidence.length) return bad("no evidence to submit - run the investigation first");
  if (action === "offer") {
    if (!offer_amount) return bad("offer amount required");
    if (Number(offer_amount) <= 0 || Number(offer_amount) >= Number(d.amount))
      return bad("offer must be more than 0 and less than the disputed amount");
    if (d.stage && d.stage !== "INQUIRY") return bad("PayPal only allows offers during the INQUIRY stage");
  }

  // Claim the dispute atomically so a double click can never send two responses to PayPal.
  const [claimed] = await sql`UPDATE disputes SET outcome = 'sending' WHERE id = ${id} AND outcome IS NULL RETURNING id`;
  if (!claimed) return bad("a response was already sent for this dispute", 409);

  const currency = d.currency ?? "USD";
  const evidences: EvidenceInput[] =
    action === "fight"
      ? rec!.evidence.map((e) => ({
          evidence_type: e.type,
          notes: `${e.description}\n\n${message}`.slice(0, 2000),
          ...(e.carrier && e.tracking_number
            ? { evidence_info: { tracking_info: [{ carrier_name: e.carrier.toUpperCase(), tracking_number: e.tracking_number }] } }
            : {}),
        }))
      : [];
  const amount = action === "refund" ? Number(d.amount) : action === "offer" ? Number(offer_amount) : 0;
  const request =
    action === "fight" ? { evidences }
    : action === "refund" ? { note: message, accept_claim_type: "REFUND" }
    : { note: message, offer_amount: { currency_code: currency, value: offer_amount }, offer_type: "REFUND" };

  let status = "simulated";
  let response: unknown = { simulated: true, reason: "sample dispute - not sent to PayPal" };
  let error: string | null = null;

  if (!d.is_demo) {
    try {
      response =
        action === "fight" ? await provideEvidence(id, evidences)
        : action === "refund" ? await acceptClaim(id, message)
        : await makeOffer(id, message, { currency_code: currency, value: offer_amount! });
      status = "sent";
    } catch (e) {
      status = "failed";
      response = e instanceof PayPalError ? e.body : null;
      error = e instanceof PayPalError ? JSON.stringify(e.body) : String(e);
    }
  }

  await sql`
    INSERT INTO dispute_actions (dispute_id, run_id, action, amount, message, request, response, status, error)
    VALUES (${id}, ${run?.id ?? null}, ${action}, ${amount}, ${message}, ${sql.json(request)},
            ${sql.json((response ?? null) as never)}, ${status}, ${error})`;

  if (status === "failed") {
    await sql`UPDATE disputes SET outcome = NULL WHERE id = ${id}`;
    return NextResponse.json({ error: "PayPal rejected the response", details: response }, { status: 502 });
  }

  await sql`UPDATE disputes SET outcome = ${OUTCOME[action]}, updated_at = now() WHERE id = ${id}`;
  if (!d.is_demo) await saveDispute(await getDispute(id)).catch((e) => console.error("[respond] refresh failed", e));
  return NextResponse.json({ ok: true, status });
}
