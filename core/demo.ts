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

async function main(): Promise<void> {
  const olympus = new Olympus();

  // Trace key events to show the spine is live.
  const seen: string[] = [];
  olympus.bus.subscribe("decision.*", (e) => { seen.push(e.topic); });
  olympus.bus.subscribe("agent.*",    (e) => { seen.push(e.topic); });
  olympus.bus.subscribe("memory.*",   (e) => { seen.push(e.topic); });
  olympus.bus.subscribe("sim.*",      (e) => { seen.push(e.topic); });

  // -------------------------------------------------------------------------
  console.log("=== 1. Reasoned decision ===");
  const answer = await olympus.ere.ask(
    "Should we cut Q3 marketing spend by 18% to extend runway?",
    { domain: "finance", options: ["cut-18pct", "hold-spend", "cut-9pct"], depth: "deliberate" },
  );
  console.log("Thesis:        ", answer.thesis);
  console.log("Confidence:    ", answer.confidence);
  console.log("Recommendation:", answer.recommendation ?? "(escalated)");
  console.log("Dissent:       ", answer.dissent.slice(0, 100) + "…");
  console.log("Autonomy gate: ", answer.autonomyGate);

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
  const twin = new DigitalTwin(
    {
      metric: "q3_cash_usd",
      coefficients: { pipeline_conversion: 4_000_000, marketing_spend: -1.0, base_revenue: 1.0 },
      baseline: { pipeline_conversion: 0.22, marketing_spend: 900_000, base_revenue: 2_500_000 },
      noiseFraction: 0.08,
    },
    olympus.bus,
  );
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
  console.log("\n=== 7. GraphRAG: grounded context bundle ===");

  // Index a couple of mock vector documents (tiny 4-dim embeddings for the demo).
  olympus.rag.indexDocument({
    id: "doc-churn-analysis",
    text: "Mid-market churn rose 3.1pts in Q2 due to onboarding delays post support-reorg on 2035-04-01.",
    embedding: [0.9, 0.1, 0.3, 0.4],
    ts: new Date().toISOString(),
  });
  olympus.rag.indexDocument({
    id: "doc-pipeline",
    text: "Enterprise pipeline conversion held steady at 22% through H1.",
    embedding: [0.2, 0.8, 0.1, 0.5],
    ts: new Date().toISOString(),
  });

  const ctx = olympus.rag.retrieve(
    "sales churn pipeline revenue",
    [answer.decisionId],           // anchor on the decision node
    [0.7, 0.4, 0.2, 0.45],        // mock query embedding (close to doc-churn-analysis)
    {},
    12,
  );
  console.log("Facts retrieved:", ctx.facts.length);
  console.log("Fully grounded: ", ctx.fullyGrounded);
  for (const f of ctx.facts.slice(0, 4)) {
    console.log(` [${f.source.padEnd(9)}] score=${f.score}  ${f.claim.slice(0, 80)}`);
  }

  // -------------------------------------------------------------------------
  console.log("\n=== 8. Autonomy Engine: the governed action gate ===");
  olympus.bus.subscribe("autonomy.*", (e) => { seen.push(e.topic); });
  olympus.bus.subscribe("action.gated", (e) => { seen.push(e.topic); });

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
