/**
 * Concrete agents: the executive roster.
 *
 * - ExecutiveAgent: a domain specialist (CFO, COO, Sales, Strategy, ...) that
 *   proposes/supports an option with reasoning and predicted impact.
 * - DevilsAdvocateAgent: MANDATORY adversary — every session must contain its
 *   CHALLENGE before it can close (first principle P6: disagreement is signal).
 * - RiskAgent: can ESCALATE to force human review regardless of consensus.
 */

import { randomUUID } from "node:crypto";
import type {
  Agent,
  AgentContext,
  DecisionBrief,
  OACPMessage,
} from "./types.js";
import type { Domain } from "../knowledge/graph/schema.js";

function msg(
  partial: Omit<OACPMessage, "msgId" | "protocol" | "ts">,
): OACPMessage {
  return {
    msgId: randomUUID(),
    protocol: "OACP/1.0",
    ts: new Date().toISOString(),
    ...partial,
  };
}

/** A domain-specialist executive agent. */
export class ExecutiveAgent implements Agent {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly domain: Domain,
    readonly mandate: string,
  ) {}

  relevance(domain: Domain): number {
    return domain === this.domain ? 1 : 0.3;
  }

  async analyze(brief: DecisionBrief, ctx: AgentContext): Promise<OACPMessage> {
    const tier = brief.domain === this.domain ? "reason" : "operate";
    const res = await ctx.llm.complete({
      tier,
      system: `You are the ${this.name}. Mandate: ${this.mandate}. Reason from the organization's knowledge graph; cite evidence; do not retrieve, derive.`,
      prompt: `Decision: ${brief.question}\nOptions: ${brief.options.join(", ")}\nRecommend one option with predicted impact.`,
    });
    // Skeleton heuristic: pick the first option; production derives this from
    // graph-grounded reasoning + simulation.
    const choice = brief.options[0] ?? "no-op";
    const m = msg({
      type: "PROPOSE",
      fromAgent: this.id,
      to: ["orchestrator"],
      decisionId: brief.decisionId,
      claim: `${choice} — ${res.text}`,
      evidence: [`okg://decision/${brief.decisionId}`],
      confidence: res.confidence * this.relevance(brief.domain),
      predictedImpact: { option: choice },
      dissent: false,
    });
    ctx.bus.publish("agent.proposed", m);
    return m;
  }
}

/** Mandatory adversary. Always emits a CHALLENGE with dissent=true. */
export class DevilsAdvocateAgent implements Agent {
  readonly id = "devils-advocate";
  readonly name = "Devil's Advocate";
  readonly domain = "meta" as const;
  readonly mandate =
    "Argue the strongest counter-case to the leading proposal. A session cannot close without recorded dissent.";

  relevance(): number {
    return 0; // does not vote; only forces dissent into the record
  }

  async analyze(brief: DecisionBrief, ctx: AgentContext): Promise<OACPMessage> {
    const res = await ctx.llm.complete({
      tier: "reason",
      system: `You are the Devil's Advocate. Find the strongest reason the leading recommendation is wrong.`,
      prompt: `Decision: ${brief.question}\nOptions: ${brief.options.join(", ")}\nState the most credible counter-argument and what would have to be true for it to dominate.`,
    });
    const m = msg({
      type: "CHALLENGE",
      fromAgent: this.id,
      to: ["orchestrator"],
      decisionId: brief.decisionId,
      claim: res.text,
      evidence: [`okg://decision/${brief.decisionId}`],
      confidence: res.confidence,
      dissent: true,
    });
    ctx.bus.publish("agent.challenged", m);
    return m;
  }
}

/** Enterprise risk officer. Escalates to humans when downside breaches charter. */
export class RiskAgent implements Agent {
  readonly id = "risk";
  readonly name = "Risk Officer";
  readonly domain = "risk" as const;
  readonly mandate =
    "Assess blast radius and tail risk; ESCALATE to human review when downside exceeds policy, regardless of consensus.";

  constructor(private readonly escalateThreshold = 0.55) {}

  relevance(domain: Domain): number {
    return domain === "risk" ? 1 : 0.5;
  }

  async analyze(brief: DecisionBrief, ctx: AgentContext): Promise<OACPMessage> {
    const res = await ctx.llm.complete({
      tier: "reason",
      system: `You are the Risk Officer. Estimate downside and whether human review is required.`,
      prompt: `Decision: ${brief.question}\nOptions: ${brief.options.join(", ")}\nAssess tail risk and blast radius.`,
    });
    // Low confidence in the assessment => the situation is uncertain => escalate.
    const shouldEscalate = res.confidence < this.escalateThreshold;
    const m = msg({
      type: shouldEscalate ? "ESCALATE" : "SUPPORT",
      fromAgent: this.id,
      to: ["orchestrator"],
      decisionId: brief.decisionId,
      claim: shouldEscalate
        ? `Escalating to human review: ${res.text}`
        : `Risk acceptable within charter: ${res.text}`,
      evidence: [`okg://decision/${brief.decisionId}`],
      confidence: res.confidence,
      dissent: false,
    });
    ctx.bus.publish(shouldEscalate ? "agent.escalated" : "agent.supported", m);
    return m;
  }
}

/** The default executive roster (subset of the full 13 in the blueprint). */
export function defaultRoster(): Agent[] {
  return [
    new ExecutiveAgent("cfo", "CFO Agent", "finance", "Financial health, cash, forecasting, capital allocation."),
    new ExecutiveAgent("coo", "COO Agent", "ops", "Operations, throughput, supply, capacity."),
    new ExecutiveAgent("sales", "Sales Agent", "sales", "Pipeline, revenue motion."),
    new ExecutiveAgent("strategy", "Strategy Agent", "strategy", "Market positioning and long-range bets."),
    new RiskAgent(),
    new DevilsAdvocateAgent(),
  ];
}
