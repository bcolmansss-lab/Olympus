/**
 * PettyCashManager — petty cash fund management: fund float, disbursements,
 * replenishment, and reconciliation against expected balance.
 *
 * Events:
 *   - "pettycash.fund_created": { fundId, custodianId, floatUsd }
 *   - "pettycash.disbursed": { fundId, amountUsd, category }
 *   - "pettycash.replenished": { fundId, amountUsd, newBalanceUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DisbursementCategory = "supplies" | "meals" | "travel" | "postage" | "misc";

export interface PettyCashFund {
  id: string;
  name: string;
  custodianId: string;
  floatUsd: number;
  balanceUsd: number;
  createdAt: string;
}

export interface Disbursement {
  id: string;
  fundId: string;
  amountUsd: number;
  category: DisbursementCategory;
  description: string;
  at: string;
}

export interface ReconciliationResult {
  fundId: string;
  expectedUsd: number;
  countedUsd: number;
  varianceUsd: number;
  balanced: boolean;
}

export interface PettyCashSummary {
  totalFunds: number;
  totalFloatUsd: number;
  totalBalanceUsd: number;
  totalDisbursedUsd: number;
  disbursementCount: number;
  byCategory: Partial<Record<DisbursementCategory, number>>;
}

export class PettyCashManager {
  private funds: Map<string, PettyCashFund> = new Map();
  private disbursements: Disbursement[] = [];

  constructor(private readonly bus: EventBus) {}

  createFund(name: string, custodianId: string, floatUsd: number): PettyCashFund {
    const fund: PettyCashFund = { id: randomUUID(), name, custodianId, floatUsd, balanceUsd: floatUsd, createdAt: new Date().toISOString() };
    this.funds.set(fund.id, fund);
    this.bus.publish("pettycash.fund_created", { fundId: fund.id, custodianId, floatUsd });
    return fund;
  }

  disburse(fundId: string, amountUsd: number, category: DisbursementCategory, description: string, at: string): Disbursement | undefined {
    const fund = this.funds.get(fundId);
    if (!fund || amountUsd <= 0 || amountUsd > fund.balanceUsd) return undefined;
    const disbursement: Disbursement = { id: randomUUID(), fundId, amountUsd, category, description, at };
    this.disbursements.push(disbursement);
    fund.balanceUsd = Math.round((fund.balanceUsd - amountUsd) * 100) / 100;
    this.bus.publish("pettycash.disbursed", { fundId, amountUsd, category });
    return disbursement;
  }

  replenish(fundId: string, amountUsd: number): PettyCashFund | undefined {
    const fund = this.funds.get(fundId);
    if (!fund || amountUsd <= 0) return undefined;
    fund.balanceUsd = Math.round((fund.balanceUsd + amountUsd) * 100) / 100;
    this.bus.publish("pettycash.replenished", { fundId, amountUsd, newBalanceUsd: fund.balanceUsd });
    return fund;
  }

  reconcile(fundId: string, countedUsd: number): ReconciliationResult | undefined {
    const fund = this.funds.get(fundId);
    if (!fund) return undefined;
    const variance = Math.round((countedUsd - fund.balanceUsd) * 100) / 100;
    return { fundId, expectedUsd: fund.balanceUsd, countedUsd, varianceUsd: variance, balanced: variance === 0 };
  }

  getFund(id: string): PettyCashFund | undefined { return this.funds.get(id); }
  listFunds(): PettyCashFund[] { return Array.from(this.funds.values()); }
  listDisbursements(fundId?: string): Disbursement[] {
    return fundId ? this.disbursements.filter(d => d.fundId === fundId) : [...this.disbursements];
  }

  summary(): PettyCashSummary {
    const funds = Array.from(this.funds.values());
    const byCategory: Partial<Record<DisbursementCategory, number>> = {};
    for (const d of this.disbursements) { byCategory[d.category] = (byCategory[d.category] ?? 0) + 1; }
    return {
      totalFunds: funds.length,
      totalFloatUsd: Math.round(funds.reduce((s, f) => s + f.floatUsd, 0) * 100) / 100,
      totalBalanceUsd: Math.round(funds.reduce((s, f) => s + f.balanceUsd, 0) * 100) / 100,
      totalDisbursedUsd: Math.round(this.disbursements.reduce((s, d) => s + d.amountUsd, 0) * 100) / 100,
      disbursementCount: this.disbursements.length,
      byCategory,
    };
  }
}
