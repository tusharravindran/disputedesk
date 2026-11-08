import "server-only";
import { sql } from "@/lib/db";
import { getDispute, listDisputes, type PP } from "@/lib/paypal";

export async function saveDispute(d: PP) {
  const tx = d.disputed_transactions?.[0] ?? {};
  await sql`
    INSERT INTO disputes (id, reason, status, stage, amount, currency, capture_id, respond_by, raw, updated_at)
    VALUES (${d.dispute_id}, ${d.reason ?? null}, ${d.status ?? null}, ${d.dispute_life_cycle_stage ?? null},
            ${d.dispute_amount?.value ?? null}, ${d.dispute_amount?.currency_code ?? null},
            ${tx.seller_transaction_id ?? null}, ${d.seller_response_due_date ?? null}, ${sql.json(d)}, now())
    ON CONFLICT (id) DO UPDATE SET
      reason = EXCLUDED.reason, status = EXCLUDED.status, stage = EXCLUDED.stage,
      amount = EXCLUDED.amount, respond_by = EXCLUDED.respond_by, raw = EXCLUDED.raw, updated_at = now()`;
}

/** Pull every dispute from PayPal (list returns summaries, so fetch each in full). */
export async function syncDisputes() {
  const list = await listDisputes();
  const ids = (list.items ?? []).map((i) => i.dispute_id as string);
  for (const id of ids) await saveDispute(await getDispute(id));
  return ids.length;
}
