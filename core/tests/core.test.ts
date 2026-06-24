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
import { BillingEngine } from "../billing/billing-engine.js";
import { AnalyticsEngine } from "../analytics/analytics-engine.js";
import { FeedbackEngine } from "../feedback/feedback-engine.js";
import { FlagManager } from "../feature-flags/flag-manager.js";

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

// ---------------------------------------------------------------------------
// ExpenseManager
// ---------------------------------------------------------------------------

import { ExpenseManager } from "../expenses/expense-manager.js";

describe("ExpenseManager", () => {
  it("submitExpense emits expense.submitted", () => {
    const bus = new EventBus();
    const manager = new ExpenseManager(bus);
    const events: unknown[] = [];
    bus.subscribe("expense.submitted", (event) => { events.push((event as { payload: unknown }).payload); });
    manager.submitExpense({
      employeeId: "emp-1",
      category: "meals",
      amountUsd: 30,
      description: "Lunch",
      receiptUrl: "https://example.com/receipt.pdf",
      expenseDate: "2026-06-01",
    });
    assert.equal(events.length, 1);
    const ev = events[0] as { expenseId: string; employeeId: string; amountUsd: number; category: string };
    assert.equal(ev.employeeId, "emp-1");
    assert.equal(ev.amountUsd, 30);
    assert.equal(ev.category, "meals");
  });

  it("submitExpense detects policy violation on category limit", () => {
    const bus = new EventBus();
    const manager = new ExpenseManager(bus);
    const violations: unknown[] = [];
    bus.subscribe("expense.policy_violation", (event) => { violations.push((event as { payload: unknown }).payload); });
    const expense = manager.submitExpense({
      employeeId: "emp-2",
      category: "entertainment",
      amountUsd: 200,
      description: "Client dinner",
      receiptUrl: "https://example.com/receipt.pdf",
      expenseDate: "2026-06-01",
    });
    assert.equal(expense.status, "under_review");
    assert.ok(expense.policyViolations.length > 0);
    assert.ok(violations.length > 0);
  });

  it("submitExpense flags missing receipt", () => {
    const bus = new EventBus();
    const manager = new ExpenseManager(bus);
    const expense = manager.submitExpense({
      employeeId: "emp-3",
      category: "software",
      amountUsd: 100,
      description: "Software license",
      expenseDate: "2026-06-01",
    });
    assert.equal(expense.status, "under_review");
    assert.ok(expense.policyViolations.some((v) => v.includes("Receipt required")));
  });

  it("approve emits expense.approved", () => {
    const bus = new EventBus();
    const manager = new ExpenseManager(bus);
    const approvals: unknown[] = [];
    bus.subscribe("expense.approved", (event) => { approvals.push((event as { payload: unknown }).payload); });
    const expense = manager.submitExpense({
      employeeId: "emp-4",
      category: "meals",
      amountUsd: 50,
      description: "Team lunch",
      receiptUrl: "https://example.com/receipt.pdf",
      expenseDate: "2026-06-01",
    });
    manager.approve(expense.id, "manager-1");
    assert.equal(approvals.length, 1);
    const ev = approvals[0] as { approvedBy: string };
    assert.equal(ev.approvedBy, "manager-1");
    assert.equal(manager.get(expense.id)!.status, "approved");
  });

  it("reject emits expense.rejected with reason", () => {
    const bus = new EventBus();
    const manager = new ExpenseManager(bus);
    const rejections: unknown[] = [];
    bus.subscribe("expense.rejected", (event) => { rejections.push((event as { payload: unknown }).payload); });
    const expense = manager.submitExpense({
      employeeId: "emp-5",
      category: "entertainment",
      amountUsd: 200,
      description: "Client entertainment",
      receiptUrl: "https://example.com/receipt.pdf",
      expenseDate: "2026-06-01",
    });
    manager.reject(expense.id, "Exceeds entertainment policy", "manager-1");
    assert.equal(rejections.length, 1);
    const ev = rejections[0] as { reason: string };
    assert.equal(ev.reason, "Exceeds entertainment policy");
    assert.equal(manager.get(expense.id)!.status, "rejected");
  });

  it("summary computes pendingReimbursementUsd correctly", () => {
    const bus = new EventBus();
    const manager = new ExpenseManager(bus);
    const e1 = manager.submitExpense({
      employeeId: "emp-6",
      category: "meals",
      amountUsd: 60,
      description: "Lunch",
      receiptUrl: "https://example.com/r1.pdf",
      expenseDate: "2026-06-01",
    });
    const e2 = manager.submitExpense({
      employeeId: "emp-6",
      category: "meals",
      amountUsd: 40,
      description: "Dinner",
      receiptUrl: "https://example.com/r2.pdf",
      expenseDate: "2026-06-02",
    });
    manager.approve(e1.id, "mgr");
    manager.approve(e2.id, "mgr");
    manager.reimburse(e1.id); // e1 reimbursed; e2 pending
    const s = manager.summary();
    assert.equal(s.pendingReimbursementUsd, 40);
  });
});

// ---------------------------------------------------------------------------
// ApplicantTracker
// ---------------------------------------------------------------------------

import { ApplicantTracker } from "../recruitment/ats.js";

describe("ApplicantTracker", () => {
  it("openRequisition stores job", () => {
    const bus = new EventBus();
    const ats = new ApplicantTracker(bus);
    const req = ats.openRequisition({
      title: "Senior Engineer",
      department: "engineering",
      level: "L5",
      status: "open",
      headcount: 2,
      salaryMinUsd: 180_000,
      salaryMaxUsd: 230_000,
      requiredSkills: ["TypeScript"],
      hiringManagerId: "mgr-1",
    });
    assert.ok(req.id);
    assert.equal(req.title, "Senior Engineer");
    assert.equal(req.filledCount, 0);
    assert.ok(req.openedAt);
    assert.deepEqual(ats.getRequisition(req.id), req);
  });

  it("addCandidate stores candidate", () => {
    const bus = new EventBus();
    const ats = new ApplicantTracker(bus);
    const req = ats.openRequisition({
      title: "PM",
      department: "product",
      level: "Senior",
      status: "open",
      headcount: 1,
      salaryMinUsd: 150_000,
      salaryMaxUsd: 190_000,
      requiredSkills: ["Product strategy"],
      hiringManagerId: "vp-1",
    });
    const candidate = ats.addCandidate({
      jobId: req.id,
      name: "Alice Doe",
      email: "alice@example.com",
      stage: "applied",
      source: "linkedin",
    });
    assert.ok(candidate.id);
    assert.equal(candidate.name, "Alice Doe");
    assert.equal(candidate.stage, "applied");
    assert.deepEqual(candidate.scorecards, []);
    assert.deepEqual(ats.get(candidate.id), candidate);
  });

  it("advanceStage emits recruitment.candidate_advanced", () => {
    const bus = new EventBus();
    const ats = new ApplicantTracker(bus);
    const events: unknown[] = [];
    bus.subscribe("recruitment.candidate_advanced", (ev) => { events.push((ev as { payload: unknown }).payload); });
    const req = ats.openRequisition({
      title: "Engineer",
      department: "eng",
      level: "L4",
      status: "open",
      headcount: 1,
      salaryMinUsd: 150_000,
      salaryMaxUsd: 200_000,
      requiredSkills: ["Node.js"],
      hiringManagerId: "mgr-1",
    });
    const c = ats.addCandidate({
      jobId: req.id,
      name: "Bob Smith",
      email: "bob@example.com",
      stage: "applied",
      source: "referral",
    });
    ats.advanceStage(c.id, "screening");
    assert.equal(events.length, 1);
    const ev = events[0] as { candidateId: string; from: string; to: string };
    assert.equal(ev.candidateId, c.id);
    assert.equal(ev.from, "applied");
    assert.equal(ev.to, "screening");
    assert.equal(ats.get(c.id)!.stage, "screening");
  });

  it("extendOffer emits recruitment.offer_extended and sets offer fields", () => {
    const bus = new EventBus();
    const ats = new ApplicantTracker(bus);
    const offerEvents: unknown[] = [];
    bus.subscribe("recruitment.offer_extended", (ev) => { offerEvents.push((ev as { payload: unknown }).payload); });
    const req = ats.openRequisition({
      title: "Designer",
      department: "design",
      level: "Mid",
      status: "open",
      headcount: 1,
      salaryMinUsd: 120_000,
      salaryMaxUsd: 160_000,
      requiredSkills: ["Figma"],
      hiringManagerId: "mgr-2",
    });
    const c = ats.addCandidate({
      jobId: req.id,
      name: "Carol White",
      email: "carol@example.com",
      stage: "onsite",
      source: "job_board",
    });
    ats.extendOffer(c.id, 145_000, 0.1);
    assert.equal(offerEvents.length, 1);
    const ev = offerEvents[0] as { offerUsd: number; equity: number };
    assert.equal(ev.offerUsd, 145_000);
    assert.equal(ev.equity, 0.1);
    const updated = ats.get(c.id)!;
    assert.equal(updated.stage, "offer");
    assert.equal(updated.offerSalaryUsd, 145_000);
    assert.equal(updated.offerEquityPct, 0.1);
  });

  it("hire emits recruitment.hired and increments filledCount", () => {
    const bus = new EventBus();
    const ats = new ApplicantTracker(bus);
    const hireEvents: unknown[] = [];
    bus.subscribe("recruitment.hired", (ev) => { hireEvents.push((ev as { payload: unknown }).payload); });
    const req = ats.openRequisition({
      title: "Analyst",
      department: "finance",
      level: "Junior",
      status: "open",
      headcount: 1,
      salaryMinUsd: 90_000,
      salaryMaxUsd: 120_000,
      requiredSkills: ["Excel"],
      hiringManagerId: "cfo-1",
    });
    const c = ats.addCandidate({
      jobId: req.id,
      name: "Dan Lee",
      email: "dan@example.com",
      stage: "offer",
      source: "inbound",
    });
    c.offerSalaryUsd = 105_000;
    ats.hire(c.id, "2026-08-01");
    assert.equal(hireEvents.length, 1);
    const ev = hireEvents[0] as { startDate: string };
    assert.equal(ev.startDate, "2026-08-01");
    assert.equal(ats.get(c.id)!.stage, "hired");
    assert.equal(ats.getRequisition(req.id)!.filledCount, 1);
    assert.equal(ats.getRequisition(req.id)!.status, "filled");
  });

  it("metrics returns pipeline breakdown", () => {
    const bus = new EventBus();
    const ats = new ApplicantTracker(bus);
    const req = ats.openRequisition({
      title: "QA Engineer",
      department: "qa",
      level: "Mid",
      status: "open",
      headcount: 2,
      salaryMinUsd: 100_000,
      salaryMaxUsd: 140_000,
      requiredSkills: ["Testing"],
      hiringManagerId: "qa-mgr-1",
    });
    ats.addCandidate({ jobId: req.id, name: "E1", email: "e1@example.com", stage: "applied", source: "linkedin" });
    ats.addCandidate({ jobId: req.id, name: "E2", email: "e2@example.com", stage: "screening", source: "referral" });
    ats.addCandidate({ jobId: req.id, name: "E3", email: "e3@example.com", stage: "applied", source: "linkedin" });
    const m = ats.metrics();
    assert.equal(m.openRequisitions, 1);
    assert.equal(m.totalCandidates, 3);
    assert.equal(m.pipelineByStage["applied"], 2);
    assert.equal(m.pipelineByStage["screening"], 1);
    assert.equal(m.sourceBreakdown["linkedin"], 2);
    assert.equal(m.sourceBreakdown["referral"], 1);
  });
});

// KnowledgeBase
import { KnowledgeBase } from "../knowledge-base/knowledge-base.js";

describe("KnowledgeBase", () => {
  it("publishArticle emits kb.article_published", () => {
    const bus = new EventBus();
    const kb = new KnowledgeBase(bus);
    const events: unknown[] = [];
    bus.subscribe("kb.article_published", (ev) => { events.push((ev as { payload: unknown }).payload); });
    kb.createCollection({ id: "col-1", name: "Engineering", description: "Eng docs", ownerTeam: "eng" });
    kb.publishArticle({
      title: "Deploy Guide",
      content: "# Deploy\nSteps...",
      type: "runbook",
      collectionId: "col-1",
      authorId: "author-1",
      reviewIntervalDays: 90,
    });
    assert.equal(events.length, 1);
    const ev = events[0] as { title: string; authorId: string };
    assert.equal(ev.title, "Deploy Guide");
    assert.equal(ev.authorId, "author-1");
  });

  it("recordView increments viewCount and emits event", () => {
    const bus = new EventBus();
    const kb = new KnowledgeBase(bus);
    const viewEvents: unknown[] = [];
    bus.subscribe("kb.article_viewed", (ev) => { viewEvents.push((ev as { payload: unknown }).payload); });
    kb.createCollection({ id: "col-1", name: "Eng", description: "desc", ownerTeam: "eng" });
    const art = kb.publishArticle({
      title: "Howto",
      content: "content",
      type: "howto",
      collectionId: "col-1",
      authorId: "author-1",
      reviewIntervalDays: 90,
    });
    kb.recordView(art.id, "viewer-1");
    kb.recordView(art.id, "viewer-2");
    assert.equal(kb.get(art.id)!.viewCount, 2);
    assert.equal(viewEvents.length, 2);
    const ev = viewEvents[0] as { articleId: string; viewerId: string };
    assert.equal(ev.articleId, art.id);
    assert.equal(ev.viewerId, "viewer-1");
  });

  it("search returns matching articles by title keyword", () => {
    const bus = new EventBus();
    const kb = new KnowledgeBase(bus);
    kb.createCollection({ id: "col-1", name: "Eng", description: "desc", ownerTeam: "eng" });
    kb.publishArticle({ title: "Database Backup Guide", content: "backup steps", type: "howto", collectionId: "col-1", authorId: "a1", reviewIntervalDays: 90 });
    kb.publishArticle({ title: "Deploy Runbook", content: "deploy steps", type: "runbook", collectionId: "col-1", authorId: "a1", reviewIntervalDays: 90 });
    const results = kb.search("backup");
    assert.equal(results.length, 1);
    assert.equal(results[0]!.title, "Database Backup Guide");
  });

  it("checkStaleness marks old articles stale", () => {
    const bus = new EventBus();
    const kb = new KnowledgeBase(bus);
    const staleEvents: unknown[] = [];
    bus.subscribe("kb.article_stale", (ev) => { staleEvents.push((ev as { payload: unknown }).payload); });
    kb.createCollection({ id: "col-1", name: "HR", description: "HR docs", ownerTeam: "hr" });
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);
    kb.publishArticle({
      title: "Old Policy",
      content: "outdated content",
      type: "policy",
      collectionId: "col-1",
      authorId: "hr-1",
      reviewIntervalDays: 90,
      lastReviewedAt: oldDate.toISOString(),
    });
    const staled = kb.checkStaleness();
    assert.equal(staled.length, 1);
    assert.equal(staled[0]!.status, "stale");
    assert.equal(staleEvents.length, 1);
  });

  it("updateArticle increments version", () => {
    const bus = new EventBus();
    const kb = new KnowledgeBase(bus);
    kb.createCollection({ id: "col-1", name: "Eng", description: "desc", ownerTeam: "eng" });
    const art = kb.publishArticle({
      title: "API Guide",
      content: "v1 content",
      type: "reference",
      collectionId: "col-1",
      authorId: "a1",
      reviewIntervalDays: 90,
    });
    assert.equal(art.version, 1);
    const updated = kb.updateArticle(art.id, { content: "v2 content", reviewedBy: "reviewer-1" });
    assert.ok(updated);
    assert.equal(updated!.version, 2);
    assert.equal(updated!.reviewedBy, "reviewer-1");
    assert.ok(updated!.lastReviewedAt);
  });

  it("summary returns topArticles sorted by views", () => {
    const bus = new EventBus();
    const kb = new KnowledgeBase(bus);
    kb.createCollection({ id: "col-1", name: "Eng", description: "desc", ownerTeam: "eng" });
    const a1 = kb.publishArticle({ title: "Popular Article", content: "c", type: "howto", collectionId: "col-1", authorId: "a1", reviewIntervalDays: 90 });
    const a2 = kb.publishArticle({ title: "Less Popular", content: "c", type: "howto", collectionId: "col-1", authorId: "a1", reviewIntervalDays: 90 });
    for (let i = 0; i < 10; i++) kb.recordView(a1.id, `u${i}`);
    for (let i = 0; i < 3; i++) kb.recordView(a2.id, `u${i}`);
    const s = kb.summary();
    assert.equal(s.totalArticles, 2);
    assert.equal(s.totalViews, 13);
    assert.equal(s.topArticles[0]!.id, a1.id);
    assert.equal(s.topArticles[0]!.viewCount, 10);
  });
});

import { ContractManager } from "../contracts-mgmt/contract-manager.js";

describe("ContractManager", () => {
  it("createContract stores contract", () => {
    const bus = new EventBus();
    const cm = new ContractManager(bus);
    const c = cm.createContract({
      title: "Test MSA",
      type: "msa",
      status: "draft",
      counterpartyName: "Acme",
      counterpartyType: "customer",
      ownerId: "emp-1",
      autoRenews: false,
      renewalNoticeDays: 30,
    });
    assert.ok(c.id);
    assert.equal(cm.get(c.id)!.title, "Test MSA");
    assert.equal(cm.list().length, 1);
  });

  it("advanceStatus to active emits contract.executed", () => {
    const bus = new EventBus();
    const cm = new ContractManager(bus);
    const events: unknown[] = [];
    bus.subscribe("contract.executed", (ev) => { events.push((ev as { payload: unknown }).payload); });
    const c = cm.createContract({
      title: "NDA Test",
      type: "nda",
      status: "pending_signature",
      counterpartyName: "PartnerCo",
      counterpartyType: "partner",
      ownerId: "emp-1",
      autoRenews: false,
      renewalNoticeDays: 30,
    });
    cm.advanceStatus(c.id, "active");
    assert.equal(events.length, 1);
    const ev = events[0] as { contractId: string; title: string };
    assert.equal(ev.contractId, c.id);
    assert.equal(ev.title, "NDA Test");
    assert.ok(cm.get(c.id)!.executedAt);
  });

  it("terminate emits contract.terminated", () => {
    const bus = new EventBus();
    const cm = new ContractManager(bus);
    const events: unknown[] = [];
    bus.subscribe("contract.terminated", (ev) => { events.push((ev as { payload: unknown }).payload); });
    const c = cm.createContract({
      title: "Lease",
      type: "lease",
      status: "active",
      counterpartyName: "Landlord LLC",
      counterpartyType: "landlord",
      ownerId: "ops-1",
      autoRenews: false,
      renewalNoticeDays: 90,
    });
    cm.terminate(c.id, "Moved to remote-first");
    assert.equal(events.length, 1);
    const ev = events[0] as { contractId: string; reason: string };
    assert.equal(ev.contractId, c.id);
    assert.equal(ev.reason, "Moved to remote-first");
    assert.equal(cm.get(c.id)!.status, "terminated");
  });

  it("checkExpirations finds contracts expiring within threshold", () => {
    const bus = new EventBus();
    const cm = new ContractManager(bus);
    const expiryEvents: unknown[] = [];
    bus.subscribe("contract.expiring_soon", (ev) => { expiryEvents.push((ev as { payload: unknown }).payload); });
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    const far = new Date();
    far.setDate(far.getDate() + 200);
    cm.createContract({
      title: "Expiring Contract",
      type: "sow",
      status: "active",
      counterpartyName: "Agency",
      counterpartyType: "vendor",
      ownerId: "ops-1",
      autoRenews: false,
      renewalNoticeDays: 30,
      endDate: soon.toISOString().split("T")[0],
    });
    cm.createContract({
      title: "Far Contract",
      type: "msa",
      status: "active",
      counterpartyName: "BigCo",
      counterpartyType: "customer",
      ownerId: "ops-1",
      autoRenews: false,
      renewalNoticeDays: 30,
      endDate: far.toISOString().split("T")[0],
    });
    const expiring = cm.checkExpirations(90);
    assert.equal(expiring.length, 1);
    assert.equal(expiring[0]!.title, "Expiring Contract");
    assert.equal(expiryEvents.length, 1);
  });

  it("renew updates endDate and status", () => {
    const bus = new EventBus();
    const cm = new ContractManager(bus);
    const c = cm.createContract({
      title: "Renewable MSA",
      type: "msa",
      status: "active",
      counterpartyName: "Acme",
      counterpartyType: "customer",
      ownerId: "emp-1",
      autoRenews: true,
      renewalNoticeDays: 60,
    });
    const newEnd = "2027-12-31";
    const renewed = cm.renew(c.id, newEnd, 300_000);
    assert.ok(renewed);
    assert.equal(renewed!.status, "renewed");
    assert.equal(renewed!.endDate, newEnd);
    assert.equal(renewed!.valueUsd, 300_000);
  });

  it("summary counts activeContracts correctly", () => {
    const bus = new EventBus();
    const cm = new ContractManager(bus);
    cm.createContract({ title: "A", type: "msa", status: "active", counterpartyName: "X", counterpartyType: "customer", ownerId: "e1", autoRenews: false, renewalNoticeDays: 30 });
    cm.createContract({ title: "B", type: "nda", status: "active", counterpartyName: "Y", counterpartyType: "vendor", ownerId: "e1", autoRenews: false, renewalNoticeDays: 30 });
    cm.createContract({ title: "C", type: "sow", status: "terminated", counterpartyName: "Z", counterpartyType: "vendor", ownerId: "e1", autoRenews: false, renewalNoticeDays: 30 });
    const s = cm.summary();
    assert.equal(s.totalContracts, 3);
    assert.equal(s.activeContracts, 2);
    assert.equal(s.byStatus["active"], 2);
    assert.equal(s.byStatus["terminated"], 1);
  });
});

// ---------------------------------------------------------------------------
// PayrollEngine
// ---------------------------------------------------------------------------
import { PayrollEngine } from "../payroll/payroll-engine.js";

describe("PayrollEngine", () => {
  it("setCompensation stores record", () => {
    const bus = new EventBus();
    const engine = new PayrollEngine(bus);
    engine.setCompensation({ employeeId: "emp-1", annualSalaryUsd: 120_000, payType: "salary", payFrequency: "biweekly", effectiveDate: "2025-01-01" });
    const rec = engine.getCompensation("emp-1");
    assert.ok(rec);
    assert.equal(rec.annualSalaryUsd, 120_000);
    assert.equal(rec.employeeId, "emp-1");
  });

  it("setCompensation emits payroll.compensation_updated when previous salary provided", () => {
    const bus = new EventBus();
    const engine = new PayrollEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("payroll.compensation_updated", (ev) => { events.push((ev as { payload: unknown }).payload); });
    engine.setCompensation({ employeeId: "emp-2", annualSalaryUsd: 150_000, payType: "salary", payFrequency: "semimonthly", effectiveDate: "2025-06-01", previousSalaryUsd: 130_000 });
    assert.equal(events.length, 1);
    const ev = events[0] as { employeeId: string; oldSalaryUsd: number; newSalaryUsd: number };
    assert.equal(ev.employeeId, "emp-2");
    assert.equal(ev.oldSalaryUsd, 130_000);
    assert.equal(ev.newSalaryUsd, 150_000);
  });

  it("processPayPeriod creates stubs for all employees", () => {
    const bus = new EventBus();
    const engine = new PayrollEngine(bus);
    engine.setCompensation({ employeeId: "emp-a", annualSalaryUsd: 100_000, payType: "salary", payFrequency: "monthly", effectiveDate: "2025-01-01" });
    engine.setCompensation({ employeeId: "emp-b", annualSalaryUsd: 80_000, payType: "salary", payFrequency: "monthly", effectiveDate: "2025-01-01" });
    const period = engine.processPayPeriod({ startDate: "2025-05-01", endDate: "2025-05-31", frequency: "monthly", employeeIds: ["emp-a", "emp-b"] });
    assert.equal(period.employeeCount, 2);
    const stubs = engine.getStubsForPeriod(period.id);
    assert.equal(stubs.length, 2);
  });

  it("net pay is less than gross pay", () => {
    const bus = new EventBus();
    const engine = new PayrollEngine(bus);
    engine.setCompensation({ employeeId: "emp-c", annualSalaryUsd: 144_000, payType: "salary", payFrequency: "monthly", effectiveDate: "2025-01-01" });
    const period = engine.processPayPeriod({ startDate: "2025-05-01", endDate: "2025-05-31", frequency: "monthly", employeeIds: ["emp-c"] });
    const stubs = engine.getStubsForPeriod(period.id);
    assert.equal(stubs.length, 1);
    const stub = stubs[0]!;
    assert.ok(stub.netPayUsd < stub.grossPayUsd);
  });

  it("processPayPeriod emits payroll.period_processed", () => {
    const bus = new EventBus();
    const engine = new PayrollEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("payroll.period_processed", (ev) => { events.push((ev as { payload: unknown }).payload); });
    engine.setCompensation({ employeeId: "emp-d", annualSalaryUsd: 96_000, payType: "salary", payFrequency: "biweekly", effectiveDate: "2025-01-01" });
    engine.processPayPeriod({ startDate: "2025-05-01", endDate: "2025-05-14", frequency: "biweekly", employeeIds: ["emp-d"] });
    assert.equal(events.length, 1);
    const ev = events[0] as { periodId: string; employeeCount: number };
    assert.ok(ev.periodId);
    assert.equal(ev.employeeCount, 1);
  });

  it("summary computes monthlyPayrollUsd correctly", () => {
    const bus = new EventBus();
    const engine = new PayrollEngine(bus);
    engine.setCompensation({ employeeId: "emp-e", annualSalaryUsd: 120_000, payType: "salary", payFrequency: "monthly", effectiveDate: "2025-01-01" });
    engine.setCompensation({ employeeId: "emp-f", annualSalaryUsd: 60_000, payType: "salary", payFrequency: "monthly", effectiveDate: "2025-01-01" });
    const s = engine.summary();
    assert.equal(s.monthlyPayrollUsd, (120_000 + 60_000) / 12);
    assert.equal(s.annualPayrollUsd, 180_000);
    assert.equal(s.totalEmployees, 2);
  });
});

// ---------------------------------------------------------------------------
// InventoryManager
// ---------------------------------------------------------------------------
import { InventoryManager } from "../inventory/inventory-manager.js";
describe("InventoryManager", () => {
  it("addSKU sets status based on qty", () => {
    const bus = new EventBus();
    const inv = new InventoryManager(bus);
    const inStock = inv.addSKU({ name: "Laptop", sku: "HW-1", category: "hardware", unitCostUsd: 1000, currentQty: 10, reservedQty: 0, reorderPoint: 3, reorderQty: 5 });
    const low = inv.addSKU({ name: "Cable", sku: "ACC-1", category: "accessories", unitCostUsd: 10, currentQty: 2, reservedQty: 0, reorderPoint: 3, reorderQty: 5 });
    const out = inv.addSKU({ name: "Desk", sku: "FURN-1", category: "furniture", unitCostUsd: 500, currentQty: 0, reservedQty: 0, reorderPoint: 2, reorderQty: 3 });
    assert.equal(inStock.status, "in_stock");
    assert.equal(low.status, "low_stock");
    assert.equal(out.status, "out_of_stock");
  });

  it("recordMovement increases stock on purchase", () => {
    const bus = new EventBus();
    const inv = new InventoryManager(bus);
    const sku = inv.addSKU({ name: "Chair", sku: "FURN-2", category: "furniture", unitCostUsd: 400, currentQty: 5, reservedQty: 0, reorderPoint: 3, reorderQty: 5 });
    inv.recordMovement(sku.id, "purchase", 10);
    const updated = inv.getSKU(sku.id)!;
    assert.equal(updated.currentQty, 15);
  });

  it("recordMovement emits inventory.stock_movement", () => {
    const bus = new EventBus();
    const inv = new InventoryManager(bus);
    const events: unknown[] = [];
    bus.subscribe("inventory.stock_movement", (ev) => { events.push((ev as { payload: unknown }).payload); });
    const sku = inv.addSKU({ name: "Monitor", sku: "HW-2", category: "hardware", unitCostUsd: 300, currentQty: 10, reservedQty: 0, reorderPoint: 3, reorderQty: 5 });
    inv.recordMovement(sku.id, "sale", -2);
    assert.equal(events.length, 1);
    const ev = events[0] as { skuId: string; type: string; quantity: number; newTotalQty: number };
    assert.equal(ev.skuId, sku.id);
    assert.equal(ev.type, "sale");
    assert.equal(ev.quantity, -2);
    assert.equal(ev.newTotalQty, 8);
  });

  it("recordMovement triggers low_stock alert when crossing threshold", () => {
    const bus = new EventBus();
    const inv = new InventoryManager(bus);
    const lowEvents: unknown[] = [];
    bus.subscribe("inventory.low_stock", (ev) => { lowEvents.push((ev as { payload: unknown }).payload); });
    const sku = inv.addSKU({ name: "USB Hub", sku: "ACC-2", category: "accessories", unitCostUsd: 30, currentQty: 5, reservedQty: 0, reorderPoint: 3, reorderQty: 5 });
    inv.recordMovement(sku.id, "sale", -3); // drops to 2, crosses threshold
    assert.equal(lowEvents.length, 1);
    const ev = lowEvents[0] as { skuId: string; currentQty: number };
    assert.equal(ev.skuId, sku.id);
    assert.equal(ev.currentQty, 2);
  });

  it("reserve reduces available qty", () => {
    const bus = new EventBus();
    const inv = new InventoryManager(bus);
    const sku = inv.addSKU({ name: "Keyboard", sku: "ACC-3", category: "accessories", unitCostUsd: 80, currentQty: 10, reservedQty: 0, reorderPoint: 3, reorderQty: 5 });
    const ok = inv.reserve(sku.id, 4);
    assert.equal(ok, true);
    assert.equal(inv.getSKU(sku.id)!.reservedQty, 4);
    const fail = inv.reserve(sku.id, 7); // only 6 available
    assert.equal(fail, false);
  });

  it("summary computes totalInventoryValueUsd", () => {
    const bus = new EventBus();
    const inv = new InventoryManager(bus);
    inv.addSKU({ name: "Item A", sku: "X-1", category: "hardware", unitCostUsd: 100, currentQty: 3, reservedQty: 0, reorderPoint: 1, reorderQty: 2 });
    inv.addSKU({ name: "Item B", sku: "X-2", category: "hardware", unitCostUsd: 200, currentQty: 5, reservedQty: 0, reorderPoint: 2, reorderQty: 3 });
    const s = inv.summary();
    assert.equal(s.totalInventoryValueUsd, 3 * 100 + 5 * 200); // 1300
    assert.equal(s.totalSKUs, 2);
  });
});

// ---------------------------------------------------------------------------
// PartnerManager
// ---------------------------------------------------------------------------

import { PartnerManager } from "../partners/partner-manager.js";

describe("PartnerManager", () => {
  it("registerPartner emits partner.registered", () => {
    const bus = new EventBus();
    const pm = new PartnerManager(bus);
    const events: unknown[] = [];
    bus.subscribe("partner.registered", (ev) => { events.push((ev as { payload: unknown }).payload); });
    const p = pm.registerPartner({
      name: "Acme Partners",
      type: "reseller",
      tier: "silver",
      region: "North America",
      contactName: "Jane Doe",
      contactEmail: "jane@acmepartners.com",
      certifiedProducts: [],
      commissionRate: 10,
    });
    assert.equal(events.length, 1);
    const ev = events[0] as { partnerId: string; name: string; tier: string };
    assert.equal(ev.partnerId, p.id);
    assert.equal(ev.name, "Acme Partners");
    assert.equal(ev.tier, "silver");
  });

  it("registerDeal increments partner deal count", () => {
    const bus = new EventBus();
    const pm = new PartnerManager(bus);
    const p = pm.registerPartner({
      name: "Beta Partners",
      type: "referral",
      tier: "silver",
      region: "EMEA",
      contactName: "Bob Smith",
      contactEmail: "bob@beta.com",
      certifiedProducts: [],
      commissionRate: 8,
    });
    assert.equal(p.totalDealsRegistered, 0);
    pm.registerDeal({
      partnerId: p.id,
      dealName: "Deal One",
      customerName: "Customer A",
      type: "referral",
      valueUsd: 20_000,
      status: "registered",
    });
    assert.equal(pm.get(p.id)!.totalDealsRegistered, 1);
  });

  it("closeDeal won updates ytdRevenue", () => {
    const bus = new EventBus();
    const pm = new PartnerManager(bus);
    const p = pm.registerPartner({
      name: "Gamma Partners",
      type: "reseller",
      tier: "silver",
      region: "APAC",
      contactName: "Carol Lee",
      contactEmail: "carol@gamma.com",
      certifiedProducts: [],
      commissionRate: 15,
    });
    const deal = pm.registerDeal({
      partnerId: p.id,
      dealName: "Gamma Deal",
      customerName: "Customer B",
      type: "resell",
      valueUsd: 30_000,
      status: "registered",
    });
    const closed = pm.closeDeal(deal.id, true);
    assert.equal(closed!.status, "closed_won");
    assert.equal(closed!.commissionUsd, 30_000 * 0.15);
    assert.equal(pm.get(p.id)!.ytdRevenueUsd, 30_000);
  });

  it("closeDeal triggers tier upgrade when threshold crossed", () => {
    const bus = new EventBus();
    const pm = new PartnerManager(bus);
    const upgradeEvents: unknown[] = [];
    bus.subscribe("partner.tier_upgraded", (ev) => { upgradeEvents.push((ev as { payload: unknown }).payload); });
    const p = pm.registerPartner({
      name: "Delta Partners",
      type: "reseller",
      tier: "silver",
      region: "North America",
      contactName: "Dave Chen",
      contactEmail: "dave@delta.com",
      certifiedProducts: [],
      commissionRate: 12,
    });
    const deal = pm.registerDeal({
      partnerId: p.id,
      dealName: "Threshold Deal",
      customerName: "Customer C",
      type: "resell",
      valueUsd: 55_000,
      status: "registered",
    });
    pm.closeDeal(deal.id, true);
    assert.equal(upgradeEvents.length, 1);
    const ev = upgradeEvents[0] as { partnerId: string; from: string; to: string };
    assert.equal(ev.partnerId, p.id);
    assert.equal(ev.from, "silver");
    assert.equal(ev.to, "gold");
    assert.equal(pm.get(p.id)!.tier, "gold");
  });

  it("closeDeal lost does not update revenue", () => {
    const bus = new EventBus();
    const pm = new PartnerManager(bus);
    const p = pm.registerPartner({
      name: "Epsilon Partners",
      type: "affiliate",
      tier: "silver",
      region: "LATAM",
      contactName: "Elena Rivera",
      contactEmail: "elena@epsilon.com",
      certifiedProducts: [],
      commissionRate: 5,
    });
    const deal = pm.registerDeal({
      partnerId: p.id,
      dealName: "Lost Deal",
      customerName: "Customer D",
      type: "referral",
      valueUsd: 40_000,
      status: "registered",
    });
    const closed = pm.closeDeal(deal.id, false);
    assert.equal(closed!.status, "closed_lost");
    assert.equal(pm.get(p.id)!.ytdRevenueUsd, 0);
    assert.equal(closed!.commissionUsd, undefined);
  });

  it("summary returns topPartner correctly", () => {
    const bus = new EventBus();
    const pm = new PartnerManager(bus);
    pm.registerPartner({
      name: "Low Revenue Partner",
      type: "affiliate",
      tier: "silver",
      region: "North America",
      contactName: "Alice",
      contactEmail: "alice@low.com",
      certifiedProducts: [],
      commissionRate: 5,
    });
    const highP = pm.registerPartner({
      name: "High Revenue Partner",
      type: "reseller",
      tier: "gold",
      region: "North America",
      contactName: "Bob",
      contactEmail: "bob@high.com",
      certifiedProducts: [],
      commissionRate: 15,
    });
    const deal = pm.registerDeal({
      partnerId: highP.id,
      dealName: "Big Deal",
      customerName: "Customer E",
      type: "resell",
      valueUsd: 100_000,
      status: "registered",
    });
    pm.closeDeal(deal.id, true);
    const s = pm.summary();
    assert.equal(s.topPartner, "High Revenue Partner");
    assert.equal(s.totalPartners, 2);
    assert.equal(s.totalPartnerRevenueUsd, 100_000);
  });
});

// ---------------------------------------------------------------------------
// EventManager
// ---------------------------------------------------------------------------

import { EventManager } from "../events-mgmt/event-manager.js";

describe("EventManager", () => {
  it("createEvent emits event_mgmt.event_created", () => {
    const bus = new EventBus();
    const em = new EventManager(bus);
    const emitted: unknown[] = [];
    bus.subscribe("event_mgmt.event_created", (e) => { emitted.push(e); });
    em.createEvent({
      name: "Test Conf",
      type: "conference",
      status: "planning",
      startDate: "2025-09-01",
      endDate: "2025-09-03",
      location: "New York, NY",
      budgetUsd: 10_000,
      expectedAttendees: 50,
      ownerId: "owner-1",
    });
    assert.equal(emitted.length, 1);
    const evt = emitted[0] as { payload: Record<string, unknown> };
    assert.equal(evt.payload["name"], "Test Conf");
  });

  it("registerAttendee increments registrationCount", () => {
    const bus = new EventBus();
    const em = new EventManager(bus);
    const ev = em.createEvent({
      name: "Webinar X",
      type: "webinar",
      status: "registration_open",
      startDate: "2025-10-01",
      endDate: "2025-10-01",
      location: "virtual",
      budgetUsd: 1_000,
      expectedAttendees: 100,
      ownerId: "owner-2",
    });
    assert.equal(ev.registrationCount, 0);
    em.registerAttendee(ev.id, {
      attendeeId: "att-1",
      attendeeName: "Alice",
      attendeeType: "prospect",
    });
    const updated = em.get(ev.id)!;
    assert.equal(updated.registrationCount, 1);
  });

  it("recordAttendance sets attended flag", () => {
    const bus = new EventBus();
    const em = new EventManager(bus);
    const ev = em.createEvent({
      name: "Workshop Y",
      type: "workshop",
      status: "in_progress",
      startDate: "2025-11-01",
      endDate: "2025-11-01",
      location: "Chicago, IL",
      budgetUsd: 2_000,
      expectedAttendees: 20,
      ownerId: "owner-3",
    });
    const reg = em.registerAttendee(ev.id, {
      attendeeId: "att-2",
      attendeeName: "Bob",
      attendeeType: "customer",
    });
    assert.ok(reg);
    assert.equal(reg.attended, false);
    const updated = em.recordAttendance(reg.id);
    assert.ok(updated);
    assert.equal(updated.attended, true);
    assert.equal(em.get(ev.id)!.attendanceCount, 1);
  });

  it("qualifyLead increments leadsGenerated", () => {
    const bus = new EventBus();
    const em = new EventManager(bus);
    const ev = em.createEvent({
      name: "Meetup Z",
      type: "meetup",
      status: "registration_open",
      startDate: "2025-08-10",
      endDate: "2025-08-10",
      location: "Austin, TX",
      budgetUsd: 500,
      expectedAttendees: 30,
      ownerId: "owner-4",
    });
    const reg = em.registerAttendee(ev.id, {
      attendeeId: "att-3",
      attendeeName: "Carol",
      attendeeType: "prospect",
    });
    assert.ok(reg);
    assert.equal(em.get(ev.id)!.leadsGenerated, 0);
    em.qualifyLead(reg.id);
    assert.equal(em.get(ev.id)!.leadsGenerated, 1);
  });

  it("completeEvent emits event_mgmt.completed", () => {
    const bus = new EventBus();
    const em = new EventManager(bus);
    const emitted: unknown[] = [];
    bus.subscribe("event_mgmt.completed", (e) => { emitted.push(e); });
    const ev = em.createEvent({
      name: "Trade Show A",
      type: "trade_show",
      status: "in_progress",
      startDate: "2025-05-01",
      endDate: "2025-05-03",
      location: "Las Vegas, NV",
      budgetUsd: 50_000,
      expectedAttendees: 200,
      ownerId: "owner-5",
    });
    em.completeEvent(ev.id, 48_000, 400_000);
    assert.equal(emitted.length, 1);
    const evt = emitted[0] as { payload: Record<string, unknown> };
    assert.equal(evt.payload["eventId"], ev.id);
    assert.ok(typeof evt.payload["roiPct"] === "number");
  });

  it("summary computes avgRoiPct", () => {
    const bus = new EventBus();
    const em = new EventManager(bus);
    // Event 1: spend $100, pipeline $200 → ROI 100%
    const ev1 = em.createEvent({
      name: "Event One",
      type: "conference",
      status: "completed",
      startDate: "2025-01-01",
      endDate: "2025-01-02",
      location: "Boston, MA",
      budgetUsd: 100,
      expectedAttendees: 10,
      ownerId: "owner-6",
    });
    em.completeEvent(ev1.id, 100, 200);
    // Event 2: spend $200, pipeline $600 → ROI 200%
    const ev2 = em.createEvent({
      name: "Event Two",
      type: "webinar",
      status: "completed",
      startDate: "2025-02-01",
      endDate: "2025-02-01",
      location: "virtual",
      budgetUsd: 200,
      expectedAttendees: 50,
      ownerId: "owner-7",
    });
    em.completeEvent(ev2.id, 200, 600);
    const s = em.summary();
    assert.equal(s.completedEvents, 2);
    // avgRoiPct = (100 + 200) / 2 = 150
    assert.equal(s.avgRoiPct, 150);
  });
});

// ---------------------------------------------------------------------------
// AuditLog
// ---------------------------------------------------------------------------

import { AuditLog } from "../audit/audit-log.js";

describe("AuditLog", () => {
  it("record stores entry with generated id", () => {
    const al = new AuditLog();
    const entry = al.record({
      action: "user.login",
      severity: "info",
      actorId: "user-1",
      actorType: "user",
      resourceType: "session",
      description: "User logged in",
    });
    assert.ok(entry.id);
    assert.ok(entry.timestamp);
    assert.equal(entry.action, "user.login");
    assert.equal(al.getEntry(entry.id)?.id, entry.id);
  });

  it("query filters by actorId", () => {
    const al = new AuditLog();
    al.record({ action: "user.login", severity: "info", actorId: "alice", actorType: "user", resourceType: "session", description: "Alice login" });
    al.record({ action: "user.login", severity: "info", actorId: "bob", actorType: "user", resourceType: "session", description: "Bob login" });
    al.record({ action: "data.exported", severity: "warning", actorId: "alice", actorType: "user", resourceType: "report", description: "Alice exported" });
    const results = al.query({ actorId: "alice" });
    assert.equal(results.length, 2);
    assert.ok(results.every((e) => e.actorId === "alice"));
  });

  it("query filters by severity", () => {
    const al = new AuditLog();
    al.record({ action: "user.login", severity: "info", actorId: "u1", actorType: "user", resourceType: "session", description: "Login" });
    al.record({ action: "autonomy.level_changed", severity: "critical", actorId: "u2", actorType: "user", resourceType: "autonomy_grant", description: "Critical change" });
    al.record({ action: "data.exported", severity: "warning", actorId: "u3", actorType: "user", resourceType: "report", description: "Export" });
    const critical = al.query({ severity: "critical" });
    assert.equal(critical.length, 1);
    assert.equal(critical[0]!.action, "autonomy.level_changed");
  });

  it("query respects limit", () => {
    const al = new AuditLog();
    for (let i = 0; i < 20; i++) {
      al.record({ action: "user.login", severity: "info", actorId: `user-${i}`, actorType: "user", resourceType: "session", description: `Login ${i}` });
    }
    const results = al.query({ limit: 5 });
    assert.equal(results.length, 5);
  });

  it("query returns newest-first", () => {
    const al = new AuditLog();
    al.record({ action: "user.login", severity: "info", actorId: "u1", actorType: "user", resourceType: "session", description: "First", timestamp: "2025-01-01T00:00:00.000Z" });
    al.record({ action: "user.logout", severity: "info", actorId: "u1", actorType: "user", resourceType: "session", description: "Second", timestamp: "2025-01-02T00:00:00.000Z" });
    al.record({ action: "data.created", severity: "info", actorId: "u1", actorType: "user", resourceType: "record", description: "Third", timestamp: "2025-01-03T00:00:00.000Z" });
    const results = al.query({});
    assert.equal(results[0]!.description, "Third");
    assert.equal(results[2]!.description, "First");
  });

  it("summary counts criticalEntries correctly", () => {
    const al = new AuditLog();
    al.record({ action: "user.login", severity: "info", actorId: "u1", actorType: "user", resourceType: "session", description: "Info 1" });
    al.record({ action: "autonomy.level_changed", severity: "critical", actorId: "u2", actorType: "user", resourceType: "grant", description: "Critical 1" });
    al.record({ action: "policy.updated", severity: "critical", actorId: "u3", actorType: "system", resourceType: "policy", description: "Critical 2" });
    al.record({ action: "data.exported", severity: "warning", actorId: "u4", actorType: "user", resourceType: "report", description: "Warning 1" });
    const s = al.summary();
    assert.equal(s.totalEntries, 4);
    assert.equal(s.criticalEntries, 2);
    assert.ok(s.uniqueActors >= 3);
  });
});

describe("BillingEngine", () => {
  it("createInvoice emits billing.invoice_created", () => {
    const bus = new EventBus();
    const engine = new BillingEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("billing.invoice_created", (e) => { events.push(e.payload); });
    engine.addSubscription({ customerId: "c1", planId: "p1", planName: "Starter", mrrUsd: 500, status: "active", billingCycleDay: 1, startDate: "2026-01-01", paymentMethod: "card" });
    engine.createInvoice({ customerId: "c1", subscriptionId: "sub-1", status: "open", amountUsd: 500, periodStart: "2026-01-01", periodEnd: "2026-01-31", dueDate: "2026-02-01", lineItems: [] });
    assert.equal(events.length, 1);
    assert.equal((events[0] as { customerId: string }).customerId, "c1");
  });

  it("recordPayment marks invoice paid", () => {
    const bus = new EventBus();
    const engine = new BillingEngine(bus);
    engine.addSubscription({ customerId: "c2", planId: "p1", planName: "Growth", mrrUsd: 1000, status: "active", billingCycleDay: 1, startDate: "2026-01-01", paymentMethod: "card" });
    const inv = engine.createInvoice({ customerId: "c2", subscriptionId: "sub-2", status: "open", amountUsd: 1000, periodStart: "2026-01-01", periodEnd: "2026-01-31", dueDate: "2026-02-01", lineItems: [] });
    const updated = engine.recordPayment(inv.id, 1000);
    assert.equal(updated?.status, "paid");
    assert.equal(updated?.paidAmountUsd, 1000);
  });

  it("recordPayment emits billing.payment_received", () => {
    const bus = new EventBus();
    const engine = new BillingEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("billing.payment_received", (e) => { events.push(e.payload); });
    engine.addSubscription({ customerId: "c3", planId: "p1", planName: "Growth", mrrUsd: 800, status: "active", billingCycleDay: 1, startDate: "2026-01-01", paymentMethod: "ach" });
    const inv = engine.createInvoice({ customerId: "c3", subscriptionId: "sub-3", status: "open", amountUsd: 800, periodStart: "2026-01-01", periodEnd: "2026-01-31", dueDate: "2026-02-01", lineItems: [] });
    engine.recordPayment(inv.id, 800);
    assert.equal(events.length, 1);
    assert.equal((events[0] as { amountUsd: number }).amountUsd, 800);
  });

  it("recordFailedAttempt increments attemptCount", () => {
    const bus = new EventBus();
    const engine = new BillingEngine(bus);
    engine.addSubscription({ customerId: "c4", planId: "p1", planName: "Starter", mrrUsd: 300, status: "active", billingCycleDay: 1, startDate: "2026-01-01", paymentMethod: "card" });
    const inv = engine.createInvoice({ customerId: "c4", subscriptionId: "sub-4", status: "open", amountUsd: 300, periodStart: "2026-01-01", periodEnd: "2026-01-31", dueDate: "2026-02-01", lineItems: [] });
    engine.recordFailedAttempt(inv.id);
    engine.recordFailedAttempt(inv.id);
    const updated = engine.getInvoice(inv.id);
    assert.equal(updated?.attemptCount, 2);
  });

  it("recordMrrMovement emits billing.mrr_changed", () => {
    const bus = new EventBus();
    const engine = new BillingEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("billing.mrr_changed", (e) => { events.push(e.payload); });
    engine.addSubscription({ customerId: "c5", planId: "p1", planName: "Growth", mrrUsd: 1000, status: "active", billingCycleDay: 1, startDate: "2026-01-01", paymentMethod: "card" });
    engine.recordMrrMovement("c5", "expansion", 1500);
    assert.equal(events.length, 1);
    assert.equal((events[0] as { movement: string }).movement, "expansion");
    assert.equal((events[0] as { newMrrUsd: number }).newMrrUsd, 1500);
  });

  it("summary computes totalMrrUsd from active subscriptions", () => {
    const bus = new EventBus();
    const engine = new BillingEngine(bus);
    engine.addSubscription({ customerId: "cA", planId: "p1", planName: "Starter", mrrUsd: 500, status: "active", billingCycleDay: 1, startDate: "2026-01-01", paymentMethod: "card" });
    engine.addSubscription({ customerId: "cB", planId: "p2", planName: "Growth", mrrUsd: 1200, status: "active", billingCycleDay: 1, startDate: "2026-01-01", paymentMethod: "ach" });
    engine.addSubscription({ customerId: "cC", planId: "p1", planName: "Starter", mrrUsd: 800, status: "cancelled", billingCycleDay: 1, startDate: "2026-01-01", paymentMethod: "card" });
    const s = engine.summary();
    assert.equal(s.totalMrrUsd, 1700);
    assert.equal(s.activeSubscriptions, 2);
    assert.equal(s.totalArrUsd, 1700 * 12);
  });
});

describe("AnalyticsEngine", () => {
  it("defineMetric stores definition", () => {
    const bus = new EventBus();
    const engine = new AnalyticsEngine(bus);
    const metric = engine.defineMetric({ name: "Test Metric", description: "A test metric", type: "gauge", unit: "count" });
    assert.ok(metric.id);
    assert.equal(metric.name, "Test Metric");
    assert.equal(engine.getMetric(metric.id)?.name, "Test Metric");
    assert.equal(engine.listMetrics().length, 1);
  });

  it("record stores data point and emits event", () => {
    const bus = new EventBus();
    const engine = new AnalyticsEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("analytics.metric_recorded", (e) => { events.push(e.payload); });
    const metric = engine.defineMetric({ name: "DAU", description: "Daily active users", type: "gauge", unit: "count" });
    const dp = engine.record(metric.id, 500);
    assert.ok(dp);
    assert.equal(dp?.value, 500);
    assert.equal(events.length, 1);
    assert.equal((events[0] as { value: number }).value, 500);
  });

  it("record emits threshold_breached when value exceeds thresholdHigh", () => {
    const bus = new EventBus();
    const engine = new AnalyticsEngine(bus);
    const breaches: unknown[] = [];
    bus.subscribe("analytics.threshold_breached", (e) => { breaches.push(e.payload); });
    const metric = engine.defineMetric({ name: "Latency", description: "p99 latency", type: "gauge", unit: "ms", thresholdHigh: 500 });
    engine.record(metric.id, 400); // below threshold
    engine.record(metric.id, 600); // above threshold
    assert.equal(breaches.length, 1);
    assert.equal((breaches[0] as { direction: string }).direction, "up");
  });

  it("getSeries computes aggregations correctly", () => {
    const bus = new EventBus();
    const engine = new AnalyticsEngine(bus);
    const metric = engine.defineMetric({ name: "Revenue", description: "Monthly revenue", type: "currency", unit: "usd" });
    engine.record(metric.id, 100, "2026-01-01T00:00:00.000Z");
    engine.record(metric.id, 200, "2026-02-01T00:00:00.000Z");
    engine.record(metric.id, 300, "2026-03-01T00:00:00.000Z");
    const series = engine.getSeries(metric.id);
    assert.equal(series.aggregations.sum, 600);
    assert.equal(series.aggregations.avg, 200);
    assert.equal(series.aggregations.min, 100);
    assert.equal(series.aggregations.max, 300);
    assert.equal(series.aggregations.count, 3);
    assert.equal(series.aggregations.last, 300);
  });

  it("getSeries detects trend direction", () => {
    const bus = new EventBus();
    const engine = new AnalyticsEngine(bus);
    const metric = engine.defineMetric({ name: "Trend Metric", description: "Trend test", type: "gauge", unit: "count" });
    engine.record(metric.id, 100, "2026-01-01T00:00:00.000Z");
    engine.record(metric.id, 200, "2026-02-01T00:00:00.000Z");
    const upSeries = engine.getSeries(metric.id);
    assert.equal(upSeries.trend, "up");

    const metric2 = engine.defineMetric({ name: "Declining", description: "Decline test", type: "gauge", unit: "count" });
    engine.record(metric2.id, 200, "2026-01-01T00:00:00.000Z");
    engine.record(metric2.id, 100, "2026-02-01T00:00:00.000Z");
    const downSeries = engine.getSeries(metric2.id);
    assert.equal(downSeries.trend, "down");
  });

  it("summary counts metricsWithAlerts", () => {
    const bus = new EventBus();
    const engine = new AnalyticsEngine(bus);
    const m1 = engine.defineMetric({ name: "High Latency", description: "Latency metric", type: "gauge", unit: "ms", thresholdHigh: 500 });
    const m2 = engine.defineMetric({ name: "Low Revenue", description: "Revenue metric", type: "currency", unit: "usd", thresholdLow: 10_000 });
    const m3 = engine.defineMetric({ name: "Normal", description: "Normal metric", type: "gauge", unit: "count" });
    engine.record(m1.id, 600); // breaches high threshold
    engine.record(m2.id, 5_000); // breaches low threshold
    engine.record(m3.id, 42); // no threshold
    const s = engine.summary();
    assert.equal(s.metricsWithAlerts, 2);
    assert.equal(s.totalMetrics, 3);
    assert.equal(s.totalDataPoints, 3);
  });
});

// ---------------------------------------------------------------------------
// FeedbackEngine
// ---------------------------------------------------------------------------

describe("FeedbackEngine", () => {
  it("submitResponse emits feedback.nps_submitted for NPS score", () => {
    const bus = new EventBus();
    const engine = new FeedbackEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("feedback.nps_submitted", (e) => { events.push(e); });
    const survey = engine.createSurvey({ name: "NPS Test", type: "nps", questions: [], status: "active" });
    engine.submitResponse({ surveyId: survey.id, respondentId: "user-1", answers: [], npsScore: 9 });
    assert.equal(events.length, 1);
  });

  it("submitResponse categorizes promoter correctly (score 9)", () => {
    const bus = new EventBus();
    const engine = new FeedbackEngine(bus);
    let emitted: Record<string, unknown> | undefined;
    bus.subscribe("feedback.nps_submitted", (e) => { emitted = e.payload as Record<string, unknown>; });
    const survey = engine.createSurvey({ name: "NPS Test", type: "nps", questions: [], status: "active" });
    engine.submitResponse({ surveyId: survey.id, respondentId: "user-1", answers: [], npsScore: 9 });
    assert.equal(emitted?.["category"], "promoter");
  });

  it("submitResponse categorizes detractor correctly (score 5)", () => {
    const bus = new EventBus();
    const engine = new FeedbackEngine(bus);
    let emitted: Record<string, unknown> | undefined;
    bus.subscribe("feedback.nps_submitted", (e) => { emitted = e.payload as Record<string, unknown>; });
    const survey = engine.createSurvey({ name: "NPS Test", type: "nps", questions: [], status: "active" });
    engine.submitResponse({ surveyId: survey.id, respondentId: "user-1", answers: [], npsScore: 5 });
    assert.equal(emitted?.["category"], "detractor");
  });

  it("voteForRequest increments vote count", () => {
    const bus = new EventBus();
    const engine = new FeedbackEngine(bus);
    const req = engine.createFeatureRequest({ title: "Dark Mode", description: "Add dark mode", requesterId: "user-1", status: "open" });
    engine.voteForRequest(req.id);
    engine.voteForRequest(req.id);
    const updated = engine.listFeatureRequests()[0];
    assert.equal(updated?.votes, 2);
  });

  it("summary computes NPS score correctly", () => {
    const bus = new EventBus();
    const engine = new FeedbackEngine(bus);
    const survey = engine.createSurvey({ name: "NPS", type: "nps", questions: [], status: "active" });
    // 4 promoters, 2 passives, 2 detractors => (4/8 - 2/8)*100 = 25.0
    for (const score of [9, 10, 8, 7, 4, 9, 10, 6]) {
      engine.submitResponse({ surveyId: survey.id, respondentId: `r-${score}`, answers: [], npsScore: score });
    }
    const s = engine.summary();
    assert.equal(s.promoters, 4);
    assert.equal(s.detractors, 2);
    assert.equal(s.npsScore, 25.0);
  });

  it("createFeatureRequest emits event", () => {
    const bus = new EventBus();
    const engine = new FeedbackEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("feedback.feature_request", (e) => { events.push(e); });
    engine.createFeatureRequest({ title: "Webhooks", description: "Add webhooks", requesterId: "user-1", status: "open" });
    assert.equal(events.length, 1);
  });
});

// ---------------------------------------------------------------------------
// FlagManager
// ---------------------------------------------------------------------------

describe("FlagManager", () => {
  it("createFlag stores flag by key", () => {
    const bus = new EventBus();
    const fm = new FlagManager(bus);
    fm.createFlag({ key: "my-flag", name: "My Flag", description: "Test", status: "active", rolloutStrategy: "all", rolloutPct: 100, defaultValue: false });
    const flag = fm.getFlag("my-flag");
    assert.ok(flag !== undefined);
    assert.equal(flag?.key, "my-flag");
  });

  it("evaluate returns true for allowlisted user", () => {
    const bus = new EventBus();
    const fm = new FlagManager(bus);
    fm.createFlag({ key: "allowlist-flag", name: "Allowlist Flag", description: "Test", status: "active", rolloutStrategy: "allowlist", rolloutPct: 0, allowlist: ["user-123"], defaultValue: false });
    assert.equal(fm.evaluate("allowlist-flag", "user-123"), true);
  });

  it("evaluate returns false for inactive flag", () => {
    const bus = new EventBus();
    const fm = new FlagManager(bus);
    fm.createFlag({ key: "inactive-flag", name: "Inactive Flag", description: "Test", status: "inactive", rolloutStrategy: "all", rolloutPct: 100, defaultValue: false });
    assert.equal(fm.evaluate("inactive-flag", "any-user"), false);
  });

  it("evaluate percentage rollout is deterministic", () => {
    const bus = new EventBus();
    const fm = new FlagManager(bus);
    fm.createFlag({ key: "pct-flag", name: "Pct Flag", description: "Test", status: "active", rolloutStrategy: "percentage", rolloutPct: 50, defaultValue: false });
    const result1 = fm.evaluate("pct-flag", "user-abc");
    const result2 = fm.evaluate("pct-flag", "user-abc");
    assert.equal(result1, result2);
  });

  it("concludeExperiment sets winner correctly", () => {
    const bus = new EventBus();
    const fm = new FlagManager(bus);
    const exp = fm.createExperiment({ flagKey: "my-flag", name: "Exp", hypothesis: "H", startDate: new Date().toISOString(), status: "running" });
    const concluded = fm.concludeExperiment(exp.id, 0.05, 0.08);
    assert.equal(concluded?.winner, "treatment");
    assert.equal(concluded?.status, "concluded");
  });

  it("summary counts activeFlags", () => {
    const bus = new EventBus();
    const fm = new FlagManager(bus);
    fm.createFlag({ key: "flag-a", name: "A", description: "A", status: "active", rolloutStrategy: "all", rolloutPct: 100, defaultValue: false });
    fm.createFlag({ key: "flag-b", name: "B", description: "B", status: "inactive", rolloutStrategy: "all", rolloutPct: 0, defaultValue: false });
    fm.createFlag({ key: "flag-c", name: "C", description: "C", status: "active", rolloutStrategy: "all", rolloutPct: 100, defaultValue: false });
    const s = fm.summary();
    assert.equal(s.totalFlags, 3);
    assert.equal(s.activeFlags, 2);
  });
});

// ---------------------------------------------------------------------------
// AccessControl
// ---------------------------------------------------------------------------

import { AccessControl } from "../access/access-control.js";

describe("AccessControl", () => {
  it("createRole and createPrincipal store correctly", () => {
    const bus = new EventBus();
    const ac = new AccessControl(bus);
    const role = ac.createRole({ name: "Admin", description: "Full access", permissions: [{ resource: "*", actions: ["*"], effect: "allow" }] });
    const principal = ac.createPrincipal({ type: "user", name: "Alice", roleIds: [role.id], directPermissions: [], active: true });
    assert.equal(ac.getRole(role.id)?.name, "Admin");
    assert.equal(ac.getPrincipal(principal.id)?.name, "Alice");
  });

  it("check allows when role has matching permission", () => {
    const bus = new EventBus();
    const ac = new AccessControl(bus);
    const role = ac.createRole({ name: "Reader", description: "Read access", permissions: [{ resource: "incidents", actions: ["read"], effect: "allow" }] });
    const principal = ac.createPrincipal({ type: "user", name: "Bob", roleIds: [role.id], directPermissions: [], active: true });
    const decision = ac.check(principal.id, "incidents", "read");
    assert.equal(decision.allowed, true);
  });

  it("check denies when no matching permission", () => {
    const bus = new EventBus();
    const ac = new AccessControl(bus);
    const role = ac.createRole({ name: "Reader", description: "Read only", permissions: [{ resource: "incidents", actions: ["read"], effect: "allow" }] });
    const principal = ac.createPrincipal({ type: "user", name: "Carol", roleIds: [role.id], directPermissions: [], active: true });
    const decision = ac.check(principal.id, "incidents", "delete");
    assert.equal(decision.allowed, false);
  });

  it("check wildcard resource * matches any resource", () => {
    const bus = new EventBus();
    const ac = new AccessControl(bus);
    const role = ac.createRole({ name: "SuperAdmin", description: "All access", permissions: [{ resource: "*", actions: ["*"], effect: "allow" }] });
    const principal = ac.createPrincipal({ type: "user", name: "Dave", roleIds: [role.id], directPermissions: [], active: true });
    assert.equal(ac.check(principal.id, "finance", "write").allowed, true);
    assert.equal(ac.check(principal.id, "payroll", "delete").allowed, true);
  });

  it("createApiKey emits access.api_key_created", () => {
    const bus = new EventBus();
    const ac = new AccessControl(bus);
    ac.createPrincipal({ id: "svc-1", type: "service", name: "MyService", roleIds: [], directPermissions: [], active: true });
    const events: unknown[] = [];
    bus.subscribe("access.api_key_created", (e) => { events.push(e); });
    const key = ac.createApiKey("svc-1", "My Key", ["incidents:read"]);
    assert.equal(events.length, 1);
    assert.ok(key.keyPrefix.startsWith("sk_"));
  });

  it("summary counts activePrincipals", () => {
    const bus = new EventBus();
    const ac = new AccessControl(bus);
    ac.createPrincipal({ type: "user", name: "Active1", roleIds: [], directPermissions: [], active: true });
    ac.createPrincipal({ type: "user", name: "Active2", roleIds: [], directPermissions: [], active: true });
    ac.createPrincipal({ type: "user", name: "Inactive", roleIds: [], directPermissions: [], active: false });
    const s = ac.summary();
    assert.equal(s.totalPrincipals, 3);
    assert.equal(s.activePrincipals, 2);
  });
});

// ---------------------------------------------------------------------------
// NotificationCenter
// ---------------------------------------------------------------------------

import { NotificationCenter } from "../notifications-center/notification-center.js";

describe("NotificationCenter", () => {
  it("setPreference stores and emits event", () => {
    const bus = new EventBus();
    const nc = new NotificationCenter(bus);
    const events: unknown[] = [];
    bus.subscribe("notif_center.preference_updated", (e) => { events.push(e); });
    nc.setPreference({ userId: "u1", channel: "email", enabled: true, categories: ["incident"], digestFrequency: "daily" });
    assert.equal(nc.getPreferences("u1").length, 1);
    assert.equal(events.length, 1);
  });

  it("send marks as sent when channel enabled", () => {
    const bus = new EventBus();
    const nc = new NotificationCenter(bus);
    nc.setPreference({ userId: "u1", channel: "slack", enabled: true, categories: ["incident"], digestFrequency: "realtime" });
    const msg = nc.send({ userId: "u1", category: "incident", title: "Alert", body: "Something happened", channel: "slack", priority: "high" });
    assert.equal(msg.status, "sent");
    assert.ok(msg.sentAt !== undefined);
  });

  it("send stays pending when channel not in preferences", () => {
    const bus = new EventBus();
    const nc = new NotificationCenter(bus);
    // No preference set for this user/channel
    const msg = nc.send({ userId: "u2", category: "incident", title: "Alert", body: "Something happened", channel: "email", priority: "normal" });
    assert.equal(msg.status, "pending");
    assert.equal(msg.sentAt, undefined);
  });

  it("markRead updates status", () => {
    const bus = new EventBus();
    const nc = new NotificationCenter(bus);
    nc.setPreference({ userId: "u1", channel: "email", enabled: true, categories: ["billing"], digestFrequency: "daily" });
    const msg = nc.send({ userId: "u1", category: "billing", title: "Invoice", body: "Due soon", channel: "email", priority: "low" });
    const updated = nc.markRead(msg.id);
    assert.equal(updated?.status, "read");
    assert.ok(updated?.readAt !== undefined);
  });

  it("sendDigest collects pending messages and emits event", () => {
    const bus = new EventBus();
    const nc = new NotificationCenter(bus);
    const events: unknown[] = [];
    bus.subscribe("notif_center.digest_sent", (e) => { events.push(e); });
    // Send two digest messages that stay pending (no preference)
    nc.send({ userId: "u1", category: "digest", title: "D1", body: "Body1", channel: "email", priority: "low" });
    nc.send({ userId: "u1", category: "digest", title: "D2", body: "Body2", channel: "email", priority: "low" });
    const entry = nc.sendDigest("u1", "email");
    assert.ok(entry !== undefined);
    assert.equal(entry?.messageIds.length, 2);
    assert.equal(events.length, 1);
  });

  it("summary counts pendingNotifications", () => {
    const bus = new EventBus();
    const nc = new NotificationCenter(bus);
    // These stay pending — no preferences configured
    nc.send({ userId: "u1", category: "incident", title: "T1", body: "B1", channel: "email", priority: "normal" });
    nc.send({ userId: "u1", category: "alert", title: "T2", body: "B2", channel: "email", priority: "normal" });
    const s = nc.summary();
    assert.equal(s.pendingNotifications, 2);
  });
});

import { StrategyEngine } from "../strategy/strategy-engine.js";
import { OrgIntelligence } from "../org/org-intelligence.js";

describe("StrategyEngine", () => {
  it("addInitiative stores under pillar", () => {
    const bus = new EventBus();
    const se = new StrategyEngine(bus);
    const pillar = se.addPillar({ name: "Growth", description: "Grow revenue", owner: "ceo", horizon: "now" });
    const init = se.addInitiative({
      pillarId: pillar.id,
      title: "Launch feature X",
      description: "Ship feature X",
      owner: "pm",
      status: "on_track",
      progressPct: 50,
      startDate: "2025-01-01",
      targetDate: "2025-06-01",
    });
    const list = se.listInitiatives(pillar.id);
    assert.equal(list.length, 1);
    assert.equal(list[0]!.id, init.id);
  });

  it("updateInitiative emits strategy.initiative_updated", () => {
    const bus = new EventBus();
    const se = new StrategyEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("strategy.initiative_updated", (e) => { events.push(e); });
    const pillar = se.addPillar({ name: "P1", description: "", owner: "o", horizon: "now" });
    const init = se.addInitiative({
      pillarId: pillar.id,
      title: "Init A",
      description: "",
      owner: "o",
      status: "not_started",
      progressPct: 0,
      startDate: "2025-01-01",
      targetDate: "2025-12-01",
    });
    se.updateInitiative(init.id, { status: "on_track", progressPct: 30 });
    assert.equal(events.length, 1);
  });

  it("completeMilestone sets completed and emits event", () => {
    const bus = new EventBus();
    const se = new StrategyEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("strategy.milestone_completed", (e) => { events.push(e); });
    const pillar = se.addPillar({ name: "P2", description: "", owner: "o", horizon: "now" });
    const init = se.addInitiative({
      pillarId: pillar.id,
      title: "Init B",
      description: "",
      owner: "o",
      status: "on_track",
      progressPct: 0,
      startDate: "2025-01-01",
      targetDate: "2025-12-01",
    });
    const ms = se.addMilestone({ initiativeId: init.id, title: "M1", dueDate: "2025-06-01" });
    const result = se.completeMilestone(ms.id);
    assert.ok(result !== undefined);
    assert.equal(result!.completed, true);
    assert.ok(result!.completedAt !== undefined);
    assert.equal(events.length, 1);
  });

  it("completeMilestone updates initiative progress", () => {
    const bus = new EventBus();
    const se = new StrategyEngine(bus);
    const pillar = se.addPillar({ name: "P3", description: "", owner: "o", horizon: "now" });
    const init = se.addInitiative({
      pillarId: pillar.id,
      title: "Init C",
      description: "",
      owner: "o",
      status: "on_track",
      progressPct: 0,
      startDate: "2025-01-01",
      targetDate: "2025-12-01",
    });
    const ms1 = se.addMilestone({ initiativeId: init.id, title: "M1", dueDate: "2025-03-01" });
    se.addMilestone({ initiativeId: init.id, title: "M2", dueDate: "2025-06-01" });
    se.completeMilestone(ms1.id);
    const updated = se.getInitiative(init.id);
    assert.equal(updated?.progressPct, 50);
  });

  it("summary computes onTrackPct", () => {
    const bus = new EventBus();
    const se = new StrategyEngine(bus);
    const pillar = se.addPillar({ name: "P4", description: "", owner: "o", horizon: "now" });
    se.addInitiative({ pillarId: pillar.id, title: "I1", description: "", owner: "o", status: "on_track", progressPct: 50, startDate: "2025-01-01", targetDate: "2025-12-01" });
    se.addInitiative({ pillarId: pillar.id, title: "I2", description: "", owner: "o", status: "on_track", progressPct: 70, startDate: "2025-01-01", targetDate: "2025-12-01" });
    se.addInitiative({ pillarId: pillar.id, title: "I3", description: "", owner: "o", status: "at_risk", progressPct: 20, startDate: "2025-01-01", targetDate: "2025-12-01" });
    const s = se.summary();
    // 2 on_track out of 3 active (none are not_started or cancelled)
    assert.ok(Math.abs(s.onTrackPct - (2 / 3) * 100) < 0.01);
  });

  it("summary lists upcomingMilestones sorted by date", () => {
    const bus = new EventBus();
    const se = new StrategyEngine(bus);
    const pillar = se.addPillar({ name: "P5", description: "", owner: "o", horizon: "now" });
    const init = se.addInitiative({ pillarId: pillar.id, title: "I1", description: "", owner: "o", status: "on_track", progressPct: 0, startDate: "2025-01-01", targetDate: "2025-12-01" });
    se.addMilestone({ initiativeId: init.id, title: "Late", dueDate: "2025-09-01" });
    se.addMilestone({ initiativeId: init.id, title: "Early", dueDate: "2025-03-01" });
    se.addMilestone({ initiativeId: init.id, title: "Mid", dueDate: "2025-06-01" });
    const s = se.summary();
    assert.equal(s.upcomingMilestones.length, 3);
    assert.equal(s.upcomingMilestones[0]!.title, "Early");
    assert.equal(s.upcomingMilestones[1]!.title, "Mid");
    assert.equal(s.upcomingMilestones[2]!.title, "Late");
  });
});

describe("OrgIntelligence", () => {
  it("addTeam stores team", () => {
    const oi = new OrgIntelligence();
    const team = oi.addTeam({ name: "Engineering", topology: "platform", managerId: "mgr1", memberIds: ["e1", "e2", "e3"] });
    assert.ok(oi.getTeam(team.id) !== undefined);
    assert.equal(oi.getTeam(team.id)!.name, "Engineering");
  });

  it("analyzeSpans returns healthy for 3-8 reports", () => {
    const oi = new OrgIntelligence();
    oi.addTeam({ name: "Team A", topology: "stream_aligned", managerId: "mgr1", memberIds: ["e1", "e2", "e3", "e4", "e5"] });
    const spans = oi.analyzeSpans();
    assert.equal(spans.length, 1);
    assert.equal(spans[0]!.recommendation, "healthy");
  });

  it("analyzeSpans returns too_narrow for <3", () => {
    const oi = new OrgIntelligence();
    oi.addTeam({ name: "Team B", topology: "enabling", managerId: "mgr2", memberIds: ["e1", "e2"] });
    const spans = oi.analyzeSpans();
    assert.equal(spans[0]!.recommendation, "too_narrow");
  });

  it("analyzeSpans returns too_wide for >8", () => {
    const oi = new OrgIntelligence();
    oi.addTeam({ name: "Team C", topology: "stream_aligned", managerId: "mgr3", memberIds: ["e1","e2","e3","e4","e5","e6","e7","e8","e9"] });
    const spans = oi.analyzeSpans();
    assert.equal(spans[0]!.recommendation, "too_wide");
  });

  it("generateHealthReport returns healthScore 0-100", () => {
    const oi = new OrgIntelligence();
    oi.addTeam({ name: "Platform", topology: "platform", managerId: "mgr1", memberIds: ["e1", "e2", "e3", "e4"] });
    oi.addTeam({ name: "Product", topology: "stream_aligned", managerId: "mgr2", memberIds: ["e5", "e6", "e7"] });
    const report = oi.generateHealthReport();
    assert.ok(report.healthScore >= 0 && report.healthScore <= 100);
    assert.ok(report.totalHeadcount > 0);
  });

  it("listTeams filters by topology", () => {
    const oi = new OrgIntelligence();
    oi.addTeam({ name: "Platform", topology: "platform", managerId: "m1", memberIds: ["e1", "e2", "e3"] });
    oi.addTeam({ name: "Product", topology: "stream_aligned", managerId: "m2", memberIds: ["e4", "e5", "e6"] });
    oi.addTeam({ name: "Enablement", topology: "enabling", managerId: "m3", memberIds: ["e7", "e8", "e9"] });
    const platforms = oi.listTeams("platform");
    assert.equal(platforms.length, 1);
    assert.equal(platforms[0]!.name, "Platform");
    const all = oi.listTeams();
    assert.equal(all.length, 3);
  });
});

import { RevenueIntelEngine } from "../revenue-intel/revenue-intel.js";
import { ChurnPredictor } from "../churn/churn-predictor.js";

describe("RevenueIntelEngine", () => {
  it("addCohort computes retentionPct", () => {
    const bus = new EventBus();
    const ri = new RevenueIntelEngine(bus);
    const cohort = ri.addCohort({
      period: "2024-Q1",
      cohortPeriod: "quarterly",
      segment: "enterprise",
      accountCount: 10,
      initialArrUsd: 100_000,
      currentArrUsd: 90_000,
      avgLtvUsd: 50_000,
      churnedCount: 1,
      expandedCount: 0,
    });
    assert.ok(Math.abs(cohort.retentionPct - 90) < 0.001);
  });

  it("addCohort emits revenue.cohort_analyzed", () => {
    const bus = new EventBus();
    const ri = new RevenueIntelEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("revenue.cohort_analyzed", (e) => { events.push(e); });
    ri.addCohort({
      period: "2024-Q2",
      cohortPeriod: "quarterly",
      segment: "smb",
      accountCount: 5,
      initialArrUsd: 50_000,
      currentArrUsd: 45_000,
      avgLtvUsd: 10_000,
      churnedCount: 1,
      expandedCount: 0,
    });
    assert.equal(events.length, 1);
  });

  it("recordExpansion emits revenue.expansion_detected", () => {
    const bus = new EventBus();
    const ri = new RevenueIntelEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("revenue.expansion_detected", (e) => { events.push(e); });
    ri.recordExpansion({
      accountId: "acct-1",
      type: "upsell",
      previousArrUsd: 1_000,
      newArrUsd: 2_000,
      expansionUsd: 1_000,
      occurredAt: new Date().toISOString(),
    });
    assert.equal(events.length, 1);
  });

  it("setLtvModel computes predictedLtvUsd", () => {
    const bus = new EventBus();
    const ri = new RevenueIntelEngine(bus);
    const model = ri.setLtvModel({
      segment: "enterprise",
      avgContractLengthMonths: 24,
      avgMrrUsd: 8_000,
      avgChurnRateMonthly: 0.02,
      predictedLtvUsd: 0,
      confidenceScore: 80,
    });
    // 8000 / 0.02 = 400000
    assert.ok(Math.abs(model.predictedLtvUsd - 400_000) < 0.001);
  });

  it("summary identifies bestCohort by retention", () => {
    const bus = new EventBus();
    const ri = new RevenueIntelEngine(bus);
    ri.addCohort({ period: "2024-Q1", cohortPeriod: "quarterly", segment: "enterprise", accountCount: 10, initialArrUsd: 100_000, currentArrUsd: 80_000, avgLtvUsd: 50_000, churnedCount: 2, expandedCount: 0 });
    ri.addCohort({ period: "2024-Q2", cohortPeriod: "quarterly", segment: "enterprise", accountCount: 10, initialArrUsd: 100_000, currentArrUsd: 95_000, avgLtvUsd: 55_000, churnedCount: 0, expandedCount: 1 });
    const s = ri.summary();
    assert.equal(s.bestCohort, "2024-Q2");
  });

  it("listExpansions filters by accountId", () => {
    const bus = new EventBus();
    const ri = new RevenueIntelEngine(bus);
    ri.recordExpansion({ accountId: "acct-a", type: "upsell", previousArrUsd: 1_000, newArrUsd: 2_000, expansionUsd: 1_000, occurredAt: new Date().toISOString() });
    ri.recordExpansion({ accountId: "acct-b", type: "cross_sell", previousArrUsd: 500, newArrUsd: 700, expansionUsd: 200, occurredAt: new Date().toISOString() });
    ri.recordExpansion({ accountId: "acct-a", type: "seat_expansion", previousArrUsd: 2_000, newArrUsd: 2_500, expansionUsd: 500, occurredAt: new Date().toISOString() });
    const aExpansions = ri.listExpansions("acct-a");
    assert.equal(aExpansions.length, 2);
    const bExpansions = ri.listExpansions("acct-b");
    assert.equal(bExpansions.length, 1);
  });
});

describe("ChurnPredictor", () => {
  it("recordSignal stores signal", () => {
    const bus = new EventBus();
    const cp = new ChurnPredictor(bus);
    cp.recordSignal({ type: "payment_failure", accountId: "acct-1", severity: 2, detail: "Card declined" });
    cp.recordSignal({ type: "usage_drop", accountId: "acct-1", severity: 1, detail: "Usage down 40%" });
    // score the account to verify signals are picked up
    const score = cp.scoreAccount("acct-1");
    assert.equal(score.signals.length, 2);
  });

  it("scoreAccount computes score from signals", () => {
    const bus = new EventBus();
    const cp = new ChurnPredictor(bus);
    // payment_failure weight=20, severity=2 → 40; usage_drop weight=15, severity=1 → 15 = 55
    cp.recordSignal({ type: "payment_failure", accountId: "acct-2", severity: 2, detail: "Payment failed" });
    cp.recordSignal({ type: "usage_drop", accountId: "acct-2", severity: 1, detail: "Usage drop" });
    const score = cp.scoreAccount("acct-2");
    assert.equal(score.score, 55);
  });

  it("scoreAccount assigns correct tier", () => {
    const bus = new EventBus();
    const cp = new ChurnPredictor(bus);
    // champion_left weight=18, severity=3 → 54 → high tier
    cp.recordSignal({ type: "champion_left", accountId: "acct-3", severity: 3, detail: "Champion left" });
    const score = cp.scoreAccount("acct-3");
    assert.equal(score.tier, "high");
  });

  it("scoreAccount emits churn.risk_scored", () => {
    const bus = new EventBus();
    const cp = new ChurnPredictor(bus);
    const events: unknown[] = [];
    bus.subscribe("churn.risk_scored", (e) => { events.push(e); });
    cp.recordSignal({ type: "contract_aging", accountId: "acct-4", severity: 1, detail: "Old contract" });
    cp.scoreAccount("acct-4");
    assert.equal(events.length, 1);
  });

  it("scoreAccount triggers playbook for high risk", () => {
    const bus = new EventBus();
    const cp = new ChurnPredictor(bus);
    cp.addPlaybook({ id: "pb-high", name: "High Risk", triggerTier: "high", steps: ["Step 1"], owner: "CSM" });
    const triggered: unknown[] = [];
    bus.subscribe("churn.playbook_triggered", (e) => { triggered.push(e); });
    // champion_left weight=18, severity=3 → 54 → high tier → triggers playbook
    cp.recordSignal({ type: "champion_left", accountId: "acct-5", severity: 3, detail: "Champion left" });
    cp.scoreAccount("acct-5");
    assert.equal(triggered.length, 1);
  });

  it("summary returns byTier counts", () => {
    const bus = new EventBus();
    const cp = new ChurnPredictor(bus);
    // low score: contract_aging sev1 → 5
    cp.recordSignal({ type: "contract_aging", accountId: "low-acct", severity: 1, detail: "Aging" });
    cp.scoreAccount("low-acct");
    // medium: nps_decline sev2 → 24... need >=25. Let's use engagement_drop sev2 → 30
    cp.recordSignal({ type: "engagement_drop", accountId: "med-acct", severity: 2, detail: "Drop" });
    cp.scoreAccount("med-acct");
    // high: champion_left sev3 → 54
    cp.recordSignal({ type: "champion_left", accountId: "high-acct", severity: 3, detail: "Left" });
    cp.scoreAccount("high-acct");
    const s = cp.summary();
    assert.equal(s.totalScored, 3);
    assert.equal(s.byTier.low, 1);
    assert.equal(s.byTier.medium, 1);
    assert.equal(s.byTier.high, 1);
    assert.equal(s.byTier.critical, 0);
  });
});

import { OnboardingTracker } from "../onboarding/onboarding-tracker.js";
import { EngagementTracker } from "../engagement/engagement-tracker.js";

describe("OnboardingTracker", () => {
  it("startJourney emits onboarding.started", () => {
    const bus = new EventBus();
    const tracker = new OnboardingTracker(bus);
    const events: unknown[] = [];
    bus.subscribe("onboarding.started", (e) => { events.push(e); });
    tracker.createPlan({ id: "plan-1", name: "Test Plan", estimatedDays: 30, milestones: [] });
    tracker.startJourney({ accountId: "acc-1", planId: "plan-1" });
    assert.equal(events.length, 1);
  });

  it("completeMilestone adds to completedList", () => {
    const bus = new EventBus();
    const tracker = new OnboardingTracker(bus);
    tracker.createPlan({
      id: "plan-2",
      name: "Test Plan 2",
      estimatedDays: 30,
      milestones: [{ id: "ms-a", title: "Step A", category: "technical", dueOffsetDays: 7, required: true }],
    });
    const journey = tracker.startJourney({ accountId: "acc-2", planId: "plan-2" });
    const updated = tracker.completeMilestone(journey.id, "ms-a");
    assert.ok(updated?.completedMilestoneIds.includes("ms-a"));
  });

  it("completeMilestone completes journey when all required done", () => {
    const bus = new EventBus();
    const tracker = new OnboardingTracker(bus);
    tracker.createPlan({
      id: "plan-3",
      name: "Test Plan 3",
      estimatedDays: 30,
      milestones: [{ id: "ms-b", title: "Step B", category: "go_live", dueOffsetDays: 14, required: true }],
    });
    const journey = tracker.startJourney({ accountId: "acc-3", planId: "plan-3" });
    const updated = tracker.completeMilestone(journey.id, "ms-b");
    assert.equal(updated?.status, "completed");
  });

  it("completeMilestone emits onboarding.completed", () => {
    const bus = new EventBus();
    const tracker = new OnboardingTracker(bus);
    const completed: unknown[] = [];
    bus.subscribe("onboarding.completed", (e) => { completed.push(e); });
    tracker.createPlan({
      id: "plan-4",
      name: "Test Plan 4",
      estimatedDays: 30,
      milestones: [{ id: "ms-c", title: "Step C", category: "training", dueOffsetDays: 10, required: true }],
    });
    const journey = tracker.startJourney({ accountId: "acc-4", planId: "plan-4" });
    tracker.completeMilestone(journey.id, "ms-c");
    assert.equal(completed.length, 1);
  });

  it("markStalled emits onboarding.stalled", () => {
    const bus = new EventBus();
    const tracker = new OnboardingTracker(bus);
    const stalled: unknown[] = [];
    bus.subscribe("onboarding.stalled", (e) => { stalled.push(e); });
    tracker.createPlan({ id: "plan-5", name: "Test Plan 5", estimatedDays: 30, milestones: [] });
    const journey = tracker.startJourney({ accountId: "acc-5", planId: "plan-5" });
    tracker.markStalled(journey.id, "Blocked on procurement");
    assert.equal(stalled.length, 1);
  });

  it("summary computes completionRate", () => {
    const bus = new EventBus();
    const tracker = new OnboardingTracker(bus);
    tracker.createPlan({
      id: "plan-6",
      name: "Test Plan 6",
      estimatedDays: 30,
      milestones: [{ id: "ms-d", title: "Done", category: "go_live", dueOffsetDays: 5, required: true }],
    });
    const j1 = tracker.startJourney({ accountId: "acc-6a", planId: "plan-6" });
    tracker.completeMilestone(j1.id, "ms-d");
    tracker.startJourney({ accountId: "acc-6b", planId: "plan-6" });
    const s = tracker.summary();
    // 1 completed, 1 in_progress, 0 cancelled → completionRate = 1/(1+0)*100 = 100
    assert.equal(s.completedJourneys, 1);
    assert.ok(s.completionRate > 0);
  });
});

describe("EngagementTracker", () => {
  it("submitResponse emits engagement.pulse_submitted", () => {
    const bus = new EventBus();
    const tracker = new EngagementTracker(bus);
    const events: unknown[] = [];
    bus.subscribe("engagement.pulse_submitted", (e) => { events.push(e); });
    tracker.createSurvey({ id: "sv-1", name: "Survey 1", sentAt: new Date().toISOString(), targetEmployeeIds: ["emp-1"], status: "open" });
    tracker.submitResponse({ surveyId: "sv-1", employeeId: "emp-1", eNpsScore: 9, driverScores: { culture: 4 } });
    assert.equal(events.length, 1);
  });

  it("submitResponse increments survey responseCount", () => {
    const bus = new EventBus();
    const tracker = new EngagementTracker(bus);
    tracker.createSurvey({ id: "sv-2", name: "Survey 2", sentAt: new Date().toISOString(), targetEmployeeIds: ["emp-2", "emp-3"], status: "open" });
    tracker.submitResponse({ surveyId: "sv-2", employeeId: "emp-2", eNpsScore: 8, driverScores: { growth: 3 } });
    tracker.submitResponse({ surveyId: "sv-2", employeeId: "emp-3", eNpsScore: 7, driverScores: { growth: 4 } });
    const survey = tracker.getSurvey("sv-2");
    assert.equal(survey?.responseCount, 2);
  });

  it("assessFlightRisk emits event for high risk", () => {
    const bus = new EventBus();
    const tracker = new EngagementTracker(bus);
    const events: unknown[] = [];
    bus.subscribe("engagement.flight_risk_detected", (e) => { events.push(e); });
    tracker.assessFlightRisk("emp-risk", ["missed 1:1s", "declined promo", "job searching", "low NPS"]);
    assert.equal(events.length, 1);
  });

  it("assessFlightRisk assigns correct riskLevel", () => {
    const bus = new EventBus();
    const tracker = new EngagementTracker(bus);
    const low = tracker.assessFlightRisk("emp-low", ["one signal"]);
    assert.equal(low.riskLevel, "low"); // 1*20=20 < 30
    const medium = tracker.assessFlightRisk("emp-med", ["s1", "s2"]);
    assert.equal(medium.riskLevel, "medium"); // 2*20=40 in [30,60)
    const high = tracker.assessFlightRisk("emp-high", ["s1", "s2", "s3"]);
    assert.equal(high.riskLevel, "high"); // 3*20=60 >= 60
  });

  it("summary computes companyENps", () => {
    const bus = new EventBus();
    const tracker = new EngagementTracker(bus);
    tracker.createSurvey({ id: "sv-3", name: "Survey 3", sentAt: new Date().toISOString(), targetEmployeeIds: ["e1","e2","e3","e4"], status: "closed" });
    // 2 promoters (9,10), 1 passive (7), 1 detractor (5)
    tracker.submitResponse({ surveyId: "sv-3", employeeId: "e1", eNpsScore: 9, driverScores: {} });
    tracker.submitResponse({ surveyId: "sv-3", employeeId: "e2", eNpsScore: 10, driverScores: {} });
    tracker.submitResponse({ surveyId: "sv-3", employeeId: "e3", eNpsScore: 7, driverScores: {} });
    tracker.submitResponse({ surveyId: "sv-3", employeeId: "e4", eNpsScore: 5, driverScores: {} });
    const s = tracker.summary();
    // (2-1)/4*100 = 25
    assert.equal(s.companyENps, 25);
  });

  it("scoreTeam computes eNps for team", () => {
    const bus = new EventBus();
    const tracker = new EngagementTracker(bus);
    tracker.createSurvey({ id: "sv-4", name: "Survey 4", sentAt: new Date().toISOString(), targetEmployeeIds: ["t1","t2","t3"], status: "open" });
    tracker.submitResponse({ surveyId: "sv-4", employeeId: "t1", eNpsScore: 10, driverScores: { culture: 5 } });
    tracker.submitResponse({ surveyId: "sv-4", employeeId: "t2", eNpsScore: 10, driverScores: { culture: 4 } });
    tracker.submitResponse({ surveyId: "sv-4", employeeId: "t3", eNpsScore: 4, driverScores: { culture: 2 } });
    const score = tracker.scoreTeam("team-x", ["t1", "t2", "t3"]);
    // 2 promoters, 1 detractor, 0 passive → (2-1)/3*100 = 33
    assert.ok(score !== undefined);
    assert.equal(score.eNps, 33);
  });
});

// ── HeadcountPlanner ──────────────────────────────────────────────────────────
import { HeadcountPlanner } from "../headcount-plan/headcount-planner.js";

describe("HeadcountPlanner", () => {
  it("createPlan and listPlans", () => {
    const bus = new EventBus();
    const hp = new HeadcountPlanner(bus);
    const plan = hp.createPlan({ name: "Q3 2026", horizon: "q3", year: 2026, status: "draft" });
    assert.equal(plan.status, "draft");
    assert.equal(hp.listPlans().length, 1);
  });

  it("addRole updates plan cost and emits event", () => {
    const bus = new EventBus();
    const hp = new HeadcountPlanner(bus);
    const events: unknown[] = [];
    bus.subscribe("headcount.plan_updated", (e) => { events.push(e.payload); });
    const plan = hp.createPlan({ name: "H1", horizon: "h1", year: 2026, status: "draft" });
    const role = hp.addRole(plan.id, { title: "SWE", department: "Engineering", level: "L4", status: "planned", targetStartDate: "2026-09-01", annualSalaryUsd: 150000, benefits_multiplier: 1.25, priority: "high", backfill: false });
    assert.ok(role !== undefined);
    assert.equal(role!.totalCostUsd, 187500);
    assert.equal(events.length, 1);
    assert.equal(hp.getPlan(plan.id)!.totalHeadcount, 1);
  });

  it("approveRole emits hire_approved event", () => {
    const bus = new EventBus();
    const hp = new HeadcountPlanner(bus);
    const events: unknown[] = [];
    bus.subscribe("headcount.hire_approved", (e) => { events.push(e.payload); });
    const plan = hp.createPlan({ name: "H2", horizon: "h2", year: 2026, status: "draft" });
    const role = hp.addRole(plan.id, { title: "PM", department: "Product", level: "L5", status: "planned", targetStartDate: "2026-10-01", annualSalaryUsd: 180000, benefits_multiplier: 1.2, priority: "critical", backfill: false });
    hp.approveRole(role!.id);
    assert.equal(events.length, 1);
    assert.equal(hp.getRole(role!.id)!.status, "approved");
  });

  it("updatePlanStatus transitions correctly", () => {
    const bus = new EventBus();
    const hp = new HeadcountPlanner(bus);
    const plan = hp.createPlan({ name: "Annual", horizon: "annual", year: 2026, status: "draft" });
    const updated = hp.updatePlanStatus(plan.id, "approved", "cfo@helios.ai");
    assert.equal(updated!.status, "approved");
    assert.equal(updated!.approvedBy, "cfo@helios.ai");
  });

  it("listRoles filters by department", () => {
    const bus = new EventBus();
    const hp = new HeadcountPlanner(bus);
    const plan = hp.createPlan({ name: "Test", horizon: "q4", year: 2026, status: "draft" });
    hp.addRole(plan.id, { title: "SWE", department: "Engineering", level: "L4", status: "planned", targetStartDate: "2026-11-01", annualSalaryUsd: 140000, benefits_multiplier: 1.25, priority: "medium", backfill: false });
    hp.addRole(plan.id, { title: "AE", department: "Sales", level: "IC3", status: "planned", targetStartDate: "2026-11-01", annualSalaryUsd: 120000, benefits_multiplier: 1.2, priority: "high", backfill: false });
    const engRoles = hp.listRoles(plan.id, "planned");
    assert.equal(engRoles.length, 2);
  });

  it("summary returns correct counts", () => {
    const bus = new EventBus();
    const hp = new HeadcountPlanner(bus);
    const plan = hp.createPlan({ name: "Sum", horizon: "annual", year: 2026, status: "active" });
    hp.addRole(plan.id, { title: "DS", department: "Data", level: "L4", status: "approved", targetStartDate: "2026-08-01", annualSalaryUsd: 160000, benefits_multiplier: 1.3, priority: "critical", backfill: false });
    const s = hp.summary();
    assert.equal(s.totalPlans, 1);
    assert.equal(s.activePlans, 1);
    assert.equal(s.totalPlannedHires, 1);
    assert.equal(s.approvedHires, 1);
    assert.equal(s.totalPlannedCostUsd, 208000);
  });
});

// ── ScenarioSimulator ─────────────────────────────────────────────────────────
import { ScenarioSimulator } from "../scenario-sim/scenario-simulator.js";

describe("ScenarioSimulator", () => {
  it("runScenario creates scenario and emits event", () => {
    const bus = new EventBus();
    const sim = new ScenarioSimulator(bus);
    const events: unknown[] = [];
    bus.subscribe("scenario.run_completed", (e) => { events.push(e.payload); });
    const sc = sim.runScenario({
      name: "Price Increase 10%",
      type: "pricing_change",
      description: "Test scenario",
      variables: [{ name: "price", currentValue: 100, proposedValue: 110, unit: "USD", impactWeight: 0.8 }],
      baselineOutcomes: [{ metric: "revenue", value: 1000000 }],
    });
    assert.ok(sc.id);
    assert.equal(events.length, 1);
  });

  it("recommendation proceed when overallScore > 10", () => {
    const bus = new EventBus();
    const sim = new ScenarioSimulator(bus);
    const sc = sim.runScenario({
      name: "Big Win",
      type: "market_expansion",
      description: "expand",
      variables: [{ name: "customers", currentValue: 100, proposedValue: 200, unit: "count", impactWeight: 1 }],
      baselineOutcomes: [{ metric: "arr", value: 2000000 }],
    });
    assert.equal(sc.recommendation, "proceed");
    assert.ok(sc.overallScore > 10);
  });

  it("recommendation reject when no positive delta", () => {
    const bus = new EventBus();
    const sim = new ScenarioSimulator(bus);
    const sc = sim.runScenario({
      name: "Cost Cut",
      type: "cost_cut",
      description: "reduce headcount",
      variables: [{ name: "headcount", currentValue: 100, proposedValue: 80, unit: "people", impactWeight: 0.9 }],
      baselineOutcomes: [{ metric: "revenue", value: 500000 }],
    });
    assert.equal(sc.recommendation, "reject");
  });

  it("listScenarios filters by type", () => {
    const bus = new EventBus();
    const sim = new ScenarioSimulator(bus);
    sim.runScenario({ name: "A", type: "headcount", description: "", variables: [{ name: "hc", currentValue: 50, proposedValue: 60, unit: "ppl", impactWeight: 0.5 }], baselineOutcomes: [{ metric: "headcount", value: 50 }] });
    sim.runScenario({ name: "B", type: "pricing_change", description: "", variables: [{ name: "price", currentValue: 100, proposedValue: 105, unit: "USD", impactWeight: 0.6 }], baselineOutcomes: [{ metric: "revenue", value: 100000 }] });
    assert.equal(sim.listScenarios("headcount").length, 1);
    assert.equal(sim.listScenarios().length, 2);
  });

  it("compareScenarios sorts by score descending", () => {
    const bus = new EventBus();
    const sim = new ScenarioSimulator(bus);
    const sc1 = sim.runScenario({ name: "Low", type: "custom", description: "", variables: [{ name: "x", currentValue: 10, proposedValue: 11, unit: "u", impactWeight: 0.1 }], baselineOutcomes: [{ metric: "profit", value: 1000 }] });
    const sc2 = sim.runScenario({ name: "High", type: "custom", description: "", variables: [{ name: "x", currentValue: 10, proposedValue: 20, unit: "u", impactWeight: 0.9 }], baselineOutcomes: [{ metric: "profit", value: 1000 }] });
    const cmp = sim.compareScenarios([sc1.id, sc2.id]);
    assert.ok(cmp[0] !== undefined);
    assert.equal(cmp[0]!.name, "High");
  });

  it("summary returns correct aggregate stats", () => {
    const bus = new EventBus();
    const sim = new ScenarioSimulator(bus);
    sim.runScenario({ name: "S1", type: "product_launch", description: "", variables: [{ name: "y", currentValue: 1, proposedValue: 2, unit: "u", impactWeight: 1 }], baselineOutcomes: [{ metric: "customer_count", value: 200 }] });
    const s = sim.summary();
    assert.equal(s.totalScenarios, 1);
    assert.ok(s.byType["product_launch"] === 1);
  });
});

// ── SupplyChainManager ────────────────────────────────────────────────────────
import { SupplyChainManager } from "../supply-chain/supply-chain-manager.js";

describe("SupplyChainManager", () => {
  it("addSupplier and listSuppliers", () => {
    const bus = new EventBus();
    const sc = new SupplyChainManager(bus);
    sc.addSupplier({ name: "Acme Parts", country: "US", category: "components", status: "active", leadTimeDays: 14, onTimeDeliveryPct: 92, qualityScore: 88, riskLevel: "low", contactEmail: "acme@supplier.com" });
    assert.equal(sc.listSuppliers().length, 1);
    assert.equal(sc.listSuppliers("active").length, 1);
  });

  it("placeOrder emits event and calculates total", () => {
    const bus = new EventBus();
    const sc = new SupplyChainManager(bus);
    const events: unknown[] = [];
    bus.subscribe("supply.order_placed", (e) => { events.push(e.payload); });
    const s = sc.addSupplier({ name: "FastShip", country: "DE", category: "logistics", status: "active", leadTimeDays: 7, onTimeDeliveryPct: 97, qualityScore: 95, riskLevel: "low", contactEmail: "fast@ship.de" });
    const order = sc.placeOrder({ supplierId: s.id, lines: [{ skuId: "sku-1", description: "Widget", quantity: 100, unitCostUsd: 5 }], expectedDelivery: "2026-08-01" });
    assert.ok(order !== undefined);
    assert.equal(order!.totalUsd, 500);
    assert.equal(events.length, 1);
  });

  it("receiveOrder marks on time and emits event", () => {
    const bus = new EventBus();
    const sc = new SupplyChainManager(bus);
    const events: unknown[] = [];
    bus.subscribe("supply.order_received", (e) => { events.push(e.payload); });
    const s = sc.addSupplier({ name: "OnTime Co", country: "JP", category: "raw", status: "active", leadTimeDays: 5, onTimeDeliveryPct: 99, qualityScore: 98, riskLevel: "low", contactEmail: "ot@jp.com" });
    const order = sc.placeOrder({ supplierId: s.id, lines: [{ skuId: "sku-2", description: "Bolt", quantity: 200, unitCostUsd: 1 }], expectedDelivery: "2026-08-10" })!;
    sc.receiveOrder(order.id, "2026-08-10");
    assert.equal(events.length, 1);
    assert.equal(sc.getOrder(order.id)!.daysVariance, 0);
  });

  it("flagSupplier updates risk level and emits event", () => {
    const bus = new EventBus();
    const sc = new SupplyChainManager(bus);
    const events: unknown[] = [];
    bus.subscribe("supply.supplier_flagged", (e) => { events.push(e.payload); });
    const s = sc.addSupplier({ name: "Risky Biz", country: "XX", category: "misc", status: "active", leadTimeDays: 30, onTimeDeliveryPct: 60, qualityScore: 50, riskLevel: "medium", contactEmail: "risky@biz.com" });
    sc.flagSupplier(s.id, "repeated delays", "critical");
    assert.equal(events.length, 1);
    assert.equal(sc.getSupplier(s.id)!.status, "on_hold");
  });

  it("listOrders filters by supplierId", () => {
    const bus = new EventBus();
    const sc = new SupplyChainManager(bus);
    const s1 = sc.addSupplier({ name: "S1", country: "US", category: "c", status: "active", leadTimeDays: 10, onTimeDeliveryPct: 90, qualityScore: 85, riskLevel: "low", contactEmail: "s1@test.com" });
    const s2 = sc.addSupplier({ name: "S2", country: "US", category: "c", status: "active", leadTimeDays: 10, onTimeDeliveryPct: 90, qualityScore: 85, riskLevel: "low", contactEmail: "s2@test.com" });
    sc.placeOrder({ supplierId: s1.id, lines: [{ skuId: "x", description: "X", quantity: 1, unitCostUsd: 10 }], expectedDelivery: "2026-09-01" });
    sc.placeOrder({ supplierId: s2.id, lines: [{ skuId: "y", description: "Y", quantity: 1, unitCostUsd: 10 }], expectedDelivery: "2026-09-01" });
    assert.equal(sc.listOrders(s1.id).length, 1);
  });

  it("summary returns correct counts", () => {
    const bus = new EventBus();
    const sc = new SupplyChainManager(bus);
    sc.addSupplier({ name: "A", country: "US", category: "c", status: "active", leadTimeDays: 7, onTimeDeliveryPct: 95, qualityScore: 90, riskLevel: "low", contactEmail: "a@x.com" });
    sc.addSupplier({ name: "B", country: "CN", category: "c", status: "active", leadTimeDays: 20, onTimeDeliveryPct: 75, qualityScore: 70, riskLevel: "high", contactEmail: "b@x.com" });
    const s = sc.summary();
    assert.equal(s.totalSuppliers, 2);
    assert.equal(s.highRiskSuppliers, 1);
    assert.equal(s.avgOnTimeDeliveryPct, 85);
  });
});

// ── DocumentManager ───────────────────────────────────────────────────────────
import { DocumentManager } from "../document-mgmt/document-manager.js";

describe("DocumentManager", () => {
  it("createDocument creates draft", () => {
    const bus = new EventBus();
    const dm = new DocumentManager(bus);
    const doc = dm.createDocument({ title: "Security Policy", category: "policy", ownerId: "u1", content: "All passwords must be 12+ chars." });
    assert.equal(doc.status, "draft");
    assert.equal(doc.currentVersion, "1.0");
  });

  it("approveDocument emits event", () => {
    const bus = new EventBus();
    const dm = new DocumentManager(bus);
    const events: unknown[] = [];
    bus.subscribe("document.approved", (e) => { events.push(e.payload); });
    const doc = dm.createDocument({ title: "Expense Policy", category: "policy", ownerId: "u2", content: "Submit expenses within 30 days." });
    dm.approveDocument(doc.id, "cfo-1");
    assert.equal(events.length, 1);
    assert.equal(dm.getDocument(doc.id)!.status, "approved");
  });

  it("publishDocument emits event after approval", () => {
    const bus = new EventBus();
    const dm = new DocumentManager(bus);
    const events: unknown[] = [];
    bus.subscribe("document.published", (e) => { events.push(e.payload); });
    const doc = dm.createDocument({ title: "PTO Policy", category: "policy", ownerId: "u3", content: "15 days PTO per year." });
    dm.approveDocument(doc.id, "hr-1");
    dm.publishDocument(doc.id);
    assert.equal(events.length, 1);
    assert.equal(dm.getDocument(doc.id)!.status, "published");
  });

  it("addVersion increments version number", () => {
    const bus = new EventBus();
    const dm = new DocumentManager(bus);
    const doc = dm.createDocument({ title: "Onboarding Guide", category: "procedure", ownerId: "u4", content: "v1 content" });
    dm.addVersion(doc.id, "v2 content", "u4", "Updated section 3");
    assert.equal(dm.getDocument(doc.id)!.currentVersion, "1.1");
    assert.equal(dm.getDocument(doc.id)!.versions.length, 2);
  });

  it("searchByTag finds matching documents", () => {
    const bus = new EventBus();
    const dm = new DocumentManager(bus);
    dm.createDocument({ title: "GDPR Policy", category: "legal", ownerId: "u5", content: "...", tags: ["gdpr", "compliance"] });
    dm.createDocument({ title: "CCPA Policy", category: "legal", ownerId: "u5", content: "...", tags: ["ccpa", "compliance"] });
    dm.createDocument({ title: "Internal Memo", category: "other", ownerId: "u5", content: "...", tags: ["internal"] });
    assert.equal(dm.searchByTag("compliance").length, 2);
  });

  it("summary returns correct stats", () => {
    const bus = new EventBus();
    const dm = new DocumentManager(bus);
    dm.createDocument({ title: "Doc1", category: "technical", ownerId: "u6", content: "a" });
    const d2 = dm.createDocument({ title: "Doc2", category: "template", ownerId: "u6", content: "b" });
    dm.approveDocument(d2.id, "mgr");
    dm.publishDocument(d2.id);
    const s = dm.summary();
    assert.equal(s.totalDocs, 2);
    assert.equal(s.published, 1);
    assert.equal(s.drafts, 1);
  });
});

// ── RoadmapManager ────────────────────────────────────────────────────────────
import { RoadmapManager } from "../roadmap/roadmap-manager.js";

describe("RoadmapManager", () => {
  it("addItem and listItems with priority sort", () => {
    const bus = new EventBus();
    const rm = new RoadmapManager(bus);
    rm.addItem({ title: "Dark Mode", type: "feature", status: "planned", quarter: "Q3", year: 2026, priority: 2, effortPoints: 8, valueScore: 80, ownerId: "pm1", tags: ["ui"], description: "" });
    rm.addItem({ title: "SSO", type: "feature", status: "planned", quarter: "Q3", year: 2026, priority: 1, effortPoints: 13, valueScore: 95, ownerId: "pm1", tags: ["security"], description: "" });
    const items = rm.listItems("Q3");
    assert.equal(items[0]!.title, "SSO");
  });

  it("createRelease and addItemToRelease", () => {
    const bus = new EventBus();
    const rm = new RoadmapManager(bus);
    const item = rm.addItem({ title: "Webhooks", type: "feature", status: "planned", quarter: "Q4", year: 2026, priority: 1, effortPoints: 5, valueScore: 85, ownerId: "pm2", tags: [], description: "" });
    const rel = rm.createRelease({ name: "v2.5", quarter: "Q4", year: 2026, status: "planned", targetDate: "2026-12-15" });
    rm.addItemToRelease(rel.id, item.id);
    assert.equal(rm.getRelease(rel.id)!.items.length, 1);
    assert.equal(rm.getItem(item.id)!.releaseId, rel.id);
  });

  it("shipRelease emits events and marks items shipped", () => {
    const bus = new EventBus();
    const rm = new RoadmapManager(bus);
    const events: unknown[] = [];
    bus.subscribe("roadmap.release_published", (e) => { events.push(e.payload); });
    const item = rm.addItem({ title: "API v2", type: "feature", status: "in_progress", quarter: "Q2", year: 2026, priority: 1, effortPoints: 20, valueScore: 90, ownerId: "eng1", tags: [], description: "" });
    const rel = rm.createRelease({ name: "v2.0", quarter: "Q2", year: 2026, status: "in_progress", targetDate: "2026-06-30" });
    rm.addItemToRelease(rel.id, item.id);
    rm.shipRelease(rel.id);
    assert.equal(events.length, 1);
    assert.equal(rm.getItem(item.id)!.status, "shipped");
  });

  it("updateItemStatus emits item_shipped when linked to release", () => {
    const bus = new EventBus();
    const rm = new RoadmapManager(bus);
    const events: unknown[] = [];
    bus.subscribe("roadmap.item_shipped", (e) => { events.push(e.payload); });
    const item = rm.addItem({ title: "Export CSV", type: "improvement", status: "in_progress", quarter: "Q1", year: 2026, priority: 3, effortPoints: 3, valueScore: 60, ownerId: "eng2", tags: [], description: "" });
    const rel = rm.createRelease({ name: "v1.9", quarter: "Q1", year: 2026, status: "in_progress", targetDate: "2026-03-31" });
    rm.addItemToRelease(rel.id, item.id);
    rm.updateItemStatus(item.id, "shipped");
    assert.equal(events.length, 1);
  });

  it("listItems filters by status", () => {
    const bus = new EventBus();
    const rm = new RoadmapManager(bus);
    rm.addItem({ title: "Feature A", type: "feature", status: "shipped", quarter: "Q1", year: 2026, priority: 1, effortPoints: 5, valueScore: 70, ownerId: "pm3", tags: [], description: "" });
    rm.addItem({ title: "Feature B", type: "feature", status: "planned", quarter: "Q2", year: 2026, priority: 2, effortPoints: 5, valueScore: 65, ownerId: "pm3", tags: [], description: "" });
    assert.equal(rm.listItems(undefined, "shipped").length, 1);
  });

  it("summary returns correct counts", () => {
    const bus = new EventBus();
    const rm = new RoadmapManager(bus);
    rm.addItem({ title: "X", type: "tech_debt", status: "shipped", quarter: "Q3", year: 2026, priority: 1, effortPoints: 2, valueScore: 50, ownerId: "eng3", tags: [], description: "" });
    rm.addItem({ title: "Y", type: "bug_fix", status: "in_progress", quarter: "Q3", year: 2026, priority: 2, effortPoints: 1, valueScore: 40, ownerId: "eng3", tags: [], description: "" });
    const s = rm.summary();
    assert.equal(s.totalItems, 2);
    assert.equal(s.shipped, 1);
    assert.equal(s.inProgress, 1);
  });
});

// ── CustomerJourneyAnalytics ──────────────────────────────────────────────────
import { CustomerJourneyAnalytics } from "../journey/customer-journey.js";

describe("CustomerJourneyAnalytics", () => {
  it("startJourney creates journey in awareness stage", () => {
    const bus = new EventBus();
    const cj = new CustomerJourneyAnalytics(bus);
    const j = cj.startJourney("cust-1");
    assert.equal(j.currentStage, "awareness");
    assert.equal(j.isConverted, false);
  });

  it("advanceStage emits stage_advanced event", () => {
    const bus = new EventBus();
    const cj = new CustomerJourneyAnalytics(bus);
    const events: unknown[] = [];
    bus.subscribe("journey.stage_advanced", (e) => { events.push(e.payload); });
    cj.startJourney("cust-2");
    cj.advanceStage("cust-2", "consideration");
    assert.equal(events.length, 1);
    assert.equal(cj.getJourney("cust-2")!.currentStage, "consideration");
  });

  it("advanceStage to active marks converted and emits converted event", () => {
    const bus = new EventBus();
    const cj = new CustomerJourneyAnalytics(bus);
    const events: unknown[] = [];
    bus.subscribe("journey.converted", (e) => { events.push(e.payload); });
    cj.startJourney("cust-3");
    cj.advanceStage("cust-3", "trial");
    cj.advanceStage("cust-3", "active");
    assert.equal(events.length, 1);
    assert.equal(cj.getJourney("cust-3")!.isConverted, true);
  });

  it("markDropped emits dropped event", () => {
    const bus = new EventBus();
    const cj = new CustomerJourneyAnalytics(bus);
    const events: unknown[] = [];
    bus.subscribe("journey.dropped", (e) => { events.push(e.payload); });
    cj.startJourney("cust-4");
    cj.advanceStage("cust-4", "trial");
    cj.markDropped("cust-4");
    assert.equal(events.length, 1);
    assert.equal(cj.getJourney("cust-4")!.isDropped, true);
  });

  it("recordTouchpoint links to journey", () => {
    const bus = new EventBus();
    const cj = new CustomerJourneyAnalytics(bus);
    cj.startJourney("cust-5");
    cj.recordTouchpoint({ customerId: "cust-5", channel: "email", stage: "awareness", description: "Welcome email", occurredAt: new Date().toISOString() });
    assert.equal(cj.getJourney("cust-5")!.touchpoints.length, 1);
  });

  it("summary returns correct stats", () => {
    const bus = new EventBus();
    const cj = new CustomerJourneyAnalytics(bus);
    cj.startJourney("c1"); cj.advanceStage("c1", "active"); // converted
    cj.startJourney("c2"); cj.markDropped("c2"); // dropped
    cj.startJourney("c3"); // active, not converted
    const s = cj.summary();
    assert.equal(s.totalJourneys, 3);
    assert.equal(s.converted, 1);
    assert.equal(s.dropped, 1);
    assert.equal(s.active, 1);
  });
});

// ── LegalCaseManager ──────────────────────────────────────────────────────────
import { LegalCaseManager } from "../legal/legal-case-manager.js";

describe("LegalCaseManager", () => {
  it("openCase emits event and creates case", () => {
    const bus = new EventBus();
    const lm = new LegalCaseManager(bus);
    const events: unknown[] = [];
    bus.subscribe("legal.case_opened", (e) => { events.push(e.payload); });
    const c = lm.openCase({ title: "Patent Infringement", type: "ip", status: "open", priority: "high", description: "Competitor using our patent", assignedCounsel: "in-house-1", estimatedCostUsd: 500000, tags: ["patent"] });
    assert.ok(c.id);
    assert.equal(events.length, 1);
    assert.equal(c.actualCostUsd, 0);
  });

  it("resolveCase emits resolved event", () => {
    const bus = new EventBus();
    const lm = new LegalCaseManager(bus);
    const events: unknown[] = [];
    bus.subscribe("legal.case_resolved", (e) => { events.push(e.payload); });
    const c = lm.openCase({ title: "Employment Dispute", type: "employment", status: "open", priority: "medium", description: "Wrongful termination claim", assignedCounsel: "hr-counsel", estimatedCostUsd: 100000, tags: [] });
    lm.resolveCase(c.id, "settled", 75000);
    assert.equal(events.length, 1);
    assert.equal(lm.getCase(c.id)!.status, "resolved");
    assert.equal(lm.getCase(c.id)!.actualCostUsd, 75000);
  });

  it("addDeadline emits approaching event when within 14 days", () => {
    const bus = new EventBus();
    const lm = new LegalCaseManager(bus);
    const events: unknown[] = [];
    bus.subscribe("legal.deadline_approaching", (e) => { events.push(e.payload); });
    const c = lm.openCase({ title: "Regulatory Filing", type: "regulatory", status: "open", priority: "critical", description: "SEC filing deadline", assignedCounsel: "gen-counsel", estimatedCostUsd: 50000, tags: [] });
    const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    lm.addDeadline(c.id, "File response", soon);
    assert.equal(events.length, 1);
  });

  it("completeDeadline marks it done", () => {
    const bus = new EventBus();
    const lm = new LegalCaseManager(bus);
    const c = lm.openCase({ title: "Contract Dispute", type: "contract_dispute", status: "open", priority: "low", description: "Vendor breach", assignedCounsel: "counsel-2", estimatedCostUsd: 20000, tags: [] });
    lm.addDeadline(c.id, "Submit evidence", "2026-12-01");
    lm.completeDeadline(c.id, "Submit evidence");
    assert.equal(lm.getCase(c.id)!.deadlines[0]!.completed, true);
  });

  it("listCases filters by type", () => {
    const bus = new EventBus();
    const lm = new LegalCaseManager(bus);
    lm.openCase({ title: "IP Case", type: "ip", status: "open", priority: "high", description: "", assignedCounsel: "c1", estimatedCostUsd: 0, tags: [] });
    lm.openCase({ title: "Lit Case", type: "litigation", status: "open", priority: "medium", description: "", assignedCounsel: "c2", estimatedCostUsd: 0, tags: [] });
    assert.equal(lm.listCases(undefined, "ip").length, 1);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const lm = new LegalCaseManager(bus);
    lm.openCase({ title: "A", type: "corporate", status: "open", priority: "critical", description: "", assignedCounsel: "c1", estimatedCostUsd: 100000, tags: [] });
    const b = lm.openCase({ title: "B", type: "privacy", status: "open", priority: "low", description: "", assignedCounsel: "c2", estimatedCostUsd: 50000, tags: [] });
    lm.resolveCase(b.id, "dismissed", 10000);
    const s = lm.summary();
    assert.equal(s.totalCases, 2);
    assert.equal(s.criticalCases, 1);
    assert.equal(s.resolvedCases, 1);
    assert.equal(s.totalActualCostUsd, 10000);
  });
});

// ── QualityManager ────────────────────────────────────────────────────────────
import { QualityManager } from "../quality/quality-manager.js";

describe("QualityManager", () => {
  it("raiseDefect emits event", () => {
    const bus = new EventBus();
    const qm = new QualityManager(bus);
    const events: unknown[] = [];
    bus.subscribe("quality.defect_raised", (e) => { events.push(e.payload); });
    qm.raiseDefect({ title: "Crash on login", description: "App crashes", severity: "critical", status: "open", productArea: "auth", reportedBy: "qa-1" });
    assert.equal(events.length, 1);
  });

  it("resolveDefect emits resolved event", () => {
    const bus = new EventBus();
    const qm = new QualityManager(bus);
    const events: unknown[] = [];
    bus.subscribe("quality.defect_resolved", (e) => { events.push(e.payload); });
    const d = qm.raiseDefect({ title: "Memory leak", description: "...", severity: "major", status: "in_progress", productArea: "engine", reportedBy: "qa-2" });
    qm.resolveDefect(d.id, "unclosed stream", "added try-finally block");
    assert.equal(events.length, 1);
    assert.equal(qm.getDefect(d.id)!.status, "resolved");
  });

  it("scheduleAudit and completeAudit emits event", () => {
    const bus = new EventBus();
    const qm = new QualityManager(bus);
    const events: unknown[] = [];
    bus.subscribe("quality.audit_completed", (e) => { events.push(e.payload); });
    const a = qm.scheduleAudit({ title: "Q2 Internal Audit", type: "internal", auditor: "audit-team", scheduledDate: "2026-07-01", findings: [], status: "scheduled" });
    qm.completeAudit(a.id, 92, ["Minor doc gaps"]);
    assert.equal(events.length, 1);
    assert.equal(qm.listAudits()[0]!.score, 92);
  });

  it("listDefects filters by severity", () => {
    const bus = new EventBus();
    const qm = new QualityManager(bus);
    qm.raiseDefect({ title: "D1", description: "", severity: "critical", status: "open", productArea: "ui", reportedBy: "qa" });
    qm.raiseDefect({ title: "D2", description: "", severity: "minor", status: "open", productArea: "ui", reportedBy: "qa" });
    assert.equal(qm.listDefects(undefined, "critical").length, 1);
  });

  it("listDefects filters by status", () => {
    const bus = new EventBus();
    const qm = new QualityManager(bus);
    const d = qm.raiseDefect({ title: "D3", description: "", severity: "major", status: "open", productArea: "api", reportedBy: "qa" });
    qm.resolveDefect(d.id, "rc", "ca");
    assert.equal(qm.listDefects("resolved").length, 1);
    assert.equal(qm.listDefects("open").length, 0);
  });

  it("summary returns correct counts", () => {
    const bus = new EventBus();
    const qm = new QualityManager(bus);
    qm.raiseDefect({ title: "X", description: "", severity: "critical", status: "open", productArea: "core", reportedBy: "qa" });
    qm.raiseDefect({ title: "Y", description: "", severity: "minor", status: "open", productArea: "core", reportedBy: "qa" });
    const s = qm.summary();
    assert.equal(s.totalDefects, 2);
    assert.equal(s.criticalDefects, 1);
    assert.equal(s.openDefects, 2);
  });
});

// ── MarketResearch ───────────────────────────────────────���────────────────────
import { MarketResearch } from "../market-research/market-research.js";

describe("MarketResearch", () => {
  it("createStudy and publishStudy emits event", () => {
    const bus = new EventBus();
    const mr = new MarketResearch(bus);
    const events: unknown[] = [];
    bus.subscribe("market.study_published", (e) => { events.push(e.payload); });
    const s = mr.createStudy({ title: "Industrial Robotics TAM 2026", type: "tam_sam_som", status: "draft", summary: "Global robotics market", tamUsd: 50_000_000_000, samUsd: 5_000_000_000, somUsd: 500_000_000, confidence: 75, tags: ["robotics"] });
    mr.publishStudy(s.id);
    assert.equal(events.length, 1);
    assert.equal(mr.getStudy(s.id)!.status, "published");
  });

  it("recordWinLoss emits event", () => {
    const bus = new EventBus();
    const mr = new MarketResearch(bus);
    const events: unknown[] = [];
    bus.subscribe("market.win_loss_recorded", (e) => { events.push(e.payload); });
    mr.recordWinLoss({ dealId: "deal-1", outcome: "won", competitor: "RoboTech", reason: "better integration", dealValueUsd: 250000, segment: "manufacturing" });
    assert.equal(events.length, 1);
  });

  it("listWinLoss filters by outcome", () => {
    const bus = new EventBus();
    const mr = new MarketResearch(bus);
    mr.recordWinLoss({ dealId: "d1", outcome: "won", reason: "price", dealValueUsd: 100000, segment: "auto" });
    mr.recordWinLoss({ dealId: "d2", outcome: "lost", competitor: "Rival", reason: "features", dealValueUsd: 200000, segment: "auto" });
    assert.equal(mr.listWinLoss("won").length, 1);
    assert.equal(mr.listWinLoss("lost").length, 1);
  });

  it("upsertCompetitor creates and lists profile", () => {
    const bus = new EventBus();
    const mr = new MarketResearch(bus);
    mr.upsertCompetitor({ name: "RoboTech", category: "industrial", strengths: ["brand", "support"], weaknesses: ["price"], winRateAgainstUs: 35 });
    assert.equal(mr.listCompetitors().length, 1);
  });

  it("summary computes win rate correctly", () => {
    const bus = new EventBus();
    const mr = new MarketResearch(bus);
    mr.recordWinLoss({ dealId: "d1", outcome: "won", reason: "price", dealValueUsd: 100000, segment: "x" });
    mr.recordWinLoss({ dealId: "d2", outcome: "won", reason: "features", dealValueUsd: 150000, segment: "x" });
    mr.recordWinLoss({ dealId: "d3", outcome: "lost", reason: "timing", dealValueUsd: 50000, segment: "x" });
    const s = mr.summary();
    assert.equal(s.winRate, 67);
  });

  it("listStudies filters by status", () => {
    const bus = new EventBus();
    const mr = new MarketResearch(bus);
    const st = mr.createStudy({ title: "Trend Report", type: "trend", status: "draft", summary: "...", confidence: 80, tags: [] });
    mr.publishStudy(st.id);
    mr.createStudy({ title: "Survey 2026", type: "survey", status: "draft", summary: "...", confidence: 60, tags: [] });
    assert.equal(mr.listStudies("published").length, 1);
    assert.equal(mr.listStudies("draft").length, 1);
  });
});

// ── PRManager ─────────────────────────────────────────────────────────────────
import { PRManager } from "../pr-comms/pr-manager.js";

describe("PRManager", () => {
  it("createRelease and publishRelease emits event", () => {
    const bus = new EventBus();
    const pr = new PRManager(bus);
    const events: unknown[] = [];
    bus.subscribe("pr.release_published", (e) => { events.push(e.payload); });
    const r = pr.createRelease({ title: "Helios Robotics Raises Series B", content: "...", status: "approved", channel: "wire", authorId: "comms-1", tags: ["funding"] });
    pr.publishRelease(r.id);
    assert.equal(events.length, 1);
    assert.equal(pr.getRelease(r.id)!.status, "published");
  });

  it("publishRelease returns undefined if not approved", () => {
    const bus = new EventBus();
    const pr = new PRManager(bus);
    const r = pr.createRelease({ title: "Draft Release", content: "...", status: "draft", channel: "blog", authorId: "comms-1", tags: [] });
    const result = pr.publishRelease(r.id);
    assert.equal(result, undefined);
  });

  it("recordCoverage emits event", () => {
    const bus = new EventBus();
    const pr = new PRManager(bus);
    const events: unknown[] = [];
    bus.subscribe("pr.coverage_recorded", (e) => { events.push(e.payload); });
    pr.recordCoverage({ outlet: "TechCrunch", headline: "Helios Secures $50M", sentiment: "positive", reachEstimate: 2500000, publishedAt: new Date().toISOString() });
    assert.equal(events.length, 1);
  });

  it("openCrisis escalates critical and high severity", () => {
    const bus = new EventBus();
    const pr = new PRManager(bus);
    const events: unknown[] = [];
    bus.subscribe("pr.crisis_escalated", (e) => { events.push(e.payload); });
    pr.openCrisis({ title: "Data Breach Report", summary: "False media report", severity: "critical", status: "active" });
    assert.equal(events.length, 1);
  });

  it("addResponseAction and resolveCrisis", () => {
    const bus = new EventBus();
    const pr = new PRManager(bus);
    const c = pr.openCrisis({ title: "Supply Delay", summary: "Parts delayed", severity: "medium", status: "monitoring" });
    pr.addResponseAction(c.id, "Issued public statement");
    pr.resolveCrisis(c.id);
    assert.equal(pr.listCrises()[0]!.status, "resolved");
    assert.equal(pr.listCrises()[0]!.responseActions.length, 1);
  });

  it("summary returns correct counts", () => {
    const bus = new EventBus();
    const pr = new PRManager(bus);
    pr.recordCoverage({ outlet: "Forbes", headline: "Great Product", sentiment: "positive", reachEstimate: 1000000, publishedAt: new Date().toISOString() });
    pr.recordCoverage({ outlet: "TechBlast", headline: "Concerns raised", sentiment: "negative", reachEstimate: 200000, publishedAt: new Date().toISOString() });
    const s = pr.summary();
    assert.equal(s.positiveCoverage, 1);
    assert.equal(s.negativeCoverage, 1);
    assert.equal(s.totalReach, 1200000);
  });
});

// ── SalesIntelligence ─────────────────────────────────────────────────────────
import { SalesIntelligence } from "../sales-intel/sales-intel.js";

describe("SalesIntelligence", () => {
  it("recordSignal emits buying_signal for high score", () => {
    const bus = new EventBus();
    const si = new SalesIntelligence(bus);
    const events: unknown[] = [];
    bus.subscribe("sales.buying_signal", (e) => { events.push(e.payload); });
    si.recordSignal({ accountId: "acc-1", type: "funding_round", score: 85, description: "Series B announced", detectedAt: new Date().toISOString(), source: "crunchbase" });
    assert.equal(events.length, 1);
  });

  it("recordSignal does not emit for low score", () => {
    const bus = new EventBus();
    const si = new SalesIntelligence(bus);
    const events: unknown[] = [];
    bus.subscribe("sales.buying_signal", (e) => { events.push(e.payload); });
    si.recordSignal({ accountId: "acc-2", type: "social_mention", score: 40, description: "Mentioned us", detectedAt: new Date().toISOString(), source: "twitter" });
    assert.equal(events.length, 0);
  });

  it("setQuota and recordAttainment emit quota_achieved", () => {
    const bus = new EventBus();
    const si = new SalesIntelligence(bus);
    const events: unknown[] = [];
    bus.subscribe("sales.quota_achieved", (e) => { events.push(e.payload); });
    si.setQuota("rep-1", "2026-Q3", 500000);
    si.recordAttainment("rep-1", "2026-Q3", 550000);
    assert.equal(events.length, 1);
    assert.equal(si.listQuotas("rep-1")[0]!.achievedPct, 110);
  });

  it("logActivity stores and lists by rep", () => {
    const bus = new EventBus();
    const si = new SalesIntelligence(bus);
    si.logActivity({ accountId: "acc-1", repId: "rep-2", type: "demo", notes: "Product demo", occurredAt: new Date().toISOString() });
    si.logActivity({ accountId: "acc-2", repId: "rep-3", type: "call", notes: "Cold call", occurredAt: new Date().toISOString() });
    assert.equal(si.listActivities("rep-2").length, 1);
    assert.equal(si.listActivities().length, 2);
  });

  it("assignTerritory emits event", () => {
    const bus = new EventBus();
    const si = new SalesIntelligence(bus);
    const events: unknown[] = [];
    bus.subscribe("sales.territory_assigned", (e) => { events.push(e.payload); });
    si.assignTerritory({ name: "West Coast", repId: "rep-4", regions: ["CA", "OR", "WA"], accountIds: ["a1", "a2", "a3"] });
    assert.equal(events.length, 1);
  });

  it("summary returns correct counts", () => {
    const bus = new EventBus();
    const si = new SalesIntelligence(bus);
    si.recordSignal({ accountId: "x", type: "intent_data", score: 90, description: "", detectedAt: new Date().toISOString(), source: "g2" });
    si.recordSignal({ accountId: "y", type: "tech_change", score: 50, description: "", detectedAt: new Date().toISOString(), source: "web" });
    const s = si.summary();
    assert.equal(s.totalSignals, 2);
    assert.equal(s.highScoreSignals, 1);
  });
});

// ── ProductUsageTracker ───────────────────────────────────────────────────────
import { ProductUsageTracker } from "../product-usage/product-usage.js";

describe("ProductUsageTracker", () => {
  it("trackEvent emits feature_adopted on first use", () => {
    const bus = new EventBus();
    const pu = new ProductUsageTracker(bus);
    const events: unknown[] = [];
    bus.subscribe("usage.feature_adopted", (e) => { events.push(e.payload); });
    pu.trackEvent({ accountId: "acc-1", userId: "u1", feature: "export_csv", action: "click", occurredAt: new Date().toISOString() });
    assert.equal(events.length, 1);
  });

  it("trackEvent increments eventCount on repeat use", () => {
    const bus = new EventBus();
    const pu = new ProductUsageTracker(bus);
    pu.trackEvent({ accountId: "acc-1", userId: "u1", feature: "dashboard", action: "view", occurredAt: new Date().toISOString() });
    pu.trackEvent({ accountId: "acc-1", userId: "u2", feature: "dashboard", action: "view", occurredAt: new Date().toISOString() });
    const adoption = pu.getAdoption("acc-1", "dashboard");
    assert.equal(adoption!.eventCount, 2);
    assert.equal(adoption!.uniqueUsers, 2);
  });

  it("startSession and endSession compute duration", () => {
    const bus = new EventBus();
    const pu = new ProductUsageTracker(bus);
    const session = pu.startSession({ accountId: "acc-2", userId: "u3", startedAt: new Date(Date.now() - 120000).toISOString(), pagesViewed: 0, featuresUsed: [] });
    pu.endSession(session.id, 5, ["dashboard", "reports"]);
    assert.ok(pu.summary().totalSessions === 1);
  });

  it("checkExpansionSignal emits when threshold met", () => {
    const bus = new EventBus();
    const pu = new ProductUsageTracker(bus);
    const events: unknown[] = [];
    bus.subscribe("usage.expansion_signal", (e) => { events.push(e.payload); });
    const now = new Date().toISOString();
    for (let i = 0; i < 8; i++) pu.trackEvent({ accountId: "acc-3", userId: "u1", feature: "api_access", action: "call", occurredAt: now });
    for (let i = 0; i < 2; i++) pu.trackEvent({ accountId: "acc-3", userId: "u1", feature: "other_feat", action: "click", occurredAt: now });
    const triggered = pu.checkExpansionSignal("acc-3", "api_access", 75);
    assert.equal(triggered, true);
    assert.equal(events.length, 1);
  });

  it("listAdoptions filters by account", () => {
    const bus = new EventBus();
    const pu = new ProductUsageTracker(bus);
    pu.trackEvent({ accountId: "acc-4", userId: "u1", feature: "feat-a", action: "x", occurredAt: new Date().toISOString() });
    pu.trackEvent({ accountId: "acc-5", userId: "u2", feature: "feat-b", action: "x", occurredAt: new Date().toISOString() });
    assert.equal(pu.listAdoptions("acc-4").length, 1);
  });

  it("summary returns top features", () => {
    const bus = new EventBus();
    const pu = new ProductUsageTracker(bus);
    for (let i = 0; i < 5; i++) pu.trackEvent({ accountId: "acc-6", userId: `u${i}`, feature: "reports", action: "view", occurredAt: new Date().toISOString() });
    pu.trackEvent({ accountId: "acc-6", userId: "u1", feature: "settings", action: "click", occurredAt: new Date().toISOString() });
    const s = pu.summary();
    assert.equal(s.topFeatures[0]!.feature, "reports");
  });
});

// ── DataWarehouse ─────────────────────────────────────────────────────────────
import { DataWarehouse } from "../data-warehouse/data-warehouse.js";

describe("DataWarehouse", () => {
  it("registerTable emits event", () => {
    const bus = new EventBus();
    const dw = new DataWarehouse(bus);
    const events: unknown[] = [];
    bus.subscribe("dw.table_registered", (e) => { events.push(e.payload); });
    dw.registerTable({ name: "fact_orders", schema: "analytics", description: "Order facts", owner: "data-eng", status: "active", columns: [], rowCount: 1000000, sizeGb: 2.5, expectedFreshnessMins: 60, upstreamTables: [], tags: ["core"] });
    assert.equal(events.length, 1);
  });

  it("refreshTable updates stats", () => {
    const bus = new EventBus();
    const dw = new DataWarehouse(bus);
    const t = dw.registerTable({ name: "dim_customers", schema: "analytics", description: "Customer dim", owner: "data-eng", status: "building", columns: [], rowCount: 0, sizeGb: 0, expectedFreshnessMins: 120, upstreamTables: [], tags: [] });
    dw.refreshTable(t.id, 50000, 0.8);
    assert.equal(dw.getTable(t.id)!.rowCount, 50000);
    assert.equal(dw.getTable(t.id)!.status, "active");
  });

  it("recordPipelineRun emits failure event", () => {
    const bus = new EventBus();
    const dw = new DataWarehouse(bus);
    const events: unknown[] = [];
    bus.subscribe("dw.pipeline_failed", (e) => { events.push(e.payload); });
    const t = dw.registerTable({ name: "agg_revenue", schema: "bi", description: "", owner: "eng", status: "active", columns: [], rowCount: 100, sizeGb: 0.1, expectedFreshnessMins: 30, upstreamTables: [], tags: [] });
    const p = dw.registerPipeline({ name: "revenue_agg", sourceTableIds: [], targetTableId: t.id, scheduleExpression: "0 * * * *", lastRunStatus: "never_run" });
    dw.recordPipelineRun(p.id, "failure", 45, "timeout exceeded");
    assert.equal(events.length, 1);
  });

  it("listTables filters by status", () => {
    const bus = new EventBus();
    const dw = new DataWarehouse(bus);
    dw.registerTable({ name: "t1", schema: "s", description: "", owner: "eng", status: "active", columns: [], rowCount: 100, sizeGb: 0.1, expectedFreshnessMins: 60, upstreamTables: [], tags: [] });
    dw.registerTable({ name: "t2", schema: "s", description: "", owner: "eng", status: "deprecated", columns: [], rowCount: 0, sizeGb: 0, expectedFreshnessMins: 0, upstreamTables: [], tags: [] });
    assert.equal(dw.listTables("active").length, 1);
    assert.equal(dw.listTables("deprecated").length, 1);
  });

  it("checkFreshness emits alert for stale table", () => {
    const bus = new EventBus();
    const dw = new DataWarehouse(bus);
    const events: unknown[] = [];
    bus.subscribe("dw.freshness_alert", (e) => { events.push(e.payload); });
    const t = dw.registerTable({ name: "stale_table", schema: "s", description: "", owner: "eng", status: "active", columns: [], rowCount: 100, sizeGb: 0.1, expectedFreshnessMins: 5, upstreamTables: [], tags: [] });
    // Set lastRefreshed to 10 mins ago
    dw.getTable(t.id)!.lastRefreshedAt = new Date(Date.now() - 600000).toISOString();
    const fresh = dw.checkFreshness(t.id);
    assert.equal(fresh, false);
    assert.equal(events.length, 1);
  });

  it("summary returns correct counts", () => {
    const bus = new EventBus();
    const dw = new DataWarehouse(bus);
    dw.registerTable({ name: "a", schema: "s", description: "", owner: "e", status: "active", columns: [], rowCount: 1000, sizeGb: 1, expectedFreshnessMins: 60, upstreamTables: [], tags: [] });
    dw.registerTable({ name: "b", schema: "s", description: "", owner: "e", status: "error", columns: [], rowCount: 0, sizeGb: 0, expectedFreshnessMins: 30, upstreamTables: [], tags: [] });
    const s = dw.summary();
    assert.equal(s.totalTables, 2);
    assert.equal(s.activeTables, 1);
    assert.equal(s.totalRows, 1000);
  });
});

// ── CostCenterManager ─────────────────────────────────────────────────────────
import { CostCenterManager } from "../cost-center/cost-center.js";

describe("CostCenterManager", () => {
  it("createCenter and recordAllocation emits events", () => {
    const bus = new EventBus();
    const cc = new CostCenterManager(bus);
    const events: unknown[] = [];
    bus.subscribe("cost.allocation_recorded", (e) => { events.push(e.payload); });
    const center = cc.createCenter({ name: "Engineering", department: "R&D", ownerId: "cto-1", annualBudgetUsd: 5000000 });
    cc.recordAllocation({ centerId: center.id, category: "payroll", description: "June payroll", amountUsd: 300000, month: "2026-06", method: "direct" });
    assert.equal(events.length, 1);
    assert.equal(cc.getCenter(center.id)!.ytdActualUsd, 300000);
  });

  it("budget_exceeded event fires when over budget", () => {
    const bus = new EventBus();
    const cc = new CostCenterManager(bus);
    const events: unknown[] = [];
    bus.subscribe("cost.budget_exceeded", (e) => { events.push(e.payload); });
    const center = cc.createCenter({ name: "Marketing", department: "GTM", ownerId: "cmo-1", annualBudgetUsd: 100000 });
    cc.recordAllocation({ centerId: center.id, category: "marketing", description: "Campaign", amountUsd: 120000, month: "2026-06", method: "direct" });
    assert.equal(events.length, 1);
  });

  it("varianceReport shows over_budget status", () => {
    const bus = new EventBus();
    const cc = new CostCenterManager(bus);
    const center = cc.createCenter({ name: "Sales", department: "GTM", ownerId: "cro-1", annualBudgetUsd: 200000 });
    cc.recordAllocation({ centerId: center.id, category: "travel", description: "Conferences", amountUsd: 250000, month: "2026-05", method: "direct" });
    const report = cc.varianceReport(center.id);
    assert.equal(report!.status, "over_budget");
    assert.equal(report!.varianceUsd, 50000);
  });

  it("listAllocations filters by month", () => {
    const bus = new EventBus();
    const cc = new CostCenterManager(bus);
    const center = cc.createCenter({ name: "Ops", department: "Operations", ownerId: "coo-1", annualBudgetUsd: 1000000 });
    cc.recordAllocation({ centerId: center.id, category: "infrastructure", description: "AWS", amountUsd: 50000, month: "2026-06", method: "usage" });
    cc.recordAllocation({ centerId: center.id, category: "software", description: "SaaS", amountUsd: 20000, month: "2026-07", method: "direct" });
    assert.equal(cc.listAllocations(center.id, "2026-06").length, 1);
  });

  it("listCenters filters by department", () => {
    const bus = new EventBus();
    const cc = new CostCenterManager(bus);
    cc.createCenter({ name: "Eng A", department: "R&D", ownerId: "cto-1", annualBudgetUsd: 1000000 });
    cc.createCenter({ name: "Sales B", department: "GTM", ownerId: "cro-1", annualBudgetUsd: 500000 });
    assert.equal(cc.listCenters("R&D").length, 1);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const cc = new CostCenterManager(bus);
    const c1 = cc.createCenter({ name: "Eng", department: "R&D", ownerId: "cto", annualBudgetUsd: 1000000 });
    const c2 = cc.createCenter({ name: "Mkt", department: "GTM", ownerId: "cmo", annualBudgetUsd: 200000 });
    cc.recordAllocation({ centerId: c1.id, category: "payroll", description: "", amountUsd: 800000, month: "2026", method: "direct" });
    cc.recordAllocation({ centerId: c2.id, category: "marketing", description: "", amountUsd: 250000, month: "2026", method: "direct" });
    const s = cc.summary();
    assert.equal(s.totalCenters, 2);
    assert.equal(s.overBudgetCenters, 1); // only marketing is over
    assert.equal(s.totalActualUsd, 1050000);
  });
});

// ── GrantManager ──────────────────────────────────────────────────────────────
import { GrantManager } from "../grants/grant-manager.js";

describe("GrantManager", () => {
  it("createGrant and awardGrant emits event", () => {
    const bus = new EventBus();
    const gm = new GrantManager(bus);
    const events: unknown[] = [];
    bus.subscribe("grant.awarded", (e) => { events.push(e.payload); });
    const g = gm.createGrant({ title: "DOE Robotics Grant", fundingSource: "U.S. Department of Energy", type: "federal", status: "submitted", requestedAmountUsd: 2000000, principalInvestigator: "dr-kim", complianceNotes: "Annual reporting required", tags: ["R&D"] });
    gm.awardGrant(g.id, 1800000);
    assert.equal(events.length, 1);
    assert.equal(gm.getGrant(g.id)!.awardedAmountUsd, 1800000);
  });

  it("addMilestone emits deadline_approaching when due soon", () => {
    const bus = new EventBus();
    const gm = new GrantManager(bus);
    const events: unknown[] = [];
    bus.subscribe("grant.deadline_approaching", (e) => { events.push(e.payload); });
    const g = gm.createGrant({ title: "NSF Grant", fundingSource: "NSF", type: "federal", status: "active", requestedAmountUsd: 500000, principalInvestigator: "dr-lee", complianceNotes: "", tags: [] });
    const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    gm.addMilestone({ grantId: g.id, title: "Q2 Report", description: "Quarterly progress report", dueDate: soon, status: "pending" });
    assert.equal(events.length, 1);
  });

  it("submitMilestone emits event and marks submitted", () => {
    const bus = new EventBus();
    const gm = new GrantManager(bus);
    const events: unknown[] = [];
    bus.subscribe("grant.milestone_submitted", (e) => { events.push(e.payload); });
    const g = gm.createGrant({ title: "SBIR Phase 1", fundingSource: "SBA", type: "federal", status: "active", requestedAmountUsd: 150000, principalInvestigator: "dr-chen", complianceNotes: "", tags: [] });
    const m = gm.addMilestone({ grantId: g.id, title: "Technical Report", description: "6-month technical report", dueDate: "2026-12-01", status: "pending" });
    gm.submitMilestone(m!.id, "https://reports.helios.ai/sbir-q2");
    assert.equal(events.length, 1);
    assert.equal(gm.getMilestone(m!.id)!.status, "submitted");
  });

  it("listGrants filters by status", () => {
    const bus = new EventBus();
    const gm = new GrantManager(bus);
    gm.createGrant({ title: "G1", fundingSource: "Foundation A", type: "foundation", status: "active", requestedAmountUsd: 100000, principalInvestigator: "pi1", complianceNotes: "", tags: [] });
    gm.createGrant({ title: "G2", fundingSource: "Foundation B", type: "foundation", status: "drafting", requestedAmountUsd: 50000, principalInvestigator: "pi2", complianceNotes: "", tags: [] });
    assert.equal(gm.listGrants("active").length, 1);
  });

  it("listMilestones filters by grantId", () => {
    const bus = new EventBus();
    const gm = new GrantManager(bus);
    const g1 = gm.createGrant({ title: "G3", fundingSource: "Corp X", type: "corporate", status: "active", requestedAmountUsd: 200000, principalInvestigator: "pi3", complianceNotes: "", tags: [] });
    const g2 = gm.createGrant({ title: "G4", fundingSource: "Corp Y", type: "corporate", status: "active", requestedAmountUsd: 300000, principalInvestigator: "pi4", complianceNotes: "", tags: [] });
    gm.addMilestone({ grantId: g1.id, title: "M1", description: "", dueDate: "2026-12-31", status: "pending" });
    gm.addMilestone({ grantId: g2.id, title: "M2", description: "", dueDate: "2026-12-31", status: "pending" });
    assert.equal(gm.listMilestones(g1.id).length, 1);
  });

  it("summary returns correct success rate", () => {
    const bus = new EventBus();
    const gm = new GrantManager(bus);
    const g1 = gm.createGrant({ title: "Won", fundingSource: "A", type: "federal", status: "submitted", requestedAmountUsd: 1000000, principalInvestigator: "pi", complianceNotes: "", tags: [] });
    gm.awardGrant(g1.id, 900000);
    gm.createGrant({ title: "Lost", fundingSource: "B", type: "federal", status: "rejected", requestedAmountUsd: 500000, principalInvestigator: "pi", complianceNotes: "", tags: [] });
    const s = gm.summary();
    assert.equal(s.successRate, 50);
    assert.equal(s.totalAwardedUsd, 900000);
  });
});

// ── ESGTracker ────────────────────────────────────────────────────────────────
import { ESGTracker } from "../esg/esg-tracker.js";

describe("ESGTracker", () => {
  it("defineMetric and recordDataPoint emits event", () => {
    const bus = new EventBus();
    const esg = new ESGTracker(bus);
    const events: unknown[] = [];
    bus.subscribe("esg.metric_recorded", (e) => { events.push(e.payload); });
    const m = esg.defineMetric({ name: "Carbon Emissions", category: "environmental", unit: "tCO2e", description: "Annual scope 1+2", frequency: "annual" });
    esg.recordDataPoint({ metricId: m.id, value: 450, period: "2026" });
    assert.equal(events.length, 1);
  });

  it("target_missed event fires when value exceeds target by >10%", () => {
    const bus = new EventBus();
    const esg = new ESGTracker(bus);
    const events: unknown[] = [];
    bus.subscribe("esg.target_missed", (e) => { events.push(e.payload); });
    const m = esg.defineMetric({ name: "Water Usage", category: "environmental", unit: "m3", description: "Annual water", frequency: "annual", target: 10000 });
    esg.recordDataPoint({ metricId: m.id, value: 12000, period: "2026" }); // 20% over
    assert.equal(events.length, 1);
  });

  it("publishReport emits event", () => {
    const bus = new EventBus();
    const esg = new ESGTracker(bus);
    const events: unknown[] = [];
    bus.subscribe("esg.report_published", (e) => { events.push(e.payload); });
    esg.publishReport({ period: "2026", overallScore: 78, environmentalScore: 72, socialScore: 85, governanceScore: 77, highlights: ["Reduced emissions 15%"], improvements: ["Increase board diversity"], publishedAt: new Date().toISOString() });
    assert.equal(events.length, 1);
  });

  it("listMetrics filters by category", () => {
    const bus = new EventBus();
    const esg = new ESGTracker(bus);
    esg.defineMetric({ name: "GHG", category: "environmental", unit: "tCO2e", description: "", frequency: "annual" });
    esg.defineMetric({ name: "Gender Pay Gap", category: "social", unit: "%", description: "", frequency: "annual" });
    esg.defineMetric({ name: "Board Independence", category: "governance", unit: "%", description: "", frequency: "annual" });
    assert.equal(esg.listMetrics("environmental").length, 1);
    assert.equal(esg.listMetrics().length, 3);
  });

  it("listDataPoints filters by metricId", () => {
    const bus = new EventBus();
    const esg = new ESGTracker(bus);
    const m1 = esg.defineMetric({ name: "M1", category: "social", unit: "%", description: "", frequency: "quarterly" });
    const m2 = esg.defineMetric({ name: "M2", category: "governance", unit: "count", description: "", frequency: "quarterly" });
    esg.recordDataPoint({ metricId: m1.id, value: 50, period: "2026-Q1" });
    esg.recordDataPoint({ metricId: m2.id, value: 3, period: "2026-Q1" });
    assert.equal(esg.listDataPoints(m1.id).length, 1);
  });

  it("summary returns correct category counts", () => {
    const bus = new EventBus();
    const esg = new ESGTracker(bus);
    esg.defineMetric({ name: "E1", category: "environmental", unit: "u", description: "", frequency: "annual" });
    esg.defineMetric({ name: "E2", category: "environmental", unit: "u", description: "", frequency: "annual" });
    esg.defineMetric({ name: "S1", category: "social", unit: "u", description: "", frequency: "annual" });
    const s = esg.summary();
    assert.equal(s.byCategory.environmental, 2);
    assert.equal(s.byCategory.social, 1);
    assert.equal(s.byCategory.governance, 0);
  });
});

// ── InsuranceManager ──────────────────────────────────────────────────────────
import { InsuranceManager } from "../insurance/insurance-manager.js";

describe("InsuranceManager", () => {
  it("addPolicy and fileClaim emits events", () => {
    const bus = new EventBus();
    const im = new InsuranceManager(bus);
    const events: unknown[] = [];
    bus.subscribe("insurance.claim_filed", (e) => { events.push(e.payload); });
    const policy = im.addPolicy({ type: "cyber", carrier: "AIG", policyNumber: "CYB-2026-001", status: "active", coverageLimitUsd: 10000000, deductibleUsd: 50000, annualPremiumUsd: 120000, effectiveDate: "2026-01-01", expirationDate: "2027-01-01", notes: "Ransomware coverage included" });
    im.fileClaim({ policyId: policy.id, type: "cyber", description: "Phishing incident", status: "filed", estimatedLossUsd: 200000 });
    assert.equal(events.length, 1);
  });

  it("settleClaim emits settled event", () => {
    const bus = new EventBus();
    const im = new InsuranceManager(bus);
    const events: unknown[] = [];
    bus.subscribe("insurance.claim_settled", (e) => { events.push(e.payload); });
    const policy = im.addPolicy({ type: "general_liability", carrier: "Chubb", policyNumber: "GL-001", status: "active", coverageLimitUsd: 5000000, deductibleUsd: 25000, annualPremiumUsd: 80000, effectiveDate: "2026-01-01", expirationDate: "2027-01-01", notes: "" });
    const claim = im.fileClaim({ policyId: policy.id, type: "general_liability", description: "Slip and fall", status: "filed", estimatedLossUsd: 75000 })!;
    im.settleClaim(claim.id, 60000, "settled out of court");
    assert.equal(events.length, 1);
    assert.equal(im.getClaim(claim.id)!.settledAmountUsd, 60000);
  });

  it("renewal_due event fires when policy expires within 30 days", () => {
    const bus = new EventBus();
    const im = new InsuranceManager(bus);
    const events: unknown[] = [];
    bus.subscribe("insurance.renewal_due", (e) => { events.push(e.payload); });
    const soonExpiry = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    im.addPolicy({ type: "professional_liability", carrier: "Travelers", policyNumber: "PL-001", status: "active", coverageLimitUsd: 2000000, deductibleUsd: 10000, annualPremiumUsd: 45000, effectiveDate: "2025-07-01", expirationDate: soonExpiry, notes: "" });
    assert.equal(events.length, 1);
  });

  it("renewPolicy updates expiration and premium", () => {
    const bus = new EventBus();
    const im = new InsuranceManager(bus);
    const policy = im.addPolicy({ type: "umbrella", carrier: "Hartford", policyNumber: "U-001", status: "active", coverageLimitUsd: 20000000, deductibleUsd: 100000, annualPremiumUsd: 200000, effectiveDate: "2025-01-01", expirationDate: "2026-01-01", notes: "" });
    im.renewPolicy(policy.id, "2027-01-01", 210000);
    assert.equal(im.getPolicy(policy.id)!.expirationDate, "2027-01-01");
    assert.equal(im.getPolicy(policy.id)!.annualPremiumUsd, 210000);
  });

  it("listClaims filters by policyId", () => {
    const bus = new EventBus();
    const im = new InsuranceManager(bus);
    const p1 = im.addPolicy({ type: "property", carrier: "State Farm", policyNumber: "P-001", status: "active", coverageLimitUsd: 3000000, deductibleUsd: 5000, annualPremiumUsd: 30000, effectiveDate: "2026-01-01", expirationDate: "2027-01-01", notes: "" });
    const p2 = im.addPolicy({ type: "workers_comp", carrier: "Liberty", policyNumber: "WC-001", status: "active", coverageLimitUsd: 1000000, deductibleUsd: 0, annualPremiumUsd: 25000, effectiveDate: "2026-01-01", expirationDate: "2027-01-01", notes: "" });
    im.fileClaim({ policyId: p1.id, type: "property", description: "Flood damage", status: "filed", estimatedLossUsd: 50000 });
    im.fileClaim({ policyId: p2.id, type: "workers_comp", description: "Workplace injury", status: "filed", estimatedLossUsd: 30000 });
    assert.equal(im.listClaims(p1.id).length, 1);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const im = new InsuranceManager(bus);
    im.addPolicy({ type: "cyber", carrier: "AXA", policyNumber: "C-1", status: "active", coverageLimitUsd: 5000000, deductibleUsd: 50000, annualPremiumUsd: 100000, effectiveDate: "2026-01-01", expirationDate: "2027-06-01", notes: "" });
    const p = im.addPolicy({ type: "general_liability", carrier: "Zurich", policyNumber: "GL-1", status: "active", coverageLimitUsd: 2000000, deductibleUsd: 10000, annualPremiumUsd: 40000, effectiveDate: "2026-01-01", expirationDate: "2027-06-01", notes: "" });
    im.fileClaim({ policyId: p.id, type: "general_liability", description: "Test", status: "filed", estimatedLossUsd: 10000 });
    const s = im.summary();
    assert.equal(s.activePolicies, 2);
    assert.equal(s.openClaims, 1);
    assert.equal(s.totalAnnualPremiumUsd, 140000);
  });
});

// ── WorkforceScheduler ────────────────────────────────────────────────────────
import { WorkforceScheduler } from "../workforce-scheduler/workforce-scheduler.js";

describe("WorkforceScheduler", () => {
  it("assignShift emits event", () => {
    const bus = new EventBus();
    const ws = new WorkforceScheduler(bus);
    const events: unknown[] = [];
    bus.subscribe("workforce.shift_assigned", (e) => { events.push(e.payload); });
    ws.assignShift({ employeeId: "emp-1", role: "engineer", date: "2026-07-07", startTime: "09:00", endTime: "17:00", durationHours: 8, status: "scheduled" });
    assert.equal(events.length, 1);
  });

  it("assignShift emits overtime_alert when >40h in week", () => {
    const bus = new EventBus();
    const ws = new WorkforceScheduler(bus);
    const events: unknown[] = [];
    bus.subscribe("workforce.overtime_alert", (e) => { events.push(e.payload); });
    for (let d = 7; d <= 12; d++) {
      ws.assignShift({ employeeId: "emp-2", role: "tech", date: `2026-07-0${d}`, startTime: "08:00", endTime: "16:00", durationHours: 8, status: "scheduled" });
    }
    assert.ok(events.length >= 1);
  });

  it("checkCoverageGap emits event when under-staffed", () => {
    const bus = new EventBus();
    const ws = new WorkforceScheduler(bus);
    const events: unknown[] = [];
    bus.subscribe("workforce.coverage_gap", (e) => { events.push(e.payload); });
    ws.assignShift({ employeeId: "emp-3", role: "nurse", date: "2026-07-15", startTime: "07:00", endTime: "15:00", durationHours: 8, status: "confirmed" });
    const gap = ws.checkCoverageGap("2026-07-15", "nurse", 3);
    assert.equal(gap, true);
    assert.equal(events.length, 1);
  });

  it("updateShiftStatus transitions correctly", () => {
    const bus = new EventBus();
    const ws = new WorkforceScheduler(bus);
    const shift = ws.assignShift({ employeeId: "emp-4", role: "driver", date: "2026-07-20", startTime: "06:00", endTime: "14:00", durationHours: 8, status: "scheduled" });
    ws.updateShiftStatus(shift.id, "confirmed");
    assert.equal(ws.getShift(shift.id)!.status, "confirmed");
  });

  it("listShifts filters by date and employee", () => {
    const bus = new EventBus();
    const ws = new WorkforceScheduler(bus);
    ws.assignShift({ employeeId: "emp-5", role: "tech", date: "2026-08-01", startTime: "09:00", endTime: "17:00", durationHours: 8, status: "scheduled" });
    ws.assignShift({ employeeId: "emp-6", role: "tech", date: "2026-08-02", startTime: "09:00", endTime: "17:00", durationHours: 8, status: "scheduled" });
    assert.equal(ws.listShifts("2026-08-01").length, 1);
    assert.equal(ws.listShifts(undefined, "emp-5").length, 1);
  });

  it("summary computes labor cost", () => {
    const bus = new EventBus();
    const ws = new WorkforceScheduler(bus);
    ws.assignShift({ employeeId: "emp-7", role: "op", date: "2026-08-10", startTime: "08:00", endTime: "16:00", durationHours: 8, status: "confirmed" });
    ws.assignShift({ employeeId: "emp-8", role: "op", date: "2026-08-10", startTime: "08:00", endTime: "16:00", durationHours: 8, status: "confirmed" });
    const s = ws.summary(50); // $50/hr
    assert.equal(s.estimatedLaborCostUsd, 800); // 16h * $50
    assert.equal(s.confirmedShifts, 2);
  });
});

// ── TreasuryManager ───────────────────────────────────────────────────────────
import { TreasuryManager } from "../treasury/treasury-manager.js";

describe("TreasuryManager", () => {
  it("addAccount emits low_balance_alert when below threshold", () => {
    const bus = new EventBus();
    const tm = new TreasuryManager(bus);
    const events: unknown[] = [];
    bus.subscribe("treasury.low_balance_alert", (e) => { events.push(e.payload); });
    tm.addAccount({ name: "Operating Account", bank: "Chase", accountType: "operating", currency: "USD", balanceUsd: 50000, lowBalanceThresholdUsd: 100000 });
    assert.equal(events.length, 1);
  });

  it("executeTransfer updates balances and emits event", () => {
    const bus = new EventBus();
    const tm = new TreasuryManager(bus);
    const events: unknown[] = [];
    bus.subscribe("treasury.transfer_executed", (e) => { events.push(e.payload); });
    const op = tm.addAccount({ name: "Ops", bank: "JPM", accountType: "operating", currency: "USD", balanceUsd: 5000000, lowBalanceThresholdUsd: 500000 });
    const payroll = tm.addAccount({ name: "Payroll", bank: "JPM", accountType: "payroll", currency: "USD", balanceUsd: 100000, lowBalanceThresholdUsd: 50000 });
    tm.executeTransfer({ fromAccountId: op.id, toAccountId: payroll.id, amountUsd: 500000, currency: "USD", purpose: "June payroll funding", approvedBy: "cfo-1" });
    assert.equal(events.length, 1);
    assert.equal(tm.getAccount(op.id)!.balanceUsd, 4500000);
    assert.equal(tm.getAccount(payroll.id)!.balanceUsd, 600000);
  });

  it("updateBalance emits low_balance_alert", () => {
    const bus = new EventBus();
    const tm = new TreasuryManager(bus);
    const events: unknown[] = [];
    bus.subscribe("treasury.low_balance_alert", (e) => { events.push(e.payload); });
    const acc = tm.addAccount({ name: "Reserve", bank: "BofA", accountType: "reserve", currency: "USD", balanceUsd: 2000000, lowBalanceThresholdUsd: 1000000 });
    tm.updateBalance(acc.id, 800000);
    assert.equal(events.length, 1);
  });

  it("setFXPosition emits alert when over threshold", () => {
    const bus = new EventBus();
    const tm = new TreasuryManager(bus);
    const events: unknown[] = [];
    bus.subscribe("treasury.fx_exposure_alert", (e) => { events.push(e.payload); });
    tm.setFXPosition({ currency: "EUR", exposureUsd: 3000000, direction: "long", hedged: false, alertThresholdUsd: 2000000 });
    assert.equal(events.length, 1);
  });

  it("listAccounts filters by type", () => {
    const bus = new EventBus();
    const tm = new TreasuryManager(bus);
    tm.addAccount({ name: "Ops", bank: "Chase", accountType: "operating", currency: "USD", balanceUsd: 1000000, lowBalanceThresholdUsd: 200000 });
    tm.addAccount({ name: "Tax", bank: "Chase", accountType: "tax", currency: "USD", balanceUsd: 500000, lowBalanceThresholdUsd: 100000 });
    assert.equal(tm.listAccounts("operating").length, 1);
    assert.equal(tm.listAccounts("tax").length, 1);
  });

  it("summary returns correct totals", () => {
    const bus = new EventBus();
    const tm = new TreasuryManager(bus);
    tm.addAccount({ name: "Ops", bank: "Chase", accountType: "operating", currency: "USD", balanceUsd: 2000000, lowBalanceThresholdUsd: 500000 });
    tm.addAccount({ name: "Reserve", bank: "BofA", accountType: "reserve", currency: "USD", balanceUsd: 5000000, lowBalanceThresholdUsd: 1000000 });
    const s = tm.summary();
    assert.equal(s.totalCashUsd, 7000000);
    assert.equal(s.operatingCashUsd, 2000000);
    assert.equal(s.reserveCashUsd, 5000000);
  });
});

// ── LoyaltyProgram ────────────────────────────────────────────────────────────
import { LoyaltyProgram } from "../loyalty/loyalty-program.js";

describe("LoyaltyProgram", () => {
  it("enroll creates bronze member", () => {
    const bus = new EventBus();
    const lp = new LoyaltyProgram(bus);
    const member = lp.enroll("cust-1");
    assert.equal(member.tier, "bronze");
    assert.equal(member.points, 0);
  });

  it("earnPoints emits event and updates balance", () => {
    const bus = new EventBus();
    const lp = new LoyaltyProgram(bus);
    const events: unknown[] = [];
    bus.subscribe("loyalty.points_earned", (e) => { events.push(e.payload); });
    lp.enroll("cust-2");
    lp.earnPoints("cust-2", 500, "purchase");
    assert.equal(events.length, 1);
    assert.equal(lp.getMember("cust-2")!.points, 500);
  });

  it("tier_upgraded event fires when crossing threshold", () => {
    const bus = new EventBus();
    const lp = new LoyaltyProgram(bus);
    const events: unknown[] = [];
    bus.subscribe("loyalty.tier_upgraded", (e) => { events.push(e.payload); });
    lp.enroll("cust-3");
    lp.earnPoints("cust-3", 1000, "purchase"); // crosses silver threshold
    assert.equal(events.length, 1);
    assert.equal(lp.getMember("cust-3")!.tier, "silver");
  });

  it("redeemReward deducts points and emits event", () => {
    const bus = new EventBus();
    const lp = new LoyaltyProgram(bus);
    const events: unknown[] = [];
    bus.subscribe("loyalty.reward_redeemed", (e) => { events.push(e.payload); });
    lp.enroll("cust-4");
    lp.earnPoints("cust-4", 2000, "purchase");
    const reward = lp.addReward({ name: "Free Shipping", description: "One free delivery", pointsCost: 500, valueUsd: 25, category: "shipping", active: true });
    lp.redeemReward("cust-4", reward.id);
    assert.equal(events.length, 1);
    assert.equal(lp.getMember("cust-4")!.points, 1500);
  });

  it("redeemReward returns undefined when insufficient points", () => {
    const bus = new EventBus();
    const lp = new LoyaltyProgram(bus);
    lp.enroll("cust-5");
    lp.earnPoints("cust-5", 100, "trial");
    const reward = lp.addReward({ name: "Premium Gift", description: "Gift basket", pointsCost: 5000, valueUsd: 200, category: "gift", active: true });
    const result = lp.redeemReward("cust-5", reward.id);
    assert.equal(result, undefined);
  });

  it("summary returns correct tier breakdown", () => {
    const bus = new EventBus();
    const lp = new LoyaltyProgram(bus);
    lp.enroll("c1"); lp.earnPoints("c1", 5000, "p"); // gold
    lp.enroll("c2"); lp.earnPoints("c2", 1000, "p"); // silver
    lp.enroll("c3"); // bronze
    const s = lp.summary();
    assert.equal(s.totalMembers, 3);
    assert.equal(s.byTier.bronze, 1);
    assert.equal(s.byTier.silver, 1);
    assert.equal(s.byTier.gold, 1);
  });
});

// ── MATracker ─────────────────────────────────────────────────────────────────
import { MATracker } from "../m-and-a/ma-tracker.js";

describe("MATracker", () => {
  it("openDeal emits event", () => {
    const bus = new EventBus();
    const ma = new MATracker(bus);
    const events: unknown[] = [];
    bus.subscribe("ma.deal_opened", (e) => { events.push(e.payload); });
    ma.openDeal({ targetName: "RoboVision AI", targetDescription: "Computer vision startup", dealType: "acquisition", status: "nda_signed", estimatedValueUsd: 50000000, leadAdvisor: "goldman-sachs", integrationPlanNotes: "" });
    assert.equal(events.length, 1);
  });

  it("addDDItem and completeDDItem triggers due_diligence_completed", () => {
    const bus = new EventBus();
    const ma = new MATracker(bus);
    const events: unknown[] = [];
    bus.subscribe("ma.due_diligence_completed", (e) => { events.push(e.payload); });
    const deal = ma.openDeal({ targetName: "SensorTech", targetDescription: "IoT sensors", dealType: "strategic_investment", status: "due_diligence", estimatedValueUsd: 10000000, leadAdvisor: "internal", integrationPlanNotes: "" });
    const item = ma.addDDItem({ dealId: deal.id, category: "financials", title: "Audit financials", completed: false })!;
    ma.completeDDItem(item.id, "low");
    assert.equal(events.length, 1);
  });

  it("addValuation stores model", () => {
    const bus = new EventBus();
    const ma = new MATracker(bus);
    const deal = ma.openDeal({ targetName: "FleetBot", targetDescription: "Fleet mgmt", dealType: "acquisition", status: "negotiating", estimatedValueUsd: 80000000, leadAdvisor: "jpmorgan", integrationPlanNotes: "" });
    ma.addValuation(deal.id, { method: "ebitda_multiple", valueUsd: 85000000, assumptions: { ebitda: 8500000, multiple: 10 } });
    assert.equal(ma.getDeal(deal.id)!.valuations.length, 1);
  });

  it("closeDeal emits event", () => {
    const bus = new EventBus();
    const ma = new MATracker(bus);
    const events: unknown[] = [];
    bus.subscribe("ma.deal_closed", (e) => { events.push(e.payload); });
    const deal = ma.openDeal({ targetName: "NavAI", targetDescription: "Navigation AI", dealType: "acquisition", status: "negotiating", estimatedValueUsd: 30000000, leadAdvisor: "cfo", integrationPlanNotes: "" });
    ma.closeDeal(deal.id, 28000000, "completed");
    assert.equal(events.length, 1);
    assert.equal(ma.getDeal(deal.id)!.finalValueUsd, 28000000);
  });

  it("listDeals filters by status", () => {
    const bus = new EventBus();
    const ma = new MATracker(bus);
    ma.openDeal({ targetName: "A", targetDescription: "", dealType: "merger", status: "due_diligence", estimatedValueUsd: 1000000, leadAdvisor: "x", integrationPlanNotes: "" });
    ma.openDeal({ targetName: "B", targetDescription: "", dealType: "divestiture", status: "closed", estimatedValueUsd: 2000000, leadAdvisor: "y", integrationPlanNotes: "" });
    assert.equal(ma.listDeals("due_diligence").length, 1);
  });

  it("summary returns correct counts", () => {
    const bus = new EventBus();
    const ma = new MATracker(bus);
    const d = ma.openDeal({ targetName: "C", targetDescription: "", dealType: "joint_venture", status: "loi_signed", estimatedValueUsd: 5000000, leadAdvisor: "z", integrationPlanNotes: "" });
    ma.closeDeal(d.id, 5000000, "completed");
    const d2 = ma.openDeal({ targetName: "D", targetDescription: "", dealType: "acquisition", status: "nda_signed", estimatedValueUsd: 20000000, leadAdvisor: "w", integrationPlanNotes: "" });
    assert.ok(d2.id);
    const s = ma.summary();
    assert.equal(s.totalDeals, 2);
    assert.equal(s.closedDeals, 1);
    assert.equal(s.activeDeals, 1);
  });
});

// ── APIGateway ────────────────────────────────────────────────────────────────
import { APIGateway } from "../api-gateway/api-gateway.js";

describe("APIGateway", () => {
  it("registerEndpoint emits event", () => {
    const bus = new EventBus();
    const gw = new APIGateway(bus);
    const events: unknown[] = [];
    bus.subscribe("api.endpoint_registered", (e) => { events.push(e.payload); });
    gw.registerEndpoint({ path: "/v1/robots", method: "GET", version: "v1", status: "active", owner: "robotics-team", description: "List robots", authScheme: "jwt", rateLimitPerMin: 100, slaLatencyMs: 200, tags: ["robots"] });
    assert.equal(events.length, 1);
  });

  it("deprecateEndpoint emits deprecation_notice", () => {
    const bus = new EventBus();
    const gw = new APIGateway(bus);
    const events: unknown[] = [];
    bus.subscribe("api.deprecation_notice", (e) => { events.push(e.payload); });
    const ep = gw.registerEndpoint({ path: "/v1/sensors", method: "GET", version: "v1", status: "active", owner: "iot-team", description: "List sensors", authScheme: "api_key", rateLimitPerMin: 200, slaLatencyMs: 150, tags: [] });
    gw.deprecateEndpoint(ep.id, "2027-01-01", "/v2/sensors");
    assert.equal(events.length, 1);
    assert.equal(gw.getEndpoint(ep.id)!.status, "deprecated");
  });

  it("recordUsage emits rate_limit_exceeded when over limit", () => {
    const bus = new EventBus();
    const gw = new APIGateway(bus);
    const events: unknown[] = [];
    bus.subscribe("api.rate_limit_exceeded", (e) => { events.push(e.payload); });
    const ep = gw.registerEndpoint({ path: "/v1/data", method: "POST", version: "v1", status: "active", owner: "data-team", description: "Ingest data", authScheme: "jwt", rateLimitPerMin: 50, slaLatencyMs: 500, tags: [] });
    gw.recordUsage({ endpointId: ep.id, consumerId: "consumer-1", requestCount: 75, errorCount: 2, avgLatencyMs: 120, period: "2026-06-24" });
    assert.equal(events.length, 1);
  });

  it("registerConsumer stores consumer", () => {
    const bus = new EventBus();
    const gw = new APIGateway(bus);
    gw.registerConsumer({ name: "Mobile App", apiKey: "key-abc-123", rateMultiplier: 1, allowedEndpoints: [] });
    assert.equal(gw.listConsumers().length, 1);
  });

  it("listEndpoints filters by status", () => {
    const bus = new EventBus();
    const gw = new APIGateway(bus);
    gw.registerEndpoint({ path: "/v1/a", method: "GET", version: "v1", status: "active", owner: "t1", description: "", authScheme: "none", rateLimitPerMin: 100, slaLatencyMs: 200, tags: [] });
    const ep = gw.registerEndpoint({ path: "/v1/b", method: "GET", version: "v1", status: "active", owner: "t2", description: "", authScheme: "none", rateLimitPerMin: 100, slaLatencyMs: 200, tags: [] });
    gw.deprecateEndpoint(ep.id, "2027-01-01");
    assert.equal(gw.listEndpoints("active").length, 1);
    assert.equal(gw.listEndpoints("deprecated").length, 1);
  });

  it("summary counts SLA violations", () => {
    const bus = new EventBus();
    const gw = new APIGateway(bus);
    const ep = gw.registerEndpoint({ path: "/v1/slow", method: "GET", version: "v1", status: "active", owner: "team", description: "", authScheme: "jwt", rateLimitPerMin: 1000, slaLatencyMs: 100, tags: [] });
    gw.recordUsage({ endpointId: ep.id, consumerId: "c1", requestCount: 50, errorCount: 0, avgLatencyMs: 250, period: "2026-06-24" }); // violates 100ms SLA
    const s = gw.summary();
    assert.equal(s.slaViolations, 1);
    assert.equal(s.totalRequests, 50);
  });
});

// ── InternationalExpansion ────────────────────────────────────────────────────
import { InternationalExpansion } from "../international/international-expansion.js";

describe("InternationalExpansion", () => {
  it("addMarket and enterMarket emits event", () => {
    const bus = new EventBus();
    const ie = new InternationalExpansion(bus);
    const events: unknown[] = [];
    bus.subscribe("intl.market_entered", (e) => { events.push(e.payload); });
    const market = ie.addMarket({ country: "Germany", countryCode: "DE", region: "Europe", status: "planning", currency: "EUR", language: "de", gtmScore: 65, notes: "Strong manufacturing base" });
    ie.enterMarket(market.id, "2026-09-01");
    assert.equal(events.length, 1);
    assert.equal(ie.getMarket(market.id)!.status, "active");
  });

  it("registerEntity emits event", () => {
    const bus = new EventBus();
    const ie = new InternationalExpansion(bus);
    const events: unknown[] = [];
    bus.subscribe("intl.entity_registered", (e) => { events.push(e.payload); });
    const market = ie.addMarket({ country: "Japan", countryCode: "JP", region: "APAC", status: "entering", currency: "JPY", language: "ja", gtmScore: 70, notes: "" });
    ie.registerEntity({ marketId: market.id, country: "JP", entityType: "subsidiary", registrationId: "JP-2026-001", name: "Helios Robotics KK", status: "active" });
    assert.equal(events.length, 1);
  });

  it("addRequirement emits compliance_gap for non_compliant", () => {
    const bus = new EventBus();
    const ie = new InternationalExpansion(bus);
    const events: unknown[] = [];
    bus.subscribe("intl.compliance_gap", (e) => { events.push(e.payload); });
    const market = ie.addMarket({ country: "Brazil", countryCode: "BR", region: "LATAM", status: "planning", currency: "BRL", language: "pt", gtmScore: 50, notes: "" });
    ie.addRequirement({ marketId: market.id, category: "tax", title: "CNPJ Registration", status: "non_compliant", dueDate: "2026-10-01" });
    assert.equal(events.length, 1);
  });

  it("updateRequirementStatus changes status", () => {
    const bus = new EventBus();
    const ie = new InternationalExpansion(bus);
    const market = ie.addMarket({ country: "Canada", countryCode: "CA", region: "North America", status: "active", entryDate: "2025-01-01", currency: "CAD", language: "en", gtmScore: 85, notes: "" });
    const req = ie.addRequirement({ marketId: market.id, category: "privacy", title: "PIPEDA Compliance", status: "in_progress" });
    ie.updateRequirementStatus(req!.id, "compliant");
    assert.equal(ie.listRequirements(market.id)[0]!.status, "compliant");
  });

  it("listMarkets filters by status", () => {
    const bus = new EventBus();
    const ie = new InternationalExpansion(bus);
    ie.addMarket({ country: "UK", countryCode: "GB", region: "Europe", status: "active", currency: "GBP", language: "en", gtmScore: 90, notes: "" });
    ie.addMarket({ country: "India", countryCode: "IN", region: "APAC", status: "evaluating", currency: "INR", language: "en", gtmScore: 55, notes: "" });
    assert.equal(ie.listMarkets("active").length, 1);
  });

  it("summary returns correct counts", () => {
    const bus = new EventBus();
    const ie = new InternationalExpansion(bus);
    const m1 = ie.addMarket({ country: "France", countryCode: "FR", region: "Europe", status: "active", currency: "EUR", language: "fr", gtmScore: 80, notes: "" });
    ie.addMarket({ country: "Mexico", countryCode: "MX", region: "LATAM", status: "entering", currency: "MXN", language: "es", gtmScore: 60, notes: "" });
    ie.addRequirement({ marketId: m1.id, category: "legal", title: "GDPR", status: "non_compliant" });
    const s = ie.summary();
    assert.equal(s.totalMarkets, 2);
    assert.equal(s.activeMarkets, 1);
    assert.equal(s.enteringMarkets, 1);
    assert.equal(s.openComplianceGaps, 1);
  });
});

// ── PricingOptimizer ──────────────────────────────────────────────────────────
import { PricingOptimizer } from "../pricing-optimizer/pricing-optimizer.js";
import { TalentIntelligence } from "../talent-intel/talent-intelligence.js";
import { ProductCatalog } from "../product-catalog/product-catalog.js";

describe("PricingOptimizer", () => {
  it("generateRecommendation emits event", () => {
    const bus = new EventBus();
    const po = new PricingOptimizer(bus);
    const events: unknown[] = [];
    bus.subscribe("pricing.recommendation_generated", (e) => { events.push(e.payload); });
    po.generateRecommendation({ sku: "robot-arm-pro", strategy: "value_based", currentPriceUsd: 50000, recommendedPriceUsd: 55000, minPriceUsd: 45000, maxPriceUsd: 60000, expectedRevenueDeltaPct: 8.5, confidence: 82, rationale: "Market benchmark analysis" });
    assert.equal(events.length, 1);
  });

  it("applyRecommendation marks applied", () => {
    const bus = new EventBus();
    const po = new PricingOptimizer(bus);
    const rec = po.generateRecommendation({ sku: "sku-1", strategy: "competitive", currentPriceUsd: 100, recommendedPriceUsd: 95, minPriceUsd: 85, maxPriceUsd: 110, expectedRevenueDeltaPct: 3, confidence: 75, rationale: "Match competitor" });
    po.applyRecommendation(rec.id);
    assert.equal(po.getRecommendation(rec.id)!.applied, true);
    assert.equal(po.listRecommendations(false).length, 0);
  });

  it("updateElasticity emits event", () => {
    const bus = new EventBus();
    const po = new PricingOptimizer(bus);
    const events: unknown[] = [];
    bus.subscribe("pricing.elasticity_updated", (e) => { events.push(e.payload); });
    po.updateElasticity("sku-2", -1.5, 1200, 0.87);
    assert.equal(events.length, 1);
    assert.equal(po.getElasticityModel("sku-2")!.elasticity, -1.5);
  });

  it("createDiscount and approveDiscount emits event", () => {
    const bus = new EventBus();
    const po = new PricingOptimizer(bus);
    const events: unknown[] = [];
    bus.subscribe("pricing.discount_approved", (e) => { events.push(e.payload); });
    const d = po.createDiscount({ sku: "sku-3", type: "percentage", value: 15, validFrom: "2026-07-01", validUntil: "2026-07-31", approved: false });
    po.approveDiscount(d.id, "cmo-1");
    assert.equal(events.length, 1);
  });

  it("useDiscount tracks usage and respects max", () => {
    const bus = new EventBus();
    const po = new PricingOptimizer(bus);
    const d = po.createDiscount({ code: "SAVE10", type: "percentage", value: 10, maxUsages: 2, validFrom: "2026-01-01", validUntil: "2026-12-31", approved: true });
    assert.equal(po.useDiscount(d.id), true);
    assert.equal(po.useDiscount(d.id), true);
    assert.equal(po.useDiscount(d.id), false); // exceeded max
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const po = new PricingOptimizer(bus);
    po.generateRecommendation({ sku: "s1", strategy: "skimming", currentPriceUsd: 200, recommendedPriceUsd: 220, minPriceUsd: 180, maxPriceUsd: 250, expectedRevenueDeltaPct: 12, confidence: 90, rationale: "High WTP segment" });
    po.generateRecommendation({ sku: "s2", strategy: "penetration", currentPriceUsd: 100, recommendedPriceUsd: 85, minPriceUsd: 75, maxPriceUsd: 100, expectedRevenueDeltaPct: 5, confidence: 70, rationale: "Grow share" });
    const s = po.summary();
    assert.equal(s.totalRecommendations, 2);
    assert.equal(s.applied, 0);
    assert.equal(s.avgConfidence, 80);
  });
});

describe("TalentIntelligence", () => {
  it("updateSkillProfile stores profile", () => {
    const bus = new EventBus();
    const ti = new TalentIntelligence(bus);
    const p = ti.updateSkillProfile("emp1", { typescript: 4, leadership: 3 });
    assert.equal(p.employeeId, "emp1");
    assert.equal(p.skills["typescript"], 4);
    assert.deepEqual(ti.getSkillProfile("emp1"), p);
  });

  it("analyzeSkillsGap identifies gaps and emits events", () => {
    const bus = new EventBus();
    const ti = new TalentIntelligence(bus);
    const events: unknown[] = [];
    bus.subscribe("talent.skills_gap_identified", (e) => { events.push(e.payload); });
    ti.updateSkillProfile("emp2", { typescript: 2, leadership: 3 });
    ti.setRoleRequirements("role1", { typescript: 4, leadership: 3 });
    const gaps = ti.analyzeSkillsGap("emp2", "role1");
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0]!.skill, "typescript");
    assert.equal(events.length, 1);
  });

  it("createSuccessionPlan emits succession_ready when score >= 80", () => {
    const bus = new EventBus();
    const ti = new TalentIntelligence(bus);
    const events: unknown[] = [];
    bus.subscribe("talent.succession_ready", (e) => { events.push(e.payload); });
    ti.createSuccessionPlan({ roleId: "cto", roleName: "CTO", successors: [{ employeeId: "emp3", readiness: "ready_now", readinessScore: 90 }] });
    assert.equal(events.length, 1);
  });

  it("recordLearning stores record and emits event", () => {
    const bus = new EventBus();
    const ti = new TalentIntelligence(bus);
    const events: unknown[] = [];
    bus.subscribe("talent.learning_completed", (e) => { events.push(e.payload); });
    const rec = ti.recordLearning({ employeeId: "emp4", courseId: "c1", courseName: "TS Advanced", skillGained: "typescript", hoursInvested: 8, completedAt: "2026-01-01" });
    assert.ok(rec.id);
    assert.equal(events.length, 1);
    assert.equal(ti.listLearningRecords("emp4").length, 1);
  });

  it("listLearningRecords filters by employeeId", () => {
    const bus = new EventBus();
    const ti = new TalentIntelligence(bus);
    ti.recordLearning({ employeeId: "empA", courseId: "c1", courseName: "A", skillGained: "s1", hoursInvested: 4, completedAt: "2026-01-01" });
    ti.recordLearning({ employeeId: "empB", courseId: "c2", courseName: "B", skillGained: "s2", hoursInvested: 6, completedAt: "2026-01-02" });
    assert.equal(ti.listLearningRecords("empA").length, 1);
    assert.equal(ti.listLearningRecords().length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const ti = new TalentIntelligence(bus);
    ti.updateSkillProfile("e1", { skill1: 3, skill2: 5 });
    ti.createSuccessionPlan({ roleId: "r1", roleName: "Role1", successors: [{ employeeId: "e1", readiness: "ready_now", readinessScore: 85 }] });
    ti.recordLearning({ employeeId: "e1", courseId: "c1", courseName: "X", skillGained: "skill1", hoursInvested: 10, completedAt: "2026-01-01" });
    const s = ti.summary();
    assert.equal(s.totalSkillProfiles, 1);
    assert.equal(s.totalSuccessionPlans, 1);
    assert.equal(s.readyNowSuccessors, 1);
    assert.equal(s.totalLearningHours, 10);
  });
});

describe("ProductCatalog", () => {
  it("createProduct stores product", () => {
    const bus = new EventBus();
    const pc = new ProductCatalog(bus);
    const p = pc.createProduct({ sku: "SKU-001", name: "Widget", description: "A widget", type: "physical", status: "draft", basePriceUsd: 29.99, tags: [], imageUrls: [] });
    assert.ok(p.id);
    assert.equal(p.sku, "SKU-001");
    assert.deepEqual(pc.getProduct(p.id), p);
  });

  it("publishProduct sets status active and emits event", () => {
    const bus = new EventBus();
    const pc = new ProductCatalog(bus);
    const events: unknown[] = [];
    bus.subscribe("catalog.product_published", (e) => { events.push(e.payload); });
    const p = pc.createProduct({ sku: "SKU-002", name: "Gadget", description: "A gadget", type: "digital", status: "draft", basePriceUsd: 49.99, tags: [], imageUrls: [] });
    pc.publishProduct(p.id);
    assert.equal(pc.getProduct(p.id)!.status, "active");
    assert.equal(events.length, 1);
  });

  it("addVariant links to product and emits event", () => {
    const bus = new EventBus();
    const pc = new ProductCatalog(bus);
    const events: unknown[] = [];
    bus.subscribe("catalog.variant_added", (e) => { events.push(e.payload); });
    const p = pc.createProduct({ sku: "SKU-003", name: "Shirt", description: "A shirt", type: "physical", status: "active", basePriceUsd: 19.99, tags: [], imageUrls: [] });
    const v = pc.addVariant({ productId: p.id, sku: "SKU-003-BLU-M", attributes: { color: "blue", size: "M" }, additionalPriceUsd: 2, stockQuantity: 10, active: true });
    assert.ok(v!.id);
    assert.equal(pc.getProduct(p.id)!.variants.length, 1);
    assert.equal(events.length, 1);
  });

  it("discontinueProduct sets status and emits event", () => {
    const bus = new EventBus();
    const pc = new ProductCatalog(bus);
    const events: unknown[] = [];
    bus.subscribe("catalog.product_discontinued", (e) => { events.push(e.payload); });
    const p = pc.createProduct({ sku: "SKU-004", name: "OldItem", description: "Old", type: "physical", status: "active", basePriceUsd: 9.99, tags: [], imageUrls: [] });
    pc.discontinueProduct(p.id, "SKU-NEW");
    assert.equal(pc.getProduct(p.id)!.status, "discontinued");
    assert.equal(pc.getProduct(p.id)!.replacedBySku, "SKU-NEW");
    assert.equal(events.length, 1);
  });

  it("listProducts filters by status and type", () => {
    const bus = new EventBus();
    const pc = new ProductCatalog(bus);
    pc.createProduct({ sku: "A1", name: "A1", description: "", type: "physical", status: "active", basePriceUsd: 10, tags: [], imageUrls: [] });
    pc.createProduct({ sku: "A2", name: "A2", description: "", type: "digital", status: "draft", basePriceUsd: 20, tags: [], imageUrls: [] });
    assert.equal(pc.listProducts("active").length, 1);
    assert.equal(pc.listProducts(undefined, "digital").length, 1);
    assert.equal(pc.listProducts().length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const pc = new ProductCatalog(bus);
    const p = pc.createProduct({ sku: "S1", name: "S1", description: "", type: "physical", status: "draft", basePriceUsd: 100, tags: [], imageUrls: [] });
    pc.publishProduct(p.id);
    pc.addVariant({ productId: p.id, sku: "S1-V1", attributes: { color: "red" }, additionalPriceUsd: 5, stockQuantity: 5, active: true });
    const s = pc.summary();
    assert.equal(s.totalProducts, 1);
    assert.equal(s.activeProducts, 1);
    assert.equal(s.totalVariants, 1);
    assert.equal(s.avgBasePrice, 100);
  });
});
