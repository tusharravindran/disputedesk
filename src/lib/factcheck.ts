// Kept free of server/DB imports so it can be unit-tested directly.
import type { Recommendation } from "./agent";

/**
 * Deterministic fact-check of the model's recommendation against the data the agent actually saw.
 * Returns human-readable problems; an empty list means the recommendation is grounded.
 */
export function groundingProblems(rec: Recommendation, disputeAmount: number, toolResults: unknown[]): string[] {
  const corpus = JSON.stringify(toolResults).toLowerCase();
  const tracking = toolResults.find(
    (r): r is { carrier?: string; number?: string; status?: string } => !!r && typeof r === "object" && "number" in r,
  );
  const problems: string[] = [];

  if (rec.verdict === "fight" && rec.evidence.length === 0) problems.push('verdict "fight" needs at least one evidence item');
  if (rec.verdict !== "fight" && rec.evidence.length > 0) problems.push(`evidence must be [] when verdict is "${rec.verdict}"`);

  for (const e of rec.evidence) {
    if (e.tracking_number && e.tracking_number !== tracking?.number)
      problems.push(`tracking number "${e.tracking_number}" does not match get_shipment_tracking (${tracking?.number ?? "no tracking on file"})`);
    if (e.carrier && e.carrier.toLowerCase() !== tracking?.carrier?.toLowerCase())
      problems.push(`carrier "${e.carrier}" does not match get_shipment_tracking (${tracking?.carrier ?? "no tracking on file"})`);
    if (e.type === "PROOF_OF_FULFILLMENT" && !tracking) problems.push("PROOF_OF_FULFILLMENT cited but no tracking is on file");
  }

  if (rec.verdict === "offer") {
    const offer = Number(rec.offer_amount);
    if (!rec.offer_amount || !(offer > 0 && offer < disputeAmount))
      problems.push(`offer_amount must be between 0 and ${disputeAmount.toFixed(2)} (got ${rec.offer_amount ?? "none"})`);
  }

  // Long identifiers (tracking/order numbers) anywhere in the prose must come from the data.
  const prose = [rec.summary, rec.message_to_buyer, ...rec.evidence.map((e) => e.description)].join(" ");
  for (const id of new Set(prose.match(/\b(?=[A-Z0-9-]*\d)[A-Z0-9-]{10,}\b/gi) ?? []))
    if (!corpus.includes(id.toLowerCase())) problems.push(`identifier "${id}" does not appear in any tool result`);

  // Dollar amounts must be the disputed amount, the offer, or a value present in the data.
  const allowed = new Set([disputeAmount.toFixed(2), rec.offer_amount && Number(rec.offer_amount).toFixed(2)]);
  for (const m of prose.matchAll(/\$\s?(\d+(?:\.\d{1,2})?)/g)) {
    const v = Number(m[1]).toFixed(2);
    if (!allowed.has(v) && !corpus.includes(v) && !corpus.includes(`"${Number(m[1])}"`))
      problems.push(`amount $${v} does not appear in the dispute or order`);
  }
  return problems;
}
