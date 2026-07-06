/**
 * EnergyUsageManager — utility meter registry, consumption readings, cost and
 * carbon estimation, and anomaly detection against baseline.
 *
 * Events:
 *   - "energy.meter_registered": { meterId, utility, unit }
 *   - "energy.reading_recorded": { meterId, consumption, costUsd, co2Kg }
 *   - "energy.spike_detected": { meterId, consumption, baseline }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type UtilityType = "electricity" | "gas" | "water" | "steam" | "fuel";

export interface UtilityMeter {
  id: string;
  name: string;
  utility: UtilityType;
  unit: string; // kWh, therms, gallons, etc.
  location: string;
  costPerUnitUsd: number;
  co2KgPerUnit: number;
  createdAt: string;
}

export interface MeterReading {
  id: string;
  meterId: string;
  period: string;
  consumption: number;
  costUsd: number;
  co2Kg: number;
  recordedAt: string;
}

export interface EnergySummary {
  totalMeters: number;
  totalReadings: number;
  totalConsumption: number;
  totalCostUsd: number;
  totalCo2Kg: number;
  byUtility: Partial<Record<UtilityType, number>>;
}

export class EnergyUsageManager {
  private meters: Map<string, UtilityMeter> = new Map();
  private readings: MeterReading[] = [];
  private spikeFactor: number;

  constructor(private readonly bus: EventBus, spikeFactor = 1.5) {
    this.spikeFactor = spikeFactor;
  }

  registerMeter(input: { name: string; utility: UtilityType; unit: string; location: string; costPerUnitUsd: number; co2KgPerUnit: number }): UtilityMeter {
    const meter: UtilityMeter = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.meters.set(meter.id, meter);
    this.bus.publish("energy.meter_registered", { meterId: meter.id, utility: meter.utility, unit: meter.unit });
    return meter;
  }

  private baseline(meterId: string): number | undefined {
    const readings = this.readings.filter(r => r.meterId === meterId);
    if (readings.length === 0) return undefined;
    return readings.reduce((s, r) => s + r.consumption, 0) / readings.length;
  }

  recordReading(meterId: string, period: string, consumption: number, recordedAt: string): MeterReading | undefined {
    const meter = this.meters.get(meterId);
    if (!meter || consumption < 0) return undefined;
    const baseline = this.baseline(meterId);
    const costUsd = Math.round(consumption * meter.costPerUnitUsd * 100) / 100;
    const co2Kg = Math.round(consumption * meter.co2KgPerUnit * 100) / 100;
    const reading: MeterReading = { id: randomUUID(), meterId, period, consumption, costUsd, co2Kg, recordedAt };
    if (baseline !== undefined && consumption > baseline * this.spikeFactor) {
      this.bus.publish("energy.spike_detected", { meterId, consumption, baseline: Math.round(baseline * 100) / 100 });
    }
    this.readings.push(reading);
    this.bus.publish("energy.reading_recorded", { meterId, consumption, costUsd, co2Kg });
    return reading;
  }

  getMeter(id: string): UtilityMeter | undefined { return this.meters.get(id); }
  listMeters(utility?: UtilityType): UtilityMeter[] {
    const all = Array.from(this.meters.values());
    return utility ? all.filter(m => m.utility === utility) : all;
  }
  listReadings(meterId?: string): MeterReading[] {
    return meterId ? this.readings.filter(r => r.meterId === meterId) : [...this.readings];
  }

  summary(): EnergySummary {
    const meters = Array.from(this.meters.values());
    const byUtility: Partial<Record<UtilityType, number>> = {};
    for (const m of meters) { byUtility[m.utility] = (byUtility[m.utility] ?? 0) + 1; }
    return {
      totalMeters: meters.length,
      totalReadings: this.readings.length,
      totalConsumption: Math.round(this.readings.reduce((s, r) => s + r.consumption, 0) * 100) / 100,
      totalCostUsd: Math.round(this.readings.reduce((s, r) => s + r.costUsd, 0) * 100) / 100,
      totalCo2Kg: Math.round(this.readings.reduce((s, r) => s + r.co2Kg, 0) * 100) / 100,
      byUtility,
    };
  }
}
