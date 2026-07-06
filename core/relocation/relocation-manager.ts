/**
 * RelocationManager — employee relocation: package grants with a budget cap,
 * categorized expense submission with cap enforcement, expense approval, and
 * relocation completion with unused-budget reporting.
 *
 * Events:
 *   - "relocation.granted": { packageId, employeeId, budgetUsd }
 *   - "relocation.expense_approved": { packageId, category, amountUsd }
 *   - "relocation.completed": { packageId, spentUsd, unusedUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RelocationStatus = "active" | "completed" | "cancelled";
export type RelocationExpenseCategory = "moving" | "travel" | "temp_housing" | "storage" | "other";

export interface RelocationExpense {
  id: string;
  category: RelocationExpenseCategory;
  amountUsd: number;
  approved: boolean;
  submittedAt: string;
}

export interface RelocationPackage {
  id: string;
  employeeId: string;
  fromCity: string;
  toCity: string;
  budgetUsd: number;
  expenses: RelocationExpense[];
  status: RelocationStatus;
  grantedAt: string;
  completedAt?: string;
}

export interface RelocationSummary {
  totalPackages: number;
  active: number;
  completed: number;
  totalBudgetUsd: number;
  totalSpentUsd: number;
  avgUtilizationPct: number;
}

export class RelocationManager {
  private packages: Map<string, RelocationPackage> = new Map();

  constructor(private readonly bus: EventBus) {}

  grant(employeeId: string, fromCity: string, toCity: string, budgetUsd: number, grantedAt: string): RelocationPackage {
    const pkg: RelocationPackage = { id: randomUUID(), employeeId, fromCity, toCity, budgetUsd, expenses: [], status: "active", grantedAt };
    this.packages.set(pkg.id, pkg);
    this.bus.publish("relocation.granted", { packageId: pkg.id, employeeId, budgetUsd });
    return pkg;
  }

  approvedSpend(packageId: string): number {
    const pkg = this.packages.get(packageId);
    if (!pkg) return 0;
    return Math.round(pkg.expenses.filter(e => e.approved).reduce((s, e) => s + e.amountUsd, 0) * 100) / 100;
  }

  /** Submit an expense; rejected outright if it would exceed the remaining budget. */
  submitExpense(packageId: string, category: RelocationExpenseCategory, amountUsd: number, submittedAt: string): RelocationExpense | undefined {
    const pkg = this.packages.get(packageId);
    if (!pkg || pkg.status !== "active" || amountUsd <= 0) return undefined;
    if (this.approvedSpend(packageId) + amountUsd > pkg.budgetUsd) return undefined;
    const expense: RelocationExpense = { id: randomUUID(), category, amountUsd: Math.round(amountUsd * 100) / 100, approved: false, submittedAt };
    pkg.expenses.push(expense);
    return expense;
  }

  approveExpense(packageId: string, expenseId: string): RelocationExpense | undefined {
    const pkg = this.packages.get(packageId);
    const expense = pkg?.expenses.find(e => e.id === expenseId);
    if (!pkg || !expense || expense.approved || pkg.status !== "active") return undefined;
    if (this.approvedSpend(packageId) + expense.amountUsd > pkg.budgetUsd) return undefined;
    expense.approved = true;
    this.bus.publish("relocation.expense_approved", { packageId, category: expense.category, amountUsd: expense.amountUsd });
    return expense;
  }

  complete(packageId: string, completedAt: string): { pkg: RelocationPackage; spentUsd: number; unusedUsd: number } | undefined {
    const pkg = this.packages.get(packageId);
    if (!pkg || pkg.status !== "active") return undefined;
    pkg.status = "completed";
    pkg.completedAt = completedAt;
    const spentUsd = this.approvedSpend(packageId);
    const unusedUsd = Math.round((pkg.budgetUsd - spentUsd) * 100) / 100;
    this.bus.publish("relocation.completed", { packageId, spentUsd, unusedUsd });
    return { pkg, spentUsd, unusedUsd };
  }

  cancel(packageId: string): RelocationPackage | undefined {
    const pkg = this.packages.get(packageId);
    if (!pkg || pkg.status !== "active") return undefined;
    pkg.status = "cancelled";
    return pkg;
  }

  getPackage(id: string): RelocationPackage | undefined { return this.packages.get(id); }
  listPackages(status?: RelocationStatus): RelocationPackage[] {
    const all = Array.from(this.packages.values());
    return status ? all.filter(p => p.status === status) : all;
  }

  summary(): RelocationSummary {
    const pkgs = Array.from(this.packages.values()).filter(p => p.status !== "cancelled");
    const totalBudget = pkgs.reduce((s, p) => s + p.budgetUsd, 0);
    const totalSpent = pkgs.reduce((s, p) => s + this.approvedSpend(p.id), 0);
    return {
      totalPackages: pkgs.length,
      active: pkgs.filter(p => p.status === "active").length,
      completed: pkgs.filter(p => p.status === "completed").length,
      totalBudgetUsd: Math.round(totalBudget * 100) / 100,
      totalSpentUsd: Math.round(totalSpent * 100) / 100,
      avgUtilizationPct: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,
    };
  }
}
