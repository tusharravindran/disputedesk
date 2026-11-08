import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getDispute, verifyWebhook } from "@/lib/paypal";
import { saveDispute } from "@/lib/disputes";

export async function POST(req: Request) {
  const raw = await req.text();
  const event = JSON.parse(raw);

  let verified = false;
  try {
    verified = await verifyWebhook(req.headers, raw);
  } catch (e) {
    console.error("[webhook] verification error", e);
  }
  // In production, unverified events are stored for inspection but never acted on.
  const allowUnverified = process.env.ALLOW_UNVERIFIED_WEBHOOKS === "true";

  const inserted = await sql`
    INSERT INTO webhook_events (id, event_type, verified, payload)
    VALUES (${event.id}, ${event.event_type}, ${verified}, ${sql.json(event)})
    ON CONFLICT (id) DO NOTHING RETURNING id`;
  if (inserted.length === 0) return NextResponse.json({ ok: true, duplicate: true });
  if (!verified && !allowUnverified) return NextResponse.json({ ok: true, ignored: "unverified" });

  if (String(event.event_type).startsWith("CUSTOMER.DISPUTE.")) {
    const id = event.resource?.dispute_id;
    if (id) await saveDispute(await getDispute(id)); // re-fetch: webhook payloads can be partial
  }
  return NextResponse.json({ ok: true });
}
