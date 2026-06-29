/**
 * WasteStreamManager — facility waste/recycling tracking: collection records
 * by stream, diversion-from-landfill rate, hauler cost, and reduction goals.
 *
 * Events:
 *   - "waste.collection_recorded": { recordId, stream, weightKg, diverted }
 *   - "waste.diversion_milestone": { period, diversionPct }
 *   - "waste.hazardous_flagged": { recordId, weightKg }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type WasteStream = "landfill" | "recycling" | "compost" | "ewaste" | "hazardous" | "donation";

const DIVERTED_STREAMS: WasteStream[] = ["recycling", "compost", "ewaste", "donation"];

export interface WasteRecord {
  id: string;
  stream: WasteStream;
  weightKg: number;
  period: string;
  location: string;
  haulerCostUsd: number;
  diverted: boolean;
  recordedAt: string;
}

export interface WasteSummary {
  totalRecords: number;
  totalWeightKg: number;
  divertedKg: number;
  landfillKg: number;
  diversionRatePct: number;
  totalHaulerCostUsd: number;
  byStream: Partial<Record<WasteStream, number>>;
}

export class WasteStreamManager {
  private records: WasteRecord[] = [];
  private diversionGoalPct: number;
  private milestoneFired = new Set<string>();

  constructor(private readonly bus: EventBus, diversionGoalPct = 75) {
    this.diversionGoalPct = diversionGoalPct;
  }

  record(input: { stream: WasteStream; weightKg: number; period: string; location: string; haulerCostUsd: number; recordedAt: string }): WasteRecord {
    const diverted = DIVERTED_STREAMS.includes(input.stream);
    const rec: WasteRecord = { ...input, id: randomUUID(), diverted };
    this.records.push(rec);
    this.bus.publish("waste.collection_recorded", { recordId: rec.id, stream: rec.stream, weightKg: rec.weightKg, diverted });
    if (rec.stream === "hazardous") {
      this.bus.publish("waste.hazardous_flagged", { recordId: rec.id, weightKg: rec.weightKg });
    }
    const pct = this.diversionRate(input.period);
    if (pct >= this.diversionGoalPct && !this.milestoneFired.has(input.period)) {
      this.milestoneFired.add(input.period);
      this.bus.publish("waste.diversion_milestone", { period: input.period, diversionPct: pct });
    }
    return rec;
  }

  diversionRate(period?: string): number {
    const recs = period ? this.records.filter(r => r.period === period) : this.records;
    const total = recs.reduce((s, r) => s + r.weightKg, 0);
    if (total === 0) return 0;
    const diverted = recs.filter(r => r.diverted).reduce((s, r) => s + r.weightKg, 0);
    return Math.round((diverted / total) * 100);
  }

  listRecords(stream?: WasteStream, period?: string): WasteRecord[] {
    let all = [...this.records];
    if (stream) all = all.filter(r => r.stream === stream);
    if (period) all = all.filter(r => r.period === period);
    return all;
  }

  summary(): WasteSummary {
    const total = this.records.reduce((s, r) => s + r.weightKg, 0);
    const diverted = this.records.filter(r => r.diverted).reduce((s, r) => s + r.weightKg, 0);
    const byStream: Partial<Record<WasteStream, number>> = {};
    for (const r of this.records) { byStream[r.stream] = Math.round(((byStream[r.stream] ?? 0) + r.weightKg) * 100) / 100; }
    return {
      totalRecords: this.records.length,
      totalWeightKg: Math.round(total * 100) / 100,
      divertedKg: Math.round(diverted * 100) / 100,
      landfillKg: Math.round((total - diverted) * 100) / 100,
      diversionRatePct: total > 0 ? Math.round((diverted / total) * 100) : 0,
      totalHaulerCostUsd: Math.round(this.records.reduce((s, r) => s + r.haulerCostUsd, 0) * 100) / 100,
      byStream,
    };
  }
}
