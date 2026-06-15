/**
 * Runnable demo — exercises the Olympus core end-to-end with the mock LLM.
 *
 *   npm install && npm run demo
 *
 * Demonstrates:
 *   1. Reasoned multi-agent decision session (reason, don't retrieve).
 *   2. Mandatory dissent + risk-aware escalation.
 *   3. Bitemporal OKG: decision node + later reconciliation.
 *   4. MCP tool invocation through the ABAC gate + tamper-evident audit chain.
 *   5. Digital-twin simulation (Monte Carlo + causal do-operator).
 *   6. Memory: episodic recording, Hebbian reinforcement, decay, calibration flywheel.
 *   7. GraphRAG: grounded context bundle over graph traversal + vector + semantic layers.
 */

import { Olympus } from "./index.js";
import { DigitalTwin } from "./simulation/digital-twin.js";
import { seedChurnScenario } from "./scenarios/churn.js";

async function main(): Promise<void> {
  // A toy structural causal model of quarterly cash given pipeline & spend,
  // wired into Olympus so the reasoning engine simulates interventions inline.
  const twin = new DigitalTwin({
    metric: "q3_cash_usd",
    coefficients: { pipeline_conversion: 4_000_000, marketing_spend: -1.0, base_revenue: 1.0 },
    baseline: { pipeline_conversion: 0.22, marketing_spend: 900_000, base_revenue: 2_500_000 },
    noiseFraction: 0.08,
  });

  const olympus = new Olympus({ twin });

  // Trace key events to show the spine is live.
  const seen: string[] = [];
  olympus.bus.subscribe("decision.*", (e) => { seen.push(e.topic); });
  olympus.bus.subscribe("agent.*",    (e) => { seen.push(e.topic); });
  olympus.bus.subscribe("memory.*",   (e) => { seen.push(e.topic); });
  olympus.bus.subscribe("sim.*",      (e) => { seen.push(e.topic); });
  olympus.bus.subscribe("autonomy.*", (e) => { seen.push(e.topic); });
  olympus.bus.subscribe("action.gated", (e) => { seen.push(e.topic); });

  // Grant the finance domain the ability to reallocate budget autonomously (L5)
  // within a blast-radius — so the closed loop can auto-execute when safe.
  olympus.autonomy.setGrant({
    domain: "finance",
    capability: "reallocate_budget",
    level: 5,
    blastRadius: { maxAmount: 250_000, maxPerDay: 10 },
  });

  // -------------------------------------------------------------------------
  console.log("=== 1. Closed loop: reason → simulate → gate → act ===");
  const answer = await olympus.ere.ask(
    "Should we cut Q3 marketing spend by 18% to extend runway?",
    {
      domain: "finance",
      options: ["cut-18pct", "hold-spend", "cut-9pct"],
      depth: "deliberate",
      intervention: { variable: "marketing_spend", delta: -0.18 },
      capability: "reallocate_budget",
      exposureAmount: 162_000, // 18% of 900k
      simSeed: 7,
    },
  );
  console.log("Thesis:        ", answer.thesis);
  console.log("Confidence:    ", answer.confidence);
  console.log("Recommendation:", answer.recommendation ?? "(escalated)");
  console.log("Dissent:       ", answer.dissent.slice(0, 90) + "…");
  console.log("Autonomy gate: ", answer.autonomyGate);
  for (const ev of answer.evidence) {
    if (ev.ref.startsWith("sim://")) console.log("Sim evidence:  ", ev.claim);
  }

  // -------------------------------------------------------------------------
  console.log("\n=== 2. Bitemporal OKG: decision + reconciliation ===");
  olympus.okg.reconcileDecision(
    answer.decisionId,
    { runwayMonthsDelta: +2.1, pipelineDelta: -0.07 },
    "cfo",
  );
  const decision = olympus.okg.currentNode(answer.decisionId);
  console.log("Decision status:", (decision?.props as { status: string }).status);
  console.log("Append-only: prior belief retained for replay.");

  // -------------------------------------------------------------------------
  console.log("\n=== 3. MCP tool call through ABAC gate + audit ===");
  const decisions = await olympus.mcp.invoke("okg.query", { type: "Decision" }, {
    id: "cfo", kind: "agent", autonomyLevel: 1,
  });
  console.log("okg.query returned", (decisions as unknown[]).length, "decision node(s).");

  try {
    await olympus.mcp.invoke("comms.send_email", { to: "ceo@co", subject: "FYI" }, {
      id: "sales", kind: "agent", autonomyLevel: 1,
    });
  } catch (err) {
    console.log("Denied as expected:", (err as Error).message);
  }

  // -------------------------------------------------------------------------
  console.log("\n=== 4. Audit chain integrity ===");
  console.log("Audit records:", olympus.mcp.auditLog().length);
  console.log("Chain valid:  ", olympus.mcp.verifyAuditChain());

  // -------------------------------------------------------------------------
  console.log("\n=== 5. Digital-twin simulation (causal do-operator, 10k runs) ===");
  const sim = twin.run({
    type: "causal_intervention",
    decisionId: answer.decisionId,
    intervention: { variable: "marketing_spend", delta: -0.18 },
    runs: 10_000,
    seed: 7,
  });
  console.log("Metric:      ", sim.metric);
  console.log("P10/P50/P90: ", sim.distribution.p10, "/", sim.distribution.p50, "/", sim.distribution.p90);
  console.log("Tail risk:   ", sim.distribution.tailRisk);
  console.log("Sensitivity: ", sim.sensitivity);

  // -------------------------------------------------------------------------
  console.log("\n=== 6. Memory: episodic → semantic consolidation + calibration flywheel ===");

  // Record some episodic events.
  olympus.memory.recordEpisode({ ts: new Date().toISOString(), domain: "sales", description: "Enterprise deals averaged 94 days", metadata: {} });
  olympus.memory.recordEpisode({ ts: new Date().toISOString(), domain: "sales", description: "Churn event: mid-market customer Acme", metadata: { arr: 120_000 } });
  olympus.memory.recordEpisode({ ts: new Date().toISOString(), domain: "finance", description: "Monthly burn averaged 380000 usd", metadata: {} });

  // Consolidation pass: extract semantic facts from recent episodes.
  const since = new Date(Date.now() - 3_600_000).toISOString(); // last hour
  const { extracted, conflicts } = olympus.memory.consolidate(since);
  console.log("Episodes recorded:", olympus.memory.stats().episodeCount);
  console.log("Semantic facts extracted:", extracted);
  console.log("Conflicts detected:", conflicts);

  // Hebbian reinforcement: assert the same fact twice.
  olympus.memory.assertFact("sales", "avg_close_days", "94");
  const reinforced = olympus.memory.assertFact("sales", "avg_close_days", "94");
  console.log("Reinforced fact weight:", reinforced.weight, "(observation count:", reinforced.observationCount + ")");

  // Calibration flywheel: record predicted vs actual from the reconciled decision.
  olympus.memory.recordCalibration({
    decisionId: answer.decisionId,
    domain: "finance",
    predictedMetric: "runway_months_delta",
    predicted: 2.1,
    actual: 1.8,
    error: 1.8 - 2.1,
  });
  const mae = olympus.memory.maeByDomain();
  console.log("MAE by domain (calibration flywheel):", mae);

  // Register a procedure.
  olympus.memory.registerProcedure({
    name: "RunRenewal",
    description: "Standard B2B renewal workflow",
    steps: [
      { action: "send_health_check", params: { daysOut: 90 } },
      { action: "schedule_qbr" },
      { action: "draft_renewal_proposal" },
      { action: "route_to_approver" },
    ],
  });
  const proc = olympus.memory.invokeProce("RunRenewal");
  console.log("Procedure invoked:", proc?.name, "| steps:", proc?.steps.length, "| usage:", proc?.usageCount);

  // -------------------------------------------------------------------------
  console.log("\n=== 7. Second domain: churn causal subgraph + GraphRAG + sales twin ===");

  // Seed a realistic world: support reorg → onboarding delay → churn spike → ARR.
  const churn = seedChurnScenario(olympus);

  // GraphRAG walks the causal edges from the churn spike and fuses graph +
  // vector + semantic + aggregate streams into one fully-grounded bundle.
  const ctx = olympus.rag.retrieve(
    "why did mid-market churn rise onboarding",
    [churn.anchors.churnSpike, churn.anchors.reorg],
    [0.85, 0.25, 0.3, 0.48],
    {},
    8,
  );
  console.log("Facts retrieved:", ctx.facts.length, "| fully grounded:", ctx.fullyGrounded);
  for (const f of ctx.facts.slice(0, 5)) {
    console.log(` [${f.source.padEnd(9)}] score=${f.score}  ${f.claim.slice(0, 72)}`);
  }

  // Simulate the intervention "restore 2 onboarding FTE" on the sales twin.
  const restore = churn.twin.run({ type: "causal_intervention", decisionId: answer.decisionId,
    intervention: { variable: "onboarding_fte", delta: 0.6667 }, runs: 10_000, seed: 11 });
  const churnBase = churn.twin.run({ type: "causal_intervention", decisionId: answer.decisionId,
    intervention: { variable: "onboarding_fte", delta: 0 }, runs: 10_000, seed: 11 });
  console.log(`Restore 2 FTE → churn P50 ${restore.distribution.p50}pt vs baseline ${churnBase.distribution.p50}pt (${(restore.distribution.p50 - churnBase.distribution.p50).toFixed(2)}pt).`);

  // -------------------------------------------------------------------------
  console.log("\n=== 8. Autonomy Engine: gate scenarios in isolation ===");

  // Grant collections the ability to send dunning at L4 within blast-radius.
  olympus.autonomy.setGrant({
    domain: "finance",
    capability: "send_dunning",
    level: 4,
    blastRadius: { maxAmount: 50_000, maxPerDay: 200 },
  });

  // a) In-bounds L4 action with a simulation -> executes (human notified).
  const a = olympus.autonomy.evaluate({
    decisionId: answer.decisionId, domain: "finance", capability: "send_dunning",
    attemptedLevel: 4, amount: 12_000, simulated: true,
  });
  console.log("a) in-bounds L4:      ", a.disposition, "|", a.reasons[0]);

  // b) L4 but blast-radius breach (amount too high) -> queued for approval.
  const b = olympus.autonomy.evaluate({
    decisionId: answer.decisionId, domain: "finance", capability: "send_dunning",
    attemptedLevel: 4, amount: 90_000, simulated: true,
  });
  console.log("b) blast-radius:      ", b.disposition, "|", b.reasons[0]);

  // c) L3+ action with NO simulation -> denied (simulation precondition).
  const c = olympus.autonomy.evaluate({
    decisionId: answer.decisionId, domain: "finance", capability: "send_dunning",
    attemptedLevel: 4, amount: 12_000, simulated: false,
  });
  console.log("c) no simulation:     ", c.disposition, "|", c.reasons[0]);

  // d) Hard-ceiling capability without a human token -> denied regardless of grant.
  olympus.autonomy.setGrant({ domain: "people", capability: "terminate_employee", level: 6 });
  const d = olympus.autonomy.evaluate({
    decisionId: answer.decisionId, domain: "people", capability: "terminate_employee",
    attemptedLevel: 6, simulated: true,
  });
  console.log("d) hard ceiling:      ", d.disposition, "| effectiveLevel L" + d.effectiveLevel, "|", d.reasons[0]);

  // e) Kill switch -> everything drops to advisory.
  olympus.autonomy.killSwitch("Anomaly detected by Risk Agent");
  const e = olympus.autonomy.evaluate({
    decisionId: answer.decisionId, domain: "finance", capability: "send_dunning",
    attemptedLevel: 4, amount: 12_000, simulated: true,
  });
  console.log("e) after kill switch: ", e.disposition, "| effectiveLevel L" + e.effectiveLevel);
  olympus.autonomy.rearm();

  // -------------------------------------------------------------------------
  console.log("\n=== 9. Decision Inbox: read-model projection over the log ===");
  console.log("Inbox stats:", olympus.inbox.stats());
  for (const item of olympus.inbox.all()) {
    console.log(` [${item.status.padEnd(14)}] ${item.question.slice(0, 48)} — ${item.note}`);
  }
  // Projection contract: drop the inbox and rebuild it purely from the event log.
  const rebuilt = olympus.inbox.rebuild(olympus.bus);
  console.log("Rebuilt from log — identical item count:", rebuilt.all().length);

  // -------------------------------------------------------------------------
  console.log("\n=== Event spine (all unique topics) ===");
  const uniqueTopics = [...new Set(seen)];
  console.log(uniqueTopics.join("  "));
  console.log("Total events on bus:", olympus.bus.events().length);
  console.log("\nMemory stats:", olympus.memory.stats());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
