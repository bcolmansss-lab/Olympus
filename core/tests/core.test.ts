/**
 * Olympus core invariant tests.
 * Run with: npm test
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";

import { EventBus } from "../events/event-bus.js";
import { OKG } from "../knowledge/graph/okg.js";
import { MockLLM } from "../llm/client.js";
import { AutonomyEngine } from "../autonomy/autonomy-engine.js";
import { OlympusMCPServer } from "../mcp/olympus-mcp-server.js";
import { MemoryStore } from "../memory/memory-store.js";
import { DigitalTwin } from "../simulation/digital-twin.js";
import { defaultRoster } from "../agents/executive-agent.js";
import { Orchestrator } from "../agents/orchestrator/orchestrator.js";
import type { AgentContext, DecisionBrief } from "../agents/types.js";
import { Olympus } from "../index.js";
import { AnomalyDetector } from "../anomaly/anomaly-detector.js";
import type { AutonomyLevel } from "../autonomy/autonomy-engine.js";
import { seedChurnScenario } from "../scenarios/churn.js";
import { seedPricingScenario, PRICING_SCENARIO_SEED } from "../scenarios/pricing.js";
import { seedHiringScenario, HIRING_SCENARIO_SEED } from "../scenarios/hiring.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(bus: EventBus, okg: OKG, autonomy: AutonomyEngine): AgentContext {
  return { bus, okg, llm: new MockLLM(), autonomy };
}

function makeBrief(okg: OKG, overrides: Partial<DecisionBrief> = {}): DecisionBrief {
  const d = okg.addDecision(
    { question: "Test?", domain: "strategy", options: [{ label: "yes" }, { label: "no" }], autonomyLevel: 1, status: "proposed" },
    "test",
  );
  return { decisionId: d.id, question: "Test?", domain: "strategy", options: ["yes", "no"], ...overrides };
}

// ---------------------------------------------------------------------------
// 1. Mandatory dissent
// ---------------------------------------------------------------------------

describe("Orchestrator — mandatory dissent", () => {
  it("throws when no CHALLENGE message is produced", async () => {
    const bus = new EventBus();
    const okg = new OKG(bus);
    const autonomy = new AutonomyEngine(bus);
    const ctx = makeCtx(bus, okg, autonomy);

    // A roster with no Devil's Advocate — only two vanilla domain agents.
    const { ExecutiveAgent } = await import("../agents/executive-agent.js");
    const skeletonRoster = [
      new ExecutiveAgent("a1", "AgentA", "finance", "Maximize financial health"),
      new ExecutiveAgent("a2", "AgentB", "sales", "Maximize revenue"),
    ];
    const orch = new Orchestrator(skeletonRoster, ctx);
    const brief = makeBrief(okg);

    await assert.rejects(
      () => orch.runSession(brief),
      /OACP violation.*dissent/i,
    );
  });

  it("succeeds when the full default roster (with Devil's Advocate) is used", async () => {
    const bus = new EventBus();
    const okg = new OKG(bus);
    const autonomy = new AutonomyEngine(bus);
    const ctx = makeCtx(bus, okg, autonomy);
    const orch = new Orchestrator(defaultRoster(), ctx);
    const brief = makeBrief(okg);

    const session = await orch.runSession(brief);
    assert.ok(session.dissent.length > 0, "dissent must be recorded");
  });
});

// ---------------------------------------------------------------------------
// 2. MCP audit chain
// ---------------------------------------------------------------------------

describe("OlympusMCPServer — audit chain", () => {
  let mcp: OlympusMCPServer;

  before(async () => {
    const bus = new EventBus();
    const okg = new OKG(bus);
    mcp = new OlympusMCPServer(okg, bus);
    // Invoke a couple of allowed tools to populate the chain.
    await mcp.invoke("okg.query", { type: "Decision" }, { id: "cfo", kind: "agent", autonomyLevel: 2 });
    await mcp.invoke("okg.query", { type: "Money" }, { id: "cfo", kind: "agent", autonomyLevel: 2 });
  });

  it("verifyAuditChain() returns true on untampered log", () => {
    assert.equal(mcp.verifyAuditChain(), true);
  });

  it("verifyAuditChain() returns false after tampering with a record", () => {
    // Peek at internal log and mutate one field.
    const log = mcp.auditLog();
    assert.ok(log.length >= 2);
    // Cast through unknown to simulate external tampering of a sealed record.
    (log[0] as unknown as Record<string, unknown>)["actor"] = "tampered";
    assert.equal(mcp.verifyAuditChain(), false);
  });
});

// ---------------------------------------------------------------------------
// 3. Autonomy engine — blast-radius
// ---------------------------------------------------------------------------

describe("AutonomyEngine — blast-radius", () => {
  it("queues for approval when amount exceeds maxAmount", () => {
    const bus = new EventBus();
    const ae = new AutonomyEngine(bus);
    ae.setGrant({ domain: "finance", capability: "pay_invoice", level: 4, blastRadius: { maxAmount: 10_000, maxPerDay: 5 } });

    const result = ae.evaluate({
      decisionId: "d1",
      domain: "finance",
      capability: "pay_invoice",
      attemptedLevel: 4 as AutonomyLevel,
      amount: 50_000,   // exceeds maxAmount
      simulated: true,
    });
    assert.equal(result.disposition, "queue_for_approval");
  });

  it("executes when amount is within blast-radius", () => {
    const bus = new EventBus();
    const ae = new AutonomyEngine(bus);
    ae.setGrant({ domain: "finance", capability: "pay_invoice", level: 4, blastRadius: { maxAmount: 100_000, maxPerDay: 5 } });

    const result = ae.evaluate({
      decisionId: "d2",
      domain: "finance",
      capability: "pay_invoice",
      attemptedLevel: 4 as AutonomyLevel,
      amount: 9_000,
      simulated: true,
    });
    assert.ok(result.disposition === "execute" || result.disposition === "execute_notify");
  });
});

// ---------------------------------------------------------------------------
// 4. Autonomy engine — hard ceiling
// ---------------------------------------------------------------------------

describe("AutonomyEngine — hard ceiling", () => {
  it("denies terminate_employee without humanAccountabilityToken regardless of grant", () => {
    const bus = new EventBus();
    const ae = new AutonomyEngine(bus);
    ae.setGrant({ domain: "people", capability: "terminate_employee", level: 6 });

    const result = ae.evaluate({
      decisionId: "d3",
      domain: "people",
      capability: "terminate_employee",
      attemptedLevel: 6 as AutonomyLevel,
      simulated: true,
    });
    assert.equal(result.disposition, "deny");
  });

  it("allows terminate_employee when humanToken is supplied at the ceiling level", () => {
    const bus = new EventBus();
    const ae = new AutonomyEngine(bus);
    ae.setGrant({ domain: "people", capability: "terminate_employee", level: 2 });

    const result = ae.evaluate({
      decisionId: "d4",
      domain: "people",
      capability: "terminate_employee",
      attemptedLevel: 2 as AutonomyLevel,  // at ceiling, so no token required
      simulated: true,
      humanToken: "hr-manager-token-abc",
    });
    // Should not be "deny" — ceiling is L2, grant is L2.
    assert.notEqual(result.disposition, "deny");
  });
});

// ---------------------------------------------------------------------------
// 5. Autonomy engine — kill switch
// ---------------------------------------------------------------------------

describe("AutonomyEngine — kill switch", () => {
  it("drops all capabilities to advise_only at L0 after killSwitch()", () => {
    const bus = new EventBus();
    const ae = new AutonomyEngine(bus);
    ae.setGrant({ domain: "finance", capability: "transfer_funds", level: 5 });
    ae.killSwitch("test trigger");

    const result = ae.evaluate({
      decisionId: "d5",
      domain: "finance",
      capability: "transfer_funds",
      attemptedLevel: 5 as AutonomyLevel,
      simulated: true,
    });
    assert.equal(result.disposition, "advise_only");
    assert.equal(result.effectiveLevel, 0);
  });

  it("restores normal operation after rearm()", () => {
    const bus = new EventBus();
    const ae = new AutonomyEngine(bus);
    ae.setGrant({ domain: "finance", capability: "transfer_funds", level: 4, blastRadius: { maxAmount: 50_000, maxPerDay: 10 } });
    ae.killSwitch("test trigger");
    ae.rearm();

    const result = ae.evaluate({
      decisionId: "d6",
      domain: "finance",
      capability: "transfer_funds",
      attemptedLevel: 4 as AutonomyLevel,
      amount: 1_000,
      simulated: true,
    });
    assert.notEqual(result.disposition, "advise_only");
  });
});

// ---------------------------------------------------------------------------
// 6. L3+ simulation precondition
// ---------------------------------------------------------------------------

describe("AutonomyEngine — L3+ simulation precondition", () => {
  it("denies when simulated=false at L4", () => {
    const bus = new EventBus();
    const ae = new AutonomyEngine(bus);
    ae.setGrant({ domain: "finance", capability: "approve_spend", level: 4 });

    const result = ae.evaluate({
      decisionId: "d7",
      domain: "finance",
      capability: "approve_spend",
      attemptedLevel: 4 as AutonomyLevel,
      simulated: false,
    });
    assert.equal(result.disposition, "deny");
  });

  it("does not require simulation at L2", () => {
    const bus = new EventBus();
    const ae = new AutonomyEngine(bus);
    ae.setGrant({ domain: "finance", capability: "approve_spend", level: 2 });

    const result = ae.evaluate({
      decisionId: "d8",
      domain: "finance",
      capability: "approve_spend",
      attemptedLevel: 2 as AutonomyLevel,
      simulated: false,
    });
    assert.notEqual(result.disposition, "deny");
  });
});

// ---------------------------------------------------------------------------
// 7. Bitemporal OKG — as-of queries
// ---------------------------------------------------------------------------

describe("OKG — bitemporal as-of", () => {
  it("nodeAsOf() returns the correct version for a given transaction time", async () => {
    const bus = new EventBus();
    const okg = new OKG(bus);

    const node = okg.addNode<{ v: number }>({ type: "Money", props: { v: 1 }, createdBy: "test", provenance: [] });

    // Pause to ensure t1 is between the two writes.
    await new Promise((r) => setTimeout(r, 10));
    const t1 = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 10));

    okg.updateNode<{ v: number }>(node.id, { v: 2 }, "test", []);
    await new Promise((r) => setTimeout(r, 10));
    const t2 = new Date().toISOString();

    const asOfT1 = okg.nodeAsOf(node.id, { txTime: t1 });
    const asOfT2 = okg.nodeAsOf(node.id, { txTime: t2 });

    assert.equal((asOfT1?.props as { v: number } | undefined)?.v, 1);
    assert.equal((asOfT2?.props as { v: number } | undefined)?.v, 2);
  });

  it("currentNode() returns the latest version", () => {
    const bus = new EventBus();
    const okg = new OKG(bus);
    const node = okg.addNode<{ v: number }>({ type: "Money", props: { v: 10 }, createdBy: "test", provenance: [] });
    okg.updateNode<{ v: number }>(node.id, { v: 20 }, "test", []);
    const current = okg.currentNode(node.id);
    assert.equal((current?.props as { v: number } | undefined)?.v, 20);
  });
});

// ---------------------------------------------------------------------------
// 8. Decision reconciliation
// ---------------------------------------------------------------------------

describe("OKG — decision reconciliation", () => {
  it("reconcileDecision sets status to reconciled and closes prior txTo", () => {
    const bus = new EventBus();
    const okg = new OKG(bus);
    const decision = okg.addDecision(
      { question: "Launch?", domain: "strategy", options: [{ label: "go" }], autonomyLevel: 1, status: "proposed" },
      "ceo",
    );

    okg.reconcileDecision(decision.id, { revenueImpact: 1_000_000 }, "ceo");

    const current = okg.currentNode(decision.id);
    assert.equal((current?.props as { status: string } | undefined)?.status, "reconciled");
    // Prior version must be closed — txTo non-null on the original version.
    // snapshot() only returns current nodes; access internals via type cast.
    const allVersions = (okg as unknown as { nodeVersions: Array<{ id: string; txTo: string | null }> }).nodeVersions
      .filter(n => n.id === decision.id);
    assert.ok(allVersions.length >= 2, "should have at least two versions");
    const closedVersions = allVersions.filter(n => n.txTo !== null);
    assert.ok(closedVersions.length >= 1, "prior version txTo must be closed");
  });
});

// ---------------------------------------------------------------------------
// 9. Memory — Hebbian reinforcement and conflict detection
// ---------------------------------------------------------------------------

describe("MemoryStore", () => {
  it("increments weight on repeated assertion", () => {
    const bus = new EventBus();
    const ms = new MemoryStore(bus);
    ms.assertFact("sales", "avg_close_days", "30");
    // Capture the initial weight by reading the fact before reinforcing.
    const initialWeight = ms.factsAbout("sales").find(f => f.predicate === "avg_close_days")?.weight ?? 0;
    const reinforced = ms.assertFact("sales", "avg_close_days", "30");
    assert.ok(reinforced.weight > initialWeight, "weight must increase on reinforcement");
    assert.ok(reinforced.observationCount >= 2);
  });

  it("detects conflicting fact values", () => {
    const bus = new EventBus();
    const ms = new MemoryStore(bus);
    ms.assertFact("sales", "avg_close_days", "30");
    const conflicting = ms.assertFact("sales", "avg_close_days", "60");
    assert.ok(conflicting.contradictedBy !== undefined);
  });

  it("maeByDomain returns correct mean absolute error", () => {
    const bus = new EventBus();
    const ms = new MemoryStore(bus);
    ms.recordCalibration({ decisionId: "d1", domain: "finance", predictedMetric: "x", predicted: 10, actual: 12, error: 2 });
    ms.recordCalibration({ decisionId: "d2", domain: "finance", predictedMetric: "x", predicted: 10, actual: 8, error: -2 });
    const mae = ms.maeByDomain();
    assert.equal(mae["finance"], 2);
  });
});

// ---------------------------------------------------------------------------
// 10. Digital twin — reproducibility + causal do-operator
// ---------------------------------------------------------------------------

describe("DigitalTwin", () => {
  it("produces identical results for the same seed", () => {
    const twin = new DigitalTwin({
      metric: "revenue",
      coefficients: { conversion: 1_000_000 },
      baseline: { conversion: 0.2 },
      noiseFraction: 0.1,
    });
    const r1 = twin.run({ type: "causal_intervention", decisionId: "d", intervention: { variable: "conversion", delta: 0.05 }, runs: 1000, seed: 42 });
    const r2 = twin.run({ type: "causal_intervention", decisionId: "d", intervention: { variable: "conversion", delta: 0.05 }, runs: 1000, seed: 42 });
    assert.equal(r1.distribution.p50, r2.distribution.p50);
  });

  it("P10 < P50 < P90", () => {
    const twin = new DigitalTwin({
      metric: "revenue",
      coefficients: { conversion: 1_000_000 },
      baseline: { conversion: 0.2 },
      noiseFraction: 0.1,
    });
    const r = twin.run({ type: "causal_intervention", decisionId: "d", intervention: { variable: "conversion", delta: 0 }, runs: 2000, seed: 1 });
    assert.ok(r.distribution.p10 < r.distribution.p50);
    assert.ok(r.distribution.p50 < r.distribution.p90);
  });
});

// ---------------------------------------------------------------------------
// 11. Closed-loop integration
// ---------------------------------------------------------------------------

describe("Olympus — closed loop integration", () => {
  it("ask() auto-executes within blast-radius with simulation", async () => {
    const twin = new DigitalTwin({
      metric: "q3_cash_usd",
      coefficients: { pipeline_conversion: 4_000_000, marketing_spend: -1.0, base_revenue: 1.0 },
      baseline: { pipeline_conversion: 0.22, marketing_spend: 900_000, base_revenue: 2_500_000 },
      noiseFraction: 0.08,
    });

    const olympus = new Olympus({ twin });
    olympus.autonomy.setGrant({
      domain: "finance",
      capability: "reallocate_budget",
      level: 5,
      blastRadius: { maxAmount: 250_000, maxPerDay: 10 },
    });

    const answer = await olympus.ere.ask(
      "Should we cut Q3 marketing spend by 18% to extend runway?",
      {
        domain: "finance",
        options: ["cut-18pct", "hold-spend"],
        depth: "deliberate",
        intervention: { variable: "marketing_spend", delta: -0.18 },
        capability: "reallocate_budget",
        exposureAmount: 162_000,
        simSeed: 7,
      },
    );

    assert.ok(answer.decisionId, "must produce a decisionId");
    assert.ok(answer.confidence > 0, "confidence must be positive");
    assert.ok(answer.evidence.some(e => e.ref.startsWith("sim://")), "simulation evidence must be present");
  });
});

// ---------------------------------------------------------------------------
// 12. Decision Inbox projection
// ---------------------------------------------------------------------------

describe("DecisionInbox — projection over the event spine", () => {
  it("auto-executed decisions land as awareness items, not pending", async () => {
    const twin = new DigitalTwin({
      metric: "q3_cash_usd",
      coefficients: { marketing_spend: -1.0, base_revenue: 1.0 },
      baseline: { marketing_spend: 900_000, base_revenue: 2_500_000 },
      noiseFraction: 0.08,
    });
    const olympus = new Olympus({ twin });
    olympus.autonomy.setGrant({
      domain: "finance", capability: "reallocate_budget", level: 5,
      blastRadius: { maxAmount: 250_000, maxPerDay: 10 },
    });

    await olympus.ere.ask("Cut Q3 spend 18%?", {
      domain: "finance", options: ["cut-18pct", "hold"], capability: "reallocate_budget",
      intervention: { variable: "marketing_spend", delta: -0.18 }, exposureAmount: 162_000, simSeed: 7,
    });

    const all = olympus.inbox.all();
    assert.ok(all.length >= 1, "inbox should record the resolved decision");
    assert.equal(olympus.inbox.pending().length, 0, "auto-executed items are not pending");
    assert.ok(all.some(i => i.status === "auto_executed"));
  });

  it("rebuild() from the log reproduces the same inbox (projection contract)", async () => {
    const twin = new DigitalTwin({
      metric: "q3_cash_usd",
      coefficients: { marketing_spend: -1.0, base_revenue: 1.0 },
      baseline: { marketing_spend: 900_000, base_revenue: 2_500_000 },
      noiseFraction: 0.08,
    });
    const olympus = new Olympus({ twin });
    olympus.autonomy.setGrant({
      domain: "finance", capability: "reallocate_budget", level: 5,
      blastRadius: { maxAmount: 250_000, maxPerDay: 10 },
    });
    await olympus.ere.ask("Cut Q3 spend 18%?", {
      domain: "finance", options: ["cut-18pct", "hold"], capability: "reallocate_budget",
      intervention: { variable: "marketing_spend", delta: -0.18 }, exposureAmount: 162_000, simSeed: 7,
    });

    const live = JSON.stringify(olympus.inbox.all());
    const rebuilt = JSON.stringify(olympus.inbox.rebuild(olympus.bus).all());
    assert.equal(rebuilt, live, "rebuilding from the log must yield the same projection");
  });

  it("blast-radius breach queues a decision as pending in the inbox", async () => {
    const twin = new DigitalTwin({
      metric: "q3_cash_usd",
      coefficients: { marketing_spend: -1.0, base_revenue: 1.0 },
      baseline: { marketing_spend: 900_000, base_revenue: 2_500_000 },
      noiseFraction: 0.08,
    });
    const olympus = new Olympus({ twin });
    // Grant L4 but with a tiny blast-radius so the exposure breaches it -> queue.
    olympus.autonomy.setGrant({
      domain: "finance", capability: "reallocate_budget", level: 4,
      blastRadius: { maxAmount: 10_000, maxPerDay: 10 },
    });
    await olympus.ere.ask("Cut Q3 spend 18%?", {
      domain: "finance", options: ["cut-18pct", "hold"], capability: "reallocate_budget",
      intervention: { variable: "marketing_spend", delta: -0.18 }, exposureAmount: 162_000, simSeed: 7,
    });

    assert.equal(olympus.inbox.pending().length, 1, "breach must produce one pending item");
    assert.equal(olympus.inbox.pending()[0]!.status, "needs_approval");
  });
});

// ---------------------------------------------------------------------------
// 13. Churn scenario — GraphRAG causal grounding + sales twin
// ---------------------------------------------------------------------------

describe("Churn scenario — GraphRAG + sales twin", () => {
  it("traverses the causal subgraph and returns a fully-grounded bundle", () => {
    const olympus = new Olympus();
    const sc = seedChurnScenario(olympus);

    const ctx = olympus.rag.retrieve(
      "why did mid-market churn rise onboarding",
      [sc.anchors.churnSpike, sc.anchors.reorg],
      [0.85, 0.25, 0.3, 0.48],
      {},
      12,
    );

    assert.ok(ctx.fullyGrounded, "every fact must carry a provenance ref");
    // Graph traversal must reach all four causal nodes from the two anchors.
    const graphFacts = ctx.facts.filter((f) => f.source === "graph");
    assert.ok(graphFacts.length >= 4, "should reach reorg → onboarding → churn → ARR");
    // All four retrieval streams should contribute.
    const sources = new Set(ctx.facts.map((f) => f.source));
    assert.ok(sources.has("graph") && sources.has("vector") && sources.has("semantic") && sources.has("aggregate"));
  });

  it("never scores a fact above 1.0 even with future-dated evidence (recency clamp)", () => {
    const olympus = new Olympus();
    const sc = seedChurnScenario(olympus); // docs are dated 2035

    const ctx = olympus.rag.retrieve(
      "mid-market churn onboarding",
      [sc.anchors.churnSpike],
      [0.85, 0.25, 0.3, 0.48],
      {},
      12,
    );
    for (const f of ctx.facts) {
      assert.ok(f.score <= 1.0 + 1e-9, `score ${f.score} for ${f.ref} must not exceed 1.0`);
    }
  });

  it("restoring onboarding FTE lowers simulated churn", () => {
    const sc = seedChurnScenario(new Olympus());
    const restore = sc.twin.run({ type: "causal_intervention", decisionId: "x",
      intervention: { variable: "onboarding_fte", delta: 0.6667 }, runs: 5000, seed: 11 });
    const base = sc.twin.run({ type: "causal_intervention", decisionId: "x",
      intervention: { variable: "onboarding_fte", delta: 0 }, runs: 5000, seed: 11 });
    assert.ok(restore.distribution.p50 < base.distribution.p50, "more FTE → less churn");
  });
});

// ---------------------------------------------------------------------------
// 14. HTTP API — diagnose endpoint
// ---------------------------------------------------------------------------

describe("OlympusApiServer — /v1/diagnose", () => {
  it("returns a grounded bundle anchored on causal roots by default", async () => {
    const { OlympusApiServer } = await import("../api/server.js");
    const api = new OlympusApiServer();
    seedChurnScenario(api.olympus);

    const port = await api.listen(0); // ephemeral port
    try {
      const r = await fetch(`http://localhost:${port}/v1/diagnose`, {
        method: "POST",
        body: JSON.stringify({ query: "why did mid-market churn rise onboarding", embedding: [0.85, 0.25, 0.3, 0.48] }),
      });
      assert.equal(r.status, 200);
      const ctx = await r.json() as { fullyGrounded: boolean; facts: Array<{ source: string }> };
      assert.ok(ctx.fullyGrounded);
      assert.ok(ctx.facts.some((f) => f.source === "graph"), "default anchors must drive graph traversal");
    } finally {
      await api.close();
    }
  });

  it("400s when query is missing", async () => {
    const { OlympusApiServer } = await import("../api/server.js");
    const api = new OlympusApiServer();
    const port = await api.listen(0);
    try {
      const r = await fetch(`http://localhost:${port}/v1/diagnose`, { method: "POST", body: "{}" });
      assert.equal(r.status, 400);
    } finally {
      await api.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 15. Persistence — durable log survives a simulated restart
// ---------------------------------------------------------------------------

describe("FileEventLog — projections rebuild from the durable log", () => {
  it("replays a persisted log into a fresh instance and rebuilds the inbox", async () => {
    const { FileEventLog } = await import("../persistence/file-event-log.js");
    const { EventBus } = await import("../events/event-bus.js");
    const { DecisionInbox } = await import("../projections/decision-inbox.js");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { rmSync } = await import("node:fs");

    const path = join(tmpdir(), `olympus-log-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
    try {
      // --- Session 1: run the closed loop, persisting every event to disk. ---
      const twin = new DigitalTwin({
        metric: "q3_cash_usd",
        coefficients: { marketing_spend: -1.0, base_revenue: 1.0 },
        baseline: { marketing_spend: 900_000, base_revenue: 2_500_000 },
        noiseFraction: 0.08,
      });
      const sink = new FileEventLog(path);
      const olympus = new Olympus({ twin, sink });
      olympus.autonomy.setGrant({
        domain: "finance", capability: "reallocate_budget", level: 5,
        blastRadius: { maxAmount: 250_000, maxPerDay: 10 },
      });
      await olympus.ere.ask("Cut Q3 spend 18%?", {
        domain: "finance", options: ["cut-18pct", "hold"], capability: "reallocate_budget",
        intervention: { variable: "marketing_spend", delta: -0.18 }, exposureAmount: 162_000, simSeed: 7,
      });

      const originalInbox = JSON.stringify(olympus.inbox.all());
      const persistedCount = sink.count();
      assert.ok(persistedCount > 0, "events must be durably persisted");
      assert.equal(persistedCount, olympus.bus.events().length, "every bus event is on disk");

      // --- Session 2 (simulated restart): fresh bus, replay the log. ---
      const replayed = new FileEventLog(path).readAll();
      const bus2 = new EventBus();
      bus2.hydrate(replayed);
      const inbox2 = new DecisionInbox().rebuild(bus2);

      assert.equal(
        JSON.stringify(inbox2.all()),
        originalInbox,
        "inbox rebuilt from the durable log must match the original session",
      );
    } finally {
      rmSync(path, { force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 16. Briefing Engine — proactive synthesis
// ---------------------------------------------------------------------------

describe("BriefingEngine", () => {
  it("reports all-clear with no pending decisions", () => {
    const olympus = new Olympus();
    const b = olympus.briefing.generate();
    assert.equal(b.pendingCount, 0);
    assert.match(b.headline, /All clear/);
  });

  it("surfaces escalated decisions as urgent in the headline", async () => {
    const twin = new DigitalTwin({
      metric: "q3_cash_usd",
      coefficients: { marketing_spend: -1.0, base_revenue: 1.0 },
      baseline: { marketing_spend: 900_000, base_revenue: 2_500_000 },
      noiseFraction: 0.08,
    });
    const olympus = new Olympus({ twin });
    // L4 grant with a tiny blast-radius → the exposure breaches it → queued (pending).
    olympus.autonomy.setGrant({
      domain: "finance", capability: "reallocate_budget", level: 4,
      blastRadius: { maxAmount: 10_000, maxPerDay: 10 },
    });
    await olympus.ere.ask("Cut Q3 spend 18%?", {
      domain: "finance", options: ["cut-18pct", "hold"], capability: "reallocate_budget",
      intervention: { variable: "marketing_spend", delta: -0.18 }, exposureAmount: 162_000, simSeed: 7,
    });
    const b = olympus.briefing.generate();
    assert.equal(b.pendingCount, 1);
    assert.ok(b.sections.some((s) => s.heading === "Needs your decision" && s.lines.length === 1));
  });

  it("reports the kill switch as urgent", () => {
    const olympus = new Olympus();
    olympus.autonomy.killSwitch("test");
    const b = olympus.briefing.generate();
    assert.match(b.headline, /Kill switch/i);
    assert.ok(b.sections.some((s) => s.severity === "urgent"));
  });
});

// ---------------------------------------------------------------------------
// 17. Workflow Engine — procedural memory as governed action
// ---------------------------------------------------------------------------

describe("WorkflowEngine", () => {
  function registerSkill(olympus: Olympus, name: string, requiresAutonomy = 1) {
    olympus.mcp.register({
      name, sideEffect: "internal_write", requiresAutonomy,
      handler: async () => ({ ok: true }),
    });
  }

  it("runs every step through the MCP gate and completes", async () => {
    const olympus = new Olympus();
    ["a", "b", "c"].forEach((n) => registerSkill(olympus, n, 1));
    olympus.memory.registerProcedure({
      name: "Flow", description: "test",
      steps: [{ action: "a" }, { action: "b" }, { action: "c" }],
    });

    const run = await olympus.workflow.run("Flow", { id: "agent-1", kind: "agent", autonomyLevel: 3 });
    assert.equal(run.status, "completed");
    assert.equal(run.steps.length, 3);
    assert.ok(run.steps.every((s) => s.status === "executed"));
    // Every step is in the tamper-evident audit chain.
    assert.ok(olympus.mcp.verifyAuditChain());
  });

  it("halts fail-fast on the first step the caller isn't authorized for", async () => {
    const olympus = new Olympus();
    registerSkill(olympus, "safe", 1);
    registerSkill(olympus, "privileged", 5); // needs L5
    olympus.memory.registerProcedure({
      name: "Flow2", description: "test",
      steps: [{ action: "safe" }, { action: "privileged" }, { action: "safe" }],
    });

    const run = await olympus.workflow.run("Flow2", { id: "agent-1", kind: "agent", autonomyLevel: 2 });
    assert.equal(run.status, "halted");
    assert.equal(run.haltedAt, 1);
    assert.equal(run.steps[0]!.status, "executed");
    assert.equal(run.steps[1]!.status, "denied");
    assert.equal(run.steps.length, 2, "no step runs after the halt");
  });

  it("halts on an unknown procedure", async () => {
    const olympus = new Olympus();
    const run = await olympus.workflow.run("does-not-exist", { id: "x", kind: "agent", autonomyLevel: 7 });
    assert.equal(run.status, "halted");
  });
});

// ---------------------------------------------------------------------------
// 18. Calibration Monitor — self-governing autonomy
// ---------------------------------------------------------------------------

describe("CalibrationMonitor — auto-demotion on prediction drift", () => {
  it("demotes a domain's grants to L0 once MAE drifts past threshold", () => {
    const olympus = new Olympus();
    olympus.autonomy.setGrant({ domain: "finance", capability: "reallocate_budget", level: 5,
      blastRadius: { maxAmount: 250_000, maxPerDay: 10 } });

    // Three high-error reconciliations in finance (MAE ~2.0 > 0.5 threshold).
    for (let i = 0; i < 3; i++) {
      olympus.memory.recordCalibration({
        decisionId: "d" + i, domain: "finance", predictedMetric: "x", predicted: 1, actual: 3, error: 2,
      });
    }

    const grant = olympus.autonomy.getGrant("finance", "reallocate_budget");
    assert.equal(grant?.level, 0, "drift must auto-demote the grant to L0");
  });

  it("does not demote before minimum observations", () => {
    const olympus = new Olympus();
    olympus.autonomy.setGrant({ domain: "finance", capability: "reallocate_budget", level: 5 });
    // Only two observations (< default min of 3).
    olympus.memory.recordCalibration({ decisionId: "d1", domain: "finance", predictedMetric: "x", predicted: 1, actual: 5, error: 4 });
    olympus.memory.recordCalibration({ decisionId: "d2", domain: "finance", predictedMetric: "x", predicted: 1, actual: 5, error: 4 });
    assert.equal(olympus.autonomy.getGrant("finance", "reallocate_budget")?.level, 5);
  });

  it("leaves well-calibrated domains untouched", () => {
    const olympus = new Olympus();
    olympus.autonomy.setGrant({ domain: "finance", capability: "reallocate_budget", level: 5 });
    for (let i = 0; i < 4; i++) {
      olympus.memory.recordCalibration({ decisionId: "d" + i, domain: "finance", predictedMetric: "x", predicted: 1, actual: 1.1, error: 0.1 });
    }
    assert.equal(olympus.autonomy.getGrant("finance", "reallocate_budget")?.level, 5, "accurate domain keeps its grant");
  });
});

// ---------------------------------------------------------------------------
// 19. Claude adapter — parsing + fetch contract (no network)
// ---------------------------------------------------------------------------

describe("ClaudeClient", () => {
  it("parses a calibrated confidence line and strips it from the text", async () => {
    const { parseConfidence, stripConfidenceLine } = await import("../llm/claude-client.js");
    assert.equal(parseConfidence("answer here\nCONFIDENCE: 0.82"), 0.82);
    assert.equal(parseConfidence("no score given"), 0.5); // conservative default
    assert.equal(parseConfidence("CONFIDENCE: 1.0"), 1);
    assert.equal(stripConfidenceLine("the answer\nCONFIDENCE: 0.9"), "the answer");
  });

  it("fromEnv returns undefined without a key, a client with one", async () => {
    const { ClaudeClient } = await import("../llm/claude-client.js");
    assert.equal(ClaudeClient.fromEnv({}), undefined);
    assert.ok(ClaudeClient.fromEnv({ ANTHROPIC_API_KEY: "sk-test" }));
  });

  it("routes tiers to models and parses the Messages API response", async () => {
    const { ClaudeClient, DEFAULT_TIER_MODELS } = await import("../llm/claude-client.js");
    const calls: Array<{ url: string; body: any }> = [];
    const realFetch = globalThis.fetch;
    // Stub fetch to assert the request shape and return a canned response.
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return {
        ok: true,
        json: async () => ({ model: "claude-opus-4-8", content: [{ type: "text", text: "Cut spend.\nCONFIDENCE: 0.88" }] }),
      } as unknown as Response;
    }) as typeof fetch;

    try {
      const llm = new ClaudeClient({ apiKey: "sk-test" });
      const r = await llm.complete({ tier: "deliberate", prompt: "Should we cut spend?" });
      assert.equal(r.text, "Cut spend.");
      assert.equal(r.confidence, 0.88);
      assert.equal(calls.length, 1);
      assert.match(calls[0]!.url, /\/v1\/messages$/);
      assert.equal(calls[0]!.body.model, DEFAULT_TIER_MODELS.deliberate);
      assert.equal(calls[0]!.body.temperature, 0); // audited decisions default deterministic
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("throws on a non-OK API response", async () => {
    const { ClaudeClient } = await import("../llm/claude-client.js");
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false, status: 429, text: async () => "rate limited" }) as unknown as Response) as typeof fetch;
    try {
      const llm = new ClaudeClient({ apiKey: "sk-test" });
      await assert.rejects(() => llm.complete({ prompt: "hi" }), /429/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// 20. HTTP API — auth + rate limiting
// ---------------------------------------------------------------------------

describe("OlympusApiServer — auth + rate limiting", () => {
  it("is open when no apiKeys are configured", async () => {
    const { OlympusApiServer } = await import("../api/server.js");
    const api = new OlympusApiServer();
    const port = await api.listen(0);
    try {
      const r = await fetch(`http://localhost:${port}/v1/inbox`);
      assert.equal(r.status, 200);
    } finally { await api.close(); }
  });

  it("401s without a valid Bearer token when keys are configured", async () => {
    const { OlympusApiServer } = await import("../api/server.js");
    const api = new OlympusApiServer({ apiKeys: { "secret-1": "alice" } });
    const port = await api.listen(0);
    try {
      const noAuth = await fetch(`http://localhost:${port}/v1/inbox`);
      assert.equal(noAuth.status, 401);

      const badAuth = await fetch(`http://localhost:${port}/v1/inbox`, { headers: { authorization: "Bearer nope" } });
      assert.equal(badAuth.status, 401);

      const ok = await fetch(`http://localhost:${port}/v1/inbox`, { headers: { authorization: "Bearer secret-1" } });
      assert.equal(ok.status, 200);
    } finally { await api.close(); }
  });

  it("keeps the console and healthz public even with auth on", async () => {
    const { OlympusApiServer } = await import("../api/server.js");
    const api = new OlympusApiServer({ apiKeys: { "secret-1": "alice" } });
    const port = await api.listen(0);
    try {
      assert.equal((await fetch(`http://localhost:${port}/`)).status, 200);
      assert.equal((await fetch(`http://localhost:${port}/healthz`)).status, 200);
    } finally { await api.close(); }
  });

  it("429s once a caller exceeds the rate limit", async () => {
    const { OlympusApiServer } = await import("../api/server.js");
    const api = new OlympusApiServer({ rateLimit: { windowMs: 10_000, max: 2 } });
    const port = await api.listen(0);
    try {
      assert.equal((await fetch(`http://localhost:${port}/v1/inbox`)).status, 200);
      assert.equal((await fetch(`http://localhost:${port}/v1/inbox`)).status, 200);
      assert.equal((await fetch(`http://localhost:${port}/v1/inbox`)).status, 429);
    } finally { await api.close(); }
  });
});

// ---------------------------------------------------------------------------
// 21. Pricing scenario
// ---------------------------------------------------------------------------

describe("Pricing scenario", () => {
  it("seeds OKG with pricing nodes including ElasticityModel", () => {
    const olympus = new Olympus();
    const scenario = seedPricingScenario(olympus);
    const nodes = olympus.okg.snapshot();
    const names = nodes.map((n) => (n.props as Record<string, unknown>)["name"]);
    assert.ok(names.includes("ElasticityModel"), "ElasticityModel node must exist");
    assert.ok(scenario.anchors.elasticityModel, "elasticityModel anchor must be set");
  });

  it("raise_price_10pct simulation produces a result with p50 defined", () => {
    const olympus = new Olympus();
    const scenario = seedPricingScenario(olympus);
    const result = scenario.twin.run({
      type: "causal_intervention",
      intervention: PRICING_SCENARIO_SEED.intervention,
      seed: 42,
    });
    assert.ok(typeof result.distribution.p50 === "number", "p50 must be a number");
    assert.equal(result.metric, "monthly_arpu_usd");
  });

  it("causal edge exists from ElasticityModel to PricingTier", () => {
    const olympus = new Olympus();
    const scenario = seedPricingScenario(olympus);
    const edges = olympus.okg.edgesFrom(scenario.anchors.elasticityModel);
    assert.ok(
      edges.some((e) => e.dst === scenario.anchors.pricingTier),
      "must have an edge from ElasticityModel to PricingTier",
    );
  });
});

// ---------------------------------------------------------------------------
// 22. Hiring scenario
// ---------------------------------------------------------------------------

describe("Hiring scenario", () => {
  it("seeds OKG with HiringPipeline node", () => {
    const olympus = new Olympus();
    const scenario = seedHiringScenario(olympus);
    const nodes = olympus.okg.snapshot();
    const names = nodes.map((n) => (n.props as Record<string, unknown>)["name"]);
    assert.ok(names.includes("HiringPipeline"), "HiringPipeline node must exist");
    assert.ok(scenario.anchors.hiringPipeline, "hiringPipeline anchor must be set");
  });

  it("accelerate_sourcing simulation produces a result with p50 defined", () => {
    const olympus = new Olympus();
    const scenario = seedHiringScenario(olympus);
    const result = scenario.twin.run({
      type: "causal_intervention",
      intervention: HIRING_SCENARIO_SEED.intervention,
      seed: 42,
    });
    assert.ok(typeof result.distribution.p50 === "number", "p50 must be a number");
    assert.equal(result.metric, "revenue_per_head_usd");
  });

  it("HeadcountGap risk node exists in the OKG", () => {
    const olympus = new Olympus();
    const scenario = seedHiringScenario(olympus);
    const riskNodes = olympus.okg.nodesByType("Risk");
    assert.ok(
      riskNodes.some((n) => (n.props as Record<string, unknown>)["name"] === "HeadcountGap"),
      "HeadcountGap risk node must exist",
    );
    assert.ok(scenario.anchors.headcountGap, "headcountGap anchor must be set");
  });
});

// ---------------------------------------------------------------------------
// 23. TenantRegistry
// ---------------------------------------------------------------------------

describe("TenantRegistry", () => {
  it("provisions isolated Olympus instances per tenant", async () => {
    const { TenantRegistry } = await import("../tenancy/index.js");
    const registry = new TenantRegistry();
    const t1 = registry.provision({ orgId: "org-1", name: "Acme", plan: "starter", createdAt: new Date().toISOString() });
    const t2 = registry.provision({ orgId: "org-2", name: "Beta", plan: "growth", createdAt: new Date().toISOString() });
    assert.ok(t1.olympus.okg !== t2.olympus.okg, "each tenant must have its own OKG instance");
  });

  it("throws on duplicate orgId", async () => {
    const { TenantRegistry } = await import("../tenancy/index.js");
    const registry = new TenantRegistry();
    registry.provision({ orgId: "dup", name: "Dup", plan: "starter", createdAt: new Date().toISOString() });
    assert.throws(
      () => registry.provision({ orgId: "dup", name: "Dup2", plan: "starter", createdAt: new Date().toISOString() }),
      /already exists/,
    );
  });

  it("deprovisions tenant", async () => {
    const { TenantRegistry } = await import("../tenancy/index.js");
    const registry = new TenantRegistry();
    registry.provision({ orgId: "to-remove", name: "Gone", plan: "starter", createdAt: new Date().toISOString() });
    assert.equal(registry.count(), 1);
    registry.deprovision("to-remove");
    assert.equal(registry.count(), 0);
    assert.equal(registry.get("to-remove"), undefined);
  });

  it("list returns all tenant configs", async () => {
    const { TenantRegistry } = await import("../tenancy/index.js");
    const registry = new TenantRegistry();
    registry.provision({ orgId: "a", name: "A", plan: "starter", createdAt: new Date().toISOString() });
    registry.provision({ orgId: "b", name: "B", plan: "growth", createdAt: new Date().toISOString() });
    registry.provision({ orgId: "c", name: "C", plan: "enterprise", createdAt: new Date().toISOString() });
    const configs = registry.list();
    assert.equal(configs.length, 3);
    const ids = configs.map((c) => c.orgId);
    assert.ok(ids.includes("a") && ids.includes("b") && ids.includes("c"));
  });

  it("require throws for unknown tenant", async () => {
    const { TenantRegistry } = await import("../tenancy/index.js");
    const registry = new TenantRegistry();
    assert.throws(() => registry.require("no-such-org"), /not found/);
  });

  it("resolveOrgId prefers header over query param", async () => {
    const { resolveOrgId } = await import("../tenancy/index.js");
    const mockReq = (headers: Record<string, string>, url = "/") =>
      ({ headers, url } as unknown as IncomingMessage);

    // Header takes precedence.
    const withHeader = mockReq({ "x-org-id": "header-org" }, "/?orgId=query-org");
    assert.equal(resolveOrgId(withHeader), "header-org");

    // Falls back to query param when no header.
    const withQuery = mockReq({}, "/?orgId=abc");
    assert.equal(resolveOrgId(withQuery), "abc");
  });
});

// ---------------------------------------------------------------------------
// 24. AnomalyDetector
// ---------------------------------------------------------------------------

describe("AnomalyDetector", () => {
  it("no alert before minObservations", () => {
    const bus = new EventBus();
    const okg = new OKG(bus);
    const detector = new AnomalyDetector(bus, okg);
    detector.attach();

    for (let i = 0; i < 4; i++) {
      bus.publish("metric.observed", { key: "cpu", value: 100 });
    }

    const riskNodes = okg.nodesByType("Risk");
    const anomalyNodes = riskNodes.filter((n) =>
      (n.props as Record<string, unknown>)["label"]?.toString().startsWith("Anomaly:"),
    );
    assert.equal(anomalyNodes.length, 0, "no anomaly Risk nodes before minObservations");
  });

  it("no alert for in-range values", () => {
    const bus = new EventBus();
    const okg = new OKG(bus);
    const detector = new AnomalyDetector(bus, okg);
    detector.attach();

    for (let i = 0; i < 10; i++) {
      bus.publish("metric.observed", { key: "cpu", value: 100 });
    }

    const riskNodes = okg.nodesByType("Risk");
    const anomalyNodes = riskNodes.filter((n) =>
      (n.props as Record<string, unknown>)["label"]?.toString().startsWith("Anomaly:"),
    );
    assert.equal(anomalyNodes.length, 0, "no anomaly raised when all values are identical (zero variance)");
  });

  it("raises Risk node and emits event on 3-sigma deviation", () => {
    const bus = new EventBus();
    const okg = new OKG(bus);
    const detector = new AnomalyDetector(bus, okg);

    const detected: unknown[] = [];
    bus.subscribe("anomaly.detected", (e) => { detected.push(e); });

    detector.attach();

    // 20 normal observations with slight natural variance to establish baseline
    const baseline = [98, 101, 99, 102, 100, 103, 97, 101, 100, 99,
                      102, 98, 101, 100, 99, 103, 97, 102, 100, 101];
    for (const v of baseline) {
      detector.observe("revenue", v);
    }
    // 1 extreme outlier — far beyond 3 sigma
    detector.observe("revenue", 500);

    const riskNodes = okg.nodesByType("Risk");
    const anomalyNodes = riskNodes.filter((n) =>
      (n.props as Record<string, unknown>)["label"]?.toString().startsWith("Anomaly:"),
    );
    assert.ok(anomalyNodes.length >= 1, "a Risk node with Anomaly: label must be raised");
    assert.ok(detected.length >= 1, "anomaly.detected event must be emitted");
  });

  it("attach/detach — no alerts after detach", () => {
    const bus = new EventBus();
    const okg = new OKG(bus);
    const detector = new AnomalyDetector(bus, okg);

    const detected: unknown[] = [];
    bus.subscribe("anomaly.detected", (e) => { detected.push(e); });

    detector.attach();
    detector.detach();

    // 10 normal + 1 extreme, all via bus — detector is detached so should ignore them
    for (let i = 0; i < 10; i++) {
      bus.publish("metric.observed", { key: "latency", value: 50 });
    }
    bus.publish("metric.observed", { key: "latency", value: 50000 });

    assert.equal(detected.length, 0, "no anomaly.detected events after detach");
  });

  it("observe() returns zScore on anomaly", () => {
    const bus = new EventBus();
    const okg = new OKG(bus);
    const detector = new AnomalyDetector(bus, okg);

    let result: number | undefined;
    // 20 observations with natural variance to establish baseline
    const baseline = [48, 51, 49, 52, 50, 53, 47, 51, 50, 49,
                      52, 48, 51, 50, 49, 53, 47, 52, 50, 51];
    for (const v of baseline) {
      result = detector.observe("metric", v);
    }
    // Extreme outlier: far beyond 3 sigma
    result = detector.observe("metric", 1000);

    assert.ok(result !== undefined && result > 3, `zScore should be > 3, got ${result}`);
  });
});
