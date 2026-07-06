/**
 * CreditLimitManager — customer trade-credit limits and exposure: per-customer
 * limits with risk-based sizing, order authorization against available credit,
 * outstanding balance tracking, and over-limit alerts.
 *
 * Events:
 *   - "creditlimit.assigned": { customerId, limitUsd, riskTier }
 *   - "creditlimit.order_declined": { customerId, orderUsd, availableUsd }
 *   - "creditlimit.over_limit": { customerId, exposureUsd, limitUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RiskTier = "prime" | "standard" | "subprime" | "watch";

export interface CreditLine {
  id: string;
  customerId: string;
  limitUsd: number;
  outstandingUsd: number;
  riskTier: RiskTier;
  onHold: boolean;
  updatedAt: string;
}

export interface CreditLimitSummary {
  totalCustomers: number;
  totalLimitUsd: number;
  totalOutstandingUsd: number;
  utilizationPct: number;
  overLimitCount: number;
  byRiskTier: Partial<Record<RiskTier, number>>;
}

export class CreditLimitManager {
  private lines: Map<string, CreditLine> = new Map(); // key: customerId

  constructor(private readonly bus: EventBus) {}

  assign(customerId: string, limitUsd: number, riskTier: RiskTier): CreditLine {
    const existing = this.lines.get(customerId);
    const line: CreditLine = {
      id: existing?.id ?? randomUUID(),
      customerId,
      limitUsd,
      outstandingUsd: existing?.outstandingUsd ?? 0,
      riskTier,
      onHold: existing?.onHold ?? false,
      updatedAt: new Date().toISOString(),
    };
    this.lines.set(customerId, line);
    this.bus.publish("creditlimit.assigned", { customerId, limitUsd, riskTier });
    return line;
  }

  available(customerId: string): number {
    const line = this.lines.get(customerId);
    return line ? Math.max(0, Math.round((line.limitUsd - line.outstandingUsd) * 100) / 100) : 0;
  }

  /** Authorize an order against available credit. Returns true if approved. */
  authorizeOrder(customerId: string, orderUsd: number): boolean {
    const line = this.lines.get(customerId);
    if (!line || line.onHold || orderUsd <= 0) return false;
    if (orderUsd > this.available(customerId)) {
      this.bus.publish("creditlimit.order_declined", { customerId, orderUsd, availableUsd: this.available(customerId) });
      return false;
    }
    line.outstandingUsd = Math.round((line.outstandingUsd + orderUsd) * 100) / 100;
    line.updatedAt = new Date().toISOString();
    return true;
  }

  recordPayment(customerId: string, amountUsd: number): CreditLine | undefined {
    const line = this.lines.get(customerId);
    if (!line || amountUsd <= 0) return undefined;
    line.outstandingUsd = Math.max(0, Math.round((line.outstandingUsd - amountUsd) * 100) / 100);
    line.updatedAt = new Date().toISOString();
    return line;
  }

  /** Adjust a limit downward; emit over_limit if exposure now exceeds it. */
  setLimit(customerId: string, limitUsd: number): CreditLine | undefined {
    const line = this.lines.get(customerId);
    if (!line) return undefined;
    line.limitUsd = limitUsd;
    line.updatedAt = new Date().toISOString();
    if (line.outstandingUsd > limitUsd) {
      this.bus.publish("creditlimit.over_limit", { customerId, exposureUsd: line.outstandingUsd, limitUsd });
    }
    return line;
  }

  setHold(customerId: string, onHold: boolean): CreditLine | undefined {
    const line = this.lines.get(customerId);
    if (!line) return undefined;
    line.onHold = onHold;
    return line;
  }

  getLine(customerId: string): CreditLine | undefined { return this.lines.get(customerId); }
  listLines(riskTier?: RiskTier): CreditLine[] {
    const all = Array.from(this.lines.values());
    return riskTier ? all.filter(l => l.riskTier === riskTier) : all;
  }

  summary(): CreditLimitSummary {
    const lines = Array.from(this.lines.values());
    const totalLimit = lines.reduce((s, l) => s + l.limitUsd, 0);
    const totalOutstanding = lines.reduce((s, l) => s + l.outstandingUsd, 0);
    const byRiskTier: Partial<Record<RiskTier, number>> = {};
    for (const l of lines) { byRiskTier[l.riskTier] = (byRiskTier[l.riskTier] ?? 0) + 1; }
    return {
      totalCustomers: lines.length,
      totalLimitUsd: Math.round(totalLimit * 100) / 100,
      totalOutstandingUsd: Math.round(totalOutstanding * 100) / 100,
      utilizationPct: totalLimit > 0 ? Math.round((totalOutstanding / totalLimit) * 100) : 0,
      overLimitCount: lines.filter(l => l.outstandingUsd > l.limitUsd).length,
      byRiskTier,
    };
  }
}
