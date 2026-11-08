// Gemini Interactions API client (free tier). Docs: https://aistudio.google.com/docs/interactions-overview
import "server-only";

const URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

/**
 * Primary model first; later entries are fallbacks. Free-tier quota is per model
 * (e.g. 20 requests/day), so each fallback adds capacity.
 */
export const MODELS = (process.env.GEMINI_MODELS ?? "gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.8-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export type ToolDef = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type Step =
  | { type: "thought" }
  | { type: "function_call"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "model_output"; content: Array<{ type: string; text?: string }> }
  | { type: string; [k: string]: unknown };

export type Interaction = { id: string; status: string; model: string; steps: Step[] };

export type InteractionInput =
  | string
  | Array<{ type: "function_result"; name: string; call_id: string; result: Array<{ type: "text"; text: string }> }>;

export class LLMError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call(model: string, body: Record<string, unknown>): Promise<Interaction> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const res = await fetch(URL, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ model, ...body }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new LLMError(res.status, json?.error?.message ?? `HTTP ${res.status}`);
  return json as Interaction;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One turn of an interaction on one model. A conversation is pinned to the model that
 * started it (previous_interaction_id is model-scoped), so model fallback lives in the agent.
 */
export async function interact(opts: {
  model?: string;
  system: string;
  tools: ToolDef[];
  input: InteractionInput;
  previousId?: string;
}): Promise<Interaction> {
  const body = {
    system_instruction: opts.system,
    tools: opts.tools,
    input: opts.input,
    ...(opts.previousId ? { previous_interaction_id: opts.previousId } : {}),
  };
  const model = opts.model ?? MODELS[0];
  for (let attempt = 0; ; attempt++) {
    try {
      return await call(model, body);
    } catch (e) {
      // Brief overloads are worth a retry; quota errors (429) are not - the agent switches model instead.
      const retryable = e instanceof LLMError ? e.status === 503 || e.status === 500 : e instanceof TypeError;
      if (retryable && attempt < 2) {
        await sleep(1500 * 2 ** attempt);
        continue;
      }
      throw e;
    }
  }
}
