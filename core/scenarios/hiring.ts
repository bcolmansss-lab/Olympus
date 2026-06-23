/**
 * Worked scenario — "How do we close the headcount gap and reduce time-to-hire?"
 *
 * Exercises:
 *   - A causal hiring subgraph in the OKG: the hiring pipeline drives
 *     time-to-hire and offer-acceptance rate; headcount gap affects revenue
 *     per head.
 *   - A hiring digital twin: a structural model of revenue-per-head as a
 *     function of pipeline velocity, so an intervention ("accelerate sourcing")
 *     can be simulated to a forward distribution.
 *   - Provenance on every node (anti-hallucination contract).
 *
 * Returns seeded graph anchors + the twin so callers (demo, tests, API)
 * can run retrieval and reasoning over a realistic hiring world.
 */

import type { Olympus } from "../index.js";
import { DigitalTwin } from "../simulation/digital-twin.js";
import type { UUID } from "../knowledge/graph/schema.js";

export interface HiringScenario {
  /** OKG node ids for anchoring GraphRAG traversal. */
  anchors: {
    hiringPipeline: UUID;
    timeToHire: UUID;
    offerAcceptRate: UUID;
    headcountGap: UUID;
    revenuePerHead: UUID;
  };
  /** Structural causal model of revenue-per-head under hiring interventions. */
  twin: DigitalTwin;
}

/**
 * A hiring structural causal model.
 *
 *   revenue_per_head = base_revenue_per_head
 *                      + pipeline_velocity_coeff * pipeline_velocity
 *                      - headcount_gap_coeff * headcount_gap
 *
 * Intervening on `pipeline_velocity` (accelerating sourcing) reduces
 * time-to-hire and closes the headcount gap, lifting revenue per head.
 */
export function hiringTwin(): DigitalTwin {
  return new DigitalTwin({
    metric: "revenue_per_head_usd",
    coefficients: {
      pipeline_velocity: 0.7,       // higher velocity → better revenue/head
      offer_acceptance_rate: 0.65,  // higher acceptance → fewer re-fills
      revenue_per_head: 1.0,
      headcount_gap: -12.0,         // larger gap → lower aggregate output
    },
    baseline: {
      pipeline_velocity: 0.7,
      offer_acceptance_rate: 0.65,
      revenue_per_head: 185_000,
      headcount_gap: 12,
    },
    noiseFraction: 0.04,
  });
}

/**
 * Seed a causal hiring subgraph into an Olympus instance and index
 * supporting documents + semantic facts for GraphRAG. Idempotent per instance.
 */
export function seedHiringScenario(olympus: Olympus): HiringScenario {
  const okg = olympus.okg;

  // -- Causal subgraph -------------------------------------------------------
  const hiringPipeline = okg.addNode({
    type: "Capability",
    props: { name: "HiringPipeline", velocity: 0.7, openRoles: 12, description: "End-to-end talent acquisition pipeline" },
    createdBy: "scenario",
    provenance: [{ sourceId: "hiring-pipeline-metrics", description: "people-ops" }],
  });

  const timeToHire = okg.addNode({
    type: "Asset",
    props: { name: "TimeToHire", days: 38, targetDays: 25, description: "Median days from role open to offer accepted" },
    createdBy: "scenario",
    provenance: [{ sourceId: "time-to-hire-q2", description: "recruiting" }],
  });

  const offerAcceptRate = okg.addNode({
    type: "Asset",
    props: { name: "OfferAcceptRate", value: 0.65, description: "Ratio of offers extended that are accepted" },
    createdBy: "scenario",
    provenance: [{ sourceId: "offer-acceptance-q2", description: "recruiting" }],
  });

  const headcountGap = okg.addNode({
    type: "Risk",
    props: { name: "HeadcountGap", openRoles: 12, description: "Unfilled headcount creating revenue and capacity risk" },
    createdBy: "scenario",
    provenance: [{ sourceId: "headcount-gap-q2", description: "people-ops" }],
  });

  const revenuePerHead = okg.addNode({
    type: "Money",
    props: { name: "RevenuePerHead", amount: 185_000, currency: "USD", description: "Annual revenue attributable per full-time employee" },
    createdBy: "scenario",
    provenance: [{ sourceId: "revenue-per-head-finance", description: "finance" }],
  });

  // Edges (causal).
  okg.addEdge({ type: "CAUSES", src: hiringPipeline.id, dst: timeToHire.id, weight: 0.8, createdBy: "scenario", sourceId: "hiring-pipeline-metrics" });
  okg.addEdge({ type: "INFLUENCES", src: hiringPipeline.id, dst: offerAcceptRate.id, weight: 0.6, createdBy: "scenario", sourceId: "hiring-pipeline-metrics" });
  okg.addEdge({ type: "CAUSES", src: headcountGap.id, dst: revenuePerHead.id, weight: 0.75, createdBy: "scenario", sourceId: "headcount-gap-q2" });

  // -- Vector documents -------------------------------------------------------
  olympus.rag.indexDocument({
    id: "doc-hiring-postmortem",
    text: "Q2 2035: 12 open roles averaging 38 days to fill versus a 25-day target. Offer acceptance rate is 65%, below the 78% industry benchmark. Sourcing pipeline velocity scored 0.7/1.0.",
    embedding: [0.7, 0.4, 0.8, 0.3],
    ts: "2035-07-01T00:00:00.000Z",
  });
  olympus.rag.indexDocument({
    id: "doc-revenue-per-head",
    text: "Revenue per head sits at $185k annually. Closing the 12-role headcount gap at current RPH projects $2.2M incremental annual revenue.",
    embedding: [0.4, 0.6, 0.5, 0.8],
    ts: "2035-06-28T00:00:00.000Z",
  });

  // -- Semantic facts ---------------------------------------------------------
  olympus.memory.assertFact("hiring", "pipeline_velocity", "0.7", 0.8);
  olympus.memory.assertFact("hiring", "offer_acceptance_rate", "0.65", 0.85);
  olympus.memory.assertFact("hiring", "headcount_gap", "12", 0.9);

  return {
    anchors: {
      hiringPipeline: hiringPipeline.id,
      timeToHire: timeToHire.id,
      offerAcceptRate: offerAcceptRate.id,
      headcountGap: headcountGap.id,
      revenuePerHead: revenuePerHead.id,
    },
    twin: hiringTwin(),
  };
}

/**
 * Pre-built scenario seed for use in tests and demos.
 * Intervention: accelerate_sourcing — delta +0.15 on pipeline_velocity variable.
 */
export const HIRING_SCENARIO_SEED = {
  intervention: { variable: "pipeline_velocity", delta: 0.15 },
  label: "accelerate_sourcing",
} as const;
