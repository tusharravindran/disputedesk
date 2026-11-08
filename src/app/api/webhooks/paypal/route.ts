import { after, NextResponse } from "next/server";
import { investigate } from "@/lib/agent";
import { sql } from "@/lib/db";
import { getDispute, verifyWebhook } from "@/lib/paypal";
import { saveDispute } from "@/lib/disputes";

export async function POST(req: Request) {
  const raw = await req.text();
  let event: { id?: string; event_type?: string; resource?: { dispute_id?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!event.id || !event.event_type) return NextResponse.json({ error: "not a PayPal event" }, { status: 400 });

  let verified = false;
  try {
    verified = await verifyWebhook(req.headers, raw);
  } catch (e) {
    console.error("[webhook] verification error", e);
  }

  const inserted = await sql`
    INSERT INTO webhook_events (id, event_type, verified, payload)
    VALUES (${event.id}, ${event.event_type}, ${verified}, ${sql.json(event as never)})
    ON CONFLICT (id) DO NOTHING RETURNING id`;
  if (inserted.length === 0) return NextResponse.json({ ok: true, duplicate: true });

  // Unverified events are kept for inspection but never acted on (local testing can opt out).
  if (!verified && process.env.ALLOW_UNVERIFIED_WEBHOOKS !== "true")
    return NextResponse.json({ ok: true, ignored: "unverified" });

  const disputeId = event.resource?.dispute_id;
  if (event.event_type.startsWith("CUSTOMER.DISPUTE.") && disputeId) {
    await saveDispute(await getDispute(disputeId)); // webhook payloads can be partial; fetch the full dispute
    if (event.event_type === "CUSTOMER.DISPUTE.CREATED") after(() => investigate(disputeId).then(() => undefined));
  }
  return NextResponse.json({ ok: true });
}
