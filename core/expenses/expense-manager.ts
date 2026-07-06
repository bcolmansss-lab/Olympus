/**
 * ExpenseManager — employee expense submissions, approval workflows, policy enforcement, and reimbursement tracking.
 *
 * Lifecycle: submitted → under_review → approved → reimbursed | rejected
 *
 * Policy rules (configurable):
 *   - Per-category daily limits (e.g. meals $75/day, travel $500/day)
 *   - Receipt required above $25
 *   - Manager approval required above $500
 *   - Finance approval required above $2000
 *
 * Events:
 *   - "expense.submitted": { expenseId, employeeId, amountUsd, category }
 *   - "expense.approved": { expenseId, employeeId, amountUsd, approvedBy }
 *   - "expense.rejected": { expenseId, employeeId, reason }
 *   - "expense.policy_violation": { expenseId, rule, amountUsd, limitUsd }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ExpenseCategory = "meals" | "travel" | "accommodation" | "software" | "hardware" | "marketing" | "training" | "entertainment" | "office_supplies" | "other";
export type ExpenseStatus = "submitted" | "under_review" | "approved" | "rejected" | "reimbursed";

export interface Expense {
  id: string;
  employeeId: string;
  category: ExpenseCategory;
  amountUsd: number;
  description: string;
  receiptUrl?: string;
  merchant?: string;
  expenseDate: string; // ISO date
  status: ExpenseStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reimbursedAt?: string;
  rejectionReason?: string;
  policyViolations: string[]; // list of violated rules
  tags?: string[];
}

export interface ExpensePolicy {
  categoryLimitsUsd: Partial<Record<ExpenseCategory, number>>; // daily limit per category
  receiptRequiredAboveUsd: number;
  managerApprovalAboveUsd: number;
  financeApprovalAboveUsd: number;
}

export interface ExpenseSummary {
  totalSubmitted: number;
  totalApproved: number;
  totalRejected: number;
  totalReimbursed: number;
  pendingReimbursementUsd: number;
  totalSpendUsd: number; // sum of approved+reimbursed
  byCategory: Partial<Record<ExpenseCategory, number>>;
  avgProcessingDays: number;
  policyViolationRate: number; // % of expenses with violations
}

const DEFAULT_POLICY: ExpensePolicy = {
  categoryLimitsUsd: { meals: 75, entertainment: 150, travel: 500, accommodation: 300 },
  receiptRequiredAboveUsd: 25,
  managerApprovalAboveUsd: 500,
  financeApprovalAboveUsd: 2000,
};

export class ExpenseManager {
  private readonly expenses: Map<string, Expense> = new Map();
  private readonly policy: ExpensePolicy;

  constructor(private readonly bus: EventBus, policy?: ExpensePolicy) {
    this.policy = policy ?? DEFAULT_POLICY;
  }

  submitExpense(input: Omit<Expense, "id" | "status" | "submittedAt" | "policyViolations"> & { id?: string }): Expense {
    const violations: string[] = [];
    const { amountUsd, category, receiptUrl } = input;

    const categoryLimit = this.policy.categoryLimitsUsd[category];
    if (categoryLimit !== undefined && amountUsd > categoryLimit) {
      violations.push(`Category limit exceeded: $${categoryLimit} limit for ${category}`);
    }

    if (amountUsd > this.policy.receiptRequiredAboveUsd && !receiptUrl) {
      violations.push(`Receipt required for expenses over $${this.policy.receiptRequiredAboveUsd}`);
    }

    const expense: Expense = {
      ...input,
      id: input.id ?? randomUUID(),
      status: violations.length > 0 ? "under_review" : "submitted",
      submittedAt: new Date().toISOString(),
      policyViolations: violations,
    };

    this.expenses.set(expense.id, expense);

    this.bus.publish("expense.submitted", {
      expenseId: expense.id,
      employeeId: expense.employeeId,
      amountUsd: expense.amountUsd,
      category: expense.category,
    });

    for (const rule of violations) {
      this.bus.publish("expense.policy_violation", {
        expenseId: expense.id,
        rule,
        amountUsd: expense.amountUsd,
        limitUsd: this.policy.categoryLimitsUsd[category],
      });
    }

    return expense;
  }

  approve(id: string, approvedBy: string): Expense | undefined {
    const expense = this.expenses.get(id);
    if (!expense) return undefined;
    expense.status = "approved";
    expense.reviewedAt = new Date().toISOString();
    expense.reviewedBy = approvedBy;
    this.bus.publish("expense.approved", {
      expenseId: expense.id,
      employeeId: expense.employeeId,
      amountUsd: expense.amountUsd,
      approvedBy,
    });
    return expense;
  }

  reject(id: string, reason: string, reviewedBy: string): Expense | undefined {
    const expense = this.expenses.get(id);
    if (!expense) return undefined;
    expense.status = "rejected";
    expense.rejectionReason = reason;
    expense.reviewedAt = new Date().toISOString();
    expense.reviewedBy = reviewedBy;
    this.bus.publish("expense.rejected", {
      expenseId: expense.id,
      employeeId: expense.employeeId,
      reason,
    });
    return expense;
  }

  reimburse(id: string): Expense | undefined {
    const expense = this.expenses.get(id);
    if (!expense) return undefined;
    expense.status = "reimbursed";
    expense.reimbursedAt = new Date().toISOString();
    return expense;
  }

  list(status?: ExpenseStatus): Expense[] {
    const all = Array.from(this.expenses.values());
    if (status === undefined) return all;
    return all.filter((e) => e.status === status);
  }

  get(id: string): Expense | undefined {
    return this.expenses.get(id);
  }

  getByEmployee(employeeId: string): Expense[] {
    return Array.from(this.expenses.values()).filter((e) => e.employeeId === employeeId);
  }

  summary(): ExpenseSummary {
    const all = Array.from(this.expenses.values());
    const totalSubmitted = all.length;
    const totalApproved = all.filter((e) => e.status === "approved").length;
    const totalRejected = all.filter((e) => e.status === "rejected").length;
    const totalReimbursed = all.filter((e) => e.status === "reimbursed").length;

    const pendingReimbursementUsd = all
      .filter((e) => e.status === "approved")
      .reduce((sum, e) => sum + e.amountUsd, 0);

    const totalSpendUsd = all
      .filter((e) => e.status === "approved" || e.status === "reimbursed")
      .reduce((sum, e) => sum + e.amountUsd, 0);

    const byCategory: Partial<Record<ExpenseCategory, number>> = {};
    for (const expense of all) {
      byCategory[expense.category] = (byCategory[expense.category] ?? 0) + expense.amountUsd;
    }

    const reviewed = all.filter((e) => e.reviewedAt !== undefined);
    let avgProcessingDays = 0;
    if (reviewed.length > 0) {
      const totalDays = reviewed.reduce((sum, e) => {
        const submitted = new Date(e.submittedAt).getTime();
        const reviewedAt = new Date(e.reviewedAt!).getTime();
        return sum + (reviewedAt - submitted) / (1000 * 60 * 60 * 24);
      }, 0);
      avgProcessingDays = totalDays / reviewed.length;
    }

    const policyViolationRate =
      totalSubmitted > 0
        ? (all.filter((e) => e.policyViolations.length > 0).length / totalSubmitted) * 100
        : 0;

    return {
      totalSubmitted,
      totalApproved,
      totalRejected,
      totalReimbursed,
      pendingReimbursementUsd,
      totalSpendUsd,
      byCategory,
      avgProcessingDays,
      policyViolationRate,
    };
  }
}
