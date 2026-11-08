import { NextResponse } from "next/server";
import { captureOrder } from "@/lib/paypal";
import { sql } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await captureOrder(id);
  const pu = order.purchase_units?.[0] ?? {};
  const capture = pu.payments?.captures?.[0];
  const items = pu.items ?? [];

  // Simulated fulfilment: every order ships with tracking, which the agent later uses as evidence.
  const tracking = {
    carrier: "USPS",
    number: `9400${Math.floor(1e17 + Math.random() * 9e17)}`.slice(0, 22),
    status: "DELIVERED",
    delivered_at: new Date(Date.now() + 3 * 86400_000).toISOString(),
  };

  await sql`
    INSERT INTO orders (id, capture_id, status, amount, currency, items, buyer_email, shipping, tracking)
    VALUES (${id}, ${capture?.id ?? null}, ${order.status}, ${capture?.amount?.value ?? 0},
            ${capture?.amount?.currency_code ?? "USD"}, ${sql.json(items)},
            ${order.payer?.email_address ?? null}, ${sql.json(pu.shipping ?? null)}, ${sql.json(tracking)})
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, capture_id = EXCLUDED.capture_id`;

  return NextResponse.json({ status: order.status, captureId: capture?.id });
}
