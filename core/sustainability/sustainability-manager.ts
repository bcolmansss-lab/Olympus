/**
 * SustainabilityManager — carbon-emission accounting: emission-factor
 * registry per activity, scoped emission recording (scope 1/2/3), annual
 * reduction targets against a baseline, and progress reporting.
 *
 * Events:
 *   - "sustainability.emission_recorded": { activity, scope, co2eKg }
 *   - "sustainability.target_met": { year, targetKg, actualKg }
 */
import type { EventBus } from "../events/event-bus.js";

export type EmissionScope = 1 | 2 | 3;

export interface EmissionRecord {
  activity: string;
  scope: EmissionScope;
  quantity: number;
  co2eKg: number;
  year: number;
}

export interface ReductionTarget {
  year: number;
  targetKg: number;
}

export interface SustainabilitySummary {
  totalCo2eKg: number;
  byScope: Record<EmissionScope, number>;
  recordCount: number;
  targetsMet: number;
}

export class SustainabilityManager {
  private factors: Map<string, { scope: EmissionScope; kgPerUnit: number }> = new Map();
  private records: EmissionRecord[] = [];
  private targets: Map<number, ReductionTarget> = new Map();
  private metYears: Set<number> = new Set();

  constructor(private readonly bus: EventBus) {}

  /** Register an emission factor: kg CO2e per unit of activity. */
  setFactor(activity: string, scope: EmissionScope, kgPerUnit: number): void {
    this.factors.set(activity, { scope, kgPerUnit });
  }

  record(activity: string, quantity: number, year: number): EmissionRecord | undefined {
    const factor = this.factors.get(activity);
    if (!factor || quantity < 0) return undefined;
    const rec: EmissionRecord = {
      activity,
      scope: factor.scope,
      quantity,
      co2eKg: Math.round(quantity * factor.kgPerUnit * 100) / 100,
      year,
    };
    this.records.push(rec);
    this.bus.publish("sustainability.emission_recorded", { activity, scope: rec.scope, co2eKg: rec.co2eKg });
    return rec;
  }

  setTarget(year: number, targetKg: number): void {
    this.targets.set(year, { year, targetKg });
  }

  emissionsForYear(year: number): number {
    return Math.round(this.records.filter(r => r.year === year).reduce((s, r) => s + r.co2eKg, 0) * 100) / 100;
  }

  /** Evaluate a year against its target; publishes when the target is met. */
  evaluateTarget(year: number): { met: boolean; targetKg: number; actualKg: number } | undefined {
    const target = this.targets.get(year);
    if (!target) return undefined;
    const actualKg = this.emissionsForYear(year);
    const met = actualKg <= target.targetKg;
    if (met && !this.metYears.has(year)) {
      this.metYears.add(year);
      this.bus.publish("sustainability.target_met", { year, targetKg: target.targetKg, actualKg });
    }
    return { met, targetKg: target.targetKg, actualKg };
  }

  listRecords(scope?: EmissionScope, year?: number): EmissionRecord[] {
    let all = [...this.records];
    if (scope !== undefined) all = all.filter(r => r.scope === scope);
    if (year !== undefined) all = all.filter(r => r.year === year);
    return all;
  }

  summary(): SustainabilitySummary {
    const byScope: Record<EmissionScope, number> = { 1: 0, 2: 0, 3: 0 };
    let total = 0;
    for (const r of this.records) {
      byScope[r.scope] = Math.round((byScope[r.scope] + r.co2eKg) * 100) / 100;
      total += r.co2eKg;
    }
    return {
      totalCo2eKg: Math.round(total * 100) / 100,
      byScope,
      recordCount: this.records.length,
      targetsMet: this.metYears.size,
    };
  }
}
