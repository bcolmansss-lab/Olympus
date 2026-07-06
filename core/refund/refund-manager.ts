/**
 * RefundManager — refund request processing: full/partial refunds against an
 * original payment, approval workflow, reason tracking, and refund-rate
 * analytics (guards against over-refunding).
 *
 * Events:
 *   - "refund.requested": { refundId, paymentRef, amountUsd, reason }
 *   - "refund.approved": { refundId, amountUsd }
 *   - "refund.processed": { refundId, amountUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RefundReason = "defective" | "not_as_described" | "changed_mind" | "duplicate_charge" | "goodwill" | "cancellation";
export type RefundStatus = "requested" | "approved" | "processed" | "rejected";

export interface PaymentInfo {
  paymentRef: string;
  originalAmountUsd: number;
  refundedUsd: number;
}

export interface Refund {
  id: string;
  paymentRef: string;
  amountUsd: number;
  reason: RefundReason;
  status: RefundStatus;
  approvedBy?: string;
  requestedAt: string;
  processedAt?: string;
}

export interface RefundSummary {
  totalRefunds: number;
  pending: number;
  processed: number;
  totalRefundedUsd: number;
  byReason: Partial<Record<RefundReason, number>>;
}

export class RefundManager {
  private payments: Map<string, PaymentInfo> = new Map();
  private refunds: Map<string, Refund> = new Map();

  constructor(private readonly bus: EventBus) {}

  registerPayment(paymentRef: string, originalAmountUsd: number): PaymentInfo {
    const info: PaymentInfo = { paymentRef, originalAmountUsd, refundedUsd: 0 };
    this.payments.set(paymentRef, info);
    return info;
  }

  refundableRemaining(paymentRef: string): number {
    const p = this.payments.get(paymentRef);
    return p ? Math.round((p.originalAmountUsd - p.refundedUsd) * 100) / 100 : 0;
  }

  request(input: { paymentRef: string; amountUsd: number; reason: RefundReason; requestedAt: string }): Refund | undefined {
    const p = this.payments.get(input.paymentRef);
    if (!p || input.amountUsd <= 0 || input.amountUsd > this.refundableRemaining(input.paymentRef)) return undefined;
    const refund: Refund = { ...input, id: randomUUID(), status: "requested" };
    this.refunds.set(refund.id, refund);
    this.bus.publish("refund.requested", { refundId: refund.id, paymentRef: refund.paymentRef, amountUsd: refund.amountUsd, reason: refund.reason });
    return refund;
  }

  approve(refundId: string, approvedBy: string): Refund | undefined {
    const r = this.refunds.get(refundId);
    if (!r || r.status !== "requested") return undefined;
    r.status = "approved";
    r.approvedBy = approvedBy;
    this.bus.publish("refund.approved", { refundId, amountUsd: r.amountUsd });
    return r;
  }

  reject(refundId: string): Refund | undefined {
    const r = this.refunds.get(refundId);
    if (!r || r.status !== "requested") return undefined;
    r.status = "rejected";
    return r;
  }

  process(refundId: string, asOf: string): Refund | undefined {
    const r = this.refunds.get(refundId);
    if (!r || r.status !== "approved") return undefined;
    const p = this.payments.get(r.paymentRef);
    if (!p || r.amountUsd > this.refundableRemaining(r.paymentRef)) return undefined;
    r.status = "processed";
    r.processedAt = asOf;
    p.refundedUsd = Math.round((p.refundedUsd + r.amountUsd) * 100) / 100;
    this.bus.publish("refund.processed", { refundId, amountUsd: r.amountUsd });
    return r;
  }

  getRefund(id: string): Refund | undefined { return this.refunds.get(id); }
  listRefunds(status?: RefundStatus, paymentRef?: string): Refund[] {
    let all = Array.from(this.refunds.values());
    if (status) all = all.filter(r => r.status === status);
    if (paymentRef) all = all.filter(r => r.paymentRef === paymentRef);
    return all;
  }

  summary(): RefundSummary {
    const refunds = Array.from(this.refunds.values());
    const byReason: Partial<Record<RefundReason, number>> = {};
    for (const r of refunds) { byReason[r.reason] = (byReason[r.reason] ?? 0) + 1; }
    return {
      totalRefunds: refunds.length,
      pending: refunds.filter(r => r.status === "requested" || r.status === "approved").length,
      processed: refunds.filter(r => r.status === "processed").length,
      totalRefundedUsd: Math.round(refunds.filter(r => r.status === "processed").reduce((s, r) => s + r.amountUsd, 0) * 100) / 100,
      byReason,
    };
  }
}
