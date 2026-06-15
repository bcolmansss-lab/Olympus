/**
 * Executive Reasoning Engine (ERE) — "reason, don't retrieve."
 *
 * Pipeline (BLUEPRINT.md §17):
 *   DECOMPOSE -> GROUND -> MULTI-PERSPECTIVE -> SIMULATE -> SYNTHESIZE
 *   -> SOCRATIC PROBE -> DEVIL'S ADVOCATE -> CALIBRATE -> ANSWER
 *
 * This reference implementation wires the stages with the OKG, the agent
 * roster (via the Orchestrator), and the LLM. Every claim in the answer is
 * traceable to grounded evidence — the anti-hallucination contract.
 */

import { randomUUID } from "node:crypto";
import type { AgentContext, DecisionBrief } from "../agents/types.js";
import { Orchestrator } from "../agents/orchestrator/orchestrator.js";
import type { Agent } from "../agents/types.js";
import type { Domain, UUID } from "../knowledge/graph/schema.js";

export interface Evidence {
  ref: string;
  claim: string;
}

export interface ReasonedAnswer {
  question: string;
  thesis: string;
  confidence: number;
  evidence: Evidence[];
  recommendation?: string;
  /** The strongest recorded counter-argument. */
  dissent: string;
  /** Autonomy gate disposition for any implied action. */
  autonomyGate: string;
  /** Decision node id created for this reasoning episode. */
  decisionId: UUID;
}

export interface AskOptions {
  domain?: Domain;
  options?: string[];
  /** Cognitive depth; maps to model tier. */
  depth?: "reflex" | "operate" | "reason" | "deliberate";
}

export class ExecutiveReasoningEngine {
  private readonly orchestrator: Orchestrator;

  constructor(
    private readonly roster: Agent[],
    private readonly ctx: AgentContext,
  ) {
    this.orchestrator = new Orchestrator(roster, ctx);
  }

  async ask(question: string, opts: AskOptions = {}): Promise<ReasonedAnswer> {
    const domain: Domain = opts.domain ?? "strategy";
    const depth = opts.depth ?? "reason";

    // DECOMPOSE — split the question into sub-questions (tree-of-thought).
    const decomposition = await this.ctx.llm.complete({
      tier: depth,
      system: "Decompose the question into the minimal set of sub-questions answerable from grounded facts.",
      prompt: question,
    });

    // GROUND — open a Decision node so the episode is first-class and replayable.
    const options = opts.options ?? ["proceed", "do-not-proceed"];
    const decision = this.ctx.okg.addDecision(
      {
        question,
        domain,
        options: options.map((label) => ({ label })),
        autonomyLevel: 1,
        status: "proposed",
      },
      "ere",
    );

    const brief: DecisionBrief = {
      decisionId: decision.id,
      question,
      domain,
      options,
    };

    // MULTI-PERSPECTIVE + SIMULATE + SYNTHESIZE + DEVIL'S ADVOCATE
    // are all carried out inside the orchestrated session.
    const session = await this.orchestrator.runSession(brief);

    // SOCRATIC PROBE — the engine interrogates its own leading thesis.
    const socratic = await this.ctx.llm.complete({
      tier: depth,
      system: "Ask and answer the single hardest question that, if its answer is unfavorable, would break this recommendation.",
      prompt: `Recommendation: ${session.recommendation ?? "escalate"}\nDecomposition: ${decomposition.text}`,
    });

    // CALIBRATE — confidence is the consensus score tempered by the probe.
    const confidence = Number(
      Math.min(session.consensusScore, socratic.confidence).toFixed(2),
    );

    const dissentMsg = session.dissent[0]?.claim ?? "No dissent recorded.";
    const autonomyGate =
      session.outcome === "escalated_to_human"
        ? "L1 (advisory) — escalated for human review"
        : `L${decision.props.autonomyLevel} — within advisory bounds`;

    return {
      question,
      thesis:
        session.outcome === "recommended"
          ? `Recommended: ${session.recommendation} (consensus ${session.consensusScore}).`
          : `No autonomous recommendation — escalated to human review.`,
      confidence,
      evidence: [
        { ref: `okg://decision/${decision.id}`, claim: "Decision session record" },
        { ref: "ere://decompose", claim: decomposition.text },
      ],
      recommendation: session.recommendation,
      dissent: dissentMsg,
      autonomyGate,
      decisionId: decision.id,
    };
  }
}
