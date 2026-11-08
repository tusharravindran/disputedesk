// Applies db/schema.sql (idempotent). Seeds the sample disputes when run with --seed,
// or on first boot when SEED_DEMO=true and no sample disputes exist yet.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/disputedesk";
const sql = postgres(url, { max: 1, onnotice: () => {} });
const read = (f) => readFileSync(new URL(`../db/${f}`, import.meta.url), "utf8");

try {
  await sql.unsafe(read("schema.sql"));
  console.log("[migrate] schema applied");

  const forceSeed = process.argv.includes("--seed");
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM disputes WHERE is_demo`;
  if (forceSeed || (process.env.SEED_DEMO === "true" && n === 0)) {
    await sql.unsafe(read("seed-demo.sql"));
    console.log("[migrate] sample disputes seeded");
  }
} finally {
  await sql.end();
}
