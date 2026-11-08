import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { captureOrder, PayPalError } from "@/lib/paypal";
import { sql } from "@/lib/db";

/** USPS-style 22-digit tracking number. */
const trackingNumber = () => "9400" + Array.from({ length: 18 }, () => randomInt(10)).join("");

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let order;
  try {
    order = await captureOrder(id);
  } catch (e) {
    const details = e instanceof PayPalError ? e.body : String(e);
    return NextResponse.json({ error: "capture failed", details }, { status: 502 });
  }
  const pu = order.purchase_units?.[0] ?? {};
  const capture = pu.payments?.captures?.[0];

  // The demo store has no warehouse: each order is marked as shipped and delivered immediately,
  // to the address on the order, so the agent has realistic tracking evidence to work with.
  const tracking = {
    carrier: "USPS",
    number: trackingNumber(),
    status: "DELIVERED",
    delivered_at: new Date().toISOString(),
    delivered_to: [pu.shipping?.address?.admin_area_2, pu.shipping?.address?.admin_area_1, pu.shipping?.address?.postal_code]
      .filter(Boolean)
      .join(", ") || null,
    simulated: true,
  };

  await sql`
    INSERT INTO orders (id, capture_id, status, amount, currency, items, buyer_email, shipping, tracking)
    VALUES (${id}, ${capture?.id ?? null}, ${order.status}, ${capture?.amount?.value ?? 0},
            ${capture?.amount?.currency_code ?? "USD"}, ${sql.json(pu.items ?? [])},
            ${order.payer?.email_address ?? null}, ${sql.json(pu.shipping ?? null)}, ${sql.json(tracking)})
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, capture_id = EXCLUDED.capture_id`;

  return NextResponse.json({ status: order.status, captureId: capture?.id });
}
