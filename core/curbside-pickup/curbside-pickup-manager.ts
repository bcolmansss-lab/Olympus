/**
 * CurbsidePickupManager — buy-online-pickup (BOPIS/curbside): order staging,
 * customer arrival check-in with vehicle details, hand-off confirmation, and
 * wait-time analytics.
 *
 * Events:
 *   - "curbside.order_ready": { orderId, storeId }
 *   - "curbside.customer_arrived": { orderId, spot }
 *   - "curbside.completed": { orderId, waitMinutes }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PickupStatus = "preparing" | "ready" | "customer_arrived" | "completed" | "cancelled";

export interface PickupOrder {
  id: string;
  orderRef: string;
  storeId: string;
  customerId: string;
  status: PickupStatus;
  vehicleDescription?: string;
  spot?: string;
  readyAt?: string;
  arrivedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface CurbsideSummary {
  totalOrders: number;
  awaitingPickup: number;
  completed: number;
  avgWaitMinutes: number;
  cancelled: number;
}

export class CurbsidePickupManager {
  private orders: Map<string, PickupOrder> = new Map();

  constructor(private readonly bus: EventBus) {}

  createOrder(orderRef: string, storeId: string, customerId: string): PickupOrder {
    const order: PickupOrder = { id: randomUUID(), orderRef, storeId, customerId, status: "preparing", createdAt: new Date().toISOString() };
    this.orders.set(order.id, order);
    return order;
  }

  markReady(orderId: string, asOf: string): PickupOrder | undefined {
    const order = this.orders.get(orderId);
    if (!order || order.status !== "preparing") return undefined;
    order.status = "ready";
    order.readyAt = asOf;
    this.bus.publish("curbside.order_ready", { orderId, storeId: order.storeId });
    return order;
  }

  checkIn(orderId: string, vehicleDescription: string, spot: string, asOf: string): PickupOrder | undefined {
    const order = this.orders.get(orderId);
    if (!order || order.status !== "ready") return undefined;
    order.status = "customer_arrived";
    order.vehicleDescription = vehicleDescription;
    order.spot = spot;
    order.arrivedAt = asOf;
    this.bus.publish("curbside.customer_arrived", { orderId, spot });
    return order;
  }

  complete(orderId: string, asOf: string): PickupOrder | undefined {
    const order = this.orders.get(orderId);
    if (!order || order.status !== "customer_arrived") return undefined;
    order.status = "completed";
    order.completedAt = asOf;
    const waitMinutes = order.arrivedAt ? Math.round((new Date(asOf).getTime() - new Date(order.arrivedAt).getTime()) / 60000) : 0;
    this.bus.publish("curbside.completed", { orderId, waitMinutes });
    return order;
  }

  cancel(orderId: string): PickupOrder | undefined {
    const order = this.orders.get(orderId);
    if (!order || order.status === "completed") return undefined;
    order.status = "cancelled";
    return order;
  }

  getOrder(id: string): PickupOrder | undefined { return this.orders.get(id); }
  listOrders(status?: PickupStatus, storeId?: string): PickupOrder[] {
    let all = Array.from(this.orders.values());
    if (status) all = all.filter(o => o.status === status);
    if (storeId) all = all.filter(o => o.storeId === storeId);
    return all;
  }

  summary(): CurbsideSummary {
    const orders = Array.from(this.orders.values());
    const completed = orders.filter(o => o.status === "completed" && o.arrivedAt && o.completedAt);
    const waits = completed.map(o => Math.round((new Date(o.completedAt!).getTime() - new Date(o.arrivedAt!).getTime()) / 60000));
    return {
      totalOrders: orders.length,
      awaitingPickup: orders.filter(o => o.status === "ready" || o.status === "customer_arrived").length,
      completed: completed.length,
      avgWaitMinutes: waits.length > 0 ? Math.round(waits.reduce((s, w) => s + w, 0) / waits.length) : 0,
      cancelled: orders.filter(o => o.status === "cancelled").length,
    };
  }
}
