/**
 * Multi-agent executive layer — agent contract + OACP coordination protocol.
 *
 * Agents are stateless reasoners; all state lives in the OKG/memory layer
 * (BLUEPRINT.md §5.2), which makes them horizontally scalable and independently
 * upgradable. They communicate over the event bus using OACP envelopes.
 */

import type { EventBus } from "../events/event-bus.js";
import type { OKG } from "../knowledge/graph/okg.js";
import type { LLMClient } from "../llm/client.js";
import type { Domain, UUID } from "../knowledge/graph/schema.js";
import type { SimResult } from "../simulation/digital-twin.js";
import type { AutonomyEngine } from "../autonomy/autonomy-engine.js";

export type OACPType =
  | "PROPOSE"
  | "CHALLENGE"
  | "SUPPORT"
  | "VOTE"
  | "ESCALATE"
  | "RESOLVE";

/** Olympus Agent Coordination Protocol message envelope. */
export interface OACPMessage {
  msgId: UUID;
  protocol: "OACP/1.0";
  type: OACPType;
  fromAgent: string;
  to: string[];
  decisionId: UUID;
  claim: string;
  /** OKG references (e.g. "okg://decision/...") backing the claim. */
  evidence: string[];
  /** Calibrated confidence in [0, 1]. */
  confidence: number;
  predictedImpact?: Record<string, string | number>;
  /** True when this message records dissent (mandatory from Devil's Advocate). */
  dissent: boolean;
  ts: string;
}

/** Shared services handed to every agent. */
export interface AgentContext {
  okg: OKG;
  bus: EventBus;
  llm: LLMClient;
  /** Optional governed action gate; when present the orchestrator gates its resolution. */
  autonomy?: AutonomyEngine;
}

/** Question presented to agents for a decision session. */
export interface DecisionBrief {
  decisionId: UUID;
  question: string;
  domain: Domain;
  /** Candidate option labels. */
  options: string[];
  /** Forward simulation of the leading option, consumed by the Risk Agent's veto. */
  simulation?: SimResult;
  /** Capability the resolved action maps to (for the autonomy gate). */
  capability?: string;
  /** Monetary exposure of the action (for blast-radius checks). */
  exposureAmount?: number;
}

export interface Agent {
  /** Stable id, also used as the Agent node id in the OKG for auditability. */
  readonly id: string;
  readonly name: string;
  readonly domain: Domain | "meta";
  readonly mandate: string;
  /**
   * Agent relevance weight for a given domain, used in weighted consensus.
   * Higher = more authoritative on that domain.
   */
  relevance(domain: Domain): number;
  /** Produce an OACP message (PROPOSE / SUPPORT / CHALLENGE / ESCALATE) for the brief. */
  analyze(brief: DecisionBrief, ctx: AgentContext): Promise<OACPMessage>;
}
