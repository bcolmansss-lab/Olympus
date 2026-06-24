/**
 * CostCenter — departmental cost allocation, budget vs actual tracking,
 * chargebacks, cost driver attribution, and variance analysis.
 *
 * Events:
 *   - "cost.budget_exceeded": { centerId, name, budgetUsd, actualUsd, overageUsd }
 *   - "cost.allocation_recorded": { allocationId, centerId, amountUsd, category }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CostCategory = "payroll" | "software" | "infrastructure" | "marketing" | "travel" | "facilities" | "professional_services" | "other";
export type AllocationMethod = "direct" | "headcount" | "revenue" | "usage" | "equal_split";

export interface CostCenter {
  id: string;
  name: string;
  department: string;
  ownerId: string;
  annualBudgetUsd: number;
  ytdActualUsd: number;
  ytdVarianceUsd: number; // positive = over budget
  allocations: string[]; // CostAllocation IDs
  createdAt: string;
}

export interface CostAllocation {
  id: string;
  centerId: string;
  category: CostCategory;
  description: string;
  amountUsd: number;
  month: string; // YYYY-MM
  method: AllocationMethod;
  vendorId?: string;
  approvedBy?: string;
  recordedAt: string;
}

export interface CostVarianceReport {
  centerId: string;
  centerName: string;
  annualBudgetUsd: number;
  ytdActualUsd: number;
  varianceUsd: number;
  variancePct: number;
  status: "on_track" | "at_risk" | "over_budget";
  topCategories: Array<{ category: CostCategory; amountUsd: number }>;
}

export interface CostSummary {
  totalCenters: number;
  totalBudgetUsd: number;
  totalActualUsd: number;
  overBudgetCenters: number;
  totalVarianceUsd: number;
  byCategory: Partial<Record<CostCategory, number>>;
}

export class CostCenterManager {
  private centers: Map<string, CostCenter> = new Map();
  private allocations: Map<string, CostAllocation> = new Map();

  constructor(private readonly bus: EventBus) {}

  createCenter(input: Omit<CostCenter, "id" | "ytdActualUsd" | "ytdVarianceUsd" | "allocations" | "createdAt"> & { id?: string }): CostCenter {
    const center: CostCenter = {
      id: input.id ?? randomUUID(),
      name: input.name,
      department: input.department,
      ownerId: input.ownerId,
      annualBudgetUsd: input.annualBudgetUsd,
      ytdActualUsd: 0,
      ytdVarianceUsd: 0,
      allocations: [],
      createdAt: new Date().toISOString(),
    };
    this.centers.set(center.id, center);
    return center;
  }

  recordAllocation(input: Omit<CostAllocation, "id" | "recordedAt"> & { id?: string }): CostAllocation | undefined {
    const center = this.centers.get(input.centerId);
    if (!center) return undefined;
    const allocation: CostAllocation = { ...input, id: input.id ?? randomUUID(), recordedAt: new Date().toISOString() };
    this.allocations.set(allocation.id, allocation);
    center.allocations.push(allocation.id);
    center.ytdActualUsd += allocation.amountUsd;
    center.ytdVarianceUsd = center.ytdActualUsd - center.annualBudgetUsd;

    this.bus.publish("cost.allocation_recorded", { allocationId: allocation.id, centerId: allocation.centerId, amountUsd: allocation.amountUsd, category: allocation.category });

    if (center.ytdActualUsd > center.annualBudgetUsd) {
      this.bus.publish("cost.budget_exceeded", {
        centerId: center.id,
        name: center.name,
        budgetUsd: center.annualBudgetUsd,
        actualUsd: center.ytdActualUsd,
        overageUsd: center.ytdVarianceUsd,
      });
    }

    return allocation;
  }

  varianceReport(centerId: string): CostVarianceReport | undefined {
    const center = this.centers.get(centerId);
    if (!center) return undefined;
    const centerAllocations = Array.from(this.allocations.values()).filter((a) => a.centerId === centerId);
    const byCat: Record<string, number> = {};
    for (const a of centerAllocations) { byCat[a.category] = (byCat[a.category] ?? 0) + a.amountUsd; }
    const topCategories = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([category, amountUsd]) => ({ category: category as CostCategory, amountUsd }));
    const variancePct = center.annualBudgetUsd > 0 ? Math.round((center.ytdVarianceUsd / center.annualBudgetUsd) * 100) : 0;
    const status = center.ytdActualUsd > center.annualBudgetUsd ? "over_budget" : variancePct > -10 ? "at_risk" : "on_track";
    return { centerId, centerName: center.name, annualBudgetUsd: center.annualBudgetUsd, ytdActualUsd: center.ytdActualUsd, varianceUsd: center.ytdVarianceUsd, variancePct, status, topCategories };
  }

  getCenter(id: string): CostCenter | undefined { return this.centers.get(id); }
  listCenters(department?: string): CostCenter[] {
    const all = Array.from(this.centers.values());
    return department ? all.filter((c) => c.department === department) : all;
  }

  listAllocations(centerId?: string, month?: string): CostAllocation[] {
    let all = Array.from(this.allocations.values());
    if (centerId) all = all.filter((a) => a.centerId === centerId);
    if (month) all = all.filter((a) => a.month === month);
    return all;
  }

  summary(): CostSummary {
    const centers = Array.from(this.centers.values());
    const allocations = Array.from(this.allocations.values());
    const byCategory: Partial<Record<CostCategory, number>> = {};
    for (const a of allocations) { byCategory[a.category] = (byCategory[a.category] ?? 0) + a.amountUsd; }
    return {
      totalCenters: centers.length,
      totalBudgetUsd: centers.reduce((s, c) => s + c.annualBudgetUsd, 0),
      totalActualUsd: centers.reduce((s, c) => s + c.ytdActualUsd, 0),
      overBudgetCenters: centers.filter((c) => c.ytdActualUsd > c.annualBudgetUsd).length,
      totalVarianceUsd: centers.reduce((s, c) => s + c.ytdVarianceUsd, 0),
      byCategory,
    };
  }
}
