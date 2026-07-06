/**
 * PurchaseRequisitionManager — pre-purchase requisitions: line-item requests,
 * budget-coded approval routing, and conversion to purchase orders.
 *
 * Events:
 *   - "requisition.submitted": { requisitionId, requesterId, totalUsd }
 *   - "requisition.approved": { requisitionId, approverId }
 *   - "requisition.converted": { requisitionId, poRef }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ReqStatus = "draft" | "submitted" | "approved" | "rejected" | "converted";

export interface ReqLineItem {
  description: string;
  quantity: number;
  unitPriceUsd: number;
}

export interface PurchaseRequisition {
  id: string;
  requesterId: string;
  department: string;
  budgetCode: string;
  lineItems: ReqLineItem[];
  totalUsd: number;
  status: ReqStatus;
  approverId?: string;
  poRef?: string;
  createdAt: string;
  submittedAt?: string;
}

export interface RequisitionSummary {
  totalRequisitions: number;
  pendingApproval: number;
  approved: number;
  converted: number;
  totalRequestedUsd: number;
  byDepartment: Record<string, number>;
}

export class PurchaseRequisitionManager {
  private requisitions: Map<string, PurchaseRequisition> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(input: { requesterId: string; department: string; budgetCode: string; lineItems: ReqLineItem[] }): PurchaseRequisition {
    const totalUsd = Math.round(input.lineItems.reduce((s, l) => s + l.quantity * l.unitPriceUsd, 0) * 100) / 100;
    const req: PurchaseRequisition = { ...input, id: randomUUID(), totalUsd, status: "draft", createdAt: new Date().toISOString() };
    this.requisitions.set(req.id, req);
    return req;
  }

  submit(requisitionId: string, asOf: string): PurchaseRequisition | undefined {
    const req = this.requisitions.get(requisitionId);
    if (!req || req.status !== "draft" || req.lineItems.length === 0) return undefined;
    req.status = "submitted";
    req.submittedAt = asOf;
    this.bus.publish("requisition.submitted", { requisitionId, requesterId: req.requesterId, totalUsd: req.totalUsd });
    return req;
  }

  approve(requisitionId: string, approverId: string): PurchaseRequisition | undefined {
    const req = this.requisitions.get(requisitionId);
    if (!req || req.status !== "submitted") return undefined;
    req.status = "approved";
    req.approverId = approverId;
    this.bus.publish("requisition.approved", { requisitionId, approverId });
    return req;
  }

  reject(requisitionId: string, approverId: string): PurchaseRequisition | undefined {
    const req = this.requisitions.get(requisitionId);
    if (!req || req.status !== "submitted") return undefined;
    req.status = "rejected";
    req.approverId = approverId;
    return req;
  }

  convertToPO(requisitionId: string, poRef: string): PurchaseRequisition | undefined {
    const req = this.requisitions.get(requisitionId);
    if (!req || req.status !== "approved") return undefined;
    req.status = "converted";
    req.poRef = poRef;
    this.bus.publish("requisition.converted", { requisitionId, poRef });
    return req;
  }

  getRequisition(id: string): PurchaseRequisition | undefined { return this.requisitions.get(id); }
  listRequisitions(status?: ReqStatus, department?: string): PurchaseRequisition[] {
    let all = Array.from(this.requisitions.values());
    if (status) all = all.filter(r => r.status === status);
    if (department) all = all.filter(r => r.department === department);
    return all;
  }

  summary(): RequisitionSummary {
    const reqs = Array.from(this.requisitions.values());
    const byDepartment: Record<string, number> = {};
    for (const r of reqs) { byDepartment[r.department] = (byDepartment[r.department] ?? 0) + 1; }
    return {
      totalRequisitions: reqs.length,
      pendingApproval: reqs.filter(r => r.status === "submitted").length,
      approved: reqs.filter(r => r.status === "approved").length,
      converted: reqs.filter(r => r.status === "converted").length,
      totalRequestedUsd: Math.round(reqs.reduce((s, r) => s + r.totalUsd, 0) * 100) / 100,
      byDepartment,
    };
  }
}
