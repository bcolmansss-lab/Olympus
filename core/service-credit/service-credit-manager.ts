/**
 * ServiceCreditManager — SLA credit issuance: uptime-breach-driven credit
 * calculation against tiered SLA schedules, approval, and application to
 * customer accounts.
 *
 * Events:
 *   - "servicecredit.calculated": { creditId, customerId, uptimePct, creditPct }
 *   - "servicecredit.approved": { creditId, amountUsd }
 *   - "servicecredit.applied": { creditId, customerId, amountUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CreditStatus = "calculated" | "approved" | "applied" | "rejected";

export interface SLATier {
  minUptimePct: number; // if actual >= this, creditPct applies (lowest matching)
  creditPct: number;
}

export interface ServiceCredit {
  id: string;
  customerId: string;
  period: string;
  uptimePct: number;
  monthlyFeeUsd: number;
  creditPct: number;
  amountUsd: number;
  status: CreditStatus;
  calculatedAt: string;
  appliedAt?: string;
}

export interface ServiceCreditSummary {
  totalCredits: number;
  approved: number;
  applied: number;
  totalCreditUsd: number;
  avgUptimePct: number;
}

/** Default schedule: lower uptime → higher credit. */
const DEFAULT_SCHEDULE: SLATier[] = [
  { minUptimePct: 99.9, creditPct: 0 },
  { minUptimePct: 99.0, creditPct: 10 },
  { minUptimePct: 95.0, creditPct: 25 },
  { minUptimePct: 0, creditPct: 50 },
];

export class ServiceCreditManager {
  private credits: Map<string, ServiceCredit> = new Map();
  private schedule: SLATier[];

  constructor(private readonly bus: EventBus, schedule: SLATier[] = DEFAULT_SCHEDULE) {
    this.schedule = [...schedule].sort((a, b) => b.minUptimePct - a.minUptimePct);
  }

  private creditPctFor(uptimePct: number): number {
    for (const tier of this.schedule) {
      if (uptimePct >= tier.minUptimePct) return tier.creditPct;
    }
    return this.schedule[this.schedule.length - 1]?.creditPct ?? 0;
  }

  calculate(customerId: string, period: string, uptimePct: number, monthlyFeeUsd: number): ServiceCredit {
    const creditPct = this.creditPctFor(uptimePct);
    const amountUsd = Math.round(monthlyFeeUsd * (creditPct / 100) * 100) / 100;
    const credit: ServiceCredit = { id: randomUUID(), customerId, period, uptimePct, monthlyFeeUsd, creditPct, amountUsd, status: "calculated", calculatedAt: new Date().toISOString() };
    this.credits.set(credit.id, credit);
    this.bus.publish("servicecredit.calculated", { creditId: credit.id, customerId, uptimePct, creditPct });
    return credit;
  }

  approve(creditId: string): ServiceCredit | undefined {
    const c = this.credits.get(creditId);
    if (!c || c.status !== "calculated") return undefined;
    c.status = "approved";
    this.bus.publish("servicecredit.approved", { creditId, amountUsd: c.amountUsd });
    return c;
  }

  reject(creditId: string): ServiceCredit | undefined {
    const c = this.credits.get(creditId);
    if (!c || c.status !== "calculated") return undefined;
    c.status = "rejected";
    return c;
  }

  apply(creditId: string, asOf: string): ServiceCredit | undefined {
    const c = this.credits.get(creditId);
    if (!c || c.status !== "approved") return undefined;
    c.status = "applied";
    c.appliedAt = asOf;
    this.bus.publish("servicecredit.applied", { creditId, customerId: c.customerId, amountUsd: c.amountUsd });
    return c;
  }

  getCredit(id: string): ServiceCredit | undefined { return this.credits.get(id); }
  listCredits(customerId?: string, status?: CreditStatus): ServiceCredit[] {
    let all = Array.from(this.credits.values());
    if (customerId) all = all.filter(c => c.customerId === customerId);
    if (status) all = all.filter(c => c.status === status);
    return all;
  }

  summary(): ServiceCreditSummary {
    const credits = Array.from(this.credits.values());
    const applied = credits.filter(c => c.status === "applied");
    const avgUptime = credits.length > 0 ? Math.round((credits.reduce((s, c) => s + c.uptimePct, 0) / credits.length) * 100) / 100 : 0;
    return {
      totalCredits: credits.length,
      approved: credits.filter(c => c.status === "approved").length,
      applied: applied.length,
      totalCreditUsd: Math.round(applied.reduce((s, c) => s + c.amountUsd, 0) * 100) / 100,
      avgUptimePct: avgUptime,
    };
  }
}
