/**
 * PaymentGatewayManager — card payment lifecycle: authorization, capture (full
 * or partial), void, and settlement batching, with authorization-expiry and
 * capture-rate analytics.
 *
 * Events:
 *   - "payment.authorized": { paymentId, amountUsd, method }
 *   - "payment.captured": { paymentId, amountUsd }
 *   - "payment.settled": { batchId, count, totalUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PaymentMethod = "card" | "ach" | "wallet" | "bank_transfer";
export type PaymentStatus = "authorized" | "captured" | "partially_captured" | "voided" | "settled" | "expired";

export interface Payment {
  id: string;
  orderRef: string;
  method: PaymentMethod;
  authorizedUsd: number;
  capturedUsd: number;
  status: PaymentStatus;
  authorizedAt: string;
  authExpiresAt: string;
  settledBatchId?: string;
}

export interface PaymentGatewaySummary {
  totalPayments: number;
  authorized: number;
  captured: number;
  settled: number;
  totalCapturedUsd: number;
  captureRatePct: number;
}

export class PaymentGatewayManager {
  private payments: Map<string, Payment> = new Map();
  private authHoldDays: number;

  constructor(private readonly bus: EventBus, authHoldDays = 7) {
    this.authHoldDays = authHoldDays;
  }

  authorize(input: { orderRef: string; method: PaymentMethod; amountUsd: number; authorizedAt: string }): Payment | undefined {
    if (input.amountUsd <= 0) return undefined;
    const exp = new Date(input.authorizedAt);
    exp.setUTCDate(exp.getUTCDate() + this.authHoldDays);
    const payment: Payment = {
      id: randomUUID(),
      orderRef: input.orderRef,
      method: input.method,
      authorizedUsd: input.amountUsd,
      capturedUsd: 0,
      status: "authorized",
      authorizedAt: input.authorizedAt,
      authExpiresAt: exp.toISOString(),
    };
    this.payments.set(payment.id, payment);
    this.bus.publish("payment.authorized", { paymentId: payment.id, amountUsd: payment.authorizedUsd, method: payment.method });
    return payment;
  }

  capture(paymentId: string, amountUsd: number): Payment | undefined {
    const p = this.payments.get(paymentId);
    if (!p || (p.status !== "authorized" && p.status !== "partially_captured")) return undefined;
    const remaining = p.authorizedUsd - p.capturedUsd;
    if (amountUsd <= 0 || amountUsd > remaining) return undefined;
    p.capturedUsd = Math.round((p.capturedUsd + amountUsd) * 100) / 100;
    p.status = p.capturedUsd >= p.authorizedUsd ? "captured" : "partially_captured";
    this.bus.publish("payment.captured", { paymentId, amountUsd });
    return p;
  }

  void(paymentId: string): Payment | undefined {
    const p = this.payments.get(paymentId);
    if (!p || p.status !== "authorized") return undefined;
    p.status = "voided";
    return p;
  }

  /** Expire authorizations past their hold window (no capture). */
  expireAuthorizations(asOf: string): Payment[] {
    const cutoff = new Date(asOf).getTime();
    const expired = Array.from(this.payments.values()).filter(p => p.status === "authorized" && new Date(p.authExpiresAt).getTime() < cutoff);
    for (const p of expired) p.status = "expired";
    return expired;
  }

  /** Settle all captured payments into a batch. */
  settle(asOf: string): { batchId: string; count: number; totalUsd: number } {
    const batchId = randomUUID();
    const toSettle = Array.from(this.payments.values()).filter(p => (p.status === "captured" || p.status === "partially_captured") && p.capturedUsd > 0 && !p.settledBatchId);
    let total = 0;
    for (const p of toSettle) {
      p.status = "settled";
      p.settledBatchId = batchId;
      total += p.capturedUsd;
    }
    total = Math.round(total * 100) / 100;
    this.bus.publish("payment.settled", { batchId, count: toSettle.length, totalUsd: total });
    return { batchId, count: toSettle.length, totalUsd: total };
  }

  getPayment(id: string): Payment | undefined { return this.payments.get(id); }
  listPayments(status?: PaymentStatus): Payment[] {
    const all = Array.from(this.payments.values());
    return status ? all.filter(p => p.status === status) : all;
  }

  summary(): PaymentGatewaySummary {
    const payments = Array.from(this.payments.values());
    const authorizedTotal = payments.reduce((s, p) => s + p.authorizedUsd, 0);
    const capturedTotal = payments.reduce((s, p) => s + p.capturedUsd, 0);
    return {
      totalPayments: payments.length,
      authorized: payments.filter(p => p.status === "authorized").length,
      captured: payments.filter(p => p.status === "captured" || p.status === "partially_captured").length,
      settled: payments.filter(p => p.status === "settled").length,
      totalCapturedUsd: Math.round(capturedTotal * 100) / 100,
      captureRatePct: authorizedTotal > 0 ? Math.round((capturedTotal / authorizedTotal) * 100) : 0,
    };
  }
}
