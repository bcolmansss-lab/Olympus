/**
 * ReturnsPortalManager — e-commerce self-service returns: eligibility-checked
 * return requests within a return window, label issuance, receipt inspection,
 * and refund-or-exchange disposition.
 *
 * Events:
 *   - "returnsportal.requested": { returnId, orderRef, reason }
 *   - "returnsportal.label_issued": { returnId, trackingNumber }
 *   - "returnsportal.dispositioned": { returnId, disposition, refundUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ReturnReason = "wrong_size" | "damaged" | "not_as_described" | "changed_mind" | "wrong_item";
export type ReturnStatus = "requested" | "label_issued" | "in_transit" | "received" | "dispositioned" | "rejected";
export type Disposition = "refund" | "exchange" | "store_credit" | "reject";

export interface ReturnRequest {
  id: string;
  orderRef: string;
  customerId: string;
  sku: string;
  reason: ReturnReason;
  itemPriceUsd: number;
  status: ReturnStatus;
  trackingNumber?: string;
  disposition?: Disposition;
  refundUsd?: number;
  requestedAt: string;
  dispositionedAt?: string;
}

export interface ReturnsPortalSummary {
  totalReturns: number;
  open: number;
  dispositioned: number;
  totalRefundedUsd: number;
  returnRateByReason: Partial<Record<ReturnReason, number>>;
}

export class ReturnsPortalManager {
  private returns: Map<string, ReturnRequest> = new Map();
  private returnWindowDays: number;

  constructor(private readonly bus: EventBus, returnWindowDays = 30) {
    this.returnWindowDays = returnWindowDays;
  }

  /** Request a return; rejected if outside the return window from purchase date. */
  request(input: { orderRef: string; customerId: string; sku: string; reason: ReturnReason; itemPriceUsd: number; purchasedAt: string; requestedAt: string }): ReturnRequest | undefined {
    const daysSince = (new Date(input.requestedAt).getTime() - new Date(input.purchasedAt).getTime()) / 86400000;
    if (daysSince > this.returnWindowDays || daysSince < 0) return undefined;
    const ret: ReturnRequest = {
      id: randomUUID(),
      orderRef: input.orderRef,
      customerId: input.customerId,
      sku: input.sku,
      reason: input.reason,
      itemPriceUsd: input.itemPriceUsd,
      status: "requested",
      requestedAt: input.requestedAt,
    };
    this.returns.set(ret.id, ret);
    this.bus.publish("returnsportal.requested", { returnId: ret.id, orderRef: ret.orderRef, reason: ret.reason });
    return ret;
  }

  issueLabel(returnId: string, trackingNumber: string): ReturnRequest | undefined {
    const ret = this.returns.get(returnId);
    if (!ret || ret.status !== "requested") return undefined;
    ret.status = "label_issued";
    ret.trackingNumber = trackingNumber;
    this.bus.publish("returnsportal.label_issued", { returnId, trackingNumber });
    return ret;
  }

  markInTransit(returnId: string): ReturnRequest | undefined {
    const ret = this.returns.get(returnId);
    if (!ret || ret.status !== "label_issued") return undefined;
    ret.status = "in_transit";
    return ret;
  }

  markReceived(returnId: string): ReturnRequest | undefined {
    const ret = this.returns.get(returnId);
    if (!ret || (ret.status !== "in_transit" && ret.status !== "label_issued")) return undefined;
    ret.status = "received";
    return ret;
  }

  disposition(returnId: string, disposition: Disposition, asOf: string): ReturnRequest | undefined {
    const ret = this.returns.get(returnId);
    if (!ret || ret.status !== "received") return undefined;
    ret.status = disposition === "reject" ? "rejected" : "dispositioned";
    ret.disposition = disposition;
    ret.refundUsd = disposition === "refund" || disposition === "store_credit" ? ret.itemPriceUsd : 0;
    ret.dispositionedAt = asOf;
    this.bus.publish("returnsportal.dispositioned", { returnId, disposition, refundUsd: ret.refundUsd });
    return ret;
  }

  getReturn(id: string): ReturnRequest | undefined { return this.returns.get(id); }
  listReturns(status?: ReturnStatus, reason?: ReturnReason): ReturnRequest[] {
    let all = Array.from(this.returns.values());
    if (status) all = all.filter(r => r.status === status);
    if (reason) all = all.filter(r => r.reason === reason);
    return all;
  }

  summary(): ReturnsPortalSummary {
    const returns = Array.from(this.returns.values());
    const byReason: Partial<Record<ReturnReason, number>> = {};
    for (const r of returns) { byReason[r.reason] = (byReason[r.reason] ?? 0) + 1; }
    return {
      totalReturns: returns.length,
      open: returns.filter(r => r.status !== "dispositioned" && r.status !== "rejected").length,
      dispositioned: returns.filter(r => r.status === "dispositioned").length,
      totalRefundedUsd: Math.round(returns.reduce((s, r) => s + (r.refundUsd ?? 0), 0) * 100) / 100,
      returnRateByReason: byReason,
    };
  }
}
