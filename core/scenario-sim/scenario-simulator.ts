/**
 * ScenarioSimulator — what-if analysis, decision trees, and impact modeling for business decisions.
 *
 * Run multiple scenarios against configurable variables and compare outcomes.
 *
 * Events:
 *   - "scenario.run_completed": { scenarioId, name, outcomeScore, recommendation }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ScenarioType = "pricing_change" | "headcount" | "market_expansion" | "product_launch" | "acquisition" | "cost_cut" | "custom";
export type OutcomeMetric = "revenue" | "profit" | "burn_rate" | "headcount" | "market_share" | "customer_count" | "arr";

export interface ScenarioVariable {
  name: string;
  currentValue: number;
  proposedValue: number;
  unit: string;
  impactWeight: number; // 0-1, how much this variable drives outcomes
}

export interface ScenarioOutcome {
  metric: OutcomeMetric;
  baselineValue: number;
  projectedValue: number;
  deltaValue: number;
  deltaPct: number;
  confidence: number; // 0-100
}

export interface Scenario {
  id: string;
  name: string;
  type: ScenarioType;
  description: string;
  variables: ScenarioVariable[];
  outcomes: ScenarioOutcome[];
  overallScore: number; // weighted sum of positive outcome deltas
  recommendation: "proceed" | "reconsider" | "reject";
  runAt: string;
  tags?: string[];
}

export interface ScenarioSummary {
  totalScenarios: number;
  recommended: number;
  avgScore: number;
  byType: Partial<Record<ScenarioType, number>>;
}

export class ScenarioSimulator {
  private scenarios: Map<string, Scenario> = new Map();

  constructor(private readonly bus: EventBus) {}

  runScenario(input: {
    name: string;
    type: ScenarioType;
    description: string;
    variables: ScenarioVariable[];
    baselineOutcomes: Array<{ metric: OutcomeMetric; value: number }>;
    tags?: string[];
    id?: string;
  }): Scenario {
    const totalWeightedChange = input.variables.reduce((sum, v) => {
      if (v.currentValue === 0) return sum;
      return sum + ((v.proposedValue - v.currentValue) / v.currentValue) * v.impactWeight;
    }, 0);

    const outcomes: ScenarioOutcome[] = input.baselineOutcomes.map((b) => {
      const projectedValue = b.value * (1 + totalWeightedChange);
      const deltaValue = projectedValue - b.value;
      const deltaPct = b.value !== 0 ? (deltaValue / b.value) * 100 : 0;
      const confidence = 100 - Math.min(50, Math.abs(totalWeightedChange) * 100);
      return {
        metric: b.metric,
        baselineValue: b.value,
        projectedValue,
        deltaValue,
        deltaPct,
        confidence,
      };
    });

    const positiveOutcomes = outcomes.filter((o) => o.deltaPct > 0);
    const avgDeltaPct =
      positiveOutcomes.length > 0
        ? positiveOutcomes.reduce((sum, o) => sum + o.deltaPct, 0) / positiveOutcomes.length
        : 0;
    const overallScore = Math.max(0, Math.min(100, avgDeltaPct));

    const recommendation: Scenario["recommendation"] =
      overallScore > 10 ? "proceed" : overallScore > 0 ? "reconsider" : "reject";

    const scenario: Scenario = {
      id: input.id ?? randomUUID(),
      name: input.name,
      type: input.type,
      description: input.description,
      variables: input.variables,
      outcomes,
      overallScore,
      recommendation,
      runAt: new Date().toISOString(),
      tags: input.tags,
    };

    this.scenarios.set(scenario.id, scenario);

    this.bus.publish("scenario.run_completed", {
      scenarioId: scenario.id,
      name: scenario.name,
      outcomeScore: scenario.overallScore,
      recommendation: scenario.recommendation,
    });

    return scenario;
  }

  getScenario(id: string): Scenario | undefined {
    return this.scenarios.get(id);
  }

  listScenarios(type?: ScenarioType): Scenario[] {
    const all = Array.from(this.scenarios.values());
    return type ? all.filter((s) => s.type === type) : all;
  }

  compareScenarios(ids: string[]): Array<{ id: string; name: string; overallScore: number; recommendation: string }> {
    return ids
      .map((id) => this.scenarios.get(id))
      .filter((s): s is Scenario => s !== undefined)
      .map((s) => ({ id: s.id, name: s.name, overallScore: s.overallScore, recommendation: s.recommendation }))
      .sort((a, b) => b.overallScore - a.overallScore);
  }

  summary(): ScenarioSummary {
    const all = Array.from(this.scenarios.values());
    const byType: Partial<Record<ScenarioType, number>> = {};
    for (const s of all) {
      byType[s.type] = (byType[s.type] ?? 0) + 1;
    }
    const recommended = all.filter((s) => s.recommendation === "proceed").length;
    const avgScore = all.length > 0 ? all.reduce((sum, s) => sum + s.overallScore, 0) / all.length : 0;
    return {
      totalScenarios: all.length,
      recommended,
      avgScore,
      byType,
    };
  }
}
