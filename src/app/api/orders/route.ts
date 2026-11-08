import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrder } from "@/lib/paypal";
import { findProduct } from "@/lib/catalog";

const Body = z.object({ items: z.array(z.object({ sku: z.string(), quantity: z.number().int().min(1).max(10) })).min(1) });

// Prices come from the server-side catalog, never from the client.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid cart" }, { status: 400 });
  if (parsed.data.items.some((i) => !findProduct(i.sku)))
    return NextResponse.json({ error: "unknown product" }, { status: 400 });
  const items = parsed.data.items.map((i) => {
    const p = findProduct(i.sku)!;
    return { name: p.name, sku: p.sku, price: p.price, quantity: i.quantity };
  });
  const order = await createOrder(items);
  return NextResponse.json({ id: order.id });
}
