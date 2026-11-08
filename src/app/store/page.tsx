import { CATALOG } from "@/lib/catalog";
import { Checkout } from "./checkout";

export const dynamic = "force-dynamic";

export default function StorePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Kova Coffee Co.</h1>
        <p className="text-sm text-zinc-500">
          Demo merchant store. Pay with a PayPal <b>sandbox</b> buyer account to create real orders you can dispute.
        </p>
      </div>
      <Checkout catalog={CATALOG} clientId={process.env.PAYPAL_CLIENT_ID ?? ""} />
    </div>
  );
}
