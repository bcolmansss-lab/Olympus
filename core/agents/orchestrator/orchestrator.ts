/**
 * Orchestrator — multi-agent coordination, debate, and consensus.
 *
 * Runs the OACP decision session (BLUEPRINT.md §8.3):
 *   1. Convene a session for any decision above a stakes threshold.
 *   2. Collect PROPOSE messages from relevant agents.
 *   3. Require mandatory dissent (Devil's Advocate CHALLENGE) — a session
 *      cannot close without it.
 *   4. Honor the Risk Agent ESCALATE veto (forces human review).
 *   5. Compute weighted consensus (weight = domain relevance × confidence).
 *   6. Synthesize a single recommendation + the full dissent record.
 *   7. Route to the autonomy gate.
 *
 * The whole session is persisted as a replayable DecisionSession record.
 */

import { randomUUID } from "node:crypto";
import type { Agent, AgentContext, DecisionBrief, OACPMessage } from "../types.js";
import type { Domain, UUID } from "../../knowledge/graph/schema.js";
import type { AutonomyLevel, GateResult } from "../../autonomy/autonomy-engine.js";

export interface DecisionSession {
  id: UUID;
  decisionId: UUID;
  question: string;
  domain: Domain;
  participants: string[];
  transcript: OACPMessage[];
  /** Winning option label, if consensus reached. */
  recommendation?: string;
  /** Aggregate confidence behind the recommendation, [0, 1]. */
  consensusScore: number;
  /** Recorded counter-arguments. Never empty for a closed high-stakes session. */
  dissent: OACPMessage[];
  /** True when the Risk Agent forced human review. */
  riskVeto: boolean;
  /** Result of the autonomy gate, when an autonomy engine + capability were supplied. */
  gate?: GateResult;
  /** Terminal disposition of the session. */
  outcome: "recommended" | "auto_executed" | "queued_for_approval" | "escalated_to_human";
}

export interface OrchestratorOptions {
  /** Minimum aggregate confidence to auto-recommend without escalation. */
  minConsensus?: number;
}

export class Orchestrator {
  private readonly minConsensus: number;

  constructor(
    private readonly roster: Agent[],
    private readonly ctx: AgentContext,
    opts: OrchestratorOptions = {},
  ) {
    this.minConsensus = opts.minConsensus ?? 0.6;
  }

  /** Run a full decision session and return the replayable record. */
  async runSession(brief: DecisionBrief): Promise<DecisionSession> {
    this.ctx.bus.publish("decision.session.opened", { decisionId: brief.decisionId });

    // 1. Gather every agent's analysis (proposals, the mandatory challenge, risk view).
    const messages = await Promise.all(this.roster.map((a) => a.analyze(brief, this.ctx)));

    const transcript = [...messages];
    const dissent = messages.filter((m) => m.dissent || m.type === "CHALLENGE");
    const escalations = messages.filter((m) => m.type === "ESCALATE");

    // 2. Enforce mandatory dissent — refuse to close a session without it.
    if (dissent.length === 0) {
      throw new Error(
        "OACP violation: decision session closed without recorded dissent (Devil's Advocate required).",
      );
    }

    // 3. Tally weighted votes across PROPOSE/SUPPORT messages.
    const tally = new Map<string, number>();
    for (const m of messages) {
      if (m.type !== "PROPOSE" && m.type !== "SUPPORT") continue;
      const agent = this.roster.find((a) => a.id === m.fromAgent);
      const weight = (agent?.relevance(brief.domain) ?? 0.3) * m.confidence;
      const option = String(m.predictedImpact?.option ?? m.claim.split(" — ")[0] ?? "");
      if (!option) continue;
      tally.set(option, (tally.get(option) ?? 0) + weight);
    }

    const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked[0];
    const totalWeight = ranked.reduce((sum, [, w]) => sum + w, 0) || 1;
    const consensusScore = top ? Number((top[1] / totalWeight).toFixed(2)) : 0;

    // 4. Risk veto or insufficient consensus => escalate to a human.
    const escalated = escalations.length > 0 || consensusScore < this.minConsensus || !top;

    const session: DecisionSession = {
      id: randomUUID(),
      decisionId: brief.decisionId,
      question: brief.question,
      domain: brief.domain,
      participants: this.roster.map((a) => a.id),
      transcript,
      recommendation: escalated ? undefined : top?.[0],
      consensusScore,
      dissent,
      riskVeto: escalations.length > 0,
      outcome: escalated ? "escalated_to_human" : "recommended",
    };

    // 5. Close the loop: run the Autonomy gate on the resolution.
    //    A simulation must exist for L3+ (the gate enforces this).
    if (!escalated && this.ctx.autonomy && brief.capability) {
      const grant = this.ctx.autonomy.getGrant(brief.domain, brief.capability);
      const gate = this.ctx.autonomy.evaluate({
        decisionId: brief.decisionId,
        domain: brief.domain,
        capability: brief.capability,
        attemptedLevel: (grant?.level ?? 0) as AutonomyLevel,
        amount: brief.exposureAmount,
        simulated: brief.simulation !== undefined,
      });
      session.gate = gate;
      session.outcome =
        gate.disposition === "execute" || gate.disposition === "execute_notify"
          ? "auto_executed"
          : gate.disposition === "queue_for_approval"
            ? "queued_for_approval"
            : "escalated_to_human";
    }

    // 6. Synthesis message + routing event.
    const resolutionNote =
      session.outcome === "auto_executed"
        ? `Auto-executed "${session.recommendation}" at ${session.gate?.effectiveLevel ? "L" + session.gate.effectiveLevel : "granted level"} (consensus ${consensusScore}).`
        : session.outcome === "queued_for_approval"
          ? `Queued "${session.recommendation}" for human approval (consensus ${consensusScore}).`
          : escalated
            ? `Escalated to human review (consensus ${consensusScore}, riskVeto=${session.riskVeto}).`
            : `Recommend "${session.recommendation}" (consensus ${consensusScore}).`;

    const synthesis: OACPMessage = {
      msgId: randomUUID(),
      protocol: "OACP/1.0",
      type: "RESOLVE",
      fromAgent: "orchestrator",
      to: ["autonomy-gate"],
      decisionId: brief.decisionId,
      claim: resolutionNote,
      evidence: [`okg://decision/${brief.decisionId}`],
      confidence: consensusScore,
      dissent: false,
      ts: new Date().toISOString(),
    };
    session.transcript.push(synthesis);

    this.ctx.bus.publish("decision.session.resolved", {
      decisionId: brief.decisionId,
      outcome: session.outcome,
      recommendation: session.recommendation,
      consensusScore,
    });

    return session;
  }
}
