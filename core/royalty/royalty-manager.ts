/**
 * RoyaltyManager — IP licensing royalty agreements: tiered/flat royalty rates
 * on reported sales, accrual per reporting period, and payout settlement.
 *
 * Events:
 *   - "royalty.agreement_created": { agreementId, licensee, ratePct }
 *   - "royalty.accrued": { agreementId, period, salesUsd, royaltyUsd }
 *   - "royalty.paid": { agreementId, amountUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RoyaltyBasis = "net_sales" | "gross_sales" | "per_unit";
export type AgreementStatus = "active" | "terminated";

export interface RoyaltyAgreement {
  id: string;
  licensee: string;
  ipAsset: string;
  basis: RoyaltyBasis;
  ratePct: number; // for sales-based
  perUnitUsd: number; // for per_unit
  minimumGuaranteeUsd: number;
  accruedUsd: number;
  paidUsd: number;
  status: AgreementStatus;
  createdAt: string;
}

export interface RoyaltyReport {
  id: string;
  agreementId: string;
  period: string;
  salesUsd: number;
  units: number;
  royaltyUsd: number;
  reportedAt: string;
}

export interface RoyaltySummary {
  totalAgreements: number;
  active: number;
  totalAccruedUsd: number;
  totalPaidUsd: number;
  outstandingUsd: number;
}

export class RoyaltyManager {
  private agreements: Map<string, RoyaltyAgreement> = new Map();
  private reports: RoyaltyReport[] = [];

  constructor(private readonly bus: EventBus) {}

  createAgreement(input: { licensee: string; ipAsset: string; basis: RoyaltyBasis; ratePct?: number; perUnitUsd?: number; minimumGuaranteeUsd?: number }): RoyaltyAgreement {
    const agreement: RoyaltyAgreement = {
      id: randomUUID(),
      licensee: input.licensee,
      ipAsset: input.ipAsset,
      basis: input.basis,
      ratePct: input.ratePct ?? 0,
      perUnitUsd: input.perUnitUsd ?? 0,
      minimumGuaranteeUsd: input.minimumGuaranteeUsd ?? 0,
      accruedUsd: 0,
      paidUsd: 0,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    this.agreements.set(agreement.id, agreement);
    this.bus.publish("royalty.agreement_created", { agreementId: agreement.id, licensee: agreement.licensee, ratePct: agreement.ratePct });
    return agreement;
  }

  reportSales(agreementId: string, period: string, salesUsd: number, units: number, reportedAt: string): RoyaltyReport | undefined {
    const a = this.agreements.get(agreementId);
    if (!a || a.status !== "active") return undefined;
    const royaltyUsd = a.basis === "per_unit"
      ? Math.round(units * a.perUnitUsd * 100) / 100
      : Math.round(salesUsd * (a.ratePct / 100) * 100) / 100;
    const report: RoyaltyReport = { id: randomUUID(), agreementId, period, salesUsd, units, royaltyUsd, reportedAt };
    this.reports.push(report);
    a.accruedUsd = Math.round((a.accruedUsd + royaltyUsd) * 100) / 100;
    this.bus.publish("royalty.accrued", { agreementId, period, salesUsd, royaltyUsd });
    return report;
  }

  /** Amount payable this settlement: max(accrued, minimum guarantee) minus paid. */
  payable(agreementId: string): number {
    const a = this.agreements.get(agreementId);
    if (!a) return 0;
    const due = Math.max(a.accruedUsd, a.minimumGuaranteeUsd);
    return Math.max(0, Math.round((due - a.paidUsd) * 100) / 100);
  }

  pay(agreementId: string): number {
    const a = this.agreements.get(agreementId);
    if (!a) return 0;
    const amount = this.payable(agreementId);
    if (amount <= 0) return 0;
    a.paidUsd = Math.round((a.paidUsd + amount) * 100) / 100;
    this.bus.publish("royalty.paid", { agreementId, amountUsd: amount });
    return amount;
  }

  terminate(agreementId: string): RoyaltyAgreement | undefined {
    const a = this.agreements.get(agreementId);
    if (!a) return undefined;
    a.status = "terminated";
    return a;
  }

  getAgreement(id: string): RoyaltyAgreement | undefined { return this.agreements.get(id); }
  listAgreements(status?: AgreementStatus): RoyaltyAgreement[] {
    const all = Array.from(this.agreements.values());
    return status ? all.filter(a => a.status === status) : all;
  }
  listReports(agreementId?: string): RoyaltyReport[] {
    return agreementId ? this.reports.filter(r => r.agreementId === agreementId) : [...this.reports];
  }

  summary(): RoyaltySummary {
    const agreements = Array.from(this.agreements.values());
    const accrued = agreements.reduce((s, a) => s + a.accruedUsd, 0);
    const paid = agreements.reduce((s, a) => s + a.paidUsd, 0);
    return {
      totalAgreements: agreements.length,
      active: agreements.filter(a => a.status === "active").length,
      totalAccruedUsd: Math.round(accrued * 100) / 100,
      totalPaidUsd: Math.round(paid * 100) / 100,
      outstandingUsd: Math.round((accrued - paid) * 100) / 100,
    };
  }
}
