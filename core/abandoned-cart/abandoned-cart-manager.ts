/**
 * AbandonedCartManager — shopping cart abandonment recovery: cart tracking,
 * abandonment detection after inactivity, recovery-email sequencing, and
 * recovered-revenue attribution.
 *
 * Events:
 *   - "cart.abandoned": { cartId, customerId, valueUsd }
 *   - "cart.recovery_sent": { cartId, attempt }
 *   - "cart.recovered": { cartId, valueUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CartStatus = "active" | "abandoned" | "recovered" | "converted" | "lost";

export interface CartLine {
  sku: string;
  quantity: number;
  unitPriceUsd: number;
}

export interface Cart {
  id: string;
  customerId: string;
  lines: CartLine[];
  status: CartStatus;
  recoveryAttempts: number;
  lastActivityAt: string;
  createdAt: string;
  recoveredAt?: string;
}

export interface AbandonedCartSummary {
  totalCarts: number;
  abandoned: number;
  recovered: number;
  abandonmentRatePct: number;
  recoveryRatePct: number;
  recoveredRevenueUsd: number;
  abandonedValueUsd: number;
}

export class AbandonedCartManager {
  private carts: Map<string, Cart> = new Map();
  private inactivityMinutes: number;

  constructor(private readonly bus: EventBus, inactivityMinutes = 60) {
    this.inactivityMinutes = inactivityMinutes;
  }

  createCart(customerId: string, lines: CartLine[], asOf: string): Cart {
    const cart: Cart = { id: randomUUID(), customerId, lines, status: "active", recoveryAttempts: 0, lastActivityAt: asOf, createdAt: asOf };
    this.carts.set(cart.id, cart);
    return cart;
  }

  cartValue(cartId: string): number {
    const cart = this.carts.get(cartId);
    if (!cart) return 0;
    return Math.round(cart.lines.reduce((s, l) => s + l.quantity * l.unitPriceUsd, 0) * 100) / 100;
  }

  touch(cartId: string, asOf: string): Cart | undefined {
    const cart = this.carts.get(cartId);
    if (!cart || cart.status === "converted" || cart.status === "lost") return undefined;
    cart.lastActivityAt = asOf;
    if (cart.status === "abandoned") cart.status = "active";
    return cart;
  }

  convert(cartId: string): Cart | undefined {
    const cart = this.carts.get(cartId);
    if (!cart || cart.status === "lost") return undefined;
    const wasAbandoned = cart.status === "abandoned" || cart.recoveryAttempts > 0;
    cart.status = wasAbandoned ? "recovered" : "converted";
    cart.recoveredAt = cart.lastActivityAt;
    if (cart.status === "recovered") this.bus.publish("cart.recovered", { cartId, valueUsd: this.cartValue(cartId) });
    return cart;
  }

  /** Mark carts inactive beyond the threshold as abandoned. */
  detectAbandoned(asOf: string): Cart[] {
    const now = new Date(asOf).getTime();
    const abandoned: Cart[] = [];
    for (const cart of this.carts.values()) {
      if (cart.status !== "active") continue;
      const idleMin = (now - new Date(cart.lastActivityAt).getTime()) / 60000;
      if (idleMin >= this.inactivityMinutes) {
        cart.status = "abandoned";
        this.bus.publish("cart.abandoned", { cartId: cart.id, customerId: cart.customerId, valueUsd: this.cartValue(cart.id) });
        abandoned.push(cart);
      }
    }
    return abandoned;
  }

  sendRecovery(cartId: string): Cart | undefined {
    const cart = this.carts.get(cartId);
    if (!cart || cart.status !== "abandoned") return undefined;
    cart.recoveryAttempts += 1;
    this.bus.publish("cart.recovery_sent", { cartId, attempt: cart.recoveryAttempts });
    return cart;
  }

  markLost(cartId: string): Cart | undefined {
    const cart = this.carts.get(cartId);
    if (!cart || cart.status === "converted" || cart.status === "recovered") return undefined;
    cart.status = "lost";
    return cart;
  }

  getCart(id: string): Cart | undefined { return this.carts.get(id); }
  listCarts(status?: CartStatus): Cart[] {
    const all = Array.from(this.carts.values());
    return status ? all.filter(c => c.status === status) : all;
  }

  summary(): AbandonedCartSummary {
    const carts = Array.from(this.carts.values());
    const everAbandoned = carts.filter(c => c.status === "abandoned" || c.status === "recovered" || (c.status === "lost" && c.recoveryAttempts > 0));
    const recovered = carts.filter(c => c.status === "recovered");
    const abandonedNow = carts.filter(c => c.status === "abandoned");
    return {
      totalCarts: carts.length,
      abandoned: abandonedNow.length,
      recovered: recovered.length,
      abandonmentRatePct: carts.length > 0 ? Math.round((everAbandoned.length / carts.length) * 100) : 0,
      recoveryRatePct: everAbandoned.length > 0 ? Math.round((recovered.length / everAbandoned.length) * 100) : 0,
      recoveredRevenueUsd: Math.round(recovered.reduce((s, c) => s + this.cartValue(c.id), 0) * 100) / 100,
      abandonedValueUsd: Math.round(abandonedNow.reduce((s, c) => s + this.cartValue(c.id), 0) * 100) / 100,
    };
  }
}
