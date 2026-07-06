/**
 * WholesaleManager — B2B wholesale ordering: quantity-tiered unit pricing per
 * SKU, wholesale account registration with credit terms, order placement with
 * automatic tier resolution, and account spend tracking.
 *
 * Events:
 *   - "wholesale.order_placed": { orderId, accountId, totalUsd }
 *   - "wholesale.order_fulfilled": { orderId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type WholesaleOrderStatus = "placed" | "fulfilled" | "cancelled";

export interface WholesaleTier {
  minQty: number;
  unitPriceUsd: number;
}

export interface WholesaleAccount {
  id: string;
  companyName: string;
  netTermsDays: number;
  totalSpendUsd: number;
}

export interface WholesaleOrder {
  id: string;
  accountId: string;
  sku: string;
  quantity: number;
  unitPriceUsd: number;
  totalUsd: number;
  status: WholesaleOrderStatus;
  placedAt: string;
}

export interface WholesaleSummary {
  totalAccounts: number;
  totalOrders: number;
  fulfilled: number;
  totalRevenueUsd: number;
  avgOrderValueUsd: number;
}

export class WholesaleManager {
  private tiers: Map<string, WholesaleTier[]> = new Map();
  private accounts: Map<string, WholesaleAccount> = new Map();
  private orders: Map<string, WholesaleOrder> = new Map();

  constructor(private readonly bus: EventBus) {}

  /** Set quantity tiers for a SKU; stored sorted by ascending minQty. */
  setTiers(sku: string, tiers: WholesaleTier[]): void {
    this.tiers.set(sku, [...tiers].sort((a, b) => a.minQty - b.minQty));
  }

  registerAccount(companyName: string, netTermsDays = 30): WholesaleAccount {
    const account: WholesaleAccount = { id: randomUUID(), companyName, netTermsDays, totalSpendUsd: 0 };
    this.accounts.set(account.id, account);
    return account;
  }

  /** Resolve the unit price for a quantity: highest tier whose minQty ≤ qty. */
  unitPriceFor(sku: string, quantity: number): number | undefined {
    const tiers = this.tiers.get(sku);
    if (!tiers || tiers.length === 0) return undefined;
    let price: number | undefined;
    for (const t of tiers) {
      if (quantity >= t.minQty) price = t.unitPriceUsd;
    }
    return price;
  }

  placeOrder(accountId: string, sku: string, quantity: number, placedAt: string): WholesaleOrder | undefined {
    const account = this.accounts.get(accountId);
    const unitPrice = this.unitPriceFor(sku, quantity);
    if (!account || unitPrice === undefined) return undefined;
    const order: WholesaleOrder = {
      id: randomUUID(),
      accountId,
      sku,
      quantity,
      unitPriceUsd: unitPrice,
      totalUsd: Math.round(unitPrice * quantity * 100) / 100,
      status: "placed",
      placedAt,
    };
    this.orders.set(order.id, order);
    account.totalSpendUsd = Math.round((account.totalSpendUsd + order.totalUsd) * 100) / 100;
    this.bus.publish("wholesale.order_placed", { orderId: order.id, accountId, totalUsd: order.totalUsd });
    return order;
  }

  fulfill(orderId: string): WholesaleOrder | undefined {
    const order = this.orders.get(orderId);
    if (!order || order.status !== "placed") return undefined;
    order.status = "fulfilled";
    this.bus.publish("wholesale.order_fulfilled", { orderId });
    return order;
  }

  cancel(orderId: string): WholesaleOrder | undefined {
    const order = this.orders.get(orderId);
    if (!order || order.status !== "placed") return undefined;
    order.status = "cancelled";
    const account = this.accounts.get(order.accountId);
    if (account) account.totalSpendUsd = Math.round((account.totalSpendUsd - order.totalUsd) * 100) / 100;
    return order;
  }

  getAccount(id: string): WholesaleAccount | undefined { return this.accounts.get(id); }
  getOrder(id: string): WholesaleOrder | undefined { return this.orders.get(id); }
  listOrders(status?: WholesaleOrderStatus): WholesaleOrder[] {
    const all = Array.from(this.orders.values());
    return status ? all.filter(o => o.status === status) : all;
  }

  summary(): WholesaleSummary {
    const orders = Array.from(this.orders.values()).filter(o => o.status !== "cancelled");
    const revenue = orders.reduce((s, o) => s + o.totalUsd, 0);
    return {
      totalAccounts: this.accounts.size,
      totalOrders: orders.length,
      fulfilled: orders.filter(o => o.status === "fulfilled").length,
      totalRevenueUsd: Math.round(revenue * 100) / 100,
      avgOrderValueUsd: orders.length > 0 ? Math.round((revenue / orders.length) * 100) / 100 : 0,
    };
  }
}
