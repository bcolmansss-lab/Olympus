/**
 * WarrantyManager — product warranty registration, RMA (return merchandise
 * authorization) workflow, claim adjudication, and warranty cost analytics.
 *
 * Events:
 *   - "warranty.registered": { warrantyId, productId, customerId, expiresAt }
 *   - "warranty.rma_opened": { rmaId, warrantyId, reason }
 *   - "warranty.claim_resolved": { rmaId, resolution, costUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type WarrantyStatus = "active" | "expired" | "voided";
export type RMAStatus = "opened" | "approved" | "rejected" | "received" | "resolved";
export type RMAResolution = "repair" | "replace" | "refund" | "denied";

export interface Warranty {
  id: string;
  productId: string;
  productName: string;
  customerId: string;
  serialNumber: string;
  status: WarrantyStatus;
  purchaseDate: string;
  expiresAt: string;
  createdAt: string;
}

export interface RMA {
  id: string;
  warrantyId: string;
  reason: string;
  status: RMAStatus;
  resolution?: RMAResolution;
  costUsd?: number;
  openedAt: string;
  resolvedAt?: string;
}

export interface WarrantySummary {
  totalWarranties: number;
  active: number;
  expired: number;
  totalRMAs: number;
  openRMAs: number;
  totalClaimCostUsd: number;
  byResolution: Partial<Record<RMAResolution, number>>;
}

export class WarrantyManager {
  private warranties: Map<string, Warranty> = new Map();
  private rmas: Map<string, RMA> = new Map();

  constructor(private readonly bus: EventBus) {}

  register(input: Omit<Warranty, "id" | "status" | "createdAt"> & { id?: string }): Warranty {
    const warranty: Warranty = { ...input, id: input.id ?? randomUUID(), status: "active", createdAt: new Date().toISOString() };
    this.warranties.set(warranty.id, warranty);
    this.bus.publish("warranty.registered", { warrantyId: warranty.id, productId: warranty.productId, customerId: warranty.customerId, expiresAt: warranty.expiresAt });
    return warranty;
  }

  voidWarranty(warrantyId: string): Warranty | undefined {
    const w = this.warranties.get(warrantyId);
    if (!w) return undefined;
    w.status = "voided";
    return w;
  }

  isCovered(warrantyId: string, asOf: string): boolean {
    const w = this.warranties.get(warrantyId);
    if (!w || w.status !== "active") return false;
    return new Date(asOf).getTime() <= new Date(w.expiresAt).getTime();
  }

  openRMA(warrantyId: string, reason: string): RMA | undefined {
    const w = this.warranties.get(warrantyId);
    if (!w) return undefined;
    const rma: RMA = { id: randomUUID(), warrantyId, reason, status: "opened", openedAt: new Date().toISOString() };
    this.rmas.set(rma.id, rma);
    this.bus.publish("warranty.rma_opened", { rmaId: rma.id, warrantyId, reason });
    return rma;
  }

  updateRMA(rmaId: string, status: RMAStatus): RMA | undefined {
    const rma = this.rmas.get(rmaId);
    if (!rma) return undefined;
    rma.status = status;
    return rma;
  }

  resolveRMA(rmaId: string, resolution: RMAResolution, costUsd = 0): RMA | undefined {
    const rma = this.rmas.get(rmaId);
    if (!rma) return undefined;
    rma.status = "resolved";
    rma.resolution = resolution;
    rma.costUsd = costUsd;
    rma.resolvedAt = new Date().toISOString();
    this.bus.publish("warranty.claim_resolved", { rmaId, resolution, costUsd });
    return rma;
  }

  getWarranty(id: string): Warranty | undefined { return this.warranties.get(id); }
  listWarranties(customerId?: string, status?: WarrantyStatus): Warranty[] {
    let all = Array.from(this.warranties.values());
    if (customerId) all = all.filter(w => w.customerId === customerId);
    if (status) all = all.filter(w => w.status === status);
    return all;
  }
  listRMAs(status?: RMAStatus): RMA[] {
    const all = Array.from(this.rmas.values());
    return status ? all.filter(r => r.status === status) : all;
  }

  summary(): WarrantySummary {
    const warranties = Array.from(this.warranties.values());
    const rmas = Array.from(this.rmas.values());
    const byResolution: Partial<Record<RMAResolution, number>> = {};
    for (const r of rmas) { if (r.resolution) byResolution[r.resolution] = (byResolution[r.resolution] ?? 0) + 1; }
    return {
      totalWarranties: warranties.length,
      active: warranties.filter(w => w.status === "active").length,
      expired: warranties.filter(w => w.status === "expired").length,
      totalRMAs: rmas.length,
      openRMAs: rmas.filter(r => r.status !== "resolved" && r.status !== "rejected").length,
      totalClaimCostUsd: rmas.reduce((s, r) => s + (r.costUsd ?? 0), 0),
      byResolution,
    };
  }
}
