# PROJECT OLYMPUS
## The Autonomous Business Operating System — Founder-Grade Blueprint
### Version 1.0 — Founding Document (Designed in 2035)

---

## Prologue: The First-Principle Question

> **"If a business were created today from scratch, and artificial intelligence existed from day one, how would business itself be designed differently?"**

Every piece of business software in existence was designed for a world where the *human* was the only intelligence in the system. Spreadsheets, CRMs, ERPs, BI dashboards, project trackers — they are all **prosthetics for human memory and human coordination**. They store what humans cannot hold in their heads, and they route what humans cannot route by hand. They assume the human is the processor and the software is the disk.

That assumption is now false.

If you started a company today, knowing that machine intelligence is abundant, cheap, and reliable, you would not build a company that *uses* AI. You would build a company that *is* an intelligence — a single coherent reasoning entity that happens to employ humans for judgment, relationship, taste, and accountability, and employs software only as its sensory and motor system.

The org chart would not be a hierarchy of people who pass documents to each other. It would be a **reasoning substrate** — a living model of the business that ingests every signal, maintains an always-current world-model, runs continuous simulations of the future, and surfaces decisions to humans at the exact moment, in the exact framing, with the exact tradeoffs already computed.

The fundamental unit of business software would no longer be the **record** (a row in a table). It would be the **decision** (a node in a reasoning graph, with provenance, alternatives, predicted outcomes, and post-hoc reconciliation).

The fundamental verb would no longer be "store and retrieve." It would be **"reason and act."**

This document specifies that system. We call it **Olympus**.

---

# 1. Executive Summary & Product Vision

## 1.1 What Olympus Is

Olympus is an **Autonomous Business Operating System (ABOS)**: a unified intelligence layer that subsumes the function of every operational software category a company runs today (CRM, ERP, BI, project management, HRIS, financial planning, knowledge management, communications routing) and replaces them with a single, continuously-reasoning system built on three pillars:

1. **The Organizational Knowledge Graph (OKG)** — a temporal, multi-modal model of *everything the business knows*: people, customers, money, products, commitments, decisions, and the causal relationships among them.
2. **The Multi-Agent Executive Layer** — a roster of specialized reasoning agents (an AI executive team) that continuously analyze, debate, simulate, and recommend, operating at human-defined levels of autonomy.
3. **The Autonomy Engine** — a governed action layer that takes graduated, auditable action in the world (L0 read-only through L7 fully autonomous), bounded by policy, simulation, and human oversight.

## 1.2 The One-Sentence Pitch

> Olympus is the operating system for a company that thinks — a single AI-native substrate that replaces your entire business software stack with one reasoning entity that knows everything, simulates the future, and runs operations at the autonomy level you choose.

## 1.3 Why Now (2035 Vantage)

- **Reasoning models** crossed the threshold of *reliable multi-step causal reasoning* with verifiable chains around 2028–2031. Hallucination on grounded enterprise data dropped below human error rates for structured decisions.
- **Inference economics** fell ~3 orders of magnitude (2024→2034), making continuous always-on reasoning over an entire company affordable (a 500-person company's full reasoning substrate now costs less than its old SaaS stack).
- **Context windows and persistent memory** matured: organizations can maintain a coherent, queryable, multi-year world-model rather than stateless prompts.
- **Regulatory frameworks** (EU AI Act successors, US Algorithmic Accountability regimes) standardized auditability, making *governed autonomy* legally tractable.

## 1.4 Target Outcomes (Concrete)

| Metric | Legacy Stack | Olympus Target |
|---|---|---|
| Decision latency (data → recommendation) | 3–14 days | < 5 minutes |
| Software vendors per company (ops) | 80–250 | 1 |
| % of routine ops requiring human action | ~85% | < 20% (at L4) |
| Time-to-insight on cross-functional question | Days (analyst pull) | Seconds |
| Annual SaaS spend (500-person co.) | $2.5M–$6M | $0.9M–$1.8M (Olympus) |
| Onboarding ramp (new exec to full context) | 3–6 months | < 1 week (graph briefing) |

## 1.5 Product Vision (10-Word Form)

**The last business software you will ever need to buy.**

---

# 2. Philosophy & First Principles

## 2.1 The Seven First Principles

**P1 — Intelligence is ambient, not a feature.**
Olympus is not an app with an "AI assistant" bolted on. The intelligence is the substrate; the UI is a thin window onto a reasoning entity that is always running, whether or not anyone is looking.

**P2 — Reason, don't retrieve.**
Legacy "AI" products are retrieval engines: they find the document. Olympus is a reasoning engine: it *derives the answer* from a causal model, shows its work, and can defend it under Socratic challenge.

**P3 — The decision is the atomic unit.**
Not the record, not the document, not the workflow step. Every meaningful state change in a business is a *decision* with: a question, options, evidence, a chosen path, predicted outcomes, a decider (human or agent), and a later reconciliation against reality. Olympus stores decisions as first-class, immutable, replayable objects.

**P4 — Truth is temporal.**
Every fact has a validity interval. "Revenue was $4.2M" is meaningless without *as-of when*. The OKG is bitemporal (valid-time + transaction-time) by default, so the system can reason about what was known when, and replay any decision against the world-state at decision-time.

**P5 — Autonomy is a dial, not a switch.**
Trust is earned per-domain. The system advances from advisory (L0) to autonomous (L7) on a per-capability basis, gated by demonstrated accuracy, blast-radius limits, and explicit human grants.

**P6 — Disagreement is signal.**
A single model's confident answer is dangerous. Olympus institutionalizes adversarial reasoning: a Devil's-Advocate agent and multi-agent debate are *required* for high-stakes decisions. Consensus without dissent is flagged, not celebrated.

**P7 — The system must be able to explain itself to a regulator, a board, and a skeptic — at any time.**
Every recommendation carries full provenance: which facts, which assumptions, which simulations, which agents, which dissent. Explainability is not a report you generate; it is a property of every object.

## 2.2 Design Tenets (Engineering Translation)

- **Append-only by default.** Mutation is modeled as new versions, never overwrites. The past is immutable.
- **Provenance is mandatory.** No fact enters the OKG without a source edge.
- **Simulation precedes action.** No L3+ action executes without a forward simulation of consequences.
- **Humans hold accountability tokens.** Certain decision classes legally require a named human owner; Olympus enforces this in the schema, not just policy.
- **Graceful degradation.** If the reasoning layer is unavailable, the system degrades to a read-only system-of-record — never to a broken state.

---

# 3. Category Creation Strategy

## 3.1 The Category We Create

**Autonomous Business Operating System (ABOS).** Not a "platform," not a "suite," not "AI-powered X." A new top-level category defined by a single claim: *the software runs the business's reasoning, not just its records.*

Category-defining question we force every buyer to ask: **"Does your software know why you made last quarter's decisions, and would it have made them differently?"** No incumbent can answer yes.

## 3.2 Categories Destroyed (and How)

| Legacy Category | Core Job It Did | How Olympus Subsumes It |
|---|---|---|
| **CRM** (Salesforce, HubSpot) | Store customer/deal records, track pipeline | Customers/deals/relationships are OKG nodes; the Sales Agent reasons over them continuously, scores and acts on pipeline, drafts and (at L3+) sends outreach |
| **ERP** (SAP, Oracle, NetSuite) | Resource/finance/supply-chain ledger | Financial, inventory, and resource state are OKG subgraphs with bitemporal ledgers; CFO/COO agents plan and reconcile |
| **BI / Analytics** (Tableau, Power BI, Looker) | Dashboards over warehouse | No dashboards needed — ask any question in natural language; the Reasoning Engine derives the answer with provenance and simulates implications |
| **Project / Work Mgmt** (Jira, Asana, Monday) | Track tasks and dependencies | Work items are OKG nodes linked to objectives and decisions; the Orchestrator agent sequences, assigns, and unblocks work |
| **HRIS / People** (Workday) | Employee records, org structure | People + the living org graph are native; the People Agent reasons over capacity, skills, attrition risk |
| **FP&A / Planning** (Anaplan, Adaptive) | Financial models and forecasts | Continuous simulation replaces static models; forecasts are live, causal, and reconciled |
| **Knowledge Mgmt** (Notion, Confluence) | Store docs | Knowledge is structured into the OKG; documents become evidence edges, not silos |
| **Comms routing / iPaaS** (Zapier, Mulesoft) | Move data between apps | Event bus + MCP connectors; integration is internal |

## 3.3 Strategy: Land via Reasoning, Expand via Autonomy

We do not sell "rip and replace" on day one (suicidal). We **land as the reasoning layer on top of the existing stack** (read-only L0 over connectors), prove unique insight value in 30 days, then progressively **absorb systems of record** as autonomy rises. The incumbents become Olympus's peripheral nervous system, then get amputated category by category as the OKG becomes the source of truth.

## 3.4 Naming & Framing

We refuse the word "tool." Olympus is referred to as the company's **"operating intelligence."** The category page leads with the destruction narrative: *"You don't need 14 dashboards. You need one mind."*

---

# 4. Competitive Moat Analysis

## 4.1 Why Microsoft Cannot Copy It

Microsoft's moat *is* its fragmentation: Dynamics, Office, Teams, Fabric, Copilot are separate P&Ls with separate data models. Olympus's premise — *one unified causal world-model* — is organizationally and architecturally hostile to Microsoft's federated structure. Copilot is a retrieval/assist layer stapled across silos; it cannot reason causally across a single graph because **there is no single graph**. Unifying it would require detonating billions in installed-base data contracts.

## 4.2 Why Salesforce / HubSpot Cannot Copy It

Their entire revenue model and data model are **record-centric and seat-priced**. Olympus is **decision-centric and outcome-priced**. Agentforce-style additions still sit atop the Customer-360 object model — a CRM schema, not a reasoning substrate. Cannibalizing seat revenue to move to outcome pricing is a classic innovator's-dilemma trap they will not voluntarily enter.

## 4.3 Why SAP / Oracle Cannot Copy It

Their moat is *switching cost and process rigidity* — the opposite of what an adaptive reasoning system needs. Their data models encode decades of accreted, version-locked business logic. The OKG's temporal, causal, append-only design is fundamentally incompatible with their relational, mutation-heavy, transaction-table architectures. They sell stability; Olympus sells intelligence. Re-architecting would break their core contractual promise.

## 4.4 Why Startups Cannot Copy It (the Compounding Moat)

The defensibility is not the model (models commoditize). It is:

1. **The OKG data gravity.** Each customer's graph compounds for years — a 3-year-old Olympus deployment knows *why* every decision was made and how it turned out. A competitor starting fresh has an empty, contextless graph. Decision-reconciliation data is the new oil and it is **non-transferable**.
2. **The reconciliation flywheel.** Every prediction → outcome pair improves the customer-specific calibration of the agents. This is private, proprietary, accumulating training signal no competitor can buy.
3. **The autonomy trust ladder.** Trust (L0→L7) is earned over quarters. A new entrant starts at L0 with every customer. The trust relationship is a moat measured in time, not money.
4. **The integration topology.** Olympus's MCP connector mesh and bitemporal ingestion are deeply engineered; replicating the *correctness* (not just connectivity) takes years.

## 4.5 Moat Summary Table

| Moat Type | Strength | Time-to-Replicate |
|---|---|---|
| Architectural (unified causal graph) | Very High | 3–5 yrs (incumbents: structurally blocked) |
| Data gravity (per-customer OKG) | Compounding | Cannot be bought |
| Reconciliation flywheel | Compounding | Cannot be bought |
| Trust ladder (autonomy grants) | High | Measured in quarters per account |
| Outcome-pricing alignment | High (vs incumbents) | Incumbents won't self-cannibalize |

---

# 5. Full System Architecture Overview

## 5.1 Layered Architecture (Text Diagram)

```
┌─────────────────────────────────────────────────────────────────────┐
│  L7  EXPERIENCE LAYER                                                 │
│  Ambient UI · Conversational console · Decision Inbox · Voice/AR      │
├─────────────────────────────────────────────────────────────────────┤
│  L6  EXECUTIVE REASONING ENGINE                                       │
│  Decomposition · Multi-perspective · Synthesis · Socratic probing     │
├─────────────────────────────────────────────────────────────────────┤
│  L5  MULTI-AGENT EXECUTIVE LAYER                                      │
│  CEO·CFO·COO·CTO·Strategy·Sales·Ops·People·Legal·Risk·               │
│  Synthesis·Devil's-Advocate · Orchestrator                            │
├──────────────────────────────┬────────────────────────────────────────┤
│  L4  SIMULATION & DIGITAL     │  L4'  AUTONOMY ENGINE                  │
│  TWIN (Monte Carlo, ABM,      │  (L0–L7 governed action,               │
│  causal inference)            │   policy, blast-radius, approvals)     │
├──────────────────────────────┴────────────────────────────────────────┤
│  L3  MEMORY ARCHITECTURE                                              │
│  Episodic·Semantic·Procedural·Strategic·Operational·Relationship·     │
│  Decision memory · Consolidation engine                               │
├─────────────────────────────────────────────────────────────────────┤
│  L2  ORGANIZATIONAL KNOWLEDGE GRAPH (OKG)  +  RAG (graph-augmented)    │
│  Bitemporal nodes/edges · Vector + graph + relational hybrid          │
├─────────────────────────────────────────────────────────────────────┤
│  L1  DATA ARCHITECTURE                                                │
│  Ingestion · Streaming (event bus) · Storage · Processing             │
├─────────────────────────────────────────────────────────────────────┤
│  L0  INTEGRATION / MCP LAYER  +  SECURITY (zero-trust, RBAC/ABAC)     │
│  Internal MCP · External MCP connectors · Identity · Audit            │
└─────────────────────────────────────────────────────────────────────┘
            ▲                                              ▲
            │  Event Bus (spine, all layers publish)       │
            └──────────────────────────────────────────────┘
```

## 5.2 Core Design Principles of the Architecture

- **Event-sourced spine.** Every layer emits and consumes events on a durable, ordered bus. The OKG is a *projection* of the event log; it can be fully rebuilt.
- **Reasoning is stateless over stateful memory.** Agents are stateless reasoners; all state lives in the OKG/memory layer. This makes agents horizontally scalable and independently upgradable.
- **Simulation is mandatory middleware** between recommendation and action for L3+.
- **Security and MCP are foundational (L0)**, not bolted on — every data access passes through ABAC policy evaluation.

---

# 6. Knowledge Graph Design — The Organizational Knowledge Graph (OKG)

## 6.1 Purpose

The OKG is the single source of truth: a **bitemporal, multi-modal property graph** representing the entire business as nodes (entities) and edges (relationships), each versioned in two time dimensions.

## 6.2 Node Types (Core Ontology)

```
Person          (employees, contacts)
Customer        (accounts, leads)
Deal            (opportunities)
Product         (SKUs, services, features)
Money           (transactions, invoices, budgets, ledger entries)
Objective       (OKRs, goals)
WorkItem        (tasks, projects, initiatives)
Decision        (FIRST-CLASS: question, options, choice, outcome)
Document        (evidence; chunked + embedded)
Event           (anything that happened, time-stamped)
Asset           (physical/digital resources, inventory)
Contract        (legal commitments)
Risk            (identified risks with probability/impact)
Capability      (skills, competencies)
Market          (external segments, competitors)
Agent           (the AI agents themselves are nodes — for auditability)
Policy          (governance rules, autonomy grants)
```

## 6.3 Edge Types (Relationships)

```
EMPLOYS, REPORTS_TO, OWNS, RESPONSIBLE_FOR
INVOLVES, PARTICIPATES_IN, INFLUENCES
CAUSES, CORRELATES_WITH, BLOCKS, DEPENDS_ON
DERIVED_FROM (provenance), EVIDENCED_BY
DECIDED_BY, RECONCILED_AGAINST
RELATES_TO, COMPETES_WITH, SUPPLIES
ALLOCATED_TO, FUNDED_BY, MEASURES
SUPERSEDES (versioning), PREDICTS
```

Every edge carries: `weight` (confidence/strength 0–1), `valid_from`, `valid_to`, `tx_from`, `tx_to`, `source_id`, `created_by` (human/agent).

## 6.4 Temporal Versioning (Bitemporal Model)

Each node/edge has **two independent time axes**:
- **Valid time** (`valid_from`, `valid_to`): when the fact is true *in the real world*.
- **Transaction time** (`tx_from`, `tx_to`): when the system *knew* the fact.

This enables three superpowers:
1. **As-of queries:** "What did we believe our churn rate was on March 1?" (transaction time).
2. **Real-world replay:** "What was actually true in Q1?" (valid time, corrected later).
3. **Decision replay:** evaluate any past decision against the world-state *as it was known at decision time* — essential for fair post-hoc evaluation of agents and humans.

Updates never overwrite: an "update" closes the prior version's `tx_to` and inserts a new version. The graph is append-only.

## 6.5 Traversal & Query

- **Hybrid retrieval:** graph traversal (Cypher-like) + vector similarity (on Document/embedding nodes) + relational aggregation (on Money/ledger).
- **Reasoning traversal:** the Executive Reasoning Engine issues *semantic traversal plans* — e.g., "trace causal chain from churn spike → which Decisions → which Objectives." The engine walks `CAUSES`/`INFLUENCES`/`DERIVED_FROM` edges, scoring paths by edge weight × recency.
- **Indexes:** label+property B-tree indexes; HNSW vector index per embedding namespace; temporal range indexes on `(valid_from, tx_from)`.

## 6.6 Update Mechanisms

1. **Ingestion** (L1) emits domain events → **Graph Projector** consumes → upserts versioned nodes/edges with provenance.
2. **Agent assertions:** agents propose edges (e.g., "this deal `CORRELATES_WITH` that marketing campaign") with confidence; these enter a `proposed` state, validated by the Synthesis agent before promotion.
3. **Reconciliation:** when a `Decision`'s predicted outcome can be measured, a `RECONCILED_AGAINST` edge is written, feeding the calibration flywheel.
4. **Consolidation** (from Memory layer) periodically compresses redundant nodes and strengthens/decays edge weights.

## 6.7 Schema (Property Graph DDL-style)

```cypher
// Node: Decision (first-class)
(:Decision {
  id: UUID,
  question: String,
  domain: Enum[finance, sales, ops, people, strategy, legal, risk, tech],
  options: JSON,            // [{label, predicted_outcome, evidence_ids}]
  chosen_option: String,
  decided_by: ID,           // Person or Agent node
  autonomy_level: Int,      // L0-L7 at which it was made
  confidence: Float,
  predicted_outcome: JSON,
  actual_outcome: JSON,     // filled at reconciliation
  status: Enum[proposed, approved, executed, reconciled, reverted],
  valid_from, valid_to, tx_from, tx_to: Timestamp,
  provenance: [SourceRef]
})
```

---

# 7. AI Architecture

## 7.1 Tiered Model Stack

Olympus routes every cognitive task to the cheapest model that meets the required reliability — a **cognitive router** governs cost/latency/quality.

| Tier | Role | Typical Use | Latency | Relative Cost |
|---|---|---|---|---|
| **T0 — Reflex** | Tiny on-device/edge models | Classification, routing, PII detection, extraction | <50ms | 1× |
| **T1 — Operator** | Mid models | Drafting, summarization, structured extraction, routine ops | ~1s | 10× |
| **T2 — Reasoner** | Frontier reasoning models | Multi-step causal reasoning, planning, debate | 5–30s | 100× |
| **T3 — Deliberator** | Ensemble of frontier reasoners + tools + long deliberation | Board-grade strategy, irreversible high-stakes decisions | minutes | 1000× |

## 7.2 Reasoning Layers

1. **Perception:** parse and ground inputs into OKG references (no free-floating text).
2. **Decomposition:** break questions into sub-questions (tree-of-thought over the graph).
3. **Evidence gathering:** graph-augmented RAG pulls grounded facts with provenance.
4. **Multi-perspective analysis:** route sub-problems to specialized agents.
5. **Synthesis:** reconcile agent outputs, resolve conflicts.
6. **Verification:** Devil's-Advocate challenge + simulation check + Socratic self-probe.
7. **Calibration:** attach confidence; route to appropriate autonomy gate.

## 7.3 Inference Infrastructure

- **Routing:** cognitive router with learned cost/quality model; speculative cascade (try cheap, escalate on low confidence).
- **Serving:** disaggregated prefill/decode, KV-cache reuse keyed on stable OKG context (huge savings — the company's "system prompt" is its graph snapshot and is cached).
- **Determinism mode:** for audited decisions, temperature=0 + seed pinning + full prompt/version hash recorded for replay.
- **Confidence:** ensemble disagreement + self-consistency sampling produces calibrated confidence scores that gate autonomy.

---

# 8. Multi-Agent Architecture

## 8.1 The Agent Roster (The AI Executive Team)

| Agent | Mandate | Reads | Acts on (at autonomy) |
|---|---|---|---|
| **CEO Agent** | Whole-business coherence, goal alignment, tradeoff arbitration | Entire OKG | Sets priorities, arbitrates inter-agent conflict |
| **CFO Agent** | Financial health, cash, forecasting, capital allocation | Money, Contract, Objective | Budgets, forecasts, spend approvals |
| **COO Agent** | Operations, throughput, supply, capacity | WorkItem, Asset, Process | Scheduling, resource allocation |
| **CTO Agent** | Technology, product, infra decisions | Product, Asset(tech) | Architecture, prioritization |
| **Strategy Agent** | Market positioning, long-range bets | Market, Competitor, Objective | Strategic options, scenario planning |
| **Sales Agent** | Pipeline, revenue motion | Customer, Deal | Outreach, scoring, forecasting |
| **Ops Agent** | Day-to-day execution detail | WorkItem | Task routing, unblocking |
| **People Agent** | Talent, capacity, culture, attrition | Person, Capability | Staffing recs, capacity planning |
| **Legal Agent** | Compliance, contracts, risk-of-action | Contract, Policy | Contract review, compliance gating |
| **Risk Agent** | Enterprise risk, blast-radius, downside | Risk, all | Veto power on high-risk actions |
| **Synthesis Agent** | Reconcile multi-agent outputs into one answer | Agent outputs | Produces final recommendation |
| **Devil's-Advocate Agent** | Mandatory adversary; argues the strongest counter-case | The proposed decision | Forces dissent into the record |
| **Orchestrator Agent** | Convenes debates, routes tasks, manages consensus protocol | Meta | Runs the protocol below |

## 8.2 Inter-Agent Protocol (OACP — Olympus Agent Coordination Protocol)

Message envelope (on the event bus):

```json
{
  "msg_id": "uuid",
  "protocol": "OACP/1.0",
  "type": "PROPOSE | CHALLENGE | SUPPORT | VOTE | ESCALATE | RESOLVE",
  "from_agent": "CFO",
  "to": ["Orchestrator"] ,
  "decision_id": "uuid",
  "claim": "Reduce Q3 marketing spend by 18%",
  "evidence": ["okg://decision/...","okg://money/..."],
  "confidence": 0.74,
  "predicted_impact": {"runway_months": "+2.1", "pipeline": "-9%"},
  "dissent": false,
  "ts": "2035-06-15T10:00:00Z"
}
```

## 8.3 Debate & Consensus

1. **Convene:** Orchestrator opens a `DecisionSession` for any decision above a stakes threshold.
2. **Propose:** relevant agents submit proposals with evidence + predicted impact.
3. **Mandatory dissent:** Devil's-Advocate MUST submit a `CHALLENGE` — a session cannot close without recorded counter-argument.
4. **Debate rounds:** bounded N rounds (default 3) of CHALLENGE/SUPPORT.
5. **Risk veto:** Risk Agent can `ESCALATE` to force human review regardless of consensus.
6. **Consensus model:** weighted vote (agent weight = domain relevance × calibrated track record). Quorum + minimum-confidence threshold required.
7. **Synthesis:** Synthesis Agent produces a single recommendation *plus the full dissent record*.
8. **Gate:** routed to the Autonomy Engine for execution or human approval.

Every session is persisted as a `DecisionSession` subgraph — fully replayable.

---

# 9. Memory Architecture

## 9.1 Memory Types

| Type | Contents | Persistence | Example |
|---|---|---|---|
| **Episodic** | Specific events as they happened | Event log (immutable) | "On 2035-03-02 we cut the Acme deal price 12%" |
| **Semantic** | Generalized facts/concepts | OKG nodes/edges | "Enterprise deals close in ~94 days" |
| **Procedural** | How-to / workflows | Procedure store + skills | "How we run a renewal" |
| **Strategic** | Long-horizon goals, bets, theses | Objective subgraph | "Win mid-market by 2037" |
| **Operational** | Current live state | Hot OKG projection | Today's pipeline, cash, capacity |
| **Relationship** | Interpersonal/account context | Person/Customer edges | "VP Sales prefers data-first briefs" |
| **Decision** | Decisions + outcomes + reasoning | Decision subgraph (immutable) | Full DecisionSession records |

## 9.2 Consolidation Engine

Inspired by biological memory consolidation:
- **Hot → Warm → Cold tiers.** Recent episodic memory is hot; consolidation runs nightly to extract semantic facts from episodic streams (e.g., many "deal closed in X days" episodes → updated semantic edge "avg close = N days").
- **Edge weight decay/reinforcement:** unused edges decay; reinforced edges strengthen (Hebbian-style).
- **Conflict resolution:** contradictory facts trigger a `CHALLENGE` to the Synthesis agent rather than silent overwrite.
- **Forgetting policy:** raw episodic detail is summarized and aged out (governed by retention + legal hold), but the *decision* record is never forgotten.

## 9.3 Persistence

- Decision memory & event log: immutable, WORM storage, cryptographically chained (hash-linked for audit).
- Operational memory: in-memory + fast store, rebuildable from event log.
- Semantic/strategic: the OKG (replicated, versioned).

---

# 10. Data Architecture

## 10.1 Ingestion

- **Connectors via MCP** (Section 23): pull/push + webhook/streaming from external systems (email, calendar, banking, payroll, comms, legacy SaaS during migration).
- **Schema mapping:** each source maps to OKG ontology via declarative `IngestionMap` specs; unmapped fields land in a `Document`/raw store for later extraction.
- **Extraction pipeline:** T0/T1 models extract entities/relations from unstructured input → propose OKG edges.

## 10.2 Storage (Polyglot)

| Store | Tech class | Holds |
|---|---|---|
| Graph store | Distributed property graph | OKG nodes/edges (bitemporal) |
| Event log | Append-only log (Kafka-class) | All events (source of truth) |
| Vector store | HNSW/ANN | Embeddings (docs, memory) |
| Columnar warehouse | OLAP | Money/ledger aggregates, BI-style queries |
| Object store | Blob | Raw documents, attachments (WORM for audit) |

## 10.3 Processing & Streaming

- **Event bus** as the spine (Section 22). Stream processors maintain materialized **projections** (e.g., live pipeline, cash position).
- **CDC** from any retained legacy DB into the event stream during migration.
- **Backpressure & ordering:** per-entity ordering guarantees; idempotent projectors keyed on event id.

---

# 11. Security Architecture

## 11.1 Zero-Trust Foundations

- **No implicit trust.** Every request (human or agent) is authenticated, authorized, and continuously verified. Agents have their own cryptographic identities (workload identity) and scoped capabilities.
- **mTLS everywhere**, short-lived tokens, per-call policy evaluation.

## 11.2 RBAC + ABAC

- **RBAC** for coarse roles (Admin, Executive, Manager, IC, Auditor).
- **ABAC** for fine-grained, context-aware decisions: policy = f(subject attrs, resource attrs, action, environment, autonomy grant). Example: "Sales Agent may READ Deal nodes for accounts in its territory, may DRAFT outreach, may SEND only at L≥3 and only ≤$X exposure."
- Policies are themselves OKG `Policy` nodes — versioned and auditable.

## 11.3 Data Sovereignty

- **Tenancy isolation:** per-tenant encryption keys (BYOK/HYOK supported), logical + (optionally) physical isolation.
- **Residency:** deployable in-region (EU, US, sovereign clouds) with data-pinning policies enforced at the storage layer.

## 11.4 Audit Trails

- **Cryptographically chained, append-only audit log** of every read, write, decision, and action — including which agent, which model version, which prompt hash, which policy decision.
- Tamper-evident (hash-linked); exportable for regulators.
- **Decision provenance** doubles as compliance evidence (EU AI Act-style explainability built in).

## 11.5 Action Safety

- Every autonomous action passes an **egress policy gate** + **blast-radius check** + **simulation precondition** before touching the outside world. Kill-switch revokes all agent capabilities instantly (drops to L0).

---

# 12. Infrastructure Architecture

## 12.1 Deployment Modes

| Mode | Use case | Notes |
|---|---|---|
| **Multi-tenant SaaS** | SMB/mid-market | Cheapest, fastest |
| **Single-tenant cloud** | Enterprise | Dedicated VPC, BYOK |
| **Sovereign / in-region** | Regulated, gov | Region-pinned, local inference |
| **Air-gapped on-prem** | Defense, finance | Local model weights, no egress; updates via signed media |

## 12.2 Scaling

- **Stateless reasoning tier** scales horizontally; bounded by inference capacity, not data.
- **OKG sharding** by tenant; within tenant, partition by entity-domain subgraph with cross-shard traversal coordinator.
- **Inference autoscaling** by tier; T3 capacity is reservation-based (expensive), scheduled around DecisionSession demand.
- **Edge:** T0 reflex models run at edge/on-device for latency-critical extraction and PII redaction before data leaves the boundary.

## 12.3 Reliability

- Event log replicated across AZs/regions; OKG rebuildable from log (RPO≈0 via synchronous log replication; RTO target <15 min via projection rebuild from snapshot + tail).
- Graceful degradation to read-only system-of-record if reasoning tier is down.

---

# 13. User Experience Architecture

## 13.1 Interaction Paradigms

1. **Ambient intelligence:** Olympus is always reasoning; it surfaces things *to* you. The primary UX is not search — it is being *briefed*.
2. **The Decision Inbox:** the home surface. A prioritized stream of decisions awaiting human input, each pre-analyzed with options, tradeoffs, recommendation, dissent, and a one-click approve/modify/reject. Replaces dashboards.
3. **Conversational console:** ask anything in natural language; get a reasoned, sourced answer with drill-down into the graph.
4. **Living briefings:** role-specific, auto-generated, always-current (CEO morning brief, CFO cash brief) — generated, not authored.

## 13.2 Interfaces

- Web/desktop console, mobile (Decision Inbox + voice), voice assistant, AR overlay (2030s-native, for ops/field), and an **API/agent interface** so other systems can converse with Olympus.

## 13.3 Trust UX

- Every claim is clickable to its provenance.
- Confidence is always shown (calibrated %).
- Dissent is always visible — you can read what the Devil's-Advocate argued.
- Autonomy controls are first-class UI: per-domain L0–L7 sliders with simulated blast-radius preview.

---

# 14. Workflow & Automation Architecture

## 14.1 Beyond Workflows: Intent → Plan → Act

Legacy automation is brittle "if-this-then-that." Olympus is **goal-directed**: you state intent ("keep DSO under 35 days"), and the Orchestrator + Ops/CFO agents continuously plan and act to maintain it, replanning as the world changes.

## 14.2 Components

- **Goals (Objectives)** are OKG nodes with target metrics.
- **Plans** are agent-generated, simulation-validated sequences of `WorkItem`/actions.
- **Triggers:** event-bus subscriptions (e.g., "invoice overdue").
- **Guards:** policy + blast-radius + autonomy gates before any action.
- **Skills:** reusable, versioned procedural capabilities (e.g., `RunRenewal`, `ReconcileLedger`) that agents compose.

## 14.3 Human-in-the-loop

Each automation declares its autonomy level. Below the granted level, actions become *recommendations* in the Decision Inbox. Above it, they execute and log.

---

# 15. Simulation & Digital Twin Architecture

## 15.1 The Digital Twin of the Business

A continuously-updated executable model of the company derived from the OKG: cash flows, pipeline dynamics, capacity, supply, and their causal links. Every L3+ decision is simulated against this twin before execution.

## 15.2 Methods

- **Monte Carlo:** distributional forecasting (e.g., 10k runs of Q3 cash position given pipeline conversion uncertainty) → P10/P50/P90 outcomes.
- **Agent-based market models (ABM):** simulate customers/competitors as agents to test go-to-market and pricing moves.
- **Causal inference:** structural causal models (do-calculus) over the OKG causal edges to estimate *interventional* effects ("if we cut price 10%, what happens to churn AND margin?") — not mere correlation.
- **Counterfactual replay:** re-run past decisions under alternative choices to learn (feeds reconciliation flywheel).

## 15.3 Output

Each simulation yields a distribution + sensitivity analysis + identified tail risks, attached to the `Decision` node as `predicted_outcome`. The Risk Agent reads tail risk to set vetoes.

## 15.4 Spec (Simulation Request)

```json
{
  "sim_id": "uuid",
  "type": "monte_carlo | abm | causal_intervention | counterfactual",
  "decision_id": "uuid",
  "intervention": {"variable": "list_price", "delta": -0.10},
  "horizon_days": 180,
  "runs": 10000,
  "outputs": ["cash_p10_p50_p90", "churn_delta", "margin_delta", "tail_risks"]
}
```

---

# 16. Organizational Intelligence Architecture (Living Org Graph)

## 16.1 The Living Org

The org is not a static chart — it is a `Person`/`Capability`/`WorkItem` subgraph that updates as people join, skill up, take on work, and form collaboration patterns (derived from comms/work metadata, privacy-respecting).

## 16.2 What It Computes

- **Capacity & load:** who is overloaded, where bottlenecks form.
- **Skill/coverage gaps:** capabilities the objectives need but the org lacks.
- **Attrition risk:** signals from engagement/load patterns (People Agent), with privacy guardrails.
- **Decision-rights map:** who *should* decide what (accountability tokens), surfaced to route decisions correctly.
- **Knowledge concentration risk:** single-points-of-knowledge ("bus factor").

## 16.3 Privacy Guardrails

People-derived intelligence runs under strict ABAC; individual-level inferences are gated, aggregated where possible, and never used for autonomous adverse action against an employee (hard policy).

---

# 17. Executive Reasoning Engine — "Reason, Don't Retrieve"

## 17.1 The Pipeline

```
Question
  → DECOMPOSE  (split into sub-questions; build reasoning tree)
  → GROUND     (graph-augmented RAG; attach provenance)
  → MULTI-PERSPECTIVE  (route subtrees to specialist agents)
  → SIMULATE   (digital twin for any forward-looking sub-claim)
  → SYNTHESIZE (reconcile, resolve conflicts → single thesis)
  → SOCRATIC PROBE (self-interrogate: "what would make this wrong?")
  → DEVIL'S ADVOCATE (mandatory adversary)
  → CALIBRATE  (confidence + autonomy gate)
  → ANSWER     (thesis + evidence + dissent + confidence)
```

## 17.2 Decomposition

Tree-of-thought / least-to-most decomposition over the graph: complex questions are recursively split until each leaf is answerable from grounded OKG facts or a single simulation.

## 17.3 Multi-Perspective Analysis

The same sub-question is examined through CFO/COO/Risk/Strategy lenses; divergence is explicitly surfaced, not averaged away.

## 17.4 Synthesis

Conflicts resolved by evidence weight + agent calibration + recency; unresolved high-stakes conflicts escalate to humans.

## 17.5 Socratic Probing

The engine generates and answers its own hardest questions ("What assumption, if false, breaks this?") before finalizing. This is a required step, logged.

---

# 18. Autonomy Levels L0–L7

| Level | Name | Behavior | Human Role | Example Grant |
|---|---|---|---|---|
| **L0** | Observe | Read-only; surfaces insight only | All actions human | New deployment, sensitive domains |
| **L1** | Advise | Recommends with reasoning; no action | Human executes | Strategy recs |
| **L2** | Draft | Prepares artifacts (emails, plans, budgets) for approval | Human approves & sends | Sales outreach drafts |
| **L3** | Act-with-approval | Executes after explicit human approval per action | Per-action approval | Sending invoices reminders |
| **L4** | Act-within-bounds | Acts autonomously within policy/blast-radius; human notified | Exception review | Routine ops, scheduling, ≤$X spend |
| **L5** | Act-and-report | Acts; batched periodic human review | Periodic audit | Full pipeline ops, vendor payments ≤threshold |
| **L6** | Self-govern | Acts and adjusts own sub-policies within charter | Charter review | Whole-function ops (e.g., collections) |
| **L7** | Autonomous | Full domain ownership incl. some strategic moves within mandate | Board-level oversight | Mature, high-trust domains only |

## 18.1 Governance of Autonomy

- **Per-domain, per-capability** grants (never a global "go autonomous").
- **Promotion criteria:** demonstrated calibration (predicted vs actual accuracy ≥ threshold over N decisions), zero policy violations, blast-radius caps.
- **Demotion triggers:** accuracy drift, anomaly, policy breach → automatic drop to L0 + alert.
- **Hard ceilings:** certain decision classes (firing, fundraising, M&A, legal admissions) capped at L2 by default and require human accountability tokens regardless of trust.
- **Kill switch:** instant global revert to L0.

---

# 19. Technical Specifications

## 19.1 Core API Surface (overview)

- `POST /v1/ask` — reasoned Q&A over OKG (returns thesis + provenance + confidence).
- `POST /v1/decisions` — open a DecisionSession.
- `GET /v1/decisions/{id}` — full session (options, debate, dissent, outcome).
- `POST /v1/simulate` — run digital-twin simulation.
- `GET /v1/graph/query` — graph/hybrid query.
- `POST /v1/autonomy/grants` — set per-domain autonomy level.
- `GET /v1/inbox` — Decision Inbox feed.
- WebSocket `/v1/stream` — live events/briefings.

## 19.2 Event Bus

Kafka-class, topic-per-domain, exactly-once projection semantics, schema-registry-governed Avro/Protobuf envelopes.

## 19.3 MCP

Internal MCP (agents ↔ tools/graph) and external MCP (connectors). See Sections 22–23.

---

# 20. Database Schemas (Core Entities)

```sql
-- Bitemporal base columns appear on every table
-- valid_from, valid_to, tx_from, tx_to TIMESTAMPTZ; source_id UUID; created_by UUID

CREATE TABLE person (
  id UUID PRIMARY KEY,
  name TEXT, email CITEXT, role TEXT,
  reports_to UUID REFERENCES person(id),
  capabilities JSONB,           -- [{skill, level}]
  valid_from TIMESTAMPTZ, valid_to TIMESTAMPTZ,
  tx_from TIMESTAMPTZ, tx_to TIMESTAMPTZ, source_id UUID
);

CREATE TABLE customer (
  id UUID PRIMARY KEY, name TEXT, segment TEXT,
  health_score NUMERIC(4,3),    -- 0..1, agent-derived
  arr NUMERIC, owner_id UUID REFERENCES person(id),
  valid_from TIMESTAMPTZ, valid_to TIMESTAMPTZ,
  tx_from TIMESTAMPTZ, tx_to TIMESTAMPTZ, source_id UUID
);

CREATE TABLE deal (
  id UUID PRIMARY KEY, customer_id UUID REFERENCES customer(id),
  stage TEXT, amount NUMERIC, close_prob NUMERIC(4,3),
  predicted_close DATE, owner_id UUID,
  valid_from TIMESTAMPTZ, valid_to TIMESTAMPTZ,
  tx_from TIMESTAMPTZ, tx_to TIMESTAMPTZ, source_id UUID
);

CREATE TABLE ledger_entry (        -- Money node
  id UUID PRIMARY KEY, account TEXT, amount NUMERIC,
  currency CHAR(3), kind TEXT,      -- revenue/expense/transfer
  related_entity UUID,
  occurred_at TIMESTAMPTZ,
  valid_from TIMESTAMPTZ, valid_to TIMESTAMPTZ,
  tx_from TIMESTAMPTZ, tx_to TIMESTAMPTZ, source_id UUID
);

CREATE TABLE objective (
  id UUID PRIMARY KEY, title TEXT, metric TEXT,
  target NUMERIC, current NUMERIC, horizon DATE,
  parent_id UUID REFERENCES objective(id),
  valid_from TIMESTAMPTZ, valid_to TIMESTAMPTZ,
  tx_from TIMESTAMPTZ, tx_to TIMESTAMPTZ, source_id UUID
);

CREATE TABLE decision (            -- first-class
  id UUID PRIMARY KEY, question TEXT, domain TEXT,
  options JSONB, chosen_option TEXT,
  decided_by UUID, autonomy_level SMALLINT,
  confidence NUMERIC(4,3),
  predicted_outcome JSONB, actual_outcome JSONB,
  status TEXT,                      -- proposed/approved/executed/reconciled/reverted
  session_id UUID,
  valid_from TIMESTAMPTZ, valid_to TIMESTAMPTZ,
  tx_from TIMESTAMPTZ, tx_to TIMESTAMPTZ, source_id UUID
);

CREATE TABLE decision_session (    -- the debate record
  id UUID PRIMARY KEY, decision_id UUID REFERENCES decision(id),
  participants TEXT[], rounds JSONB,  -- full OACP transcript
  dissent JSONB, consensus_score NUMERIC(4,3),
  risk_veto BOOLEAN,
  tx_from TIMESTAMPTZ, tx_to TIMESTAMPTZ
);

CREATE TABLE edge (                -- generic OKG edge
  id UUID PRIMARY KEY, src UUID, dst UUID, type TEXT,
  weight NUMERIC(4,3),
  valid_from TIMESTAMPTZ, valid_to TIMESTAMPTZ,
  tx_from TIMESTAMPTZ, tx_to TIMESTAMPTZ,
  source_id UUID, created_by UUID
);

CREATE TABLE audit_log (           -- hash-chained
  seq BIGSERIAL PRIMARY KEY, ts TIMESTAMPTZ,
  actor UUID, actor_kind TEXT,      -- human/agent
  action TEXT, resource UUID,
  policy_decision TEXT, model_version TEXT, prompt_hash TEXT,
  prev_hash BYTEA, this_hash BYTEA  -- tamper-evident chain
);

CREATE TABLE policy (
  id UUID PRIMARY KEY, name TEXT, abac_rule JSONB,
  autonomy_ceiling SMALLINT, domain TEXT,
  valid_from TIMESTAMPTZ, valid_to TIMESTAMPTZ,
  tx_from TIMESTAMPTZ, tx_to TIMESTAMPTZ
);
```

---

# 21. API Specifications

## 21.1 Reasoned Q&A

```http
POST /v1/ask
{ "question": "Why did mid-market churn rise in Q2, and what should we do?",
  "depth": "deliberate" }   // reflex | operate | reason | deliberate
```
```json
200 OK
{
  "thesis": "Mid-market churn rose 3.1pts in Q2, primarily (62% attributable) to onboarding delays following the support reorg on 2035-04-01.",
  "confidence": 0.81,
  "evidence": [
    {"ref":"okg://decision/9f2…","claim":"Support reorg reduced onboarding capacity 22%"},
    {"ref":"okg://customer-cohort/q2","claim":"Delayed-onboarding cohort churned 4.4x baseline"}
  ],
  "recommendation": {"action":"Restore 2 onboarding FTE; simulate -1.9pt churn","sim_id":"…"},
  "dissent": "Devil's-Advocate: 38% of churn is macro/competitive, FTE restore may underdeliver.",
  "autonomy_gate": "L1 (advisory) — exceeds blast-radius for auto-action"
}
```

## 21.2 Open Decision Session

```http
POST /v1/decisions
{ "question":"Cut Q3 marketing spend 18%?", "domain":"finance", "stakes":"high" }
```
```json
201 Created
{ "decision_id":"…", "session_id":"…", "status":"proposed",
  "convening_agents":["CFO","Strategy","Risk","DevilsAdvocate"] }
```

## 21.3 GraphQL (read model)

```graphql
query {
  customer(id:"...") {
    name healthScore arr
    deals(stage: OPEN) { amount closeProb predictedClose }
    influencedBy: edges(type: CAUSES) { src { ... on Decision { question } } }
  }
}
```

## 21.4 Autonomy Grant

```http
PUT /v1/autonomy/grants
{ "domain":"collections", "capability":"send_dunning", "level":4,
  "blast_radius":{"max_amount":50000,"max_per_day":200} }
```

---

# 22. Event-Driven Architecture

## 22.1 Event Taxonomy

```
fact.*        ingested external facts (fact.invoice.created)
okg.*         graph mutations (okg.node.versioned, okg.edge.added)
decision.*    decision.opened/proposed/approved/executed/reconciled
agent.*       OACP messages (agent.proposed/challenged/voted)
sim.*         sim.requested/completed
action.*      action.requested/gated/executed/failed
autonomy.*    autonomy.granted/revoked/auto_demoted
audit.*       (mirrored to hash-chained audit log)
```

## 22.2 The Bus

- Durable, ordered (per-key), exactly-once projections, schema-registry governed.
- Source of truth = the log; OKG and read models are **projections** rebuildable from the log.

## 22.3 Projections

Materialized views: live pipeline, cash position, capacity heatmap, Decision Inbox, briefings. Each projector is idempotent and independently rebuildable.

---

# 23. MCP Architecture (Model Context Protocol Layer)

## 23.1 Internal MCP

Agents access the OKG, memory, simulation, and skills through internal MCP servers exposing typed tools:
- `okg.query`, `okg.assert_edge`, `memory.recall`, `sim.run`, `skill.invoke`.
- Every tool call is policy-gated (ABAC) and audited.

## 23.2 External MCP (Connectors)

Bidirectional connectors to the outside world (email, banking, payroll, comms, legacy SaaS during migration) implemented as MCP servers with declarative `IngestionMap` and `ActionMap`.
- **Read tools** ingest facts; **write tools** are the *only* path for autonomous action and pass through the egress gate.

## 23.3 Spec (tool descriptor)

```json
{ "server":"mcp://banking",
  "tool":"create_payment",
  "side_effect":"external_write",
  "requires_autonomy":">=4",
  "blast_radius_fields":["amount"],
  "input_schema":{"payee":"string","amount":"number","currency":"string"},
  "audit":"mandatory" }
```

---

# 24. RAG Architecture (Graph-Augmented, Multi-Modal)

## 24.1 GraphRAG, not naive RAG

Retrieval combines:
1. **Graph traversal** — pulls structurally relevant subgraph around the query entities (with provenance and temporal filtering).
2. **Vector search** — semantic recall over Document/memory embeddings.
3. **Relational aggregation** — exact numbers from the columnar store (no LLM math on raw money).

These are fused into a **grounded context bundle** with explicit provenance for every fact. The reasoning engine may *only* assert claims traceable to this bundle (anti-hallucination contract).

## 24.2 Multi-Modal

Embeddings span text, tables, charts, and (2030s-native) voice/meeting transcripts and diagrams; modality-specific encoders feed a shared retrieval namespace.

## 24.3 Temporal-Aware Retrieval

Retrieval respects as-of constraints so a decision replay sees only what was known then.

---

# 25. Deployment Architecture

- **Control plane** (multi-tenant): identity, billing, model routing, policy registry.
- **Data plane** (per-tenant): OKG, event log, projections, inference — isolatable to single-tenant/sovereign/air-gapped.
- **Inference plane:** tiered model fleet (T0 edge → T3 reserved), cognitive router, KV-cache layer keyed on OKG snapshot.
- **CI/CD:** agents and skills are versioned artifacts; canary rollout with shadow-mode evaluation (new agent version runs in parallel, decisions compared before promotion).
- **DR:** synchronous log replication (RPO≈0), projection rebuild (RTO<15min).

---

# 26. Monetization Strategy

## 26.1 Pricing Pillars (Hybrid)

1. **Platform fee (base):** per-tenant, tiered by company size & data volume.
2. **Reasoning/usage:** metered on T2/T3 deliberation (the expensive cognition), pooled credits.
3. **Outcome-linked:** a share of measured, attributable value (e.g., % of churn reduction or cash recovered) — uniquely enabled by the reconciliation flywheel proving attribution.
4. **Autonomy premium:** higher tiers unlock higher autonomy levels (L4+ governance, simulation guarantees, SLAs).
5. **Marketplace:** third-party Skills/connectors; Olympus takes 15–25% rev-share.

## 26.2 Tiers (illustrative)

| Tier | Target | Base / yr | Autonomy cap | Reasoning included |
|---|---|---|---|---|
| **Pilot** | <50 ppl | $60k | L2 | limited T2 |
| **Operate** | 50–500 | $300k–$900k | L4 | pooled T2/T3 |
| **Autonomous** | 500–5k | $900k–$4M | L6 | high pool + SLA |
| **Sovereign** | enterprise/gov | $4M+ custom | L7 (per-domain) | dedicated + air-gap |

## 26.3 Unit Economics (mid-market, 500-person account, illustrative)

- ACV: ~$600k base + ~$120k usage + ~$180k outcome = **~$900k**.
- COGS: inference ~$140k (cache-optimized) + infra ~$60k + support ~$50k = ~$250k → **~72% gross margin**, rising as inference deflates.
- CAC (CEO-to-CEO, long cycle): ~$220k; **payback ~5 months** on first-year ACV; net revenue retention target **>140%** (autonomy/usage expansion).
- LTV/CAC target **> 8** by year 3 (data-gravity retention).

---

# 27. Go-To-Market Strategy

## 27.1 Phased GTM

**Phase 1 — The Insight Wedge (Land, L0–L1).** Sell the reasoning layer over the existing stack. 30-day proof: connect read-only, deliver 3 cross-functional insights no incumbent tool could. Buyer: CEO/CFO, not IT. Motion: **CEO-to-CEO** — founder-led, board-room narrative ("one mind, not 14 dashboards").

**Phase 2 — The Operating Layer (Expand, L2–L4).** Earn trust via reconciliation accuracy; turn on drafting then bounded autonomy in one function (collections or pipeline ops) with hard blast-radius. Begin absorbing one system of record.

**Phase 3 — The OS (Replace, L5–L7).** As the OKG becomes truth, decommission legacy categories one by one. Outcome-pricing kicks in. Land-and-expand within the org and across the customer's portfolio.

## 27.2 Beachhead

High-decision-density, data-rich, mid-market companies in financially-quantifiable domains (B2B SaaS, fintech, logistics) where attribution is clean and outcome pricing is provable.

## 27.3 Channel

Founder-led enterprise sales early; later a partner ecosystem (SIs for migration) + Skills marketplace for self-serve expansion.

---

# 28. 10-Year Roadmap (2026–2035)

| Year | Capability Threshold | Autonomy Frontier | Milestone |
|---|---|---|---|
| **2026** | OKG + ingestion + reasoned Q&A over connected stack | L0–L1 | First 10 design partners; insight wedge proven |
| **2027** | Multi-agent debate + Decision Inbox + simulation v1 | L2 (draft) | $5M ARR; reconciliation flywheel live |
| **2028** | Bounded autonomy in 1 function; outcome pricing pilot | L3–L4 | First fully-automated collections/pipeline ops |
| **2029** | Digital twin + causal inference at scale | L4 | Replace first legacy category (BI) for cohort |
| **2030** | Cross-functional autonomy; sovereign deploy | L5 | $75M ARR; air-gapped gov/finance wins |
| **2031** | Self-governing function charters; marketplace | L6 (scoped) | CRM+PM categories replaced for many accounts |
| **2032** | Strategic simulation board-grade; multi-entity portfolios | L6 | $250M ARR; ERP displacement begins |
| **2033** | Whole-stack OS for mid-market; agent app ecosystem | L6–L7 (mature domains) | Category leadership established |
| **2034** | Autonomous enterprise reference deployments | L7 (per-domain) | $750M ARR; profitability |
| **2035** | The default operating intelligence for new companies | L7 broad | "Born-on-Olympus" companies; IPO-ready |

---

# Appendix A — Founding Team Requirements

| Role | Profile | Why critical |
|---|---|---|
| **CEO / Category Founder** | Visionary operator; can run CEO-to-CEO sales; tells the destruction narrative | Category creation is a narrative act |
| **Chief Architect (CTO)** | Deep distributed-systems + ML systems; built event-sourced, bitemporal systems at scale | The OKG/event spine is do-or-die |
| **Head of AI / Reasoning** | Frontier reasoning, multi-agent systems, eval/calibration | The "reason, don't retrieve" promise |
| **Head of Trust & Governance** | Security + compliance + AI governance (ex-regulator a plus) | Autonomy is unsellable without it |
| **Founding Product** | Enterprise + AI-native UX (Decision Inbox, ambient) | UX is the moat's surface |
| **Founding GTM** | Enterprise sales leader, outcome-pricing experience | Phased land-expand-replace |

Initial team: **8–12** elite people. Bias: systems engineers over app engineers; few but exceptional.

# Appendix B — Capital Requirements

| Round | Amount | Use | Milestone to raise next |
|---|---|---|---|
| **Seed** | $12–18M | Team of 12, OKG + reasoning v1, 10 design partners | L1 insight wedge proven, $1M ARR |
| **Series A** | $40–60M | Multi-agent + autonomy L2–L4, GTM team | $10M ARR, L4 in production |
| **Series B** | $120–180M | Scale, sovereign/air-gap, marketplace | $75M ARR, category leadership |
| **Series C+** | $300M+ | Global, ERP displacement, profitability path | $250M ARR |

Note: inference is the largest variable cost; reserve capital and engineering for cache/router efficiency — it is a gross-margin lever worth points of valuation. Total to profitability: **~$500–600M** over ~7 years; capital-intensive but defensible.

# Appendix C — Founding Document Summary

**Mission:** Build the operating intelligence that lets a business think — replacing the entire operational software stack with one reasoning entity.

**Thesis:** When intelligence is abundant, the company itself is software. The winner builds the *substrate* (OKG + reasoning + governed autonomy), not another app. Defensibility compounds in per-customer decision data and earned trust — neither buyable.

**Non-negotiables:** (1) Reason, don't retrieve. (2) The decision is atomic and immutable. (3) Truth is temporal. (4) Autonomy is earned, governed, and reversible. (5) Dissent is mandatory. (6) Everything is explainable to a regulator, a board, and a skeptic.

**What we will not do:** Sell a "copilot." Average away disagreement. Take autonomous adverse action against an individual. Ship action without simulation. Overwrite the past.

**The bet:** Whoever owns the company's causal world-model and its trusted autonomy owns the next era of business software. That is Olympus.

---

*End of Founding Blueprint v1.0.*
