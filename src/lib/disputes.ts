import "server-only";
import { sql } from "@/lib/db";
import { getCapture, getDispute, getOrder, listDisputes, listTrackers, type PP } from "@/lib/paypal";

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
  if (tx.seller_transaction_id)
    await importOrder(tx.seller_transaction_id).catch((e) => console.error("[disputes] order import failed", e));
}

/**
 * Makes sure the order behind a disputed capture exists locally, rebuilding it from PayPal
 * (capture -> order, plus tracking registered with PayPal) when this database has never seen it.
 */
export async function importOrder(captureId: string) {
  const [existing] = await sql`SELECT id FROM orders WHERE capture_id = ${captureId}`;
  if (existing) return;

  const capture = await getCapture(captureId);
  const orderId = capture.links?.find((l: { rel: string }) => l.rel === "up")?.href.split("/").pop();
  if (!orderId) return;
  const order = await getOrder(orderId);
  const pu = order.purchase_units?.[0] ?? {};

  const [t] = await listTrackers(captureId);
  const tracking = t
    ? { carrier: t.carrier, number: t.tracking_number, status: t.status, shipped_at: t.shipment_date ?? null, source: "PayPal Tracking API" }
    : null;

  await sql`
    INSERT INTO orders (id, capture_id, status, amount, currency, items, buyer_email, shipping, tracking)
    VALUES (${orderId}, ${captureId}, ${order.status}, ${capture.amount?.value ?? 0}, ${capture.amount?.currency_code ?? "USD"},
            ${sql.json(pu.items ?? [])}, ${order.payer?.email_address ?? null}, ${sql.json(pu.shipping ?? null)},
            ${tracking ? sql.json(tracking) : null})
    ON CONFLICT (id) DO NOTHING`;
}

/** Pull every dispute from PayPal (list returns summaries, so fetch each in full). */
export async function syncDisputes() {
  const list = await listDisputes();
  const ids = (list.items ?? []).map((i) => i.dispute_id as string);
  for (const id of ids) await saveDispute(await getDispute(id));
  return ids.length;
}
