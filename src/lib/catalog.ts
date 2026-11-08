// Demo store catalog ("Kova Coffee Co.") — used to generate real sandbox orders to dispute.
export type Product = { sku: string; name: string; price: string; blurb: string; emoji: string };

export const CATALOG: Product[] = [
  { sku: "KOVA-GRN-01", name: "Burr Grinder Pro", price: "149.00", blurb: "40 grind settings, conical steel burrs.", emoji: "⚙️" },
  { sku: "KOVA-KTL-02", name: "Gooseneck Kettle", price: "79.00", blurb: "Temperature hold, 0.9L.", emoji: "🫖" },
  { sku: "KOVA-BNS-03", name: "Ethiopia Yirgacheffe 1kg", price: "38.00", blurb: "Washed, light roast. Jasmine, bergamot.", emoji: "☕" },
  { sku: "KOVA-SCL-04", name: "Pour-over Scale", price: "54.00", blurb: "0.1g precision with flow timer.", emoji: "⚖️" },
];

export const findProduct = (sku: string) => CATALOG.find((p) => p.sku === sku);
