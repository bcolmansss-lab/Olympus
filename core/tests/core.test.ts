/**
 * Olympus core invariant tests.
 * Run with: npm test
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";

import { EventBus } from "../events/event-bus.js";
import { NotificationRouter, InMemoryChannel, WebhookChannel, type Alert } from "../notifications/notification-router.js";
import { PolicyEngine, exposureCeilingPolicy, blockedCapabilityPolicy, domainFreezePolicy } from "../policy/policy-engine.js";
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
import { OKRTracker } from "../goals/okr-tracker.js";
import { seedPricingScenario, PRICING_SCENARIO_SEED } from "../scenarios/pricing.js";
import { seedHiringScenario, HIRING_SCENARIO_SEED } from "../scenarios/hiring.js";
import { compareScenarios } from "../simulation/scenario-compare.js";
import { CapacityPlanner } from "../capacity/capacity-planner.js";
import { FinancialLedger } from "../finance/ledger.js";
import { SLATracker } from "../contracts/sla-tracker.js";
import { DealPipeline } from "../crm/pipeline.js";
import { RiskRegister } from "../risk/risk-register.js";
import { VendorRegistry } from "../procurement/vendor-registry.js";
import { SprintTracker } from "../projects/sprint-tracker.js";
import { CustomerSuccessTracker } from "../customer-success/account-health.js";
import { ComplianceTracker } from "../compliance/index.js";
import { CompetitiveIntel } from "../competitive/index.js";
import { IncidentManager } from "../incidents/incident-manager.js";
import { MarketingAttributionEngine } from "../marketing/attribution-engine.js";
import type { TouchPoint } from "../marketing/attribution-engine.js";
import { ForecastEngine } from "../forecasting/forecast-engine.js";
import { DataPipelineManager } from "../pipeline/data-pipeline.js";
import type { ForecastAssumptions } from "../forecasting/forecast-engine.js";

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

describe("Business module API endpoints", () => {
  it("GET /v1/risks returns 200 with a risks array", async () => {
    const { OlympusApiServer } = await import("../api/server.js");
    const api = new OlympusApiServer();
    const port = await api.listen(0);
    try {
      const r = await fetch(`http://localhost:${port}/v1/risks`);
      assert.equal(r.status, 200);
      const body = await r.json() as { risks: unknown[] };
      assert.ok(Array.isArray(body.risks));
    } finally {
      await api.close();
    }
  });

  it("GET /v1/finance returns 200 with a burnRate object", async () => {
    const { OlympusApiServer } = await import("../api/server.js");
    const api = new OlympusApiServer();
    const port = await api.listen(0);
    try {
      const r = await fetch(`http://localhost:${port}/v1/finance`);
      assert.equal(r.status, 200);
      const body = await r.json() as { burnRate: unknown };
      assert.equal(typeof body.burnRate, "object");
      assert.ok(body.burnRate !== null);
    } finally {
      await api.close();
    }
  });

  it("GET /v1/pipeline returns 200 with a summary object", async () => {
    const { OlympusApiServer } = await import("../api/server.js");
    const api = new OlympusApiServer();
    const port = await api.listen(0);
    try {
      const r = await fetch(`http://localhost:${port}/v1/pipeline`);
      assert.equal(r.status, 200);
      const body = await r.json() as { summary: unknown };
      assert.equal(typeof body.summary, "object");
      assert.ok(body.summary !== null);
    } finally {
      await api.close();
    }
  });

  it("GET /v1/sla returns 200 with an slas array", async () => {
    const { OlympusApiServer } = await import("../api/server.js");
    const api = new OlympusApiServer();
    const port = await api.listen(0);
    try {
      const r = await fetch(`http://localhost:${port}/v1/sla`);
      assert.equal(r.status, 200);
      const body = await r.json() as { slas: unknown[] };
      assert.ok(Array.isArray(body.slas));
    } finally {
      await api.close();
    }
  });

  it("GET /v1/capacity returns 200 with a summary object", async () => {
    const { OlympusApiServer } = await import("../api/server.js");
    const api = new OlympusApiServer();
    const port = await api.listen(0);
    try {
      const r = await fetch(`http://localhost:${port}/v1/capacity`);
      assert.equal(r.status, 200);
      const body = await r.json() as { summary: unknown };
      assert.equal(typeof body.summary, "object");
      assert.ok(body.summary !== null);
    } finally {
      await api.close();
    }
  });
});

describe("HealthScorer", () => {
  const validGrades = ["excellent", "good", "fair", "poor", "critical"];

  it("score returns composite 0-100 with grade", () => {
    const olympus = new Olympus();
    const report = olympus.health.score();
    assert.ok(report.composite >= 0 && report.composite <= 100);
    assert.ok(validGrades.includes(report.grade));
    assert.equal(report.dimensions.length, 6);
  });

  it("empty system scores well on untracked dimensions", () => {
    const olympus = new Olympus();
    const report = olympus.health.score();
    const byName = (n: string) => report.dimensions.find((d) => d.name === n)!;
    assert.equal(byName("reliability").score, 100);
    assert.equal(byName("capacity").score, 100);
    assert.equal(byName("goals").score, 100);
    assert.equal(typeof report.composite, "number");
  });

  it("high risk lowers composite", () => {
    const a = new Olympus();
    const reportA = a.health.score();

    const b = new Olympus();
    b.riskRegister.raise({
      title: "Severe outage risk",
      description: "Catastrophic failure scenario",
      category: "operational",
      domain: "operations",
      probability: 1.0,
      impact: 5,
      owner: "ops",
    });
    const reportB = b.health.score();

    const riskA = reportA.dimensions.find((d) => d.name === "risk")!;
    const riskB = reportB.dimensions.find((d) => d.name === "risk")!;
    assert.ok(riskB.score < riskA.score);
  });

  it("GET /v1/health returns 200 with composite", async () => {
    const { OlympusApiServer } = await import("../api/server.js");
    const api = new OlympusApiServer();
    const port = await api.listen(0);
    try {
      const r = await fetch(`http://localhost:${port}/v1/health`);
      assert.equal(r.status, 200);
      const body = await r.json() as { composite: number; dimensions: unknown[] };
      assert.equal(typeof body.composite, "number");
      assert.ok(Array.isArray(body.dimensions));
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

// ---------------------------------------------------------------------------
// 25. ScenarioComparison
// ---------------------------------------------------------------------------

describe("ScenarioComparison", () => {
  const makeTwin = () => new DigitalTwin({
    metric: "revenue",
    coefficients: { conversion: 1_000_000 },
    baseline: { conversion: 0.2 },
    noiseFraction: 0.05,
  });

  it("compareScenarios returns ComparisonResult with overallWinner", () => {
    const twin = makeTwin();
    const specA = { label: "baseline", intervention: { variable: "conversion", delta: 0.05 }, seed: 1 };
    const specB = { label: "aggressive", intervention: { variable: "conversion", delta: 0.20 }, seed: 2 };
    const result = compareScenarios(twin, specA, specB);

    assert.ok(["a", "b", "tie"].includes(result.overallWinner), "overallWinner must be a, b, or tie");
    assert.ok(result.metrics.length > 0, "metrics must have at least one entry");
    assert.ok(typeof result.comparedAt === "string", "comparedAt must be a string");
  });

  it("symmetric: swapping a/b flips winner", () => {
    const twin = makeTwin();
    const specA = { label: "low", intervention: { variable: "conversion", delta: 0.0 }, seed: 1 };
    const specB = { label: "high", intervention: { variable: "conversion", delta: 0.5 }, seed: 2 };
    const first = compareScenarios(twin, specA, specB);
    const second = compareScenarios(twin, specB, specA);

    if (first.overallWinner === "a") {
      assert.equal(second.overallWinner, "b");
    } else if (first.overallWinner === "b") {
      assert.equal(second.overallWinner, "a");
    } else {
      assert.equal(second.overallWinner, "tie");
    }
  });

  it("POST /v1/compare returns 400 without a twin", async () => {
    const { OlympusApiServer } = await import("../api/server.js");
    // No twin configured
    const api = new OlympusApiServer();
    const port = await api.listen(0);
    try {
      const r = await fetch(`http://localhost:${port}/v1/compare`, {
        method: "POST",
        body: JSON.stringify({
          a: { label: "baseline", intervention: { variable: "x", delta: 0.1 }, seed: 1 },
          b: { label: "aggressive", intervention: { variable: "x", delta: 0.3 }, seed: 2 },
        }),
      });
      assert.equal(r.status, 400);
      const body = await r.json() as { error: string };
      assert.ok(body.error.includes("digital twin"), `expected 'digital twin' in error, got: ${body.error}`);
    } finally {
      await api.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 26. PolicyEngine
// ---------------------------------------------------------------------------

describe("PolicyEngine", () => {
  it("no violation when no policies registered", () => {
    const bus = new EventBus();
    const engine = new PolicyEngine(bus);
    const result = engine.evaluate({ capability: "delete_data", domain: "finance", exposureAmount: 1_000_000 });
    assert.equal(result, undefined);
  });

  it("blocks when policy fires", () => {
    const bus = new EventBus();
    const engine = new PolicyEngine(bus);
    engine.register(exposureCeilingPolicy("cap-500k", 500_000));
    const result = engine.evaluate({ capability: "reallocate_budget", domain: "finance", exposureAmount: 600_000 });
    assert.ok(result !== undefined, "should return a violation");
    assert.equal(result.policyName, "cap-500k");
  });

  it("passes when exposure under ceiling", () => {
    const bus = new EventBus();
    const engine = new PolicyEngine(bus);
    engine.register(exposureCeilingPolicy("cap-500k", 500_000));
    const result = engine.evaluate({ capability: "reallocate_budget", domain: "finance", exposureAmount: 400_000 });
    assert.equal(result, undefined);
  });

  it("emits policy.blocked event on violation", () => {
    const bus = new EventBus();
    const engine = new PolicyEngine(bus);
    engine.register(exposureCeilingPolicy("cap-500k", 500_000));

    const events: unknown[] = [];
    bus.subscribe("policy.blocked", (e) => { events.push(e); });

    engine.evaluate({ capability: "reallocate_budget", domain: "finance", exposureAmount: 600_000 });
    assert.equal(events.length, 1, "policy.blocked event must be emitted");
  });

  it("blockedCapabilityPolicy fires only for matching capability", () => {
    const bus = new EventBus();
    const engine = new PolicyEngine(bus);
    engine.register(blockedCapabilityPolicy("delete_data"));

    const blocked = engine.evaluate({ capability: "delete_data", domain: "finance" });
    assert.ok(blocked !== undefined, "delete_data should be blocked");

    const passed = engine.evaluate({ capability: "read_data", domain: "finance" });
    assert.equal(passed, undefined, "read_data should pass");
  });

  it("domainFreezePolicy blocks entire domain", () => {
    const bus = new EventBus();
    const engine = new PolicyEngine(bus);
    engine.register(domainFreezePolicy("people"));

    const blocked = engine.evaluate({ capability: "hire_contractor", domain: "people" });
    assert.ok(blocked !== undefined, "people domain should be blocked");

    const passed = engine.evaluate({ capability: "approve_spend", domain: "finance" });
    assert.equal(passed, undefined, "finance domain should pass");
  });

  it("unregister removes policy", () => {
    const bus = new EventBus();
    const engine = new PolicyEngine(bus);
    engine.register(exposureCeilingPolicy("cap-500k", 500_000));
    engine.unregister("cap-500k");
    assert.deepEqual(engine.list(), []);
    const result = engine.evaluate({ capability: "reallocate_budget", domain: "finance", exposureAmount: 600_000 });
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// 27. OKRTracker
// ---------------------------------------------------------------------------

describe("OKRTracker", () => {
  const makeObjectiveInput = (id: string) => ({
    id,
    label: "Grow revenue",
    owner: "ceo",
    dueDate: "2026-12-31",
    keyResults: [
      { id: `${id}-kr1`, label: "Increase ARR", metricKey: "arr", baseline: 0, target: 1_000_000 },
      { id: `${id}-kr2`, label: "Reduce churn", metricKey: "churn_rate", baseline: 0.1, target: 0.05 },
    ],
  });

  it("addObjective creates objective with not-started KRs", () => {
    const bus = new EventBus();
    const tracker = new OKRTracker(bus);
    const obj = tracker.addObjective(makeObjectiveInput("obj-1"));
    assert.equal(obj.overallStatus, "not-started");
    assert.equal(obj.overallProgress, 0);
    assert.ok(obj.keyResults.every((kr) => kr.status === "not-started"));
    assert.ok(obj.keyResults.every((kr) => kr.progress === 0));
  });

  it("recordMetric updates KR progress and status", () => {
    const bus = new EventBus();
    const tracker = new OKRTracker(bus);
    tracker.addObjective(makeObjectiveInput("obj-2"));
    // 70% of way to target (baseline=0, target=1_000_000)
    tracker.recordMetric("arr", 700_000);
    const obj = tracker.get("obj-2")!;
    const kr = obj.keyResults.find((k) => k.metricKey === "arr")!;
    assert.ok(Math.abs(kr.progress - 0.7) < 0.001, `expected progress ~0.7, got ${kr.progress}`);
    assert.equal(kr.status, "on-track");
  });

  it("achieved when current >= target", () => {
    const bus = new EventBus();
    const tracker = new OKRTracker(bus);
    tracker.addObjective(makeObjectiveInput("obj-3"));
    tracker.recordMetric("arr", 1_000_000);
    const obj = tracker.get("obj-3")!;
    const kr = obj.keyResults.find((k) => k.metricKey === "arr")!;
    assert.equal(kr.progress, 1.0);
    assert.equal(kr.status, "achieved");
  });

  it("overallStatus is worst KR status", () => {
    const bus = new EventBus();
    const tracker = new OKRTracker(bus);
    tracker.addObjective(makeObjectiveInput("obj-4"));
    // arr at 80% → on-track; churn_rate barely improved (baseline 0.1, target 0.05, current 0.09 → only 20% progress)
    tracker.recordMetric("arr", 800_000);
    tracker.recordMetric("churn_rate", 0.09);
    const obj = tracker.get("obj-4")!;
    assert.equal(obj.overallStatus, "off-track");
  });

  it("attach subscribes to metric.observed events", () => {
    const bus = new EventBus();
    const tracker = new OKRTracker(bus).attach();
    tracker.addObjective({
      id: "obj-5",
      label: "Test",
      owner: "cto",
      dueDate: "2026-12-31",
      keyResults: [{ id: "obj-5-kr1", label: "Test KR", metricKey: "latency_ms", baseline: 0, target: 100 }],
    });
    bus.publish("metric.observed", { key: "latency_ms", value: 75 });
    const obj = tracker.get("obj-5")!;
    const kr = obj.keyResults[0]!;
    assert.equal(kr.current, 75);
    assert.ok(Math.abs(kr.progress - 0.75) < 0.001);
    assert.equal(kr.status, "on-track");
    tracker.detach();
  });

  it("atRisk returns only non-on-track objectives", () => {
    const bus = new EventBus();
    const tracker = new OKRTracker(bus);
    // Achieved objective
    tracker.addObjective({
      id: "obj-achieved",
      label: "Done",
      owner: "ceo",
      dueDate: "2026-12-31",
      keyResults: [{ id: "kr-achieved", label: "Done KR", metricKey: "done_metric", baseline: 0, target: 100 }],
    });
    tracker.recordMetric("done_metric", 100);
    // Off-track objective
    tracker.addObjective({
      id: "obj-offtrack",
      label: "Behind",
      owner: "ceo",
      dueDate: "2026-12-31",
      keyResults: [{ id: "kr-offtrack", label: "Behind KR", metricKey: "behind_metric", baseline: 0, target: 100 }],
    });
    tracker.recordMetric("behind_metric", 10); // 10% → off-track

    const atRisk = tracker.atRisk();
    assert.equal(atRisk.length, 1);
    assert.equal(atRisk[0]!.id, "obj-offtrack");
  });
});

// ---------------------------------------------------------------------------
// 28. NotificationRouter
// ---------------------------------------------------------------------------

describe("NotificationRouter", () => {
  const mockAlert = (title: string): Alert => ({
    id: "a1", topic: "test", severity: "info", title, body: "", payload: {}, createdAt: new Date().toISOString()
  });

  it("InMemoryChannel stores alerts in order", () => {
    const ch = new InMemoryChannel();
    ch.send(mockAlert("first"));
    ch.send(mockAlert("second"));
    ch.send(mockAlert("third"));
    assert.equal(ch.count(), 3);
    assert.equal(ch.alerts()[0]!.title, "first");
  });

  it("NotificationRouter routes anomaly.detected to channel", () => {
    const bus = new EventBus();
    const ch = new InMemoryChannel();
    const router = new NotificationRouter(bus);
    router.addChannel(ch).attach();
    bus.publish("anomaly.detected", { key: "revenue", value: 999, zScore: 4.5, mean: 100, stddev: 10 });
    assert.equal(ch.count(), 1);
    assert.equal(ch.alerts()[0]!.severity, "warning");
  });

  it("NotificationRouter routes policy.blocked to channel", () => {
    const bus = new EventBus();
    const ch = new InMemoryChannel();
    const router = new NotificationRouter(bus);
    router.addChannel(ch).attach();
    bus.publish("policy.blocked", { policyName: "cap-500k", description: "over limit" });
    assert.equal(ch.count(), 1);
    assert.equal(ch.alerts()[0]!.severity, "critical");
  });

  it("WebhookChannel records calls", () => {
    const wh = new WebhookChannel("https://example.com/hook");
    wh.send(mockAlert("one"));
    wh.send(mockAlert("two"));
    assert.equal(wh.calls.length, 2);
    assert.equal(wh.calls[0]!.url, "https://example.com/hook");
  });

  it("detach stops routing", () => {
    const bus = new EventBus();
    const ch = new InMemoryChannel();
    const router = new NotificationRouter(bus);
    router.addChannel(ch).attach();
    router.detach();
    bus.publish("anomaly.detected", { key: "revenue", value: 999, zScore: 4.5, mean: 100, stddev: 10 });
    assert.equal(ch.count(), 0);
  });

  it("InMemoryChannel respects maxSize cap", () => {
    const ch = new InMemoryChannel(3);
    for (let i = 0; i < 5; i++) {
      ch.send(mockAlert(`alert-${i}`));
    }
    assert.equal(ch.count(), 3);
  });
});

// ---------------------------------------------------------------------------
// 29. CapacityPlanner
// ---------------------------------------------------------------------------

describe("CapacityPlanner", () => {
  it("addResource and listResources", () => {
    const bus = new EventBus();
    const planner = new CapacityPlanner(bus);
    planner.addResource({ id: "r1", name: "Alice", role: "engineer", availability: 1.0 });
    planner.addResource({ id: "r2", name: "Bob", role: "designer", availability: 1.0 });
    assert.equal(planner.listResources().length, 2);
  });

  it("utilizationFor sums allocations", () => {
    const bus = new EventBus();
    const planner = new CapacityPlanner(bus);
    planner.addResource({ id: "r1", name: "Alice", role: "engineer", availability: 1.0 });
    planner.addProject({ id: "p1", name: "Proj1", startDate: "2026-01-01", endDate: "2026-06-30", demands: {} });
    planner.addProject({ id: "p2", name: "Proj2", startDate: "2026-01-01", endDate: "2026-06-30", demands: {} });
    planner.allocate({ resourceId: "r1", projectId: "p1", utilization: 0.5 });
    planner.allocate({ resourceId: "r1", projectId: "p2", utilization: 0.3 });
    assert.ok(Math.abs(planner.utilizationFor("r1") - 0.8) < 1e-9);
  });

  it("allocate detects overallocation and returns report", () => {
    const bus = new EventBus();
    const planner = new CapacityPlanner(bus);
    planner.addResource({ id: "r1", name: "Alice", role: "engineer", availability: 1.0 });
    planner.addProject({ id: "p1", name: "Proj1", startDate: "2026-01-01", endDate: "2026-06-30", demands: {} });
    planner.addProject({ id: "p2", name: "Proj2", startDate: "2026-01-01", endDate: "2026-06-30", demands: {} });
    planner.allocate({ resourceId: "r1", projectId: "p1", utilization: 0.6 });
    const report = planner.allocate({ resourceId: "r1", projectId: "p2", utilization: 0.7 });
    assert.ok(report !== undefined, "should return overallocation report");
    assert.ok(Math.abs(report.totalUtilization - 1.3) < 1e-9, `expected 1.3, got ${report.totalUtilization}`);
  });

  it("allocate emits capacity.overallocated event", () => {
    const bus = new EventBus();
    const planner = new CapacityPlanner(bus);
    planner.addResource({ id: "r1", name: "Alice", role: "engineer", availability: 1.0 });
    planner.addProject({ id: "p1", name: "Proj1", startDate: "2026-01-01", endDate: "2026-06-30", demands: {} });
    planner.addProject({ id: "p2", name: "Proj2", startDate: "2026-01-01", endDate: "2026-06-30", demands: {} });

    const events: unknown[] = [];
    bus.subscribe("capacity.overallocated", (e) => { events.push(e); });

    planner.allocate({ resourceId: "r1", projectId: "p1", utilization: 0.6 });
    planner.allocate({ resourceId: "r1", projectId: "p2", utilization: 0.7 });

    assert.equal(events.length, 1, "capacity.overallocated event must be emitted");
  });

  it("deallocate reduces utilization", () => {
    const bus = new EventBus();
    const planner = new CapacityPlanner(bus);
    planner.addResource({ id: "r1", name: "Alice", role: "engineer", availability: 1.0 });
    planner.addProject({ id: "p1", name: "Proj1", startDate: "2026-01-01", endDate: "2026-06-30", demands: {} });
    planner.allocate({ resourceId: "r1", projectId: "p1", utilization: 0.8 });
    planner.deallocate("r1", "p1");
    assert.equal(planner.utilizationFor("r1"), 0);
  });

  it("capacitySummary groups by role", () => {
    const bus = new EventBus();
    const planner = new CapacityPlanner(bus);
    planner.addResource({ id: "r1", name: "Alice", role: "engineer", availability: 1.0 });
    planner.addResource({ id: "r2", name: "Bob", role: "engineer", availability: 1.0 });
    planner.addProject({ id: "p1", name: "Proj1", startDate: "2026-01-01", endDate: "2026-06-30", demands: {} });
    planner.allocate({ resourceId: "r1", projectId: "p1", utilization: 0.5 });
    const summary = planner.capacitySummary();
    assert.equal(summary["engineer"]!.available, 2);
    assert.equal(summary["engineer"]!.allocated, 0.5);
  });

  it("overallocatedResources returns only over-budget resources", () => {
    const bus = new EventBus();
    const planner = new CapacityPlanner(bus);
    planner.addResource({ id: "r1", name: "Alice", role: "engineer", availability: 1.0 });
    planner.addResource({ id: "r2", name: "Bob", role: "designer", availability: 1.0 });
    planner.addProject({ id: "p1", name: "Proj1", startDate: "2026-01-01", endDate: "2026-06-30", demands: {} });
    planner.addProject({ id: "p2", name: "Proj2", startDate: "2026-01-01", endDate: "2026-06-30", demands: {} });
    // r1 over-allocated: 0.6 + 0.6 = 1.2
    planner.allocate({ resourceId: "r1", projectId: "p1", utilization: 0.6 });
    planner.allocate({ resourceId: "r1", projectId: "p2", utilization: 0.6 });
    // r2 fine: 0.8
    planner.allocate({ resourceId: "r2", projectId: "p1", utilization: 0.8 });
    assert.equal(planner.overallocatedResources().length, 1);
  });
});

// ---------------------------------------------------------------------------
// 30. FinancialLedger
// ---------------------------------------------------------------------------

describe("FinancialLedger", () => {
  it("post entry updates account balances", () => {
    const bus = new EventBus();
    const ledger = new FinancialLedger(bus);
    ledger.addAccount({ id: "cash", name: "Cash", type: "asset" });
    ledger.addAccount({ id: "revenue", name: "Revenue", type: "revenue" });

    ledger.post({
      date: new Date().toISOString().split("T")[0]!,
      description: "Customer payment",
      debitAccountId: "cash",
      creditAccountId: "revenue",
      amount: 10000,
    });

    assert.equal(ledger.getAccount("cash")!.balance, 10000);
    assert.equal(ledger.getAccount("revenue")!.balance, 10000);
  });

  it("post entry emits finance.entry_posted event", () => {
    const bus = new EventBus();
    const ledger = new FinancialLedger(bus);
    ledger.addAccount({ id: "cash", name: "Cash", type: "asset" });
    ledger.addAccount({ id: "revenue", name: "Revenue", type: "revenue" });

    const events: unknown[] = [];
    bus.subscribe("finance.entry_posted", (e) => { events.push(e); });

    ledger.post({
      date: new Date().toISOString().split("T")[0]!,
      description: "Sale",
      debitAccountId: "cash",
      creditAccountId: "revenue",
      amount: 5000,
    });

    assert.equal(events.length, 1);
    const payload = (events[0] as { payload: { amount: number } }).payload;
    assert.equal(payload.amount, 5000);
  });

  it("burnRate returns Infinity runway when no expenses", () => {
    const bus = new EventBus();
    const ledger = new FinancialLedger(bus);
    ledger.addAccount({ id: "cash", name: "Cash", type: "asset" });
    ledger.addAccount({ id: "revenue", name: "Revenue", type: "revenue" });

    ledger.post({
      date: new Date().toISOString().split("T")[0]!,
      description: "Revenue only",
      debitAccountId: "cash",
      creditAccountId: "revenue",
      amount: 50000,
    });

    assert.equal(ledger.burnRate().runwayMonths, Infinity);
  });

  it("burnRate computes monthly burn and runway", () => {
    const bus = new EventBus();
    const ledger = new FinancialLedger(bus);
    ledger.addAccount({ id: "cash", name: "Cash", type: "asset", balance: 60000 });
    ledger.addAccount({ id: "expense", name: "Expenses", type: "expense" });
    ledger.addAccount({ id: "ap", name: "Accounts Payable", type: "liability" });

    const today = new Date().toISOString().split("T")[0]!;
    // Post 3 expense entries totaling 30000
    for (let i = 0; i < 3; i++) {
      ledger.post({
        date: today,
        description: `Expense ${i}`,
        debitAccountId: "expense",
        creditAccountId: "ap",
        amount: 10000,
      });
    }

    const report = ledger.burnRate();
    assert.ok(report.monthlyBurn > 0, "monthly burn must be positive");
    assert.ok(isFinite(report.runwayMonths) && report.runwayMonths > 0, "runway must be finite and positive");
  });

  it("netIncome = revenue - expenses", () => {
    const bus = new EventBus();
    const ledger = new FinancialLedger(bus);
    ledger.addAccount({ id: "cash", name: "Cash", type: "asset" });
    ledger.addAccount({ id: "revenue", name: "Revenue", type: "revenue" });
    ledger.addAccount({ id: "expense", name: "Expenses", type: "expense" });
    ledger.addAccount({ id: "ap", name: "Accounts Payable", type: "liability" });

    const today = new Date().toISOString().split("T")[0]!;
    ledger.post({ date: today, description: "Revenue", debitAccountId: "cash", creditAccountId: "revenue", amount: 50000 });
    ledger.post({ date: today, description: "Expense", debitAccountId: "expense", creditAccountId: "ap", amount: 20000 });

    assert.equal(ledger.netIncome(), 30000);
  });

  it("emits runway_warning when runway < threshold", () => {
    const bus = new EventBus();
    // Set threshold to 6 months
    const ledger = new FinancialLedger(bus, { runwayWarningThreshold: 6 });
    // Cash balance 5000, expenses will be high enough to produce < 6 months runway
    ledger.addAccount({ id: "cash", name: "Cash", type: "asset", balance: 5000 });
    ledger.addAccount({ id: "expense", name: "Expenses", type: "expense" });
    ledger.addAccount({ id: "ap", name: "Accounts Payable", type: "liability" });

    const warnings: unknown[] = [];
    bus.subscribe("finance.runway_warning", (e) => { warnings.push(e); });

    const today = new Date().toISOString().split("T")[0]!;
    // 3000/month burn → runway = 5000/1000 = 5 months < 6 threshold
    ledger.post({ date: today, description: "High expense", debitAccountId: "expense", creditAccountId: "ap", amount: 3000 });

    assert.ok(warnings.length >= 1, "finance.runway_warning must be emitted when runway < threshold");
  });
});

// ---------------------------------------------------------------------------
// 31. SLATracker
// ---------------------------------------------------------------------------

describe("SLATracker", () => {
  it("register and list SLAs", () => {
    const bus = new EventBus();
    const tracker = new SLATracker(bus);
    tracker.register({ id: "sla-1", contractName: "Acme", metric: "uptime", threshold: 99.9, direction: "above", penaltyUsd: 0 });
    tracker.register({ id: "sla-2", contractName: "Beta", metric: "latency_ms", threshold: 200, direction: "below", penaltyUsd: 0 });
    assert.equal(tracker.list().length, 2);
  });

  it("healthy when value meets threshold", () => {
    const bus = new EventBus();
    const tracker = new SLATracker(bus);
    // atRiskPct=0 means riskZone=0, so any value >= threshold is healthy
    tracker.register({ id: "sla-uptime", contractName: "Acme", metric: "uptime", threshold: 99.9, direction: "above", penaltyUsd: 0, atRiskPct: 0 });
    const state = tracker.record("sla-uptime", 99.95);
    assert.equal(state?.status, "healthy");
  });

  it("at-risk when within atRiskPct of threshold", () => {
    const bus = new EventBus();
    const tracker = new SLATracker(bus);
    // threshold=99.9, atRiskPct=5 → riskZone=4.995 → at-risk when value < 104.895 but >= 99.9
    tracker.register({ id: "sla-uptime", contractName: "Acme", metric: "uptime", threshold: 99.9, direction: "above", penaltyUsd: 0, atRiskPct: 5 });
    const state1 = tracker.record("sla-uptime", 99.95); // >= 99.9 and < 104.895 → at-risk
    assert.equal(state1?.status, "at-risk");
    const state2 = tracker.record("sla-uptime", 110); // >= 104.895 → healthy
    assert.equal(state2?.status, "healthy");
  });

  it("breach when value violates threshold", () => {
    const bus = new EventBus();
    const tracker = new SLATracker(bus);
    tracker.register({ id: "sla-uptime", contractName: "Acme", metric: "uptime", threshold: 99.9, direction: "above", penaltyUsd: 0 });
    const state = tracker.record("sla-uptime", 99.5);
    assert.equal(state?.status, "breached");
    assert.equal(state?.breachCount, 1);
  });

  it("emits sla.breached event with penalty", () => {
    const bus = new EventBus();
    const tracker = new SLATracker(bus);
    tracker.register({ id: "sla-uptime", contractName: "Acme SLA", metric: "uptime", threshold: 99.9, direction: "above", penaltyUsd: 5000 });

    const events: unknown[] = [];
    bus.subscribe("sla.breached", (e) => { events.push(e); });

    tracker.record("sla-uptime", 99.0); // breaches threshold
    assert.equal(events.length, 1, "sla.breached event must be emitted");
    assert.equal(tracker.totalPenalties(), 5000);
  });

  it("latency SLA (below direction)", () => {
    const bus = new EventBus();
    const tracker = new SLATracker(bus);
    tracker.register({ id: "sla-latency", contractName: "Acme", metric: "p99_latency_ms", threshold: 200, direction: "below", penaltyUsd: 1000 });
    const state1 = tracker.record("sla-latency", 150); // 150 <= 200 → healthy
    assert.ok(state1?.status !== "breached", `expected not breached, got ${state1?.status}`);
    const state2 = tracker.record("sla-latency", 250); // 250 > 200 → breached
    assert.equal(state2?.status, "breached");
  });

  it("atRisk returns breached and at-risk SLAs", () => {
    const bus = new EventBus();
    const tracker = new SLATracker(bus);
    // SLA 1: will be healthy
    tracker.register({ id: "sla-healthy", contractName: "A", metric: "uptime", threshold: 99.9, direction: "above", penaltyUsd: 0, atRiskPct: 1 });
    tracker.record("sla-healthy", 110); // well above threshold + riskZone

    // SLA 2: will be at-risk
    tracker.register({ id: "sla-atrisk", contractName: "B", metric: "uptime2", threshold: 99.9, direction: "above", penaltyUsd: 0, atRiskPct: 5 });
    tracker.record("sla-atrisk", 99.95); // within at-risk zone

    // SLA 3: will be breached
    tracker.register({ id: "sla-breached", contractName: "C", metric: "latency", threshold: 200, direction: "below", penaltyUsd: 0 });
    tracker.record("sla-breached", 300); // exceeds threshold

    assert.equal(tracker.atRisk().length, 2);
  });
});

// ---------------------------------------------------------------------------
// 32. DealPipeline
// ---------------------------------------------------------------------------

describe("DealPipeline", () => {
  it("createDeal adds deal and emits event", () => {
    const bus = new EventBus();
    const pipeline = new DealPipeline(bus);

    const events: unknown[] = [];
    bus.subscribe("crm.deal_created", (e) => { events.push(e); });

    const deal = pipeline.createDeal({ name: "Acme Corp", arrUsd: 50000, stage: "lead", owner: "alice" });
    assert.ok(pipeline.get(deal.id) !== undefined, "deal must be retrievable");
    assert.equal(pipeline.list().length, 1);
    assert.equal(events.length, 1, "crm.deal_created event must be emitted");
    const payload = (events[0] as { payload: { dealId: string; name: string } }).payload;
    assert.equal(payload.dealId, deal.id);
    assert.equal(payload.name, "Acme Corp");
  });

  it("advance moves deal to next stage and emits event", () => {
    const bus = new EventBus();
    const pipeline = new DealPipeline(bus);

    const events: unknown[] = [];
    bus.subscribe("crm.deal_advanced", (e) => { events.push(e); });

    const deal = pipeline.createDeal({ name: "Beta Inc", arrUsd: 20000, stage: "lead", owner: "bob" });
    const updated = pipeline.advance(deal.id, "qualified");

    assert.equal(updated?.stage, "qualified", "stage must be updated");
    assert.equal(events.length, 1, "crm.deal_advanced event must be emitted");
    const payload = (events[0] as { payload: { fromStage: string; toStage: string } }).payload;
    assert.equal(payload.fromStage, "lead");
    assert.equal(payload.toStage, "qualified");
  });

  it("advance to closed_won emits crm.deal_closed with outcome won", () => {
    const bus = new EventBus();
    const pipeline = new DealPipeline(bus);

    const events: unknown[] = [];
    bus.subscribe("crm.deal_closed", (e) => { events.push(e); });

    const deal = pipeline.createDeal({ name: "Gamma LLC", arrUsd: 75000, stage: "negotiation", owner: "carol" });
    pipeline.advance(deal.id, "closed_won");

    assert.equal(events.length, 1, "crm.deal_closed event must be emitted");
    const payload = (events[0] as { payload: { outcome: string; arrUsd: number } }).payload;
    assert.equal(payload.outcome, "won");
    assert.equal(payload.arrUsd, 75000);
  });

  it("summary computes weighted ARR", () => {
    const bus = new EventBus();
    const pipeline = new DealPipeline(bus);

    pipeline.createDeal({ name: "Deal A", arrUsd: 100000, stage: "qualified", owner: "alice" });
    pipeline.createDeal({ name: "Deal B", arrUsd: 200000, stage: "proposal", owner: "bob" });

    const sum = pipeline.summary();
    // 100000 * 0.20 + 200000 * 0.45 = 20000 + 90000 = 110000
    assert.equal(sum.weightedArrUsd, 110000);
  });

  it("summary tracks closedWonArrUsd", () => {
    const bus = new EventBus();
    const pipeline = new DealPipeline(bus);

    const deal = pipeline.createDeal({ name: "Big Win", arrUsd: 500000, stage: "negotiation", owner: "dave" });
    pipeline.advance(deal.id, "closed_won");

    const sum = pipeline.summary();
    assert.equal(sum.closedWonArrUsd, 500000);
  });

  it("list with stage filter", () => {
    const bus = new EventBus();
    const pipeline = new DealPipeline(bus);

    pipeline.createDeal({ name: "Lead Deal", arrUsd: 10000, stage: "lead", owner: "alice" });
    pipeline.createDeal({ name: "Qualified Deal 1", arrUsd: 20000, stage: "qualified", owner: "bob" });
    pipeline.createDeal({ name: "Qualified Deal 2", arrUsd: 30000, stage: "qualified", owner: "carol" });

    const qualified = pipeline.list("qualified");
    assert.equal(qualified.length, 2);
    assert.ok(qualified.every((d) => d.stage === "qualified"));
  });
});

describe("RiskRegister", () => {
  it("raise creates risk entry with inherentScore", () => {
    const bus = new EventBus();
    const register = new RiskRegister(bus);

    const risk = register.raise({
      title: "Vendor outage",
      description: "Key vendor may go offline",
      category: "operational",
      domain: "infra",
      probability: 0.8,
      impact: 4,
      owner: "alice",
    });

    assert.equal(risk.inherentScore, 3.2);
    assert.equal(risk.status, "open");
    assert.ok(register.get(risk.id) !== undefined, "risk must be retrievable");
  });

  it("raise emits risk.raised event", () => {
    const bus = new EventBus();
    const register = new RiskRegister(bus);

    const events: unknown[] = [];
    bus.subscribe("risk.raised", (e) => { events.push(e); });

    const risk = register.raise({
      title: "Data breach",
      description: "Possible exposure",
      category: "compliance",
      domain: "security",
      probability: 0.3,
      impact: 5,
      owner: "bob",
    });

    assert.equal(events.length, 1, "risk.raised event must be emitted");
    const payload = (events[0] as { payload: { riskId: string } }).payload;
    assert.equal(payload.riskId, risk.id);
  });

  it("raise auto-escalates when score > threshold", () => {
    const bus = new EventBus();
    const register = new RiskRegister(bus);

    const events: unknown[] = [];
    bus.subscribe("risk.escalated", (e) => { events.push(e); });

    register.raise({
      title: "Regulatory penalty",
      description: "High likelihood, high impact",
      category: "compliance",
      domain: "legal",
      probability: 0.9,
      impact: 4,
      owner: "carol",
    });

    assert.equal(events.length, 1, "risk.escalated event must be emitted when score 3.6 > 3.0");
    const payload = (events[0] as { payload: { inherentScore: number } }).payload;
    assert.ok(payload.inherentScore > 3.0);
  });

  it("addMitigation sets status to mitigating", () => {
    const bus = new EventBus();
    const register = new RiskRegister(bus);

    const risk = register.raise({
      title: "Talent loss",
      description: "Key engineer may leave",
      category: "operational",
      domain: "hr",
      probability: 0.4,
      impact: 3,
      owner: "dave",
    });

    register.addMitigation(risk.id, {
      description: "Retention bonus",
      owner: "dave",
      dueDate: "2026-09-01",
    });

    const updated = register.get(risk.id);
    assert.equal(updated?.status, "mitigating");
    assert.equal(updated?.mitigations.length, 1);
  });

  it("setResidual emits risk.mitigated and updates score", () => {
    const bus = new EventBus();
    const register = new RiskRegister(bus);

    const events: unknown[] = [];
    bus.subscribe("risk.mitigated", (e) => { events.push(e); });

    const risk = register.raise({
      title: "Supply chain disruption",
      description: "Component shortage",
      category: "operational",
      domain: "supply",
      probability: 0.8,
      impact: 5,
      owner: "erin",
    });

    const updated = register.setResidual(risk.id, 0.2, 2);

    assert.equal(updated?.status, "mitigated");
    assert.equal(updated?.residualScore, 0.4);
    assert.equal(events.length, 1, "risk.mitigated event must be emitted");
    const payload = (events[0] as { payload: { residualScore: number } }).payload;
    assert.equal(payload.residualScore, 0.4);
  });

  it("topRisks sorts by residualScore descending", () => {
    const bus = new EventBus();
    const register = new RiskRegister(bus);

    register.raise({ title: "Low", description: "", category: "strategic", domain: "a", probability: 0.2, impact: 2, owner: "x" });
    register.raise({ title: "High", description: "", category: "strategic", domain: "b", probability: 0.9, impact: 5, owner: "y" });
    register.raise({ title: "Mid", description: "", category: "strategic", domain: "c", probability: 0.5, impact: 3, owner: "z" });

    const top = register.topRisks();
    assert.equal(top[0]?.title, "High");
    assert.ok(top[0]!.residualScore >= top[1]!.residualScore);
    assert.ok(top[1]!.residualScore >= top[2]!.residualScore);
  });

  it("list with status filter", () => {
    const bus = new EventBus();
    const register = new RiskRegister(bus);

    const r1 = register.raise({ title: "R1", description: "", category: "financial", domain: "a", probability: 0.2, impact: 2, owner: "x" });
    register.raise({ title: "R2", description: "", category: "financial", domain: "b", probability: 0.3, impact: 2, owner: "y" });

    register.updateStatus(r1.id, "accepted");

    const open = register.list("open");
    assert.equal(open.length, 1);
    assert.ok(open.every((r) => r.status === "open"));
  });
});

describe("seedCompany", () => {
  it("populates all modules", async () => {
    const { seedCompany } = await import("../scenarios/company.js");
    const olympus = new Olympus();
    seedCompany(olympus);
    assert.ok(olympus.ledger.listAccounts().length > 0);
    assert.ok(olympus.pipeline.list().length > 0);
    assert.ok(olympus.riskRegister.list().length > 0);
    assert.ok(olympus.sla.list().length > 0);
    assert.ok(olympus.capacity.listResources().length > 0);
    assert.ok(olympus.okr.list().length > 0);
  });

  it("produces a finite health composite in a realistic range", async () => {
    const { seedCompany } = await import("../scenarios/company.js");
    const olympus = new Olympus();
    seedCompany(olympus);
    const { composite } = olympus.health.score();
    assert.ok(Number.isFinite(composite));
    assert.ok(composite > 20 && composite < 95, `composite ${composite} out of range`);
  });

  it("creates a runway between 1 and 24 months", async () => {
    const { seedCompany } = await import("../scenarios/company.js");
    const olympus = new Olympus();
    seedCompany(olympus);
    const { runwayMonths } = olympus.ledger.burnRate();
    assert.ok(Number.isFinite(runwayMonths));
    assert.ok(runwayMonths > 0 && runwayMonths < 24, `runway ${runwayMonths} out of range`);
  });

  it("has at least one overallocated resource", async () => {
    const { seedCompany } = await import("../scenarios/company.js");
    const olympus = new Olympus();
    seedCompany(olympus);
    assert.ok(olympus.capacity.overallocatedResources().length >= 1);
  });
});

describe("BoardReportGenerator", () => {
  it("renders markdown with all sections on a seeded company", async () => {
    const { seedCompany } = await import("../scenarios/company.js");
    const olympus = new Olympus();
    seedCompany(olympus);
    const report = olympus.boardReport.render();
    assert.ok(report.includes("# Board Report"));
    assert.ok(report.includes("Executive Summary"));
    assert.ok(report.includes("Financial Position"));
    assert.ok(report.includes("Top Risks"));
    assert.ok(report.includes("Goals"));
    assert.ok(report.includes("Health Dimensions"));
  });

  it("uses the provided company name", async () => {
    const { seedCompany } = await import("../scenarios/company.js");
    const olympus = new Olympus();
    seedCompany(olympus);
    const report = olympus.boardReport.render({ companyName: "Helios Robotics" });
    assert.ok(report.includes("Helios Robotics"));
  });

  it("handles an empty company gracefully", () => {
    const olympus = new Olympus();
    const report = olympus.boardReport.render();
    assert.equal(typeof report, "string");
    assert.ok(report.includes("# Board Report"));
    assert.ok(report.includes("No data."));
  });

  it("GET /v1/report returns 200 markdown", async () => {
    const { OlympusApiServer } = await import("../api/server.js");
    const api = new OlympusApiServer();
    const port = await api.listen(0);
    try {
      const r = await fetch(`http://localhost:${port}/v1/report`);
      assert.equal(r.status, 200);
      const body = await r.text();
      assert.ok(body.includes("# Board Report"));
    } finally {
      await api.close();
    }
  });
});

describe("OutcomeTracker", () => {
  it("recordOutcome returns undefined for unknown decision", () => {
    const o = new Olympus();
    assert.equal(o.outcomes.recordOutcome("nope", 5), undefined);
  });

  it("recordOutcome computes absError and signedError", () => {
    const o = new Olympus();
    o.outcomes.recordPrediction("d1", "finance", 100);
    const r = o.outcomes.recordOutcome("d1", 120);
    assert.ok(r);
    assert.equal(r.absError, 20);
    assert.equal(r.signedError, 20);
  });

  it("negative signedError when actual below predicted", () => {
    const o = new Olympus();
    o.outcomes.recordPrediction("d1", "finance", 100);
    const r = o.outcomes.recordOutcome("d1", 80);
    assert.ok(r);
    assert.equal(r.signedError, -20);
    assert.equal(r.absError, 20);
  });

  it("emits outcome.recorded event", () => {
    const o = new Olympus();
    let seen: { decisionId?: string } | undefined;
    o.bus.subscribe("outcome.recorded", (e) => {
      seen = e.payload as { decisionId?: string };
    });
    o.outcomes.recordPrediction("d1", "finance", 100);
    o.outcomes.recordOutcome("d1", 110);
    assert.ok(seen);
    assert.equal(seen.decisionId, "d1");
  });

  it("feeds the calibration flywheel", () => {
    const o = new Olympus();
    o.outcomes.recordPrediction("d1", "finance", 100);
    o.outcomes.recordOutcome("d1", 180);
    assert.ok((o.memory.maeByDomain()["finance"] ?? 0) > 0);
  });

  it("meanAbsError averages errors for a domain", () => {
    const o = new Olympus();
    o.outcomes.recordPrediction("s1", "sales", 100);
    o.outcomes.recordOutcome("s1", 110); // err 10
    o.outcomes.recordPrediction("s2", "sales", 100);
    o.outcomes.recordOutcome("s2", 130); // err 30
    assert.equal(o.outcomes.meanAbsError("sales"), 20);
  });

  it("pendingPredictions excludes resolved", () => {
    const o = new Olympus();
    o.outcomes.recordPrediction("d1", "finance", 100);
    o.outcomes.recordPrediction("d2", "finance", 100);
    o.outcomes.recordOutcome("d1", 105);
    const pending = o.outcomes.pendingPredictions();
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.decisionId, "d2");
  });

  it("drift in outcomes can trigger autonomy demotion via CalibrationMonitor", () => {
    const o = new Olympus();
    // Grant finance some autonomy above L0.
    o.autonomy.setGrant({ domain: "finance", capability: "reforecast", level: 4 });
    assert.equal(o.autonomy.getGrant("finance", "reforecast")?.level, 4);

    let demotionFired = false;
    o.bus.subscribe("autonomy.calibration_demotion", () => {
      demotionFired = true;
    });

    // Record enough high-error outcomes to exceed maeThreshold (0.5) after
    // minObservations (3). Errors of 50 each => MAE 50 >> 0.5.
    for (let i = 0; i < 4; i++) {
      o.outcomes.recordPrediction(`f${i}`, "finance", 100);
      o.outcomes.recordOutcome(`f${i}`, 150);
    }

    assert.ok((o.memory.maeByDomain()["finance"] ?? 0) > 0.5);
    assert.ok(demotionFired, "expected calibration demotion event");
    assert.equal(o.autonomy.getGrant("finance", "reforecast")?.level, 0);
  });
});

describe("VendorRegistry", () => {
  it("add creates vendor and emits vendor.added", () => {
    const bus = new EventBus();
    const reg = new VendorRegistry(bus);
    let event: { vendorId?: string; name?: string; category?: string } | undefined;
    bus.subscribe("vendor.added", (e) => { event = e.payload as typeof event; });
    const v = reg.add({ name: "Acme", category: "software", annualValueUsd: 10_000, renewalDate: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) });
    assert.equal(v.name, "Acme");
    assert.equal(v.category, "software");
    assert.equal(v.status, "active");
    assert.ok(event);
    assert.equal(event!.name, "Acme");
  });

  it("recordSpend accumulates totalSpendUsd and emits event with runningTotal", () => {
    const bus = new EventBus();
    const reg = new VendorRegistry(bus);
    const v = reg.add({ name: "Stripe", category: "services", annualValueUsd: 5_000, renewalDate: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) });
    let payload: { vendorId?: string; amount?: number; runningTotal?: number } | undefined;
    bus.subscribe("vendor.spend_recorded", (e) => { payload = e.payload as typeof payload; });
    reg.recordSpend(v.id, 1_000);
    reg.recordSpend(v.id, 500);
    assert.equal(reg.get(v.id)!.totalSpendUsd, 1_500);
    assert.equal(payload!.runningTotal, 1_500);
  });

  it("evaluateRenewal flags expiring within window and emits renewal_due", () => {
    const bus = new EventBus();
    const reg = new VendorRegistry(bus, { renewalWindowDays: 60 });
    const renewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let renewalEvent: { vendorId?: string } | undefined;
    bus.subscribe("vendor.renewal_due", (e) => { renewalEvent = e.payload as typeof renewalEvent; });
    const v = reg.add({ name: "Zoom", category: "software", annualValueUsd: 6_000, renewalDate });
    assert.equal(v.status, "expiring");
    assert.ok(renewalEvent, "expected renewal_due event");
    assert.equal(renewalEvent!.vendorId, v.id);
  });

  it("evaluateRenewal marks expired when past", () => {
    const bus = new EventBus();
    const reg = new VendorRegistry(bus);
    const renewalDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const v = reg.add({ name: "OldVendor", category: "other", annualValueUsd: 1_000, renewalDate });
    assert.equal(v.status, "expired");
  });

  it("active when renewal beyond window", () => {
    const bus = new EventBus();
    const reg = new VendorRegistry(bus, { renewalWindowDays: 60 });
    const renewalDate = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const v = reg.add({ name: "Longterm", category: "infrastructure", annualValueUsd: 50_000, renewalDate });
    assert.equal(v.status, "active");
  });

  it("summary aggregates by category and totals", () => {
    const bus = new EventBus();
    const reg = new VendorRegistry(bus);
    const far = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    reg.add({ name: "A", category: "software", annualValueUsd: 10_000, renewalDate: far });
    reg.add({ name: "B", category: "software", annualValueUsd: 20_000, renewalDate: far });
    reg.add({ name: "C", category: "infrastructure", annualValueUsd: 5_000, renewalDate: far });
    const s = reg.summary();
    assert.equal(s.vendorCount, 3);
    assert.equal(s.totalAnnualCommitUsd, 35_000);
    assert.equal(s.byCategory["software"]!.count, 2);
    assert.equal(s.byCategory["software"]!.annualUsd, 30_000);
  });

  it("cancel excludes from summary vendorCount", () => {
    const bus = new EventBus();
    const reg = new VendorRegistry(bus);
    const far = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const v1 = reg.add({ name: "Keep", category: "services", annualValueUsd: 1_000, renewalDate: far });
    const v2 = reg.add({ name: "Cancel", category: "services", annualValueUsd: 2_000, renewalDate: far });
    reg.cancel(v2.id);
    const s = reg.summary();
    assert.equal(s.vendorCount, 1);
    assert.equal(s.totalAnnualCommitUsd, 1_000);
    void v1;
  });

  it("upcomingRenewals sorted soonest first", () => {
    const bus = new EventBus();
    const reg = new VendorRegistry(bus, { renewalWindowDays: 60 });
    const d30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const d10 = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const d50 = new Date(Date.now() + 50 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    reg.add({ name: "Mid", category: "software", annualValueUsd: 1_000, renewalDate: d30 });
    reg.add({ name: "Soon", category: "software", annualValueUsd: 1_000, renewalDate: d10 });
    reg.add({ name: "Later", category: "software", annualValueUsd: 1_000, renewalDate: d50 });
    const renewals = reg.upcomingRenewals();
    assert.equal(renewals.length, 3);
    assert.equal(renewals[0]!.name, "Soon");
    assert.equal(renewals[2]!.name, "Later");
  });
});

// ---------------------------------------------------------------------------
// PeopleRegistry
// ---------------------------------------------------------------------------

import { PeopleRegistry } from "../hr/people-registry.js";

describe("PeopleRegistry", () => {
  it("hire adds employee and emits hr.employee_joined", () => {
    const bus = new EventBus();
    const reg = new PeopleRegistry(bus);
    const events: unknown[] = [];
    bus.subscribe("hr.employee_joined", (e) => { events.push(e.payload); });

    const emp = reg.hire({
      name: "Alice Chen",
      role: "CTO",
      department: "engineering",
      level: "exec",
      baseCompUsd: 280_000,
      startDate: "2024-01-01",
    });

    assert.equal(emp.status, "active");
    assert.equal(events.length, 1);
    assert.equal((events[0] as { name: string }).name, "Alice Chen");
  });

  it("listActive excludes departed employees", () => {
    const bus = new EventBus();
    const reg = new PeopleRegistry(bus);

    const alice = reg.hire({ name: "Alice", role: "CTO", department: "eng", level: "exec", baseCompUsd: 200_000, startDate: "2024-01-01" });
    reg.hire({ name: "Bob", role: "SWE", department: "eng", level: "ic3", baseCompUsd: 150_000, startDate: "2024-01-01" });
    reg.depart(alice.id, "resigned");

    const active = reg.listActive();
    assert.equal(active.length, 1);
    assert.equal(active[0]!.name, "Bob");
  });

  it("depart sets status departed and emits hr.employee_departed", () => {
    const bus = new EventBus();
    const reg = new PeopleRegistry(bus);
    const events: unknown[] = [];
    bus.subscribe("hr.employee_departed", (e) => { events.push(e.payload); });

    const emp = reg.hire({ name: "Carol", role: "PM", department: "product", level: "ic3", baseCompUsd: 140_000, startDate: "2024-01-01" });
    const departed = reg.depart(emp.id, "laid off");

    assert.equal(departed?.status, "departed");
    assert.ok(departed?.endDate);
    assert.equal(events.length, 1);
    assert.equal((events[0] as { reason: string }).reason, "laid off");
  });

  it("addOpenRole and listOpenRoles", () => {
    const bus = new EventBus();
    const reg = new PeopleRegistry(bus);

    reg.addOpenRole({ title: "Staff Engineer", department: "engineering", level: "ic5", targetCompUsd: 210_000, openedAt: "2025-01-01" });
    reg.addOpenRole({ title: "PM", department: "product", level: "ic3", targetCompUsd: 160_000, openedAt: "2025-01-01" });

    assert.equal(reg.listOpenRoles().length, 2);
    assert.equal(reg.listOpenRoles("engineering").length, 1);
    assert.equal(reg.listOpenRoles("product").length, 1);
    assert.equal(reg.listOpenRoles("sales").length, 0);
  });

  it("orgSummary aggregates headcount and comp by department", () => {
    const bus = new EventBus();
    const reg = new PeopleRegistry(bus);

    reg.hire({ name: "Alice", role: "CTO", department: "engineering", level: "exec", baseCompUsd: 200_000, startDate: "2024-01-01" });
    reg.hire({ name: "Bob", role: "SWE", department: "engineering", level: "ic3", baseCompUsd: 150_000, startDate: "2024-01-01" });
    reg.hire({ name: "Carol", role: "PM", department: "product", level: "ic3", baseCompUsd: 140_000, startDate: "2024-01-01" });
    reg.addOpenRole({ title: "SWE", department: "engineering", level: "ic4", targetCompUsd: 180_000, openedAt: "2025-01-01" });

    const summary = reg.orgSummary();
    assert.equal(summary.totalHeadcount, 3);
    assert.equal(summary.totalOpenRoles, 1);
    assert.equal(summary.totalAnnualCompUsd, 490_000);

    const engDept = summary.byDepartment.find((d) => d.department === "engineering")!;
    assert.equal(engDept.headcount, 2);
    assert.equal(engDept.totalCompUsd, 350_000);
    assert.equal(engDept.averageCompUsd, 175_000);
    assert.equal(engDept.openRoles, 1);
  });

  it("reportingChain follows managerId upward", () => {
    const bus = new EventBus();
    const reg = new PeopleRegistry(bus);

    const cto = reg.hire({ id: "cto", name: "Alice", role: "CTO", department: "engineering", level: "exec", baseCompUsd: 280_000, startDate: "2024-01-01" });
    const mgr = reg.hire({ id: "mgr", name: "Bob", role: "EM", department: "engineering", level: "m1", baseCompUsd: 195_000, managerId: cto.id, startDate: "2024-01-01" });
    const ic = reg.hire({ id: "ic1", name: "Priya", role: "SWE", department: "engineering", level: "ic4", baseCompUsd: 175_000, managerId: mgr.id, startDate: "2024-01-01" });

    const chain = reg.reportingChain(ic.id);
    assert.equal(chain.length, 3);
    assert.equal(chain[0]!.id, ic.id);
    assert.equal(chain[1]!.id, mgr.id);
    assert.equal(chain[2]!.id, cto.id);
  });

  it("fillOpenRole removes the role", () => {
    const bus = new EventBus();
    const reg = new PeopleRegistry(bus);

    const role = reg.addOpenRole({ id: "role-1", title: "Engineer", department: "engineering", level: "ic3", targetCompUsd: 150_000, openedAt: "2025-01-01" });
    const emp = reg.hire({ name: "New Hire", role: "Engineer", department: "engineering", level: "ic3", baseCompUsd: 150_000, startDate: "2025-01-01" });

    assert.equal(reg.listOpenRoles().length, 1);
    const filled = reg.fillOpenRole(role.id, emp.id);
    assert.equal(filled, true);
    assert.equal(reg.listOpenRoles().length, 0);

    // Returns false when role not found
    assert.equal(reg.fillOpenRole("nonexistent", emp.id), false);
  });
});

describe("Operator console panels", () => {
  it("dashboard HTML surfaces the Company Health hero and Business Modules grid", async () => {
    const { DASHBOARD_HTML } = await import("../api/dashboard.js");
    assert.ok(DASHBOARD_HTML.includes("Company Health"), "expected Company Health hero");
    assert.ok(DASHBOARD_HTML.includes("refreshHealth"), "expected refreshHealth fetch fn");
    assert.ok(DASHBOARD_HTML.includes("Business Modules"), "expected Business Modules grid");
    assert.ok(DASHBOARD_HTML.includes("refreshModules"), "expected refreshModules fetch fn");
  });

  it("dashboard HTML surfaces the Board Report viewer", async () => {
    const { DASHBOARD_HTML } = await import("../api/dashboard.js");
    assert.ok(DASHBOARD_HTML.includes("Board Report"), "expected Board Report button");
    assert.ok(DASHBOARD_HTML.includes("/v1/report"), "expected /v1/report fetch");
    assert.ok(DASHBOARD_HTML.includes("renderMarkdown"), "expected renderMarkdown fn");
  });
});

// ---------------------------------------------------------------------------
// SprintTracker — project work items, sprints, velocity, and burn-down
// ---------------------------------------------------------------------------

describe("SprintTracker", () => {
  it("addProject and listProjects", () => {
    const bus = new EventBus();
    const tracker = new SprintTracker(bus);

    const p = tracker.addProject({ name: "Alpha", description: "First project", status: "active" });
    assert.equal(p.name, "Alpha");
    assert.ok(typeof p.id === "string" && p.id.length > 0);
    assert.ok(typeof p.createdAt === "string");

    const list = tracker.listProjects();
    assert.equal(list.length, 1);
    assert.equal(list[0]!.id, p.id);
  });

  it("addItem and listItems with status filter", () => {
    const bus = new EventBus();
    const tracker = new SprintTracker(bus);

    const p = tracker.addProject({ name: "Beta", description: "Test project", status: "active" });
    tracker.addItem({ title: "Story A", type: "story", status: "backlog", priority: "high", projectId: p.id, storyPoints: 5 });
    tracker.addItem({ title: "Bug B", type: "bug", status: "in-progress", priority: "critical", projectId: p.id, storyPoints: 3 });
    tracker.addItem({ title: "Task C", type: "task", status: "done", priority: "low", projectId: p.id, storyPoints: 2 });

    assert.equal(tracker.listItems(p.id).length, 3);
    assert.equal(tracker.listItems(p.id, "backlog").length, 1);
    assert.equal(tracker.listItems(p.id, "done").length, 1);
    assert.equal(tracker.listItems(p.id, "in-progress").length, 1);
    assert.equal(tracker.listItems("non-existent").length, 0);
  });

  it("updateItemStatus to done emits project.item_completed with storyPoints", () => {
    const bus = new EventBus();
    const tracker = new SprintTracker(bus);

    const events: unknown[] = [];
    bus.subscribe("project.item_completed", (e) => { events.push(e.payload); });

    const p = tracker.addProject({ name: "Gamma", description: "Test", status: "active" });
    const item = tracker.addItem({ title: "Feature X", type: "story", status: "in-progress", priority: "medium", projectId: p.id, storyPoints: 8 });

    const updated = tracker.updateItemStatus(item.id, "done");
    assert.ok(updated);
    assert.equal(updated.status, "done");
    assert.ok(typeof updated.completedAt === "string");

    assert.equal(events.length, 1);
    const evt = events[0] as { itemId: string; storyPoints: number; projectId: string };
    assert.equal(evt.itemId, item.id);
    assert.equal(evt.storyPoints, 8);
    assert.equal(evt.projectId, p.id);
  });

  it("assignItemToSprint links item to sprint", () => {
    const bus = new EventBus();
    const tracker = new SprintTracker(bus);

    const p = tracker.addProject({ name: "Delta", description: "Test", status: "active" });
    const sprint = tracker.addSprint({ id: "s1", projectId: p.id, name: "Sprint 1", startDate: "2026-06-01", endDate: "2026-06-14", status: "active", plannedPoints: 20 });
    const item = tracker.addItem({ title: "Feature Y", type: "story", status: "backlog", priority: "high", projectId: p.id, storyPoints: 5 });

    assert.equal(item.sprintId, undefined);
    const linked = tracker.assignItemToSprint(item.id, sprint.id);
    assert.ok(linked);
    assert.equal(linked.sprintId, sprint.id);
  });

  it("completeSprint computes velocity and emits sprint.completed", () => {
    const bus = new EventBus();
    const tracker = new SprintTracker(bus);

    const sprintEvents: unknown[] = [];
    bus.subscribe("sprint.completed", (e) => { sprintEvents.push(e.payload); });

    const p = tracker.addProject({ name: "Epsilon", description: "Test", status: "active" });
    tracker.addSprint({ id: "s2", projectId: p.id, name: "Sprint 2", startDate: "2026-06-01", endDate: "2026-06-14", status: "active", plannedPoints: 40, completedPoints: 32 });

    const completed = tracker.completeSprint("s2");
    assert.ok(completed);
    assert.equal(completed.status, "completed");
    assert.equal(completed.velocity, 32 / 40);

    assert.equal(sprintEvents.length, 1);
    const evt = sprintEvents[0] as { sprintId: string; velocity: number; plannedPoints: number; completedPoints: number };
    assert.equal(evt.sprintId, "s2");
    assert.equal(evt.plannedPoints, 40);
    assert.equal(evt.completedPoints, 32);
    assert.equal(evt.velocity, 0.8);
  });

  it("projectSummary aggregates counts and velocity", () => {
    const bus = new EventBus();
    const tracker = new SprintTracker(bus);

    const p = tracker.addProject({ name: "Zeta", description: "Test", status: "active" });

    // Completed sprint with known velocity
    tracker.addSprint({ id: "s3", projectId: p.id, name: "Sprint 3", startDate: "2026-05-01", endDate: "2026-05-14", status: "completed", plannedPoints: 20, completedPoints: 18, velocity: 0.9 });
    // Active sprint
    tracker.addSprint({ id: "s4", projectId: p.id, name: "Sprint 4", startDate: "2026-06-01", endDate: "2026-06-14", status: "active", plannedPoints: 20 });

    tracker.addItem({ title: "A", type: "story", status: "backlog", priority: "low", projectId: p.id, storyPoints: 3 });
    tracker.addItem({ title: "B", type: "story", status: "in-progress", priority: "medium", projectId: p.id, storyPoints: 5 });
    const item3 = tracker.addItem({ title: "C", type: "bug", status: "in-progress", priority: "high", projectId: p.id, storyPoints: 2 });
    tracker.updateItemStatus(item3.id, "done");

    const summary = tracker.projectSummary(p.id);
    assert.ok(summary);
    assert.equal(summary.totalItems, 3);
    assert.equal(summary.completedItems, 1);
    assert.equal(summary.inProgressItems, 1);
    assert.equal(summary.backlogItems, 1);
    assert.equal(summary.completedStoryPoints, 2);
    assert.equal(summary.averageVelocity, 0.9);
    assert.ok(summary.activeSprint);
    assert.equal(summary.activeSprint.id, "s4");

    // Non-existent project returns undefined
    assert.equal(tracker.projectSummary("no-such"), undefined);
  });
});

// ---------------------------------------------------------------------------
// CustomerSuccessTracker
// ---------------------------------------------------------------------------

describe("CustomerSuccessTracker", () => {
  it("addAccount computes health score and riskTier", () => {
    const bus = new EventBus();
    const cs = new CustomerSuccessTracker(bus);
    const account = cs.addAccount({
      name: "Acme Corp",
      arrUsd: 100_000,
      openTickets: 0,
      daysSinceLastActivity: 3,
      paymentStatus: "current",
      npsScore: 80,
      lastQbrDate: new Date().toISOString().split("T")[0]!,
    });
    assert.ok(account.healthScore > 70, `healthScore should be healthy, got ${account.healthScore}`);
    assert.equal(account.riskTier, "healthy");
  });

  it("payment overdue reduces health score", () => {
    const bus = new EventBus();
    const cs = new CustomerSuccessTracker(bus);
    const current = cs.addAccount({ name: "A", arrUsd: 50_000, openTickets: 0, daysSinceLastActivity: 0, paymentStatus: "current" });
    const overdue = cs.addAccount({ name: "B", arrUsd: 50_000, openTickets: 0, daysSinceLastActivity: 0, paymentStatus: "overdue" });
    assert.ok(overdue.healthScore < current.healthScore, "overdue payment should lower health score");
  });

  it("churn risk event emitted when score below threshold", () => {
    const bus = new EventBus();
    const cs = new CustomerSuccessTracker(bus, { churnRiskThreshold: 40 });
    const events: unknown[] = [];
    bus.subscribe("cs.churn_risk_flagged", (e) => { events.push(e); });
    // Suspended payment + many tickets + inactive = very low score
    cs.addAccount({
      name: "Risky Co",
      arrUsd: 80_000,
      openTickets: 6,
      daysSinceLastActivity: 60,
      paymentStatus: "suspended",
    });
    assert.ok(events.length > 0, "cs.churn_risk_flagged should be emitted for at-risk account");
  });

  it("recordNPS updates npsScore and recomputes", () => {
    const bus = new EventBus();
    const cs = new CustomerSuccessTracker(bus);
    const account = cs.addAccount({ name: "Loyal Corp", arrUsd: 100_000, openTickets: 0, daysSinceLastActivity: 1, paymentStatus: "current" });
    const before = account.healthScore;
    const npsEvents: unknown[] = [];
    bus.subscribe("cs.nps_recorded", (e) => { npsEvents.push(e); });
    const updated = cs.recordNPS(account.accountId, 90);
    assert.ok(updated !== undefined, "updated account should exist");
    assert.equal(updated!.npsScore, 90);
    assert.ok(updated!.healthScore >= before, "high NPS should not decrease health score");
    assert.ok(npsEvents.length > 0, "cs.nps_recorded event should be emitted");
  });

  it("summary aggregates by risk tier", () => {
    const bus = new EventBus();
    const cs = new CustomerSuccessTracker(bus);
    // Healthy
    cs.addAccount({ name: "H1", arrUsd: 200_000, openTickets: 0, daysSinceLastActivity: 1, paymentStatus: "current", npsScore: 90, lastQbrDate: new Date().toISOString().split("T")[0]! });
    // Churned
    cs.addAccount({ name: "C1", arrUsd: 50_000, openTickets: 6, daysSinceLastActivity: 90, paymentStatus: "suspended" });
    const s = cs.summary();
    assert.equal(s.totalAccounts, 2);
    assert.equal(s.totalArrUsd, 250_000);
    assert.ok(s.byRiskTier["healthy"].count >= 1);
    assert.ok(s.churnRiskArrUsd >= 0);
    assert.ok(s.averageHealthScore > 0);
  });

  it("churnRiskAccounts sorted by ARR descending", () => {
    const bus = new EventBus();
    const cs = new CustomerSuccessTracker(bus);
    // All at-risk or worse
    cs.addAccount({ name: "Small", arrUsd: 20_000, openTickets: 5, daysSinceLastActivity: 50, paymentStatus: "overdue" });
    cs.addAccount({ name: "Large", arrUsd: 200_000, openTickets: 5, daysSinceLastActivity: 50, paymentStatus: "overdue" });
    cs.addAccount({ name: "Medium", arrUsd: 100_000, openTickets: 5, daysSinceLastActivity: 50, paymentStatus: "overdue" });
    const risky = cs.churnRiskAccounts();
    assert.ok(risky.length >= 2, "should return at-risk accounts");
    for (let i = 1; i < risky.length; i++) {
      assert.ok(risky[i - 1]!.arrUsd >= risky[i]!.arrUsd, "accounts should be sorted by ARR descending");
    }
  });
});

// ---------------------------------------------------------------------------
// ProductAnalytics
// ---------------------------------------------------------------------------

describe("ProductAnalytics", () => {
  it("registerFeature and listFeatures", async () => {
    const { ProductAnalytics } = await import("../product/product-analytics.js");
    const bus = new EventBus();
    const pa = new ProductAnalytics(bus);
    pa.registerFeature({ key: "sso", name: "Single Sign-On", launchedAt: "2026-01-01", gated: false });
    pa.registerFeature({ key: "api_v2", name: "API v2", launchedAt: "2026-02-01", gated: false });
    const features = pa.listFeatures();
    assert.equal(features.length, 2);
    assert.ok(features.some((f) => f.key === "sso"));
    assert.ok(features.some((f) => f.key === "api_v2"));
  });

  it("recordUsage emits product.feature_used", async () => {
    const { ProductAnalytics } = await import("../product/product-analytics.js");
    const bus = new EventBus();
    const pa = new ProductAnalytics(bus);
    pa.registerFeature({ key: "bulk_export", name: "Bulk Export", launchedAt: "2026-01-01", gated: false });

    const emitted: unknown[] = [];
    bus.subscribe("product.feature_used", (e) => { emitted.push(e.payload); return; });

    const event = pa.recordUsage("bulk_export", "acct-1");
    assert.ok(event, "should return a UsageEvent");
    assert.equal(emitted.length, 1);
    assert.deepEqual((emitted[0] as Record<string, unknown>).featureKey, "bulk_export");
    assert.deepEqual((emitted[0] as Record<string, unknown>).accountId, "acct-1");
  });

  it("gated feature blocks unallowed accounts", async () => {
    const { ProductAnalytics } = await import("../product/product-analytics.js");
    const bus = new EventBus();
    const pa = new ProductAnalytics(bus);
    pa.registerFeature({ key: "advanced", name: "Advanced", launchedAt: "2026-01-01", gated: true, allowedAccounts: ["acct-allowed"] });

    const result = pa.recordUsage("advanced", "acct-blocked");
    assert.equal(result, undefined, "blocked account should get undefined");
    const allowed = pa.recordUsage("advanced", "acct-allowed");
    assert.ok(allowed, "allowed account should succeed");
  });

  it("grantAccess allows previously blocked account", async () => {
    const { ProductAnalytics } = await import("../product/product-analytics.js");
    const bus = new EventBus();
    const pa = new ProductAnalytics(bus);
    pa.registerFeature({ key: "beta", name: "Beta Feature", launchedAt: "2026-01-01", gated: true });

    assert.equal(pa.recordUsage("beta", "acct-new"), undefined, "should be blocked before grant");
    pa.grantAccess("beta", "acct-new");
    const event = pa.recordUsage("beta", "acct-new");
    assert.ok(event, "should succeed after grant");
  });

  it("getAdoption computes adoptionRate", async () => {
    const { ProductAnalytics } = await import("../product/product-analytics.js");
    const bus = new EventBus();
    const pa = new ProductAnalytics(bus);
    pa.registerFeature({ key: "sso", name: "SSO", launchedAt: "2026-01-01", gated: false });
    pa.setTotalAccounts(10);
    pa.recordUsage("sso", "acct-1");
    pa.recordUsage("sso", "acct-2");
    pa.recordUsage("sso", "acct-2"); // duplicate account

    const adoption = pa.getAdoption("sso");
    assert.ok(adoption);
    assert.equal(adoption.totalUses, 3);
    assert.equal(adoption.uniqueAccounts, 2);
    assert.equal(adoption.adoptionRate, 0.2); // 2 / 10
  });

  it("milestone_reached emitted at 10 uses", async () => {
    const { ProductAnalytics } = await import("../product/product-analytics.js");
    const bus = new EventBus();
    const pa = new ProductAnalytics(bus);
    pa.registerFeature({ key: "api_v2", name: "API v2", launchedAt: "2026-01-01", gated: false });

    const milestones: unknown[] = [];
    bus.subscribe("product.milestone_reached", (e) => { milestones.push(e.payload); return; });

    for (let i = 0; i < 10; i++) pa.recordUsage("api_v2", "power-user");

    assert.equal(milestones.length, 1);
    const m = milestones[0] as Record<string, unknown>;
    assert.equal(m.milestone, 10);
    assert.equal(m.featureKey, "api_v2");
    assert.equal(m.accountId, "power-user");
    assert.equal(m.usageCount, 10);
  });

  it("topFeatures sorted by totalUses", async () => {
    const { ProductAnalytics } = await import("../product/product-analytics.js");
    const bus = new EventBus();
    const pa = new ProductAnalytics(bus);
    pa.registerFeature({ key: "a", name: "A", launchedAt: "2026-01-01", gated: false });
    pa.registerFeature({ key: "b", name: "B", launchedAt: "2026-01-01", gated: false });
    pa.registerFeature({ key: "c", name: "C", launchedAt: "2026-01-01", gated: false });

    for (let i = 0; i < 3; i++) pa.recordUsage("a", "u1");
    for (let i = 0; i < 7; i++) pa.recordUsage("b", "u1");
    for (let i = 0; i < 1; i++) pa.recordUsage("c", "u1");

    const top = pa.topFeatures(3);
    assert.equal(top[0]!.featureKey, "b");
    assert.equal(top[1]!.featureKey, "a");
    assert.equal(top[2]!.featureKey, "c");
  });
});

// ---------------------------------------------------------------------------
// ComplianceTracker
// ---------------------------------------------------------------------------

describe("ComplianceTracker", () => {
  it("addControl starts as not-started", () => {
    const bus = new EventBus();
    const ct = new ComplianceTracker(bus);
    const ctrl = ct.addControl({
      title: "Test Control",
      description: "A test control.",
      framework: "SOC2",
      category: "Access",
      owner: "security-team",
    });
    assert.equal(ctrl.status, "not-started");
  });

  it("recordEvidence sets status to compliant", () => {
    const bus = new EventBus();
    const ct = new ComplianceTracker(bus);
    const ctrl = ct.addControl({
      title: "Auth Control",
      description: "MFA enforcement.",
      framework: "SOC2",
      category: "Access",
      reviewCycleDays: 90,
      owner: "security-team",
    });
    // Record evidence just now
    ct.recordEvidence(ctrl.id, {
      type: "screenshot",
      description: "MFA screenshot",
      collectedAt: new Date().toISOString(),
      collectedBy: "security-team",
    });
    assert.equal(ct.get(ctrl.id)!.status, "compliant");
  });

  it("stale evidence triggers non-compliant status and gap_detected event", () => {
    const bus = new EventBus();
    const ct = new ComplianceTracker(bus);
    const ctrl = ct.addControl({
      title: "Patch Management",
      description: "Timely patching.",
      framework: "ISO27001",
      category: "Operations",
      reviewCycleDays: 20,
      owner: "it-ops",
    });
    // Record evidence 40 days ago
    const staleDate = new Date(new Date("2026-06-23").getTime() - 40 * 24 * 60 * 60 * 1000);
    ct.recordEvidence(ctrl.id, {
      type: "report",
      description: "Old patch report",
      collectedAt: staleDate.toISOString(),
      collectedBy: "it-ops",
    });

    const gapEvents: unknown[] = [];
    bus.subscribe("compliance.gap_detected", (e) => { gapEvents.push(e.payload); });

    const status = ct.checkControl(ctrl.id, new Date("2026-06-23"));
    assert.equal(status, "non-compliant");
    assert.equal(ct.get(ctrl.id)!.status, "non-compliant");
    assert.ok(gapEvents.length > 0, "gap_detected event should have been emitted");
  });

  it("checkGaps returns only non-compliant controls", () => {
    const bus = new EventBus();
    const ct = new ComplianceTracker(bus);
    // Compliant control
    const c1 = ct.addControl({ title: "C1", description: "d", framework: "SOC2", category: "cat", reviewCycleDays: 90, owner: "team" });
    ct.recordEvidence(c1.id, { type: "report", description: "recent", collectedAt: new Date().toISOString(), collectedBy: "team" });
    // Not-started control
    ct.addControl({ title: "C2", description: "d", framework: "SOC2", category: "cat", reviewCycleDays: 90, owner: "team" });
    // Non-compliant control
    const c3 = ct.addControl({ title: "C3", description: "d", framework: "ISO27001", category: "cat", reviewCycleDays: 30, owner: "team" });
    const stale = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000);
    ct.recordEvidence(c3.id, { type: "report", description: "stale", collectedAt: stale.toISOString(), collectedBy: "team" });

    const gaps = ct.checkGaps();
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0]!.id, c3.id);
  });

  it("summary computes overallScore", () => {
    const bus = new EventBus();
    const ct = new ComplianceTracker(bus);
    // 2 compliant
    for (let i = 0; i < 2; i++) {
      const c = ct.addControl({ title: `C${i}`, description: "d", framework: "SOC2", category: "cat", reviewCycleDays: 90, owner: "team" });
      ct.recordEvidence(c.id, { type: "report", description: "recent", collectedAt: new Date().toISOString(), collectedBy: "team" });
    }
    // 2 not-started
    for (let i = 0; i < 2; i++) {
      ct.addControl({ title: `N${i}`, description: "d", framework: "GDPR", category: "cat", reviewCycleDays: 90, owner: "team" });
    }
    const s = ct.summary();
    assert.equal(s.totalControls, 4);
    assert.equal(s.compliant, 2);
    assert.equal(s.notStarted, 2);
    assert.equal(s.overallScore, 50);
  });

  it("list with framework filter", () => {
    const bus = new EventBus();
    const ct = new ComplianceTracker(bus);
    ct.addControl({ title: "SOC2 ctrl", description: "d", framework: "SOC2", category: "cat", owner: "team" });
    ct.addControl({ title: "GDPR ctrl", description: "d", framework: "GDPR", category: "cat", owner: "team" });
    ct.addControl({ title: "SOC2 ctrl2", description: "d", framework: "SOC2", category: "cat", owner: "team" });

    const soc2 = ct.list("SOC2");
    assert.equal(soc2.length, 2);
    assert.ok(soc2.every((c) => c.framework === "SOC2"));

    const all = ct.list();
    assert.equal(all.length, 3);
  });
});

// ---------------------------------------------------------------------------
// CompetitiveIntel
// ---------------------------------------------------------------------------

describe("CompetitiveIntel", () => {
  it("addCompetitor and listCompetitors", () => {
    const bus = new EventBus();
    const ci = new CompetitiveIntel(bus);

    const apex = ci.addCompetitor({ name: "Apex Systems", tags: ["enterprise"] });
    const nova = ci.addCompetitor({ id: "nova-1", name: "NovaTech" });

    assert.ok(typeof apex.id === "string" && apex.id.length > 0);
    assert.equal(apex.name, "Apex Systems");
    assert.equal(apex.winRate, 0);
    assert.ok(typeof apex.addedAt === "string");

    assert.equal(nova.id, "nova-1");

    const list = ci.listCompetitors();
    assert.equal(list.length, 2);
    assert.ok(list.some((c) => c.name === "Apex Systems"));
    assert.ok(list.some((c) => c.name === "NovaTech"));
  });

  it("addSignal emits event and appears in signalsFor", () => {
    const bus = new EventBus();
    const ci = new CompetitiveIntel(bus);
    const comp = ci.addCompetitor({ name: "Rival Co" });

    const emitted: unknown[] = [];
    bus.subscribe("competitive.signal_added", (e) => { emitted.push(e.payload); });

    const signal = ci.addSignal({
      competitorId: comp.id,
      type: "pricing_change",
      title: "Rival drops price",
      summary: "Rival Co cut pricing by 10%",
      sentiment: "negative",
    });

    assert.ok(signal, "signal should be returned");
    assert.equal(signal!.competitorId, comp.id);
    assert.equal(signal!.type, "pricing_change");
    assert.ok(typeof signal!.recordedAt === "string");

    assert.equal(emitted.length, 1);
    const payload = emitted[0] as { signalId: string; competitor: string; type: string; sentiment: string };
    assert.equal(payload.signalId, signal!.id);
    assert.equal(payload.competitor, "Rival Co");
    assert.equal(payload.type, "pricing_change");
    assert.equal(payload.sentiment, "negative");

    const signals = ci.signalsFor(comp.id);
    assert.equal(signals.length, 1);
    assert.equal(signals[0]!.id, signal!.id);
  });

  it("recordWinLoss updates winRate and emits event", () => {
    const bus = new EventBus();
    const ci = new CompetitiveIntel(bus);
    const comp = ci.addCompetitor({ name: "Apex Systems" });

    const emitted: unknown[] = [];
    bus.subscribe("competitive.win_loss_recorded", (e) => { emitted.push(e.payload); });

    const r1 = ci.recordWinLoss({ dealId: "deal-1", competitorId: comp.id, outcome: "win", reason: "Better support", dealArrUsd: 100_000 });
    assert.ok(r1, "record should be returned");
    assert.equal(r1!.outcome, "win");

    const r2 = ci.recordWinLoss({ dealId: "deal-2", competitorId: comp.id, outcome: "loss", reason: "Price undercut" });
    assert.ok(r2);

    // 1 win, 1 loss → 50%
    const updated = ci.getCompetitor(comp.id);
    assert.ok(updated);
    assert.equal(updated!.winRate, 0.5);

    assert.equal(emitted.length, 2);
    const payload = emitted[0] as { dealId: string; outcome: string; competitor: string; reason: string };
    assert.equal(payload.dealId, "deal-1");
    assert.equal(payload.outcome, "win");
    assert.equal(payload.competitor, "Apex Systems");
  });

  it("summaryFor aggregates signals and win/loss", () => {
    const bus = new EventBus();
    const ci = new CompetitiveIntel(bus);
    const comp = ci.addCompetitor({ name: "LegacyCorp" });

    ci.addSignal({ competitorId: comp.id, type: "funding", title: "Funding cut", summary: "Series C failed", sentiment: "positive" });
    ci.addSignal({ competitorId: comp.id, type: "news", title: "CEO leaves", summary: "CEO announced departure", sentiment: "positive" });

    ci.recordWinLoss({ dealId: "d1", competitorId: comp.id, outcome: "win", reason: "Customer migrated from legacy" });
    ci.recordWinLoss({ dealId: "d2", competitorId: comp.id, outcome: "win", reason: "Better roadmap" });
    ci.recordWinLoss({ dealId: "d3", competitorId: comp.id, outcome: "loss", reason: "Switching cost too high" });

    const summary = ci.summaryFor(comp.id);
    assert.ok(summary, "summary should exist");
    assert.equal(summary!.competitor.name, "LegacyCorp");
    assert.equal(summary!.signals.length, 2);
    assert.equal(summary!.winLoss.length, 3);
    assert.equal(summary!.wins, 2);
    assert.equal(summary!.losses, 1);
    // 2/(2+1) ≈ 0.667
    assert.ok(Math.abs(summary!.computedWinRate - 2 / 3) < 0.001);
  });

  it("recentSignals returns last N sorted desc", () => {
    const bus = new EventBus();
    const ci = new CompetitiveIntel(bus);
    const c1 = ci.addCompetitor({ name: "A" });
    const c2 = ci.addCompetitor({ name: "B" });

    for (let i = 0; i < 7; i++) {
      ci.addSignal({ competitorId: c1.id, type: "news", title: `Signal c1-${i}`, summary: "x", sentiment: "neutral" });
    }
    for (let i = 0; i < 5; i++) {
      ci.addSignal({ competitorId: c2.id, type: "news", title: `Signal c2-${i}`, summary: "x", sentiment: "neutral" });
    }

    // Default N=10 — should return 10 of 12 total
    const recent10 = ci.recentSignals();
    assert.equal(recent10.length, 10);

    // Top 3 only
    const recent3 = ci.recentSignals(3);
    assert.equal(recent3.length, 3);

    // Sorted descending
    for (let i = 1; i < recent10.length; i++) {
      assert.ok(recent10[i - 1]!.recordedAt >= recent10[i]!.recordedAt, "signals should be sorted desc");
    }
  });

  it("addSignal returns undefined for unknown competitor", () => {
    const bus = new EventBus();
    const ci = new CompetitiveIntel(bus);

    const result = ci.addSignal({
      competitorId: "nonexistent-id",
      type: "news",
      title: "Ghost signal",
      summary: "Should not be created",
      sentiment: "neutral",
    });

    assert.equal(result, undefined);
    assert.equal(ci.recentSignals().length, 0);
  });
});

// ---------------------------------------------------------------------------
// IncidentManager
// ---------------------------------------------------------------------------

describe("IncidentManager", () => {
  it("openIncident emits incident.opened", () => {
    const bus = new EventBus();
    const mgr = new IncidentManager(bus);
    const events: unknown[] = [];
    bus.subscribe("incident.opened", (e) => { events.push(e.payload); });

    const inc = mgr.openIncident({
      title: "Database down",
      description: "All queries failing",
      severity: "SEV1",
      occurredAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      detectedAt: new Date().toISOString(),
      affectedServices: ["api"],
    });

    assert.equal(events.length, 1);
    const payload = events[0] as { incidentId: string; title: string; severity: string };
    assert.equal(payload.incidentId, inc.id);
    assert.equal(payload.title, "Database down");
    assert.equal(payload.severity, "SEV1");
    assert.equal(inc.status, "detected");
  });

  it("acknowledge → mitigate → resolve lifecycle sets timestamps", () => {
    const bus = new EventBus();
    const mgr = new IncidentManager(bus);

    const inc = mgr.openIncident({
      title: "High latency",
      description: "p99 > 2s",
      severity: "SEV2",
      occurredAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      detectedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      affectedServices: ["api"],
    });

    const acked = mgr.acknowledge(inc.id, "Alice");
    assert.ok(acked, "acknowledge should return incident");
    assert.equal(acked!.status, "acknowledged");
    assert.ok(acked!.acknowledgedAt, "acknowledgedAt should be set");
    assert.equal(acked!.commander, "Alice");

    const mitigated = mgr.mitigate(inc.id);
    assert.ok(mitigated);
    assert.equal(mitigated!.status, "mitigated");
    assert.ok(mitigated!.mitigatedAt, "mitigatedAt should be set");

    const resolved = mgr.resolve(inc.id);
    assert.ok(resolved);
    assert.equal(resolved!.status, "resolved");
    assert.ok(resolved!.resolvedAt, "resolvedAt should be set");
  });

  it("resolve emits incident.resolved with mttr computed", () => {
    const bus = new EventBus();
    const mgr = new IncidentManager(bus);

    const resolvedEvents: unknown[] = [];
    bus.subscribe("incident.resolved", (e) => { resolvedEvents.push(e.payload); });

    const occurredAt = new Date(Date.now() - 60 * 60_000).toISOString();
    const detectedAt = new Date(Date.now() - 55 * 60_000).toISOString();

    const inc = mgr.openIncident({
      title: "Cache miss storm",
      description: "Redis evictions causing cascade",
      severity: "SEV2",
      occurredAt,
      detectedAt,
      affectedServices: ["cache"],
    });

    mgr.resolve(inc.id);

    assert.equal(resolvedEvents.length, 1);
    const payload = resolvedEvents[0] as { incidentId: string; mttrMs: number; mttdMs: number };
    assert.equal(payload.incidentId, inc.id);
    assert.ok(payload.mttrMs > 0, "mttrMs must be positive");
    assert.ok(payload.mttdMs > 0, "mttdMs must be positive");
  });

  it("publishPostmortem attaches to incident and emits event", () => {
    const bus = new EventBus();
    const mgr = new IncidentManager(bus);

    const pmEvents: unknown[] = [];
    bus.subscribe("incident.postmortem_published", (e) => { pmEvents.push(e.payload); });

    const inc = mgr.openIncident({
      title: "Memory leak",
      description: "Worker OOM",
      severity: "SEV3",
      occurredAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      detectedAt: new Date(Date.now() - 1 * 3_600_000).toISOString(),
      affectedServices: ["worker"],
    });
    mgr.resolve(inc.id);

    const pm = mgr.publishPostmortem(inc.id, {
      summary: "Memory leak in worker process",
      rootCause: "Unbounded event listener accumulation",
      timeline: "Detected → Resolved in 1h",
      actionItems: ["Add listener count monitoring", "Fix leak in worker.ts"],
      publishedBy: "Bob",
    });

    assert.ok(pm, "postmortem should be returned");
    assert.equal(pm!.incidentId, inc.id);
    assert.ok(pm!.publishedAt, "publishedAt should be set");

    const fetched = mgr.get(inc.id);
    assert.ok(fetched!.postmortem, "postmortem should be attached to incident");
    assert.equal(fetched!.postmortem!.publishedBy, "Bob");

    assert.equal(pmEvents.length, 1);
    const payload = pmEvents[0] as { incidentId: string; actionItems: string[] };
    assert.equal(payload.incidentId, inc.id);
    assert.equal(payload.actionItems.length, 2);
  });

  it("metrics computes mttd/mtta/mttr averages from resolved incidents", () => {
    const bus = new EventBus();
    const mgr = new IncidentManager(bus);

    const now = Date.now();
    // Incident 1: mttd=5min, mtta=10min, mttr=60min
    const inc1 = mgr.openIncident({
      title: "Inc1",
      description: "",
      severity: "SEV1",
      occurredAt: new Date(now - 75 * 60_000).toISOString(),
      detectedAt: new Date(now - 70 * 60_000).toISOString(),
      affectedServices: [],
    });
    mgr.acknowledge(inc1.id);
    // Manually set acknowledgedAt to be deterministic
    inc1.acknowledgedAt = new Date(now - 60 * 60_000).toISOString();
    mgr.resolve(inc1.id);
    inc1.resolvedAt = new Date(now - 10 * 60_000).toISOString();

    // Incident 2: resolved, no acknowledge
    const inc2 = mgr.openIncident({
      title: "Inc2",
      description: "",
      severity: "SEV2",
      occurredAt: new Date(now - 40 * 60_000).toISOString(),
      detectedAt: new Date(now - 30 * 60_000).toISOString(),
      affectedServices: [],
    });
    mgr.resolve(inc2.id);

    const m = mgr.metrics();
    assert.equal(m.totalIncidents, 2);
    assert.ok(m.mttdMs > 0, "mttdMs should be positive");
    assert.ok(m.mttrMs > 0, "mttrMs should be positive");
    assert.equal(m.bySeverity["SEV1"], 1);
    assert.equal(m.bySeverity["SEV2"], 1);
    assert.equal(m.openIncidents, 0);
  });

  it("openIncidents excludes resolved and closed", () => {
    const bus = new EventBus();
    const mgr = new IncidentManager(bus);

    const now = Date.now();

    const open1 = mgr.openIncident({
      title: "Open SEV3",
      description: "",
      severity: "SEV3",
      occurredAt: new Date(now - 60 * 60_000).toISOString(),
      detectedAt: new Date(now - 30 * 60_000).toISOString(),
      affectedServices: [],
    });

    const open2 = mgr.openIncident({
      title: "Acknowledged SEV2",
      description: "",
      severity: "SEV2",
      occurredAt: new Date(now - 120 * 60_000).toISOString(),
      detectedAt: new Date(now - 110 * 60_000).toISOString(),
      affectedServices: [],
    });
    mgr.acknowledge(open2.id);

    const closed = mgr.openIncident({
      title: "Resolved SEV1",
      description: "",
      severity: "SEV1",
      occurredAt: new Date(now - 200 * 60_000).toISOString(),
      detectedAt: new Date(now - 190 * 60_000).toISOString(),
      affectedServices: [],
    });
    mgr.resolve(closed.id);
    mgr.close(closed.id);

    const openList = mgr.openIncidents();
    assert.equal(openList.length, 2, "only detected and acknowledged incidents are open");
    const openIds = new Set(openList.map((i) => i.id));
    assert.ok(openIds.has(open1.id));
    assert.ok(openIds.has(open2.id));
    assert.ok(!openIds.has(closed.id));
  });
});

// ---------------------------------------------------------------------------
// MarketingAttributionEngine
// ---------------------------------------------------------------------------

describe("MarketingAttributionEngine", () => {
  it("addCampaign stores and returns campaign", () => {
    const bus = new EventBus();
    const engine = new MarketingAttributionEngine(bus);
    const campaign = engine.addCampaign({
      name: "Test Campaign",
      channel: "paid_search",
      startDate: "2026-01-01",
      budgetUsd: 5_000,
      spendUsd: 3_000,
      impressions: 10_000,
      clicks: 200,
      leads: 10,
    });
    assert.ok(campaign.id, "campaign must have an id");
    assert.equal(campaign.name, "Test Campaign");
    assert.equal(campaign.channel, "paid_search");
    assert.deepEqual(engine.getCampaign(campaign.id), campaign);
    assert.equal(engine.listCampaigns().length, 1);
  });

  it("recordConversion with linear attribution splits evenly", () => {
    const bus = new EventBus();
    const engine = new MarketingAttributionEngine(bus);
    const touchPoints: TouchPoint[] = [
      { channel: "paid_search", timestamp: new Date(Date.now() - 3 * 864e5).toISOString() },
      { channel: "email", timestamp: new Date(Date.now() - 2 * 864e5).toISOString() },
      { channel: "direct", timestamp: new Date(Date.now() - 1 * 864e5).toISOString() },
    ];
    const conversion = engine.recordConversion({
      touchPoints,
      convertedAt: new Date().toISOString(),
      revenueUsd: 90_000,
      model: "linear",
    });
    assert.ok(Math.abs((conversion.attribution["paid_search"] ?? 0) - 30_000) < 0.01, "paid_search should get 1/3");
    assert.ok(Math.abs((conversion.attribution["email"] ?? 0) - 30_000) < 0.01, "email should get 1/3");
    assert.ok(Math.abs((conversion.attribution["direct"] ?? 0) - 30_000) < 0.01, "direct should get 1/3");
  });

  it("recordConversion with first_touch gives 100% to first", () => {
    const bus = new EventBus();
    const engine = new MarketingAttributionEngine(bus);
    const touchPoints: TouchPoint[] = [
      { channel: "organic_search", timestamp: new Date(Date.now() - 5 * 864e5).toISOString() },
      { channel: "paid_search", timestamp: new Date(Date.now() - 3 * 864e5).toISOString() },
      { channel: "email", timestamp: new Date(Date.now() - 1 * 864e5).toISOString() },
    ];
    const conversion = engine.recordConversion({
      touchPoints,
      convertedAt: new Date().toISOString(),
      revenueUsd: 120_000,
      model: "first_touch",
    });
    assert.ok(Math.abs((conversion.attribution["organic_search"] ?? 0) - 120_000) < 0.01, "first channel gets 100%");
    assert.equal(conversion.attribution["paid_search"] ?? 0, 0);
    assert.equal(conversion.attribution["email"] ?? 0, 0);
  });

  it("recordConversion with time_decay weights recent more", () => {
    const bus = new EventBus();
    const engine = new MarketingAttributionEngine(bus);
    const now = Date.now();
    const touchPoints: TouchPoint[] = [
      { channel: "organic_search", timestamp: new Date(now - 14 * 864e5).toISOString() },
      { channel: "email", timestamp: new Date(now - 1 * 864e5).toISOString() },
    ];
    const conversion = engine.recordConversion({
      touchPoints,
      convertedAt: new Date(now).toISOString(),
      revenueUsd: 100_000,
      model: "time_decay",
    });
    const emailCredit = conversion.attribution["email"] ?? 0;
    const organicCredit = conversion.attribution["organic_search"] ?? 0;
    assert.ok(emailCredit > organicCredit, "recent channel (email) should get more credit than older channel");
    assert.ok(Math.abs(emailCredit + organicCredit - 100_000) < 0.01, "total must sum to revenue");
  });

  it("summary aggregates revenue and ROI by channel", () => {
    const bus = new EventBus();
    const engine = new MarketingAttributionEngine(bus);
    engine.addCampaign({
      id: "camp-ps",
      name: "Paid Search",
      channel: "paid_search",
      startDate: "2026-01-01",
      budgetUsd: 10_000,
      spendUsd: 8_000,
      impressions: 20_000,
      clicks: 500,
      leads: 15,
    });
    engine.recordConversion({
      touchPoints: [
        { channel: "paid_search", timestamp: new Date(Date.now() - 5 * 864e5).toISOString(), campaignId: "camp-ps" },
      ],
      convertedAt: new Date().toISOString(),
      revenueUsd: 80_000,
      model: "linear",
    });
    const s = engine.summary("linear");
    assert.equal(s.totalConversions, 1);
    assert.ok(s.totalRevenue > 0, "total revenue must be positive");
    assert.ok(s.byChannel.length > 0, "must have at least one channel");
    const ps = s.byChannel.find((c) => c.channel === "paid_search");
    assert.ok(ps !== undefined, "paid_search channel must appear");
    assert.ok(ps.attributedRevenue > 0, "paid_search must have attributed revenue");
  });

  it("emits marketing.conversion event", () => {
    const bus = new EventBus();
    const engine = new MarketingAttributionEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("marketing.conversion", (e) => { events.push(e.payload); });
    engine.recordConversion({
      touchPoints: [{ channel: "direct", timestamp: new Date().toISOString() }],
      convertedAt: new Date().toISOString(),
      revenueUsd: 50_000,
    });
    assert.equal(events.length, 1, "marketing.conversion event must be emitted");
  });
});

// ---------------------------------------------------------------------------
// ForecastEngine
// ---------------------------------------------------------------------------

describe("ForecastEngine", () => {
  const makeAssumptions = (): ForecastAssumptions => ({
    startingArrUsd: 1_200_000,
    startingCashUsd: 2_000_000,
    arrGrowthRate: 0.04,
    churnRate: 0.01,
    avgDealSizeUsd: 50_000,
    newDealsPerMonth: 2,
    monthlyOpexUsd: 50_000,
    opexGrowthRate: 0.01,
    monthlyPayrollUsd: 150_000,
    headcountGrowthRate: 0.02,
    grossMargin: 0.72,
  });

  it("generate returns projection for each month", () => {
    const bus = new EventBus();
    const engine = new ForecastEngine(bus);
    const result = engine.generate(makeAssumptions(), 18);
    assert.strictEqual(result.projections.length, 18);
    assert.strictEqual(result.months, 18);
  });

  it("ARR compounds correctly month over month", () => {
    const bus = new EventBus();
    const engine = new ForecastEngine(bus);
    const assumptions = makeAssumptions();
    const result = engine.generate(assumptions, 3);
    const m1 = result.projections[0];
    const m2 = result.projections[1];
    // ARR should grow from month 1 to month 2
    assert.ok(m2!.arrUsd > m1!.arrUsd, "ARR should grow month over month");
  });

  it("cashOutMonth is null when cash stays positive", () => {
    const bus = new EventBus();
    const engine = new ForecastEngine(bus);
    const assumptions: ForecastAssumptions = {
      ...makeAssumptions(),
      startingCashUsd: 10_000_000,
      grossMargin: 0.9,
      monthlyPayrollUsd: 50_000,
      monthlyOpexUsd: 10_000,
    };
    const result = engine.generate(assumptions, 18);
    assert.strictEqual(result.cashOutMonth, null);
  });

  it("cashOutMonth detected when burn exceeds revenue", () => {
    const bus = new EventBus();
    const engine = new ForecastEngine(bus);
    const assumptions: ForecastAssumptions = {
      ...makeAssumptions(),
      startingCashUsd: 100_000,
      startingArrUsd: 60_000,
      arrGrowthRate: 0.01,
      grossMargin: 0.1,
      monthlyPayrollUsd: 200_000,
      monthlyOpexUsd: 100_000,
    };
    const result = engine.generate(assumptions, 18);
    assert.ok(result.cashOutMonth !== null, "Should detect cash out month");
  });

  it("compareScenarios optimistic ARR > base > pessimistic", () => {
    const bus = new EventBus();
    const engine = new ForecastEngine(bus);
    const comparison = engine.compareScenarios(makeAssumptions(), 12);
    assert.ok(comparison.optimistic.projectedArrUsd > comparison.base.projectedArrUsd, "optimistic ARR > base ARR");
    assert.ok(comparison.base.projectedArrUsd > comparison.pessimistic.projectedArrUsd, "base ARR > pessimistic ARR");
  });

  it("sensitivityAnalysis returns sorted results", () => {
    const bus = new EventBus();
    const engine = new ForecastEngine(bus);
    const results = engine.sensitivityAnalysis(makeAssumptions(), 12);
    assert.ok(results.length > 0, "Should return sensitivity results");
    for (let i = 1; i < results.length; i++) {
      assert.ok(
        Math.abs(results[i - 1]!.arrImpactPct) >= Math.abs(results[i]!.arrImpactPct),
        "Results should be sorted by abs arrImpactPct desc"
      );
    }
  });
});

// ── ForecastEngine ────────────────────────────────────────────────────────────
describe("ForecastEngine", () => {
  const baseAssumptions: ForecastAssumptions = {
    startingArrUsd: 3_200_000,
    startingCashUsd: 4_200_000,
    arrGrowthRate: 0.04,
    churnRate: 0.012,
    avgDealSizeUsd: 85_000,
    newDealsPerMonth: 2,
    monthlyOpexUsd: 95_000,
    opexGrowthRate: 0.02,
    monthlyPayrollUsd: 380_000,
    headcountGrowthRate: 0.03,
    grossMargin: 0.72,
  };

  it("generate returns projection for each month", () => {
    const bus = new EventBus();
    const engine = new ForecastEngine(bus);
    const result = engine.generate(baseAssumptions, 12);
    assert.equal(result.projections.length, 12);
    assert.equal(result.months, 12);
  });

  it("ARR compounds correctly month over month", () => {
    const bus = new EventBus();
    const engine = new ForecastEngine(bus);
    const result = engine.generate(baseAssumptions, 3);
    const m1 = result.projections[0]!;
    const m2 = result.projections[1]!;
    assert.ok(m2.arrUsd > m1.arrUsd, "ARR should grow month over month");
  });

  it("cashOutMonth is null when cash stays positive", () => {
    const bus = new EventBus();
    const engine = new ForecastEngine(bus);
    // High gross margin + low burn => profitable
    const result = engine.generate({
      ...baseAssumptions,
      grossMargin: 0.90,
      monthlyPayrollUsd: 50_000,
      monthlyOpexUsd: 20_000,
    }, 18);
    assert.equal(result.cashOutMonth, null, "should not run out of cash");
  });

  it("cashOutMonth detected when burn exceeds revenue", () => {
    const bus = new EventBus();
    const engine = new ForecastEngine(bus);
    const result = engine.generate({
      ...baseAssumptions,
      startingArrUsd: 100_000,
      startingCashUsd: 200_000,
      monthlyPayrollUsd: 500_000,
      monthlyOpexUsd: 200_000,
      grossMargin: 0.10,
    }, 18);
    assert.ok(result.cashOutMonth !== null, "high burn should exhaust cash");
    assert.ok(result.cashOutMonth! >= 1 && result.cashOutMonth! <= 18);
  });

  it("compareScenarios optimistic ARR > base > pessimistic", () => {
    const bus = new EventBus();
    const engine = new ForecastEngine(bus);
    const comparison = engine.compareScenarios(baseAssumptions, 12);
    assert.ok(comparison.optimistic.projectedArrUsd > comparison.base.projectedArrUsd, "optimistic > base");
    assert.ok(comparison.base.projectedArrUsd > comparison.pessimistic.projectedArrUsd, "base > pessimistic");
  });

  it("sensitivityAnalysis returns sorted results", () => {
    const bus = new EventBus();
    const engine = new ForecastEngine(bus);
    const results = engine.sensitivityAnalysis(baseAssumptions, 6);
    assert.ok(results.length > 0, "should return sensitivity results");
    // Verify sorted by abs impact descending
    for (let i = 1; i < results.length; i++) {
      assert.ok(
        Math.abs(results[i - 1]!.arrImpactPct) >= Math.abs(results[i]!.arrImpactPct),
        "results should be sorted by impact descending",
      );
    }
  });
});

// ── DataPipelineManager ────────────────────────────────────────────────────────
describe("DataPipelineManager", () => {
  it("addSource and addPipeline store correctly", () => {
    const bus = new EventBus();
    const dp = new DataPipelineManager(bus);
    const src = dp.addSource({ name: "Test DB", type: "postgres" });
    assert.equal(src.name, "Test DB");
    assert.equal(src.type, "postgres");
    assert.ok(src.id);
    assert.deepEqual(dp.getSource(src.id), src);

    const pl = dp.addPipeline({ name: "Test Pipeline", description: "desc", sourceId: src.id, sinkDatasetId: "test_ds", status: "active" });
    assert.equal(pl.name, "Test Pipeline");
    assert.equal(pl.sinkDatasetId, "test_ds");
    assert.deepEqual(dp.getPipeline(pl.id), pl);
    assert.equal(dp.listPipelines("active").length, 1);
    assert.equal(dp.listSources().length, 1);
  });

  it("recordRun emits pipeline.run_completed on success", () => {
    const bus = new EventBus();
    const dp = new DataPipelineManager(bus);
    const src = dp.addSource({ name: "DB", type: "mysql" });
    const pl = dp.addPipeline({ name: "P", description: "d", sourceId: src.id, sinkDatasetId: "ds1", status: "active" });

    const events: unknown[] = [];
    bus.subscribe("pipeline.run_completed", (e) => { events.push(e.payload); });

    const run = dp.recordRun(pl.id, { rowsRead: 100, rowsWritten: 100, durationMs: 500 });
    assert.equal(run.status, "completed");
    assert.equal(events.length, 1);
    assert.equal((events[0] as { pipelineId: string }).pipelineId, pl.id);
  });

  it("recordRun emits pipeline.run_failed on error", () => {
    const bus = new EventBus();
    const dp = new DataPipelineManager(bus);
    const src = dp.addSource({ name: "DB", type: "s3" });
    const pl = dp.addPipeline({ name: "P", description: "d", sourceId: src.id, sinkDatasetId: "ds2", status: "active" });

    const events: unknown[] = [];
    bus.subscribe("pipeline.run_failed", (e) => { events.push(e.payload); });

    const run = dp.recordRun(pl.id, { rowsRead: 0, rowsWritten: 0, durationMs: 100, error: "connection refused" });
    assert.equal(run.status, "failed");
    assert.equal(events.length, 1);
    assert.equal((events[0] as { error: string }).error, "connection refused");
  });

  it("recordQuality computes overallScore as average", () => {
    const bus = new EventBus();
    const dp = new DataPipelineManager(bus);
    const q = dp.recordQuality("my_dataset", { completeness: 80, freshness: 90, validity: 70, uniqueness: 100, consistency: 60 });
    assert.equal(q.overallScore, 80); // (80+90+70+100+60)/5 = 400/5 = 80
  });

  it("recordQuality emits quality_alert when score < 70", () => {
    const bus = new EventBus();
    const dp = new DataPipelineManager(bus);
    const alerts: unknown[] = [];
    bus.subscribe("pipeline.quality_alert", (e) => { alerts.push(e.payload); });

    dp.recordQuality("ds_x", { completeness: 50, freshness: 90, validity: 60, uniqueness: 80, consistency: 95 });
    // completeness=50 and validity=60 are < 70
    assert.equal(alerts.length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const dp = new DataPipelineManager(bus);
    const src = dp.addSource({ name: "DB", type: "api" });
    const pl1 = dp.addPipeline({ name: "P1", description: "d", sourceId: src.id, sinkDatasetId: "sink1", status: "active" });
    const pl2 = dp.addPipeline({ name: "P2", description: "d", sourceId: src.id, sinkDatasetId: "sink2", status: "paused" });

    dp.recordRun(pl1.id, { rowsRead: 100, rowsWritten: 100, durationMs: 1000 });
    dp.recordRun(pl2.id, { rowsRead: 0, rowsWritten: 0, durationMs: 500, status: "failed" });
    dp.recordQuality("sink1", { completeness: 90, freshness: 90, validity: 90, uniqueness: 90, consistency: 90 });

    const s = dp.summary();
    assert.equal(s.totalPipelines, 2);
    assert.equal(s.activePipelines, 1);
    assert.equal(s.totalRuns, 2);
    assert.equal(s.successRate, 50); // 1/2 * 100
    assert.equal(s.avgDurationMs, 1000); // only completed run
    assert.equal(s.datasets, 2);
    assert.equal(s.avgQualityScore, 90);
  });
});

// ── SupportTicketManager ───────────────────────────────────────────────────────
import { SupportTicketManager } from "../support/ticket-manager.js";

describe("SupportTicketManager", () => {
  it("openTicket emits support.ticket_opened", () => {
    const bus = new EventBus();
    const mgr = new SupportTicketManager(bus);
    const events: unknown[] = [];
    bus.subscribe("support.ticket_opened", (e) => { events.push(e.payload); });

    const ticket = mgr.openTicket({
      subject: "Login broken",
      description: "Cannot log in",
      priority: "high",
      category: "bug",
      customerId: "cust-1",
    });
    assert.equal(ticket.status, "open");
    assert.equal(ticket.slaBreached, false);
    assert.equal(events.length, 1);
    assert.equal((events[0] as { ticketId: string }).ticketId, ticket.id);
    assert.equal((events[0] as { priority: string }).priority, "high");
  });

  it("recordFirstReply marks sla breach when FRT exceeded", () => {
    const bus = new EventBus();
    const mgr = new SupportTicketManager(bus);
    const breaches: unknown[] = [];
    bus.subscribe("support.sla_breached", (e) => { breaches.push(e.payload); });

    const now = Date.now();
    const ticket = mgr.openTicket({
      subject: "Slow response",
      description: "System is unresponsive",
      priority: "critical",
      category: "performance",
      customerId: "cust-2",
      createdAt: new Date(now - 2 * 3600000).toISOString(), // 2h ago
    });
    // FRT SLA for critical is 1h; reply at 2h => breach
    mgr.recordFirstReply(ticket.id, new Date(now).toISOString());

    const updated = mgr.get(ticket.id)!;
    assert.equal(updated.slaBreached, true);
    assert.equal(breaches.length, 1);
    assert.equal((breaches[0] as { breachType: string }).breachType, "frt");
  });

  it("resolveTicket emits support.ticket_resolved with metrics", () => {
    const bus = new EventBus();
    const mgr = new SupportTicketManager(bus);
    const resolved: unknown[] = [];
    bus.subscribe("support.ticket_resolved", (e) => { resolved.push(e.payload); });

    const now = Date.now();
    const ticket = mgr.openTicket({
      subject: "Password reset not working",
      description: "Reset email not sent",
      priority: "medium",
      category: "access",
      customerId: "cust-3",
      createdAt: new Date(now - 10 * 3600000).toISOString(),
    });
    mgr.recordFirstReply(ticket.id, new Date(now - 9 * 3600000).toISOString());
    mgr.resolveTicket(ticket.id, new Date(now).toISOString());

    assert.equal(resolved.length, 1);
    const payload = resolved[0] as { ticketId: string; frtMs: number; resolutionMs: number };
    assert.equal(payload.ticketId, ticket.id);
    assert.ok(payload.frtMs > 0);
    assert.ok(payload.resolutionMs > 0);
    assert.equal(mgr.get(ticket.id)!.status, "resolved");
  });

  it("resolveTicket marks sla breach on resolution time exceeded", () => {
    const bus = new EventBus();
    const mgr = new SupportTicketManager(bus);
    const breaches: unknown[] = [];
    bus.subscribe("support.sla_breached", (e) => { breaches.push(e.payload); });

    const now = Date.now();
    const ticket = mgr.openTicket({
      subject: "Critical outage",
      description: "Total system outage",
      priority: "critical",
      category: "bug",
      customerId: "cust-4",
      createdAt: new Date(now - 6 * 3600000).toISOString(), // 6h ago
    });
    // Critical resolution SLA is 4h; resolving at 6h => breach
    mgr.resolveTicket(ticket.id, new Date(now).toISOString());

    const updated = mgr.get(ticket.id)!;
    assert.equal(updated.slaBreached, true);
    assert.equal(breaches.length, 1);
    assert.equal((breaches[0] as { breachType: string }).breachType, "resolution");
  });

  it("submitCsat stores score and emits event", () => {
    const bus = new EventBus();
    const mgr = new SupportTicketManager(bus);
    const csatEvents: unknown[] = [];
    bus.subscribe("support.csat_submitted", (e) => { csatEvents.push(e.payload); });

    const ticket = mgr.openTicket({
      subject: "Billing question",
      description: "Confused about invoice",
      priority: "low",
      category: "billing",
      customerId: "cust-5",
    });
    mgr.submitCsat(ticket.id, 4, "Great support!");

    const updated = mgr.get(ticket.id)!;
    assert.equal(updated.csatScore, 4);
    assert.equal(updated.csatComment, "Great support!");
    assert.equal(csatEvents.length, 1);
    assert.equal((csatEvents[0] as { score: number }).score, 4);
    assert.equal((csatEvents[0] as { ticketId: string }).ticketId, ticket.id);
  });

  it("metrics returns correct aggregates", () => {
    const bus = new EventBus();
    const mgr = new SupportTicketManager(bus);

    const now = Date.now();
    const h = 3600000;

    // Ticket 1: resolved with CSAT
    const t1 = mgr.openTicket({
      subject: "Issue A",
      description: "desc",
      priority: "high",
      category: "bug",
      customerId: "cust-a",
      createdAt: new Date(now - 10 * h).toISOString(),
    });
    mgr.recordFirstReply(t1.id, new Date(now - 9 * h).toISOString());
    mgr.resolveTicket(t1.id, new Date(now).toISOString());
    mgr.submitCsat(t1.id, 5);

    // Ticket 2: open, no reply
    mgr.openTicket({
      subject: "Issue B",
      description: "desc",
      priority: "low",
      category: "feature_request",
      customerId: "cust-b",
    });

    const m = mgr.metrics();
    assert.equal(m.totalTickets, 2);
    assert.equal(m.openTickets, 1);
    assert.ok(m.avgFrtMs > 0);
    assert.ok(m.avgResolutionMs > 0);
    assert.equal(m.avgCsat, 5);
    assert.equal(m.byPriority.high, 1);
    assert.equal(m.byPriority.low, 1);
    assert.equal(m.byCategory.bug, 1);
    assert.equal(m.byCategory.feature_request, 1);
    assert.equal(m.byStatus.resolved, 1);
    assert.equal(m.byStatus.open, 1);
  });
});

import { CommunicationHub } from "../communication/communication-hub.js";

describe("CommunicationHub", () => {
  it("createSequence stores and returns sequence", () => {
    const bus = new EventBus();
    const hub = new CommunicationHub(bus);
    const seq = hub.createSequence({
      name: "Test Sequence",
      description: "A test sequence",
      status: "active",
      steps: [
        { stepNumber: 1, channel: "email", delayDays: 0, subject: "Hello", bodyTemplate: "Hi {{firstName}}" },
      ],
    });
    assert.equal(seq.name, "Test Sequence");
    assert.equal(hub.getSequence(seq.id)?.id, seq.id);
    assert.equal(hub.listSequences().length, 1);
  });

  it("enrollContact creates one message per step", () => {
    const bus = new EventBus();
    const hub = new CommunicationHub(bus);
    const seq = hub.createSequence({
      name: "Multi-step",
      description: "desc",
      status: "active",
      steps: [
        { stepNumber: 1, channel: "email", delayDays: 0, bodyTemplate: "Step 1" },
        { stepNumber: 2, channel: "email", delayDays: 3, bodyTemplate: "Step 2" },
        { stepNumber: 3, channel: "linkedin", delayDays: 7, bodyTemplate: "Step 3" },
      ],
    });
    const msgs = hub.enrollContact(seq.id, "contact-a");
    assert.equal(msgs.length, 3);
    assert.equal(msgs[0]!.stepNumber, 1);
    assert.equal(msgs[1]!.stepNumber, 2);
    assert.equal(msgs[2]!.stepNumber, 3);
    assert.equal(msgs[2]!.channel, "linkedin");
  });

  it("sendMessage emits comms.message_sent", () => {
    const bus = new EventBus();
    const hub = new CommunicationHub(bus);
    const events: unknown[] = [];
    bus.subscribe("comms.message_sent", (e) => { events.push(e.payload); });
    const seq = hub.createSequence({
      name: "Seq",
      description: "d",
      status: "active",
      steps: [{ stepNumber: 1, channel: "email", delayDays: 0, bodyTemplate: "Hi" }],
    });
    const [msg] = hub.enrollContact(seq.id, "contact-b");
    hub.sendMessage(msg!.id);
    assert.equal(events.length, 1);
    assert.equal((events[0] as { contactId: string }).contactId, "contact-b");
    assert.equal(hub.getMessage(msg!.id)?.status, "sent");
  });

  it("recordEngagement emits comms.engagement and appends event", () => {
    const bus = new EventBus();
    const hub = new CommunicationHub(bus);
    const events: unknown[] = [];
    bus.subscribe("comms.engagement", (e) => { events.push(e.payload); });
    const seq = hub.createSequence({
      name: "Seq",
      description: "d",
      status: "active",
      steps: [{ stepNumber: 1, channel: "email", delayDays: 0, bodyTemplate: "Hi" }],
    });
    const [msg] = hub.enrollContact(seq.id, "contact-c");
    hub.sendMessage(msg!.id);
    hub.recordEngagement(msg!.id, "open");
    assert.equal(events.length, 1);
    assert.equal((events[0] as { type: string }).type, "open");
    assert.equal(hub.getMessage(msg!.id)?.engagements.length, 1);
  });

  it("getSequenceAnalytics computes open rate correctly", () => {
    const bus = new EventBus();
    const hub = new CommunicationHub(bus);
    const seq = hub.createSequence({
      name: "Analytics Seq",
      description: "d",
      status: "active",
      steps: [{ stepNumber: 1, channel: "email", delayDays: 0, bodyTemplate: "Hi" }],
    });
    // Enroll 4 contacts, send all, record opens for 2
    for (const c of ["c1", "c2", "c3", "c4"]) {
      const [msg] = hub.enrollContact(seq.id, c);
      hub.sendMessage(msg!.id);
    }
    const msgs = hub.listMessages(seq.id);
    hub.recordEngagement(msgs[0]!.id, "open");
    hub.recordEngagement(msgs[1]!.id, "open");
    const analytics = hub.getSequenceAnalytics(seq.id);
    assert.ok(analytics !== undefined);
    assert.equal(analytics.sentCount, 4);
    assert.equal(analytics.openCount, 2);
    assert.equal(analytics.openRate, 50);
  });

  it("summary returns active sequence count", () => {
    const bus = new EventBus();
    const hub = new CommunicationHub(bus);
    hub.createSequence({ name: "A", description: "d", status: "active", steps: [] });
    hub.createSequence({ name: "B", description: "d", status: "active", steps: [] });
    hub.createSequence({ name: "C", description: "d", status: "completed", steps: [] });
    const s = hub.summary();
    assert.equal(s.totalSequences, 3);
    assert.equal(s.activeSequences, 2);
  });
});

// ---------------------------------------------------------------------------
// PricingEngine
// ---------------------------------------------------------------------------

import { PricingEngine } from "../pricing/pricing-engine.js";

describe("PricingEngine", () => {
  it("addProduct stores and returns product", () => {
    const bus = new EventBus();
    const engine = new PricingEngine(bus);
    const product = engine.addProduct({
      name: "Test Product",
      description: "A test product",
      billingModel: "flat_fee",
      basePriceUsd: 100,
      annualDiscountPct: 10,
      currency: "USD",
    });
    assert.ok(product.id);
    assert.equal(product.name, "Test Product");
    assert.equal(product.basePriceUsd, 100);
    assert.equal(engine.getProduct(product.id)?.name, "Test Product");
    assert.equal(engine.listProducts().length, 1);
  });

  it("generateQuote applies tiered pricing correctly", () => {
    const bus = new EventBus();
    const engine = new PricingEngine(bus);
    const product = engine.addProduct({
      name: "Seat Product",
      description: "Per seat",
      billingModel: "per_seat",
      basePriceUsd: 300,
      tiers: [
        { minUnits: 1, maxUnits: 10, pricePerUnit: 300 },
        { minUnits: 11, maxUnits: 50, pricePerUnit: 250 },
        { minUnits: 51, pricePerUnit: 200 },
      ],
      annualDiscountPct: 0,
      currency: "USD",
    });
    const quote = engine.generateQuote({
      customerId: "cust-1",
      lineItems: [{ productId: product.id, quantity: 20 }],
    });
    // 20 seats should hit the 11-50 tier at $250
    assert.equal(quote.lineItems[0]!.unitPriceUsd, 250);
    assert.equal(quote.subtotalUsd, 5000);
  });

  it("generateQuote applies percentage discount", () => {
    const bus = new EventBus();
    const engine = new PricingEngine(bus);
    const product = engine.addProduct({
      name: "Flat Product",
      description: "Flat fee",
      billingModel: "flat_fee",
      basePriceUsd: 1000,
      annualDiscountPct: 0,
      currency: "USD",
    });
    engine.addDiscount({
      code: "SAVE10",
      description: "10% off",
      type: "percentage",
      value: 10,
    });
    const quote = engine.generateQuote({
      customerId: "cust-2",
      lineItems: [{ productId: product.id, quantity: 1 }],
      discountCodes: ["SAVE10"],
    });
    assert.equal(quote.subtotalUsd, 1000);
    assert.equal(quote.discountUsd, 100);
    assert.equal(quote.totalUsd, 900);
  });

  it("generateQuote emits pricing.quote_generated", () => {
    const bus = new EventBus();
    const engine = new PricingEngine(bus);
    const product = engine.addProduct({
      name: "P",
      description: "d",
      billingModel: "flat_fee",
      basePriceUsd: 500,
      annualDiscountPct: 0,
      currency: "USD",
    });
    const events: unknown[] = [];
    bus.subscribe("pricing.quote_generated", (event) => { events.push((event as { payload: unknown }).payload); });
    const quote = engine.generateQuote({
      customerId: "cust-3",
      lineItems: [{ productId: product.id, quantity: 1 }],
    });
    assert.equal(events.length, 1);
    const ev = events[0] as { quoteId: string; customerId: string; totalUsd: number };
    assert.equal(ev.quoteId, quote.id);
    assert.equal(ev.customerId, "cust-3");
    assert.equal(ev.totalUsd, 500);
  });

  it("updatePrice emits pricing.price_updated", () => {
    const bus = new EventBus();
    const engine = new PricingEngine(bus);
    const product = engine.addProduct({
      name: "Updatable",
      description: "d",
      billingModel: "flat_fee",
      basePriceUsd: 200,
      annualDiscountPct: 0,
      currency: "USD",
    });
    const events: unknown[] = [];
    bus.subscribe("pricing.price_updated", (event) => { events.push((event as { payload: unknown }).payload); });
    const updated = engine.updatePrice(product.id, 250);
    assert.ok(updated);
    assert.equal(updated.basePriceUsd, 250);
    assert.equal(events.length, 1);
    const ev = events[0] as { productId: string; oldPriceUsd: number; newPriceUsd: number };
    assert.equal(ev.productId, product.id);
    assert.equal(ev.oldPriceUsd, 200);
    assert.equal(ev.newPriceUsd, 250);
  });

  it("summary computes win rate correctly", () => {
    const bus = new EventBus();
    const engine = new PricingEngine(bus);
    const product = engine.addProduct({
      name: "S",
      description: "d",
      billingModel: "flat_fee",
      basePriceUsd: 100,
      annualDiscountPct: 0,
      currency: "USD",
    });
    const q1 = engine.generateQuote({ customerId: "c1", lineItems: [{ productId: product.id, quantity: 1 }] });
    const q2 = engine.generateQuote({ customerId: "c2", lineItems: [{ productId: product.id, quantity: 1 }] });
    const q3 = engine.generateQuote({ customerId: "c3", lineItems: [{ productId: product.id, quantity: 1 }] });
    engine.updateQuoteStatus(q1.id, "accepted");
    engine.updateQuoteStatus(q2.id, "accepted");
    engine.updateQuoteStatus(q3.id, "rejected");
    const s = engine.summary();
    assert.equal(s.acceptedQuotes, 2);
    // win rate = 2 / (2 + 1) * 100 = 66.666...
    assert.ok(Math.abs(s.winRate - 66.6667) < 0.001 || Math.abs(s.winRate - (2/3*100)) < 0.001);
  });
});

import { AssetManager } from "../assets/asset-manager.js";

describe("AssetManager", () => {
  it("registerAsset emits asset.registered", () => {
    const bus = new EventBus();
    const manager = new AssetManager(bus);
    const events: unknown[] = [];
    bus.subscribe("asset.registered", (event) => { events.push((event as { payload: unknown }).payload); });
    const asset = manager.registerAsset({
      name: "Test Laptop",
      type: "hardware",
      status: "active",
      purchaseDate: "2024-01-01",
      purchasePriceUsd: 2000,
      depreciationMethod: "straight_line",
      usefulLifeYears: 4,
    });
    assert.equal(events.length, 1);
    const ev = events[0] as { assetId: string; name: string; type: string; valueUsd: number };
    assert.equal(ev.assetId, asset.id);
    assert.equal(ev.name, "Test Laptop");
    assert.equal(ev.type, "hardware");
    assert.equal(ev.valueUsd, 2000);
  });

  it("updateStatus emits asset.status_changed", () => {
    const bus = new EventBus();
    const manager = new AssetManager(bus);
    const asset = manager.registerAsset({
      name: "Server",
      type: "hardware",
      status: "active",
      purchaseDate: "2023-01-01",
      purchasePriceUsd: 10000,
      depreciationMethod: "none",
      usefulLifeYears: 5,
    });
    const events: unknown[] = [];
    bus.subscribe("asset.status_changed", (event) => { events.push((event as { payload: unknown }).payload); });
    manager.updateStatus(asset.id, "maintenance");
    assert.equal(events.length, 1);
    const ev = events[0] as { assetId: string; from: string; to: string };
    assert.equal(ev.assetId, asset.id);
    assert.equal(ev.from, "active");
    assert.equal(ev.to, "maintenance");
  });

  it("applyDepreciation straight_line reduces value correctly", () => {
    const bus = new EventBus();
    const manager = new AssetManager(bus);
    const asset = manager.registerAsset({
      name: "MacBook",
      type: "hardware",
      status: "active",
      purchaseDate: "2024-01-01",
      purchasePriceUsd: 12000,
      depreciationMethod: "straight_line",
      usefulLifeYears: 4,
    });
    const record = manager.applyDepreciation(asset.id, "2024-02");
    assert.ok(record);
    // annual = 12000/4 = 3000; monthly = 250
    assert.ok(Math.abs(record.depreciationUsd - 250) < 0.01);
    assert.ok(Math.abs(record.bookValueUsd - 11750) < 0.01);
    assert.ok(Math.abs(manager.get(asset.id)!.currentValueUsd - 11750) < 0.01);
  });

  it("applyDepreciation declining_balance reduces value", () => {
    const bus = new EventBus();
    const manager = new AssetManager(bus);
    const asset = manager.registerAsset({
      name: "Server Rack",
      type: "hardware",
      status: "active",
      purchaseDate: "2023-01-01",
      purchasePriceUsd: 10000,
      depreciationMethod: "declining_balance",
      usefulLifeYears: 5,
    });
    const record = manager.applyDepreciation(asset.id, "2024-01");
    assert.ok(record);
    // rate = 2/5 = 0.4; monthly = 10000 * 0.4/12 ≈ 333.33
    assert.ok(record.depreciationUsd > 0);
    assert.ok(record.bookValueUsd < 10000);
    assert.ok(Math.abs(record.depreciationUsd - 10000 * 0.4 / 12) < 0.01);
  });

  it("summary counts activeAssets correctly", () => {
    const bus = new EventBus();
    const manager = new AssetManager(bus);
    manager.registerAsset({ name: "A1", type: "hardware", status: "active", purchaseDate: "2024-01-01", purchasePriceUsd: 1000, depreciationMethod: "none", usefulLifeYears: 3 });
    manager.registerAsset({ name: "A2", type: "hardware", status: "active", purchaseDate: "2024-01-01", purchasePriceUsd: 2000, depreciationMethod: "none", usefulLifeYears: 3 });
    manager.registerAsset({ name: "A3", type: "software_license", status: "decommissioned", purchaseDate: "2024-01-01", purchasePriceUsd: 500, depreciationMethod: "none", usefulLifeYears: 1 });
    const s = manager.summary();
    assert.equal(s.totalAssets, 3);
    assert.equal(s.activeAssets, 2);
    assert.equal(s.totalPurchasePriceUsd, 3500);
    assert.equal(s.byType.hardware, 2);
    assert.equal(s.byType.software_license, 1);
  });

  it("warrantyExpiringSoon detects near-expiry", () => {
    const bus = new EventBus();
    const manager = new AssetManager(bus);
    const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;
    const far = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;
    manager.registerAsset({ name: "NearExpiry", type: "hardware", status: "active", purchaseDate: "2023-01-01", purchasePriceUsd: 1000, depreciationMethod: "none", usefulLifeYears: 3, warrantyExpiresAt: soon });
    manager.registerAsset({ name: "FarExpiry", type: "hardware", status: "active", purchaseDate: "2023-01-01", purchasePriceUsd: 1000, depreciationMethod: "none", usefulLifeYears: 3, warrantyExpiresAt: far });
    manager.registerAsset({ name: "NoWarranty", type: "furniture", status: "active", purchaseDate: "2023-01-01", purchasePriceUsd: 500, depreciationMethod: "none", usefulLifeYears: 5 });
    const s = manager.summary();
    assert.equal(s.warrantyExpiringSoon, 1);
  });
});
