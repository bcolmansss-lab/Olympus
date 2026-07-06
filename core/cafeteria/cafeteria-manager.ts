/**
 * CafeteriaManager — workplace dining: daily menu publishing with item
 * inventory, employee meal-plan balances, order placement with balance and
 * stock checks, and consumption reporting.
 *
 * Events:
 *   - "cafeteria.menu_published": { date, itemCount }
 *   - "cafeteria.order_placed": { orderId, employeeId, totalUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export interface MenuItem {
  name: string;
  priceUsd: number;
  stock: number;
}

export interface CafeteriaOrder {
  id: string;
  employeeId: string;
  date: string;
  items: string[];
  totalUsd: number;
}

export interface CafeteriaSummary {
  menusPublished: number;
  totalOrders: number;
  totalRevenueUsd: number;
  avgOrderUsd: number;
  topItem?: string;
}

export class CafeteriaManager {
  private menus: Map<string, Map<string, MenuItem>> = new Map();
  private balances: Map<string, number> = new Map();
  private orders: Map<string, CafeteriaOrder> = new Map();
  private itemCounts: Map<string, number> = new Map();

  constructor(private readonly bus: EventBus) {}

  publishMenu(date: string, items: Array<{ name: string; priceUsd: number; stock: number }>): void {
    const menu = new Map<string, MenuItem>();
    for (const i of items) menu.set(i.name, { ...i });
    this.menus.set(date, menu);
    this.bus.publish("cafeteria.menu_published", { date, itemCount: items.length });
  }

  topUp(employeeId: string, amountUsd: number): number {
    const next = Math.round(((this.balances.get(employeeId) ?? 0) + amountUsd) * 100) / 100;
    this.balances.set(employeeId, next);
    return next;
  }

  balance(employeeId: string): number { return this.balances.get(employeeId) ?? 0; }

  /** Order items from a date's menu; requires stock and sufficient balance. */
  order(employeeId: string, date: string, itemNames: string[]): CafeteriaOrder | undefined {
    const menu = this.menus.get(date);
    if (!menu || itemNames.length === 0) return undefined;
    let total = 0;
    for (const name of itemNames) {
      const item = menu.get(name);
      if (!item || item.stock <= 0) return undefined;
      total += item.priceUsd;
    }
    total = Math.round(total * 100) / 100;
    if (this.balance(employeeId) < total) return undefined;
    for (const name of itemNames) {
      menu.get(name)!.stock -= 1;
      this.itemCounts.set(name, (this.itemCounts.get(name) ?? 0) + 1);
    }
    this.balances.set(employeeId, Math.round((this.balance(employeeId) - total) * 100) / 100);
    const order: CafeteriaOrder = { id: randomUUID(), employeeId, date, items: [...itemNames], totalUsd: total };
    this.orders.set(order.id, order);
    this.bus.publish("cafeteria.order_placed", { orderId: order.id, employeeId, totalUsd: total });
    return order;
  }

  remainingStock(date: string, itemName: string): number {
    return this.menus.get(date)?.get(itemName)?.stock ?? 0;
  }

  getOrder(id: string): CafeteriaOrder | undefined { return this.orders.get(id); }
  listOrders(date?: string): CafeteriaOrder[] {
    const all = Array.from(this.orders.values());
    return date ? all.filter(o => o.date === date) : all;
  }

  summary(): CafeteriaSummary {
    const orders = Array.from(this.orders.values());
    const revenue = orders.reduce((s, o) => s + o.totalUsd, 0);
    let topItem: string | undefined;
    let topCount = 0;
    for (const [name, count] of this.itemCounts) {
      if (count > topCount) { topCount = count; topItem = name; }
    }
    return {
      menusPublished: this.menus.size,
      totalOrders: orders.length,
      totalRevenueUsd: Math.round(revenue * 100) / 100,
      avgOrderUsd: orders.length > 0 ? Math.round((revenue / orders.length) * 100) / 100 : 0,
      topItem,
    };
  }
}
