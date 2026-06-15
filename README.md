# Project Olympus

**The Autonomous Business Operating System (ABOS).**

Olympus is a unified, AI-native intelligence layer that replaces the entire operational business software stack — CRM, ERP, BI, project management, HRIS, FP&A, and knowledge management — with a single, continuously-reasoning system.

It is built on three pillars:

1. **The Organizational Knowledge Graph (OKG)** — a bitemporal, multi-modal model of everything the business knows.
2. **The Multi-Agent Executive Layer** — an AI executive team that analyzes, debates, simulates, and recommends.
3. **The Autonomy Engine** — governed, graduated action in the world (L0 read-only → L7 fully autonomous).

> Olympus is the operating system for a company that thinks.

## The First-Principle Question

*If a business were created today from scratch, and artificial intelligence existed from day one, how would business itself be designed differently?*

## Read the Full Blueprint

See **[BLUEPRINT.md](./BLUEPRINT.md)** for the complete founder-grade blueprint: philosophy, architecture, knowledge graph design, multi-agent system, memory, security, autonomy levels, schemas, APIs, monetization, go-to-market, and the 10-year roadmap (2026–2035).

## See It Work

For a guided 2-minute tour — the finance closed loop, churn diagnosis, the
governance guardrails, and durable replay — see **[DEMO.md](./DEMO.md)**.

## Core Reference Skeleton

A runnable TypeScript skeleton of the core lives in [`core/`](./core). It has **zero runtime dependencies** and ships in-memory implementations behind clean interfaces, so it runs with no API keys and can later be swapped for production backends (Neo4j/FalkorDB, Kafka/Redpanda, Claude models).

```bash
npm install
npm run demo        # end-to-end walkthrough with a deterministic mock LLM
npm test            # 21 invariant tests (node:test, zero extra deps)
npm run serve       # start the HTTP API on :7777
npm run typecheck   # strict TypeScript
```

### HTTP API

A thin, zero-dependency HTTP surface (`core/api/server.ts`, built on Node's stdlib `http`) maps the BLUEPRINT §21 REST spec onto the core:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Live operator console — a single self-contained HTML page (Decision Inbox + event spine, streaming over SSE) |
| `POST` | `/v1/ask` | Reasoned Q&A — runs the full closed loop, returns thesis + evidence + autonomy gate |
| `POST` · `GET` | `/v1/decisions` · `/v1/decisions/:id` | Open / list / fetch decision records |
| `POST` | `/v1/simulate` | Run a digital-twin simulation (P10/P50/P90 + tail risk) |
| `POST` | `/v1/diagnose` | GraphRAG grounded context bundle (graph + vector + semantic + aggregate, with provenance) |
| `GET` | `/v1/briefing` | Proactive executive briefing synthesized from the live system state |
| `GET` · `PUT` | `/v1/autonomy/grants` | Inspect / set per-domain L0–L7 capability grants |
| `GET` · `POST` | `/v1/inbox` · `/v1/inbox/:id/resolve` | Decision Inbox feed (items needing human attention) + resolve |
| `GET` | `/v1/stream` | Live event stream (Server-Sent Events; `?topic=decision.*` to filter) |
| `GET` | `/v1/events` · `/v1/audit` | The event spine log and the tamper-evident audit chain |

Open **http://localhost:7777/** after `npm run serve` for the live operator console — click *Run a decision* and watch the closed loop flow through the Decision Inbox and event spine in real time.

```bash
npm run serve
curl -s -XPOST localhost:7777/v1/ask -d '{
  "question":"Cut Q3 marketing spend 18%?","domain":"finance",
  "options":["cut-18pct","hold"],"capability":"reallocate_budget",
  "intervention":{"variable":"marketing_spend","delta":-0.18},
  "exposureAmount":162000,"simSeed":7
}'
# → thesis "Auto-executed: cut-18pct (consensus 0.73, L5)."  autonomyGate "L5 — execute"
```

### What's implemented

| Layer | File | What it does |
|---|---|---|
| **OKG schema** | `core/knowledge/graph/schema.ts` | Bitemporal node/edge ontology; `Decision` as a first-class node |
| **OKG store** | `core/knowledge/graph/okg.ts` | Append-only bitemporal graph with as-of queries + decision reconciliation |
| **Event spine** | `core/events/event-bus.ts` | Topic/wildcard pub-sub; the log is the source of truth |
| **LLM tiering** | `core/llm/client.ts` | Provider-neutral client + deterministic `MockLLM` |
| **Agents** | `core/agents/executive-agent.ts` | Executive roster + mandatory Devil's Advocate + Risk Agent veto |
| **Orchestrator** | `core/agents/orchestrator/orchestrator.ts` | OACP decision session: debate, mandatory dissent, weighted consensus, escalation |
| **Reasoning engine** | `core/reasoning/executive-reasoning-engine.ts` | The "reason, don't retrieve" pipeline (decompose → ground → multi-perspective → synthesize → Socratic probe → calibrate) |
| **MCP layer** | `core/mcp/olympus-mcp-server.ts` | Tool registry with ABAC autonomy gating + tamper-evident hash-chained audit log |
| **Digital twin** | `core/simulation/digital-twin.ts` | Seeded Monte Carlo + causal do-operator over a structural model → P10/P50/P90, tail risk, sensitivity |
| **Memory store** | `core/memory/memory-store.ts` | Six-layer memory (episodic, semantic, procedural, strategic, operational, decision); Hebbian reinforcement + decay; calibration flywheel (MAE by domain) |
| **GraphRAG** | `core/retrieval/graph-rag.ts` | Grounded context bundle: graph traversal (causal edges, MAX 3 hops) + cosine vector search + semantic memory + relational aggregation, all with provenance refs |
| **Autonomy engine** | `core/autonomy/autonomy-engine.ts` | Per-domain L0–L7 grants, blast-radius enforcement, L3+ simulation precondition, hard ceilings (human accountability tokens), auto-demotion, and a global kill switch |
| **Calibration monitor** | `core/autonomy/calibration-monitor.ts` | Self-governing autonomy — watches the calibration flywheel and auto-demotes a domain's grants to L0 when its predictions drift past threshold (learning → governance loop) |
| **Decision Inbox** | `core/projections/decision-inbox.ts` | Rebuildable read-model projection over the event log: decisions needing human attention (queued / escalated), auto-executed awareness items, and reconciliation — the canonical "the log is the source of truth" example |
| **Briefing Engine** | `core/briefing/briefing-engine.ts` | Proactive intelligence — synthesizes the live state (pending decisions, autonomous activity, calibration drift, open risks, autonomy posture) into a single executive briefing |
| **Workflow Engine** | `core/workflow/workflow-engine.ts` | Executes procedural memory as governed action: each step runs through the MCP ABAC gate + audit chain, fail-fast on the first denied/failing step — the procedural-memory → action loop |
| **Worked scenario** | `core/scenarios/churn.ts` | A causal churn subgraph (reorg → onboarding delay → churn spike → ARR) + a sales digital twin, so GraphRAG can walk causal edges to a fully-grounded diagnosis and simulate "restore 2 onboarding FTE → −0.9pt churn" |
| **Persistence** | `core/persistence/file-event-log.ts` | File-backed append-only JSONL event log (a durable `EventSink`); on restart the log replays and every projection rebuilds — proving "the log is the source of truth" survives a restart |
| **HTTP API** | `core/api/server.ts` | Zero-dependency stdlib `http` server exposing the BLUEPRINT §21 REST surface (`/v1/ask`, `/v1/decisions`, `/v1/simulate`, `/v1/autonomy/grants`, `/v1/inbox`, `/v1/stream` SSE, `/v1/events`, `/v1/audit`) |
| **Operator console** | `core/api/dashboard.ts` | Single self-contained HTML page served at `/` — Decision Inbox, live event spine (SSE), a one-click decision runner, and a GraphRAG diagnosis panel that shows the grounded context bundle by retrieval source |
| **Tests** | `core/tests/core.test.ts` | 21 `node:test` invariant tests: mandatory dissent, audit-chain tamper detection, blast-radius, hard ceilings, kill switch, L3+ sim precondition, bitemporal replay, reconciliation, Hebbian reinforcement, sim reproducibility, closed-loop integration |
| **Composition** | `core/index.ts`, `core/demo.ts` | Wires it all together; runnable demo |

The demo shows a multi-agent decision with recorded dissent, a bitemporal decision + reconciliation, an MCP call denied by the autonomy gate, and a verified audit chain.

### The closed loop

A single `olympus.ere.ask(...)` call runs the full autonomous decision pipeline:

```
reason (decompose + ground)
  → simulate the intervention on the digital twin (P10/P50/P90 + tail risk)
  → multi-agent debate with mandatory dissent
  → Risk Agent veto reads the simulated tail downside
  → weighted consensus
  → Autonomy Engine gate (per-domain L0–L7 + blast-radius + L3+ sim precondition)
  → disposition: execute | execute_notify | queue_for_approval | escalate
```

In the demo this auto-executes a budget reallocation at L5 because the simulated downside is within charter and the exposure is inside the blast-radius — but flips to human escalation the moment the Risk Agent sees a severe tail, the amount breaches blast-radius, or a hard ceiling applies.
