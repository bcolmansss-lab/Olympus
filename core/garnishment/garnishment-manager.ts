/**
 * GarnishmentManager — payroll garnishment orders: court/agency-ordered wage
 * deductions with priority, per-period withholding calculation against
 * disposable income caps, and remittance tracking.
 *
 * Events:
 *   - "garnishment.registered": { orderId, employeeId, type, amountOrPct }
 *   - "garnishment.withheld": { orderId, period, amountUsd }
 *   - "garnishment.completed": { orderId, totalWithheldUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type GarnishmentType = "child_support" | "tax_levy" | "creditor" | "student_loan" | "bankruptcy";
export type GarnishmentStatus = "active" | "completed" | "released";

export interface GarnishmentOrder {
  id: string;
  employeeId: string;
  type: GarnishmentType;
  caseNumber: string;
  fixedAmountUsd?: number; // per period
  percentOfDisposable?: number; // 0-100
  maxPercentOfDisposable: number; // legal cap
  totalOwedUsd?: number; // optional cap on lifetime withholding
  totalWithheldUsd: number;
  priority: number; // lower = higher priority
  status: GarnishmentStatus;
  registeredAt: string;
}

export interface GarnishmentSummary {
  totalOrders: number;
  active: number;
  completed: number;
  totalWithheldUsd: number;
  byType: Partial<Record<GarnishmentType, number>>;
}

export class GarnishmentManager {
  private orders: Map<string, GarnishmentOrder> = new Map();

  constructor(private readonly bus: EventBus) {}

  register(input: Omit<GarnishmentOrder, "id" | "totalWithheldUsd" | "status" | "registeredAt"> & { id?: string }): GarnishmentOrder {
    const order: GarnishmentOrder = { ...input, id: input.id ?? randomUUID(), totalWithheldUsd: 0, status: "active", registeredAt: new Date().toISOString() };
    this.orders.set(order.id, order);
    this.bus.publish("garnishment.registered", { orderId: order.id, employeeId: order.employeeId, type: order.type, amountOrPct: order.fixedAmountUsd ?? order.percentOfDisposable });
    return order;
  }

  /** Compute the withholding for a pay period given disposable income. */
  computeWithholding(orderId: string, disposableIncomeUsd: number): number {
    const order = this.orders.get(orderId);
    if (!order || order.status !== "active") return 0;
    let amount = order.fixedAmountUsd ?? (order.percentOfDisposable ? disposableIncomeUsd * (order.percentOfDisposable / 100) : 0);
    const cap = disposableIncomeUsd * (order.maxPercentOfDisposable / 100);
    amount = Math.min(amount, cap);
    if (order.totalOwedUsd !== undefined) {
      amount = Math.min(amount, order.totalOwedUsd - order.totalWithheldUsd);
    }
    return Math.max(0, Math.round(amount * 100) / 100);
  }

  withhold(orderId: string, period: string, disposableIncomeUsd: number): number {
    const order = this.orders.get(orderId);
    if (!order || order.status !== "active") return 0;
    const amount = this.computeWithholding(orderId, disposableIncomeUsd);
    if (amount <= 0) return 0;
    order.totalWithheldUsd = Math.round((order.totalWithheldUsd + amount) * 100) / 100;
    this.bus.publish("garnishment.withheld", { orderId, period, amountUsd: amount });
    if (order.totalOwedUsd !== undefined && order.totalWithheldUsd >= order.totalOwedUsd) {
      order.status = "completed";
      this.bus.publish("garnishment.completed", { orderId, totalWithheldUsd: order.totalWithheldUsd });
    }
    return amount;
  }

  release(orderId: string): GarnishmentOrder | undefined {
    const order = this.orders.get(orderId);
    if (!order || order.status === "completed") return undefined;
    order.status = "released";
    return order;
  }

  getOrder(id: string): GarnishmentOrder | undefined { return this.orders.get(id); }
  /** Active orders for an employee, highest priority first. */
  ordersForEmployee(employeeId: string): GarnishmentOrder[] {
    return Array.from(this.orders.values())
      .filter(o => o.employeeId === employeeId && o.status === "active")
      .sort((a, b) => a.priority - b.priority);
  }
  listOrders(status?: GarnishmentStatus, type?: GarnishmentType): GarnishmentOrder[] {
    let all = Array.from(this.orders.values());
    if (status) all = all.filter(o => o.status === status);
    if (type) all = all.filter(o => o.type === type);
    return all;
  }

  summary(): GarnishmentSummary {
    const orders = Array.from(this.orders.values());
    const byType: Partial<Record<GarnishmentType, number>> = {};
    for (const o of orders) { byType[o.type] = (byType[o.type] ?? 0) + 1; }
    return {
      totalOrders: orders.length,
      active: orders.filter(o => o.status === "active").length,
      completed: orders.filter(o => o.status === "completed").length,
      totalWithheldUsd: Math.round(orders.reduce((s, o) => s + o.totalWithheldUsd, 0) * 100) / 100,
      byType,
    };
  }
}
