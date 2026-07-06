/**
 * Claude LLM adapter — the production cognition provider.
 *
 * Implements the provider-neutral LLMClient interface against the Anthropic
 * Messages API, with per-tier model routing (BLUEPRINT §7): cheap, fast models
 * for reflex/operate; the most capable models for reason/deliberate. Uses the
 * runtime's global `fetch`, so the core keeps its zero-dependency contract — no
 * SDK required.
 *
 * Confidence is not invented by the model; we ask for a brief, structured
 * self-assessment and parse a calibrated score, defaulting conservatively when
 * absent so autonomy is never granted on a hallucinated certainty.
 *
 *   const llm = ClaudeClient.fromEnv() ?? new MockLLM();
 *   const olympus = new Olympus({ llm });
 */

import type { LLMClient, LLMRequest, LLMResponse, CognitiveTier } from "./client.js";

/** Default per-tier model routing. Override via ClaudeClientOptions.models. */
export const DEFAULT_TIER_MODELS: Record<CognitiveTier, string> = {
  reflex: "claude-haiku-4-5-20251001",
  operate: "claude-haiku-4-5-20251001",
  reason: "claude-sonnet-4-6",
  deliberate: "claude-opus-4-8",
};

const DEFAULT_MAX_TOKENS: Record<CognitiveTier, number> = {
  reflex: 256,
  operate: 512,
  reason: 1024,
  deliberate: 2048,
};

export interface ClaudeClientOptions {
  apiKey: string;
  models?: Partial<Record<CognitiveTier, string>>;
  baseUrl?: string;
  apiVersion?: string;
  /** Per-request timeout in ms. Default 60s. */
  timeoutMs?: number;
}

interface AnthropicMessagesResponse {
  content?: Array<{ type: string; text?: string }>;
  model?: string;
  stop_reason?: string;
}

export class ClaudeClient implements LLMClient {
  private readonly models: Record<CognitiveTier, string>;
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly timeoutMs: number;

  constructor(private readonly opts: ClaudeClientOptions) {
    this.models = { ...DEFAULT_TIER_MODELS, ...(opts.models ?? {}) };
    this.baseUrl = opts.baseUrl ?? "https://api.anthropic.com";
    this.apiVersion = opts.apiVersion ?? "2023-06-01";
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  /** Construct from ANTHROPIC_API_KEY, or undefined if unset (caller falls back to MockLLM). */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): ClaudeClient | undefined {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) return undefined;
    return new ClaudeClient({ apiKey });
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const tier = req.tier ?? "operate";
    const model = this.models[tier];

    // Ask for the answer plus a calibrated confidence on its own final line.
    const system =
      (req.system ? req.system + "\n\n" : "") +
      "End your response with a final line formatted exactly as `CONFIDENCE: 0.NN` " +
      "giving your calibrated probability (0–1) that this answer is correct and complete.";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.opts.apiKey,
          "anthropic-version": this.apiVersion,
        },
        body: JSON.stringify({
          model,
          max_tokens: DEFAULT_MAX_TOKENS[tier],
          temperature: req.temperature ?? 0,
          system,
          messages: [{ role: "user", content: req.prompt }],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Claude API ${res.status}: ${detail.slice(0, 200)}`);
      }

      const data = (await res.json()) as AnthropicMessagesResponse;
      const text = (data.content ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("");

      return {
        text: stripConfidenceLine(text),
        confidence: parseConfidence(text),
        model: data.model ?? model,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// Confidence parsing — conservative by default.
// ---------------------------------------------------------------------------

/** Extract a `CONFIDENCE: 0.NN` score; default 0.5 when the model omits one. */
export function parseConfidence(text: string): number {
  const m = text.match(/CONFIDENCE:\s*([01](?:\.\d+)?)/i);
  if (!m) return 0.5;
  const v = Number(m[1]);
  if (Number.isNaN(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

export function stripConfidenceLine(text: string): string {
  return text.replace(/\n?\s*CONFIDENCE:\s*[01](?:\.\d+)?\s*$/i, "").trim();
}
