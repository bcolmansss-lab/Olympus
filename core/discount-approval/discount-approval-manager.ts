/**
 * DiscountApprovalManager — deal discount governance: tiered approval routing
 * by discount depth, request lifecycle, and auto-approval below threshold.
 *
 * Events:
 *   - "discount.requested": { requestId, dealId, discountPct, requiredApprover }
 *   - "discount.auto_approved": { requestId, discountPct }
 *   - "discount.decided": { requestId, approved, approverId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ApproverTier = "rep" | "manager" | "director" | "vp" | "ceo";
export type RequestStatus = "auto_approved" | "pending" | "approved" | "rejected";

export interface ApprovalTier {
  maxDiscountPct: number;
  approver: ApproverTier;
}

export interface DiscountRequest {
  id: string;
  dealId: string;
  listPriceUsd: number;
  discountPct: number;
  requiredApprover: ApproverTier;
  status: RequestStatus;
  decidedBy?: string;
  justification: string;
  createdAt: string;
  decidedAt?: string;
}

export interface DiscountApprovalSummary {
  totalRequests: number;
  autoApproved: number;
  pending: number;
  approved: number;
  rejected: number;
  avgDiscountPct: number;
}

/** Default escalation ladder (ascending discount depth). */
const DEFAULT_TIERS: ApprovalTier[] = [
  { maxDiscountPct: 10, approver: "rep" },
  { maxDiscountPct: 20, approver: "manager" },
  { maxDiscountPct: 30, approver: "director" },
  { maxDiscountPct: 40, approver: "vp" },
  { maxDiscountPct: 100, approver: "ceo" },
];

export class DiscountApprovalManager {
  private requests: Map<string, DiscountRequest> = new Map();
  private tiers: ApprovalTier[];
  private autoApproveBelowPct: number;

  constructor(private readonly bus: EventBus, tiers: ApprovalTier[] = DEFAULT_TIERS, autoApproveBelowPct = 10) {
    this.tiers = [...tiers].sort((a, b) => a.maxDiscountPct - b.maxDiscountPct);
    this.autoApproveBelowPct = autoApproveBelowPct;
  }

  private approverFor(discountPct: number): ApproverTier {
    for (const tier of this.tiers) {
      if (discountPct <= tier.maxDiscountPct) return tier.approver;
    }
    return this.tiers[this.tiers.length - 1]!.approver;
  }

  request(input: { dealId: string; listPriceUsd: number; discountPct: number; justification: string }): DiscountRequest {
    const requiredApprover = this.approverFor(input.discountPct);
    const autoApprove = input.discountPct < this.autoApproveBelowPct;
    const req: DiscountRequest = {
      id: randomUUID(),
      dealId: input.dealId,
      listPriceUsd: input.listPriceUsd,
      discountPct: input.discountPct,
      requiredApprover,
      status: autoApprove ? "auto_approved" : "pending",
      justification: input.justification,
      createdAt: new Date().toISOString(),
    };
    this.requests.set(req.id, req);
    if (autoApprove) {
      this.bus.publish("discount.auto_approved", { requestId: req.id, discountPct: req.discountPct });
    } else {
      this.bus.publish("discount.requested", { requestId: req.id, dealId: req.dealId, discountPct: req.discountPct, requiredApprover });
    }
    return req;
  }

  decide(requestId: string, approverId: string, approved: boolean): DiscountRequest | undefined {
    const req = this.requests.get(requestId);
    if (!req || req.status !== "pending") return undefined;
    req.status = approved ? "approved" : "rejected";
    req.decidedBy = approverId;
    req.decidedAt = new Date().toISOString();
    this.bus.publish("discount.decided", { requestId, approved, approverId });
    return req;
  }

  netPriceUsd(requestId: string): number {
    const req = this.requests.get(requestId);
    if (!req) return 0;
    return Math.round(req.listPriceUsd * (1 - req.discountPct / 100) * 100) / 100;
  }

  getRequest(id: string): DiscountRequest | undefined { return this.requests.get(id); }
  listRequests(status?: RequestStatus): DiscountRequest[] {
    const all = Array.from(this.requests.values());
    return status ? all.filter(r => r.status === status) : all;
  }

  summary(): DiscountApprovalSummary {
    const requests = Array.from(this.requests.values());
    return {
      totalRequests: requests.length,
      autoApproved: requests.filter(r => r.status === "auto_approved").length,
      pending: requests.filter(r => r.status === "pending").length,
      approved: requests.filter(r => r.status === "approved").length,
      rejected: requests.filter(r => r.status === "rejected").length,
      avgDiscountPct: requests.length > 0 ? Math.round(requests.reduce((s, r) => s + r.discountPct, 0) / requests.length) : 0,
    };
  }
}
