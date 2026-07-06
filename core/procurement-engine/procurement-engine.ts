/**
 * ProcurementEngine — RFQ/RFP management, bid evaluation, purchase approvals,
 * preferred vendor tracking, and spend analytics.
 *
 * Events:
 *   - "procurement.rfq_issued": { rfqId, title, budget, dueDate }
 *   - "procurement.bid_awarded": { rfqId, vendorId, awardedAmountUsd }
 *   - "procurement.po_approved": { poId, vendorId, totalUsd, approvedBy }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RFQStatus = "draft" | "issued" | "evaluating" | "awarded" | "cancelled";
export type BidStatus = "submitted" | "under_review" | "shortlisted" | "awarded" | "rejected";
export type POApprovalStatus = "pending" | "approved" | "rejected" | "fulfilled";

export interface RFQ {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  budgetUsd: number;
  status: RFQStatus;
  dueDate: string;
  bidCount: number;
  awardedVendorId?: string;
  awardedAmountUsd?: number;
  createdAt: string;
}

export interface Bid {
  id: string;
  rfqId: string;
  vendorId: string;
  vendorName: string;
  amountUsd: number;
  status: BidStatus;
  technicalScore?: number;
  commercialScore?: number;
  notes?: string;
  submittedAt: string;
}

export interface ProcurementPO {
  id: string;
  rfqId?: string;
  vendorId: string;
  lineItems: Array<{ description: string; quantity: number; unitPriceUsd: number }>;
  totalUsd: number;
  approvalStatus: POApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

export interface ProcurementSummary {
  totalRFQs: number;
  activeRFQs: number;
  totalBids: number;
  totalPOs: number;
  approvedPOsValueUsd: number;
  avgBidsPerRFQ: number;
}

export class ProcurementEngine {
  private rfqs: Map<string, RFQ> = new Map();
  private bids: Map<string, Bid> = new Map();
  private pos: Map<string, ProcurementPO> = new Map();

  constructor(private readonly bus: EventBus) {}

  issueRFQ(input: Omit<RFQ, "id" | "bidCount" | "createdAt"> & { id?: string }): RFQ {
    const rfq: RFQ = { ...input, id: input.id ?? randomUUID(), bidCount: 0, createdAt: new Date().toISOString() };
    this.rfqs.set(rfq.id, rfq);
    this.bus.publish("procurement.rfq_issued", { rfqId: rfq.id, title: rfq.title, budget: rfq.budgetUsd, dueDate: rfq.dueDate });
    return rfq;
  }

  submitBid(input: Omit<Bid, "id"> & { id?: string }): Bid | undefined {
    const rfq = this.rfqs.get(input.rfqId);
    if (!rfq) return undefined;
    const bid: Bid = { ...input, id: input.id ?? randomUUID() };
    this.bids.set(bid.id, bid);
    rfq.bidCount++;
    return bid;
  }

  awardBid(rfqId: string, bidId: string): RFQ | undefined {
    const rfq = this.rfqs.get(rfqId);
    const bid = this.bids.get(bidId);
    if (!rfq || !bid) return undefined;
    rfq.status = "awarded";
    rfq.awardedVendorId = bid.vendorId;
    rfq.awardedAmountUsd = bid.amountUsd;
    bid.status = "awarded";
    this.bus.publish("procurement.bid_awarded", { rfqId, vendorId: bid.vendorId, awardedAmountUsd: bid.amountUsd });
    return rfq;
  }

  createPO(input: Omit<ProcurementPO, "id" | "createdAt"> & { id?: string }): ProcurementPO {
    const po: ProcurementPO = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.pos.set(po.id, po);
    return po;
  }

  approvePO(poId: string, approvedBy: string): ProcurementPO | undefined {
    const po = this.pos.get(poId);
    if (!po) return undefined;
    po.approvalStatus = "approved";
    po.approvedBy = approvedBy;
    po.approvedAt = new Date().toISOString();
    this.bus.publish("procurement.po_approved", { poId, vendorId: po.vendorId, totalUsd: po.totalUsd, approvedBy });
    return po;
  }

  getRFQ(id: string): RFQ | undefined { return this.rfqs.get(id); }
  listRFQs(status?: RFQStatus): RFQ[] {
    const all = Array.from(this.rfqs.values());
    return status ? all.filter(r => r.status === status) : all;
  }
  listBids(rfqId?: string): Bid[] {
    const all = Array.from(this.bids.values());
    return rfqId ? all.filter(b => b.rfqId === rfqId) : all;
  }
  listPOs(status?: POApprovalStatus): ProcurementPO[] {
    const all = Array.from(this.pos.values());
    return status ? all.filter(p => p.approvalStatus === status) : all;
  }

  summary(): ProcurementSummary {
    const rfqs = Array.from(this.rfqs.values());
    const active = rfqs.filter(r => r.status === "issued" || r.status === "evaluating");
    const bids = Array.from(this.bids.values());
    const approvedPOs = Array.from(this.pos.values()).filter(p => p.approvalStatus === "approved");
    return {
      totalRFQs: rfqs.length,
      activeRFQs: active.length,
      totalBids: bids.length,
      totalPOs: this.pos.size,
      approvedPOsValueUsd: approvedPOs.reduce((s, p) => s + p.totalUsd, 0),
      avgBidsPerRFQ: rfqs.length > 0 ? Math.round((bids.length / rfqs.length) * 10) / 10 : 0,
    };
  }
}
