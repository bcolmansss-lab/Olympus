/**
 * LLM client abstraction + cognitive tiering.
 *
 * Olympus routes every cognitive task to the cheapest tier that meets the
 * required reliability (see BLUEPRINT.md §7). The interface is provider-neutral;
 * production wires Claude models per tier. The MockLLM here is deterministic so
 * the reference demo runs with no network and no API keys.
 */

export type CognitiveTier = "reflex" | "operate" | "reason" | "deliberate";

export interface LLMRequest {
  system?: string;
  prompt: string;
  tier?: CognitiveTier;
  /** 0 = deterministic (used for audited decisions). */
  temperature?: number;
}

export interface LLMResponse {
  text: string;
  /** Calibrated confidence in [0, 1] that gates autonomy downstream. */
  confidence: number;
  model: string;
}

export interface LLMClient {
  complete(req: LLMRequest): Promise<LLMResponse>;
}

/**
 * Deterministic mock. Produces plausible, structured text keyed off the prompt
 * so the orchestration logic is exercised end-to-end without a real model.
 */
export class MockLLM implements LLMClient {
  // eslint-disable-next-line @typescript-eslint/require-await
  async complete(req: LLMRequest): Promise<LLMResponse> {
    const tier = req.tier ?? "operate";
    const seed = hash(req.system + "|" + req.prompt);
    // Confidence is a stable function of the prompt + tier so tests are repeatable.
    const base = 0.6 + (seed % 35) / 100; // 0.60 .. 0.94
    const tierBonus = tier === "deliberate" ? 0.04 : tier === "reason" ? 0.02 : 0;
    const confidence = Math.min(0.97, Number((base + tierBonus).toFixed(2)));
    return {
      text: `[mock:${tier}] ${summarize(req.prompt)}`,
      confidence,
      model: `mock-${tier}`,
    };
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function summarize(prompt: string): string {
  const firstLine = prompt.split("\n").find((l) => l.trim().length > 0) ?? prompt;
  return firstLine.slice(0, 160);
}
