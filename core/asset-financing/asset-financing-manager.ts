/**
 * AssetFinancingManager — equipment financing: leases and loans with payment
 * schedules, amortization, payment recording, and outstanding-balance tracking.
 *
 * Events:
 *   - "assetfinancing.originated": { agreementId, type, principalUsd, termMonths }
 *   - "assetfinancing.payment_recorded": { agreementId, amountUsd, remainingUsd }
 *   - "assetfinancing.paid_off": { agreementId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type FinancingType = "lease" | "loan";
export type FinancingStatus = "active" | "paid_off" | "defaulted";

export interface FinancingAgreement {
  id: string;
  assetTag: string;
  type: FinancingType;
  lender: string;
  principalUsd: number;
  annualRatePct: number;
  termMonths: number;
  monthlyPaymentUsd: number;
  paidUsd: number;
  paymentsMade: number;
  status: FinancingStatus;
  originatedAt: string;
}

export interface FinancingSummary {
  totalAgreements: number;
  active: number;
  paidOff: number;
  totalPrincipalUsd: number;
  totalOutstandingUsd: number;
  monthlyObligationUsd: number;
}

export class AssetFinancingManager {
  private agreements: Map<string, FinancingAgreement> = new Map();

  constructor(private readonly bus: EventBus) {}

  /** Compute level monthly payment via amortization formula. */
  private monthlyPayment(principal: number, annualRatePct: number, termMonths: number): number {
    if (termMonths <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return Math.round((principal / termMonths) * 100) / 100;
    const payment = (principal * r) / (1 - Math.pow(1 + r, -termMonths));
    return Math.round(payment * 100) / 100;
  }

  originate(input: { assetTag: string; type: FinancingType; lender: string; principalUsd: number; annualRatePct: number; termMonths: number; originatedAt: string }): FinancingAgreement {
    const monthlyPaymentUsd = this.monthlyPayment(input.principalUsd, input.annualRatePct, input.termMonths);
    const agreement: FinancingAgreement = { ...input, id: randomUUID(), monthlyPaymentUsd, paidUsd: 0, paymentsMade: 0, status: "active" };
    this.agreements.set(agreement.id, agreement);
    this.bus.publish("assetfinancing.originated", { agreementId: agreement.id, type: agreement.type, principalUsd: agreement.principalUsd, termMonths: agreement.termMonths });
    return agreement;
  }

  /** Total of all scheduled payments (principal + interest). */
  totalScheduled(agreementId: string): number {
    const a = this.agreements.get(agreementId);
    if (!a) return 0;
    return Math.round(a.monthlyPaymentUsd * a.termMonths * 100) / 100;
  }

  outstanding(agreementId: string): number {
    const a = this.agreements.get(agreementId);
    if (!a) return 0;
    return Math.max(0, Math.round((this.totalScheduled(agreementId) - a.paidUsd) * 100) / 100);
  }

  recordPayment(agreementId: string, amountUsd: number): FinancingAgreement | undefined {
    const a = this.agreements.get(agreementId);
    if (!a || a.status !== "active" || amountUsd <= 0) return undefined;
    a.paidUsd = Math.round((a.paidUsd + amountUsd) * 100) / 100;
    a.paymentsMade += 1;
    const remaining = this.outstanding(agreementId);
    this.bus.publish("assetfinancing.payment_recorded", { agreementId, amountUsd, remainingUsd: remaining });
    if (remaining <= 0 || a.paymentsMade >= a.termMonths) {
      a.status = "paid_off";
      this.bus.publish("assetfinancing.paid_off", { agreementId });
    }
    return a;
  }

  markDefaulted(agreementId: string): FinancingAgreement | undefined {
    const a = this.agreements.get(agreementId);
    if (!a || a.status !== "active") return undefined;
    a.status = "defaulted";
    return a;
  }

  getAgreement(id: string): FinancingAgreement | undefined { return this.agreements.get(id); }
  listAgreements(status?: FinancingStatus, type?: FinancingType): FinancingAgreement[] {
    let all = Array.from(this.agreements.values());
    if (status) all = all.filter(a => a.status === status);
    if (type) all = all.filter(a => a.type === type);
    return all;
  }

  summary(): FinancingSummary {
    const agreements = Array.from(this.agreements.values());
    const active = agreements.filter(a => a.status === "active");
    return {
      totalAgreements: agreements.length,
      active: active.length,
      paidOff: agreements.filter(a => a.status === "paid_off").length,
      totalPrincipalUsd: Math.round(agreements.reduce((s, a) => s + a.principalUsd, 0) * 100) / 100,
      totalOutstandingUsd: Math.round(active.reduce((s, a) => s + this.outstanding(a.id), 0) * 100) / 100,
      monthlyObligationUsd: Math.round(active.reduce((s, a) => s + a.monthlyPaymentUsd, 0) * 100) / 100,
    };
  }
}
