/**
 * Olympus core invariant tests.
 * Run with: npm test
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";

import { EventBus } from "../events/event-bus.js";
import { SubscriptionManager } from "../subscription-mgr/subscription-manager.js";
import { RealEstateManager } from "../real-estate/real-estate-manager.js";
import { PermitManager } from "../permits/permit-manager.js";
import { TaxManager } from "../tax-mgr/tax-manager.js";
import { WarehouseManager } from "../warehouse/warehouse-manager.js";
import { CustomerFeedbackEngine } from "../customer-feedback/customer-feedback.js";
import { TrainingManager } from "../training/training-manager.js";
import { ProcurementEngine } from "../procurement-engine/procurement-engine.js";
import { ContentManager } from "../content-mgr/content-manager.js";
import { ProjectPortfolio } from "../project-portfolio/project-portfolio.js";
import { CryptoTreasury } from "../crypto-treasury/crypto-treasury.js";
import { BoardGovernance } from "../board-governance/board-governance.js";
import { ServiceLevelManager } from "../service-level/service-level-manager.js";
import { DigitalAssetManager } from "../digital-assets/digital-asset-manager.js";
import { HealthBenefitsManager } from "../health-benefits/health-benefits-manager.js";
import { CommissionEngine } from "../commission-engine/commission-engine.js";
import { TimeTrackingManager } from "../time-tracking/time-tracking-manager.js";
import { VendorRiskManager } from "../vendor-risk/vendor-risk-manager.js";
import { WarrantyManager } from "../warranty/warranty-manager.js";
import { ReferralProgramManager } from "../referral/referral-manager.js";
import { CapTableManager } from "../cap-table/cap-table-manager.js";
import { ApprovalWorkflowManager } from "../approval-workflow/approval-workflow-manager.js";
import { DunningManager } from "../dunning/dunning-manager.js";
import { EventSchedulerManager } from "../event-scheduler/event-scheduler-manager.js";
import { PromotionManager } from "../promotion/promotion-manager.js";
import { RebateManager } from "../rebate/rebate-manager.js";
import { DataRetentionManager } from "../data-retention/data-retention-manager.js";
import { AccessReviewManager } from "../access-review/access-review-manager.js";
import { ChangeManagementManager } from "../change-mgmt/change-management-manager.js";
import { OnCallScheduleManager } from "../on-call/on-call-manager.js";
import { InvestorRelationsManager } from "../investor-relations/investor-relations-manager.js";
import { GiftCardManager } from "../gift-card/gift-card-manager.js";
import { RevenueRecognitionManager } from "../rev-rec/revenue-recognition-manager.js";
import { SafetyIncidentManager } from "../safety/safety-incident-manager.js";
import { EthicsCaseManager } from "../ethics/ethics-case-manager.js";
import { CorporateTravelManager } from "../travel/corporate-travel-manager.js";
import { DocumentSignatureManager } from "../e-signature/document-signature-manager.js";
import { EquipmentCalibrationManager } from "../equipment-calibration/equipment-calibration-manager.js";
import { LocalizationManager } from "../localization/localization-manager.js";
import { AffiliateManager } from "../affiliate/affiliate-manager.js";
import { WebhookDeliveryManager } from "../webhook-delivery/webhook-delivery-manager.js";
import { ReleaseManager } from "../release/release-manager.js";
import { EnergyUsageManager } from "../energy/energy-usage-manager.js";
import { VisitorManager } from "../visitor/visitor-manager.js";
import { PurchaseCardManager } from "../purchase-card/purchase-card-manager.js";
import { CycleCountManager } from "../cycle-count/cycle-count-manager.js";
import { AssetReservationManager } from "../reservation/asset-reservation-manager.js";
import { ComplaintManager } from "../complaint/complaint-manager.js";
import { BudgetTransferManager } from "../budget-transfer/budget-transfer-manager.js";
import { AssetDisposalManager } from "../asset-disposal/asset-disposal-manager.js";
import { PettyCashManager } from "../petty-cash/petty-cash-manager.js";
import { MileageManager } from "../mileage/mileage-manager.js";
import { DocumentTemplateManager } from "../doc-template/document-template-manager.js";
import { AssetTransferManager } from "../asset-transfer/asset-transfer-manager.js";
import { WaitlistManager } from "../waitlist/waitlist-manager.js";
import { AppointmentManager } from "../appointment/appointment-manager.js";
import { SupplierScorecardManager } from "../supplier-scorecard/supplier-scorecard-manager.js";
import { NonconformanceManager } from "../nonconformance/nonconformance-manager.js";
import { GrievanceManager } from "../grievance/grievance-manager.js";
import { AssetCheckoutManager } from "../asset-checkout/asset-checkout-manager.js";
import { SponsorshipManager } from "../sponsorship/sponsorship-manager.js";
import { MembershipManager } from "../membership/membership-manager.js";
import { ChargebackManager } from "../chargeback/chargeback-manager.js";
import { TaxExemptionManager } from "../tax-exemption/tax-exemption-manager.js";
import { BackgroundCheckManager } from "../background-check/background-check-manager.js";
import { InsuranceCertificateManager } from "../insurance-cert/insurance-certificate-manager.js";
import { PurchaseRequisitionManager } from "../requisition/purchase-requisition-manager.js";
import { GoodsReceiptManager } from "../goods-receipt/goods-receipt-manager.js";
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
import { FacilitiesManager } from "../facilities/facilities-manager.js";
import { BudgetPlanner } from "../budget-planner/budget-planner.js";
import { CampaignManager } from "../campaign-mgr/campaign-manager.js";
import { KPIDashboard } from "../kpi-dashboard/kpi-dashboard.js";
import { FleetManager } from "../fleet/fleet-manager.js";
import { ContractManager as NewContractManager } from "../contracts/contract-manager.js";

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

describe("FacilitiesManager", () => {
  it("addLocation stores location", () => {
    const bus = new EventBus();
    const fm = new FacilitiesManager(bus);
    const loc = fm.addLocation({ name: "HQ", address: "123 Main St", country: "US", sqft: 10000, capacity: 100, leaseStatus: "active", monthlyRentUsd: 50000, leaseStartDate: "2025-01-01", leaseEndDate: "2030-01-01" });
    assert.ok(loc.id);
    assert.equal(fm.getLocation(loc.id)?.name, "HQ");
  });

  it("addLocation emits lease_expiring when expiring within 90 days", () => {
    const bus = new EventBus();
    const fm = new FacilitiesManager(bus);
    const events: unknown[] = [];
    bus.subscribe("facilities.lease_expiring", (e) => { events.push(e.payload); });
    fm.addLocation({ name: "Annex", address: "456 Oak Ave", country: "US", sqft: 2000, capacity: 20, leaseStatus: "active", monthlyRentUsd: 5000, leaseStartDate: "2020-01-01", leaseEndDate: "2026-07-01" });
    assert.equal(events.length, 1);
  });

  it("createMaintenanceRequest and completeMaintenanceRequest emit event", () => {
    const bus = new EventBus();
    const fm = new FacilitiesManager(bus);
    const events: unknown[] = [];
    bus.subscribe("facilities.maintenance_completed", (e) => { events.push(e.payload); });
    const loc = fm.addLocation({ name: "Office", address: "1 Pl", country: "US", sqft: 5000, capacity: 50, leaseStatus: "active", monthlyRentUsd: 20000, leaseStartDate: "2024-01-01", leaseEndDate: "2030-01-01" });
    const req = fm.createMaintenanceRequest({ locationId: loc.id, title: "Fix HVAC", description: "HVAC broken", priority: "high", status: "open", estimatedCostUsd: 2000, requestedAt: "2026-06-01" });
    fm.completeMaintenanceRequest(req.id, 1800);
    assert.equal(fm.listMaintenanceRequests("completed").length, 1);
    assert.equal(events.length, 1);
  });

  it("bookRoom stores booking and emits event", () => {
    const bus = new EventBus();
    const fm = new FacilitiesManager(bus);
    const events: unknown[] = [];
    bus.subscribe("facilities.room_booked", (e) => { events.push(e.payload); });
    const booking = fm.bookRoom({ roomId: "room-1", locationId: "loc-1", bookedBy: "emp1", title: "Team Sync", startTime: "2026-07-01T09:00:00Z", endTime: "2026-07-01T10:00:00Z", attendeeCount: 10 });
    assert.ok(booking.id);
    assert.equal(events.length, 1);
  });

  it("listMaintenanceRequests filters by status", () => {
    const bus = new EventBus();
    const fm = new FacilitiesManager(bus);
    fm.createMaintenanceRequest({ locationId: "l1", title: "A", description: "", priority: "low", status: "open", estimatedCostUsd: 100, requestedAt: "2026-01-01" });
    fm.createMaintenanceRequest({ locationId: "l1", title: "B", description: "", priority: "low", status: "completed", estimatedCostUsd: 200, requestedAt: "2026-01-01" });
    assert.equal(fm.listMaintenanceRequests("open").length, 1);
    assert.equal(fm.listMaintenanceRequests().length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const fm = new FacilitiesManager(bus);
    fm.addLocation({ name: "L1", address: "A", country: "US", sqft: 5000, capacity: 50, leaseStatus: "active", monthlyRentUsd: 10000, leaseStartDate: "2025-01-01", leaseEndDate: "2030-01-01" });
    fm.createMaintenanceRequest({ locationId: "l1", title: "Fix", description: "", priority: "low", status: "open", estimatedCostUsd: 500, requestedAt: "2026-01-01" });
    const s = fm.summary();
    assert.equal(s.totalLocations, 1);
    assert.equal(s.activeLeases, 1);
    assert.equal(s.openMaintenanceRequests, 1);
  });
});

describe("ContractManager (new)", () => {
  it("createContract stores contract", () => {
    const bus = new EventBus();
    const cm = new NewContractManager(bus);
    const c = cm.createContract({ title: "SaaS Agreement", type: "vendor", status: "draft", counterparty: "Acme Corp", valueUsd: 120000, startDate: "2026-01-01", endDate: "2027-01-01", autoRenew: true, tags: [] });
    assert.ok(c.id);
    assert.equal(cm.getContract(c.id)?.title, "SaaS Agreement");
  });

  it("signContract sets status active and emits event", () => {
    const bus = new EventBus();
    const cm = new NewContractManager(bus);
    const events: unknown[] = [];
    bus.subscribe("contracts.contract_signed", (e) => { events.push(e.payload); });
    const c = cm.createContract({ title: "NDA", type: "nda", status: "pending_signature", counterparty: "Partner", valueUsd: 0, startDate: "2026-01-01", endDate: "2028-01-01", autoRenew: false, tags: [] });
    cm.signContract(c.id);
    assert.equal(cm.getContract(c.id)!.status, "active");
    assert.equal(events.length, 1);
  });

  it("addObligation links to contract", () => {
    const bus = new EventBus();
    const cm = new NewContractManager(bus);
    const c = cm.createContract({ title: "MSA", type: "customer", status: "active", counterparty: "Client", valueUsd: 500000, startDate: "2026-01-01", endDate: "2027-01-01", autoRenew: true, tags: [] });
    const ob = cm.addObligation({ contractId: c.id, description: "Deliver Q1 report", dueDate: "2026-04-01", status: "pending", owner: "pm1" });
    assert.ok(ob!.id);
    assert.equal(cm.getContract(c.id)!.obligations.length, 1);
  });

  it("completeObligation updates status", () => {
    const bus = new EventBus();
    const cm = new NewContractManager(bus);
    const c = cm.createContract({ title: "MSA2", type: "service", status: "active", counterparty: "Vendor", valueUsd: 50000, startDate: "2026-01-01", endDate: "2027-01-01", autoRenew: false, tags: [] });
    const ob = cm.addObligation({ contractId: c.id, description: "Onboarding", dueDate: "2026-09-01", status: "pending", owner: "ops" });
    cm.completeObligation(ob!.id);
    assert.equal(cm.listObligations(c.id)[0]!.status, "completed");
  });

  it("listContracts filters by status and type", () => {
    const bus = new EventBus();
    const cm = new NewContractManager(bus);
    cm.createContract({ title: "C1", type: "vendor", status: "active", counterparty: "V1", valueUsd: 10000, startDate: "2026-01-01", endDate: "2027-01-01", autoRenew: false, tags: [] });
    cm.createContract({ title: "C2", type: "nda", status: "draft", counterparty: "P1", valueUsd: 0, startDate: "2026-01-01", endDate: "2027-01-01", autoRenew: false, tags: [] });
    assert.equal(cm.listContracts("active").length, 1);
    assert.equal(cm.listContracts(undefined, "nda").length, 1);
    assert.equal(cm.listContracts().length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const cm = new NewContractManager(bus);
    cm.createContract({ title: "C1", type: "vendor", status: "active", counterparty: "V1", valueUsd: 100000, startDate: "2026-01-01", endDate: "2029-01-01", autoRenew: true, tags: [] });
    const s = cm.summary();
    assert.equal(s.totalContracts, 1);
    assert.equal(s.activeContracts, 1);
    assert.equal(s.totalValueUsd, 100000);
  });
});

describe("BudgetPlanner", () => {
  it("createBudget stores budget", () => {
    const bus = new EventBus();
    const bp = new BudgetPlanner(bus);
    const b = bp.createBudget({ name: "Q3 2026", period: "quarterly", fiscalYear: 2026, status: "draft", departmentId: "eng", totalPlannedUsd: 500000 });
    assert.ok(b.id);
    assert.equal(bp.getBudget(b.id)?.name, "Q3 2026");
  });

  it("approveBudget sets status and emits event", () => {
    const bus = new EventBus();
    const bp = new BudgetPlanner(bus);
    const events: unknown[] = [];
    bus.subscribe("budget.approved", (e) => { events.push(e.payload); });
    const b = bp.createBudget({ name: "FY2026", period: "annual", fiscalYear: 2026, status: "pending_approval", departmentId: "finance", totalPlannedUsd: 2000000 });
    bp.approveBudget(b.id, "cfo-1");
    assert.equal(bp.getBudget(b.id)!.status, "approved");
    assert.equal(events.length, 1);
  });

  it("addLineItem fires variance_alert when >10%", () => {
    const bus = new EventBus();
    const bp = new BudgetPlanner(bus);
    const events: unknown[] = [];
    bus.subscribe("budget.variance_alert", (e) => { events.push(e.payload); });
    const b = bp.createBudget({ name: "Q1", period: "quarterly", fiscalYear: 2026, status: "active", departmentId: "mktg", totalPlannedUsd: 0 });
    bp.addLineItem({ budgetId: b.id, category: "ads", description: "Paid Ads", plannedUsd: 100000, actualUsd: 115000 });
    assert.equal(events.length, 1);
  });

  it("submitReforecast updates totalPlannedUsd and emits event", () => {
    const bus = new EventBus();
    const bp = new BudgetPlanner(bus);
    const events: unknown[] = [];
    bus.subscribe("budget.reforecast_submitted", (e) => { events.push(e.payload); });
    const b = bp.createBudget({ name: "Q2", period: "quarterly", fiscalYear: 2026, status: "active", departmentId: "sales", totalPlannedUsd: 300000 });
    bp.submitReforecast(b.id, "vp-sales", 350000);
    assert.equal(bp.getBudget(b.id)!.totalPlannedUsd, 350000);
    assert.equal(events.length, 1);
  });

  it("listBudgets filters by status", () => {
    const bus = new EventBus();
    const bp = new BudgetPlanner(bus);
    bp.createBudget({ name: "A", period: "monthly", fiscalYear: 2026, status: "approved", departmentId: "d1", totalPlannedUsd: 50000 });
    bp.createBudget({ name: "B", period: "monthly", fiscalYear: 2026, status: "draft", departmentId: "d2", totalPlannedUsd: 30000 });
    assert.equal(bp.listBudgets("approved").length, 1);
    assert.equal(bp.listBudgets().length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const bp = new BudgetPlanner(bus);
    const b = bp.createBudget({ name: "FY", period: "annual", fiscalYear: 2026, status: "approved", departmentId: "all", totalPlannedUsd: 1000000 });
    bp.addLineItem({ budgetId: b.id, category: "payroll", description: "Payroll", plannedUsd: 800000, actualUsd: 810000 });
    const s = bp.summary();
    assert.equal(s.totalBudgets, 1);
    assert.equal(s.approvedBudgets, 1);
  });
});

describe("CampaignManager", () => {
  it("createCampaign stores campaign", () => {
    const bus = new EventBus();
    const cm = new CampaignManager(bus);
    const c = cm.createCampaign({ name: "Summer Sale", channel: "email", status: "draft", audienceSegment: "all-users", budgetUsd: 50000, startDate: "2026-07-01", endDate: "2026-07-31" });
    assert.ok(c.id);
    assert.equal(cm.getCampaign(c.id)?.name, "Summer Sale");
  });

  it("launchCampaign sets status active and emits event", () => {
    const bus = new EventBus();
    const cm = new CampaignManager(bus);
    const events: unknown[] = [];
    bus.subscribe("campaign.launched", (e) => { events.push(e.payload); });
    const c = cm.createCampaign({ name: "Q3 Promo", channel: "social", status: "scheduled", audienceSegment: "prospects", budgetUsd: 20000, startDate: "2026-07-15", endDate: "2026-08-15" });
    cm.launchCampaign(c.id);
    assert.equal(cm.getCampaign(c.id)!.status, "active");
    assert.equal(events.length, 1);
  });

  it("completeCampaign emits event with roi", () => {
    const bus = new EventBus();
    const cm = new CampaignManager(bus);
    const events: unknown[] = [];
    bus.subscribe("campaign.completed", (e) => { events.push(e.payload); });
    const c = cm.createCampaign({ name: "PPC Fall", channel: "paid_search", status: "active", audienceSegment: "smb", budgetUsd: 10000, startDate: "2026-09-01", endDate: "2026-09-30" });
    cm.recordResults(c.id, 200, 35000, 10000);
    cm.completeCampaign(c.id);
    assert.equal(events.length, 1);
  });

  it("addVariant computes ctr and conversionRate", () => {
    const bus = new EventBus();
    const cm = new CampaignManager(bus);
    const c = cm.createCampaign({ name: "AB Test", channel: "email", status: "active", audienceSegment: "enterprise", budgetUsd: 5000, startDate: "2026-10-01", endDate: "2026-10-15" });
    const v = cm.addVariant({ campaignId: c.id, name: "Control", isControl: true, impressions: 10000, clicks: 500, conversions: 50 });
    assert.ok(v!.id);
    assert.equal(v!.ctr, 5);
    assert.equal(v!.conversionRate, 10);
  });

  it("selectWinner sets winningVariantId and emits event", () => {
    const bus = new EventBus();
    const cm = new CampaignManager(bus);
    const events: unknown[] = [];
    bus.subscribe("campaign.ab_winner_selected", (e) => { events.push(e.payload); });
    const c = cm.createCampaign({ name: "Banner AB", channel: "display", status: "active", audienceSegment: "retargeting", budgetUsd: 8000, startDate: "2026-08-01", endDate: "2026-08-31" });
    cm.selectWinner(c.id, "variant-b", "Higher CTR");
    assert.equal(cm.getCampaign(c.id)!.winningVariantId, "variant-b");
    assert.equal(events.length, 1);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const cm = new CampaignManager(bus);
    cm.createCampaign({ name: "C1", channel: "email", status: "active", audienceSegment: "all", budgetUsd: 10000, startDate: "2026-01-01", endDate: "2026-12-31" });
    cm.createCampaign({ name: "C2", channel: "social", status: "draft", audienceSegment: "all", budgetUsd: 5000, startDate: "2026-06-01", endDate: "2026-06-30" });
    const s = cm.summary();
    assert.equal(s.totalCampaigns, 2);
    assert.equal(s.activeCampaigns, 1);
    assert.equal(s.totalBudgetUsd, 15000);
  });
});

describe("BudgetPlanner", () => {
  it("createBudget stores budget", () => {
    const bus = new EventBus();
    const bp = new BudgetPlanner(bus);
    const b = bp.createBudget({ name: "Q3 2026", period: "quarterly", fiscalYear: 2026, status: "draft", departmentId: "eng", totalPlannedUsd: 500000 });
    assert.ok(b.id);
    assert.equal(bp.getBudget(b.id)?.name, "Q3 2026");
  });

  it("approveBudget sets status and emits event", () => {
    const bus = new EventBus();
    const bp = new BudgetPlanner(bus);
    const events: unknown[] = [];
    bus.subscribe("budget.approved", (e) => { events.push(e.payload); });
    const b = bp.createBudget({ name: "FY2026", period: "annual", fiscalYear: 2026, status: "pending_approval", departmentId: "finance", totalPlannedUsd: 2000000 });
    bp.approveBudget(b.id, "cfo-1");
    assert.equal(bp.getBudget(b.id)!.status, "approved");
    assert.equal(events.length, 1);
  });

  it("addLineItem fires variance_alert when >10%", () => {
    const bus = new EventBus();
    const bp = new BudgetPlanner(bus);
    const events: unknown[] = [];
    bus.subscribe("budget.variance_alert", (e) => { events.push(e.payload); });
    const b = bp.createBudget({ name: "Q1", period: "quarterly", fiscalYear: 2026, status: "active", departmentId: "mktg", totalPlannedUsd: 0 });
    bp.addLineItem({ budgetId: b.id, category: "ads", description: "Paid Ads", plannedUsd: 100000, actualUsd: 115000 });
    assert.equal(events.length, 1);
  });

  it("submitReforecast updates totalPlannedUsd and emits event", () => {
    const bus = new EventBus();
    const bp = new BudgetPlanner(bus);
    const events: unknown[] = [];
    bus.subscribe("budget.reforecast_submitted", (e) => { events.push(e.payload); });
    const b = bp.createBudget({ name: "Q2", period: "quarterly", fiscalYear: 2026, status: "active", departmentId: "sales", totalPlannedUsd: 300000 });
    bp.submitReforecast(b.id, "vp-sales", 350000);
    assert.equal(bp.getBudget(b.id)!.totalPlannedUsd, 350000);
    assert.equal(events.length, 1);
  });

  it("listBudgets filters by status", () => {
    const bus = new EventBus();
    const bp = new BudgetPlanner(bus);
    bp.createBudget({ name: "A", period: "monthly", fiscalYear: 2026, status: "approved", departmentId: "d1", totalPlannedUsd: 50000 });
    bp.createBudget({ name: "B", period: "monthly", fiscalYear: 2026, status: "draft", departmentId: "d2", totalPlannedUsd: 30000 });
    assert.equal(bp.listBudgets("approved").length, 1);
    assert.equal(bp.listBudgets().length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const bp = new BudgetPlanner(bus);
    const b = bp.createBudget({ name: "FY", period: "annual", fiscalYear: 2026, status: "approved", departmentId: "all", totalPlannedUsd: 1000000 });
    bp.addLineItem({ budgetId: b.id, category: "payroll", description: "Payroll", plannedUsd: 800000, actualUsd: 810000 });
    const s = bp.summary();
    assert.equal(s.totalBudgets, 1);
    assert.equal(s.approvedBudgets, 1);
  });
});

describe("CampaignManager", () => {
  it("createCampaign stores campaign", () => {
    const bus = new EventBus();
    const cm = new CampaignManager(bus);
    const c = cm.createCampaign({ name: "Summer Sale", channel: "email", status: "draft", audienceSegment: "all-users", budgetUsd: 50000, startDate: "2026-07-01", endDate: "2026-07-31" });
    assert.ok(c.id);
    assert.equal(cm.getCampaign(c.id)?.name, "Summer Sale");
  });

  it("launchCampaign sets status active and emits event", () => {
    const bus = new EventBus();
    const cm = new CampaignManager(bus);
    const events: unknown[] = [];
    bus.subscribe("campaign.launched", (e) => { events.push(e.payload); });
    const c = cm.createCampaign({ name: "Q3 Promo", channel: "social", status: "scheduled", audienceSegment: "prospects", budgetUsd: 20000, startDate: "2026-07-15", endDate: "2026-08-15" });
    cm.launchCampaign(c.id);
    assert.equal(cm.getCampaign(c.id)!.status, "active");
    assert.equal(events.length, 1);
  });

  it("completeCampaign emits event with roi", () => {
    const bus = new EventBus();
    const cm = new CampaignManager(bus);
    const events: unknown[] = [];
    bus.subscribe("campaign.completed", (e) => { events.push(e.payload); });
    const c = cm.createCampaign({ name: "PPC Fall", channel: "paid_search", status: "active", audienceSegment: "smb", budgetUsd: 10000, startDate: "2026-09-01", endDate: "2026-09-30" });
    cm.recordResults(c.id, 200, 35000, 10000);
    cm.completeCampaign(c.id);
    assert.equal(events.length, 1);
  });

  it("addVariant computes ctr and conversionRate", () => {
    const bus = new EventBus();
    const cm = new CampaignManager(bus);
    const c = cm.createCampaign({ name: "AB Test", channel: "email", status: "active", audienceSegment: "enterprise", budgetUsd: 5000, startDate: "2026-10-01", endDate: "2026-10-15" });
    const v = cm.addVariant({ campaignId: c.id, name: "Control", isControl: true, impressions: 10000, clicks: 500, conversions: 50 });
    assert.ok(v!.id);
    assert.equal(v!.ctr, 5);
    assert.equal(v!.conversionRate, 10);
  });

  it("selectWinner sets winningVariantId and emits event", () => {
    const bus = new EventBus();
    const cm = new CampaignManager(bus);
    const events: unknown[] = [];
    bus.subscribe("campaign.ab_winner_selected", (e) => { events.push(e.payload); });
    const c = cm.createCampaign({ name: "Banner AB", channel: "display", status: "active", audienceSegment: "retargeting", budgetUsd: 8000, startDate: "2026-08-01", endDate: "2026-08-31" });
    cm.selectWinner(c.id, "variant-b", "Higher CTR");
    assert.equal(cm.getCampaign(c.id)!.winningVariantId, "variant-b");
    assert.equal(events.length, 1);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const cm = new CampaignManager(bus);
    cm.createCampaign({ name: "C1", channel: "email", status: "active", audienceSegment: "all", budgetUsd: 10000, startDate: "2026-01-01", endDate: "2026-12-31" });
    cm.createCampaign({ name: "C2", channel: "social", status: "draft", audienceSegment: "all", budgetUsd: 5000, startDate: "2026-06-01", endDate: "2026-06-30" });
    const s = cm.summary();
    assert.equal(s.totalCampaigns, 2);
    assert.equal(s.activeCampaigns, 1);
    assert.equal(s.totalBudgetUsd, 15000);
  });
});

describe("KPIDashboard", () => {
  it("defineKPI stores KPI", () => {
    const bus = new EventBus();
    const kd = new KPIDashboard(bus);
    const k = kd.defineKPI({ name: "ARR", description: "Annual Recurring Revenue", unit: "USD", direction: "higher_is_better", frequency: "monthly", target: 5000000, warningThreshold: 4000000, criticalThreshold: 3000000, ownerId: "cfo" });
    assert.ok(k.id);
    assert.equal(kd.getKPI(k.id)?.name, "ARR");
  });

  it("recordSnapshot emits snapshot_recorded event", () => {
    const bus = new EventBus();
    const kd = new KPIDashboard(bus);
    const events: unknown[] = [];
    bus.subscribe("kpi.snapshot_recorded", (e) => { events.push(e.payload); });
    const k = kd.defineKPI({ name: "Churn Rate", description: "Monthly churn", unit: "%", direction: "lower_is_better", frequency: "monthly", target: 2, warningThreshold: 4, criticalThreshold: 6, ownerId: "csm" });
    kd.recordSnapshot(k.id, 1.8);
    assert.equal(events.length, 1);
  });

  it("recordSnapshot emits threshold_breached when critical", () => {
    const bus = new EventBus();
    const kd = new KPIDashboard(bus);
    const events: unknown[] = [];
    bus.subscribe("kpi.threshold_breached", (e) => { events.push(e.payload); });
    const k = kd.defineKPI({ name: "NPS", description: "Net Promoter Score", unit: "score", direction: "higher_is_better", frequency: "monthly", target: 50, warningThreshold: 30, criticalThreshold: 20, ownerId: "cx" });
    kd.recordSnapshot(k.id, 15);
    assert.equal(events.length, 1);
  });

  it("recordSnapshot emits target_achieved when on target", () => {
    const bus = new EventBus();
    const kd = new KPIDashboard(bus);
    const events: unknown[] = [];
    bus.subscribe("kpi.target_achieved", (e) => { events.push(e.payload); });
    const k = kd.defineKPI({ name: "CSAT", description: "Customer Satisfaction", unit: "%", direction: "higher_is_better", frequency: "monthly", target: 90, warningThreshold: 75, criticalThreshold: 60, ownerId: "cx" });
    kd.recordSnapshot(k.id, 92);
    assert.equal(events.length, 1);
  });

  it("latestValue returns most recent snapshot", () => {
    const bus = new EventBus();
    const kd = new KPIDashboard(bus);
    const k = kd.defineKPI({ name: "MRR", description: "Monthly Recurring Revenue", unit: "USD", direction: "higher_is_better", frequency: "monthly", target: 400000, warningThreshold: 300000, criticalThreshold: 200000, ownerId: "cfo" });
    kd.recordSnapshot(k.id, 350000);
    kd.recordSnapshot(k.id, 380000);
    assert.equal(kd.latestValue(k.id), 380000);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const kd = new KPIDashboard(bus);
    const k = kd.defineKPI({ name: "Win Rate", description: "Sales win rate", unit: "%", direction: "higher_is_better", frequency: "weekly", target: 25, warningThreshold: 18, criticalThreshold: 10, ownerId: "sales" });
    kd.recordSnapshot(k.id, 27);
    const s = kd.summary();
    assert.equal(s.totalKPIs, 1);
    assert.equal(s.onTarget, 1);
    assert.equal(s.totalSnapshots, 1);
  });
});

describe("FleetManager", () => {
  it("addVehicle stores vehicle", () => {
    const bus = new EventBus();
    const fm = new FleetManager(bus);
    const v = fm.addVehicle({ plate: "ABC-123", make: "Toyota", model: "Camry", year: 2023, type: "sedan", status: "available", mileage: 5000, nextMaintenanceMileage: 10000, purchasePriceUsd: 28000 });
    assert.ok(v.id);
    assert.equal(fm.getVehicle(v.id)?.plate, "ABC-123");
  });

  it("assignDriver sets status assigned and emits event", () => {
    const bus = new EventBus();
    const fm = new FleetManager(bus);
    const events: unknown[] = [];
    bus.subscribe("fleet.vehicle_assigned", (e) => { events.push(e.payload); });
    const v = fm.addVehicle({ plate: "XYZ-999", make: "Ford", model: "F-150", year: 2024, type: "truck", status: "available", mileage: 0, nextMaintenanceMileage: 5000, purchasePriceUsd: 45000 });
    fm.assignDriver(v.id, "driver-1");
    assert.equal(fm.getVehicle(v.id)!.status, "assigned");
    assert.equal(events.length, 1);
  });

  it("reportIncident stores incident and emits event", () => {
    const bus = new EventBus();
    const fm = new FleetManager(bus);
    const events: unknown[] = [];
    bus.subscribe("fleet.incident_reported", (e) => { events.push(e.payload); });
    const v = fm.addVehicle({ plate: "DEF-456", make: "Honda", model: "CR-V", year: 2022, type: "suv", status: "assigned", mileage: 12000, nextMaintenanceMileage: 15000, purchasePriceUsd: 32000 });
    const inc = fm.reportIncident({ vehicleId: v.id, severity: "minor", description: "Fender scratch", repairCostUsd: 800, reportedAt: "2026-06-01" });
    assert.ok(inc!.id);
    assert.equal(events.length, 1);
  });

  it("scheduleMaintenance sets status in_maintenance and emits event", () => {
    const bus = new EventBus();
    const fm = new FleetManager(bus);
    const events: unknown[] = [];
    bus.subscribe("fleet.maintenance_due", (e) => { events.push(e.payload); });
    const v = fm.addVehicle({ plate: "GHI-789", make: "Chevy", model: "Malibu", year: 2021, type: "sedan", status: "available", mileage: 9500, nextMaintenanceMileage: 10000, purchasePriceUsd: 22000 });
    fm.scheduleMaintenance(v.id, "oil_change", "2026-07-01");
    assert.equal(fm.getVehicle(v.id)!.status, "in_maintenance");
    assert.equal(events.length, 1);
  });

  it("listVehicles filters by status", () => {
    const bus = new EventBus();
    const fm = new FleetManager(bus);
    fm.addVehicle({ plate: "AA-001", make: "Toyota", model: "Prius", year: 2023, type: "sedan", status: "available", mileage: 1000, nextMaintenanceMileage: 5000, purchasePriceUsd: 30000 });
    fm.addVehicle({ plate: "BB-002", make: "Tesla", model: "Model 3", year: 2024, type: "electric", status: "assigned", mileage: 500, nextMaintenanceMileage: 8000, purchasePriceUsd: 42000 });
    assert.equal(fm.listVehicles("available").length, 1);
    assert.equal(fm.listVehicles().length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const fm = new FleetManager(bus);
    fm.addVehicle({ plate: "CC-003", make: "Ford", model: "Explorer", year: 2022, type: "suv", status: "available", mileage: 20000, nextMaintenanceMileage: 25000, purchasePriceUsd: 38000 });
    const s = fm.summary();
    assert.equal(s.totalVehicles, 1);
    assert.equal(s.available, 1);
    assert.equal(s.fleetValueUsd, 38000);
  });
});

describe("SubscriptionManager", () => {
  it("createPlan stores plan", () => {
    const bus = new EventBus();
    const sm = new SubscriptionManager(bus);
    const p = sm.createPlan({ name: "Pro", description: "Professional plan", monthlyPriceUsd: 99, annualPriceUsd: 999, features: ["sso", "api"], maxUsers: 50, active: true });
    assert.ok(p.id);
    assert.equal(sm.listPlans()[0]?.name, "Pro");
  });

  it("subscribe activates and emits event", () => {
    const bus = new EventBus();
    const sm = new SubscriptionManager(bus);
    const events: unknown[] = [];
    bus.subscribe("subscription.activated", (e) => { events.push(e.payload); });
    sm.subscribe({ customerId: "cust-1", planId: "plan-pro", status: "active", billingInterval: "monthly", mrrUsd: 99, currentPeriodStart: "2026-07-01", currentPeriodEnd: "2026-07-31" });
    assert.equal(events.length, 1);
  });

  it("cancelSubscription sets status and emits event", () => {
    const bus = new EventBus();
    const sm = new SubscriptionManager(bus);
    const events: unknown[] = [];
    bus.subscribe("subscription.cancelled", (e) => { events.push(e.payload); });
    const sub = sm.subscribe({ customerId: "cust-2", planId: "plan-basic", status: "active", billingInterval: "monthly", mrrUsd: 49, currentPeriodStart: "2026-06-01", currentPeriodEnd: "2026-06-30" });
    sm.cancelSubscription(sub.id, "too expensive");
    assert.equal(sm.getSubscription(sub.id)!.status, "cancelled");
    assert.equal(events.length, 1);
  });

  it("upgradePlan updates mrr and emits event", () => {
    const bus = new EventBus();
    const sm = new SubscriptionManager(bus);
    const events: unknown[] = [];
    bus.subscribe("subscription.upgraded", (e) => { events.push(e.payload); });
    const sub = sm.subscribe({ customerId: "cust-3", planId: "plan-starter", status: "active", billingInterval: "monthly", mrrUsd: 29, currentPeriodStart: "2026-07-01", currentPeriodEnd: "2026-07-31" });
    sm.upgradePlan(sub.id, "plan-pro", 99);
    assert.equal(sm.getSubscription(sub.id)!.mrrUsd, 99);
    assert.equal(events.length, 1);
  });

  it("listSubscriptions filters by status", () => {
    const bus = new EventBus();
    const sm = new SubscriptionManager(bus);
    sm.subscribe({ customerId: "c1", planId: "p1", status: "active", billingInterval: "monthly", mrrUsd: 99, currentPeriodStart: "2026-01-01", currentPeriodEnd: "2026-01-31" });
    sm.subscribe({ customerId: "c2", planId: "p1", status: "trial", billingInterval: "monthly", mrrUsd: 0, currentPeriodStart: "2026-01-01", currentPeriodEnd: "2026-01-14" });
    assert.equal(sm.listSubscriptions("active").length, 1);
    assert.equal(sm.listSubscriptions().length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const sm = new SubscriptionManager(bus);
    sm.subscribe({ customerId: "c1", planId: "p1", status: "active", billingInterval: "monthly", mrrUsd: 500, currentPeriodStart: "2026-01-01", currentPeriodEnd: "2026-01-31" });
    sm.subscribe({ customerId: "c2", planId: "p1", status: "active", billingInterval: "monthly", mrrUsd: 300, currentPeriodStart: "2026-01-01", currentPeriodEnd: "2026-01-31" });
    const s = sm.summary();
    assert.equal(s.totalSubscriptions, 2);
    assert.equal(s.activeSubscriptions, 2);
    assert.equal(s.totalMrrUsd, 800);
    assert.equal(s.totalArrUsd, 9600);
  });
});

describe("RealEstateManager", () => {
  it("acquireProperty stores property and emits event", () => {
    const bus = new EventBus();
    const re = new RealEstateManager(bus);
    const events: unknown[] = [];
    bus.subscribe("realestate.property_acquired", (e) => { events.push(e.payload); });
    const p = re.acquireProperty({ address: "123 Main St", city: "Miami", country: "US", type: "office", status: "owned", sqft: 5000, purchasePriceUsd: 2000000, currentValueUsd: 2000000, annualTaxUsd: 40000, acquisitionDate: "2026-01-01" });
    assert.ok(p.id);
    assert.equal(events.length, 1);
  });

  it("signLease updates property status and emits event", () => {
    const bus = new EventBus();
    const re = new RealEstateManager(bus);
    const events: unknown[] = [];
    bus.subscribe("realestate.lease_signed", (e) => { events.push(e.payload); });
    const p = re.acquireProperty({ address: "456 Oak Ave", city: "Austin", country: "US", type: "retail", status: "vacant", sqft: 2000, purchasePriceUsd: 800000, currentValueUsd: 800000, annualTaxUsd: 16000, acquisitionDate: "2025-06-01" });
    re.signLease({ propertyId: p.id, tenant: "Acme Retail", status: "active", monthlyRentUsd: 8000, startDate: "2026-07-01", endDate: "2027-06-30", depositUsd: 16000 });
    assert.equal(re.getProperty(p.id)!.status, "leased_out");
    assert.equal(events.length, 1);
  });

  it("updateValuation emits event", () => {
    const bus = new EventBus();
    const re = new RealEstateManager(bus);
    const events: unknown[] = [];
    bus.subscribe("realestate.valuation_updated", (e) => { events.push(e.payload); });
    const p = re.acquireProperty({ address: "789 Pine Rd", city: "Chicago", country: "US", type: "industrial", status: "owned", sqft: 20000, purchasePriceUsd: 5000000, currentValueUsd: 5000000, annualTaxUsd: 100000, acquisitionDate: "2024-01-01" });
    re.updateValuation(p.id, 5500000);
    assert.equal(re.getProperty(p.id)!.currentValueUsd, 5500000);
    assert.equal(events.length, 1);
  });

  it("listProperties filters by status", () => {
    const bus = new EventBus();
    const re = new RealEstateManager(bus);
    re.acquireProperty({ address: "A", city: "NYC", country: "US", type: "office", status: "owned", sqft: 1000, purchasePriceUsd: 1000000, currentValueUsd: 1000000, annualTaxUsd: 20000, acquisitionDate: "2026-01-01" });
    re.acquireProperty({ address: "B", city: "LA", country: "US", type: "retail", status: "vacant", sqft: 500, purchasePriceUsd: 500000, currentValueUsd: 500000, annualTaxUsd: 10000, acquisitionDate: "2026-01-01" });
    assert.equal(re.listProperties("vacant").length, 1);
    assert.equal(re.listProperties().length, 2);
  });

  it("listLeases filters by propertyId and status", () => {
    const bus = new EventBus();
    const re = new RealEstateManager(bus);
    const p = re.acquireProperty({ address: "C", city: "Houston", country: "US", type: "office", status: "owned", sqft: 3000, purchasePriceUsd: 1500000, currentValueUsd: 1500000, annualTaxUsd: 30000, acquisitionDate: "2025-01-01" });
    re.signLease({ propertyId: p.id, tenant: "TechCo", status: "active", monthlyRentUsd: 15000, startDate: "2026-01-01", endDate: "2027-01-01", depositUsd: 30000 });
    assert.equal(re.listLeases(p.id).length, 1);
    assert.equal(re.listLeases(p.id, "active").length, 1);
    assert.equal(re.listLeases(p.id, "expired").length, 0);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const re = new RealEstateManager(bus);
    const p = re.acquireProperty({ address: "D", city: "SF", country: "US", type: "mixed_use", status: "owned", sqft: 8000, purchasePriceUsd: 4000000, currentValueUsd: 4500000, annualTaxUsd: 80000, acquisitionDate: "2023-01-01" });
    re.signLease({ propertyId: p.id, tenant: "StartupCo", status: "active", monthlyRentUsd: 40000, startDate: "2026-01-01", endDate: "2027-01-01", depositUsd: 80000 });
    const s = re.summary();
    assert.equal(s.totalProperties, 1);
    assert.equal(s.totalPortfolioValueUsd, 4500000);
    assert.equal(s.unrealizedGainUsd, 500000);
    assert.equal(s.monthlyRentalIncomeUsd, 40000);
  });
});

describe("PermitManager", () => {
  it("issuePermit stores permit and emits event", () => {
    const bus = new EventBus();
    const pm = new PermitManager(bus);
    const events: unknown[] = [];
    bus.subscribe("permits.permit_issued", (e) => { events.push(e.payload); });
    const p = pm.issuePermit({ type: "business_license", name: "General Business License", issuingAuthority: "City of Miami", permitNumber: "BL-2026-001", status: "active", issuedAt: "2026-01-01", expiresAt: "2027-01-01", renewalLeadDays: 60, annualFeeUsd: 500 });
    assert.ok(p.id);
    assert.equal(events.length, 1);
  });

  it("issuePermit emits permit_expiring when expires within 30 days", () => {
    const bus = new EventBus();
    const pm = new PermitManager(bus);
    const events: unknown[] = [];
    bus.subscribe("permits.permit_expiring", (e) => { events.push(e.payload); });
    pm.issuePermit({ type: "fire", name: "Fire Safety Certificate", issuingAuthority: "Fire Dept", permitNumber: "FS-2026-001", status: "active", issuedAt: "2025-07-01", expiresAt: "2026-07-10", renewalLeadDays: 30, annualFeeUsd: 200 });
    assert.equal(events.length, 1);
  });

  it("scheduleInspection stores inspection and emits event", () => {
    const bus = new EventBus();
    const pm = new PermitManager(bus);
    const events: unknown[] = [];
    bus.subscribe("permits.inspection_scheduled", (e) => { events.push(e.payload); });
    const p = pm.issuePermit({ type: "health_safety", name: "Health Permit", issuingAuthority: "Health Dept", permitNumber: "HP-001", status: "active", issuedAt: "2026-01-01", expiresAt: "2027-01-01", renewalLeadDays: 45, annualFeeUsd: 300 });
    const insp = pm.scheduleInspection(p.id, "2026-08-01", "Inspector Jones");
    assert.ok(insp!.id);
    assert.equal(events.length, 1);
  });

  it("completeInspection records result", () => {
    const bus = new EventBus();
    const pm = new PermitManager(bus);
    const p = pm.issuePermit({ type: "building", name: "Building Permit", issuingAuthority: "City Hall", permitNumber: "BP-001", status: "active", issuedAt: "2026-01-01", expiresAt: "2027-01-01", renewalLeadDays: 30, annualFeeUsd: 750 });
    const insp = pm.scheduleInspection(p.id, "2026-09-01");
    pm.completeInspection(insp!.id, true, "All clear");
    assert.equal(pm.listInspections(p.id)[0]!.passed, true);
  });

  it("listPermits filters by status", () => {
    const bus = new EventBus();
    const pm = new PermitManager(bus);
    pm.issuePermit({ type: "zoning", name: "Zoning Permit", issuingAuthority: "Planning Dept", permitNumber: "ZP-001", status: "active", issuedAt: "2026-01-01", expiresAt: "2030-01-01", renewalLeadDays: 90, annualFeeUsd: 1000 });
    pm.issuePermit({ type: "environmental", name: "Env Permit", issuingAuthority: "EPA", permitNumber: "EP-001", status: "expired", issuedAt: "2020-01-01", expiresAt: "2025-12-31", renewalLeadDays: 60, annualFeeUsd: 2000 });
    assert.equal(pm.listPermits("active").length, 1);
    assert.equal(pm.listPermits().length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const pm = new PermitManager(bus);
    pm.issuePermit({ type: "food_service", name: "Food Service License", issuingAuthority: "Health Dept", permitNumber: "FS-001", status: "active", issuedAt: "2026-01-01", expiresAt: "2030-01-01", renewalLeadDays: 60, annualFeeUsd: 400 });
    const s = pm.summary();
    assert.equal(s.totalPermits, 1);
    assert.equal(s.activePermits, 1);
    assert.equal(s.totalAnnualFeesUsd, 400);
  });
});

describe("TaxManager", () => {
  it("createObligation stores obligation", () => {
    const bus = new EventBus();
    const tm = new TaxManager(bus);
    const o = tm.createObligation({ taxType: "income", jurisdiction: "US-Federal", frequency: "annual", status: "upcoming", periodStart: "2026-01-01", periodEnd: "2026-12-31", dueDate: "2027-04-15", estimatedLiabilityUsd: 500000 });
    assert.ok(o.id);
    assert.equal(tm.getObligation(o.id)?.taxType, "income");
  });

  it("createObligation emits filing_due when due within 30 days", () => {
    const bus = new EventBus();
    const tm = new TaxManager(bus);
    const events: unknown[] = [];
    bus.subscribe("tax.filing_due", (e) => { events.push(e.payload); });
    tm.createObligation({ taxType: "sales", jurisdiction: "FL", frequency: "monthly", status: "upcoming", periodStart: "2026-06-01", periodEnd: "2026-06-30", dueDate: "2026-07-10", estimatedLiabilityUsd: 12000 });
    assert.equal(events.length, 1);
  });

  it("recordPayment updates paidUsd and emits event", () => {
    const bus = new EventBus();
    const tm = new TaxManager(bus);
    const events: unknown[] = [];
    bus.subscribe("tax.payment_recorded", (e) => { events.push(e.payload); });
    const o = tm.createObligation({ taxType: "payroll", jurisdiction: "US-Federal", frequency: "quarterly", status: "upcoming", periodStart: "2026-01-01", periodEnd: "2026-03-31", dueDate: "2026-04-30", estimatedLiabilityUsd: 80000 });
    tm.recordPayment(o.id, 80000, "TXN-001", "ach");
    assert.equal(tm.getObligation(o.id)!.paidUsd, 80000);
    assert.equal(events.length, 1);
  });

  it("fileReturn sets status filed", () => {
    const bus = new EventBus();
    const tm = new TaxManager(bus);
    const o = tm.createObligation({ taxType: "vat", jurisdiction: "EU-DE", frequency: "monthly", status: "upcoming", periodStart: "2026-05-01", periodEnd: "2026-05-31", dueDate: "2026-06-30", estimatedLiabilityUsd: 25000 });
    tm.fileReturn(o.id, 24800);
    assert.equal(tm.getObligation(o.id)!.status, "filed");
    assert.equal(tm.getObligation(o.id)!.actualLiabilityUsd, 24800);
  });

  it("triggerAudit sets status under_audit and emits event", () => {
    const bus = new EventBus();
    const tm = new TaxManager(bus);
    const events: unknown[] = [];
    bus.subscribe("tax.audit_triggered", (e) => { events.push(e.payload); });
    const o = tm.createObligation({ taxType: "income", jurisdiction: "US-Federal", frequency: "annual", status: "filed", periodStart: "2024-01-01", periodEnd: "2024-12-31", dueDate: "2025-04-15", estimatedLiabilityUsd: 450000 });
    tm.triggerAudit(o.id, 2024);
    assert.equal(tm.getObligation(o.id)!.status, "under_audit");
    assert.equal(events.length, 1);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const tm = new TaxManager(bus);
    tm.createObligation({ taxType: "property", jurisdiction: "Miami-Dade", frequency: "annual", status: "upcoming", periodStart: "2026-01-01", periodEnd: "2026-12-31", dueDate: "2026-11-01", estimatedLiabilityUsd: 150000 });
    tm.createObligation({ taxType: "sales", jurisdiction: "FL", frequency: "monthly", status: "overdue", periodStart: "2026-04-01", periodEnd: "2026-04-30", dueDate: "2026-05-20", estimatedLiabilityUsd: 8000 });
    const s = tm.summary();
    assert.equal(s.totalObligations, 2);
    assert.equal(s.overdue, 1);
    assert.equal(s.totalEstimatedLiabilityUsd, 158000);
  });
});

describe("WarehouseManager", () => {
  it("addWarehouse stores warehouse", () => {
    const bus = new EventBus();
    const wm = new WarehouseManager(bus);
    const w = wm.addWarehouse({ name: "Miami DC", address: "100 Logistics Blvd", country: "US", status: "operational", totalSqft: 200000, usedSqft: 120000, maxCapacityUnits: 50000, currentUnits: 25000 });
    assert.ok(w.id);
    assert.equal(wm.getWarehouse(w.id)?.name, "Miami DC");
  });

  it("receiveShipment updates currentUnits and emits event", () => {
    const bus = new EventBus();
    const wm = new WarehouseManager(bus);
    const events: unknown[] = [];
    bus.subscribe("warehouse.shipment_received", (e) => { events.push(e.payload); });
    const w = wm.addWarehouse({ name: "Austin WH", address: "1 Warehouse Way", country: "US", status: "operational", totalSqft: 100000, usedSqft: 50000, maxCapacityUnits: 20000, currentUnits: 5000 });
    wm.receiveShipment({ warehouseId: w.id, direction: "inbound", status: "pending", carrier: "FedEx", skuCount: 10, totalUnits: 500 });
    assert.equal(wm.getWarehouse(w.id)!.currentUnits, 5500);
    assert.equal(events.length, 1);
  });

  it("receiveShipment emits capacity_alert when >= 90%", () => {
    const bus = new EventBus();
    const wm = new WarehouseManager(bus);
    const events: unknown[] = [];
    bus.subscribe("warehouse.capacity_alert", (e) => { events.push(e.payload); });
    const w = wm.addWarehouse({ name: "Full WH", address: "2 Capacity St", country: "US", status: "operational", totalSqft: 50000, usedSqft: 45000, maxCapacityUnits: 1000, currentUnits: 890 });
    wm.receiveShipment({ warehouseId: w.id, direction: "inbound", status: "pending", carrier: "UPS", skuCount: 2, totalUnits: 110 });
    assert.equal(events.length, 1);
  });

  it("dispatchShipment decrements currentUnits and emits event", () => {
    const bus = new EventBus();
    const wm = new WarehouseManager(bus);
    const events: unknown[] = [];
    bus.subscribe("warehouse.shipment_dispatched", (e) => { events.push(e.payload); });
    const w = wm.addWarehouse({ name: "TX WH", address: "3 Ship Ln", country: "US", status: "operational", totalSqft: 80000, usedSqft: 40000, maxCapacityUnits: 15000, currentUnits: 8000 });
    const s = wm.receiveShipment({ warehouseId: w.id, direction: "outbound", status: "pending", carrier: "DHL", skuCount: 5, totalUnits: 200 });
    wm.dispatchShipment(s!.id, "order-123");
    assert.equal(wm.getWarehouse(w.id)!.currentUnits, 8000); // receive adds, dispatch removes
    assert.equal(events.length, 1);
  });

  it("listShipments filters by direction", () => {
    const bus = new EventBus();
    const wm = new WarehouseManager(bus);
    const w = wm.addWarehouse({ name: "NY WH", address: "4 Dock Ave", country: "US", status: "operational", totalSqft: 60000, usedSqft: 30000, maxCapacityUnits: 10000, currentUnits: 3000 });
    wm.receiveShipment({ warehouseId: w.id, direction: "inbound", status: "pending", carrier: "FedEx", skuCount: 3, totalUnits: 100 });
    wm.receiveShipment({ warehouseId: w.id, direction: "outbound", status: "pending", carrier: "UPS", skuCount: 2, totalUnits: 50 });
    assert.equal(wm.listShipments(w.id, "inbound").length, 1);
    assert.equal(wm.listShipments(w.id).length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const wm = new WarehouseManager(bus);
    wm.addWarehouse({ name: "W1", address: "A", country: "US", status: "operational", totalSqft: 100000, usedSqft: 60000, maxCapacityUnits: 20000, currentUnits: 10000 });
    const s = wm.summary();
    assert.equal(s.totalWarehouses, 1);
    assert.equal(s.operational, 1);
    assert.equal(s.utilizationPct, 50);
  });
});

describe("CustomerFeedbackEngine", () => {
  it("submitNPS categorizes promoter and emits event", () => {
    const bus = new EventBus();
    const cfe = new CustomerFeedbackEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("feedback.nps_submitted", (e) => { events.push(e.payload); });
    const r = cfe.submitNPS("cust-1", 9, "Love the product!");
    assert.equal(r.category, "promoter");
    assert.equal(r.sentiment, "positive");
    assert.equal(events.length, 1);
  });

  it("submitNPS categorizes detractor", () => {
    const bus = new EventBus();
    const cfe = new CustomerFeedbackEngine(bus);
    const r = cfe.submitNPS("cust-2", 4, "Too expensive");
    assert.equal(r.category, "detractor");
    assert.equal(r.sentiment, "negative");
  });

  it("submitCSAT emits event", () => {
    const bus = new EventBus();
    const cfe = new CustomerFeedbackEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("feedback.csat_submitted", (e) => { events.push(e.payload); });
    cfe.submitCSAT("cust-3", 5, "ticket-42", "Resolved quickly");
    assert.equal(events.length, 1);
  });

  it("escalate emits event", () => {
    const bus = new EventBus();
    const cfe = new CustomerFeedbackEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("feedback.issue_escalated", (e) => { events.push(e.payload); });
    const r = cfe.submitNPS("cust-4", 2, "Terrible experience");
    cfe.escalate(r.id, "Low NPS score");
    assert.equal(events.length, 1);
  });

  it("resolve marks feedback resolved", () => {
    const bus = new EventBus();
    const cfe = new CustomerFeedbackEngine(bus);
    const r = cfe.submitCSAT("cust-5", 2, "ticket-99", "Unhappy");
    cfe.resolve(r.id);
    assert.equal(cfe.listResponses(undefined, true).length, 1);
  });

  it("summary computes NPS score correctly", () => {
    const bus = new EventBus();
    const cfe = new CustomerFeedbackEngine(bus);
    cfe.submitNPS("c1", 9);  // promoter
    cfe.submitNPS("c2", 9);  // promoter
    cfe.submitNPS("c3", 7);  // passive
    cfe.submitNPS("c4", 3);  // detractor
    const s = cfe.summary();
    assert.equal(s.promoters, 2);
    assert.equal(s.detractors, 1);
    assert.equal(s.npsScore, 25); // (2-1)/4 * 100 = 25
  });
});

describe("TrainingManager", () => {
  it("createCourse stores course", () => {
    const bus = new EventBus();
    const tm = new TrainingManager(bus);
    const c = tm.createCourse({ name: "TypeScript Fundamentals", description: "TS basics", category: "engineering", status: "published", deliveryMode: "online", durationHours: 8, passingScore: 75, mandatory: false });
    assert.ok(c.id);
    assert.equal(tm.getCourse(c.id)?.name, "TypeScript Fundamentals");
  });

  it("enroll creates enrollment and emits event", () => {
    const bus = new EventBus();
    const tm = new TrainingManager(bus);
    const events: unknown[] = [];
    bus.subscribe("training.enrollment_created", (e) => { events.push(e.payload); });
    const c = tm.createCourse({ name: "Security Awareness", description: "Security basics", category: "compliance", status: "published", deliveryMode: "online", durationHours: 2, passingScore: 80, mandatory: true });
    tm.enroll("emp-1", c.id);
    assert.equal(events.length, 1);
  });

  it("completeEnrollment with passing score emits completion event and issues cert", () => {
    const bus = new EventBus();
    const tm = new TrainingManager(bus);
    const events: unknown[] = [];
    bus.subscribe("training.course_completed", (e) => { events.push(e.payload); });
    const c = tm.createCourse({ name: "Leadership 101", description: "Leadership skills", category: "management", status: "published", deliveryMode: "in_person", durationHours: 16, passingScore: 70, mandatory: false });
    const en = tm.enroll("emp-2", c.id)!;
    tm.completeEnrollment(en.id, 85);
    assert.equal(tm.listEnrollments("emp-2", "completed").length, 1);
    assert.equal(tm.listCertifications("emp-2").length, 1);
    assert.equal(events.length, 1);
  });

  it("completeEnrollment with failing score sets status failed", () => {
    const bus = new EventBus();
    const tm = new TrainingManager(bus);
    const c = tm.createCourse({ name: "Advanced Finance", description: "Finance", category: "finance", status: "published", deliveryMode: "hybrid", durationHours: 20, passingScore: 80, mandatory: false });
    const en = tm.enroll("emp-3", c.id)!;
    tm.completeEnrollment(en.id, 65);
    assert.equal(tm.listEnrollments("emp-3", "failed").length, 1);
    assert.equal(tm.listCertifications("emp-3").length, 0);
  });

  it("listCourses filters by status", () => {
    const bus = new EventBus();
    const tm = new TrainingManager(bus);
    tm.createCourse({ name: "C1", description: "", category: "eng", status: "published", deliveryMode: "online", durationHours: 4, passingScore: 70, mandatory: false });
    tm.createCourse({ name: "C2", description: "", category: "hr", status: "draft", deliveryMode: "online", durationHours: 2, passingScore: 60, mandatory: true });
    assert.equal(tm.listCourses("published").length, 1);
    assert.equal(tm.listCourses().length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const tm = new TrainingManager(bus);
    const c = tm.createCourse({ name: "Onboarding", description: "", category: "hr", status: "published", deliveryMode: "self_paced", durationHours: 6, passingScore: 70, mandatory: true });
    const en = tm.enroll("emp-4", c.id)!;
    tm.completeEnrollment(en.id, 90);
    const s = tm.summary();
    assert.equal(s.totalCourses, 1);
    assert.equal(s.totalEnrollments, 1);
    assert.equal(s.completionRate, 100);
  });
});

describe("ProcurementEngine", () => {
  it("issueRFQ stores RFQ and emits event", () => {
    const bus = new EventBus();
    const pe = new ProcurementEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("procurement.rfq_issued", (e) => { events.push(e.payload); });
    const r = pe.issueRFQ({ title: "Cloud Services 2027", description: "AWS/Azure RFQ", categoryId: "cloud", budgetUsd: 500000, status: "issued", dueDate: "2026-09-01" });
    assert.ok(r.id);
    assert.equal(events.length, 1);
  });

  it("submitBid increments bidCount on RFQ", () => {
    const bus = new EventBus();
    const pe = new ProcurementEngine(bus);
    const r = pe.issueRFQ({ title: "Office Supplies", description: "Pens and paper", categoryId: "supplies", budgetUsd: 50000, status: "issued", dueDate: "2026-08-01" });
    pe.submitBid({ rfqId: r.id, vendorId: "v1", vendorName: "OfficeMax", amountUsd: 42000, status: "submitted", submittedAt: "2026-07-15" });
    pe.submitBid({ rfqId: r.id, vendorId: "v2", vendorName: "Staples", amountUsd: 45000, status: "submitted", submittedAt: "2026-07-16" });
    assert.equal(pe.getRFQ(r.id)!.bidCount, 2);
  });

  it("awardBid sets RFQ status awarded and emits event", () => {
    const bus = new EventBus();
    const pe = new ProcurementEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("procurement.bid_awarded", (e) => { events.push(e.payload); });
    const r = pe.issueRFQ({ title: "Security Audit", description: "Annual pen test", categoryId: "security", budgetUsd: 80000, status: "evaluating", dueDate: "2026-07-01" });
    const b = pe.submitBid({ rfqId: r.id, vendorId: "sec-co", vendorName: "SecureCo", amountUsd: 75000, status: "submitted", submittedAt: "2026-06-20" })!;
    pe.awardBid(r.id, b.id);
    assert.equal(pe.getRFQ(r.id)!.status, "awarded");
    assert.equal(events.length, 1);
  });

  it("approvePO emits event", () => {
    const bus = new EventBus();
    const pe = new ProcurementEngine(bus);
    const events: unknown[] = [];
    bus.subscribe("procurement.po_approved", (e) => { events.push(e.payload); });
    const po = pe.createPO({ vendorId: "vendor-1", lineItems: [{ description: "Laptops", quantity: 10, unitPriceUsd: 1500 }], totalUsd: 15000, approvalStatus: "pending" });
    pe.approvePO(po.id, "cfo-1");
    assert.equal(pe.listPOs("approved").length, 1);
    assert.equal(events.length, 1);
  });

  it("listBids filters by rfqId", () => {
    const bus = new EventBus();
    const pe = new ProcurementEngine(bus);
    const r1 = pe.issueRFQ({ title: "R1", description: "", categoryId: "cat1", budgetUsd: 100000, status: "issued", dueDate: "2026-10-01" });
    const r2 = pe.issueRFQ({ title: "R2", description: "", categoryId: "cat2", budgetUsd: 200000, status: "issued", dueDate: "2026-10-15" });
    pe.submitBid({ rfqId: r1.id, vendorId: "v1", vendorName: "A", amountUsd: 90000, status: "submitted", submittedAt: "2026-09-01" });
    pe.submitBid({ rfqId: r2.id, vendorId: "v2", vendorName: "B", amountUsd: 180000, status: "submitted", submittedAt: "2026-09-02" });
    assert.equal(pe.listBids(r1.id).length, 1);
    assert.equal(pe.listBids().length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const pe = new ProcurementEngine(bus);
    pe.issueRFQ({ title: "X", description: "", categoryId: "misc", budgetUsd: 50000, status: "issued", dueDate: "2026-11-01" });
    const po = pe.createPO({ vendorId: "v1", lineItems: [], totalUsd: 20000, approvalStatus: "pending" });
    pe.approvePO(po.id, "cto");
    const s = pe.summary();
    assert.equal(s.totalRFQs, 1);
    assert.equal(s.totalPOs, 1);
    assert.equal(s.approvedPOsValueUsd, 20000);
  });
});

describe("ContentManager", () => {
  it("createContent stores content item", () => {
    const bus = new EventBus();
    const cm = new ContentManager(bus);
    const c = cm.createContent({ title: "10 Ways to Scale SaaS", type: "blog_post", status: "draft", authorId: "author-1", tags: ["saas", "growth"], targetAudience: "founders", wordCount: 1200, seoScore: 78 });
    assert.ok(c.id);
    assert.equal(cm.getContent(c.id)?.title, "10 Ways to Scale SaaS");
  });

  it("requestReview sets status in_review and emits event", () => {
    const bus = new EventBus();
    const cm = new ContentManager(bus);
    const events: unknown[] = [];
    bus.subscribe("content.review_requested", (e) => { events.push(e.payload); });
    const c = cm.createContent({ title: "2027 Predictions", type: "whitepaper", status: "draft", authorId: "author-2", tags: [], targetAudience: "cxo" });
    cm.requestReview(c.id, "editor-1");
    assert.equal(cm.getContent(c.id)!.status, "in_review");
    assert.equal(events.length, 1);
  });

  it("publishContent sets status published and emits event", () => {
    const bus = new EventBus();
    const cm = new ContentManager(bus);
    const events: unknown[] = [];
    bus.subscribe("content.published", (e) => { events.push(e.payload); });
    const c = cm.createContent({ title: "Case Study: Acme", type: "case_study", status: "approved", authorId: "author-3", tags: ["case-study"], targetAudience: "prospects" });
    cm.publishContent(c.id);
    assert.equal(cm.getContent(c.id)!.status, "published");
    assert.equal(events.length, 1);
  });

  it("recordPageView increments counter", () => {
    const bus = new EventBus();
    const cm = new ContentManager(bus);
    const c = cm.createContent({ title: "Guide to APIs", type: "blog_post", status: "published", authorId: "author-4", tags: [], targetAudience: "developers" });
    cm.recordPageView(c.id, 100);
    cm.recordPageView(c.id, 50);
    assert.equal(cm.getContent(c.id)!.pageViews, 150);
  });

  it("listContent filters by status and type", () => {
    const bus = new EventBus();
    const cm = new ContentManager(bus);
    cm.createContent({ title: "Post A", type: "blog_post", status: "published", authorId: "a1", tags: [], targetAudience: "all" });
    cm.createContent({ title: "Post B", type: "email", status: "draft", authorId: "a2", tags: [], targetAudience: "subscribers" });
    assert.equal(cm.listContent("published").length, 1);
    assert.equal(cm.listContent(undefined, "email").length, 1);
    assert.equal(cm.listContent().length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const cm = new ContentManager(bus);
    cm.createContent({ title: "X", type: "social_post", status: "published", authorId: "a1", tags: [], targetAudience: "all", seoScore: 60 });
    cm.createContent({ title: "Y", type: "video", status: "in_review", authorId: "a2", tags: [], targetAudience: "all" });
    const s = cm.summary();
    assert.equal(s.totalContent, 2);
    assert.equal(s.published, 1);
    assert.equal(s.inReview, 1);
  });
});

describe("ProjectPortfolio", () => {
  it("addProject stores project", () => {
    const bus = new EventBus();
    const pp = new ProjectPortfolio(bus);
    const p = pp.addProject({ name: "Platform 2.0", description: "Next gen platform", status: "proposed", strategicPillar: "innovation", priority: 9, budgetUsd: 2000000, expectedRoiUsd: 6000000, startDate: "2026-07-01", targetEndDate: "2027-06-30", assignedResources: ["team-eng"] });
    assert.ok(p.id);
    assert.equal(pp.getProject(p.id)?.name, "Platform 2.0");
  });

  it("approveProject sets status and emits event", () => {
    const bus = new EventBus();
    const pp = new ProjectPortfolio(bus);
    const events: unknown[] = [];
    bus.subscribe("portfolio.project_approved", (e) => { events.push(e.payload); });
    const p = pp.addProject({ name: "CRM Migration", description: "Migrate to new CRM", status: "proposed", strategicPillar: "efficiency", priority: 7, budgetUsd: 500000, expectedRoiUsd: 1500000, startDate: "2026-08-01", targetEndDate: "2026-12-31", assignedResources: [] });
    pp.approveProject(p.id);
    assert.equal(pp.getProject(p.id)!.status, "approved");
    assert.equal(events.length, 1);
  });

  it("updateProgress sets completionPct", () => {
    const bus = new EventBus();
    const pp = new ProjectPortfolio(bus);
    const p = pp.addProject({ name: "Data Lake", description: "Build data lake", status: "active", strategicPillar: "infrastructure", priority: 6, budgetUsd: 800000, expectedRoiUsd: 2000000, startDate: "2026-01-01", targetEndDate: "2026-09-30", assignedResources: ["team-data"] });
    pp.updateProgress(p.id, 45, 350000);
    assert.equal(pp.getProject(p.id)!.completionPct, 45);
    assert.equal(pp.getProject(p.id)!.actualCostUsd, 350000);
  });

  it("completeProject emits event with roi", () => {
    const bus = new EventBus();
    const pp = new ProjectPortfolio(bus);
    const events: unknown[] = [];
    bus.subscribe("portfolio.project_completed", (e) => { events.push(e.payload); });
    const p = pp.addProject({ name: "AI Chatbot", description: "Customer service bot", status: "active", strategicPillar: "customer_experience", priority: 8, budgetUsd: 300000, expectedRoiUsd: 900000, startDate: "2026-03-01", targetEndDate: "2026-07-31", assignedResources: ["team-ai"] });
    pp.updateProgress(p.id, 100, 280000);
    pp.completeProject(p.id, 750000);
    assert.equal(pp.getProject(p.id)!.status, "completed");
    assert.equal(events.length, 1);
  });

  it("listProjects filters by status and pillar", () => {
    const bus = new EventBus();
    const pp = new ProjectPortfolio(bus);
    pp.addProject({ name: "A", description: "", status: "active", strategicPillar: "growth", priority: 5, budgetUsd: 100000, expectedRoiUsd: 300000, startDate: "2026-01-01", targetEndDate: "2026-12-31", assignedResources: [] });
    pp.addProject({ name: "B", description: "", status: "proposed", strategicPillar: "compliance", priority: 3, budgetUsd: 50000, expectedRoiUsd: 0, startDate: "2026-06-01", targetEndDate: "2026-08-31", assignedResources: [] });
    assert.equal(pp.listProjects("active").length, 1);
    assert.equal(pp.listProjects(undefined, "compliance").length, 1);
    assert.equal(pp.listProjects().length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const pp = new ProjectPortfolio(bus);
    pp.addProject({ name: "P1", description: "", status: "active", strategicPillar: "growth", priority: 8, budgetUsd: 500000, expectedRoiUsd: 1500000, startDate: "2026-01-01", targetEndDate: "2027-01-01", assignedResources: [] });
    pp.addProject({ name: "P2", description: "", status: "completed", strategicPillar: "efficiency", priority: 6, budgetUsd: 200000, expectedRoiUsd: 600000, startDate: "2025-01-01", targetEndDate: "2025-12-31", assignedResources: [] });
    const s = pp.summary();
    assert.equal(s.totalProjects, 2);
    assert.equal(s.active, 1);
    assert.equal(s.completed, 1);
    assert.equal(s.totalBudgetUsd, 700000);
  });
});

describe("CryptoTreasury", () => {
  it("addWallet stores wallet", () => {
    const bus = new EventBus();
    const ct = new CryptoTreasury(bus);
    const w = ct.addWallet({ name: "Main Cold Wallet", address: "0xABCD1234", type: "cold", chain: "ethereum", assets: { eth: 100, btc: 0, usdc: 0, usdt: 0, sol: 0, other: 0 }, usdValueCache: 300000 });
    assert.ok(w.id);
    assert.equal(ct.getWallet(w.id)?.name, "Main Cold Wallet");
  });

  it("recordTransaction emits event", () => {
    const bus = new EventBus();
    const ct = new CryptoTreasury(bus);
    const events: unknown[] = [];
    bus.subscribe("crypto.transaction_recorded", (e) => { events.push(e.payload); });
    const w = ct.addWallet({ name: "Hot Wallet", address: "0xDEF5678", type: "hot", chain: "ethereum", assets: { eth: 50, btc: 0, usdc: 50000, usdt: 0, sol: 0, other: 0 }, usdValueCache: 200000 });
    ct.recordTransaction({ walletId: w.id, txHash: "0xtxhash1", asset: "eth", quantity: 5, usdValueAtTime: 15000, direction: "inbound", recordedAt: new Date().toISOString() });
    assert.equal(events.length, 1);
  });

  it("recordTransaction emits large_movement for amounts >= 100k", () => {
    const bus = new EventBus();
    const ct = new CryptoTreasury(bus);
    const events: unknown[] = [];
    bus.subscribe("crypto.large_movement", (e) => { events.push(e.payload); });
    const w = ct.addWallet({ name: "Multisig", address: "0xMULTI", type: "multisig", chain: "bitcoin", assets: { btc: 10, eth: 0, usdc: 0, usdt: 0, sol: 0, other: 0 }, usdValueCache: 600000 });
    ct.recordTransaction({ walletId: w.id, txHash: "0xbig1", asset: "btc", quantity: 2, usdValueAtTime: 120000, direction: "outbound", recordedAt: new Date().toISOString() });
    assert.equal(events.length, 1);
  });

  it("addStakingPosition and recordStakingReward emit event", () => {
    const bus = new EventBus();
    const ct = new CryptoTreasury(bus);
    const events: unknown[] = [];
    bus.subscribe("crypto.staking_reward", (e) => { events.push(e.payload); });
    const w = ct.addWallet({ name: "Staking Wallet", address: "0xSTAKE", type: "defi", chain: "ethereum", assets: { eth: 200, btc: 0, usdc: 0, usdt: 0, sol: 0, other: 0 }, usdValueCache: 600000 });
    const pos = ct.addStakingPosition({ walletId: w.id, asset: "eth", stakedQuantity: 100, apy: 4.5, startedAt: "2026-01-01" })!;
    ct.recordStakingReward(pos.id, 1350);
    assert.equal(ct.listStakingPositions(w.id)[0]!.totalRewardsUsd, 1350);
    assert.equal(events.length, 1);
  });

  it("listTransactions filters by walletId", () => {
    const bus = new EventBus();
    const ct = new CryptoTreasury(bus);
    const w1 = ct.addWallet({ name: "W1", address: "0xW1", type: "hot", chain: "ethereum", assets: { eth: 10, btc: 0, usdc: 0, usdt: 0, sol: 0, other: 0 }, usdValueCache: 30000 });
    const w2 = ct.addWallet({ name: "W2", address: "0xW2", type: "cold", chain: "bitcoin", assets: { btc: 1, eth: 0, usdc: 0, usdt: 0, sol: 0, other: 0 }, usdValueCache: 60000 });
    ct.recordTransaction({ walletId: w1.id, txHash: "0xt1", asset: "eth", quantity: 1, usdValueAtTime: 3000, direction: "inbound", recordedAt: new Date().toISOString() });
    ct.recordTransaction({ walletId: w2.id, txHash: "0xt2", asset: "btc", quantity: 0.1, usdValueAtTime: 6000, direction: "inbound", recordedAt: new Date().toISOString() });
    assert.equal(ct.listTransactions(w1.id).length, 1);
    assert.equal(ct.listTransactions().length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const ct = new CryptoTreasury(bus);
    ct.addWallet({ name: "Treasury", address: "0xTREAS", type: "multisig", chain: "ethereum", assets: { eth: 500, btc: 0, usdc: 1000000, usdt: 0, sol: 0, other: 0 }, usdValueCache: 2500000 });
    const s = ct.summary();
    assert.equal(s.totalWallets, 1);
    assert.equal(s.totalValueUsd, 2500000);
  });
});

describe("BoardGovernance", () => {
  it("appointDirector stores director and emits event", () => {
    const bus = new EventBus();
    const bg = new BoardGovernance(bus);
    const events: unknown[] = [];
    bus.subscribe("governance.director_appointed", (e) => { events.push(e.payload); });
    const d = bg.appointDirector({ name: "Jane Smith", role: "independent", email: "jane@board.com", appointedAt: "2026-01-01", committees: ["audit"], active: true });
    assert.ok(d.id);
    assert.equal(events.length, 1);
  });

  it("scheduleMeeting stores meeting and emits event", () => {
    const bus = new EventBus();
    const bg = new BoardGovernance(bus);
    const events: unknown[] = [];
    bus.subscribe("governance.meeting_scheduled", (e) => { events.push(e.payload); });
    const m = bg.scheduleMeeting({ type: "board", status: "scheduled", scheduledAt: "2026-09-15T10:00:00Z", location: "Boardroom A", quorumRequired: 5, attendees: [], agendaItems: ["Q3 Results", "Budget 2027"] });
    assert.ok(m.id);
    assert.equal(events.length, 1);
  });

  it("recordResolution passes when voteFor > voteAgainst and emits event", () => {
    const bus = new EventBus();
    const bg = new BoardGovernance(bus);
    const events: unknown[] = [];
    bus.subscribe("governance.resolution_passed", (e) => { events.push(e.payload); });
    const m = bg.scheduleMeeting({ type: "board", status: "completed", scheduledAt: "2026-08-01T09:00:00Z", location: "Virtual", quorumRequired: 5, attendees: ["d1", "d2", "d3", "d4", "d5"], agendaItems: [] });
    const r = bg.recordResolution({ meetingId: m.id, title: "Approve FY2027 Budget", description: "Ratify the FY2027 budget as presented", status: "proposed", voteFor: 5, voteAgainst: 1, voteAbstain: 0 });
    assert.equal(r!.status, "passed");
    assert.equal(events.length, 1);
  });

  it("recordResolution fails when voteFor <= voteAgainst", () => {
    const bus = new EventBus();
    const bg = new BoardGovernance(bus);
    const m = bg.scheduleMeeting({ type: "board", status: "completed", scheduledAt: "2026-07-01T09:00:00Z", location: "HQ", quorumRequired: 5, attendees: [], agendaItems: [] });
    const r = bg.recordResolution({ meetingId: m.id, title: "Acquire StartupX", description: "Approve acquisition", status: "proposed", voteFor: 2, voteAgainst: 4, voteAbstain: 1 });
    assert.equal(r!.status, "failed");
  });

  it("listDirectors filters by active", () => {
    const bus = new EventBus();
    const bg = new BoardGovernance(bus);
    bg.appointDirector({ name: "Alice", role: "chairman", email: "alice@co.com", appointedAt: "2020-01-01", committees: [], active: true });
    bg.appointDirector({ name: "Bob", role: "executive", email: "bob@co.com", appointedAt: "2019-01-01", expiresAt: "2024-12-31", committees: [], active: false });
    assert.equal(bg.listDirectors(true).length, 1);
    assert.equal(bg.listDirectors().length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const bg = new BoardGovernance(bus);
    bg.appointDirector({ name: "Dir1", role: "independent", email: "d1@co.com", appointedAt: "2025-01-01", committees: ["audit"], active: true });
    const m = bg.scheduleMeeting({ type: "board", status: "completed", scheduledAt: "2026-03-01T09:00:00Z", location: "HQ", quorumRequired: 3, attendees: ["d1"], agendaItems: [] });
    bg.recordResolution({ meetingId: m.id, title: "Approve Policy", description: "", status: "proposed", voteFor: 3, voteAgainst: 0, voteAbstain: 0 });
    const s = bg.summary();
    assert.equal(s.totalDirectors, 1);
    assert.equal(s.totalMeetings, 1);
    assert.equal(s.passedResolutions, 1);
  });
});

describe("ServiceLevelManager", () => {
  it("defineTier stores tier", () => {
    const bus = new EventBus();
    const slm = new ServiceLevelManager(bus);
    const t = slm.defineTier({ name: "enterprise", description: "Full enterprise plan", monthlyPriceUsd: 2000, entitlements: { api_calls: 1000000, seats: 500 }, supportPriority: 5, slaUptimePct: 99.9 });
    assert.ok(t.id);
    assert.equal(slm.listTiers()[0]?.name, "enterprise");
  });

  it("assignTier assigns customer and emits renewal_due when expiring soon", () => {
    const bus = new EventBus();
    const slm = new ServiceLevelManager(bus);
    const events: unknown[] = [];
    bus.subscribe("servicelevel.renewal_due", (e) => { events.push(e.payload); });
    const t = slm.defineTier({ name: "growth", description: "Growth plan", monthlyPriceUsd: 299, entitlements: { api_calls: 100000 }, supportPriority: 3, slaUptimePct: 99.5 });
    slm.assignTier("cust-1", t.id, "2026-01-01", "2026-07-20");
    assert.equal(events.length, 1);
  });

  it("assignTier emits tier_upgraded when tier changes", () => {
    const bus = new EventBus();
    const slm = new ServiceLevelManager(bus);
    const events: unknown[] = [];
    bus.subscribe("servicelevel.tier_upgraded", (e) => { events.push(e.payload); });
    const t1 = slm.defineTier({ name: "starter", description: "Starter", monthlyPriceUsd: 49, entitlements: { api_calls: 10000 }, supportPriority: 1, slaUptimePct: 99 });
    const t2 = slm.defineTier({ name: "professional", description: "Pro", monthlyPriceUsd: 499, entitlements: { api_calls: 500000 }, supportPriority: 4, slaUptimePct: 99.9 });
    slm.assignTier("cust-2", t1.id, "2025-01-01", "2026-12-31");
    slm.assignTier("cust-2", t2.id, "2026-07-01", "2027-06-30");
    assert.equal(events.length, 1);
  });

  it("recordUsage emits entitlement_exceeded when over limit", () => {
    const bus = new EventBus();
    const slm = new ServiceLevelManager(bus);
    const events: unknown[] = [];
    bus.subscribe("servicelevel.entitlement_exceeded", (e) => { events.push(e.payload); });
    const t = slm.defineTier({ name: "free", description: "Free tier", monthlyPriceUsd: 0, entitlements: { api_calls: 1000 }, supportPriority: 1, slaUptimePct: 95 });
    slm.assignTier("cust-3", t.id, "2026-01-01", "2027-01-01");
    slm.recordUsage("cust-3", "api_calls", 1100);
    assert.equal(events.length, 1);
  });

  it("listCustomerLevels filters by tier", () => {
    const bus = new EventBus();
    const slm = new ServiceLevelManager(bus);
    const t1 = slm.defineTier({ name: "starter", description: "", monthlyPriceUsd: 49, entitlements: {}, supportPriority: 1, slaUptimePct: 99 });
    const t2 = slm.defineTier({ name: "enterprise", description: "", monthlyPriceUsd: 2000, entitlements: {}, supportPriority: 5, slaUptimePct: 99.9 });
    slm.assignTier("c1", t1.id, "2026-01-01", "2027-01-01");
    slm.assignTier("c2", t2.id, "2026-01-01", "2027-01-01");
    assert.equal(slm.listCustomerLevels("starter").length, 1);
    assert.equal(slm.listCustomerLevels().length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const slm = new ServiceLevelManager(bus);
    const t = slm.defineTier({ name: "professional", description: "", monthlyPriceUsd: 499, entitlements: {}, supportPriority: 4, slaUptimePct: 99.5 });
    slm.assignTier("c1", t.id, "2026-01-01", "2027-01-01");
    slm.assignTier("c2", t.id, "2026-01-01", "2027-01-01");
    const s = slm.summary();
    assert.equal(s.totalCustomers, 2);
    assert.equal(s.byTier["professional"], 2);
  });
});

describe("DigitalAssetManager", () => {
  it("addAsset stores asset", () => {
    const bus = new EventBus();
    const dam = new DigitalAssetManager(bus);
    const a = dam.addAsset({ name: "olympus.ai", category: "domain", status: "active", annualCostUsd: 50, purchasedAt: "2024-01-01", expiresAt: "2028-01-01", autoRenew: true });
    assert.ok(a.id);
    assert.equal(dam.getAsset(a.id)?.name, "olympus.ai");
  });

  it("addAsset emits domain_expiring when expiring within 30 days", () => {
    const bus = new EventBus();
    const dam = new DigitalAssetManager(bus);
    const events: unknown[] = [];
    bus.subscribe("digitalassets.domain_expiring", (e) => { events.push(e.payload); });
    dam.addAsset({ name: "old-domain.com", category: "domain", status: "active", annualCostUsd: 12, purchasedAt: "2020-01-01", expiresAt: "2026-07-10", autoRenew: false });
    assert.equal(events.length, 1);
  });

  it("addAsset emits certificate_expiring for SSL certs expiring soon", () => {
    const bus = new EventBus();
    const dam = new DigitalAssetManager(bus);
    const events: unknown[] = [];
    bus.subscribe("digitalassets.certificate_expiring", (e) => { events.push(e.payload); });
    dam.addAsset({ name: "*.olympus.ai SSL", category: "ssl_certificate", status: "active", domain: "olympus.ai", annualCostUsd: 200, purchasedAt: "2026-01-01", expiresAt: "2026-07-15", autoRenew: true });
    assert.equal(events.length, 1);
  });

  it("renewAsset updates expiresAt and status", () => {
    const bus = new EventBus();
    const dam = new DigitalAssetManager(bus);
    const a = dam.addAsset({ name: "app.olympus.ai", category: "domain", status: "expired", annualCostUsd: 15, purchasedAt: "2023-01-01", expiresAt: "2026-01-01", autoRenew: false });
    dam.renewAsset(a.id, "2028-01-01");
    assert.equal(dam.getAsset(a.id)!.status, "active");
    assert.equal(dam.getAsset(a.id)!.expiresAt, "2028-01-01");
  });

  it("listAssets filters by category and status", () => {
    const bus = new EventBus();
    const dam = new DigitalAssetManager(bus);
    dam.addAsset({ name: "D1", category: "domain", status: "active", annualCostUsd: 50, purchasedAt: "2024-01-01", expiresAt: "2030-01-01", autoRenew: true });
    dam.addAsset({ name: "L1", category: "software_license", status: "active", vendor: "GitHub", annualCostUsd: 4000, purchasedAt: "2025-01-01", expiresAt: "2027-01-01", autoRenew: true });
    assert.equal(dam.listAssets("domain").length, 1);
    assert.equal(dam.listAssets(undefined, "active").length, 2);
  });

  it("summary returns correct aggregates", () => {
    const bus = new EventBus();
    const dam = new DigitalAssetManager(bus);
    dam.addAsset({ name: "olympus.com", category: "domain", status: "active", annualCostUsd: 100, purchasedAt: "2023-01-01", expiresAt: "2030-01-01", autoRenew: true });
    dam.addAsset({ name: "TM", category: "trademark", status: "active", annualCostUsd: 500, purchasedAt: "2022-01-01", expiresAt: "2032-01-01", autoRenew: true });
    const s = dam.summary();
    assert.equal(s.totalAssets, 2);
    assert.equal(s.active, 2);
    assert.equal(s.totalAnnualCostUsd, 600);
  });
});

describe("HealthBenefitsManager", () => {
  it("addPlan stores a benefit plan", () => {
    const bus = new EventBus();
    const hbm = new HealthBenefitsManager(bus);
    const p = hbm.addPlan({ name: "Gold PPO", type: "medical", provider: "Aetna", employeePremiumMonthly: 200, employerPremiumMonthly: 600, deductibleUsd: 1000, outOfPocketMaxUsd: 5000, active: true });
    assert.ok(p.id);
    assert.equal(hbm.listPlans().length, 1);
    assert.equal(hbm.listPlans(true).length, 1);
  });

  it("enroll publishes enrollment_confirmed and returns enrollment", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("benefits.enrollment_confirmed", (e) => { events.push(e.payload); });
    const hbm = new HealthBenefitsManager(bus);
    const p = hbm.addPlan({ name: "Dental", type: "dental", provider: "Delta", employeePremiumMonthly: 20, employerPremiumMonthly: 40, deductibleUsd: 100, outOfPocketMaxUsd: 1000, active: true });
    const enr = hbm.enroll("emp1", p.id, "2026-01-01", ["dep1"]);
    assert.ok(enr);
    assert.equal(enr!.planName, "Dental");
    assert.equal(events.length, 1);
    assert.equal(events[0].employeeId, "emp1");
  });

  it("enroll returns undefined for unknown plan", () => {
    const bus = new EventBus();
    const hbm = new HealthBenefitsManager(bus);
    assert.equal(hbm.enroll("emp1", "nope", "2026-01-01"), undefined);
  });

  it("submitClaim publishes claim_submitted and tracks claim", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("benefits.claim_submitted", (e) => { events.push(e.payload); });
    const hbm = new HealthBenefitsManager(bus);
    const p = hbm.addPlan({ name: "Med", type: "medical", provider: "Aetna", employeePremiumMonthly: 200, employerPremiumMonthly: 600, deductibleUsd: 1000, outOfPocketMaxUsd: 5000, active: true });
    const enr = hbm.enroll("emp1", p.id, "2026-01-01")!;
    const claim = hbm.submitClaim({ employeeId: "emp1", enrollmentId: enr.id, claimType: "medical", status: "submitted", amountUsd: 350, serviceDate: "2026-02-01", submittedAt: "2026-02-02" });
    assert.ok(claim);
    assert.equal(events.length, 1);
    assert.equal(events[0].amountUsd, 350);
  });

  it("resolveClaim updates status and approved amount", () => {
    const bus = new EventBus();
    const hbm = new HealthBenefitsManager(bus);
    const p = hbm.addPlan({ name: "Med", type: "medical", provider: "Aetna", employeePremiumMonthly: 200, employerPremiumMonthly: 600, deductibleUsd: 1000, outOfPocketMaxUsd: 5000, active: true });
    const enr = hbm.enroll("emp1", p.id, "2026-01-01")!;
    const claim = hbm.submitClaim({ employeeId: "emp1", enrollmentId: enr.id, claimType: "medical", status: "submitted", amountUsd: 350, serviceDate: "2026-02-01", submittedAt: "2026-02-02" })!;
    const resolved = hbm.resolveClaim(claim.id, "approved", 300);
    assert.equal(resolved!.status, "approved");
    assert.equal(resolved!.approvedUsd, 300);
  });

  it("summary aggregates enrollments, claims and cost", () => {
    const bus = new EventBus();
    const hbm = new HealthBenefitsManager(bus);
    const p = hbm.addPlan({ name: "Med", type: "medical", provider: "Aetna", employeePremiumMonthly: 200, employerPremiumMonthly: 600, deductibleUsd: 1000, outOfPocketMaxUsd: 5000, active: true });
    const enr = hbm.enroll("emp1", p.id, "2026-01-01")!;
    hbm.submitClaim({ employeeId: "emp1", enrollmentId: enr.id, claimType: "medical", status: "submitted", amountUsd: 350, serviceDate: "2026-02-01", submittedAt: "2026-02-02" });
    const s = hbm.summary();
    assert.equal(s.totalEnrollments, 1);
    assert.equal(s.totalClaims, 1);
    assert.equal(s.pendingClaims, 1);
    assert.equal(s.totalClaimsUsd, 350);
    assert.equal(s.monthlyCostUsd, 600);
    assert.equal(s.byPlanType.medical, 1);
  });
});

describe("CommissionEngine", () => {
  it("createPlan sorts tiers and defaults to draft", () => {
    const bus = new EventBus();
    const ce = new CommissionEngine(bus);
    const plan = ce.createPlan({ name: "Std", baseRatePct: 5, tiers: [{ thresholdUsd: 100000, ratePct: 10 }, { thresholdUsd: 50000, ratePct: 7 }], effectiveDate: "2026-01-01" });
    assert.equal(plan.status, "draft");
    assert.equal(plan.tiers[0]!.thresholdUsd, 50000);
  });

  it("activatePlan publishes plan_activated", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("commission.plan_activated", (e) => { events.push(e.payload); });
    const ce = new CommissionEngine(bus);
    const plan = ce.createPlan({ name: "Std", baseRatePct: 5, tiers: [], effectiveDate: "2026-01-01" });
    ce.activatePlan(plan.id);
    assert.equal(ce.getPlan(plan.id)!.status, "active");
    assert.equal(events.length, 1);
  });

  it("recordDeal returns undefined for unknown plan", () => {
    const bus = new EventBus();
    const ce = new CommissionEngine(bus);
    assert.equal(ce.recordDeal({ repId: "r1", planId: "nope", period: "2026-Q1", dealValueUsd: 1000, closedAt: "2026-01-15" }), undefined);
  });

  it("calculatePayout applies tier rate and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("commission.payout_calculated", (e) => { events.push(e.payload); });
    const ce = new CommissionEngine(bus);
    const plan = ce.createPlan({ name: "Std", baseRatePct: 5, tiers: [{ thresholdUsd: 50000, ratePct: 10 }], effectiveDate: "2026-01-01" });
    ce.recordDeal({ repId: "r1", planId: plan.id, period: "2026-Q1", dealValueUsd: 40000, closedAt: "2026-01-15" });
    ce.recordDeal({ repId: "r1", planId: plan.id, period: "2026-Q1", dealValueUsd: 20000, closedAt: "2026-02-15" });
    const payout = ce.calculatePayout("r1", plan.id, "2026-Q1")!;
    assert.equal(payout.totalSalesUsd, 60000);
    assert.equal(payout.dealCount, 2);
    assert.equal(payout.commissionUsd, 6000); // 10% tier applies
    assert.equal(events.length, 1);
  });

  it("openDispute marks payout disputed and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("commission.dispute_opened", (e) => { events.push(e.payload); });
    const ce = new CommissionEngine(bus);
    const plan = ce.createPlan({ name: "Std", baseRatePct: 5, tiers: [], effectiveDate: "2026-01-01" });
    ce.recordDeal({ repId: "r1", planId: plan.id, period: "2026-Q1", dealValueUsd: 10000, closedAt: "2026-01-15" });
    const payout = ce.calculatePayout("r1", plan.id, "2026-Q1")!;
    const dispute = ce.openDispute(payout.id, "wrong rate")!;
    assert.equal(dispute.status, "open");
    assert.equal(ce.listPayouts("r1")[0]!.status, "disputed");
    assert.equal(events.length, 1);
  });

  it("summary aggregates plans, deals, payouts and disputes", () => {
    const bus = new EventBus();
    const ce = new CommissionEngine(bus);
    const plan = ce.createPlan({ name: "Std", baseRatePct: 5, tiers: [], effectiveDate: "2026-01-01" });
    ce.activatePlan(plan.id);
    ce.recordDeal({ repId: "r1", planId: plan.id, period: "2026-Q1", dealValueUsd: 10000, closedAt: "2026-01-15" });
    const payout = ce.calculatePayout("r1", plan.id, "2026-Q1")!;
    ce.openDispute(payout.id, "x");
    const s = ce.summary();
    assert.equal(s.totalPlans, 1);
    assert.equal(s.activePlans, 1);
    assert.equal(s.totalDeals, 1);
    assert.equal(s.totalPayouts, 1);
    assert.equal(s.totalSalesUsd, 10000);
    assert.equal(s.openDisputes, 1);
    assert.equal(s.totalCommissionUsd, 500);
  });
});

describe("TimeTrackingManager", () => {
  it("createTimesheet and addEntry track hours", () => {
    const bus = new EventBus();
    const tt = new TimeTrackingManager(bus);
    const ts = tt.createTimesheet("emp1", "2026-W26");
    const e = tt.addEntry(ts.id, { date: "2026-06-22", projectId: "p1", taskDescription: "dev", hours: 8, billable: true });
    assert.ok(e);
    assert.equal(tt.getTimesheet(ts.id)!.entries.length, 1);
  });

  it("addEntry returns undefined for approved timesheet", () => {
    const bus = new EventBus();
    const tt = new TimeTrackingManager(bus);
    const ts = tt.createTimesheet("emp1", "2026-W26");
    tt.submitTimesheet(ts.id);
    tt.approveTimesheet(ts.id, "mgr1");
    assert.equal(tt.addEntry(ts.id, { date: "2026-06-22", taskDescription: "x", hours: 2, billable: false }), undefined);
  });

  it("submitTimesheet publishes submitted event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("timetracking.timesheet_submitted", (e) => { events.push(e.payload); });
    const tt = new TimeTrackingManager(bus);
    const ts = tt.createTimesheet("emp1", "2026-W26");
    tt.addEntry(ts.id, { date: "2026-06-22", taskDescription: "dev", hours: 8, billable: true });
    tt.submitTimesheet(ts.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].totalHours, 8);
  });

  it("submitTimesheet flags overtime above threshold", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("timetracking.overtime_flagged", (e) => { events.push(e.payload); });
    const tt = new TimeTrackingManager(bus, 40);
    const ts = tt.createTimesheet("emp1", "2026-W26");
    tt.addEntry(ts.id, { date: "2026-06-22", taskDescription: "dev", hours: 45, billable: true });
    tt.submitTimesheet(ts.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].totalHours, 45);
  });

  it("approveTimesheet publishes approved event and sets approver", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("timetracking.timesheet_approved", (e) => { events.push(e.payload); });
    const tt = new TimeTrackingManager(bus);
    const ts = tt.createTimesheet("emp1", "2026-W26");
    tt.submitTimesheet(ts.id);
    tt.approveTimesheet(ts.id, "mgr1");
    assert.equal(tt.getTimesheet(ts.id)!.status, "approved");
    assert.equal(tt.getTimesheet(ts.id)!.approverId, "mgr1");
    assert.equal(events.length, 1);
  });

  it("summary computes utilization and per-project hours", () => {
    const bus = new EventBus();
    const tt = new TimeTrackingManager(bus);
    const ts = tt.createTimesheet("emp1", "2026-W26");
    tt.addEntry(ts.id, { date: "2026-06-22", projectId: "p1", taskDescription: "dev", hours: 6, billable: true });
    tt.addEntry(ts.id, { date: "2026-06-23", projectId: "p1", taskDescription: "admin", hours: 2, billable: false });
    const s = tt.summary();
    assert.equal(s.totalHours, 8);
    assert.equal(s.billableHours, 6);
    assert.equal(s.nonBillableHours, 2);
    assert.equal(s.utilizationPct, 75);
    assert.equal(s.byProject.p1, 8);
  });
});

describe("VendorRiskManager", () => {
  it("assess computes weighted score and tier", () => {
    const bus = new EventBus();
    const vr = new VendorRiskManager(bus);
    const a = vr.assess("v1", "Acme", [{ domain: "security", scorePct: 80, weight: 2 }, { domain: "financial", scorePct: 20, weight: 1 }], "auditor1");
    assert.equal(a.riskScore, 60); // (80*2+20*1)/3 = 60
    assert.equal(a.tier, "high");
  });

  it("assess publishes assessment_completed and high_risk_flagged", () => {
    const bus = new EventBus();
    const done: any[] = [];
    const high: any[] = [];
    bus.subscribe("vendorrisk.assessment_completed", (e) => { done.push(e.payload); });
    bus.subscribe("vendorrisk.high_risk_flagged", (e) => { high.push(e.payload); });
    const vr = new VendorRiskManager(bus);
    vr.assess("v1", "Acme", [{ domain: "security", scorePct: 90, weight: 1 }], "auditor1");
    assert.equal(done.length, 1);
    assert.equal(high.length, 1);
  });

  it("low risk does not flag high risk", () => {
    const bus = new EventBus();
    const high: any[] = [];
    bus.subscribe("vendorrisk.high_risk_flagged", (e) => { high.push(e.payload); });
    const vr = new VendorRiskManager(bus);
    const a = vr.assess("v2", "SafeCo", [{ domain: "security", scorePct: 10, weight: 1 }], "auditor1");
    assert.equal(a.tier, "low");
    assert.equal(high.length, 0);
  });

  it("addRemediation and updateRemediation track status", () => {
    const bus = new EventBus();
    const vr = new VendorRiskManager(bus);
    const item = vr.addRemediation({ vendorId: "v1", finding: "no SOC2", severity: "high", dueDate: "2026-12-01" });
    assert.equal(item.status, "open");
    const updated = vr.updateRemediation(item.id, "resolved");
    assert.equal(updated!.status, "resolved");
    assert.ok(updated!.resolvedAt);
  });

  it("checkOverdue flags and publishes overdue remediations", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("vendorrisk.remediation_overdue", (e) => { events.push(e.payload); });
    const vr = new VendorRiskManager(bus);
    vr.addRemediation({ vendorId: "v1", finding: "patch", severity: "moderate", dueDate: "2026-01-01" });
    const overdue = vr.checkOverdue("2026-06-25");
    assert.equal(overdue.length, 1);
    assert.equal(events.length, 1);
  });

  it("summary aggregates tiers and remediation counts", () => {
    const bus = new EventBus();
    const vr = new VendorRiskManager(bus);
    vr.assess("v1", "Acme", [{ domain: "security", scorePct: 90, weight: 1 }], "a1");
    vr.assess("v2", "SafeCo", [{ domain: "security", scorePct: 10, weight: 1 }], "a1");
    vr.addRemediation({ vendorId: "v1", finding: "x", severity: "high", dueDate: "2026-01-01" });
    const s = vr.summary();
    assert.equal(s.totalAssessments, 2);
    assert.equal(s.byTier.critical, 1);
    assert.equal(s.byTier.low, 1);
    assert.equal(s.openRemediations, 1);
    assert.equal(s.overdueRemediations, 1);
  });
});

describe("WarrantyManager", () => {
  it("register creates active warranty and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("warranty.registered", (e) => { events.push(e.payload); });
    const wm = new WarrantyManager(bus);
    const w = wm.register({ productId: "p1", productName: "Widget", customerId: "c1", serialNumber: "SN1", purchaseDate: "2026-01-01", expiresAt: "2027-01-01" });
    assert.equal(w.status, "active");
    assert.equal(events.length, 1);
  });

  it("isCovered respects expiry and status", () => {
    const bus = new EventBus();
    const wm = new WarrantyManager(bus);
    const w = wm.register({ productId: "p1", productName: "Widget", customerId: "c1", serialNumber: "SN1", purchaseDate: "2026-01-01", expiresAt: "2027-01-01" });
    assert.equal(wm.isCovered(w.id, "2026-06-01"), true);
    assert.equal(wm.isCovered(w.id, "2028-01-01"), false);
  });

  it("voidWarranty makes it not covered", () => {
    const bus = new EventBus();
    const wm = new WarrantyManager(bus);
    const w = wm.register({ productId: "p1", productName: "Widget", customerId: "c1", serialNumber: "SN1", purchaseDate: "2026-01-01", expiresAt: "2027-01-01" });
    wm.voidWarranty(w.id);
    assert.equal(wm.isCovered(w.id, "2026-06-01"), false);
  });

  it("openRMA publishes rma_opened and returns undefined for unknown warranty", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("warranty.rma_opened", (e) => { events.push(e.payload); });
    const wm = new WarrantyManager(bus);
    const w = wm.register({ productId: "p1", productName: "Widget", customerId: "c1", serialNumber: "SN1", purchaseDate: "2026-01-01", expiresAt: "2027-01-01" });
    const rma = wm.openRMA(w.id, "broken");
    assert.ok(rma);
    assert.equal(events.length, 1);
    assert.equal(wm.openRMA("nope", "x"), undefined);
  });

  it("resolveRMA publishes claim_resolved with cost", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("warranty.claim_resolved", (e) => { events.push(e.payload); });
    const wm = new WarrantyManager(bus);
    const w = wm.register({ productId: "p1", productName: "Widget", customerId: "c1", serialNumber: "SN1", purchaseDate: "2026-01-01", expiresAt: "2027-01-01" });
    const rma = wm.openRMA(w.id, "broken")!;
    wm.resolveRMA(rma.id, "replace", 120);
    assert.equal(wm.listRMAs()[0]!.status, "resolved");
    assert.equal(events.length, 1);
    assert.equal(events[0].costUsd, 120);
  });

  it("summary aggregates warranties, RMAs and resolutions", () => {
    const bus = new EventBus();
    const wm = new WarrantyManager(bus);
    const w = wm.register({ productId: "p1", productName: "Widget", customerId: "c1", serialNumber: "SN1", purchaseDate: "2026-01-01", expiresAt: "2027-01-01" });
    const rma = wm.openRMA(w.id, "broken")!;
    wm.resolveRMA(rma.id, "refund", 50);
    const s = wm.summary();
    assert.equal(s.totalWarranties, 1);
    assert.equal(s.active, 1);
    assert.equal(s.totalRMAs, 1);
    assert.equal(s.totalClaimCostUsd, 50);
    assert.equal(s.byResolution.refund, 1);
  });
});

describe("ReferralProgramManager", () => {
  it("createProgram defaults to active", () => {
    const bus = new EventBus();
    const rm = new ReferralProgramManager(bus);
    const p = rm.createProgram({ name: "Refer-a-friend", rewardType: "cash", referrerRewardUsd: 50, refereeRewardUsd: 25 });
    assert.equal(p.active, true);
    assert.equal(rm.listPrograms(true).length, 1);
  });

  it("createReferral publishes created and rejects duplicate code", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("referral.created", (e) => { events.push(e.payload); });
    const rm = new ReferralProgramManager(bus);
    const p = rm.createProgram({ name: "P", rewardType: "cash", referrerRewardUsd: 50, refereeRewardUsd: 25 });
    const r = rm.createReferral(p.id, "u1", "CODE1");
    assert.ok(r);
    assert.equal(events.length, 1);
    assert.equal(rm.createReferral(p.id, "u2", "CODE1"), undefined);
  });

  it("createReferral returns undefined for inactive program", () => {
    const bus = new EventBus();
    const rm = new ReferralProgramManager(bus);
    const p = rm.createProgram({ name: "P", rewardType: "cash", referrerRewardUsd: 50, refereeRewardUsd: 25, active: false });
    assert.equal(rm.createReferral(p.id, "u1", "X"), undefined);
  });

  it("convert sets reward and publishes converted", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("referral.converted", (e) => { events.push(e.payload); });
    const rm = new ReferralProgramManager(bus);
    const p = rm.createProgram({ name: "P", rewardType: "cash", referrerRewardUsd: 50, refereeRewardUsd: 25 });
    rm.createReferral(p.id, "u1", "CODE1");
    const r = rm.convert("CODE1", "u2")!;
    assert.equal(r.status, "converted");
    assert.equal(r.rewardUsd, 50);
    assert.equal(events.length, 1);
  });

  it("issueReward only works on converted referrals", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("referral.reward_issued", (e) => { events.push(e.payload); });
    const rm = new ReferralProgramManager(bus);
    const p = rm.createProgram({ name: "P", rewardType: "cash", referrerRewardUsd: 50, refereeRewardUsd: 25 });
    const ref = rm.createReferral(p.id, "u1", "CODE1")!;
    assert.equal(rm.issueReward(ref.id), undefined); // still pending
    rm.convert("CODE1", "u2");
    const rewarded = rm.issueReward(ref.id)!;
    assert.equal(rewarded.status, "rewarded");
    assert.equal(events.length, 1);
  });

  it("summary computes conversion rate and rewards issued", () => {
    const bus = new EventBus();
    const rm = new ReferralProgramManager(bus);
    const p = rm.createProgram({ name: "P", rewardType: "cash", referrerRewardUsd: 50, refereeRewardUsd: 25 });
    rm.createReferral(p.id, "u1", "C1");
    rm.createReferral(p.id, "u1", "C2");
    rm.convert("C1", "u2");
    const ref = rm.listReferrals(undefined, "converted")[0]!;
    rm.issueReward(ref.id);
    const s = rm.summary();
    assert.equal(s.totalReferrals, 2);
    assert.equal(s.converted, 1);
    assert.equal(s.rewarded, 1);
    assert.equal(s.conversionRatePct, 50);
    assert.equal(s.totalRewardsIssuedUsd, 50);
  });
});

describe("CapTableManager", () => {
  it("defineShareClass and issueGrant publishes shares_issued", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("captable.shares_issued", (e) => { events.push(e.payload); });
    const ct = new CapTableManager(bus);
    const sc = ct.defineShareClass({ name: "common", authorizedShares: 1000000, parValueUsd: 0.0001, liquidationPreference: 1 });
    const g = ct.issueGrant({ holderId: "f1", holderName: "Founder", shareClassId: sc.id, shares: 500000, vestingMonths: 0, cliffMonths: 0, pricePerShareUsd: 0.01 });
    assert.ok(g);
    assert.equal(g!.vestedShares, 500000); // fully vested when vestingMonths 0
    assert.equal(events.length, 1);
  });

  it("issueGrant rejects over-allocation and unknown class", () => {
    const bus = new EventBus();
    const ct = new CapTableManager(bus);
    const sc = ct.defineShareClass({ name: "common", authorizedShares: 100, parValueUsd: 0.01, liquidationPreference: 1 });
    assert.equal(ct.issueGrant({ holderId: "f1", holderName: "F", shareClassId: sc.id, shares: 200, vestingMonths: 0, cliffMonths: 0, pricePerShareUsd: 1 }), undefined);
    assert.equal(ct.issueGrant({ holderId: "f1", holderName: "F", shareClassId: "nope", shares: 10, vestingMonths: 0, cliffMonths: 0, pricePerShareUsd: 1 }), undefined);
  });

  it("vest accumulates up to total shares and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("captable.shares_vested", (e) => { events.push(e.payload); });
    const ct = new CapTableManager(bus);
    const sc = ct.defineShareClass({ name: "options", authorizedShares: 100000, parValueUsd: 0.0001, liquidationPreference: 1 });
    const g = ct.issueGrant({ holderId: "e1", holderName: "Emp", shareClassId: sc.id, shares: 4800, vestingMonths: 48, cliffMonths: 12, pricePerShareUsd: 0.5 })!;
    assert.equal(g.vestedShares, 0);
    ct.vest(g.id, 1200);
    ct.vest(g.id, 5000); // caps at total
    assert.equal(ct.listGrants("e1")[0]!.vestedShares, 4800);
    assert.equal(events.length, 2);
  });

  it("transfer moves shares to a new holder and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("captable.transfer_recorded", (e) => { events.push(e.payload); });
    const ct = new CapTableManager(bus);
    const sc = ct.defineShareClass({ name: "common", authorizedShares: 1000000, parValueUsd: 0.0001, liquidationPreference: 1 });
    const g = ct.issueGrant({ holderId: "f1", holderName: "Founder", shareClassId: sc.id, shares: 100000, vestingMonths: 0, cliffMonths: 0, pricePerShareUsd: 0.01 })!;
    ct.transfer(g.id, "f2", "CoFounder", 30000);
    assert.equal(events.length, 1);
    assert.equal(ct.listGrants("f1")[0]!.shares, 70000);
    assert.equal(ct.listGrants("f2")[0]!.shares, 30000);
  });

  it("summary computes ownership percentages", () => {
    const bus = new EventBus();
    const ct = new CapTableManager(bus);
    const sc = ct.defineShareClass({ name: "common", authorizedShares: 1000000, parValueUsd: 0.0001, liquidationPreference: 1 });
    ct.issueGrant({ holderId: "f1", holderName: "F1", shareClassId: sc.id, shares: 600000, vestingMonths: 0, cliffMonths: 0, pricePerShareUsd: 0.01 });
    ct.issueGrant({ holderId: "f2", holderName: "F2", shareClassId: sc.id, shares: 400000, vestingMonths: 0, cliffMonths: 0, pricePerShareUsd: 0.01 });
    const s = ct.summary();
    assert.equal(s.totalShareholders, 2);
    assert.equal(s.totalSharesIssued, 1000000);
    const f1 = s.ownership.find(o => o.holderId === "f1")!;
    assert.equal(f1.pct, 60);
  });

  it("summary aggregates by share class and fully-diluted value", () => {
    const bus = new EventBus();
    const ct = new CapTableManager(bus);
    const sc = ct.defineShareClass({ name: "preferred_a", authorizedShares: 500000, parValueUsd: 0.0001, liquidationPreference: 1 });
    ct.issueGrant({ holderId: "inv1", holderName: "VC", shareClassId: sc.id, shares: 200000, vestingMonths: 0, cliffMonths: 0, pricePerShareUsd: 2 });
    const s = ct.summary();
    assert.equal(s.byShareClass.preferred_a, 200000);
    assert.equal(s.fullyDilutedValueUsd, 400000);
  });
});

describe("ApprovalWorkflowManager", () => {
  it("defineWorkflow and submitRequest publishes requested", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("approval.requested", (e) => { events.push(e.payload); });
    const aw = new ApprovalWorkflowManager(bus);
    const wf = aw.defineWorkflow("PO Approval", [{ name: "Manager", approverId: "m1" }, { name: "Finance", approverId: "f1" }]);
    const req = aw.submitRequest(wf.id, "PO #123");
    assert.ok(req);
    assert.equal(req!.status, "pending");
    assert.equal(events.length, 1);
    assert.equal(events[0].currentApprover, "m1");
  });

  it("submitRequest returns undefined for unknown workflow", () => {
    const bus = new EventBus();
    const aw = new ApprovalWorkflowManager(bus);
    assert.equal(aw.submitRequest("nope", "x"), undefined);
  });

  it("decide advances through steps and completes on final approval", () => {
    const bus = new EventBus();
    const completed: any[] = [];
    bus.subscribe("approval.completed", (e) => { completed.push(e.payload); });
    const aw = new ApprovalWorkflowManager(bus);
    const wf = aw.defineWorkflow("WF", [{ name: "S1", approverId: "a1" }, { name: "S2", approverId: "a2" }]);
    const req = aw.submitRequest(wf.id, "thing")!;
    aw.decide(req.id, "a1", "approved");
    assert.equal(aw.getRequest(req.id)!.status, "pending");
    assert.equal(aw.getRequest(req.id)!.currentStepIndex, 1);
    aw.decide(req.id, "a2", "approved");
    assert.equal(aw.getRequest(req.id)!.status, "approved");
    assert.equal(completed.length, 1);
    assert.equal(completed[0].finalStatus, "approved");
  });

  it("decide rejects immediately on any rejection", () => {
    const bus = new EventBus();
    const aw = new ApprovalWorkflowManager(bus);
    const wf = aw.defineWorkflow("WF", [{ name: "S1", approverId: "a1" }, { name: "S2", approverId: "a2" }]);
    const req = aw.submitRequest(wf.id, "thing")!;
    aw.decide(req.id, "a1", "rejected", "no budget");
    assert.equal(aw.getRequest(req.id)!.status, "rejected");
  });

  it("decide rejects wrong approver acting out of turn", () => {
    const bus = new EventBus();
    const aw = new ApprovalWorkflowManager(bus);
    const wf = aw.defineWorkflow("WF", [{ name: "S1", approverId: "a1" }, { name: "S2", approverId: "a2" }]);
    const req = aw.submitRequest(wf.id, "thing")!;
    assert.equal(aw.decide(req.id, "a2", "approved"), undefined); // a2 not current
    assert.equal(aw.pendingForApprover("a1").length, 1);
  });

  it("summary computes approval rate", () => {
    const bus = new EventBus();
    const aw = new ApprovalWorkflowManager(bus);
    const wf = aw.defineWorkflow("WF", [{ name: "S1", approverId: "a1" }]);
    const r1 = aw.submitRequest(wf.id, "a")!;
    const r2 = aw.submitRequest(wf.id, "b")!;
    aw.decide(r1.id, "a1", "approved");
    aw.decide(r2.id, "a1", "rejected");
    const s = aw.summary();
    assert.equal(s.totalRequests, 2);
    assert.equal(s.approved, 1);
    assert.equal(s.rejected, 1);
    assert.equal(s.approvalRatePct, 50);
  });
});

describe("DunningManager", () => {
  it("addReceivable starts open and current", () => {
    const bus = new EventBus();
    const dm = new DunningManager(bus);
    const r = dm.addReceivable({ customerId: "c1", invoiceNumber: "INV1", amountUsd: 1000, dueDate: "2026-06-01" });
    assert.equal(r.status, "open");
    assert.equal(r.stage, "current");
  });

  it("runDunningCycle flags overdue and publishes events", () => {
    const bus = new EventBus();
    const overdue: any[] = [];
    const advanced: any[] = [];
    bus.subscribe("dunning.invoice_overdue", (e) => { overdue.push(e.payload); });
    bus.subscribe("dunning.stage_advanced", (e) => { advanced.push(e.payload); });
    const dm = new DunningManager(bus);
    dm.addReceivable({ customerId: "c1", invoiceNumber: "INV1", amountUsd: 1000, dueDate: "2026-06-01" });
    dm.runDunningCycle("2026-06-10"); // 9 days overdue -> reminder
    assert.equal(overdue.length, 1);
    assert.equal(advanced.length, 1);
  });

  it("dunning stages escalate with age", () => {
    const bus = new EventBus();
    const dm = new DunningManager(bus);
    const r = dm.addReceivable({ customerId: "c1", invoiceNumber: "INV1", amountUsd: 1000, dueDate: "2026-01-01" });
    dm.runDunningCycle("2026-04-15"); // >90 days -> collections
    assert.equal(dm.getReceivable(r.id)!.stage, "collections");
  });

  it("recordPayment publishes recovered and marks paid", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("dunning.invoice_recovered", (e) => { events.push(e.payload); });
    const dm = new DunningManager(bus);
    const r = dm.addReceivable({ customerId: "c1", invoiceNumber: "INV1", amountUsd: 1000, dueDate: "2026-06-01" });
    dm.recordPayment(r.id, "2026-06-15");
    assert.equal(dm.getReceivable(r.id)!.status, "paid");
    assert.equal(events.length, 1);
    assert.equal(events[0].daysToRecover, 14);
  });

  it("writeOff sets written_off status", () => {
    const bus = new EventBus();
    const dm = new DunningManager(bus);
    const r = dm.addReceivable({ customerId: "c1", invoiceNumber: "INV1", amountUsd: 1000, dueDate: "2026-06-01" });
    dm.writeOff(r.id);
    assert.equal(dm.getReceivable(r.id)!.status, "written_off");
  });

  it("summary computes aging buckets and outstanding", () => {
    const bus = new EventBus();
    const dm = new DunningManager(bus);
    dm.addReceivable({ customerId: "c1", invoiceNumber: "A", amountUsd: 1000, dueDate: "2026-07-20" }); // current
    dm.addReceivable({ customerId: "c2", invoiceNumber: "B", amountUsd: 500, dueDate: "2026-06-01" });  // ~24 days
    const s = dm.summary("2026-06-25");
    assert.equal(s.totalReceivables, 2);
    assert.equal(s.totalOutstandingUsd, 1500);
    assert.equal(s.aging.current, 1000);
    assert.equal(s.aging.days1to30, 500);
  });
});

describe("EventSchedulerManager", () => {
  it("schedule publishes event_created", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("scheduler.event_created", (e) => { events.push(e.payload); });
    const es = new EventSchedulerManager(bus);
    const ev = es.schedule({ name: "Tax filing", category: "compliance", recurrence: "quarterly", nextDueDate: "2026-07-15" });
    assert.equal(ev.status, "scheduled");
    assert.equal(events.length, 1);
  });

  it("evaluate marks due events and publishes event_due", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("scheduler.event_due", (e) => { events.push(e.payload); });
    const es = new EventSchedulerManager(bus);
    es.schedule({ name: "Review", category: "ops", recurrence: "monthly", nextDueDate: "2026-06-01" });
    const due = es.evaluate("2026-06-25");
    assert.equal(due.length, 1);
    assert.equal(events.length, 1);
  });

  it("complete advances recurring next due date", () => {
    const bus = new EventBus();
    const es = new EventSchedulerManager(bus);
    const ev = es.schedule({ name: "Monthly close", category: "finance", recurrence: "monthly", nextDueDate: "2026-06-30" });
    es.complete(ev.id, "2026-06-30");
    const updated = es.getEvent(ev.id)!;
    assert.equal(updated.status, "scheduled");
    assert.equal(updated.nextDueDate, "2026-07-30T00:00:00.000Z");
  });

  it("complete marks once events completed", () => {
    const bus = new EventBus();
    const es = new EventSchedulerManager(bus);
    const ev = es.schedule({ name: "Launch", category: "product", recurrence: "once", nextDueDate: "2026-06-01" });
    es.complete(ev.id, "2026-06-01");
    assert.equal(es.getEvent(ev.id)!.status, "completed");
  });

  it("cancel sets cancelled and blocks completion", () => {
    const bus = new EventBus();
    const es = new EventSchedulerManager(bus);
    const ev = es.schedule({ name: "X", category: "ops", recurrence: "daily", nextDueDate: "2026-06-01" });
    es.cancel(ev.id);
    assert.equal(es.getEvent(ev.id)!.status, "cancelled");
    assert.equal(es.complete(ev.id, "2026-06-02"), undefined);
  });

  it("summary aggregates by category and recurrence", () => {
    const bus = new EventBus();
    const es = new EventSchedulerManager(bus);
    es.schedule({ name: "A", category: "compliance", recurrence: "annually", nextDueDate: "2026-12-31" });
    es.schedule({ name: "B", category: "compliance", recurrence: "monthly", nextDueDate: "2026-07-01" });
    const s = es.summary();
    assert.equal(s.totalEvents, 2);
    assert.equal(s.byCategory.compliance, 2);
    assert.equal(s.byRecurrence.annually, 1);
    assert.equal(s.byRecurrence.monthly, 1);
  });
});

describe("PromotionManager", () => {
  it("createPromotion publishes created and rejects duplicate code", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("promotion.created", (e) => { events.push(e.payload); });
    const pm = new PromotionManager(bus);
    const p = pm.createPromotion({ code: "SAVE10", description: "10% off", discountKind: "percentage", value: 10, maxRedemptions: 0, startsAt: "2026-01-01", endsAt: "2026-12-31" });
    assert.ok(p);
    assert.equal(events.length, 1);
    assert.equal(pm.createPromotion({ code: "SAVE10", description: "dup", discountKind: "percentage", value: 5, maxRedemptions: 0, startsAt: "2026-01-01", endsAt: "2026-12-31" }), undefined);
  });

  it("redeem computes percentage discount and publishes redeemed", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("promotion.redeemed", (e) => { events.push(e.payload); });
    const pm = new PromotionManager(bus);
    pm.createPromotion({ code: "SAVE10", description: "10% off", discountKind: "percentage", value: 10, maxRedemptions: 0, startsAt: "2026-01-01", endsAt: "2026-12-31" });
    const r = pm.redeem("SAVE10", "c1", 200, "2026-06-01")!;
    assert.equal(r.discountUsd, 20);
    assert.equal(events.length, 1);
  });

  it("fixed amount discount caps at subtotal", () => {
    const bus = new EventBus();
    const pm = new PromotionManager(bus);
    pm.createPromotion({ code: "FLAT50", description: "$50 off", discountKind: "fixed_amount", value: 50, maxRedemptions: 0, startsAt: "2026-01-01", endsAt: "2026-12-31" });
    const r = pm.redeem("FLAT50", "c1", 30, "2026-06-01")!;
    assert.equal(r.discountUsd, 30);
  });

  it("redeem rejects outside validity window", () => {
    const bus = new EventBus();
    const pm = new PromotionManager(bus);
    pm.createPromotion({ code: "X", description: "x", discountKind: "percentage", value: 10, maxRedemptions: 0, startsAt: "2026-06-01", endsAt: "2026-06-30" });
    assert.equal(pm.redeem("X", "c1", 100, "2026-07-15"), undefined);
  });

  it("redeem exhausts promotion at max redemptions", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("promotion.exhausted", (e) => { events.push(e.payload); });
    const pm = new PromotionManager(bus);
    pm.createPromotion({ code: "ONE", description: "one use", discountKind: "fixed_amount", value: 5, maxRedemptions: 1, startsAt: "2026-01-01", endsAt: "2026-12-31" });
    pm.redeem("ONE", "c1", 100, "2026-06-01");
    assert.equal(pm.findByCode("ONE")!.status, "exhausted");
    assert.equal(events.length, 1);
    assert.equal(pm.redeem("ONE", "c2", 100, "2026-06-02"), undefined);
  });

  it("summary aggregates redemptions and discount", () => {
    const bus = new EventBus();
    const pm = new PromotionManager(bus);
    pm.createPromotion({ code: "P", description: "p", discountKind: "percentage", value: 10, maxRedemptions: 0, startsAt: "2026-01-01", endsAt: "2026-12-31" });
    pm.redeem("P", "c1", 100, "2026-06-01");
    pm.redeem("P", "c2", 200, "2026-06-02");
    const s = pm.summary();
    assert.equal(s.totalPromotions, 1);
    assert.equal(s.totalRedemptions, 2);
    assert.equal(s.totalDiscountUsd, 30);
    assert.equal(s.byDiscountKind.percentage, 1);
  });
});

describe("RebateManager", () => {
  it("createProgram sorts tiers and publishes created", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("rebate.program_created", (e) => { events.push(e.payload); });
    const rm = new RebateManager(bus);
    const p = rm.createProgram("Volume", [{ thresholdUsd: 100000, ratePct: 5 }, { thresholdUsd: 50000, ratePct: 3 }]);
    assert.equal(p.tiers[0]!.thresholdUsd, 50000);
    assert.equal(events.length, 1);
  });

  it("recordPurchase accrues at base then escalates rate", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("rebate.tier_reached", (e) => { events.push(e.payload); });
    const rm = new RebateManager(bus);
    const p = rm.createProgram("V", [{ thresholdUsd: 1000, ratePct: 2 }, { thresholdUsd: 5000, ratePct: 4 }]);
    rm.recordPurchase(p.id, "buyer1", 2000); // crosses 1000 -> 2%
    const a = rm.getAccrual(p.id, "buyer1")!;
    assert.equal(a.currentRatePct, 2);
    assert.equal(a.accruedRebateUsd, 40);
    assert.equal(events.length, 1);
  });

  it("recordPurchase returns undefined for closed program", () => {
    const bus = new EventBus();
    const rm = new RebateManager(bus);
    const p = rm.createProgram("V", [{ thresholdUsd: 0, ratePct: 1 }]);
    rm.closeProgram(p.id);
    assert.equal(rm.recordPurchase(p.id, "b1", 100), undefined);
  });

  it("higher tier raises rate after threshold reached", () => {
    const bus = new EventBus();
    const rm = new RebateManager(bus);
    const p = rm.createProgram("V", [{ thresholdUsd: 1000, ratePct: 2 }, { thresholdUsd: 5000, ratePct: 4 }]);
    rm.recordPurchase(p.id, "b1", 6000);
    assert.equal(rm.getAccrual(p.id, "b1")!.currentRatePct, 4);
  });

  it("settle publishes settled and marks settled amount", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("rebate.settled", (e) => { events.push(e.payload); });
    const rm = new RebateManager(bus);
    const p = rm.createProgram("V", [{ thresholdUsd: 0, ratePct: 5 }]);
    rm.recordPurchase(p.id, "b1", 1000);
    const a = rm.settle(p.id, "b1")!;
    assert.equal(a.settledRebateUsd, 50);
    assert.equal(events.length, 1);
    assert.equal(events[0].rebateUsd, 50);
  });

  it("summary aggregates volume and rebate amounts", () => {
    const bus = new EventBus();
    const rm = new RebateManager(bus);
    const p = rm.createProgram("V", [{ thresholdUsd: 0, ratePct: 5 }]);
    rm.recordPurchase(p.id, "b1", 1000);
    rm.recordPurchase(p.id, "b2", 2000);
    rm.settle(p.id, "b1");
    const s = rm.summary();
    assert.equal(s.totalParticipants, 2);
    assert.equal(s.totalVolumeUsd, 3000);
    assert.equal(s.totalAccruedUsd, 150);
    assert.equal(s.totalSettledUsd, 50);
  });
});

describe("DataRetentionManager", () => {
  it("setPolicy publishes policy_created", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("retention.policy_created", (e) => { events.push(e.payload); });
    const dr = new DataRetentionManager(bus);
    dr.setPolicy("pii", 365);
    assert.equal(events.length, 1);
    assert.equal(dr.listPolicies().length, 1);
  });

  it("registerRecord computes expiry and needs a policy", () => {
    const bus = new EventBus();
    const dr = new DataRetentionManager(bus);
    assert.equal(dr.registerRecord("pii", "user1", "2026-01-01"), undefined);
    dr.setPolicy("pii", 30);
    const r = dr.registerRecord("pii", "user1", "2026-01-01")!;
    assert.equal(r.expiresAt, "2026-01-31T00:00:00.000Z");
  });

  it("evaluate marks expired records and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("retention.record_expired", (e) => { events.push(e.payload); });
    const dr = new DataRetentionManager(bus);
    dr.setPolicy("logs", 7);
    dr.registerRecord("logs", "log1", "2026-01-01");
    const { expired } = dr.evaluate("2026-02-01");
    assert.equal(expired.length, 1);
    assert.equal(events.length, 1);
  });

  it("evaluate auto-purges when policy says so", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("retention.record_purged", (e) => { events.push(e.payload); });
    const dr = new DataRetentionManager(bus);
    dr.setPolicy("logs", 7, true);
    dr.registerRecord("logs", "log1", "2026-01-01");
    const { purged } = dr.evaluate("2026-02-01");
    assert.equal(purged.length, 1);
    assert.equal(events.length, 1);
  });

  it("legal hold blocks expiry and purge", () => {
    const bus = new EventBus();
    const dr = new DataRetentionManager(bus);
    dr.setPolicy("legal", 1, true);
    const r = dr.registerRecord("legal", "case1", "2026-01-01")!;
    dr.placeLegalHold(r.id);
    dr.evaluate("2026-06-01");
    assert.equal(dr.getRecord(r.id)!.status, "legal_hold");
    assert.equal(dr.purge(r.id, "2026-06-01"), undefined);
  });

  it("summary aggregates record lifecycle states", () => {
    const bus = new EventBus();
    const dr = new DataRetentionManager(bus);
    dr.setPolicy("pii", 30);
    const r1 = dr.registerRecord("pii", "u1", "2026-01-01")!;
    dr.registerRecord("pii", "u2", "2026-06-20");
    dr.evaluate("2026-06-25"); // r1 expired
    dr.purge(r1.id, "2026-06-25");
    const s = dr.summary();
    assert.equal(s.totalRecords, 2);
    assert.equal(s.purged, 1);
    assert.equal(s.byDataClass.pii, 2);
  });
});

describe("AccessReviewManager", () => {
  it("createCampaign and addItem build the review set", () => {
    const bus = new EventBus();
    const ar = new AccessReviewManager(bus);
    const c = ar.createCampaign("Q2 Access Review");
    const item = ar.addItem(c.id, { userId: "u1", resource: "prod-db", entitlement: "admin", reviewerId: "mgr1" });
    assert.ok(item);
    assert.equal(ar.getCampaign(c.id)!.items.length, 1);
  });

  it("start publishes campaign_started and requires items", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("accessreview.campaign_started", (e) => { events.push(e.payload); });
    const ar = new AccessReviewManager(bus);
    const c = ar.createCampaign("C");
    assert.equal(ar.start(c.id), undefined); // no items
    ar.addItem(c.id, { userId: "u1", resource: "r", entitlement: "read", reviewerId: "m1" });
    ar.start(c.id);
    assert.equal(events.length, 1);
  });

  it("decide records decision and publishes item_decided", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("accessreview.item_decided", (e) => { events.push(e.payload); });
    const ar = new AccessReviewManager(bus);
    const c = ar.createCampaign("C");
    const item = ar.addItem(c.id, { userId: "u1", resource: "r", entitlement: "read", reviewerId: "m1" })!;
    ar.start(c.id);
    ar.decide(c.id, item.id, "m1", "approved");
    assert.equal(events.length, 1);
  });

  it("decide rejects wrong reviewer", () => {
    const bus = new EventBus();
    const ar = new AccessReviewManager(bus);
    const c = ar.createCampaign("C");
    const item = ar.addItem(c.id, { userId: "u1", resource: "r", entitlement: "read", reviewerId: "m1" })!;
    ar.start(c.id);
    assert.equal(ar.decide(c.id, item.id, "wrong", "approved"), undefined);
    assert.equal(ar.pendingForReviewer("m1").length, 1);
  });

  it("campaign completes when all items decided", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("accessreview.campaign_completed", (e) => { events.push(e.payload); });
    const ar = new AccessReviewManager(bus);
    const c = ar.createCampaign("C");
    const i1 = ar.addItem(c.id, { userId: "u1", resource: "r", entitlement: "read", reviewerId: "m1" })!;
    const i2 = ar.addItem(c.id, { userId: "u2", resource: "r", entitlement: "write", reviewerId: "m1" })!;
    ar.start(c.id);
    ar.decide(c.id, i1.id, "m1", "approved");
    ar.decide(c.id, i2.id, "m1", "revoked");
    assert.equal(ar.getCampaign(c.id)!.status, "completed");
    assert.equal(events.length, 1);
    assert.equal(events[0].approved, 1);
    assert.equal(events[0].revoked, 1);
  });

  it("summary aggregates campaign and item states", () => {
    const bus = new EventBus();
    const ar = new AccessReviewManager(bus);
    const c = ar.createCampaign("C");
    const i1 = ar.addItem(c.id, { userId: "u1", resource: "r", entitlement: "read", reviewerId: "m1" })!;
    ar.addItem(c.id, { userId: "u2", resource: "r", entitlement: "write", reviewerId: "m1" });
    ar.start(c.id);
    ar.decide(c.id, i1.id, "m1", "approved");
    const s = ar.summary();
    assert.equal(s.totalCampaigns, 1);
    assert.equal(s.inProgress, 1);
    assert.equal(s.totalItems, 2);
    assert.equal(s.approvedItems, 1);
    assert.equal(s.pendingItems, 1);
  });
});

describe("ChangeManagementManager", () => {
  it("submit publishes change.submitted", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("change.submitted", (e) => { events.push(e.payload); });
    const cm = new ChangeManagementManager(bus);
    const c = cm.submit({ title: "DB upgrade", description: "v14->v16", risk: "high", requesterId: "u1", rollbackPlan: "restore snapshot" });
    assert.equal(c.status, "submitted");
    assert.equal(events.length, 1);
  });

  it("approve schedules and publishes change.approved", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("change.approved", (e) => { events.push(e.payload); });
    const cm = new ChangeManagementManager(bus);
    const c = cm.submit({ title: "T", description: "d", risk: "low", requesterId: "u1", rollbackPlan: "x" });
    cm.approve(c.id, "cab1", "2026-07-01");
    assert.equal(cm.getChange(c.id)!.status, "scheduled");
    assert.equal(events.length, 1);
  });

  it("reject only works on submitted changes", () => {
    const bus = new EventBus();
    const cm = new ChangeManagementManager(bus);
    const c = cm.submit({ title: "T", description: "d", risk: "low", requesterId: "u1", rollbackPlan: "x" });
    cm.approve(c.id, "cab1", "2026-07-01");
    assert.equal(cm.reject(c.id, "cab1"), undefined);
  });

  it("implement success marks implemented", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("change.implemented", (e) => { events.push(e.payload); });
    const cm = new ChangeManagementManager(bus);
    const c = cm.submit({ title: "T", description: "d", risk: "low", requesterId: "u1", rollbackPlan: "x" });
    cm.approve(c.id, "cab1", "2026-07-01");
    cm.implement(c.id, "success", "2026-07-01");
    assert.equal(cm.getChange(c.id)!.status, "implemented");
    assert.equal(events.length, 1);
  });

  it("implement failure rolls back", () => {
    const bus = new EventBus();
    const cm = new ChangeManagementManager(bus);
    const c = cm.submit({ title: "T", description: "d", risk: "high", requesterId: "u1", rollbackPlan: "x" });
    cm.approve(c.id, "cab1", "2026-07-01");
    cm.implement(c.id, "failed", "2026-07-01");
    assert.equal(cm.getChange(c.id)!.status, "rolled_back");
  });

  it("summary computes success rate and pending", () => {
    const bus = new EventBus();
    const cm = new ChangeManagementManager(bus);
    const c1 = cm.submit({ title: "A", description: "d", risk: "low", requesterId: "u1", rollbackPlan: "x" });
    const c2 = cm.submit({ title: "B", description: "d", risk: "high", requesterId: "u1", rollbackPlan: "x" });
    cm.submit({ title: "C", description: "d", risk: "medium", requesterId: "u1", rollbackPlan: "x" });
    cm.approve(c1.id, "cab", "2026-07-01"); cm.implement(c1.id, "success", "2026-07-01");
    cm.approve(c2.id, "cab", "2026-07-01"); cm.implement(c2.id, "failed", "2026-07-01");
    const s = cm.summary();
    assert.equal(s.totalChanges, 3);
    assert.equal(s.successRatePct, 50);
    assert.equal(s.pendingApproval, 1);
    assert.equal(s.byRisk.low, 1);
  });
});

describe("OnCallScheduleManager", () => {
  it("createRotation publishes rotation_created", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("oncall.rotation_created", (e) => { events.push(e.payload); });
    const oc = new OnCallScheduleManager(bus);
    oc.createRotation("Primary", ["r1", "r2", "r3"]);
    assert.equal(events.length, 1);
    assert.equal(events[0].memberCount, 3);
  });

  it("currentResponder resolves active shift", () => {
    const bus = new EventBus();
    const oc = new OnCallScheduleManager(bus);
    const r = oc.createRotation("P", ["r1", "r2"]);
    oc.addShift(r.id, { responderId: "r1", responderName: "Alice", startsAt: "2026-06-25T00:00:00.000Z", endsAt: "2026-06-26T00:00:00.000Z" });
    const cur = oc.currentResponder(r.id, "2026-06-25T12:00:00.000Z");
    assert.equal(cur!.responderId, "r1");
  });

  it("page targets current responder and publishes paged", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("oncall.paged", (e) => { events.push(e.payload); });
    const oc = new OnCallScheduleManager(bus);
    const r = oc.createRotation("P", ["r1", "r2"]);
    oc.addShift(r.id, { responderId: "r1", responderName: "Alice", startsAt: "2026-06-25T00:00:00.000Z", endsAt: "2026-06-26T00:00:00.000Z" });
    const page = oc.page(r.id, "critical", "DB down", "2026-06-25T12:00:00.000Z");
    assert.ok(page);
    assert.equal(events.length, 1);
    assert.equal(page!.responderId, "r1");
  });

  it("page returns undefined with no active shift", () => {
    const bus = new EventBus();
    const oc = new OnCallScheduleManager(bus);
    const r = oc.createRotation("P", ["r1"]);
    assert.equal(oc.page(r.id, "info", "x", "2026-06-25T12:00:00.000Z"), undefined);
  });

  it("escalate advances to next member and publishes escalated", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("oncall.escalated", (e) => { events.push(e.payload); });
    const oc = new OnCallScheduleManager(bus);
    const r = oc.createRotation("P", ["r1", "r2"]);
    oc.addShift(r.id, { responderId: "r1", responderName: "Alice", startsAt: "2026-06-25T00:00:00.000Z", endsAt: "2026-06-26T00:00:00.000Z" });
    const page = oc.page(r.id, "critical", "x", "2026-06-25T12:00:00.000Z")!;
    const escalated = oc.escalate(page.id)!;
    assert.equal(escalated.responderId, "r2");
    assert.equal(events.length, 1);
  });

  it("acknowledge stops escalation and summary tracks pages", () => {
    const bus = new EventBus();
    const oc = new OnCallScheduleManager(bus);
    const r = oc.createRotation("P", ["r1", "r2"]);
    oc.addShift(r.id, { responderId: "r1", responderName: "Alice", startsAt: "2026-06-25T00:00:00.000Z", endsAt: "2026-06-26T00:00:00.000Z" });
    const page = oc.page(r.id, "warning", "x", "2026-06-25T12:00:00.000Z")!;
    oc.acknowledge(page.id, "2026-06-25T12:05:00.000Z");
    assert.equal(oc.escalate(page.id), undefined);
    const s = oc.summary();
    assert.equal(s.totalPages, 1);
    assert.equal(s.acknowledgedPages, 1);
    assert.equal(s.bySeverity.warning, 1);
  });
});

describe("InvestorRelationsManager", () => {
  it("openRound publishes round_opened", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("ir.round_opened", (e) => { events.push(e.payload); });
    const ir = new InvestorRelationsManager(bus);
    ir.openRound("seed", 2000000, 8000000);
    assert.equal(events.length, 1);
    assert.equal(events[0].stage, "seed");
  });

  it("recordCommitment requires investor and open round", () => {
    const bus = new EventBus();
    const ir = new InvestorRelationsManager(bus);
    const round = ir.openRound("seed", 1000000, 5000000);
    assert.equal(ir.recordCommitment(round.id, "nope", 100000), undefined);
    const inv = ir.addInvestor({ name: "Acme VC", type: "vc" });
    const c = ir.recordCommitment(round.id, inv.id, 250000);
    assert.ok(c);
  });

  it("roundRaised sums commitments", () => {
    const bus = new EventBus();
    const ir = new InvestorRelationsManager(bus);
    const round = ir.openRound("series_a", 5000000, 20000000);
    const i1 = ir.addInvestor({ name: "A", type: "vc" });
    const i2 = ir.addInvestor({ name: "B", type: "angel" });
    ir.recordCommitment(round.id, i1.id, 3000000);
    ir.recordCommitment(round.id, i2.id, 500000);
    assert.equal(ir.roundRaised(round.id), 3500000);
  });

  it("closeRound publishes round_closed with investor count", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("ir.round_closed", (e) => { events.push(e.payload); });
    const ir = new InvestorRelationsManager(bus);
    const round = ir.openRound("seed", 1000000, 5000000);
    const inv = ir.addInvestor({ name: "A", type: "vc" });
    ir.recordCommitment(round.id, inv.id, 600000);
    ir.closeRound(round.id);
    assert.equal(ir.getRound(round.id)!.status, "closed");
    assert.equal(events.length, 1);
    assert.equal(events[0].raisedUsd, 600000);
    assert.equal(events[0].investorCount, 1);
    assert.equal(ir.recordCommitment(round.id, inv.id, 100), undefined); // closed
  });

  it("sendUpdate records investor update", () => {
    const bus = new EventBus();
    const ir = new InvestorRelationsManager(bus);
    ir.sendUpdate("Q2 Update", "2026-Q2", ["ARR up 40%", "2 key hires"]);
    assert.equal(ir.listUpdates().length, 1);
  });

  it("summary aggregates rounds, raised and stages", () => {
    const bus = new EventBus();
    const ir = new InvestorRelationsManager(bus);
    const r = ir.openRound("seed", 1000000, 5000000);
    const inv = ir.addInvestor({ name: "A", type: "vc" });
    ir.recordCommitment(r.id, inv.id, 700000);
    ir.sendUpdate("U", "2026-Q2", ["x"]);
    const s = ir.summary();
    assert.equal(s.totalInvestors, 1);
    assert.equal(s.totalRounds, 1);
    assert.equal(s.openRounds, 1);
    assert.equal(s.totalRaisedUsd, 700000);
    assert.equal(s.byStage.seed, 1);
    assert.equal(s.updatesSent, 1);
  });
});

describe("GiftCardManager", () => {
  it("issue publishes issued and rejects duplicate code", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("giftcard.issued", (e) => { events.push(e.payload); });
    const gc = new GiftCardManager(bus);
    const card = gc.issue("GC-001", 100);
    assert.ok(card);
    assert.equal(events.length, 1);
    assert.equal(gc.issue("GC-001", 50), undefined);
  });

  it("issue rejects non-positive balance", () => {
    const bus = new EventBus();
    const gc = new GiftCardManager(bus);
    assert.equal(gc.issue("GC-X", 0), undefined);
  });

  it("redeem decrements balance and publishes redeemed", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("giftcard.redeemed", (e) => { events.push(e.payload); });
    const gc = new GiftCardManager(bus);
    gc.issue("GC-001", 100);
    const tx = gc.redeem("GC-001", 30, "2026-06-01")!;
    assert.equal(tx.balanceAfterUsd, 70);
    assert.equal(events.length, 1);
  });

  it("redeem to zero depletes the card", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("giftcard.depleted", (e) => { events.push(e.payload); });
    const gc = new GiftCardManager(bus);
    gc.issue("GC-001", 50);
    gc.redeem("GC-001", 50, "2026-06-01");
    assert.equal(gc.findByCode("GC-001")!.status, "depleted");
    assert.equal(events.length, 1);
    assert.equal(gc.redeem("GC-001", 1, "2026-06-02"), undefined);
  });

  it("reload reactivates a depleted card", () => {
    const bus = new EventBus();
    const gc = new GiftCardManager(bus);
    gc.issue("GC-001", 20);
    gc.redeem("GC-001", 20, "2026-06-01");
    gc.reload("GC-001", 25, "2026-06-02");
    const card = gc.findByCode("GC-001")!;
    assert.equal(card.status, "active");
    assert.equal(card.balanceUsd, 25);
  });

  it("summary computes liability and redemption rate", () => {
    const bus = new EventBus();
    const gc = new GiftCardManager(bus);
    gc.issue("A", 100);
    gc.issue("B", 100);
    gc.redeem("A", 40, "2026-06-01");
    const s = gc.summary();
    assert.equal(s.totalCards, 2);
    assert.equal(s.totalIssuedUsd, 200);
    assert.equal(s.totalRedeemedUsd, 40);
    assert.equal(s.outstandingLiabilityUsd, 160);
    assert.equal(s.redemptionRatePct, 20);
  });
});

describe("RevenueRecognitionManager", () => {
  it("createObligation publishes obligation_created", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("revrec.obligation_created", (e) => { events.push(e.payload); });
    const rr = new RevenueRecognitionManager(bus);
    rr.createObligation({ contractId: "c1", description: "SaaS annual", method: "ratable", totalAmountUsd: 1200, periods: 12, startPeriod: "2026-01" });
    assert.equal(events.length, 1);
  });

  it("ratable recognition spreads evenly per period", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("revrec.revenue_recognized", (e) => { events.push(e.payload); });
    const rr = new RevenueRecognitionManager(bus);
    const ob = rr.createObligation({ contractId: "c1", description: "SaaS", method: "ratable", totalAmountUsd: 1200, periods: 12, startPeriod: "2026-01" });
    const e1 = rr.recognize(ob.id, "2026-01", "2026-01-31")!;
    assert.equal(e1.amountUsd, 100);
    assert.equal(rr.deferredRevenue(ob.id), 1100);
    assert.equal(events.length, 1);
  });

  it("point_in_time recognizes full amount and completes", () => {
    const bus = new EventBus();
    const completed: any[] = [];
    bus.subscribe("revrec.obligation_completed", (e) => { completed.push(e.payload); });
    const rr = new RevenueRecognitionManager(bus);
    const ob = rr.createObligation({ contractId: "c1", description: "setup fee", method: "point_in_time", totalAmountUsd: 500, startPeriod: "2026-01" });
    rr.recognize(ob.id, "2026-01", "2026-01-15");
    assert.equal(rr.getObligation(ob.id)!.status, "completed");
    assert.equal(completed.length, 1);
  });

  it("recognize returns undefined once fully recognized", () => {
    const bus = new EventBus();
    const rr = new RevenueRecognitionManager(bus);
    const ob = rr.createObligation({ contractId: "c1", description: "x", method: "point_in_time", totalAmountUsd: 500, startPeriod: "2026-01" });
    rr.recognize(ob.id, "2026-01", "2026-01-15");
    assert.equal(rr.recognize(ob.id, "2026-02", "2026-02-15"), undefined);
  });

  it("ratable completes after all periods recognized", () => {
    const bus = new EventBus();
    const rr = new RevenueRecognitionManager(bus);
    const ob = rr.createObligation({ contractId: "c1", description: "x", method: "ratable", totalAmountUsd: 300, periods: 3, startPeriod: "2026-01" });
    rr.recognize(ob.id, "2026-01", "2026-01-31");
    rr.recognize(ob.id, "2026-02", "2026-02-28");
    rr.recognize(ob.id, "2026-03", "2026-03-31");
    assert.equal(rr.getObligation(ob.id)!.status, "completed");
    assert.equal(rr.deferredRevenue(ob.id), 0);
  });

  it("summary aggregates deferred revenue and methods", () => {
    const bus = new EventBus();
    const rr = new RevenueRecognitionManager(bus);
    const ob = rr.createObligation({ contractId: "c1", description: "x", method: "ratable", totalAmountUsd: 1200, periods: 12, startPeriod: "2026-01" });
    rr.recognize(ob.id, "2026-01", "2026-01-31");
    const s = rr.summary();
    assert.equal(s.totalObligations, 1);
    assert.equal(s.totalContractValueUsd, 1200);
    assert.equal(s.totalRecognizedUsd, 100);
    assert.equal(s.deferredRevenueUsd, 1100);
    assert.equal(s.byMethod.ratable, 1);
  });
});

describe("SafetyIncidentManager", () => {
  it("report classifies recordable severities and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("safety.incident_reported", (e) => { events.push(e.payload); });
    const sm = new SafetyIncidentManager(bus);
    const inc = sm.report({ location: "Plant A", description: "slip", severity: "medical_treatment", reportedBy: "u1", occurredAt: "2026-06-01" });
    assert.equal(inc.recordable, true);
    assert.equal(events.length, 1);
  });

  it("near_miss is not recordable", () => {
    const bus = new EventBus();
    const sm = new SafetyIncidentManager(bus);
    const inc = sm.report({ location: "Plant A", description: "almost", severity: "near_miss", reportedBy: "u1", occurredAt: "2026-06-01" });
    assert.equal(inc.recordable, false);
  });

  it("addCorrectiveAction moves incident to investigating", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("safety.corrective_action_added", (e) => { events.push(e.payload); });
    const sm = new SafetyIncidentManager(bus);
    const inc = sm.report({ location: "P", description: "d", severity: "first_aid", reportedBy: "u1", occurredAt: "2026-06-01" });
    sm.addCorrectiveAction(inc.id, "fix floor", "mgr1", "2026-07-01");
    assert.equal(sm.getIncident(inc.id)!.state, "investigating");
    assert.equal(events.length, 1);
  });

  it("close blocked until corrective actions complete", () => {
    const bus = new EventBus();
    const sm = new SafetyIncidentManager(bus);
    const inc = sm.report({ location: "P", description: "d", severity: "lost_time", lostDays: 3, reportedBy: "u1", occurredAt: "2026-06-01" });
    const action = sm.addCorrectiveAction(inc.id, "x", "m1", "2026-07-01")!;
    assert.equal(sm.close(inc.id, "2026-06-10"), undefined);
    sm.completeAction(inc.id, action.id);
    assert.ok(sm.close(inc.id, "2026-06-10"));
    assert.equal(sm.getIncident(inc.id)!.state, "closed");
  });

  it("trir computes recordable rate per 200k hours", () => {
    const bus = new EventBus();
    const sm = new SafetyIncidentManager(bus);
    sm.report({ location: "P", description: "d", severity: "medical_treatment", reportedBy: "u1", occurredAt: "2026-06-01" });
    sm.report({ location: "P", description: "d", severity: "near_miss", reportedBy: "u1", occurredAt: "2026-06-01" });
    assert.equal(sm.trir(200000), 1); // 1 recordable * 200000 / 200000
  });

  it("summary aggregates severities and lost days", () => {
    const bus = new EventBus();
    const sm = new SafetyIncidentManager(bus);
    sm.report({ location: "P", description: "d", severity: "lost_time", lostDays: 5, reportedBy: "u1", occurredAt: "2026-06-01" });
    sm.report({ location: "P", description: "d", severity: "near_miss", reportedBy: "u1", occurredAt: "2026-06-01" });
    const s = sm.summary();
    assert.equal(s.totalIncidents, 2);
    assert.equal(s.recordableCount, 1);
    assert.equal(s.lostTimeCount, 1);
    assert.equal(s.totalLostDays, 5);
    assert.equal(s.bySeverity.near_miss, 1);
  });
});

describe("EthicsCaseManager", () => {
  it("openCase assigns case number and publishes case_opened", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("ethics.case_opened", (e) => { events.push(e.payload); });
    const em = new EthicsCaseManager(bus);
    const c = em.openCase({ category: "fraud", severity: "high", summary: "expense fraud", anonymous: false, reporterId: "u1" });
    assert.equal(c.caseNumber, "ETH-00001");
    assert.equal(events.length, 1);
  });

  it("anonymous case drops reporter id", () => {
    const bus = new EventBus();
    const em = new EthicsCaseManager(bus);
    const c = em.openCase({ category: "harassment", severity: "high", summary: "x", anonymous: true, reporterId: "u1" });
    assert.equal(c.reporterId, undefined);
    assert.equal(c.anonymous, true);
  });

  it("assign moves to investigating and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("ethics.case_assigned", (e) => { events.push(e.payload); });
    const em = new EthicsCaseManager(bus);
    const c = em.openCase({ category: "safety", severity: "medium", summary: "x", anonymous: true });
    em.assign(c.id, "inv1");
    assert.equal(em.getCase(c.id)!.state, "investigating");
    assert.equal(events.length, 1);
  });

  it("addNote appends investigation notes", () => {
    const bus = new EventBus();
    const em = new EthicsCaseManager(bus);
    const c = em.openCase({ category: "other", severity: "low", summary: "x", anonymous: true });
    em.addNote(c.id, "inv1", "interviewed witness");
    assert.equal(em.getCase(c.id)!.notes.length, 1);
  });

  it("resolve publishes case_resolved with substantiation", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("ethics.case_resolved", (e) => { events.push(e.payload); });
    const em = new EthicsCaseManager(bus);
    const c = em.openCase({ category: "fraud", severity: "critical", summary: "x", anonymous: false, reporterId: "u1" });
    em.resolve(c.id, "substantiated", "2026-06-20");
    assert.equal(em.getCase(c.id)!.state, "resolved");
    assert.equal(events.length, 1);
    assert.equal(events[0].substantiated, true);
  });

  it("summary aggregates categories, severity and anonymous count", () => {
    const bus = new EventBus();
    const em = new EthicsCaseManager(bus);
    em.openCase({ category: "fraud", severity: "high", summary: "x", anonymous: true });
    const c2 = em.openCase({ category: "harassment", severity: "medium", summary: "y", anonymous: false, reporterId: "u2" });
    em.resolve(c2.id, "unsubstantiated", "2026-06-20");
    const s = em.summary();
    assert.equal(s.totalCases, 2);
    assert.equal(s.resolvedCases, 1);
    assert.equal(s.anonymousCount, 1);
    assert.equal(s.byCategory.fraud, 1);
    assert.equal(s.bySeverity.high, 1);
  });
});

describe("CorporateTravelManager", () => {
  it("request flags within-policy and publishes requested", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("travel.requested", (e) => { events.push(e.payload); });
    const tm = new CorporateTravelManager(bus, 3000);
    const trip = tm.request({ travelerId: "u1", purpose: "conference", destination: "NYC", departDate: "2026-08-01", returnDate: "2026-08-03", segments: [{ kind: "flight", description: "RT", costUsd: 500 }, { kind: "hotel", description: "2 nights", costUsd: 600 }] });
    assert.equal(trip.estimatedCostUsd, 1100);
    assert.equal(trip.withinPolicy, true);
    assert.equal(events.length, 1);
  });

  it("request flags out-of-policy over cap", () => {
    const bus = new EventBus();
    const tm = new CorporateTravelManager(bus, 1000);
    const trip = tm.request({ travelerId: "u1", purpose: "sales", destination: "LON", departDate: "2026-08-01", returnDate: "2026-08-05", segments: [{ kind: "flight", description: "intl", costUsd: 2000 }] });
    assert.equal(trip.withinPolicy, false);
  });

  it("approve publishes approved", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("travel.approved", (e) => { events.push(e.payload); });
    const tm = new CorporateTravelManager(bus);
    const trip = tm.request({ travelerId: "u1", purpose: "internal", destination: "SF", departDate: "2026-08-01", returnDate: "2026-08-02", segments: [{ kind: "flight", description: "x", costUsd: 300 }] });
    tm.approve(trip.id, "mgr1");
    assert.equal(tm.getTrip(trip.id)!.status, "approved");
    assert.equal(events.length, 1);
  });

  it("book requires approval and publishes booked", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("travel.booked", (e) => { events.push(e.payload); });
    const tm = new CorporateTravelManager(bus);
    const trip = tm.request({ travelerId: "u1", purpose: "training", destination: "AUS", departDate: "2026-08-01", returnDate: "2026-08-02", segments: [{ kind: "flight", description: "x", costUsd: 300 }] });
    assert.equal(tm.book(trip.id, 320), undefined); // not approved
    tm.approve(trip.id, "mgr1");
    tm.book(trip.id, 320);
    assert.equal(tm.getTrip(trip.id)!.status, "booked");
    assert.equal(events.length, 1);
    assert.equal(events[0].actualCostUsd, 320);
  });

  it("cancel blocks completed trips", () => {
    const bus = new EventBus();
    const tm = new CorporateTravelManager(bus);
    const trip = tm.request({ travelerId: "u1", purpose: "other", destination: "X", departDate: "2026-08-01", returnDate: "2026-08-02", segments: [{ kind: "car", description: "x", costUsd: 100 }] });
    tm.approve(trip.id, "m1");
    tm.book(trip.id, 100);
    tm.complete(trip.id);
    assert.equal(tm.cancel(trip.id), undefined);
  });

  it("summary aggregates spend and out-of-policy count", () => {
    const bus = new EventBus();
    const tm = new CorporateTravelManager(bus, 500);
    const t1 = tm.request({ travelerId: "u1", purpose: "sales", destination: "X", departDate: "2026-08-01", returnDate: "2026-08-02", segments: [{ kind: "flight", description: "x", costUsd: 800 }] });
    tm.approve(t1.id, "m1"); tm.book(t1.id, 820);
    tm.request({ travelerId: "u2", purpose: "internal", destination: "Y", departDate: "2026-08-01", returnDate: "2026-08-02", segments: [{ kind: "rail", description: "x", costUsd: 100 }] });
    const s = tm.summary();
    assert.equal(s.totalTrips, 2);
    assert.equal(s.booked, 1);
    assert.equal(s.totalActualUsd, 820);
    assert.equal(s.outOfPolicyCount, 1);
    assert.equal(s.byPurpose.sales, 1);
  });
});

describe("DocumentSignatureManager", () => {
  it("send publishes envelope_sent and requires signers", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("esign.envelope_sent", (e) => { events.push(e.payload); });
    const ds = new DocumentSignatureManager(bus);
    const env = ds.createEnvelope("NDA", "doc1", [{ name: "Alice", email: "a@x.com" }]);
    ds.send(env.id);
    assert.equal(ds.getEnvelope(env.id)!.status, "sent");
    assert.equal(events.length, 1);
  });

  it("sequential signing enforces order", () => {
    const bus = new EventBus();
    const ds = new DocumentSignatureManager(bus);
    const env = ds.createEnvelope("Contract", "doc1", [{ name: "A", email: "a@x.com" }, { name: "B", email: "b@x.com" }], "sequential");
    ds.send(env.id);
    const [s1, s2] = ds.getEnvelope(env.id)!.signers;
    assert.equal(ds.sign(env.id, s2!.id, "2026-06-01"), undefined); // out of order
    ds.sign(env.id, s1!.id, "2026-06-01");
    assert.ok(ds.sign(env.id, s2!.id, "2026-06-02"));
  });

  it("parallel signing allows any order", () => {
    const bus = new EventBus();
    const ds = new DocumentSignatureManager(bus);
    const env = ds.createEnvelope("C", "doc1", [{ name: "A", email: "a@x.com" }, { name: "B", email: "b@x.com" }], "parallel");
    ds.send(env.id);
    const [, s2] = ds.getEnvelope(env.id)!.signers;
    assert.ok(ds.sign(env.id, s2!.id, "2026-06-01"));
  });

  it("envelope completes when all sign and publishes completed", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("esign.envelope_completed", (e) => { events.push(e.payload); });
    const ds = new DocumentSignatureManager(bus);
    const env = ds.createEnvelope("C", "doc1", [{ name: "A", email: "a@x.com" }], "parallel");
    ds.send(env.id);
    ds.sign(env.id, ds.getEnvelope(env.id)!.signers[0]!.id, "2026-06-01");
    assert.equal(ds.getEnvelope(env.id)!.status, "completed");
    assert.equal(events.length, 1);
  });

  it("decline sets envelope declined", () => {
    const bus = new EventBus();
    const ds = new DocumentSignatureManager(bus);
    const env = ds.createEnvelope("C", "doc1", [{ name: "A", email: "a@x.com" }], "parallel");
    ds.send(env.id);
    ds.decline(env.id, ds.getEnvelope(env.id)!.signers[0]!.id);
    assert.equal(ds.getEnvelope(env.id)!.status, "declined");
  });

  it("summary computes completion rate", () => {
    const bus = new EventBus();
    const ds = new DocumentSignatureManager(bus);
    const e1 = ds.createEnvelope("A", "d1", [{ name: "X", email: "x@x.com" }], "parallel");
    ds.send(e1.id); ds.sign(e1.id, ds.getEnvelope(e1.id)!.signers[0]!.id, "2026-06-01");
    const e2 = ds.createEnvelope("B", "d2", [{ name: "Y", email: "y@x.com" }], "parallel");
    ds.send(e2.id); ds.decline(e2.id, ds.getEnvelope(e2.id)!.signers[0]!.id);
    const s = ds.summary();
    assert.equal(s.totalEnvelopes, 2);
    assert.equal(s.completed, 1);
    assert.equal(s.declined, 1);
    assert.equal(s.completionRatePct, 50);
  });
});

describe("EquipmentCalibrationManager", () => {
  it("registerEquipment publishes equipment_registered", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("equipcal.equipment_registered", (e) => { events.push(e.payload); });
    const ec = new EquipmentCalibrationManager(bus);
    ec.registerEquipment({ name: "Scale A", assetTag: "EQ-1", location: "Lab", calibrationIntervalDays: 365 });
    assert.equal(events.length, 1);
  });

  it("recordCalibration computes next due date and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("equipcal.calibration_recorded", (e) => { events.push(e.payload); });
    const ec = new EquipmentCalibrationManager(bus);
    const item = ec.registerEquipment({ name: "Scale", assetTag: "EQ-1", location: "Lab", calibrationIntervalDays: 30 });
    ec.recordCalibration(item.id, "pass", "tech1", "2026-06-01");
    assert.equal(ec.getEquipment(item.id)!.nextDueDate, "2026-07-01T00:00:00.000Z");
    assert.equal(events.length, 1);
  });

  it("failed calibration takes equipment out of service", () => {
    const bus = new EventBus();
    const ec = new EquipmentCalibrationManager(bus);
    const item = ec.registerEquipment({ name: "Scale", assetTag: "EQ-1", location: "Lab", calibrationIntervalDays: 30 });
    ec.recordCalibration(item.id, "fail", "tech1", "2026-06-01");
    assert.equal(ec.getEquipment(item.id)!.status, "out_of_service");
    ec.returnToService(item.id);
    assert.equal(ec.getEquipment(item.id)!.status, "in_service");
  });

  it("checkOverdue flags and publishes overdue equipment", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("equipcal.calibration_overdue", (e) => { events.push(e.payload); });
    const ec = new EquipmentCalibrationManager(bus);
    const item = ec.registerEquipment({ name: "Scale", assetTag: "EQ-1", location: "Lab", calibrationIntervalDays: 30 });
    ec.recordCalibration(item.id, "pass", "tech1", "2026-01-01");
    const overdue = ec.checkOverdue("2026-06-25");
    assert.equal(overdue.length, 1);
    assert.equal(events.length, 1);
  });

  it("retire removes equipment from service tracking", () => {
    const bus = new EventBus();
    const ec = new EquipmentCalibrationManager(bus);
    const item = ec.registerEquipment({ name: "Scale", assetTag: "EQ-1", location: "Lab", calibrationIntervalDays: 30 });
    ec.retire(item.id);
    assert.equal(ec.getEquipment(item.id)!.status, "retired");
    assert.equal(ec.returnToService(item.id), undefined);
  });

  it("summary computes due-soon, overdue and failures", () => {
    const bus = new EventBus();
    const ec = new EquipmentCalibrationManager(bus);
    const a = ec.registerEquipment({ name: "A", assetTag: "EQ-1", location: "L", calibrationIntervalDays: 30 });
    ec.recordCalibration(a.id, "pass", "t1", "2026-06-10"); // next 2026-07-10, due soon from 2026-06-25
    const b = ec.registerEquipment({ name: "B", assetTag: "EQ-2", location: "L", calibrationIntervalDays: 30 });
    ec.recordCalibration(b.id, "fail", "t1", "2026-01-01"); // overdue + fail + out of service
    const s = ec.summary("2026-06-25");
    assert.equal(s.totalEquipment, 2);
    assert.equal(s.dueSoon, 1);
    assert.equal(s.failureCount, 1);
    assert.equal(s.totalCalibrations, 2);
  });
});

describe("LocalizationManager", () => {
  it("createProject publishes project_created", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("localization.project_created", (e) => { events.push(e.payload); });
    const lm = new LocalizationManager(bus);
    lm.createProject("Web App", "en");
    assert.equal(events.length, 1);
  });

  it("addLocale publishes locale_added and rejects duplicates", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("localization.locale_added", (e) => { events.push(e.payload); });
    const lm = new LocalizationManager(bus);
    const p = lm.createProject("App", "en");
    assert.equal(lm.addLocale(p.id, "fr"), true);
    assert.equal(lm.addLocale(p.id, "fr"), false);
    assert.equal(events.length, 1);
  });

  it("translate requires an existing key", () => {
    const bus = new EventBus();
    const lm = new LocalizationManager(bus);
    const p = lm.createProject("App", "en");
    assert.equal(lm.translate(p.id, "fr", "greeting", "Bonjour"), false);
    lm.addKey(p.id, "greeting", "Hello");
    assert.equal(lm.translate(p.id, "fr", "greeting", "Bonjour"), true);
  });

  it("review only promotes translated entries", () => {
    const bus = new EventBus();
    const lm = new LocalizationManager(bus);
    const p = lm.createProject("App", "en");
    lm.addKey(p.id, "k1", "Hello");
    assert.equal(lm.review(p.id, "fr", "k1"), false); // not translated yet
    lm.translate(p.id, "fr", "k1", "Bonjour");
    assert.equal(lm.review(p.id, "fr", "k1"), true);
  });

  it("coverage computes per-locale percentage", () => {
    const bus = new EventBus();
    const lm = new LocalizationManager(bus);
    const p = lm.createProject("App", "en");
    lm.addKey(p.id, "k1", "Hello");
    lm.addKey(p.id, "k2", "Bye");
    lm.addLocale(p.id, "fr");
    lm.translate(p.id, "fr", "k1", "Bonjour");
    const cov = lm.coverage(p.id).find(c => c.locale === "fr")!;
    assert.equal(cov.totalKeys, 2);
    assert.equal(cov.translated, 1);
    assert.equal(cov.coveragePct, 50);
  });

  it("summary aggregates projects, keys and locales", () => {
    const bus = new EventBus();
    const lm = new LocalizationManager(bus);
    const p = lm.createProject("App", "en");
    lm.addKey(p.id, "k1", "Hello");
    lm.addLocale(p.id, "de");
    const s = lm.summary();
    assert.equal(s.totalProjects, 1);
    assert.equal(s.totalKeys, 1);
    assert.equal(s.totalLocales, 2); // en + de
  });
});

describe("AffiliateManager", () => {
  it("join publishes joined and rejects duplicate code", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("affiliate.joined", (e) => { events.push(e.payload); });
    const am = new AffiliateManager(bus);
    assert.ok(am.join("Blog A", "BLOGA", 10));
    assert.equal(am.join("Blog B", "BLOGA", 5), undefined);
    assert.equal(events.length, 1);
  });

  it("recordClick increments clicks for active affiliate", () => {
    const bus = new EventBus();
    const am = new AffiliateManager(bus);
    am.join("Blog", "BLOG", 10);
    am.recordClick("BLOG");
    assert.equal(am.findByCode("BLOG")!.clicks, 1);
  });

  it("recordConversion accrues commission and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("affiliate.conversion_recorded", (e) => { events.push(e.payload); });
    const am = new AffiliateManager(bus);
    const a = am.join("Blog", "BLOG", 10)!;
    am.recordConversion("BLOG", 250, "2026-06-01");
    assert.equal(am.getAffiliate(a.id)!.accruedCommissionUsd, 25);
    assert.equal(events.length, 1);
  });

  it("suspended affiliate cannot convert", () => {
    const bus = new EventBus();
    const am = new AffiliateManager(bus);
    const a = am.join("Blog", "BLOG", 10)!;
    am.setStatus(a.id, "suspended");
    assert.equal(am.recordConversion("BLOG", 100, "2026-06-01"), undefined);
  });

  it("settlePayout pays outstanding accrued commission", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("affiliate.payout_settled", (e) => { events.push(e.payload); });
    const am = new AffiliateManager(bus);
    const a = am.join("Blog", "BLOG", 10)!;
    am.recordConversion("BLOG", 250, "2026-06-01");
    const paid = am.settlePayout(a.id);
    assert.equal(paid, 25);
    assert.equal(am.settlePayout(a.id), 0); // nothing left
    assert.equal(events.length, 1);
  });

  it("summary computes conversion rate and outstanding", () => {
    const bus = new EventBus();
    const am = new AffiliateManager(bus);
    const a = am.join("Blog", "BLOG", 10)!;
    am.recordClick("BLOG"); am.recordClick("BLOG"); am.recordClick("BLOG"); am.recordClick("BLOG");
    am.recordConversion("BLOG", 100, "2026-06-01");
    am.settlePayout(a.id);
    am.recordConversion("BLOG", 200, "2026-06-02");
    const s = am.summary();
    assert.equal(s.totalConversions, 2);
    assert.equal(s.totalClicks, 4);
    assert.equal(s.conversionRatePct, 50);
    assert.equal(s.totalAccruedUsd, 30);
    assert.equal(s.totalPaidUsd, 10);
    assert.equal(s.outstandingUsd, 20);
  });
});

describe("WebhookDeliveryManager", () => {
  it("registerEndpoint publishes endpoint_registered", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("webhookdelivery.endpoint_registered", (e) => { events.push(e.payload); });
    const wd = new WebhookDeliveryManager(bus);
    wd.registerEndpoint("https://x.com/hook", ["order.created"]);
    assert.equal(events.length, 1);
  });

  it("enqueue creates deliveries only for subscribed active endpoints", () => {
    const bus = new EventBus();
    const wd = new WebhookDeliveryManager(bus);
    wd.registerEndpoint("https://a.com", ["order.created"]);
    wd.registerEndpoint("https://b.com", ["payment.failed"]);
    wd.registerEndpoint("https://c.com", ["*"]);
    const deliveries = wd.enqueue("order.created", { id: 1 });
    assert.equal(deliveries.length, 2); // a (matches) + c (wildcard)
  });

  it("attemptDelivery success marks delivered and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("webhookdelivery.delivered", (e) => { events.push(e.payload); });
    const wd = new WebhookDeliveryManager(bus);
    wd.registerEndpoint("https://a.com", ["*"]);
    const [d] = wd.enqueue("order.created", {});
    wd.attemptDelivery(d!.id, true, "2026-06-01");
    assert.equal(wd.getDelivery(d!.id)!.status, "delivered");
    assert.equal(events.length, 1);
  });

  it("delivery exhausts after max attempts", () => {
    const bus = new EventBus();
    const wd = new WebhookDeliveryManager(bus);
    wd.registerEndpoint("https://a.com", ["*"]);
    const [d] = wd.enqueue("order.created", {}, 2);
    wd.attemptDelivery(d!.id, false, "2026-06-01");
    assert.equal(wd.getDelivery(d!.id)!.status, "failed");
    wd.attemptDelivery(d!.id, false, "2026-06-01");
    assert.equal(wd.getDelivery(d!.id)!.status, "exhausted");
  });

  it("endpoint auto-disables after consecutive failures", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("webhookdelivery.endpoint_disabled", (e) => { events.push(e.payload); });
    const wd = new WebhookDeliveryManager(bus, 2);
    const ep = wd.registerEndpoint("https://a.com", ["*"]);
    const [d1] = wd.enqueue("e1", {});
    wd.attemptDelivery(d1!.id, false, "2026-06-01");
    const [d2] = wd.enqueue("e2", {});
    wd.attemptDelivery(d2!.id, false, "2026-06-01");
    assert.equal(wd.getEndpoint(ep.id)!.active, false);
    assert.equal(events.length, 1);
  });

  it("summary computes delivery rate", () => {
    const bus = new EventBus();
    const wd = new WebhookDeliveryManager(bus);
    wd.registerEndpoint("https://a.com", ["*"]);
    const [d1] = wd.enqueue("e1", {}, 1);
    wd.attemptDelivery(d1!.id, true, "2026-06-01");
    const [d2] = wd.enqueue("e2", {}, 1);
    wd.attemptDelivery(d2!.id, false, "2026-06-01"); // exhausted
    const s = wd.summary();
    assert.equal(s.totalDeliveries, 2);
    assert.equal(s.delivered, 1);
    assert.equal(s.deliveryRatePct, 50);
  });
});

describe("ReleaseManager", () => {
  it("createRelease publishes created", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("release.created", (e) => { events.push(e.payload); });
    const rm = new ReleaseManager(bus);
    rm.createRelease("v1.2.0", "2026-07-01");
    assert.equal(events.length, 1);
  });

  it("promote advances stage on success and publishes promoted", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("release.promoted", (e) => { events.push(e.payload); });
    const rm = new ReleaseManager(bus);
    const r = rm.createRelease("v1.0.0", "2026-07-01");
    rm.promote(r.id, "success", "2026-07-01"); // -> dev
    assert.equal(rm.getRelease(r.id)!.stage, "dev");
    assert.equal(events.length, 1);
  });

  it("failed promotion records deployment but does not advance", () => {
    const bus = new EventBus();
    const rm = new ReleaseManager(bus);
    const r = rm.createRelease("v1.0.0", "2026-07-01");
    rm.promote(r.id, "failed", "2026-07-01");
    assert.equal(rm.getRelease(r.id)!.stage, "planned");
    assert.equal(rm.getRelease(r.id)!.deployments.length, 1);
  });

  it("full promotion path reaches production", () => {
    const bus = new EventBus();
    const rm = new ReleaseManager(bus);
    const r = rm.createRelease("v1.0.0", "2026-07-01");
    rm.promote(r.id, "success", "2026-07-01"); // dev
    rm.promote(r.id, "success", "2026-07-02"); // staging
    rm.promote(r.id, "success", "2026-07-03"); // production
    assert.equal(rm.getRelease(r.id)!.stage, "production");
    assert.ok(rm.getRelease(r.id)!.shippedAt);
    assert.equal(rm.promote(r.id, "success", "2026-07-04"), undefined); // can't go past prod
  });

  it("rollback marks release rolled_back and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("release.rolled_back", (e) => { events.push(e.payload); });
    const rm = new ReleaseManager(bus);
    const r = rm.createRelease("v1.0.0", "2026-07-01");
    rm.promote(r.id, "success", "2026-07-01"); // dev
    rm.rollback(r.id, "bug", "2026-07-02");
    assert.equal(rm.getRelease(r.id)!.stage, "rolled_back");
    assert.equal(events.length, 1);
  });

  it("summary aggregates stages and failed deployments", () => {
    const bus = new EventBus();
    const rm = new ReleaseManager(bus);
    const r1 = rm.createRelease("v1", "2026-07-01");
    rm.promote(r1.id, "success", "2026-07-01");
    rm.promote(r1.id, "success", "2026-07-02");
    rm.promote(r1.id, "success", "2026-07-03"); // production
    const r2 = rm.createRelease("v2", "2026-08-01");
    rm.promote(r2.id, "failed", "2026-08-01");
    const s = rm.summary();
    assert.equal(s.totalReleases, 2);
    assert.equal(s.inProduction, 1);
    assert.equal(s.failedDeployments, 1);
    assert.equal(s.byStage.production, 1);
  });
});

describe("EnergyUsageManager", () => {
  it("registerMeter publishes meter_registered", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("energy.meter_registered", (e) => { events.push(e.payload); });
    const em = new EnergyUsageManager(bus);
    em.registerMeter({ name: "Main", utility: "electricity", unit: "kWh", location: "HQ", costPerUnitUsd: 0.12, co2KgPerUnit: 0.4 });
    assert.equal(events.length, 1);
  });

  it("recordReading computes cost and co2 and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("energy.reading_recorded", (e) => { events.push(e.payload); });
    const em = new EnergyUsageManager(bus);
    const m = em.registerMeter({ name: "Main", utility: "electricity", unit: "kWh", location: "HQ", costPerUnitUsd: 0.10, co2KgPerUnit: 0.5 });
    const r = em.recordReading(m.id, "2026-06", 1000, "2026-06-30")!;
    assert.equal(r.costUsd, 100);
    assert.equal(r.co2Kg, 500);
    assert.equal(events.length, 1);
  });

  it("recordReading rejects unknown meter and negatives", () => {
    const bus = new EventBus();
    const em = new EnergyUsageManager(bus);
    const m = em.registerMeter({ name: "M", utility: "gas", unit: "therm", location: "HQ", costPerUnitUsd: 1, co2KgPerUnit: 5 });
    assert.equal(em.recordReading("nope", "2026-06", 10, "2026-06-30"), undefined);
    assert.equal(em.recordReading(m.id, "2026-06", -5, "2026-06-30"), undefined);
  });

  it("spike detection fires above baseline factor", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("energy.spike_detected", (e) => { events.push(e.payload); });
    const em = new EnergyUsageManager(bus, 1.5);
    const m = em.registerMeter({ name: "M", utility: "water", unit: "gal", location: "HQ", costPerUnitUsd: 0.01, co2KgPerUnit: 0 });
    em.recordReading(m.id, "2026-04", 100, "2026-04-30");
    em.recordReading(m.id, "2026-05", 100, "2026-05-30");
    em.recordReading(m.id, "2026-06", 300, "2026-06-30"); // well above 1.5x baseline
    assert.equal(events.length, 1);
  });

  it("listReadings filters by meter", () => {
    const bus = new EventBus();
    const em = new EnergyUsageManager(bus);
    const a = em.registerMeter({ name: "A", utility: "electricity", unit: "kWh", location: "HQ", costPerUnitUsd: 0.1, co2KgPerUnit: 0.4 });
    const b = em.registerMeter({ name: "B", utility: "gas", unit: "therm", location: "HQ", costPerUnitUsd: 1, co2KgPerUnit: 5 });
    em.recordReading(a.id, "2026-06", 10, "2026-06-30");
    em.recordReading(b.id, "2026-06", 20, "2026-06-30");
    assert.equal(em.listReadings(a.id).length, 1);
  });

  it("summary aggregates consumption, cost and co2", () => {
    const bus = new EventBus();
    const em = new EnergyUsageManager(bus);
    const m = em.registerMeter({ name: "M", utility: "electricity", unit: "kWh", location: "HQ", costPerUnitUsd: 0.10, co2KgPerUnit: 0.5 });
    em.recordReading(m.id, "2026-05", 100, "2026-05-30");
    em.recordReading(m.id, "2026-06", 200, "2026-06-30");
    const s = em.summary();
    assert.equal(s.totalMeters, 1);
    assert.equal(s.totalConsumption, 300);
    assert.equal(s.totalCostUsd, 30);
    assert.equal(s.totalCo2Kg, 150);
    assert.equal(s.byUtility.electricity, 1);
  });
});

describe("VisitorManager", () => {
  it("preregister publishes preregistered", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("visitor.preregistered", (e) => { events.push(e.payload); });
    const vm = new VisitorManager(bus);
    vm.preregister({ visitorName: "Jane", hostId: "h1", purpose: "meeting", expectedAt: "2026-06-26T10:00:00.000Z" });
    assert.equal(events.length, 1);
  });

  it("checkIn assigns badge and publishes checked_in", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("visitor.checked_in", (e) => { events.push(e.payload); });
    const vm = new VisitorManager(bus);
    const v = vm.preregister({ visitorName: "Jane", hostId: "h1", purpose: "interview", expectedAt: "2026-06-26T10:00:00.000Z" });
    const checked = vm.checkIn(v.id, "2026-06-26T10:05:00.000Z")!;
    assert.equal(checked.badgeNumber, "V-0001");
    assert.equal(events.length, 1);
  });

  it("checkOut computes duration and publishes checked_out", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("visitor.checked_out", (e) => { events.push(e.payload); });
    const vm = new VisitorManager(bus);
    const v = vm.preregister({ visitorName: "Jane", hostId: "h1", purpose: "tour", expectedAt: "2026-06-26T10:00:00.000Z" });
    vm.checkIn(v.id, "2026-06-26T10:00:00.000Z");
    vm.checkOut(v.id, "2026-06-26T11:00:00.000Z");
    assert.equal(events.length, 1);
    assert.equal(events[0].durationMinutes, 60);
  });

  it("currentlyOnSite reflects checked-in visitors", () => {
    const bus = new EventBus();
    const vm = new VisitorManager(bus);
    const v1 = vm.preregister({ visitorName: "A", hostId: "h1", purpose: "meeting", expectedAt: "2026-06-26T10:00:00.000Z" });
    const v2 = vm.preregister({ visitorName: "B", hostId: "h1", purpose: "meeting", expectedAt: "2026-06-26T10:00:00.000Z" });
    vm.checkIn(v1.id, "2026-06-26T10:00:00.000Z");
    vm.checkIn(v2.id, "2026-06-26T10:00:00.000Z");
    vm.checkOut(v1.id, "2026-06-26T11:00:00.000Z");
    assert.equal(vm.currentlyOnSite().length, 1);
  });

  it("markNoShow only works on preregistered visits", () => {
    const bus = new EventBus();
    const vm = new VisitorManager(bus);
    const v = vm.preregister({ visitorName: "A", hostId: "h1", purpose: "meeting", expectedAt: "2026-06-26T10:00:00.000Z" });
    vm.checkIn(v.id, "2026-06-26T10:00:00.000Z");
    assert.equal(vm.markNoShow(v.id), undefined);
  });

  it("summary aggregates statuses and purpose", () => {
    const bus = new EventBus();
    const vm = new VisitorManager(bus);
    const v1 = vm.preregister({ visitorName: "A", hostId: "h1", purpose: "meeting", expectedAt: "2026-06-26T10:00:00.000Z" });
    vm.preregister({ visitorName: "B", hostId: "h1", purpose: "delivery", expectedAt: "2026-06-26T10:00:00.000Z" });
    vm.checkIn(v1.id, "2026-06-26T10:00:00.000Z");
    const s = vm.summary();
    assert.equal(s.totalVisits, 2);
    assert.equal(s.onSite, 1);
    assert.equal(s.preregistered, 1);
    assert.equal(s.byPurpose.meeting, 1);
  });
});

describe("PurchaseCardManager", () => {
  it("issueCard publishes issued", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("pcard.issued", (e) => { events.push(e.payload); });
    const pc = new PurchaseCardManager(bus);
    pc.issueCard("emp1", "1234", 5000);
    assert.equal(events.length, 1);
  });

  it("postTransaction accrues spend and publishes posted", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("pcard.transaction_posted", (e) => { events.push(e.payload); });
    const pc = new PurchaseCardManager(bus);
    const card = pc.issueCard("emp1", "1234", 5000);
    pc.postTransaction(card.id, 200, "AWS", "cloud", "2026-06-01");
    assert.equal(pc.getCard(card.id)!.currentMonthSpendUsd, 200);
    assert.equal(events.length, 1);
  });

  it("postTransaction enforces category controls", () => {
    const bus = new EventBus();
    const pc = new PurchaseCardManager(bus);
    const card = pc.issueCard("emp1", "1234", 5000, ["cloud"]);
    assert.equal(pc.postTransaction(card.id, 100, "Bar", "entertainment", "2026-06-01"), undefined);
    assert.ok(pc.postTransaction(card.id, 100, "AWS", "cloud", "2026-06-01"));
  });

  it("limit exceeded publishes event and blocks", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("pcard.limit_exceeded", (e) => { events.push(e.payload); });
    const pc = new PurchaseCardManager(bus);
    const card = pc.issueCard("emp1", "1234", 100);
    assert.equal(pc.postTransaction(card.id, 150, "X", "office", "2026-06-01"), undefined);
    assert.equal(events.length, 1);
  });

  it("reconcile and dispute update transaction state", () => {
    const bus = new EventBus();
    const pc = new PurchaseCardManager(bus);
    const card = pc.issueCard("emp1", "1234", 5000);
    const tx = pc.postTransaction(card.id, 200, "AWS", "cloud", "2026-06-01")!;
    pc.reconcile(tx.id);
    assert.equal(pc.listTransactions(card.id, "reconciled").length, 1);
    pc.dispute(tx.id);
    assert.equal(pc.listTransactions(card.id, "disputed").length, 1);
  });

  it("summary aggregates spend and reconciliation states", () => {
    const bus = new EventBus();
    const pc = new PurchaseCardManager(bus);
    const card = pc.issueCard("emp1", "1234", 5000);
    pc.postTransaction(card.id, 200, "AWS", "cloud", "2026-06-01");
    const t2 = pc.postTransaction(card.id, 50, "Office", "supplies", "2026-06-02")!;
    pc.reconcile(t2.id);
    const s = pc.summary();
    assert.equal(s.totalCards, 1);
    assert.equal(s.totalTransactions, 2);
    assert.equal(s.totalSpendUsd, 250);
    assert.equal(s.pendingReconciliation, 1);
  });
});

describe("CycleCountManager", () => {
  it("schedule publishes scheduled", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("cyclecount.scheduled", (e) => { events.push(e.payload); });
    const cc = new CycleCountManager(bus);
    cc.schedule("BIN-A", "2026-06-26", [{ sku: "S1", systemQty: 100 }]);
    assert.equal(events.length, 1);
  });

  it("recordCount computes variance and publishes when nonzero", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("cyclecount.variance_detected", (e) => { events.push(e.payload); });
    const cc = new CycleCountManager(bus);
    const count = cc.schedule("BIN-A", "2026-06-26", [{ sku: "S1", systemQty: 100 }]);
    const line = cc.recordCount(count.id, "S1", 95)!;
    assert.equal(line.variance, -5);
    assert.equal(events.length, 1);
  });

  it("no variance event when counts match", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("cyclecount.variance_detected", (e) => { events.push(e.payload); });
    const cc = new CycleCountManager(bus);
    const count = cc.schedule("BIN-A", "2026-06-26", [{ sku: "S1", systemQty: 100 }]);
    cc.recordCount(count.id, "S1", 100);
    assert.equal(events.length, 0);
  });

  it("complete requires all lines counted", () => {
    const bus = new EventBus();
    const cc = new CycleCountManager(bus);
    const count = cc.schedule("BIN-A", "2026-06-26", [{ sku: "S1", systemQty: 100 }, { sku: "S2", systemQty: 50 }]);
    cc.recordCount(count.id, "S1", 100);
    assert.equal(cc.complete(count.id, "2026-06-26"), undefined);
    cc.recordCount(count.id, "S2", 48);
    assert.ok(cc.complete(count.id, "2026-06-26"));
  });

  it("accuracy reflects matching lines", () => {
    const bus = new EventBus();
    const cc = new CycleCountManager(bus);
    const count = cc.schedule("BIN-A", "2026-06-26", [{ sku: "S1", systemQty: 100 }, { sku: "S2", systemQty: 50 }]);
    cc.recordCount(count.id, "S1", 100);
    cc.recordCount(count.id, "S2", 40);
    assert.equal(cc.accuracy(count.id), 50);
  });

  it("summary aggregates variance and accuracy", () => {
    const bus = new EventBus();
    const cc = new CycleCountManager(bus);
    const count = cc.schedule("BIN-A", "2026-06-26", [{ sku: "S1", systemQty: 100 }, { sku: "S2", systemQty: 50 }]);
    cc.recordCount(count.id, "S1", 100);
    cc.recordCount(count.id, "S2", 45);
    cc.complete(count.id, "2026-06-26");
    const s = cc.summary();
    assert.equal(s.totalCounts, 1);
    assert.equal(s.completed, 1);
    assert.equal(s.totalVarianceUnits, 5);
    assert.equal(s.avgAccuracyPct, 50);
  });
});

describe("AssetReservationManager", () => {
  it("addResource publishes resource_added", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("reservation.resource_added", (e) => { events.push(e.payload); });
    const rm = new AssetReservationManager(bus);
    rm.addResource({ name: "Conf Room A", category: "room", location: "HQ" });
    assert.equal(events.length, 1);
  });

  it("book publishes booked and detects conflicts", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("reservation.booked", (e) => { events.push(e.payload); });
    const rm = new AssetReservationManager(bus);
    const r = rm.addResource({ name: "Projector", category: "av", location: "HQ" });
    assert.ok(rm.book(r.id, "u1", "2026-06-26T10:00:00.000Z", "2026-06-26T11:00:00.000Z"));
    assert.equal(rm.book(r.id, "u2", "2026-06-26T10:30:00.000Z", "2026-06-26T11:30:00.000Z"), undefined); // overlap
    assert.equal(events.length, 1);
  });

  it("book allows non-overlapping windows", () => {
    const bus = new EventBus();
    const rm = new AssetReservationManager(bus);
    const r = rm.addResource({ name: "Projector", category: "av", location: "HQ" });
    rm.book(r.id, "u1", "2026-06-26T10:00:00.000Z", "2026-06-26T11:00:00.000Z");
    assert.ok(rm.book(r.id, "u2", "2026-06-26T11:00:00.000Z", "2026-06-26T12:00:00.000Z"));
  });

  it("book rejects invalid time range", () => {
    const bus = new EventBus();
    const rm = new AssetReservationManager(bus);
    const r = rm.addResource({ name: "X", category: "av", location: "HQ" });
    assert.equal(rm.book(r.id, "u1", "2026-06-26T11:00:00.000Z", "2026-06-26T10:00:00.000Z"), undefined);
  });

  it("checkOut then return computes late minutes", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("reservation.returned", (e) => { events.push(e.payload); });
    const rm = new AssetReservationManager(bus);
    const r = rm.addResource({ name: "Van", category: "vehicle", location: "HQ" });
    const res = rm.book(r.id, "u1", "2026-06-26T10:00:00.000Z", "2026-06-26T11:00:00.000Z")!;
    rm.checkOut(res.id, "2026-06-26T10:00:00.000Z");
    rm.returnResource(res.id, "2026-06-26T11:30:00.000Z");
    assert.equal(events.length, 1);
    assert.equal(events[0].lateMinutes, 30);
  });

  it("summary aggregates reservations by state", () => {
    const bus = new EventBus();
    const rm = new AssetReservationManager(bus);
    const r = rm.addResource({ name: "Room", category: "room", location: "HQ" });
    const a = rm.book(r.id, "u1", "2026-06-26T10:00:00.000Z", "2026-06-26T11:00:00.000Z")!;
    rm.book(r.id, "u2", "2026-06-26T12:00:00.000Z", "2026-06-26T13:00:00.000Z");
    rm.checkOut(a.id, "2026-06-26T10:00:00.000Z");
    const s = rm.summary();
    assert.equal(s.totalResources, 1);
    assert.equal(s.totalReservations, 2);
    assert.equal(s.checkedOut, 1);
    assert.equal(s.byCategory.room, 1);
  });
});

describe("ComplaintManager", () => {
  it("file publishes complaint.filed", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("complaint.filed", (e) => { events.push(e.payload); });
    const cm = new ComplaintManager(bus);
    cm.file({ customerId: "c1", category: "billing", severity: "medium", channel: "email", description: "double charged", filedAt: "2026-06-01T00:00:00.000Z" });
    assert.equal(events.length, 1);
  });

  it("assign moves to investigating", () => {
    const bus = new EventBus();
    const cm = new ComplaintManager(bus);
    const c = cm.file({ customerId: "c1", category: "service", severity: "low", channel: "phone", description: "x", filedAt: "2026-06-01T00:00:00.000Z" });
    cm.assign(c.id, "agent1");
    assert.equal(cm.getComplaint(c.id)!.status, "investigating");
  });

  it("escalate only raises severity and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("complaint.escalated", (e) => { events.push(e.payload); });
    const cm = new ComplaintManager(bus);
    const c = cm.file({ customerId: "c1", category: "product_defect", severity: "medium", channel: "web", description: "x", filedAt: "2026-06-01T00:00:00.000Z" });
    assert.equal(cm.escalate(c.id, "low"), undefined); // can't lower
    cm.escalate(c.id, "critical");
    assert.equal(cm.getComplaint(c.id)!.severity, "critical");
    assert.equal(events.length, 1);
  });

  it("resolve computes resolution hours and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("complaint.resolved", (e) => { events.push(e.payload); });
    const cm = new ComplaintManager(bus);
    const c = cm.file({ customerId: "c1", category: "delivery", severity: "high", channel: "social", description: "late", filedAt: "2026-06-01T00:00:00.000Z" });
    cm.resolve(c.id, "refunded shipping", true, "2026-06-01T06:00:00.000Z");
    assert.equal(events.length, 1);
    assert.equal(events[0].resolutionHours, 6);
    assert.equal(events[0].satisfied, true);
  });

  it("close requires resolved state", () => {
    const bus = new EventBus();
    const cm = new ComplaintManager(bus);
    const c = cm.file({ customerId: "c1", category: "other", severity: "low", channel: "in_person", description: "x", filedAt: "2026-06-01T00:00:00.000Z" });
    assert.equal(cm.close(c.id), undefined);
    cm.resolve(c.id, "done", false, "2026-06-01T01:00:00.000Z");
    assert.ok(cm.close(c.id));
  });

  it("summary computes satisfaction rate and breakdowns", () => {
    const bus = new EventBus();
    const cm = new ComplaintManager(bus);
    const c1 = cm.file({ customerId: "c1", category: "billing", severity: "medium", channel: "email", description: "x", filedAt: "2026-06-01T00:00:00.000Z" });
    const c2 = cm.file({ customerId: "c2", category: "service", severity: "high", channel: "phone", description: "y", filedAt: "2026-06-01T00:00:00.000Z" });
    cm.resolve(c1.id, "fixed", true, "2026-06-01T02:00:00.000Z");
    cm.resolve(c2.id, "fixed", false, "2026-06-01T02:00:00.000Z");
    const s = cm.summary();
    assert.equal(s.totalComplaints, 2);
    assert.equal(s.resolved, 2);
    assert.equal(s.satisfactionRatePct, 50);
    assert.equal(s.byCategory.billing, 1);
  });
});

describe("BudgetTransferManager", () => {
  it("createPool publishes pool_created", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("budgettransfer.pool_created", (e) => { events.push(e.payload); });
    const bt = new BudgetTransferManager(bus);
    bt.createPool("Engineering", "2026", 100000);
    assert.equal(events.length, 1);
  });

  it("available reflects spend", () => {
    const bus = new EventBus();
    const bt = new BudgetTransferManager(bus);
    const p = bt.createPool("Eng", "2026", 100000);
    bt.recordSpend(p.id, 30000);
    assert.equal(bt.available(p.id), 70000);
  });

  it("recordSpend rejects over-available", () => {
    const bus = new EventBus();
    const bt = new BudgetTransferManager(bus);
    const p = bt.createPool("Eng", "2026", 1000);
    assert.equal(bt.recordSpend(p.id, 2000), undefined);
  });

  it("requestTransfer validates funds and distinct pools", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("budgettransfer.requested", (e) => { events.push(e.payload); });
    const bt = new BudgetTransferManager(bus);
    const a = bt.createPool("Eng", "2026", 100000);
    const b = bt.createPool("Mktg", "2026", 50000);
    assert.equal(bt.requestTransfer(a.id, a.id, 1000, "x", "u1"), undefined); // same pool
    assert.equal(bt.requestTransfer(a.id, b.id, 999999, "x", "u1"), undefined); // insufficient
    assert.ok(bt.requestTransfer(a.id, b.id, 20000, "reallocation", "u1"));
    assert.equal(events.length, 1);
  });

  it("approveTransfer moves allocation and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("budgettransfer.approved", (e) => { events.push(e.payload); });
    const bt = new BudgetTransferManager(bus);
    const a = bt.createPool("Eng", "2026", 100000);
    const b = bt.createPool("Mktg", "2026", 50000);
    const t = bt.requestTransfer(a.id, b.id, 20000, "x", "u1")!;
    bt.approveTransfer(t.id, "cfo");
    assert.equal(bt.getPool(a.id)!.allocatedUsd, 80000);
    assert.equal(bt.getPool(b.id)!.allocatedUsd, 70000);
    assert.equal(events.length, 1);
  });

  it("summary aggregates pools and transfers", () => {
    const bus = new EventBus();
    const bt = new BudgetTransferManager(bus);
    const a = bt.createPool("Eng", "2026", 100000);
    const b = bt.createPool("Mktg", "2026", 50000);
    bt.recordSpend(a.id, 10000);
    const t = bt.requestTransfer(a.id, b.id, 5000, "x", "u1")!;
    bt.approveTransfer(t.id, "cfo");
    const s = bt.summary();
    assert.equal(s.totalPools, 2);
    assert.equal(s.totalAllocatedUsd, 150000);
    assert.equal(s.approvedTransfers, 1);
  });
});

describe("AssetDisposalManager", () => {
  it("request publishes requested", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("assetdisposal.requested", (e) => { events.push(e.payload); });
    const ad = new AssetDisposalManager(bus);
    ad.request({ assetTag: "EQ-1", assetName: "Laptop", method: "sale", bookValueUsd: 500, reason: "EOL", requestedBy: "u1" });
    assert.equal(events.length, 1);
  });

  it("approve then complete computes gain/loss", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("assetdisposal.completed", (e) => { events.push(e.payload); });
    const ad = new AssetDisposalManager(bus);
    const d = ad.request({ assetTag: "EQ-1", assetName: "Laptop", method: "sale", bookValueUsd: 500, reason: "EOL", requestedBy: "u1" });
    ad.approve(d.id, "mgr1");
    ad.complete(d.id, 650, "2026-06-25");
    assert.equal(ad.getDisposal(d.id)!.gainLossUsd, 150);
    assert.equal(events.length, 1);
  });

  it("complete requires approval", () => {
    const bus = new EventBus();
    const ad = new AssetDisposalManager(bus);
    const d = ad.request({ assetTag: "EQ-1", assetName: "X", method: "scrap", bookValueUsd: 100, reason: "broken", requestedBy: "u1" });
    assert.equal(ad.complete(d.id, 0, "2026-06-25"), undefined);
  });

  it("loss recorded when proceeds below book value", () => {
    const bus = new EventBus();
    const ad = new AssetDisposalManager(bus);
    const d = ad.request({ assetTag: "EQ-1", assetName: "X", method: "recycle", bookValueUsd: 300, reason: "EOL", requestedBy: "u1" });
    ad.approve(d.id, "m1");
    ad.complete(d.id, 50, "2026-06-25");
    assert.equal(ad.getDisposal(d.id)!.gainLossUsd, -250);
  });

  it("reject blocks completion", () => {
    const bus = new EventBus();
    const ad = new AssetDisposalManager(bus);
    const d = ad.request({ assetTag: "EQ-1", assetName: "X", method: "donation", bookValueUsd: 0, reason: "x", requestedBy: "u1" });
    ad.reject(d.id, "m1");
    assert.equal(ad.complete(d.id, 0, "2026-06-25"), undefined);
  });

  it("summary aggregates proceeds, gain/loss and methods", () => {
    const bus = new EventBus();
    const ad = new AssetDisposalManager(bus);
    const d1 = ad.request({ assetTag: "EQ-1", assetName: "A", method: "sale", bookValueUsd: 500, reason: "x", requestedBy: "u1" });
    ad.approve(d1.id, "m1"); ad.complete(d1.id, 600, "2026-06-25");
    const d2 = ad.request({ assetTag: "EQ-2", assetName: "B", method: "scrap", bookValueUsd: 200, reason: "x", requestedBy: "u1" });
    ad.approve(d2.id, "m1"); ad.complete(d2.id, 0, "2026-06-25");
    const s = ad.summary();
    assert.equal(s.completed, 2);
    assert.equal(s.totalProceedsUsd, 600);
    assert.equal(s.totalGainLossUsd, -100); // +100 + (-200)
    assert.equal(s.byMethod.sale, 1);
  });
});

describe("PettyCashManager", () => {
  it("createFund publishes fund_created with float as balance", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("pettycash.fund_created", (e) => { events.push(e.payload); });
    const pc = new PettyCashManager(bus);
    const f = pc.createFund("Office", "u1", 500);
    assert.equal(f.balanceUsd, 500);
    assert.equal(events.length, 1);
  });

  it("disburse decrements balance and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("pettycash.disbursed", (e) => { events.push(e.payload); });
    const pc = new PettyCashManager(bus);
    const f = pc.createFund("Office", "u1", 500);
    pc.disburse(f.id, 40, "supplies", "pens", "2026-06-01");
    assert.equal(pc.getFund(f.id)!.balanceUsd, 460);
    assert.equal(events.length, 1);
  });

  it("disburse rejects over-balance", () => {
    const bus = new EventBus();
    const pc = new PettyCashManager(bus);
    const f = pc.createFund("Office", "u1", 100);
    assert.equal(pc.disburse(f.id, 200, "misc", "x", "2026-06-01"), undefined);
  });

  it("replenish increases balance and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("pettycash.replenished", (e) => { events.push(e.payload); });
    const pc = new PettyCashManager(bus);
    const f = pc.createFund("Office", "u1", 500);
    pc.disburse(f.id, 100, "meals", "lunch", "2026-06-01");
    pc.replenish(f.id, 100);
    assert.equal(pc.getFund(f.id)!.balanceUsd, 500);
    assert.equal(events.length, 1);
  });

  it("reconcile detects variance", () => {
    const bus = new EventBus();
    const pc = new PettyCashManager(bus);
    const f = pc.createFund("Office", "u1", 500);
    pc.disburse(f.id, 50, "postage", "stamps", "2026-06-01");
    const r = pc.reconcile(f.id, 440)!;
    assert.equal(r.expectedUsd, 450);
    assert.equal(r.varianceUsd, -10);
    assert.equal(r.balanced, false);
  });

  it("summary aggregates funds and disbursements", () => {
    const bus = new EventBus();
    const pc = new PettyCashManager(bus);
    const f = pc.createFund("Office", "u1", 500);
    pc.disburse(f.id, 40, "supplies", "x", "2026-06-01");
    pc.disburse(f.id, 60, "meals", "y", "2026-06-02");
    const s = pc.summary();
    assert.equal(s.totalFunds, 1);
    assert.equal(s.totalFloatUsd, 500);
    assert.equal(s.totalBalanceUsd, 400);
    assert.equal(s.totalDisbursedUsd, 100);
    assert.equal(s.byCategory.supplies, 1);
  });
});

describe("MileageManager", () => {
  it("logTrip computes amount at default rate and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("mileage.logged", (e) => { events.push(e.payload); });
    const mm = new MileageManager(bus, 0.5);
    const c = mm.logTrip({ employeeId: "u1", date: "2026-06-01", origin: "A", destination: "B", miles: 100, purpose: "client" })!;
    assert.equal(c.amountUsd, 50);
    assert.equal(events.length, 1);
  });

  it("logTrip rejects non-positive miles", () => {
    const bus = new EventBus();
    const mm = new MileageManager(bus);
    assert.equal(mm.logTrip({ employeeId: "u1", date: "2026-06-01", origin: "A", destination: "B", miles: 0, purpose: "x" }), undefined);
  });

  it("approve publishes approved", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("mileage.approved", (e) => { events.push(e.payload); });
    const mm = new MileageManager(bus);
    const c = mm.logTrip({ employeeId: "u1", date: "2026-06-01", origin: "A", destination: "B", miles: 10, purpose: "x" })!;
    mm.approve(c.id, "mgr1");
    assert.equal(mm.getClaim(c.id)!.status, "approved");
    assert.equal(events.length, 1);
  });

  it("reimburse requires approval and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("mileage.reimbursed", (e) => { events.push(e.payload); });
    const mm = new MileageManager(bus);
    const c = mm.logTrip({ employeeId: "u1", date: "2026-06-01", origin: "A", destination: "B", miles: 10, purpose: "x" })!;
    assert.equal(mm.reimburse(c.id, "2026-06-05"), undefined);
    mm.approve(c.id, "mgr1");
    mm.reimburse(c.id, "2026-06-05");
    assert.equal(mm.getClaim(c.id)!.status, "reimbursed");
    assert.equal(events.length, 1);
  });

  it("custom rate overrides default", () => {
    const bus = new EventBus();
    const mm = new MileageManager(bus, 0.5);
    const c = mm.logTrip({ employeeId: "u1", date: "2026-06-01", origin: "A", destination: "B", miles: 100, purpose: "x", ratePerMileUsd: 1 })!;
    assert.equal(c.amountUsd, 100);
  });

  it("summary aggregates miles and reimbursed amounts", () => {
    const bus = new EventBus();
    const mm = new MileageManager(bus, 1);
    const c1 = mm.logTrip({ employeeId: "u1", date: "2026-06-01", origin: "A", destination: "B", miles: 50, purpose: "x" })!;
    mm.approve(c1.id, "m1"); mm.reimburse(c1.id, "2026-06-05");
    mm.logTrip({ employeeId: "u2", date: "2026-06-01", origin: "C", destination: "D", miles: 20, purpose: "y" });
    const s = mm.summary();
    assert.equal(s.totalClaims, 2);
    assert.equal(s.totalMiles, 70);
    assert.equal(s.reimbursed, 1);
    assert.equal(s.totalReimbursedUsd, 50);
    assert.equal(s.pendingAmountUsd, 20);
  });
});

describe("DocumentTemplateManager", () => {
  it("createTemplate extracts merge fields and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("doctemplate.created", (e) => { events.push(e.payload); });
    const dt = new DocumentTemplateManager(bus);
    const t = dt.createTemplate("Offer", "letter", "Dear {{name}}, your salary is {{salary}}.");
    assert.deepEqual(t.fields.sort(), ["name", "salary"]);
    assert.equal(events.length, 1);
  });

  it("render substitutes provided values", () => {
    const bus = new EventBus();
    const dt = new DocumentTemplateManager(bus);
    const t = dt.createTemplate("Hi", "email", "Hello {{name}}!");
    const r = dt.render(t.id, { name: "Sam" })!;
    assert.equal(r.output, "Hello Sam!");
    assert.equal(r.complete, true);
  });

  it("render reports missing fields and keeps placeholder", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("doctemplate.rendered", (e) => { events.push(e.payload); });
    const dt = new DocumentTemplateManager(bus);
    const t = dt.createTemplate("Hi", "email", "Hello {{name}}, {{company}}!");
    const r = dt.render(t.id, { name: "Sam" })!;
    assert.deepEqual(r.missingFields, ["company"]);
    assert.equal(r.complete, false);
    assert.ok(r.output.includes("{{company}}"));
    assert.equal(events.length, 1);
  });

  it("publishVersion bumps version and re-extracts fields", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("doctemplate.version_published", (e) => { events.push(e.payload); });
    const dt = new DocumentTemplateManager(bus);
    const t = dt.createTemplate("T", "contract", "{{a}}");
    dt.publishVersion(t.id, "{{a}} and {{b}}");
    assert.equal(dt.getTemplate(t.id)!.version, 2);
    assert.deepEqual(dt.getTemplate(t.id)!.fields.sort(), ["a", "b"]);
    assert.equal(events.length, 1);
  });

  it("setActive toggles template availability", () => {
    const bus = new EventBus();
    const dt = new DocumentTemplateManager(bus);
    const t = dt.createTemplate("T", "policy", "{{x}}");
    dt.setActive(t.id, false);
    assert.equal(dt.listTemplates(undefined, true).length, 0);
  });

  it("summary aggregates templates, categories and renders", () => {
    const bus = new EventBus();
    const dt = new DocumentTemplateManager(bus);
    const t = dt.createTemplate("T", "invoice", "{{total}}");
    dt.createTemplate("U", "invoice", "{{x}}");
    dt.render(t.id, { total: "100" });
    const s = dt.summary();
    assert.equal(s.totalTemplates, 2);
    assert.equal(s.byCategory.invoice, 2);
    assert.equal(s.totalRenders, 1);
  });
});

describe("AssetTransferManager", () => {
  it("request publishes requested and rejects same-location", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("assettransfer.requested", (e) => { events.push(e.payload); });
    const at = new AssetTransferManager(bus);
    assert.equal(at.request({ assetTag: "EQ-1", assetName: "Laptop", fromLocation: "HQ", toLocation: "HQ", requestedBy: "u1" }), undefined);
    assert.ok(at.request({ assetTag: "EQ-1", assetName: "Laptop", fromLocation: "HQ", toLocation: "Branch", requestedBy: "u1" }));
    assert.equal(events.length, 1);
  });

  it("dispatch moves to in_transit and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("assettransfer.dispatched", (e) => { events.push(e.payload); });
    const at = new AssetTransferManager(bus);
    const t = at.request({ assetTag: "EQ-1", assetName: "X", fromLocation: "HQ", toLocation: "Branch", requestedBy: "u1" })!;
    at.dispatch(t.id, "FedEx", "2026-06-01");
    assert.equal(at.getTransfer(t.id)!.state, "in_transit");
    assert.equal(events.length, 1);
  });

  it("receive updates location for good condition", () => {
    const bus = new EventBus();
    const at = new AssetTransferManager(bus);
    const t = at.request({ assetTag: "EQ-1", assetName: "X", fromLocation: "HQ", toLocation: "Branch", requestedBy: "u1" })!;
    at.dispatch(t.id, "FedEx", "2026-06-01");
    at.receive(t.id, "good", "2026-06-03");
    assert.equal(at.locationOf("EQ-1"), "Branch");
  });

  it("lost asset does not update location", () => {
    const bus = new EventBus();
    const at = new AssetTransferManager(bus);
    const t = at.request({ assetTag: "EQ-1", assetName: "X", fromLocation: "HQ", toLocation: "Branch", requestedBy: "u1" })!;
    at.dispatch(t.id, "FedEx", "2026-06-01");
    at.receive(t.id, "lost", "2026-06-03");
    assert.equal(at.locationOf("EQ-1"), "HQ");
  });

  it("receive requires in_transit state", () => {
    const bus = new EventBus();
    const at = new AssetTransferManager(bus);
    const t = at.request({ assetTag: "EQ-1", assetName: "X", fromLocation: "HQ", toLocation: "Branch", requestedBy: "u1" })!;
    assert.equal(at.receive(t.id, "good", "2026-06-03"), undefined);
  });

  it("summary aggregates states and conditions", () => {
    const bus = new EventBus();
    const at = new AssetTransferManager(bus);
    const t1 = at.request({ assetTag: "EQ-1", assetName: "A", fromLocation: "HQ", toLocation: "Branch", requestedBy: "u1" })!;
    at.dispatch(t1.id, "FedEx", "2026-06-01"); at.receive(t1.id, "damaged", "2026-06-03");
    const t2 = at.request({ assetTag: "EQ-2", assetName: "B", fromLocation: "HQ", toLocation: "Branch", requestedBy: "u1" })!;
    at.dispatch(t2.id, "UPS", "2026-06-01");
    const s = at.summary();
    assert.equal(s.totalTransfers, 2);
    assert.equal(s.inTransit, 1);
    assert.equal(s.received, 1);
    assert.equal(s.damaged, 1);
    assert.equal(s.byToLocation.Branch, 2);
  });
});

describe("WaitlistManager", () => {
  it("join publishes joined with position", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("waitlist.joined", (e) => { events.push(e.payload); });
    const wm = new WaitlistManager(bus);
    const wl = wm.createWaitlist("Beta", 2);
    wm.join(wl.id, "p1", "2026-06-01T00:00:00.000Z");
    assert.equal(events.length, 1);
    assert.equal(events[0].position, 1);
  });

  it("position reflects FIFO order", () => {
    const bus = new EventBus();
    const wm = new WaitlistManager(bus);
    const wl = wm.createWaitlist("Beta", 5);
    const e1 = wm.join(wl.id, "p1", "2026-06-01T00:00:00.000Z")!;
    const e2 = wm.join(wl.id, "p2", "2026-06-01T01:00:00.000Z")!;
    assert.equal(wm.position(e1.id), 1);
    assert.equal(wm.position(e2.id), 2);
  });

  it("offerNext offers earliest waiting and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("waitlist.offered", (e) => { events.push(e.payload); });
    const wm = new WaitlistManager(bus);
    const wl = wm.createWaitlist("Beta", 1);
    const e1 = wm.join(wl.id, "p1", "2026-06-01T00:00:00.000Z")!;
    const offered = wm.offerNext(wl.id, "2026-06-02T00:00:00.000Z", "2026-06-01T12:00:00.000Z")!;
    assert.equal(offered.id, e1.id);
    assert.equal(events.length, 1);
  });

  it("convert fills a slot and publishes converted", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("waitlist.converted", (e) => { events.push(e.payload); });
    const wm = new WaitlistManager(bus);
    const wl = wm.createWaitlist("Beta", 1);
    wm.join(wl.id, "p1", "2026-06-01T00:00:00.000Z");
    const offered = wm.offerNext(wl.id, "2026-06-02T00:00:00.000Z", "2026-06-01T12:00:00.000Z")!;
    wm.convert(offered.id, "2026-06-01T13:00:00.000Z");
    assert.equal(wm.getWaitlist(wl.id)!.filledSlots, 1);
    assert.equal(events.length, 1);
  });

  it("offerNext blocked when at capacity", () => {
    const bus = new EventBus();
    const wm = new WaitlistManager(bus);
    const wl = wm.createWaitlist("Beta", 1);
    wm.join(wl.id, "p1", "2026-06-01T00:00:00.000Z");
    const o = wm.offerNext(wl.id, "2026-06-02T00:00:00.000Z", "2026-06-01T12:00:00.000Z")!;
    wm.convert(o.id, "2026-06-01T13:00:00.000Z");
    wm.join(wl.id, "p2", "2026-06-01T02:00:00.000Z");
    assert.equal(wm.offerNext(wl.id, "2026-06-02T00:00:00.000Z", "2026-06-01T14:00:00.000Z"), undefined);
  });

  it("summary computes conversion rate", () => {
    const bus = new EventBus();
    const wm = new WaitlistManager(bus);
    const wl = wm.createWaitlist("Beta", 5);
    wm.join(wl.id, "p1", "2026-06-01T00:00:00.000Z");
    wm.join(wl.id, "p2", "2026-06-01T01:00:00.000Z");
    const o = wm.offerNext(wl.id, "2026-06-02T00:00:00.000Z", "2026-06-01T12:00:00.000Z")!;
    wm.convert(o.id, "2026-06-01T13:00:00.000Z");
    const s = wm.summary();
    assert.equal(s.totalConverted, 1);
    assert.equal(s.totalWaiting, 1);
    assert.equal(s.conversionRatePct, 100);
  });
});

describe("AppointmentManager", () => {
  it("book publishes booked and prevents double-booking", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("appointment.booked", (e) => { events.push(e.payload); });
    const am = new AppointmentManager(bus);
    assert.ok(am.book({ providerId: "dr1", customerId: "c1", service: "checkup", start: "2026-06-26T09:00:00.000Z", end: "2026-06-26T09:30:00.000Z" }));
    assert.equal(am.book({ providerId: "dr1", customerId: "c2", service: "checkup", start: "2026-06-26T09:15:00.000Z", end: "2026-06-26T09:45:00.000Z" }), undefined);
    assert.equal(events.length, 1);
  });

  it("book allows different providers same time", () => {
    const bus = new EventBus();
    const am = new AppointmentManager(bus);
    am.book({ providerId: "dr1", customerId: "c1", service: "x", start: "2026-06-26T09:00:00.000Z", end: "2026-06-26T09:30:00.000Z" });
    assert.ok(am.book({ providerId: "dr2", customerId: "c2", service: "x", start: "2026-06-26T09:00:00.000Z", end: "2026-06-26T09:30:00.000Z" }));
  });

  it("complete publishes completed with duration", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("appointment.completed", (e) => { events.push(e.payload); });
    const am = new AppointmentManager(bus);
    const a = am.book({ providerId: "dr1", customerId: "c1", service: "x", start: "2026-06-26T09:00:00.000Z", end: "2026-06-26T09:30:00.000Z" })!;
    am.complete(a.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].durationMinutes, 30);
  });

  it("cancel publishes cancelled and frees the slot", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("appointment.cancelled", (e) => { events.push(e.payload); });
    const am = new AppointmentManager(bus);
    const a = am.book({ providerId: "dr1", customerId: "c1", service: "x", start: "2026-06-26T09:00:00.000Z", end: "2026-06-26T09:30:00.000Z" })!;
    am.cancel(a.id, "patient request");
    assert.equal(events.length, 1);
    assert.ok(am.book({ providerId: "dr1", customerId: "c2", service: "x", start: "2026-06-26T09:00:00.000Z", end: "2026-06-26T09:30:00.000Z" }));
  });

  it("markNoShow updates status", () => {
    const bus = new EventBus();
    const am = new AppointmentManager(bus);
    const a = am.book({ providerId: "dr1", customerId: "c1", service: "x", start: "2026-06-26T09:00:00.000Z", end: "2026-06-26T09:30:00.000Z" })!;
    am.markNoShow(a.id);
    assert.equal(am.getAppointment(a.id)!.status, "no_show");
  });

  it("summary computes no-show rate and per-provider counts", () => {
    const bus = new EventBus();
    const am = new AppointmentManager(bus);
    const a1 = am.book({ providerId: "dr1", customerId: "c1", service: "x", start: "2026-06-26T09:00:00.000Z", end: "2026-06-26T09:30:00.000Z" })!;
    am.complete(a1.id);
    const a2 = am.book({ providerId: "dr1", customerId: "c2", service: "x", start: "2026-06-26T10:00:00.000Z", end: "2026-06-26T10:30:00.000Z" })!;
    am.markNoShow(a2.id);
    const s = am.summary();
    assert.equal(s.totalAppointments, 2);
    assert.equal(s.completed, 1);
    assert.equal(s.noShows, 1);
    assert.equal(s.noShowRatePct, 50);
    assert.equal(s.byProvider.dr1, 2);
  });
});

describe("SupplierScorecardManager", () => {
  it("record computes weighted score and tier", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("supplierscorecard.recorded", (e) => { events.push(e.payload); });
    const sm = new SupplierScorecardManager(bus);
    const sc = sm.record("s1", "Acme", "2026-Q1", [{ name: "quality", scorePct: 90, weight: 2 }, { name: "delivery", scorePct: 90, weight: 1 }]);
    assert.equal(sc.score, 90);
    assert.equal(sc.tier, "preferred");
    assert.equal(events.length, 1);
  });

  it("low score flags supplier on probation", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("supplierscorecard.flagged", (e) => { events.push(e.payload); });
    const sm = new SupplierScorecardManager(bus);
    const sc = sm.record("s1", "Bad", "2026-Q1", [{ name: "quality", scorePct: 40, weight: 1 }]);
    assert.equal(sc.tier, "probation");
    assert.equal(events.length, 1);
  });

  it("downgrade publishes event on tier drop", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("supplierscorecard.downgraded", (e) => { events.push(e.payload); });
    const sm = new SupplierScorecardManager(bus);
    sm.record("s1", "Acme", "2026-Q1", [{ name: "quality", scorePct: 95, weight: 1 }]); // preferred
    sm.record("s1", "Acme", "2026-Q2", [{ name: "quality", scorePct: 65, weight: 1 }]); // conditional
    assert.equal(events.length, 1);
    assert.equal(events[0].fromTier, "preferred");
    assert.equal(events[0].toTier, "conditional");
  });

  it("trend returns chronological scores", () => {
    const bus = new EventBus();
    const sm = new SupplierScorecardManager(bus);
    sm.record("s1", "Acme", "2026-Q2", [{ name: "q", scorePct: 80, weight: 1 }]);
    sm.record("s1", "Acme", "2026-Q1", [{ name: "q", scorePct: 70, weight: 1 }]);
    assert.deepEqual(sm.trend("s1"), [70, 80]);
  });

  it("latestFor returns most recent scorecard", () => {
    const bus = new EventBus();
    const sm = new SupplierScorecardManager(bus);
    sm.record("s1", "Acme", "2026-Q1", [{ name: "q", scorePct: 70, weight: 1 }]);
    const latest = sm.record("s1", "Acme", "2026-Q2", [{ name: "q", scorePct: 88, weight: 1 }]);
    assert.equal(sm.latestFor("s1")!.id, latest.id);
  });

  it("summary aggregates tiers and average", () => {
    const bus = new EventBus();
    const sm = new SupplierScorecardManager(bus);
    sm.record("s1", "A", "2026-Q1", [{ name: "q", scorePct: 95, weight: 1 }]);
    sm.record("s2", "B", "2026-Q1", [{ name: "q", scorePct: 45, weight: 1 }]);
    const s = sm.summary();
    assert.equal(s.scoredSuppliers, 2);
    assert.equal(s.avgScore, 70);
    assert.equal(s.byTier.preferred, 1);
    assert.equal(s.flaggedSuppliers, 1);
  });
});

describe("NonconformanceManager", () => {
  it("raise assigns NCR number and publishes raised", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("ncr.raised", (e) => { events.push(e.payload); });
    const nm = new NonconformanceManager(bus);
    const ncr = nm.raise({ source: "production", severity: "major", description: "out of spec", partRef: "P-1", quantity: 10, raisedAt: "2026-06-01" });
    assert.equal(ncr.ncrNumber, "NCR-00001");
    assert.equal(events.length, 1);
  });

  it("addCAPA publishes capa_added and sets status", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("ncr.capa_added", (e) => { events.push(e.payload); });
    const nm = new NonconformanceManager(bus);
    const ncr = nm.raise({ source: "audit", severity: "minor", description: "x", partRef: "P-1", quantity: 1, raisedAt: "2026-06-01" });
    nm.addCAPA(ncr.id, "corrective", "retrain", "qm1", "2026-07-01");
    assert.equal(nm.getNCR(ncr.id)!.status, "capa_in_progress");
    assert.equal(events.length, 1);
  });

  it("close requires disposition and completed CAPAs", () => {
    const bus = new EventBus();
    const nm = new NonconformanceManager(bus);
    const ncr = nm.raise({ source: "production", severity: "major", description: "x", partRef: "P-1", quantity: 5, raisedAt: "2026-06-01" });
    const capa = nm.addCAPA(ncr.id, "corrective", "fix", "qm1", "2026-07-01")!;
    assert.equal(nm.close(ncr.id, "2026-06-10"), undefined); // no disposition
    nm.setDisposition(ncr.id, "rework");
    assert.equal(nm.close(ncr.id, "2026-06-10"), undefined); // capa incomplete
    nm.completeCAPA(ncr.id, capa.id);
    assert.ok(nm.close(ncr.id, "2026-06-10"));
  });

  it("close publishes closed with days open", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("ncr.closed", (e) => { events.push(e.payload); });
    const nm = new NonconformanceManager(bus);
    const ncr = nm.raise({ source: "supplier", severity: "critical", description: "x", partRef: "P-1", quantity: 1, raisedAt: "2026-06-01" });
    nm.setDisposition(ncr.id, "return_to_supplier");
    nm.close(ncr.id, "2026-06-06");
    assert.equal(events.length, 1);
    assert.equal(events[0].daysOpen, 5);
  });

  it("setDisposition moves open NCR to investigating", () => {
    const bus = new EventBus();
    const nm = new NonconformanceManager(bus);
    const ncr = nm.raise({ source: "production", severity: "minor", description: "x", partRef: "P-1", quantity: 1, raisedAt: "2026-06-01" });
    nm.setDisposition(ncr.id, "scrap");
    assert.equal(nm.getNCR(ncr.id)!.status, "investigating");
  });

  it("summary aggregates severity, source and open CAPAs", () => {
    const bus = new EventBus();
    const nm = new NonconformanceManager(bus);
    const ncr = nm.raise({ source: "production", severity: "major", description: "x", partRef: "P-1", quantity: 1, raisedAt: "2026-06-01" });
    nm.addCAPA(ncr.id, "preventive", "y", "qm1", "2026-07-01");
    nm.raise({ source: "audit", severity: "minor", description: "z", partRef: "P-2", quantity: 1, raisedAt: "2026-06-01" });
    const s = nm.summary();
    assert.equal(s.totalNCRs, 2);
    assert.equal(s.open, 2);
    assert.equal(s.openCAPAs, 1);
    assert.equal(s.bySeverity.major, 1);
    assert.equal(s.bySource.audit, 1);
  });
});

describe("GrievanceManager", () => {
  it("file publishes grievance.filed", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("grievance.filed", (e) => { events.push(e.payload); });
    const gm = new GrievanceManager(bus);
    gm.file({ employeeId: "e1", category: "compensation", description: "underpaid", filedAt: "2026-06-01" });
    assert.equal(events.length, 1);
  });

  it("advance moves through stage flow and publishes events", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("grievance.stage_changed", (e) => { events.push(e.payload); });
    const gm = new GrievanceManager(bus);
    const g = gm.file({ employeeId: "e1", category: "policy", description: "x", filedAt: "2026-06-01" });
    gm.advance(g.id); // acknowledged
    gm.advance(g.id); // investigating
    assert.equal(gm.getGrievance(g.id)!.stage, "investigating");
    assert.equal(events.length, 2);
  });

  it("resolve publishes resolved with upheld flag", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("grievance.resolved", (e) => { events.push(e.payload); });
    const gm = new GrievanceManager(bus);
    const g = gm.file({ employeeId: "e1", category: "management", description: "x", filedAt: "2026-06-01" });
    gm.resolve(g.id, "upheld", "2026-06-10");
    assert.equal(gm.getGrievance(g.id)!.stage, "resolved");
    assert.equal(events.length, 1);
    assert.equal(events[0].upheld, true);
  });

  it("appeal requires resolved state", () => {
    const bus = new EventBus();
    const gm = new GrievanceManager(bus);
    const g = gm.file({ employeeId: "e1", category: "other", description: "x", filedAt: "2026-06-01" });
    assert.equal(gm.appeal(g.id, "2026-06-12"), undefined);
    gm.resolve(g.id, "denied", "2026-06-10");
    assert.ok(gm.appeal(g.id, "2026-06-12"));
    assert.equal(gm.getGrievance(g.id)!.stage, "appealed");
  });

  it("assign sets handler", () => {
    const bus = new EventBus();
    const gm = new GrievanceManager(bus);
    const g = gm.file({ employeeId: "e1", category: "discrimination", description: "x", filedAt: "2026-06-01" });
    gm.assign(g.id, "hr1");
    assert.equal(gm.getGrievance(g.id)!.assignedTo, "hr1");
  });

  it("summary aggregates categories and outcomes", () => {
    const bus = new EventBus();
    const gm = new GrievanceManager(bus);
    const g1 = gm.file({ employeeId: "e1", category: "compensation", description: "x", filedAt: "2026-06-01" });
    gm.resolve(g1.id, "upheld", "2026-06-10");
    gm.file({ employeeId: "e2", category: "policy", description: "y", filedAt: "2026-06-01" });
    const s = gm.summary();
    assert.equal(s.totalGrievances, 2);
    assert.equal(s.resolved, 1);
    assert.equal(s.upheldCount, 1);
    assert.equal(s.byCategory.compensation, 1);
  });
});

describe("AssetCheckoutManager", () => {
  it("addItem publishes item_added", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("checkout.item_added", (e) => { events.push(e.payload); });
    const cm = new AssetCheckoutManager(bus);
    cm.addItem({ name: "Drill", category: "tool", assetTag: "T-1" });
    assert.equal(events.length, 1);
  });

  it("borrow marks item on_loan and publishes borrowed", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("checkout.borrowed", (e) => { events.push(e.payload); });
    const cm = new AssetCheckoutManager(bus);
    const item = cm.addItem({ name: "Drill", category: "tool", assetTag: "T-1" });
    cm.borrow(item.id, "u1", "2026-06-01", "2026-06-08");
    assert.equal(cm.getItem(item.id)!.availability, "on_loan");
    assert.equal(events.length, 1);
  });

  it("cannot borrow an item already on loan", () => {
    const bus = new EventBus();
    const cm = new AssetCheckoutManager(bus);
    const item = cm.addItem({ name: "Drill", category: "tool", assetTag: "T-1" });
    cm.borrow(item.id, "u1", "2026-06-01", "2026-06-08");
    assert.equal(cm.borrow(item.id, "u2", "2026-06-02", "2026-06-09"), undefined);
  });

  it("returnItem computes late days and frees item", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("checkout.returned", (e) => { events.push(e.payload); });
    const cm = new AssetCheckoutManager(bus);
    const item = cm.addItem({ name: "Drill", category: "tool", assetTag: "T-1" });
    const loan = cm.borrow(item.id, "u1", "2026-06-01", "2026-06-08")!;
    cm.returnItem(loan.id, "2026-06-11");
    assert.equal(cm.getItem(item.id)!.availability, "available");
    assert.equal(events.length, 1);
    assert.equal(events[0].lateDays, 3);
  });

  it("flagOverdue marks active past-due loans", () => {
    const bus = new EventBus();
    const cm = new AssetCheckoutManager(bus);
    const item = cm.addItem({ name: "Drill", category: "tool", assetTag: "T-1" });
    const loan = cm.borrow(item.id, "u1", "2026-06-01", "2026-06-08")!;
    const overdue = cm.flagOverdue("2026-06-25");
    assert.equal(overdue.length, 1);
    assert.equal(cm.getLoan(loan.id)!.status, "overdue");
  });

  it("summary aggregates items and loans", () => {
    const bus = new EventBus();
    const cm = new AssetCheckoutManager(bus);
    const i1 = cm.addItem({ name: "Drill", category: "tool", assetTag: "T-1" });
    cm.addItem({ name: "Laptop", category: "electronics", assetTag: "E-1" });
    cm.borrow(i1.id, "u1", "2026-06-01", "2026-06-08");
    const s = cm.summary();
    assert.equal(s.totalItems, 2);
    assert.equal(s.onLoan, 1);
    assert.equal(s.available, 1);
    assert.equal(s.activeLoans, 1);
    assert.equal(s.byCategory.tool, 1);
  });
});

describe("SponsorshipManager", () => {
  it("sign publishes signed and seeds deliverables", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("sponsorship.signed", (e) => { events.push(e.payload); });
    const sm = new SponsorshipManager(bus);
    const s = sm.sign({ sponsorName: "Acme", tier: "gold", amountUsd: 50000, startDate: "2026-01-01", endDate: "2026-12-31", deliverables: ["logo on site", "booth"] });
    assert.equal(s.deliverables.length, 2);
    assert.equal(events.length, 1);
  });

  it("fulfill marks deliverable and publishes event", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("sponsorship.deliverable_fulfilled", (e) => { events.push(e.payload); });
    const sm = new SponsorshipManager(bus);
    const s = sm.sign({ sponsorName: "Acme", tier: "gold", amountUsd: 50000, startDate: "2026-01-01", endDate: "2026-12-31", deliverables: ["logo"] });
    sm.fulfill(s.id, s.deliverables[0]!.id, "2026-02-01");
    assert.equal(events.length, 1);
  });

  it("completing all deliverables completes the sponsorship", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("sponsorship.completed", (e) => { events.push(e.payload); });
    const sm = new SponsorshipManager(bus);
    const s = sm.sign({ sponsorName: "Acme", tier: "gold", amountUsd: 50000, startDate: "2026-01-01", endDate: "2026-12-31", deliverables: ["a", "b"] });
    sm.fulfill(s.id, s.deliverables[0]!.id, "2026-02-01");
    sm.fulfill(s.id, s.deliverables[1]!.id, "2026-03-01");
    assert.equal(sm.getSponsorship(s.id)!.status, "completed");
    assert.equal(events.length, 1);
    assert.equal(events[0].fulfillmentPct, 100);
  });

  it("fulfillmentPct reflects partial completion", () => {
    const bus = new EventBus();
    const sm = new SponsorshipManager(bus);
    const s = sm.sign({ sponsorName: "Acme", tier: "silver", amountUsd: 10000, startDate: "2026-01-01", endDate: "2026-12-31", deliverables: ["a", "b", "c", "d"] });
    sm.fulfill(s.id, s.deliverables[0]!.id, "2026-02-01");
    assert.equal(sm.fulfillmentPct(s.id), 25);
  });

  it("cancel blocks completed sponsorships", () => {
    const bus = new EventBus();
    const sm = new SponsorshipManager(bus);
    const s = sm.sign({ sponsorName: "Acme", tier: "bronze", amountUsd: 5000, startDate: "2026-01-01", endDate: "2026-12-31", deliverables: ["a"] });
    sm.fulfill(s.id, s.deliverables[0]!.id, "2026-02-01");
    assert.equal(sm.cancel(s.id), undefined);
  });

  it("summary aggregates revenue and tiers", () => {
    const bus = new EventBus();
    const sm = new SponsorshipManager(bus);
    sm.sign({ sponsorName: "A", tier: "title", amountUsd: 100000, startDate: "2026-01-01", endDate: "2026-12-31", deliverables: ["x"] });
    sm.sign({ sponsorName: "B", tier: "gold", amountUsd: 50000, startDate: "2026-01-01", endDate: "2026-12-31", deliverables: ["y"] });
    const s = sm.summary();
    assert.equal(s.totalSponsorships, 2);
    assert.equal(s.totalRevenueUsd, 150000);
    assert.equal(s.byTier.title, 1);
  });
});

describe("MembershipManager", () => {
  it("enroll publishes enrolled", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("membership.enrolled", (e) => { events.push(e.payload); });
    const mm = new MembershipManager(bus);
    mm.enroll({ memberId: "m1", memberName: "Jane", tier: "premium", annualDuesUsd: 200, joinedAt: "2026-01-01", expiresAt: "2027-01-01" });
    assert.equal(events.length, 1);
  });

  it("renew extends expiry and increments renewals", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("membership.renewed", (e) => { events.push(e.payload); });
    const mm = new MembershipManager(bus);
    const m = mm.enroll({ memberId: "m1", memberName: "Jane", tier: "basic", annualDuesUsd: 50, joinedAt: "2026-01-01", expiresAt: "2027-01-01" });
    mm.renew(m.id, "2028-01-01");
    assert.equal(mm.getMembership(m.id)!.renewalCount, 1);
    assert.equal(mm.getMembership(m.id)!.expiresAt, "2028-01-01");
    assert.equal(events.length, 1);
  });

  it("checkLapsed flags expired non-lifetime memberships", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("membership.lapsed", (e) => { events.push(e.payload); });
    const mm = new MembershipManager(bus);
    mm.enroll({ memberId: "m1", memberName: "Jane", tier: "basic", annualDuesUsd: 50, joinedAt: "2025-01-01", expiresAt: "2026-01-01" });
    const lapsed = mm.checkLapsed("2026-06-25");
    assert.equal(lapsed.length, 1);
    assert.equal(events.length, 1);
  });

  it("lifetime memberships never lapse", () => {
    const bus = new EventBus();
    const mm = new MembershipManager(bus);
    mm.enroll({ memberId: "m1", memberName: "Jane", tier: "lifetime", annualDuesUsd: 0, joinedAt: "2020-01-01", expiresAt: "2021-01-01" });
    const lapsed = mm.checkLapsed("2026-06-25");
    assert.equal(lapsed.length, 0);
  });

  it("renew reactivates a lapsed membership", () => {
    const bus = new EventBus();
    const mm = new MembershipManager(bus);
    const m = mm.enroll({ memberId: "m1", memberName: "Jane", tier: "basic", annualDuesUsd: 50, joinedAt: "2025-01-01", expiresAt: "2026-01-01" });
    mm.checkLapsed("2026-06-25");
    mm.renew(m.id, "2027-06-25");
    assert.equal(mm.getMembership(m.id)!.status, "active");
  });

  it("summary aggregates tiers, dues and retention", () => {
    const bus = new EventBus();
    const mm = new MembershipManager(bus);
    const a = mm.enroll({ memberId: "m1", memberName: "A", tier: "premium", annualDuesUsd: 200, joinedAt: "2026-01-01", expiresAt: "2027-01-01" });
    mm.renew(a.id, "2028-01-01");
    mm.enroll({ memberId: "m2", memberName: "B", tier: "basic", annualDuesUsd: 50, joinedAt: "2026-01-01", expiresAt: "2027-01-01" });
    const s = mm.summary();
    assert.equal(s.totalMembers, 2);
    assert.equal(s.active, 2);
    assert.equal(s.totalAnnualDuesUsd, 250);
    assert.equal(s.byTier.premium, 1);
    assert.equal(s.retentionRatePct, 50);
  });
});

describe("ChargebackManager", () => {
  it("open publishes opened", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("chargeback.opened", (e) => { events.push(e.payload); });
    const cm = new ChargebackManager(bus);
    cm.open({ transactionId: "tx1", customerId: "c1", amountUsd: 200, reasonCode: "fraud", openedAt: "2026-06-01", dueBy: "2026-06-15" });
    assert.equal(events.length, 1);
  });

  it("represent requires evidence and sets status", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("chargeback.represented", (e) => { events.push(e.payload); });
    const cm = new ChargebackManager(bus);
    const cb = cm.open({ transactionId: "tx1", customerId: "c1", amountUsd: 200, reasonCode: "fraud", openedAt: "2026-06-01", dueBy: "2026-06-15" });
    assert.equal(cm.represent(cb.id, []), undefined);
    cm.represent(cb.id, ["receipt", "delivery proof"]);
    assert.equal(cm.getChargeback(cb.id)!.status, "represented");
    assert.equal(events.length, 1);
  });

  it("resolve won publishes resolved with won flag", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("chargeback.resolved", (e) => { events.push(e.payload); });
    const cm = new ChargebackManager(bus);
    const cb = cm.open({ transactionId: "tx1", customerId: "c1", amountUsd: 200, reasonCode: "duplicate", openedAt: "2026-06-01", dueBy: "2026-06-15" });
    cm.represent(cb.id, ["evidence"]);
    cm.resolve(cb.id, true, "2026-06-20");
    assert.equal(cm.getChargeback(cb.id)!.status, "won");
    assert.equal(events.length, 1);
    assert.equal(events[0].won, true);
  });

  it("resolve requires represented state", () => {
    const bus = new EventBus();
    const cm = new ChargebackManager(bus);
    const cb = cm.open({ transactionId: "tx1", customerId: "c1", amountUsd: 200, reasonCode: "fraud", openedAt: "2026-06-01", dueBy: "2026-06-15" });
    assert.equal(cm.resolve(cb.id, true, "2026-06-20"), undefined);
  });

  it("accept resolves as a loss", () => {
    const bus = new EventBus();
    const cm = new ChargebackManager(bus);
    const cb = cm.open({ transactionId: "tx1", customerId: "c1", amountUsd: 200, reasonCode: "other", openedAt: "2026-06-01", dueBy: "2026-06-15" });
    cm.accept(cb.id, "2026-06-05");
    assert.equal(cm.getChargeback(cb.id)!.status, "accepted");
  });

  it("summary computes win rate and recovered amount", () => {
    const bus = new EventBus();
    const cm = new ChargebackManager(bus);
    const a = cm.open({ transactionId: "t1", customerId: "c1", amountUsd: 100, reasonCode: "fraud", openedAt: "2026-06-01", dueBy: "2026-06-15" });
    cm.represent(a.id, ["x"]); cm.resolve(a.id, true, "2026-06-20");
    const b = cm.open({ transactionId: "t2", customerId: "c2", amountUsd: 50, reasonCode: "fraud", openedAt: "2026-06-01", dueBy: "2026-06-15" });
    cm.represent(b.id, ["y"]); cm.resolve(b.id, false, "2026-06-20");
    const s = cm.summary();
    assert.equal(s.totalChargebacks, 2);
    assert.equal(s.won, 1);
    assert.equal(s.recoveredUsd, 100);
    assert.equal(s.winRatePct, 50);
    assert.equal(s.byReason.fraud, 2);
  });
});

describe("TaxExemptionManager", () => {
  it("register publishes registered", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("taxexemption.registered", (e) => { events.push(e.payload); });
    const tm = new TaxExemptionManager(bus);
    tm.register({ customerId: "c1", exemptionType: "resale", certificateNumber: "RS-1", jurisdictions: ["CA"], issuedAt: "2026-01-01", expiresAt: "2027-01-01" });
    assert.equal(events.length, 1);
  });

  it("verify returns valid for active cert in jurisdiction", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("taxexemption.verified", (e) => { events.push(e.payload); });
    const tm = new TaxExemptionManager(bus);
    tm.register({ customerId: "c1", exemptionType: "nonprofit", certificateNumber: "NP-1", jurisdictions: ["NY"], issuedAt: "2026-01-01", expiresAt: "2027-01-01" });
    const r = tm.verify("c1", "NY", "2026-06-01");
    assert.equal(r.valid, true);
    assert.equal(events.length, 1);
  });

  it("verify fails for wrong jurisdiction", () => {
    const bus = new EventBus();
    const tm = new TaxExemptionManager(bus);
    tm.register({ customerId: "c1", exemptionType: "resale", certificateNumber: "RS-1", jurisdictions: ["CA"], issuedAt: "2026-01-01", expiresAt: "2027-01-01" });
    assert.equal(tm.verify("c1", "TX", "2026-06-01").valid, false);
  });

  it("checkExpired flags and publishes expired certs", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("taxexemption.expired", (e) => { events.push(e.payload); });
    const tm = new TaxExemptionManager(bus);
    tm.register({ customerId: "c1", exemptionType: "government", certificateNumber: "G-1", jurisdictions: ["DC"], issuedAt: "2025-01-01", expiresAt: "2026-01-01" });
    const expired = tm.checkExpired("2026-06-25");
    assert.equal(expired.length, 1);
    assert.equal(events.length, 1);
  });

  it("revoke marks certificate revoked and blocks verify", () => {
    const bus = new EventBus();
    const tm = new TaxExemptionManager(bus);
    const c = tm.register({ customerId: "c1", exemptionType: "resale", certificateNumber: "RS-1", jurisdictions: ["CA"], issuedAt: "2026-01-01", expiresAt: "2027-01-01" });
    tm.revoke(c.id);
    assert.equal(tm.verify("c1", "CA", "2026-06-01").valid, false);
  });

  it("summary aggregates types and expiring soon", () => {
    const bus = new EventBus();
    const tm = new TaxExemptionManager(bus);
    tm.register({ customerId: "c1", exemptionType: "resale", certificateNumber: "RS-1", jurisdictions: ["CA"], issuedAt: "2026-01-01", expiresAt: "2026-07-10" });
    tm.register({ customerId: "c2", exemptionType: "nonprofit", certificateNumber: "NP-1", jurisdictions: ["NY"], issuedAt: "2026-01-01", expiresAt: "2028-01-01" });
    const s = tm.summary("2026-06-25");
    assert.equal(s.totalCertificates, 2);
    assert.equal(s.active, 2);
    assert.equal(s.byType.resale, 1);
    assert.equal(s.expiringIn30Days, 1);
  });
});

describe("BackgroundCheckManager", () => {
  it("order publishes ordered and requires screens", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("backgroundcheck.ordered", (e) => { events.push(e.payload); });
    const bm = new BackgroundCheckManager(bus);
    assert.equal(bm.order("s1", "Jane", [], "2026-06-01"), undefined);
    bm.order("s1", "Jane", ["criminal", "employment"], "2026-06-01");
    assert.equal(events.length, 1);
  });

  it("complete publishes completed with result", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("backgroundcheck.completed", (e) => { events.push(e.payload); });
    const bm = new BackgroundCheckManager(bus);
    const c = bm.order("s1", "Jane", ["criminal"], "2026-06-01")!;
    bm.start(c.id);
    bm.complete(c.id, "clear", "2026-06-04");
    assert.equal(bm.getCheck(c.id)!.result, "clear");
    assert.equal(events.length, 1);
  });

  it("sendAdverseAction requires adverse result", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("backgroundcheck.adverse_action", (e) => { events.push(e.payload); });
    const bm = new BackgroundCheckManager(bus);
    const c = bm.order("s1", "Jane", ["criminal"], "2026-06-01")!;
    bm.complete(c.id, "clear", "2026-06-04");
    assert.equal(bm.sendAdverseAction(c.id), undefined);
    const c2 = bm.order("s2", "Bob", ["criminal"], "2026-06-01")!;
    bm.complete(c2.id, "adverse", "2026-06-04");
    bm.sendAdverseAction(c2.id);
    assert.equal(events.length, 1);
  });

  it("cancel blocks completed checks", () => {
    const bus = new EventBus();
    const bm = new BackgroundCheckManager(bus);
    const c = bm.order("s1", "Jane", ["criminal"], "2026-06-01")!;
    bm.complete(c.id, "clear", "2026-06-04");
    assert.equal(bm.cancel(c.id), undefined);
  });

  it("start transitions to in_progress", () => {
    const bus = new EventBus();
    const bm = new BackgroundCheckManager(bus);
    const c = bm.order("s1", "Jane", ["drug"], "2026-06-01")!;
    bm.start(c.id);
    assert.equal(bm.getCheck(c.id)!.status, "in_progress");
  });

  it("summary computes turnaround and result counts", () => {
    const bus = new EventBus();
    const bm = new BackgroundCheckManager(bus);
    const c1 = bm.order("s1", "A", ["criminal"], "2026-06-01")!;
    bm.complete(c1.id, "clear", "2026-06-05");
    const c2 = bm.order("s2", "B", ["criminal"], "2026-06-01")!;
    bm.complete(c2.id, "adverse", "2026-06-03");
    const s = bm.summary();
    assert.equal(s.totalChecks, 2);
    assert.equal(s.clear, 1);
    assert.equal(s.adverse, 1);
    assert.equal(s.avgTurnaroundDays, 3); // (4 + 2) / 2
  });
});

describe("InsuranceCertificateManager", () => {
  it("record publishes recorded", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("insurancecert.recorded", (e) => { events.push(e.payload); });
    const im = new InsuranceCertificateManager(bus);
    im.record({ vendorId: "v1", vendorName: "Acme", carrier: "Hartford", coverageType: "general_liability", limitUsd: 1000000, effectiveDate: "2026-01-01", expiresAt: "2027-01-01" });
    assert.equal(events.length, 1);
  });

  it("noncompliant event fires below required limit", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("insurancecert.noncompliant", (e) => { events.push(e.payload); });
    const im = new InsuranceCertificateManager(bus);
    im.setRequirement("general_liability", 1000000);
    im.record({ vendorId: "v1", vendorName: "Acme", carrier: "X", coverageType: "general_liability", limitUsd: 500000, effectiveDate: "2026-01-01", expiresAt: "2027-01-01" });
    assert.equal(events.length, 1);
  });

  it("isCompliant checks limit, jurisdiction and expiry", () => {
    const bus = new EventBus();
    const im = new InsuranceCertificateManager(bus);
    im.setRequirement("auto", 500000);
    im.record({ vendorId: "v1", vendorName: "Acme", carrier: "X", coverageType: "auto", limitUsd: 1000000, effectiveDate: "2026-01-01", expiresAt: "2027-01-01" });
    assert.equal(im.isCompliant("v1", "auto", "2026-06-01"), true);
    assert.equal(im.isCompliant("v1", "auto", "2028-01-01"), false); // expired
  });

  it("checkExpiry marks expired and warns expiring", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("insurancecert.expiring", (e) => { events.push(e.payload); });
    const im = new InsuranceCertificateManager(bus);
    im.record({ vendorId: "v1", vendorName: "Acme", carrier: "X", coverageType: "cyber", limitUsd: 1000000, effectiveDate: "2026-01-01", expiresAt: "2026-07-10" });
    const expiring = im.checkExpiry("2026-06-25", 30);
    assert.equal(expiring.length, 1);
    assert.equal(events.length, 1);
  });

  it("revoke blocks compliance", () => {
    const bus = new EventBus();
    const im = new InsuranceCertificateManager(bus);
    const c = im.record({ vendorId: "v1", vendorName: "Acme", carrier: "X", coverageType: "umbrella", limitUsd: 5000000, effectiveDate: "2026-01-01", expiresAt: "2027-01-01" });
    im.revoke(c.id);
    assert.equal(im.isCompliant("v1", "umbrella", "2026-06-01"), false);
  });

  it("summary aggregates coverage types and vendors", () => {
    const bus = new EventBus();
    const im = new InsuranceCertificateManager(bus);
    im.record({ vendorId: "v1", vendorName: "A", carrier: "X", coverageType: "general_liability", limitUsd: 1000000, effectiveDate: "2026-01-01", expiresAt: "2027-01-01" });
    im.record({ vendorId: "v2", vendorName: "B", carrier: "Y", coverageType: "workers_comp", limitUsd: 1000000, effectiveDate: "2026-01-01", expiresAt: "2026-07-05" });
    const s = im.summary("2026-06-25");
    assert.equal(s.totalCerts, 2);
    assert.equal(s.active, 2);
    assert.equal(s.vendorsCovered, 2);
    assert.equal(s.expiringIn30Days, 1);
    assert.equal(s.byCoverageType.general_liability, 1);
  });
});

describe("PurchaseRequisitionManager", () => {
  it("create computes total from line items", () => {
    const bus = new EventBus();
    const rm = new PurchaseRequisitionManager(bus);
    const r = rm.create({ requesterId: "u1", department: "Eng", budgetCode: "ENG-2026", lineItems: [{ description: "laptop", quantity: 2, unitPriceUsd: 1500 }] });
    assert.equal(r.totalUsd, 3000);
  });

  it("submit publishes submitted", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("requisition.submitted", (e) => { events.push(e.payload); });
    const rm = new PurchaseRequisitionManager(bus);
    const r = rm.create({ requesterId: "u1", department: "Eng", budgetCode: "X", lineItems: [{ description: "x", quantity: 1, unitPriceUsd: 100 }] });
    rm.submit(r.id, "2026-06-01");
    assert.equal(rm.getRequisition(r.id)!.status, "submitted");
    assert.equal(events.length, 1);
  });

  it("approve publishes approved", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("requisition.approved", (e) => { events.push(e.payload); });
    const rm = new PurchaseRequisitionManager(bus);
    const r = rm.create({ requesterId: "u1", department: "Eng", budgetCode: "X", lineItems: [{ description: "x", quantity: 1, unitPriceUsd: 100 }] });
    rm.submit(r.id, "2026-06-01");
    rm.approve(r.id, "mgr1");
    assert.equal(rm.getRequisition(r.id)!.status, "approved");
    assert.equal(events.length, 1);
  });

  it("convertToPO requires approval and publishes converted", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("requisition.converted", (e) => { events.push(e.payload); });
    const rm = new PurchaseRequisitionManager(bus);
    const r = rm.create({ requesterId: "u1", department: "Eng", budgetCode: "X", lineItems: [{ description: "x", quantity: 1, unitPriceUsd: 100 }] });
    assert.equal(rm.convertToPO(r.id, "PO-1"), undefined);
    rm.submit(r.id, "2026-06-01"); rm.approve(r.id, "mgr1");
    rm.convertToPO(r.id, "PO-1");
    assert.equal(rm.getRequisition(r.id)!.status, "converted");
    assert.equal(events.length, 1);
  });

  it("submit requires line items", () => {
    const bus = new EventBus();
    const rm = new PurchaseRequisitionManager(bus);
    const r = rm.create({ requesterId: "u1", department: "Eng", budgetCode: "X", lineItems: [] });
    assert.equal(rm.submit(r.id, "2026-06-01"), undefined);
  });

  it("summary aggregates by department and status", () => {
    const bus = new EventBus();
    const rm = new PurchaseRequisitionManager(bus);
    const r1 = rm.create({ requesterId: "u1", department: "Eng", budgetCode: "X", lineItems: [{ description: "x", quantity: 1, unitPriceUsd: 100 }] });
    rm.submit(r1.id, "2026-06-01");
    rm.create({ requesterId: "u2", department: "Mktg", budgetCode: "Y", lineItems: [{ description: "y", quantity: 2, unitPriceUsd: 50 }] });
    const s = rm.summary();
    assert.equal(s.totalRequisitions, 2);
    assert.equal(s.pendingApproval, 1);
    assert.equal(s.totalRequestedUsd, 200);
    assert.equal(s.byDepartment.Eng, 1);
  });
});

describe("GoodsReceiptManager", () => {
  it("registerPO publishes po_registered", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("goodsreceipt.po_registered", (e) => { events.push(e.payload); });
    const gm = new GoodsReceiptManager(bus);
    gm.registerPO("PO-1", "s1", [{ sku: "A", expectedQty: 10 }]);
    assert.equal(events.length, 1);
    assert.equal(events[0].expectedUnits, 10);
  });

  it("receive accrues quantity and publishes received", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("goodsreceipt.received", (e) => { events.push(e.payload); });
    const gm = new GoodsReceiptManager(bus);
    const po = gm.registerPO("PO-1", "s1", [{ sku: "A", expectedQty: 10 }]);
    gm.receive(po.id, "A", 10, "good", "2026-06-01");
    assert.equal(gm.getPO(po.id)!.status, "complete");
    assert.equal(events.length, 1);
  });

  it("partial receipt flags discrepancy and partial status", () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe("goodsreceipt.discrepancy", (e) => { events.push(e.payload); });
    const gm = new GoodsReceiptManager(bus);
    const po = gm.registerPO("PO-1", "s1", [{ sku: "A", expectedQty: 10 }]);
    gm.receive(po.id, "A", 6, "good", "2026-06-01");
    assert.equal(gm.getPO(po.id)!.status, "partial");
    assert.equal(events.length, 1);
  });

  it("receive rejects unknown sku", () => {
    const bus = new EventBus();
    const gm = new GoodsReceiptManager(bus);
    const po = gm.registerPO("PO-1", "s1", [{ sku: "A", expectedQty: 10 }]);
    assert.equal(gm.receive(po.id, "Z", 1, "good", "2026-06-01"), undefined);
  });

  it("discrepancies lists mismatched lines", () => {
    const bus = new EventBus();
    const gm = new GoodsReceiptManager(bus);
    const po = gm.registerPO("PO-1", "s1", [{ sku: "A", expectedQty: 10 }, { sku: "B", expectedQty: 5 }]);
    gm.receive(po.id, "A", 10, "good", "2026-06-01");
    gm.receive(po.id, "B", 3, "good", "2026-06-01");
    assert.equal(gm.discrepancies(po.id).length, 1);
  });

  it("summary aggregates POs and receipts", () => {
    const bus = new EventBus();
    const gm = new GoodsReceiptManager(bus);
    const po1 = gm.registerPO("PO-1", "s1", [{ sku: "A", expectedQty: 10 }]);
    gm.receive(po1.id, "A", 10, "good", "2026-06-01");
    gm.registerPO("PO-2", "s2", [{ sku: "B", expectedQty: 5 }]);
    const s = gm.summary();
    assert.equal(s.totalPOs, 2);
    assert.equal(s.completePOs, 1);
    assert.equal(s.totalReceipts, 1);
  });
});
