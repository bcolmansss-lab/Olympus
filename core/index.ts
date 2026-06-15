/**
 * Olympus core — composition root.
 *
 * Wires the foundational layers into a single Olympus instance:
 *   event bus -> OKG -> LLM -> memory -> RAG -> twin -> autonomy ->
 *   agent roster -> reasoning engine -> MCP server.
 *
 * The reasoning engine closes the loop: a single ask() flows
 *   reason -> simulate (twin) -> risk veto -> autonomy gate -> (execute | escalate).
 *
 * Swap any implementation (LLM, graph store, bus) behind its interface without
 * touching the layers above.
 */

import { EventBus } from "./events/event-bus.js";
import { OKG } from "./knowledge/graph/okg.js";
import { MockLLM, type LLMClient } from "./llm/client.js";
import { defaultRoster } from "./agents/executive-agent.js";
import type { Agent, AgentContext } from "./agents/types.js";
import { ExecutiveReasoningEngine } from "./reasoning/executive-reasoning-engine.js";
import { OlympusMCPServer } from "./mcp/olympus-mcp-server.js";
import { MemoryStore } from "./memory/memory-store.js";
import { GraphRAG } from "./retrieval/graph-rag.js";
import { AutonomyEngine } from "./autonomy/autonomy-engine.js";
import { DigitalTwin } from "./simulation/digital-twin.js";
import { DecisionInbox } from "./projections/decision-inbox.js";

export interface OlympusOptions {
  llm?: LLMClient;
  roster?: Agent[];
  /** Optional digital twin; when present the reasoning engine simulates interventions. */
  twin?: DigitalTwin;
}

export class Olympus {
  readonly bus: EventBus;
  readonly okg: OKG;
  readonly llm: LLMClient;
  readonly roster: Agent[];
  readonly memory: MemoryStore;
  readonly rag: GraphRAG;
  readonly autonomy: AutonomyEngine;
  readonly twin?: DigitalTwin;
  readonly ere: ExecutiveReasoningEngine;
  readonly mcp: OlympusMCPServer;
  /** Read-model projection of decisions needing human attention. */
  readonly inbox: DecisionInbox;

  constructor(opts: OlympusOptions = {}) {
    this.bus = new EventBus();
    this.okg = new OKG(this.bus);
    this.llm = opts.llm ?? new MockLLM();
    this.roster = opts.roster ?? defaultRoster();
    this.memory = new MemoryStore(this.bus);
    this.rag = new GraphRAG(this.okg, this.memory);
    this.autonomy = new AutonomyEngine(this.bus);
    this.twin = opts.twin;

    const ctx: AgentContext = { okg: this.okg, bus: this.bus, llm: this.llm, autonomy: this.autonomy };
    this.ere = new ExecutiveReasoningEngine(this.roster, ctx, this.twin);
    this.mcp = new OlympusMCPServer(this.okg, this.bus);
    this.inbox = new DecisionInbox(this.okg).attach(this.bus);
  }
}

export * from "./knowledge/graph/schema.js";
export { OKG } from "./knowledge/graph/okg.js";
export { EventBus } from "./events/event-bus.js";
export { ExecutiveReasoningEngine } from "./reasoning/executive-reasoning-engine.js";
export { Orchestrator } from "./agents/orchestrator/orchestrator.js";
export { OlympusMCPServer } from "./mcp/olympus-mcp-server.js";
export { DigitalTwin } from "./simulation/digital-twin.js";
export { MemoryStore } from "./memory/memory-store.js";
export { GraphRAG } from "./retrieval/graph-rag.js";
export { AutonomyEngine } from "./autonomy/autonomy-engine.js";
export { DecisionInbox } from "./projections/decision-inbox.js";
