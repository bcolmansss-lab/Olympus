/**
 * CarbonCreditManager — carbon offset portfolio: credit purchases by project
 * type, retirement against measured emissions, and net-footprint analytics.
 *
 * Events:
 *   - "carboncredit.purchased": { lotId, projectType, tonnes, costUsd }
 *   - "carboncredit.retired": { retirementId, tonnes, reason }
 *   - "carboncredit.emissions_recorded": { recordId, scope, tonnes }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ProjectType = "reforestation" | "renewable_energy" | "methane_capture" | "direct_air_capture" | "soil_carbon";
export type EmissionScope = "scope_1" | "scope_2" | "scope_3";

export interface CreditLot {
  id: string;
  projectType: ProjectType;
  vintage: string; // year
  tonnes: number;
  retiredTonnes: number;
  costPerTonneUsd: number;
  purchasedAt: string;
}

export interface EmissionRecord {
  id: string;
  scope: EmissionScope;
  period: string;
  tonnes: number;
  recordedAt: string;
}

export interface CarbonSummary {
  totalCreditsTonnes: number;
  retiredTonnes: number;
  availableTonnes: number;
  totalEmissionsTonnes: number;
  netFootprintTonnes: number;
  totalSpendUsd: number;
  byProjectType: Partial<Record<ProjectType, number>>;
}

export class CarbonCreditManager {
  private lots: Map<string, CreditLot> = new Map();
  private emissions: EmissionRecord[] = [];

  constructor(private readonly bus: EventBus) {}

  purchase(input: { projectType: ProjectType; vintage: string; tonnes: number; costPerTonneUsd: number; purchasedAt: string }): CreditLot {
    const lot: CreditLot = { ...input, id: randomUUID(), retiredTonnes: 0 };
    this.lots.set(lot.id, lot);
    this.bus.publish("carboncredit.purchased", { lotId: lot.id, projectType: lot.projectType, tonnes: lot.tonnes, costUsd: Math.round(lot.tonnes * lot.costPerTonneUsd * 100) / 100 });
    return lot;
  }

  retire(lotId: string, tonnes: number, reason: string): string | undefined {
    const lot = this.lots.get(lotId);
    if (!lot || tonnes <= 0 || tonnes > lot.tonnes - lot.retiredTonnes) return undefined;
    lot.retiredTonnes = Math.round((lot.retiredTonnes + tonnes) * 100) / 100;
    const retirementId = randomUUID();
    this.bus.publish("carboncredit.retired", { retirementId, tonnes, reason });
    return retirementId;
  }

  recordEmissions(scope: EmissionScope, period: string, tonnes: number, recordedAt: string): EmissionRecord {
    const record: EmissionRecord = { id: randomUUID(), scope, period, tonnes, recordedAt };
    this.emissions.push(record);
    this.bus.publish("carboncredit.emissions_recorded", { recordId: record.id, scope, tonnes });
    return record;
  }

  availableTonnes(): number {
    return Math.round(Array.from(this.lots.values()).reduce((s, l) => s + (l.tonnes - l.retiredTonnes), 0) * 100) / 100;
  }

  getLot(id: string): CreditLot | undefined { return this.lots.get(id); }
  listLots(projectType?: ProjectType): CreditLot[] {
    const all = Array.from(this.lots.values());
    return projectType ? all.filter(l => l.projectType === projectType) : all;
  }
  listEmissions(scope?: EmissionScope): EmissionRecord[] {
    return scope ? this.emissions.filter(e => e.scope === scope) : [...this.emissions];
  }

  summary(): CarbonSummary {
    const lots = Array.from(this.lots.values());
    const totalCredits = lots.reduce((s, l) => s + l.tonnes, 0);
    const retired = lots.reduce((s, l) => s + l.retiredTonnes, 0);
    const totalEmissions = this.emissions.reduce((s, e) => s + e.tonnes, 0);
    const byProjectType: Partial<Record<ProjectType, number>> = {};
    for (const l of lots) { byProjectType[l.projectType] = (byProjectType[l.projectType] ?? 0) + l.tonnes; }
    return {
      totalCreditsTonnes: Math.round(totalCredits * 100) / 100,
      retiredTonnes: Math.round(retired * 100) / 100,
      availableTonnes: Math.round((totalCredits - retired) * 100) / 100,
      totalEmissionsTonnes: Math.round(totalEmissions * 100) / 100,
      netFootprintTonnes: Math.round((totalEmissions - retired) * 100) / 100,
      totalSpendUsd: Math.round(lots.reduce((s, l) => s + l.tonnes * l.costPerTonneUsd, 0) * 100) / 100,
      byProjectType,
    };
  }
}
