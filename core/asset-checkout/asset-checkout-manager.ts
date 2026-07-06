/**
 * AssetCheckoutManager — loaner/tool checkout library: checkoutable items,
 * borrow/return with due dates, overdue detection, and utilization.
 *
 * Events:
 *   - "checkout.item_added": { itemId, name, category }
 *   - "checkout.borrowed": { loanId, itemId, borrowerId, dueDate }
 *   - "checkout.returned": { loanId, itemId, lateDays }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ItemAvailability = "available" | "on_loan" | "maintenance" | "retired";
export type LoanStatus = "active" | "returned" | "overdue";

export interface CheckoutItem {
  id: string;
  name: string;
  category: string;
  assetTag: string;
  availability: ItemAvailability;
  createdAt: string;
}

export interface Loan {
  id: string;
  itemId: string;
  borrowerId: string;
  borrowedAt: string;
  dueDate: string;
  status: LoanStatus;
  returnedAt?: string;
  lateDays?: number;
}

export interface CheckoutSummary {
  totalItems: number;
  available: number;
  onLoan: number;
  totalLoans: number;
  activeLoans: number;
  overdueLoans: number;
  byCategory: Record<string, number>;
}

export class AssetCheckoutManager {
  private items: Map<string, CheckoutItem> = new Map();
  private loans: Map<string, Loan> = new Map();

  constructor(private readonly bus: EventBus) {}

  addItem(input: { name: string; category: string; assetTag: string }): CheckoutItem {
    const item: CheckoutItem = { ...input, id: randomUUID(), availability: "available", createdAt: new Date().toISOString() };
    this.items.set(item.id, item);
    this.bus.publish("checkout.item_added", { itemId: item.id, name: item.name, category: item.category });
    return item;
  }

  borrow(itemId: string, borrowerId: string, borrowedAt: string, dueDate: string): Loan | undefined {
    const item = this.items.get(itemId);
    if (!item || item.availability !== "available") return undefined;
    const loan: Loan = { id: randomUUID(), itemId, borrowerId, borrowedAt, dueDate, status: "active" };
    this.loans.set(loan.id, loan);
    item.availability = "on_loan";
    this.bus.publish("checkout.borrowed", { loanId: loan.id, itemId, borrowerId, dueDate });
    return loan;
  }

  returnItem(loanId: string, asOf: string): Loan | undefined {
    const loan = this.loans.get(loanId);
    if (!loan || loan.status === "returned") return undefined;
    const item = this.items.get(loan.itemId)!;
    loan.status = "returned";
    loan.returnedAt = asOf;
    loan.lateDays = Math.max(0, Math.floor((new Date(asOf).getTime() - new Date(loan.dueDate).getTime()) / 86400000));
    if (item.availability === "on_loan") item.availability = "available";
    this.bus.publish("checkout.returned", { loanId, itemId: loan.itemId, lateDays: loan.lateDays });
    return loan;
  }

  /** Flag active loans past due as overdue. */
  flagOverdue(asOf: string): Loan[] {
    const cutoff = new Date(asOf).getTime();
    const overdue = Array.from(this.loans.values()).filter(l => l.status === "active" && new Date(l.dueDate).getTime() < cutoff);
    for (const l of overdue) l.status = "overdue";
    return overdue;
  }

  setAvailability(itemId: string, availability: ItemAvailability): CheckoutItem | undefined {
    const item = this.items.get(itemId);
    if (!item) return undefined;
    item.availability = availability;
    return item;
  }

  getItem(id: string): CheckoutItem | undefined { return this.items.get(id); }
  getLoan(id: string): Loan | undefined { return this.loans.get(id); }
  listItems(availability?: ItemAvailability): CheckoutItem[] {
    const all = Array.from(this.items.values());
    return availability ? all.filter(i => i.availability === availability) : all;
  }
  listLoans(borrowerId?: string, status?: LoanStatus): Loan[] {
    let all = Array.from(this.loans.values());
    if (borrowerId) all = all.filter(l => l.borrowerId === borrowerId);
    if (status) all = all.filter(l => l.status === status);
    return all;
  }

  summary(): CheckoutSummary {
    const items = Array.from(this.items.values());
    const loans = Array.from(this.loans.values());
    const byCategory: Record<string, number> = {};
    for (const i of items) { byCategory[i.category] = (byCategory[i.category] ?? 0) + 1; }
    return {
      totalItems: items.length,
      available: items.filter(i => i.availability === "available").length,
      onLoan: items.filter(i => i.availability === "on_loan").length,
      totalLoans: loans.length,
      activeLoans: loans.filter(l => l.status === "active").length,
      overdueLoans: loans.filter(l => l.status === "overdue").length,
      byCategory,
    };
  }
}
