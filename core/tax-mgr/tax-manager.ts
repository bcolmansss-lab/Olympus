/**
 * TaxManager — tax obligation tracking, filing calendar, payment records,
 * jurisdiction management, and tax liability analytics.
 *
 * Events:
 *   - "tax.filing_due": { obligationId, taxType, jurisdiction, dueDate, estimatedUsd }
 *   - "tax.payment_recorded": { obligationId, amountUsd, paidAt }
 *   - "tax.audit_triggered": { obligationId, taxType, jurisdiction, auditYear }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type TaxType = "income" | "sales" | "payroll" | "vat" | "property" | "excise" | "customs" | "capital_gains";
export type TaxFilingStatus = "upcoming" | "filed" | "overdue" | "under_audit" | "closed";
export type TaxFrequency = "monthly" | "quarterly" | "annual" | "one_time";

export interface TaxObligation {
  id: string;
  taxType: TaxType;
  jurisdiction: string;
  frequency: TaxFrequency;
  status: TaxFilingStatus;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  estimatedLiabilityUsd: number;
  actualLiabilityUsd?: number;
  paidUsd: number;
  filedAt?: string;
  createdAt: string;
}

export interface TaxPayment {
  id: string;
  obligationId: string;
  amountUsd: number;
  paidAt: string;
  reference: string;
  method: string;
}

export interface TaxSummary {
  totalObligations: number;
  upcoming: number;
  overdue: number;
  totalEstimatedLiabilityUsd: number;
  totalPaidUsd: number;
  totalOutstandingUsd: number;
}

export class TaxManager {
  private obligations: Map<string, TaxObligation> = new Map();
  private payments: Map<string, TaxPayment> = new Map();

  constructor(private readonly bus: EventBus) {}

  createObligation(input: Omit<TaxObligation, "id" | "paidUsd" | "createdAt"> & { id?: string }): TaxObligation {
    const obligation: TaxObligation = { ...input, id: input.id ?? randomUUID(), paidUsd: 0, createdAt: new Date().toISOString() };
    this.obligations.set(obligation.id, obligation);
    const daysUntilDue = Math.floor((new Date(obligation.dueDate).getTime() - Date.now()) / 86400000);
    if (daysUntilDue <= 30 && obligation.status === "upcoming") {
      this.bus.publish("tax.filing_due", { obligationId: obligation.id, taxType: obligation.taxType, jurisdiction: obligation.jurisdiction, dueDate: obligation.dueDate, estimatedUsd: obligation.estimatedLiabilityUsd });
    }
    return obligation;
  }

  recordPayment(obligationId: string, amountUsd: number, reference: string, method: string): TaxPayment | undefined {
    const obligation = this.obligations.get(obligationId);
    if (!obligation) return undefined;
    const payment: TaxPayment = { id: randomUUID(), obligationId, amountUsd, paidAt: new Date().toISOString(), reference, method };
    this.payments.set(payment.id, payment);
    obligation.paidUsd += amountUsd;
    this.bus.publish("tax.payment_recorded", { obligationId, amountUsd, paidAt: payment.paidAt });
    return payment;
  }

  fileReturn(obligationId: string, actualLiabilityUsd: number): TaxObligation | undefined {
    const obligation = this.obligations.get(obligationId);
    if (!obligation) return undefined;
    obligation.status = "filed";
    obligation.actualLiabilityUsd = actualLiabilityUsd;
    obligation.filedAt = new Date().toISOString();
    return obligation;
  }

  triggerAudit(obligationId: string, auditYear: number): TaxObligation | undefined {
    const obligation = this.obligations.get(obligationId);
    if (!obligation) return undefined;
    obligation.status = "under_audit";
    this.bus.publish("tax.audit_triggered", { obligationId, taxType: obligation.taxType, jurisdiction: obligation.jurisdiction, auditYear });
    return obligation;
  }

  getObligation(id: string): TaxObligation | undefined { return this.obligations.get(id); }
  listObligations(status?: TaxFilingStatus, taxType?: TaxType): TaxObligation[] {
    let all = Array.from(this.obligations.values());
    if (status) all = all.filter(o => o.status === status);
    if (taxType) all = all.filter(o => o.taxType === taxType);
    return all;
  }
  listPayments(obligationId?: string): TaxPayment[] {
    const all = Array.from(this.payments.values());
    return obligationId ? all.filter(p => p.obligationId === obligationId) : all;
  }

  summary(): TaxSummary {
    const obligations = Array.from(this.obligations.values());
    const totalEstimated = obligations.reduce((s, o) => s + o.estimatedLiabilityUsd, 0);
    const totalPaid = obligations.reduce((s, o) => s + o.paidUsd, 0);
    return {
      totalObligations: obligations.length,
      upcoming: obligations.filter(o => o.status === "upcoming").length,
      overdue: obligations.filter(o => o.status === "overdue").length,
      totalEstimatedLiabilityUsd: totalEstimated,
      totalPaidUsd: totalPaid,
      totalOutstandingUsd: Math.max(0, totalEstimated - totalPaid),
    };
  }
}
