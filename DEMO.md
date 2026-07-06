# Olympus — 2-Minute Walkthrough

This is a guided tour of the runnable reference core. Everything below works
with **zero API keys** and **zero runtime dependencies** — a deterministic mock
LLM stands in for Claude, and all stores are in-memory (with an optional
file-backed durable log).

```bash
npm install
npm run demo     # the full narrative, printed
npm test         # 133 invariant tests
npm run serve    # the live operator console at http://localhost:7777
```

---

## Act I — Finance: the closed loop

A single `ask()` runs the entire autonomous decision pipeline:

```
reason (decompose + ground)
  → simulate the intervention on the digital twin (P10/P50/P90 + tail risk)
  → multi-agent debate with mandatory dissent
  → Risk Agent veto reads the simulated tail downside
  → weighted consensus
  → Autonomy Engine gate (per-domain L0–L7 + blast-radius + L3+ sim precondition)
  → disposition: execute | execute_notify | queue_for_approval | escalate
```

```bash
curl -s -XPOST localhost:7777/v1/ask -d '{
  "question":"Cut Q3 marketing spend 18%?","domain":"finance",
  "options":["cut-18pct","hold"],"capability":"reallocate_budget",
  "intervention":{"variable":"marketing_spend","delta":-0.18},
  "exposureAmount":162000,"simSeed":7
}'
```

```jsonc
{
  "thesis": "Auto-executed: cut-18pct (consensus 0.73, L5).",
  "confidence": 0.73,
  "evidence": [
    { "ref": "okg://decision/…", "claim": "Decision session record" },
    { "ref": "sim://…", "claim": "Simulated q3_cash_usd: P10/P50/P90 = …, tail …" }
  ],
  "recommendation": "cut-18pct",
  "dissent": "…",                      // mandatory — the session can't close without it
  "autonomyGate": "L5 — execute"        // within charter + blast-radius → autonomous
}
```

It auto-executes **only** because the simulated downside is within charter and
the $162k exposure is inside the blast-radius. Breach either — a severe tail, an
amount over the limit, or a hard-ceiling capability — and the same call flips to
`queue_for_approval` or `escalated_to_human`.

It then lands in the **Decision Inbox**, a read model rebuilt purely from the
event log:

```bash
curl -s localhost:7777/v1/inbox | jq '.stats'
# { "total": 1, "pending": 0, "autoExecuted": 1, "resolved": 0 }
```

---

## Act II — Sales: diagnose churn with grounded causality

A worked scenario seeds a causal subgraph
(`support reorg → onboarding delay → churn spike → ARR`) plus a sales twin.
`/v1/diagnose` runs **GraphRAG**: it walks the causal edges and fuses four
retrieval streams into one **fully-grounded** bundle — every fact carries a
provenance ref (the anti-hallucination contract).

```bash
curl -s -XPOST localhost:7777/v1/diagnose -d '{
  "query":"why did mid-market churn rise onboarding",
  "embedding":[0.85,0.25,0.3,0.48]
}' | jq '{grounded:.fullyGrounded, facts:[.facts[]|{source,score}]}'
```

```jsonc
{
  "grounded": true,
  "facts": [
    { "source": "graph",     "score": 1 },     // reorg + churn-spike nodes (causal traversal)
    { "source": "vector",    "score": 0.998 }, // churn postmortem document
    { "source": "aggregate", "score": 0.9 },   // ARR at risk (exact, no LLM arithmetic)
    { "source": "semantic",  "score": 0.85 }   // reinforced belief: onboarding SLA = 21d
  ]
}
```

The sales twin then quantifies the fix — restoring 2 onboarding FTE simulates a
**−0.9pt** churn reduction (P50 1.75 → 0.85).

---

## Governance — the guardrails, in isolation

The Autonomy Engine is the safety spine. Each of these is locked by a test:

| Scenario | Disposition |
|---|---|
| In-bounds L4 action with a simulation | `execute_notify` |
| Amount over blast-radius | `queue_for_approval` |
| L3+ action with **no** simulation | `deny` (sim precondition) |
| `terminate_employee` without a human accountability token | `deny` (hard ceiling) |
| After the global kill switch | `advise_only` (everything → L0) |

Every tool call also flows through the **MCP ABAC gate** and is written to a
**tamper-evident, SHA-256 hash-chained audit log**:

```bash
curl -s localhost:7777/v1/audit | jq '.valid'   # true; flips to false if any record is altered
```

---

## Durability — the log is the source of truth

Set `OLYMPUS_LOG` to persist every event to an append-only JSONL file. On
restart, the log replays and all read models (OKG, Decision Inbox) rebuild from
it — no other persistence required.

```bash
OLYMPUS_LOG=/tmp/olympus.log npm run serve     # session 1: persists as it runs
# … make a decision …  then restart:
OLYMPUS_LOG=/tmp/olympus.log npm run serve     # "Durable log: … (replayed N events)"
curl -s localhost:7777/v1/inbox | jq '.stats'  # identical to before the restart
```

---

## A fully-seeded company

`npm run serve` boots a complete, deterministic demo company — **Helios
Robotics**, a mid-stage SaaS startup — so the console isn't empty on first load.
Every business module is populated: the financial ledger, the CRM deal pipeline,
the risk register, SLA tracking, capacity planning, and OKRs.

This drives the console's **Company Health** hero and the **Business Modules**
grid immediately. The health score is a single composite (0–100) rolled up from
six weighted dimensions:

| Dimension | Driven by |
|---|---|
| financial | runway months from the ledger |
| risk | top residual risk scores |
| growth | weighted-ARR pipeline vs target |
| reliability | fraction of SLAs healthy |
| capacity | fraction of resources not overallocated |
| goals | average OKR attainment |

```bash
npm run serve
curl -s localhost:7777/v1/health | jq '{score:.score, grade:.grade}'
```

To start from an empty world instead, set `OLYMPUS_NO_SEED=1`:

```bash
OLYMPUS_NO_SEED=1 npm run serve
```

---

## The live console

Open **http://localhost:7777/** for the operator console:

- **Decision Inbox** with live stats and status tags.
- **Event Spine** streaming over Server-Sent Events as decisions flow.
- **Run a decision** — fires Act I and watches it cascade through both panels.
- **GraphRAG Diagnosis** — type a question, see the grounded bundle by source.

That's the whole system: one continuously-reasoning brain that grounds every
claim, debates with mandatory dissent, simulates before it acts, acts only
within an explicit charter, and writes an auditable, replayable record of
everything it does.
