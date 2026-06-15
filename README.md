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

## Core Reference Skeleton

A runnable TypeScript skeleton of the core lives in [`core/`](./core). It has **zero runtime dependencies** and ships in-memory implementations behind clean interfaces, so it runs with no API keys and can later be swapped for production backends (Neo4j/FalkorDB, Kafka/Redpanda, Claude models).

```bash
npm install
npm run demo        # end-to-end walkthrough with a deterministic mock LLM
npm run typecheck   # strict TypeScript
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
| **Composition** | `core/index.ts`, `core/demo.ts` | Wires it all together; runnable demo |

The demo shows a multi-agent decision with recorded dissent, a bitemporal decision + reconciliation, an MCP call denied by the autonomy gate, and a verified audit chain.
