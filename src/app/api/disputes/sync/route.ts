import { NextResponse } from "next/server";
import { getDispute, PayPalError } from "@/lib/paypal";
import { saveDispute, syncDisputes } from "@/lib/disputes";

/** Sync all disputes, or import one by id (`?id=PP-...`) when PayPal's list hasn't indexed it yet. */
export async function POST(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ synced: await syncDisputes() });
  try {
    await saveDispute(await getDispute(id));
    return NextResponse.json({ synced: 1, id });
  } catch (e) {
    const status = e instanceof PayPalError ? e.status : 500;
    return NextResponse.json({ error: `could not fetch dispute ${id}` }, { status: status === 404 ? 404 : 502 });
  }
}
