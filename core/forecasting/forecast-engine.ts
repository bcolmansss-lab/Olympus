/**
 * ForecastEngine — financial projection with scenario modeling.
 *
 * Supports:
 *   - Revenue forecasting (ARR growth, pipeline-weighted, seasonal)
 *   - Expense forecasting (fixed + variable + headcount-driven)
 *   - Cash flow projection (monthly, rolling N months)
 *   - Scenario modeling: base / optimistic / pessimistic
 *   - Sensitivity analysis: which drivers move the needle most
 *
 * Events:
 *   - "forecast.generated": { forecastId, scenario, months, projectedArrUsd, projectedCashEndUsd }
 *   - "forecast.scenario_diverged": { forecastId, driver, baseValue, scenarioValue, deltaPercent }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ForecastScenario = "base" | "optimistic" | "pessimistic";
export type ForecastDriver = "arr_growth_rate" | "churn_rate" | "avg_deal_size" | "sales_cycle_months" | "headcount_growth" | "opex_growth_rate" | "gross_margin";

export interface ForecastAssumptions {
  /** Starting ARR in USD */
  startingArrUsd: number;
  /** Starting cash balance */
  startingCashUsd: number;
  /** Monthly ARR growth rate (e.g. 0.05 = 5%) */
  arrGrowthRate: number;
  /** Monthly gross churn rate (e.g. 0.01 = 1%) */
  churnRate: number;
  /** Average new deal size USD */
  avgDealSizeUsd: number;
  /** Expected new deals per month */
  newDealsPerMonth: number;
  /** Current monthly opex (non-payroll) */
  monthlyOpexUsd: number;
  /** Monthly opex growth rate */
  opexGrowthRate: number;
  /** Current monthly payroll */
  monthlyPayrollUsd: number;
  /** Monthly headcount growth rate */
  headcountGrowthRate: number;
  /** Gross margin (0–1, e.g. 0.72) */
  grossMargin: number;
}

export interface MonthlyProjection {
  month: number; // 1-based
  date: string;  // ISO first day of month YYYY-MM-01
  arrUsd: number;
  newArrUsd: number;
  churnedArrUsd: number;
  revenueUsd: number; // monthly revenue = ARR/12
  cogsUsd: number;    // revenue * (1 - grossMargin)
  grossProfitUsd: number;
  payrollUsd: number;
  opexUsd: number;
  totalExpensesUsd: number;
  ebitdaUsd: number;  // grossProfit - payroll - opex
  cashFlowUsd: number; // ebitda (simplified)
  cumulativeCashUsd: number;
  runwayMonths: number | null; // months until cash < 0; null if cash positive at end
}

export interface ForecastResult {
  id: string;
  scenario: ForecastScenario;
  assumptions: ForecastAssumptions;
  months: number;
  generatedAt: string;
  projections: MonthlyProjection[];
  /** ARR at end of forecast period */
  projectedArrUsd: number;
  /** Cash at end of forecast period */
  projectedCashEndUsd: number;
  /** Month when cash goes negative (1-based), or null */
  cashOutMonth: number | null;
  /** Estimated runway in months from start */
  runwayMonths: number | null;
}

export interface ScenarioComparison {
  base: ForecastResult;
  optimistic: ForecastResult;
  pessimistic: ForecastResult;
  /** Key divergence drivers */
  divergences: Array<{ driver: ForecastDriver; baseValue: number; optimisticValue: number; pessimisticValue: number }>;
}

export interface SensitivityResult {
  driver: ForecastDriver;
  /** +10% change in driver → % change in projected ARR */
  arrImpactPct: number;
  /** +10% change in driver → % change in runway */
  runwayImpactPct: number;
}

export class ForecastEngine {
  private readonly bus: EventBus;
  private readonly forecasts: Map<string, ForecastResult>;

  constructor(bus: EventBus) {
    this.bus = bus;
    this.forecasts = new Map();
  }

  generate(
    assumptions: ForecastAssumptions,
    months: number = 18,
    scenario: ForecastScenario = "base",
    id: string = randomUUID()
  ): ForecastResult {
    const projections: MonthlyProjection[] = [];
    const startDate = new Date();

    let prevArr = assumptions.startingArrUsd;
    let prevCash = assumptions.startingCashUsd;
    let prevPayroll = assumptions.monthlyPayrollUsd;
    let prevOpex = assumptions.monthlyOpexUsd;

    for (let m = 1; m <= months; m++) {
      const projDate = new Date(startDate.getFullYear(), startDate.getMonth() + m - 1, 1);
      const dateStr = projDate.toISOString().slice(0, 7) + "-01";

      const newArrUsd = assumptions.newDealsPerMonth * assumptions.avgDealSizeUsd;
      const churnedArrUsd = prevArr * assumptions.churnRate;
      const arrUsd = prevArr * (1 + assumptions.arrGrowthRate - assumptions.churnRate) + assumptions.newDealsPerMonth * assumptions.avgDealSizeUsd;

      const revenueUsd = arrUsd / 12;
      const cogsUsd = revenueUsd * (1 - assumptions.grossMargin);
      const grossProfitUsd = revenueUsd * assumptions.grossMargin;

      const payrollUsd = prevPayroll * (1 + assumptions.headcountGrowthRate);
      const opexUsd = prevOpex * (1 + assumptions.opexGrowthRate);

      const totalExpensesUsd = payrollUsd + opexUsd + cogsUsd;
      const ebitdaUsd = grossProfitUsd - payrollUsd - opexUsd;
      const cashFlowUsd = ebitdaUsd;
      const cumulativeCashUsd = prevCash + cashFlowUsd;

      projections.push({
        month: m,
        date: dateStr,
        arrUsd,
        newArrUsd,
        churnedArrUsd,
        revenueUsd,
        cogsUsd,
        grossProfitUsd,
        payrollUsd,
        opexUsd,
        totalExpensesUsd,
        ebitdaUsd,
        cashFlowUsd,
        cumulativeCashUsd,
        runwayMonths: null,
      });

      prevArr = arrUsd;
      prevCash = cumulativeCashUsd;
      prevPayroll = payrollUsd;
      prevOpex = opexUsd;
    }

    const cashOutMonth = this.runwayFromProjections(projections);
    const runwayMonths = cashOutMonth;

    const lastProjection = projections[projections.length - 1];
    const projectedArrUsd = lastProjection?.arrUsd ?? assumptions.startingArrUsd;
    const projectedCashEndUsd = lastProjection?.cumulativeCashUsd ?? assumptions.startingCashUsd;

    const result: ForecastResult = {
      id,
      scenario,
      assumptions,
      months,
      generatedAt: new Date().toISOString(),
      projections,
      projectedArrUsd,
      projectedCashEndUsd,
      cashOutMonth,
      runwayMonths,
    };

    this.forecasts.set(id, result);

    this.bus.publish("forecast.generated", {
      forecastId: id,
      scenario,
      months,
      projectedArrUsd,
      projectedCashEndUsd,
    });

    return result;
  }

  runwayFromProjections(projections: MonthlyProjection[]): number | null {
    for (const p of projections) {
      if (p.cumulativeCashUsd < 0) {
        return p.month;
      }
    }
    return null;
  }

  compareScenarios(baseAssumptions: ForecastAssumptions, months: number = 18): ScenarioComparison {
    const base = this.generate(baseAssumptions, months, "base");

    const optimisticAssumptions: ForecastAssumptions = {
      ...baseAssumptions,
      arrGrowthRate: baseAssumptions.arrGrowthRate * 1.5,
      avgDealSizeUsd: baseAssumptions.avgDealSizeUsd * 1.2,
      churnRate: baseAssumptions.churnRate * 0.7,
      newDealsPerMonth: baseAssumptions.newDealsPerMonth * 1.3,
    };

    const pessimisticAssumptions: ForecastAssumptions = {
      ...baseAssumptions,
      arrGrowthRate: baseAssumptions.arrGrowthRate * 0.5,
      avgDealSizeUsd: baseAssumptions.avgDealSizeUsd * 0.8,
      churnRate: baseAssumptions.churnRate * 1.5,
      newDealsPerMonth: baseAssumptions.newDealsPerMonth * 0.7,
    };

    const optimistic = this.generate(optimisticAssumptions, months, "optimistic");
    const pessimistic = this.generate(pessimisticAssumptions, months, "pessimistic");

    const drivers: Array<{ driver: ForecastDriver; baseValue: number; optimisticValue: number; pessimisticValue: number }> = [
      { driver: "arr_growth_rate", baseValue: baseAssumptions.arrGrowthRate, optimisticValue: optimisticAssumptions.arrGrowthRate, pessimisticValue: pessimisticAssumptions.arrGrowthRate },
      { driver: "avg_deal_size", baseValue: baseAssumptions.avgDealSizeUsd, optimisticValue: optimisticAssumptions.avgDealSizeUsd, pessimisticValue: pessimisticAssumptions.avgDealSizeUsd },
      { driver: "churn_rate", baseValue: baseAssumptions.churnRate, optimisticValue: optimisticAssumptions.churnRate, pessimisticValue: pessimisticAssumptions.churnRate },
    ];

    const divergences: Array<{ driver: ForecastDriver; baseValue: number; optimisticValue: number; pessimisticValue: number }> = [];

    for (const d of drivers) {
      const deltaPercent = Math.abs(d.optimisticValue - d.pessimisticValue) / Math.abs(d.baseValue + 0.0001) * 100;
      if (deltaPercent > 20) {
        divergences.push(d);
        this.bus.publish("forecast.scenario_diverged", {
          forecastId: base.id,
          driver: d.driver,
          baseValue: d.baseValue,
          scenarioValue: d.optimisticValue,
          deltaPercent,
        });
      }
    }

    return { base, optimistic, pessimistic, divergences };
  }

  sensitivityAnalysis(assumptions: ForecastAssumptions, months: number = 18): SensitivityResult[] {
    const base = this.generate(assumptions, months, "base");
    const baseArr = base.projectedArrUsd;
    const baseRunway = base.runwayMonths;

    const driverPerturbations: Record<ForecastDriver, ForecastAssumptions> = {
      arr_growth_rate: { ...assumptions, arrGrowthRate: assumptions.arrGrowthRate * 1.1 },
      churn_rate: { ...assumptions, churnRate: assumptions.churnRate * 1.1 },
      avg_deal_size: { ...assumptions, avgDealSizeUsd: assumptions.avgDealSizeUsd * 1.1 },
      sales_cycle_months: { ...assumptions, newDealsPerMonth: assumptions.newDealsPerMonth / 1.1 },
      headcount_growth: { ...assumptions, headcountGrowthRate: assumptions.headcountGrowthRate * 1.1 },
      opex_growth_rate: { ...assumptions, opexGrowthRate: assumptions.opexGrowthRate * 1.1 },
      gross_margin: { ...assumptions, grossMargin: assumptions.grossMargin * 1.1 },
    };

    const results: SensitivityResult[] = [];

    for (const [driver, perturbedAssumptions] of Object.entries(driverPerturbations) as Array<[ForecastDriver, ForecastAssumptions]>) {
      const perturbed = this.generate(perturbedAssumptions, months, "base");
      const perturbedArr = perturbed.projectedArrUsd;
      const perturbedRunway = perturbed.runwayMonths;

      const arrImpactPct = (perturbedArr - baseArr) / (baseArr + 0.0001) * 100;
      let runwayImpactPct = 0;
      if (baseRunway !== null && perturbedRunway !== null) {
        runwayImpactPct = (perturbedRunway - baseRunway) / (baseRunway + 0.0001) * 100;
      }

      results.push({ driver, arrImpactPct, runwayImpactPct });
    }

    results.sort((a, b) => Math.abs(b.arrImpactPct) - Math.abs(a.arrImpactPct));

    return results;
  }

  get(id: string): ForecastResult | undefined {
    return this.forecasts.get(id);
  }

  list(): ForecastResult[] {
    return Array.from(this.forecasts.values());
  }
}
