/**
 * Worked scenario — "How should we adjust pricing to maximise revenue while
 * managing churn risk?"
 *
 * Exercises:
 *   - A causal pricing subgraph in the OKG: an elasticity model drives the
 *     pricing tier, which affects revenue impact, churn risk, and conversion rate.
 *   - A pricing digital twin: a structural causal model of ARPU as a function
 *     of price elasticity, so an intervention ("raise price 10%") can be
 *     simulated to a forward distribution.
 *   - Provenance on every node (anti-hallucination contract).
 *
 * Returns seeded graph anchors + the twin so callers (demo, tests, API)
 * can run retrieval and reasoning over a realistic pricing world.
 */

import type { Olympus } from "../index.js";
import { DigitalTwin } from "../simulation/digital-twin.js";
import type { UUID } from "../knowledge/graph/schema.js";

export interface PricingScenario {
  /** OKG node ids for anchoring GraphRAG traversal. */
  anchors: {
    elasticityModel: UUID;
    pricingTier: UUID;
    revenueImpact: UUID;
    churnRisk: UUID;
    conversionRate: UUID;
  };
  /** Structural causal model of ARPU under price changes. */
  twin: DigitalTwin;
}

/**
 * A pricing structural causal model.
 *
 *   monthly_arpu = base_arpu
 *                  + price_elasticity_coeff * price_elasticity
 *                  + conversion_sensitivity * conversion_rate_delta
 *
 * Intervening on `price_elasticity` (raising price) adjusts ARPU; the
 * elasticity coefficient encodes "less elastic demand → higher revenue per
 * customer at higher prices".
 */
export function pricingTwin(): DigitalTwin {
  return new DigitalTwin({
    metric: "monthly_arpu_usd",
    coefficients: {
      price_elasticity: -1.2,     // more elastic → lower captured revenue
      base_arpu: 1.0,
      churn_sensitivity: 0.8,     // higher churn risk → arpu at risk
      conversion_sensitivity: -0.6, // lower conversion → fewer new accounts
    },
    baseline: {
      price_elasticity: -1.2,
      base_arpu: 420,
      churn_sensitivity: 0.8,
      conversion_sensitivity: -0.6,
    },
    noiseFraction: 0.05,
  });
}

/**
 * Seed a causal pricing subgraph into an Olympus instance and index
 * supporting documents + semantic facts for GraphRAG. Idempotent per instance.
 */
export function seedPricingScenario(olympus: Olympus): PricingScenario {
  const okg = olympus.okg;

  // -- Causal subgraph -------------------------------------------------------
  const elasticityModel = okg.addNode({
    type: "Capability",
    props: { name: "ElasticityModel", description: "Price elasticity model for mid-market segment", elasticity: -1.2 },
    createdBy: "scenario",
    provenance: [{ sourceId: "pricing-elasticity-model", description: "pricing-analytics" }],
  });

  const pricingTier = okg.addNode({
    type: "Product",
    props: { name: "PricingTier", tier: "mid-market", listPrice: 420, currency: "USD" },
    createdBy: "scenario",
    provenance: [{ sourceId: "pricing-tier-mid-market", description: "billing" }],
  });

  const revenueImpact = okg.addNode({
    type: "Money",
    props: { name: "RevenueImpact", amount: 0, currency: "USD", description: "Projected revenue delta from price change" },
    createdBy: "scenario",
    provenance: [{ sourceId: "revenue-impact-pricing", description: "finance" }],
  });

  const churnRisk = okg.addNode({
    type: "Risk",
    props: { name: "ChurnRisk", probability: 0.12, description: "Incremental churn risk from price increase" },
    createdBy: "scenario",
    provenance: [{ sourceId: "churn-risk-pricing", description: "analytics" }],
  });

  const conversionRate = okg.addNode({
    type: "Asset",
    props: { name: "ConversionRate", value: 0.18, description: "Trial-to-paid conversion rate" },
    createdBy: "scenario",
    provenance: [{ sourceId: "conversion-rate-pricing", description: "growth" }],
  });

  // Edges (causal).
  okg.addEdge({ type: "CAUSES", src: elasticityModel.id, dst: pricingTier.id, weight: 0.85, createdBy: "scenario", sourceId: "pricing-elasticity-model" });
  okg.addEdge({ type: "INFLUENCES", src: pricingTier.id, dst: revenueImpact.id, weight: 0.9, createdBy: "scenario", sourceId: "pricing-tier-mid-market" });
  okg.addEdge({ type: "CAUSES", src: pricingTier.id, dst: churnRisk.id, weight: 0.65, createdBy: "scenario", sourceId: "churn-risk-pricing" });
  okg.addEdge({ type: "INFLUENCES", src: pricingTier.id, dst: conversionRate.id, weight: 0.7, createdBy: "scenario", sourceId: "conversion-rate-pricing" });

  // -- Vector documents -------------------------------------------------------
  olympus.rag.indexDocument({
    id: "doc-pricing-analysis",
    text: "Mid-market price elasticity estimated at -1.2. A 10% price increase at current elasticity projects +6.2% ARPU improvement with 1.8pt incremental churn risk. Conversion rate expected to decline ~4% for new trials.",
    embedding: [0.8, 0.3, 0.6, 0.4],
    ts: "2035-06-01T00:00:00.000Z",
  });
  olympus.rag.indexDocument({
    id: "doc-pricing-competitive",
    text: "Competitive analysis shows mid-market peers have raised prices 8–15% in the past 12 months. Our current list price of $420/mo is 12% below median.",
    embedding: [0.5, 0.7, 0.3, 0.6],
    ts: "2035-05-15T00:00:00.000Z",
  });

  // -- Semantic facts ---------------------------------------------------------
  olympus.memory.assertFact("pricing", "price_elasticity", "-1.2", 0.82);
  olympus.memory.assertFact("pricing", "base_arpu_usd", "420", 0.9);
  olympus.memory.assertFact("pricing", "churn_sensitivity", "0.8", 0.75);

  return {
    anchors: {
      elasticityModel: elasticityModel.id,
      pricingTier: pricingTier.id,
      revenueImpact: revenueImpact.id,
      churnRisk: churnRisk.id,
      conversionRate: conversionRate.id,
    },
    twin: pricingTwin(),
  };
}

/**
 * Pre-built scenario seed for use in tests and demos.
 * Intervention: raise_price_10pct — delta +0.1 on price_elasticity variable.
 */
export const PRICING_SCENARIO_SEED = {
  intervention: { variable: "price_elasticity", delta: 0.1 },
  label: "raise_price_10pct",
} as const;
