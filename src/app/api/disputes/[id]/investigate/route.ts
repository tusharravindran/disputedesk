import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { investigate, type AgentEvent } from "@/lib/agent";

export const maxDuration = 120;

/** Streams agent progress as Server-Sent Events, ending with the full run record. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d] = await sql`SELECT id FROM disputes WHERE id = ${id}`;
  if (!d) return NextResponse.json({ error: "dispute not found" }, { status: 404 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        const runId = await investigate(id, (e: AgentEvent) => send(e.type, e));
        const [run] = await sql`SELECT id, status, verdict, confidence, summary, draft, trace, model FROM agent_runs WHERE id = ${runId}`;
        send("run", run);
      } catch (e) {
        send("error", { type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
