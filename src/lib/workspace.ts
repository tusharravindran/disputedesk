import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "@/lib/db";
import { syncDisputes } from "@/lib/disputes";

/**
 * Clears everything tied to the previous PayPal account and re-seeds the sample disputes.
 * Runs in one transaction: if anything fails, the old data stays as it was.
 */
export async function resetWorkspace() {
  const seed = await readFile(path.join(process.cwd(), "db", "seed-demo.sql"), "utf8");
  await sql.begin(async (tx) => {
    await tx`DELETE FROM dispute_actions`;
    await tx`DELETE FROM agent_runs`;
    await tx`DELETE FROM disputes`;
    await tx`DELETE FROM orders`;
    await tx`DELETE FROM webhook_events`;
    await tx.unsafe(seed);
  });
}

/** Pulls the new account's real disputes (and rebuilds their orders from PayPal). */
export async function syncAfterSwitch(): Promise<{ synced: number; error?: string }> {
  try {
    return { synced: await syncDisputes() };
  } catch (e) {
    return { synced: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
