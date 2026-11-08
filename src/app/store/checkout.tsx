"use client";

import { useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import type { Product } from "@/lib/catalog";

export function Checkout({ catalog, clientId }: { catalog: Product[]; clientId: string }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [result, setResult] = useState<string | null>(null);
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  const total = items.reduce((s, [sku, q]) => s + Number(catalog.find((p) => p.sku === sku)!.price) * q, 0);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_340px]">
      <div className="grid gap-4 sm:grid-cols-2">
        {catalog.map((p) => (
          <div key={p.sku} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="text-3xl">{p.emoji}</div>
            <div className="mt-2 font-medium">{p.name}</div>
            <div className="text-sm text-zinc-500">{p.blurb}</div>
            <div className="mt-3 flex items-center justify-between">
              <span className="font-semibold">${p.price}</span>
              <button
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700"
                onClick={() => setCart((c) => ({ ...c, [p.sku]: (c[p.sku] ?? 0) + 1 }))}
              >
                Add to cart
              </button>
            </div>
          </div>
        ))}
      </div>

      <aside className="h-fit rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Cart</h2>
        {items.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Empty.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {items.map(([sku, q]) => (
              <li key={sku} className="flex justify-between">
                <span>{catalog.find((p) => p.sku === sku)!.name} × {q}</span>
                <button className="text-zinc-400 hover:text-red-600" onClick={() => setCart((c) => ({ ...c, [sku]: 0 }))}>
                  remove
                </button>
              </li>
            ))}
            <li className="flex justify-between border-t pt-2 font-semibold">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </li>
          </ul>
        )}

        {items.length > 0 && clientId && (
          <div className="mt-4">
            <PayPalScriptProvider options={{ clientId, currency: "USD", intent: "capture" }}>
              <PayPalButtons
                style={{ layout: "vertical", shape: "rect" }}
                forceReRender={[JSON.stringify(items)]}
                createOrder={async () => {
                  const res = await fetch("/api/orders", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ items: items.map(([sku, quantity]) => ({ sku, quantity })) }),
                  });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error ?? "order failed");
                  return json.id;
                }}
                onApprove={async (data) => {
                  const res = await fetch(`/api/orders/${data.orderID}/capture`, { method: "POST" });
                  const json = await res.json();
                  setResult(res.ok ? `Paid! Capture ${json.captureId}` : `Capture failed`);
                  if (res.ok) setCart({});
                }}
                onError={(err) => setResult(`PayPal error: ${String(err)}`)}
              />
            </PayPalScriptProvider>
          </div>
        )}
        {result && <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">{result}</p>}
      </aside>
    </div>
  );
}
