/**
 * AssetDisposalManager — end-of-life asset disposal: disposal requests,
 * approval, method tracking (sell/recycle/donate/scrap), proceeds and
 * gain/loss vs book value.
 *
 * Events:
 *   - "assetdisposal.requested": { disposalId, assetTag, bookValueUsd, method }
 *   - "assetdisposal.approved": { disposalId, approvedBy }
 *   - "assetdisposal.completed": { disposalId, proceedsUsd, gainLossUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DisposalMethod = "sale" | "recycle" | "donation" | "scrap" | "trade_in";
export type DisposalStatus = "requested" | "approved" | "rejected" | "completed";

export interface DisposalRequest {
  id: string;
  assetTag: string;
  assetName: string;
  method: DisposalMethod;
  bookValueUsd: number;
  status: DisposalStatus;
  reason: string;
  requestedBy: string;
  approvedBy?: string;
  proceedsUsd?: number;
  gainLossUsd?: number;
  requestedAt: string;
  completedAt?: string;
}

export interface DisposalSummary {
  totalDisposals: number;
  pending: number;
  completed: number;
  totalProceedsUsd: number;
  totalGainLossUsd: number;
  byMethod: Partial<Record<DisposalMethod, number>>;
}

export class AssetDisposalManager {
  private disposals: Map<string, DisposalRequest> = new Map();

  constructor(private readonly bus: EventBus) {}

  request(input: { assetTag: string; assetName: string; method: DisposalMethod; bookValueUsd: number; reason: string; requestedBy: string }): DisposalRequest {
    const disposal: DisposalRequest = { ...input, id: randomUUID(), status: "requested", requestedAt: new Date().toISOString() };
    this.disposals.set(disposal.id, disposal);
    this.bus.publish("assetdisposal.requested", { disposalId: disposal.id, assetTag: disposal.assetTag, bookValueUsd: disposal.bookValueUsd, method: disposal.method });
    return disposal;
  }

  approve(disposalId: string, approvedBy: string): DisposalRequest | undefined {
    const d = this.disposals.get(disposalId);
    if (!d || d.status !== "requested") return undefined;
    d.status = "approved";
    d.approvedBy = approvedBy;
    this.bus.publish("assetdisposal.approved", { disposalId, approvedBy });
    return d;
  }

  reject(disposalId: string, approvedBy: string): DisposalRequest | undefined {
    const d = this.disposals.get(disposalId);
    if (!d || d.status !== "requested") return undefined;
    d.status = "rejected";
    d.approvedBy = approvedBy;
    return d;
  }

  complete(disposalId: string, proceedsUsd: number, asOf: string): DisposalRequest | undefined {
    const d = this.disposals.get(disposalId);
    if (!d || d.status !== "approved") return undefined;
    d.status = "completed";
    d.proceedsUsd = proceedsUsd;
    d.gainLossUsd = Math.round((proceedsUsd - d.bookValueUsd) * 100) / 100;
    d.completedAt = asOf;
    this.bus.publish("assetdisposal.completed", { disposalId, proceedsUsd, gainLossUsd: d.gainLossUsd });
    return d;
  }

  getDisposal(id: string): DisposalRequest | undefined { return this.disposals.get(id); }
  listDisposals(status?: DisposalStatus, method?: DisposalMethod): DisposalRequest[] {
    let all = Array.from(this.disposals.values());
    if (status) all = all.filter(d => d.status === status);
    if (method) all = all.filter(d => d.method === method);
    return all;
  }

  summary(): DisposalSummary {
    const disposals = Array.from(this.disposals.values());
    const completed = disposals.filter(d => d.status === "completed");
    const byMethod: Partial<Record<DisposalMethod, number>> = {};
    for (const d of disposals) { byMethod[d.method] = (byMethod[d.method] ?? 0) + 1; }
    return {
      totalDisposals: disposals.length,
      pending: disposals.filter(d => d.status === "requested" || d.status === "approved").length,
      completed: completed.length,
      totalProceedsUsd: Math.round(completed.reduce((s, d) => s + (d.proceedsUsd ?? 0), 0) * 100) / 100,
      totalGainLossUsd: Math.round(completed.reduce((s, d) => s + (d.gainLossUsd ?? 0), 0) * 100) / 100,
      byMethod,
    };
  }
}
