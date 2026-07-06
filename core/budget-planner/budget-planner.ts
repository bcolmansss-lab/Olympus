/**
 * BudgetPlanner — annual/quarterly budget creation, variance tracking,
 * reforecast workflows, approval chains, and spend-vs-plan analytics.
 *
 * Events:
 *   - "budget.approved": { budgetId, name, totalUsd, approvedBy }
 *   - "budget.variance_alert": { budgetId, lineItemId, variancePct, description }
 *   - "budget.reforecast_submitted": { budgetId, submittedBy, newTotalUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type BudgetStatus = "draft" | "pending_approval" | "approved" | "active" | "closed";
export type BudgetPeriod = "monthly" | "quarterly" | "annual";

export interface BudgetLineItem {
  id: string;
  budgetId: string;
  category: string;
  description: string;
  plannedUsd: number;
  actualUsd: number;
  variancePct: number; // (actual - planned) / planned * 100
}

export interface Budget {
  id: string;
  name: string;
  period: BudgetPeriod;
  fiscalYear: number;
  status: BudgetStatus;
  departmentId: string;
  totalPlannedUsd: number;
  totalActualUsd: number;
  lineItems: string[]; // BudgetLineItem IDs
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetSummary {
  totalBudgets: number;
  approvedBudgets: number;
  totalPlannedUsd: number;
  totalActualUsd: number;
  overBudgetCount: number;
  avgVariancePct: number;
}

export class BudgetPlanner {
  private budgets: Map<string, Budget> = new Map();
  private lineItems: Map<string, BudgetLineItem> = new Map();

  constructor(private readonly bus: EventBus) {}

  createBudget(input: Omit<Budget, "id" | "lineItems" | "totalActualUsd" | "createdAt" | "updatedAt"> & { id?: string }): Budget {
    const now = new Date().toISOString();
    const budget: Budget = { ...input, id: input.id ?? randomUUID(), lineItems: [], totalActualUsd: 0, createdAt: now, updatedAt: now };
    this.budgets.set(budget.id, budget);
    return budget;
  }

  approveBudget(budgetId: string, approvedBy: string): Budget | undefined {
    const budget = this.budgets.get(budgetId);
    if (!budget) return undefined;
    budget.status = "approved";
    budget.approvedBy = approvedBy;
    budget.approvedAt = new Date().toISOString();
    budget.updatedAt = budget.approvedAt;
    this.bus.publish("budget.approved", { budgetId, name: budget.name, totalUsd: budget.totalPlannedUsd, approvedBy });
    return budget;
  }

  addLineItem(input: Omit<BudgetLineItem, "id" | "variancePct"> & { id?: string }): BudgetLineItem | undefined {
    const budget = this.budgets.get(input.budgetId);
    if (!budget) return undefined;
    const variancePct = input.plannedUsd > 0 ? ((input.actualUsd - input.plannedUsd) / input.plannedUsd) * 100 : 0;
    const item: BudgetLineItem = { ...input, id: input.id ?? randomUUID(), variancePct };
    this.lineItems.set(item.id, item);
    budget.lineItems.push(item.id);
    budget.totalPlannedUsd += item.plannedUsd;
    budget.totalActualUsd += item.actualUsd;
    budget.updatedAt = new Date().toISOString();
    if (Math.abs(variancePct) > 10) {
      this.bus.publish("budget.variance_alert", { budgetId: input.budgetId, lineItemId: item.id, variancePct, description: item.description });
    }
    return item;
  }

  submitReforecast(budgetId: string, submittedBy: string, newTotalUsd: number): Budget | undefined {
    const budget = this.budgets.get(budgetId);
    if (!budget) return undefined;
    budget.totalPlannedUsd = newTotalUsd;
    budget.updatedAt = new Date().toISOString();
    this.bus.publish("budget.reforecast_submitted", { budgetId, submittedBy, newTotalUsd });
    return budget;
  }

  getBudget(id: string): Budget | undefined { return this.budgets.get(id); }
  listBudgets(status?: BudgetStatus): Budget[] {
    const all = Array.from(this.budgets.values());
    return status ? all.filter(b => b.status === status) : all;
  }
  listLineItems(budgetId?: string): BudgetLineItem[] {
    const all = Array.from(this.lineItems.values());
    return budgetId ? all.filter(li => li.budgetId === budgetId) : all;
  }

  summary(): BudgetSummary {
    const budgets = Array.from(this.budgets.values());
    const approved = budgets.filter(b => b.status === "approved" || b.status === "active");
    const items = Array.from(this.lineItems.values());
    const overBudget = items.filter(li => li.variancePct > 10).length;
    const avgVariance = items.length > 0 ? items.reduce((s, li) => s + li.variancePct, 0) / items.length : 0;
    return {
      totalBudgets: budgets.length,
      approvedBudgets: approved.length,
      totalPlannedUsd: budgets.reduce((s, b) => s + b.totalPlannedUsd, 0),
      totalActualUsd: budgets.reduce((s, b) => s + b.totalActualUsd, 0),
      overBudgetCount: overBudget,
      avgVariancePct: Math.round(avgVariance * 10) / 10,
    };
  }
}
