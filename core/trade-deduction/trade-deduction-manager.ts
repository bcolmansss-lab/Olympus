/**
 * TradeDeductionManager — retail/customer deduction claims management:
 * deduction intake, validity research, dispute vs write-off, and recovery
 * analytics.
 *
 * Events:
 *   - "deduction.logged": { deductionId, customerId, amountUsd, reasonCode }
 *   - "deduction.disputed": { deductionId, amountUsd }
 *   - "deduction.resolved": { deductionId, outcome, recoveredUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DeductionReason = "shortage" | "pricing" | "promotion" | "compliance" | "return" | "unknown";
export type DeductionStatus = "logged" | "researching" | "disputed" | "resolved";
export type DeductionOutcome = "valid_write_off" | "recovered" | "partial_recovery";

export interface TradeDeduction {
  id: string;
  customerId: string;
  invoiceRef: string;
  amountUsd: number;
  reasonCode: DeductionReason;
  status: DeductionStatus;
  outcome?: DeductionOutcome;
  recoveredUsd: number;
  loggedAt: string;
  resolvedAt?: string;
}

export interface TradeDeductionSummary {
  totalDeductions: number;
  open: number;
  resolved: number;
  totalDeductedUsd: number;
  totalRecoveredUsd: number;
  recoveryRatePct: number;
  byReason: Partial<Record<DeductionReason, number>>;
}

export class TradeDeductionManager {
  private deductions: Map<string, TradeDeduction> = new Map();

  constructor(private readonly bus: EventBus) {}

  log(input: { customerId: string; invoiceRef: string; amountUsd: number; reasonCode: DeductionReason; loggedAt: string }): TradeDeduction {
    const deduction: TradeDeduction = { ...input, id: randomUUID(), status: "logged", recoveredUsd: 0 };
    this.deductions.set(deduction.id, deduction);
    this.bus.publish("deduction.logged", { deductionId: deduction.id, customerId: deduction.customerId, amountUsd: deduction.amountUsd, reasonCode: deduction.reasonCode });
    return deduction;
  }

  research(deductionId: string): TradeDeduction | undefined {
    const d = this.deductions.get(deductionId);
    if (!d || d.status !== "logged") return undefined;
    d.status = "researching";
    return d;
  }

  dispute(deductionId: string): TradeDeduction | undefined {
    const d = this.deductions.get(deductionId);
    if (!d || d.status === "resolved") return undefined;
    d.status = "disputed";
    this.bus.publish("deduction.disputed", { deductionId, amountUsd: d.amountUsd });
    return d;
  }

  resolve(deductionId: string, outcome: DeductionOutcome, recoveredUsd: number, asOf: string): TradeDeduction | undefined {
    const d = this.deductions.get(deductionId);
    if (!d || d.status === "resolved") return undefined;
    d.status = "resolved";
    d.outcome = outcome;
    d.recoveredUsd = Math.min(recoveredUsd, d.amountUsd);
    d.resolvedAt = asOf;
    this.bus.publish("deduction.resolved", { deductionId, outcome, recoveredUsd: d.recoveredUsd });
    return d;
  }

  getDeduction(id: string): TradeDeduction | undefined { return this.deductions.get(id); }
  listDeductions(status?: DeductionStatus, reason?: DeductionReason): TradeDeduction[] {
    let all = Array.from(this.deductions.values());
    if (status) all = all.filter(d => d.status === status);
    if (reason) all = all.filter(d => d.reasonCode === reason);
    return all;
  }

  summary(): TradeDeductionSummary {
    const deductions = Array.from(this.deductions.values());
    const totalDeducted = deductions.reduce((s, d) => s + d.amountUsd, 0);
    const totalRecovered = deductions.reduce((s, d) => s + d.recoveredUsd, 0);
    const byReason: Partial<Record<DeductionReason, number>> = {};
    for (const d of deductions) { byReason[d.reasonCode] = (byReason[d.reasonCode] ?? 0) + 1; }
    return {
      totalDeductions: deductions.length,
      open: deductions.filter(d => d.status !== "resolved").length,
      resolved: deductions.filter(d => d.status === "resolved").length,
      totalDeductedUsd: Math.round(totalDeducted * 100) / 100,
      totalRecoveredUsd: Math.round(totalRecovered * 100) / 100,
      recoveryRatePct: totalDeducted > 0 ? Math.round((totalRecovered / totalDeducted) * 100) : 0,
      byReason,
    };
  }
}
