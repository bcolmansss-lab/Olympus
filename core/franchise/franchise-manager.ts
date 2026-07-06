/**
 * FranchiseManager — franchise network operations: franchisee onboarding with
 * a royalty percentage, monthly gross-sales reporting, royalty due
 * calculation, payment recording, and network-wide performance rollups.
 *
 * Events:
 *   - "franchise.sales_reported": { franchiseId, period, grossSalesUsd, royaltyDueUsd }
 *   - "franchise.royalty_paid": { franchiseId, period, amountUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type FranchiseStatus = "active" | "suspended" | "terminated";

export interface Franchise {
  id: string;
  ownerName: string;
  territory: string;
  royaltyPct: number;
  status: FranchiseStatus;
  openedAt: string;
}

export interface FranchiseSalesReport {
  franchiseId: string;
  period: string;
  grossSalesUsd: number;
  royaltyDueUsd: number;
  royaltyPaid: boolean;
}

export interface FranchiseSummary {
  totalFranchises: number;
  active: number;
  totalGrossSalesUsd: number;
  totalRoyaltiesDueUsd: number;
  totalRoyaltiesCollectedUsd: number;
}

export class FranchiseManager {
  private franchises: Map<string, Franchise> = new Map();
  private reports: Map<string, FranchiseSalesReport> = new Map();

  constructor(private readonly bus: EventBus) {}

  onboard(ownerName: string, territory: string, royaltyPct: number, openedAt: string): Franchise {
    const franchise: Franchise = { id: randomUUID(), ownerName, territory, royaltyPct, status: "active", openedAt };
    this.franchises.set(franchise.id, franchise);
    return franchise;
  }

  suspend(franchiseId: string): Franchise | undefined {
    const f = this.franchises.get(franchiseId);
    if (!f || f.status !== "active") return undefined;
    f.status = "suspended";
    return f;
  }

  reinstate(franchiseId: string): Franchise | undefined {
    const f = this.franchises.get(franchiseId);
    if (!f || f.status !== "suspended") return undefined;
    f.status = "active";
    return f;
  }

  terminate(franchiseId: string): Franchise | undefined {
    const f = this.franchises.get(franchiseId);
    if (!f || f.status === "terminated") return undefined;
    f.status = "terminated";
    return f;
  }

  /** Report a period's gross sales; one report per franchise per period. */
  reportSales(franchiseId: string, period: string, grossSalesUsd: number): FranchiseSalesReport | undefined {
    const f = this.franchises.get(franchiseId);
    if (!f || f.status !== "active") return undefined;
    const key = `${franchiseId}:${period}`;
    if (this.reports.has(key)) return undefined;
    const report: FranchiseSalesReport = {
      franchiseId,
      period,
      grossSalesUsd,
      royaltyDueUsd: Math.round(grossSalesUsd * (f.royaltyPct / 100) * 100) / 100,
      royaltyPaid: false,
    };
    this.reports.set(key, report);
    this.bus.publish("franchise.sales_reported", { franchiseId, period, grossSalesUsd, royaltyDueUsd: report.royaltyDueUsd });
    return report;
  }

  payRoyalty(franchiseId: string, period: string): FranchiseSalesReport | undefined {
    const report = this.reports.get(`${franchiseId}:${period}`);
    if (!report || report.royaltyPaid) return undefined;
    report.royaltyPaid = true;
    this.bus.publish("franchise.royalty_paid", { franchiseId, period, amountUsd: report.royaltyDueUsd });
    return report;
  }

  getFranchise(id: string): Franchise | undefined { return this.franchises.get(id); }
  getReport(franchiseId: string, period: string): FranchiseSalesReport | undefined { return this.reports.get(`${franchiseId}:${period}`); }
  listFranchises(status?: FranchiseStatus): Franchise[] {
    const all = Array.from(this.franchises.values());
    return status ? all.filter(f => f.status === status) : all;
  }
  listUnpaidRoyalties(): FranchiseSalesReport[] {
    return Array.from(this.reports.values()).filter(r => !r.royaltyPaid);
  }

  summary(): FranchiseSummary {
    const franchises = Array.from(this.franchises.values());
    const reports = Array.from(this.reports.values());
    return {
      totalFranchises: franchises.length,
      active: franchises.filter(f => f.status === "active").length,
      totalGrossSalesUsd: Math.round(reports.reduce((s, r) => s + r.grossSalesUsd, 0) * 100) / 100,
      totalRoyaltiesDueUsd: Math.round(reports.filter(r => !r.royaltyPaid).reduce((s, r) => s + r.royaltyDueUsd, 0) * 100) / 100,
      totalRoyaltiesCollectedUsd: Math.round(reports.filter(r => r.royaltyPaid).reduce((s, r) => s + r.royaltyDueUsd, 0) * 100) / 100,
    };
  }
}
