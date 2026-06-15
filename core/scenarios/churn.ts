/**
 * Worked scenario — "Why did mid-market churn rise, and what should we do?"
 *
 * This is the second act of the Olympus narrative (the first is finance /
 * runway). It exercises the parts of the system that a single ask() can't show
 * on its own:
 *
 *   - A *causal subgraph* in the OKG: a support reorg CAUSES onboarding delay,
 *     which CAUSES a churn spike, which INFLUENCES ARR. GraphRAG walks these
 *     edges to ground the diagnosis in structure, not vibes.
 *   - A *sales digital twin*: a structural model of mid-market churn as a
 *     function of onboarding capacity, so an intervention ("restore 2 FTE")
 *     can be simulated to a forward distribution.
 *   - *Provenance*: every retrieved fact carries a ref, so the thesis is
 *     traceable end to end (the anti-hallucination contract).
 *
 * Returns the seeded graph anchors + the twin so callers (demo, tests, API)
 * can run retrieval and reasoning over a realistic world.
 */

import type { Olympus } from "../index.js";
import { DigitalTwin } from "../simulation/digital-twin.js";
import type { UUID } from "../knowledge/graph/schema.js";

export interface ChurnScenario {
  /** OKG node ids, for anchoring GraphRAG traversal. */
  anchors: { reorg: UUID; onboarding: UUID; churnSpike: UUID; arr: UUID };
  /** Structural causal model of mid-market churn. */
  twin: DigitalTwin;
}

/**
 * A sales/churn structural model.
 *
 *   monthly_churn_pct = base_churn
 *                       - onboarding_capacity_coeff * onboarding_fte
 *                       + macro_pressure
 *
 * Intervening on `onboarding_fte` (restoring headcount) lowers churn; the
 * negative coefficient encodes "more onboarding capacity → less churn".
 */
export function churnTwin(): DigitalTwin {
  return new DigitalTwin({
    metric: "mid_market_monthly_churn_pct",
    coefficients: {
      onboarding_fte: -0.45, // each FTE removes ~0.45pt of monthly churn
      macro_pressure: 1.0,
      base_churn: 1.0,
    },
    baseline: {
      onboarding_fte: 3, // reorg cut the team from 5 → 3
      macro_pressure: 1.1,
      base_churn: 2.0,
    },
    noiseFraction: 0.06,
  });
}

/**
 * Seed a causal churn subgraph into an Olympus instance and index supporting
 * documents + semantic facts for GraphRAG. Idempotent per instance.
 */
export function seedChurnScenario(olympus: Olympus): ChurnScenario {
  const okg = olympus.okg;

  // -- Causal subgraph: reorg → onboarding delay → churn spike → ARR --------
  const reorg = okg.addNode({
    type: "Event",
    props: { title: "Support reorg", date: "2035-04-01", effect: "onboarding capacity -22%" },
    createdBy: "scenario",
    provenance: [{ sourceId: "reorg-2035-04-01", description: "hris" }],
  });

  const onboarding = okg.addNode({
    type: "Capability",
    props: { name: "Customer onboarding", fte: 3, slaDaysP50: 21, priorSlaDaysP50: 12 },
    createdBy: "scenario",
    provenance: [{ sourceId: "onboarding-capacity", description: "ops" }],
  });

  const churnSpike = okg.addNode({
    type: "Risk",
    props: { name: "Mid-market churn spike", deltaPts: 3.1, quarter: "Q2-2035", cohort: "delayed-onboarding" },
    createdBy: "scenario",
    provenance: [{ sourceId: "churn-cohort-q2", description: "analytics" }],
  });

  const arr = okg.addNode({
    type: "Money",
    props: { name: "Mid-market ARR", amount: 8_400_000, currency: "USD", atRisk: 920_000 },
    createdBy: "scenario",
    provenance: [{ sourceId: "arr-mid-market", description: "finance" }],
  });

  // Edges (causal, weighted by attribution strength).
  okg.addEdge({ type: "CAUSES", src: reorg.id, dst: onboarding.id, weight: 0.9, createdBy: "scenario", sourceId: "reorg-2035-04-01" });
  okg.addEdge({ type: "CAUSES", src: onboarding.id, dst: churnSpike.id, weight: 0.62, createdBy: "scenario", sourceId: "churn-attribution" });
  okg.addEdge({ type: "INFLUENCES", src: churnSpike.id, dst: arr.id, weight: 0.8, createdBy: "scenario", sourceId: "arr-at-risk" });

  // -- Vector documents (tiny embeddings for the reference demo) ------------
  olympus.rag.indexDocument({
    id: "doc-churn-postmortem",
    text: "Mid-market churn rose 3.1pts in Q2 2035. The delayed-onboarding cohort churned 4.4x the baseline; onboarding SLA slipped from 12 to 21 days after the 2035-04-01 support reorg cut the team 5→3.",
    embedding: [0.9, 0.2, 0.3, 0.5],
    ts: "2035-07-05T00:00:00.000Z",
  });
  olympus.rag.indexDocument({
    id: "doc-macro",
    text: "Competitive and macro pressure contributed an estimated 38% of mid-market churn in Q2; the remainder is attributable to onboarding capacity.",
    embedding: [0.3, 0.85, 0.2, 0.4],
    ts: "2035-07-02T00:00:00.000Z",
  });

  // -- Semantic facts (reinforced beliefs) ----------------------------------
  olympus.memory.assertFact("onboarding", "sla_days_p50", "21", 0.85);
  olympus.memory.assertFact("churn", "primary_driver", "onboarding_delay", 0.78);
  olympus.memory.assertFact("churn", "macro_share_pct", "38", 0.7);

  return {
    anchors: { reorg: reorg.id, onboarding: onboarding.id, churnSpike: churnSpike.id, arr: arr.id },
    twin: churnTwin(),
  };
}
