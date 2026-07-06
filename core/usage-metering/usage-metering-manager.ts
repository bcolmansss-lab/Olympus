/**
 * UsageMeteringManager — usage-based billing meters: per-account metered
 * dimensions with tiered unit pricing, usage ingestion, period invoice-line
 * computation, and period close/reset.
 *
 * Events:
 *   - "metering.usage_recorded": { accountId, meter, units }
 *   - "metering.period_closed": { accountId, period, chargeUsd }
 *   - "metering.high_usage": { accountId, meter, units, threshold }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export interface PriceTier {
  upToUnits: number; // Infinity for last tier
  unitPriceUsd: number;
}

export interface MeterDef {
  meter: string;
  tiers: PriceTier[];
  includedUnits: number;
  highUsageThreshold: number;
}

export interface AccountUsage {
  id: string;
  accountId: string;
  meter: string;
  period: string;
  units: number;
  alerted: boolean;
}

export interface InvoiceLine {
  meter: string;
  units: number;
  billableUnits: number;
  chargeUsd: number;
}

export interface MeteringSummary {
  totalMeters: number;
  totalAccounts: number;
  totalUnitsThisData: number;
  highUsageAlerts: number;
}

export class UsageMeteringManager {
  private meters: Map<string, MeterDef> = new Map();
  private usage: Map<string, AccountUsage> = new Map(); // key `${accountId}:${meter}:${period}`
  private alerts = 0;

  constructor(private readonly bus: EventBus) {}

  defineMeter(meter: string, tiers: PriceTier[], includedUnits = 0, highUsageThreshold = Infinity): MeterDef {
    const def: MeterDef = { meter, tiers: [...tiers].sort((a, b) => a.upToUnits - b.upToUnits), includedUnits, highUsageThreshold };
    this.meters.set(meter, def);
    return def;
  }

  private key(accountId: string, meter: string, period: string): string { return `${accountId}:${meter}:${period}`; }

  record(accountId: string, meter: string, period: string, units: number): AccountUsage | undefined {
    const def = this.meters.get(meter);
    if (!def || units <= 0) return undefined;
    const k = this.key(accountId, meter, period);
    let u = this.usage.get(k);
    if (!u) {
      u = { id: randomUUID(), accountId, meter, period, units: 0, alerted: false };
      this.usage.set(k, u);
    }
    u.units += units;
    this.bus.publish("metering.usage_recorded", { accountId, meter, units });
    if (!u.alerted && u.units >= def.highUsageThreshold) {
      u.alerted = true;
      this.alerts += 1;
      this.bus.publish("metering.high_usage", { accountId, meter, units: u.units, threshold: def.highUsageThreshold });
    }
    return u;
  }

  /** Compute the tiered charge for billable units (after included allowance). */
  private tieredCharge(def: MeterDef, billableUnits: number): number {
    let remaining = billableUnits;
    let prevCap = 0;
    let charge = 0;
    for (const tier of def.tiers) {
      if (remaining <= 0) break;
      const capacity = tier.upToUnits === Infinity ? remaining : Math.max(0, tier.upToUnits - prevCap);
      const inTier = Math.min(remaining, capacity);
      charge += inTier * tier.unitPriceUsd;
      remaining -= inTier;
      prevCap = tier.upToUnits;
    }
    return Math.round(charge * 100) / 100;
  }

  invoiceLines(accountId: string, period: string): InvoiceLine[] {
    const lines: InvoiceLine[] = [];
    for (const u of this.usage.values()) {
      if (u.accountId !== accountId || u.period !== period) continue;
      const def = this.meters.get(u.meter)!;
      const billableUnits = Math.max(0, u.units - def.includedUnits);
      lines.push({ meter: u.meter, units: u.units, billableUnits, chargeUsd: this.tieredCharge(def, billableUnits) });
    }
    return lines;
  }

  closePeriod(accountId: string, period: string): number {
    const lines = this.invoiceLines(accountId, period);
    const chargeUsd = Math.round(lines.reduce((s, l) => s + l.chargeUsd, 0) * 100) / 100;
    this.bus.publish("metering.period_closed", { accountId, period, chargeUsd });
    return chargeUsd;
  }

  usageFor(accountId: string, meter: string, period: string): number {
    return this.usage.get(this.key(accountId, meter, period))?.units ?? 0;
  }

  listMeters(): MeterDef[] { return Array.from(this.meters.values()); }

  summary(): MeteringSummary {
    const usages = Array.from(this.usage.values());
    return {
      totalMeters: this.meters.size,
      totalAccounts: new Set(usages.map(u => u.accountId)).size,
      totalUnitsThisData: usages.reduce((s, u) => s + u.units, 0),
      highUsageAlerts: this.alerts,
    };
  }
}
