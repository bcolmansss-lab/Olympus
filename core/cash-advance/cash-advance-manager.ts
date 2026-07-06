/**
 * CashAdvanceManager — employee cash/travel advances: request, approval,
 * disbursement, and reconciliation against actual expenses with repayment.
 *
 * Events:
 *   - "cashadvance.requested": { advanceId, employeeId, amountUsd }
 *   - "cashadvance.disbursed": { advanceId, amountUsd }
 *   - "cashadvance.reconciled": { advanceId, spentUsd, balanceUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type AdvanceStatus = "requested" | "approved" | "disbursed" | "reconciled" | "rejected";

export interface CashAdvance {
  id: string;
  employeeId: string;
  purpose: string;
  amountUsd: number;
  status: AdvanceStatus;
  spentUsd?: number;
  balanceUsd?: number; // positive = owed back to company, negative = reimburse employee
  requestedAt: string;
  disbursedAt?: string;
  reconciledAt?: string;
}

export interface CashAdvanceSummary {
  totalAdvances: number;
  outstanding: number;
  totalDisbursedUsd: number;
  totalOwedBackUsd: number;
  totalReimburseUsd: number;
}

export class CashAdvanceManager {
  private advances: Map<string, CashAdvance> = new Map();

  constructor(private readonly bus: EventBus) {}

  request(employeeId: string, purpose: string, amountUsd: number, requestedAt: string): CashAdvance | undefined {
    if (amountUsd <= 0) return undefined;
    const advance: CashAdvance = { id: randomUUID(), employeeId, purpose, amountUsd, status: "requested", requestedAt };
    this.advances.set(advance.id, advance);
    this.bus.publish("cashadvance.requested", { advanceId: advance.id, employeeId, amountUsd });
    return advance;
  }

  approve(advanceId: string): CashAdvance | undefined {
    const a = this.advances.get(advanceId);
    if (!a || a.status !== "requested") return undefined;
    a.status = "approved";
    return a;
  }

  reject(advanceId: string): CashAdvance | undefined {
    const a = this.advances.get(advanceId);
    if (!a || a.status !== "requested") return undefined;
    a.status = "rejected";
    return a;
  }

  disburse(advanceId: string, asOf: string): CashAdvance | undefined {
    const a = this.advances.get(advanceId);
    if (!a || a.status !== "approved") return undefined;
    a.status = "disbursed";
    a.disbursedAt = asOf;
    this.bus.publish("cashadvance.disbursed", { advanceId, amountUsd: a.amountUsd });
    return a;
  }

  reconcile(advanceId: string, spentUsd: number, asOf: string): CashAdvance | undefined {
    const a = this.advances.get(advanceId);
    if (!a || a.status !== "disbursed") return undefined;
    a.status = "reconciled";
    a.spentUsd = spentUsd;
    a.balanceUsd = Math.round((a.amountUsd - spentUsd) * 100) / 100; // >0 owed back, <0 reimburse
    a.reconciledAt = asOf;
    this.bus.publish("cashadvance.reconciled", { advanceId, spentUsd, balanceUsd: a.balanceUsd });
    return a;
  }

  getAdvance(id: string): CashAdvance | undefined { return this.advances.get(id); }
  listAdvances(employeeId?: string, status?: AdvanceStatus): CashAdvance[] {
    let all = Array.from(this.advances.values());
    if (employeeId) all = all.filter(a => a.employeeId === employeeId);
    if (status) all = all.filter(a => a.status === status);
    return all;
  }

  summary(): CashAdvanceSummary {
    const advances = Array.from(this.advances.values());
    const reconciled = advances.filter(a => a.status === "reconciled");
    return {
      totalAdvances: advances.length,
      outstanding: advances.filter(a => a.status === "disbursed").length,
      totalDisbursedUsd: Math.round(advances.filter(a => a.status === "disbursed" || a.status === "reconciled").reduce((s, a) => s + a.amountUsd, 0) * 100) / 100,
      totalOwedBackUsd: Math.round(reconciled.filter(a => (a.balanceUsd ?? 0) > 0).reduce((s, a) => s + (a.balanceUsd ?? 0), 0) * 100) / 100,
      totalReimburseUsd: Math.round(reconciled.filter(a => (a.balanceUsd ?? 0) < 0).reduce((s, a) => s + Math.abs(a.balanceUsd ?? 0), 0) * 100) / 100,
    };
  }
}
