import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { investigate } from "@/lib/agent";

export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d] = await sql`SELECT id FROM disputes WHERE id = ${id}`;
  if (!d) return NextResponse.json({ error: "dispute not found" }, { status: 404 });
  const runId = await investigate(id);
  const [run] = await sql`SELECT id, status, verdict, confidence, summary, draft, trace, model FROM agent_runs WHERE id = ${runId}`;
  return NextResponse.json(run);
}
