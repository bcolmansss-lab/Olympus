/**
 * Runnable demo — exercises the Olympus core end-to-end with the mock LLM.
 *
 *   npm install && npm run demo
 *
 * Demonstrates:
 *   1. A reasoned, multi-agent decision session (reason, don't retrieve).
 *   2. Mandatory dissent + risk-aware escalation.
 *   3. Bitemporal OKG with a decision and its later reconciliation.
 *   4. MCP tool invocation through the ABAC gate + tamper-evident audit chain.
 */

import { Olympus } from "./index.js";
import { DigitalTwin } from "./simulation/digital-twin.js";

async function main(): Promise<void> {
  const olympus = new Olympus();

  // Trace key events to show the spine is live.
  const seen: string[] = [];
  olympus.bus.subscribe("decision.*", (e) => {
    seen.push(e.topic);
  });
  olympus.bus.subscribe("agent.*", (e) => {
    seen.push(e.topic);
  });

  console.log("=== 1. Reasoned decision ===");
  const answer = await olympus.ere.ask(
    "Should we cut Q3 marketing spend by 18% to extend runway?",
    { domain: "finance", options: ["cut-18pct", "hold-spend", "cut-9pct"], depth: "deliberate" },
  );
  console.log("Thesis:       ", answer.thesis);
  console.log("Confidence:   ", answer.confidence);
  console.log("Recommendation:", answer.recommendation ?? "(escalated)");
  console.log("Dissent:      ", answer.dissent);
  console.log("Autonomy gate:", answer.autonomyGate);

  console.log("\n=== 2. Bitemporal OKG: decision + reconciliation ===");
  olympus.okg.reconcileDecision(
    answer.decisionId,
    { runwayMonthsDelta: +2.1, pipelineDelta: -0.07 },
    "cfo",
  );
  const decision = olympus.okg.currentNode(answer.decisionId);
  console.log("Decision status:", (decision?.props as { status: string }).status);
  console.log("Versions are append-only; prior belief retained for replay.");

  console.log("\n=== 3. MCP tool call through ABAC gate + audit ===");
  // A read tool any caller may use.
  const decisions = await olympus.mcp.invoke("okg.query", { type: "Decision" }, {
    id: "cfo",
    kind: "agent",
    autonomyLevel: 1,
  });
  console.log("okg.query returned", (decisions as unknown[]).length, "decision node(s).");

  // An external-write tool that requires autonomy L4 — caller at L1 is denied.
  try {
    await olympus.mcp.invoke("comms.send_email", { to: "ceo@co", subject: "FYI" }, {
      id: "sales",
      kind: "agent",
      autonomyLevel: 1,
    });
  } catch (err) {
    console.log("Denied as expected:", (err as Error).message);
  }

  console.log("\n=== 4. Audit chain integrity ===");
  console.log("Audit records:", olympus.mcp.auditLog().length);
  console.log("Chain valid:  ", olympus.mcp.verifyAuditChain());

  console.log("\n=== 5. Digital-twin simulation (Monte Carlo + causal do-operator) ===");
  // A toy structural causal model of quarterly cash given pipeline & spend.
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
    intervention: { variable: "marketing_spend", delta: -0.18 }, // the "cut 18%" option
    runs: 10_000,
    seed: 7,
  });
  console.log("Metric:        ", sim.metric);
  console.log("P10/P50/P90:   ", sim.distribution.p10, sim.distribution.p50, sim.distribution.p90);
  console.log("Tail risk:     ", sim.distribution.tailRisk);
  console.log("Sensitivity:   ", sim.sensitivity);

  console.log("\n=== Event spine (sampled) ===");
  console.log(seen.slice(0, 12).join("  "));
  console.log("Total events on bus:", olympus.bus.events().length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
