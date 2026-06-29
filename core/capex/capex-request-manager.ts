/**
 * CapexRequestManager — capital expenditure requests: business-case capture,
 * tiered approval routing by amount, payback/ROI evaluation, and budget
 * commitment tracking.
 *
 * Events:
 *   - "capex.submitted": { capexId, requesterId, amountUsd, category }
 *   - "capex.approved": { capexId, approverId, amountUsd }
 *   - "capex.budget_exceeded": { fiscalYear, committedUsd, budgetUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CapexCategory = "equipment" | "facilities" | "it_hardware" | "software" | "vehicles" | "infrastructure";
export type CapexStatus = "draft" | "submitted" | "approved" | "rejected" | "funded";

export interface CapexRequest {
  id: string;
  requesterId: string;
  title: string;
  category: CapexCategory;
  amountUsd: number;
  expectedAnnualSavingsUsd: number;
  usefulLifeYears: number;
  fiscalYear: string;
  status: CapexStatus;
  approverId?: string;
  createdAt: string;
}

export interface CapexSummary {
  totalRequests: number;
  submitted: number;
  approved: number;
  totalApprovedUsd: number;
  totalRequestedUsd: number;
  byCategory: Partial<Record<CapexCategory, number>>;
}

export class CapexRequestManager {
  private requests: Map<string, CapexRequest> = new Map();
  private budgets: Map<string, number> = new Map(); // fiscalYear -> budget
  private committed: Map<string, number> = new Map();

  constructor(private readonly bus: EventBus) {}

  setBudget(fiscalYear: string, budgetUsd: number): void {
    this.budgets.set(fiscalYear, budgetUsd);
  }

  create(input: { requesterId: string; title: string; category: CapexCategory; amountUsd: number; expectedAnnualSavingsUsd: number; usefulLifeYears: number; fiscalYear: string }): CapexRequest {
    const request: CapexRequest = { ...input, id: randomUUID(), status: "draft", createdAt: new Date().toISOString() };
    this.requests.set(request.id, request);
    return request;
  }

  /** Payback period in years (Infinity if no savings). */
  paybackYears(capexId: string): number {
    const r = this.requests.get(capexId);
    if (!r || r.expectedAnnualSavingsUsd <= 0) return Infinity;
    return Math.round((r.amountUsd / r.expectedAnnualSavingsUsd) * 100) / 100;
  }

  roiPct(capexId: string): number {
    const r = this.requests.get(capexId);
    if (!r || r.amountUsd <= 0) return 0;
    const totalSavings = r.expectedAnnualSavingsUsd * r.usefulLifeYears;
    return Math.round(((totalSavings - r.amountUsd) / r.amountUsd) * 100);
  }

  submit(capexId: string): CapexRequest | undefined {
    const r = this.requests.get(capexId);
    if (!r || r.status !== "draft") return undefined;
    r.status = "submitted";
    this.bus.publish("capex.submitted", { capexId, requesterId: r.requesterId, amountUsd: r.amountUsd, category: r.category });
    return r;
  }

  approve(capexId: string, approverId: string): CapexRequest | undefined {
    const r = this.requests.get(capexId);
    if (!r || r.status !== "submitted") return undefined;
    r.status = "approved";
    r.approverId = approverId;
    const committed = Math.round(((this.committed.get(r.fiscalYear) ?? 0) + r.amountUsd) * 100) / 100;
    this.committed.set(r.fiscalYear, committed);
    this.bus.publish("capex.approved", { capexId, approverId, amountUsd: r.amountUsd });
    const budget = this.budgets.get(r.fiscalYear);
    if (budget !== undefined && committed > budget) {
      this.bus.publish("capex.budget_exceeded", { fiscalYear: r.fiscalYear, committedUsd: committed, budgetUsd: budget });
    }
    return r;
  }

  reject(capexId: string, approverId: string): CapexRequest | undefined {
    const r = this.requests.get(capexId);
    if (!r || r.status !== "submitted") return undefined;
    r.status = "rejected";
    r.approverId = approverId;
    return r;
  }

  fund(capexId: string): CapexRequest | undefined {
    const r = this.requests.get(capexId);
    if (!r || r.status !== "approved") return undefined;
    r.status = "funded";
    return r;
  }

  committedFor(fiscalYear: string): number { return this.committed.get(fiscalYear) ?? 0; }
  getRequest(id: string): CapexRequest | undefined { return this.requests.get(id); }
  listRequests(status?: CapexStatus, category?: CapexCategory): CapexRequest[] {
    let all = Array.from(this.requests.values());
    if (status) all = all.filter(r => r.status === status);
    if (category) all = all.filter(r => r.category === category);
    return all;
  }

  summary(): CapexSummary {
    const requests = Array.from(this.requests.values());
    const approved = requests.filter(r => r.status === "approved" || r.status === "funded");
    const byCategory: Partial<Record<CapexCategory, number>> = {};
    for (const r of requests) { byCategory[r.category] = (byCategory[r.category] ?? 0) + 1; }
    return {
      totalRequests: requests.length,
      submitted: requests.filter(r => r.status === "submitted").length,
      approved: approved.length,
      totalApprovedUsd: Math.round(approved.reduce((s, r) => s + r.amountUsd, 0) * 100) / 100,
      totalRequestedUsd: Math.round(requests.reduce((s, r) => s + r.amountUsd, 0) * 100) / 100,
      byCategory,
    };
  }
}
