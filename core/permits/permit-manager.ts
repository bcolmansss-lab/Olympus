/**
 * PermitManager — business permit and license tracking, renewal alerts,
 * regulatory filings, inspection scheduling, and compliance calendar.
 *
 * Events:
 *   - "permits.permit_issued": { permitId, type, issuedBy, expiresAt }
 *   - "permits.permit_expiring": { permitId, type, expiresAt, daysRemaining }
 *   - "permits.inspection_scheduled": { permitId, inspectionId, scheduledAt }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PermitStatus = "pending" | "active" | "expired" | "revoked" | "renewal_pending";
export type PermitCategory = "business_license" | "health_safety" | "environmental" | "building" | "fire" | "zoning" | "import_export" | "food_service";

export interface BusinessPermit {
  id: string;
  type: PermitCategory;
  name: string;
  issuingAuthority: string;
  permitNumber: string;
  status: PermitStatus;
  locationId?: string;
  issuedAt: string;
  expiresAt: string;
  renewalLeadDays: number;
  annualFeeUsd: number;
  createdAt: string;
}

export interface PermitInspection {
  id: string;
  permitId: string;
  scheduledAt: string;
  inspector?: string;
  passed?: boolean;
  notes?: string;
  completedAt?: string;
}

export interface PermitSummary {
  totalPermits: number;
  activePermits: number;
  expiringIn30Days: number;
  expired: number;
  totalAnnualFeesUsd: number;
  pendingInspections: number;
}

export class PermitManager {
  private permits: Map<string, BusinessPermit> = new Map();
  private inspections: Map<string, PermitInspection> = new Map();

  constructor(private readonly bus: EventBus) {}

  issuePermit(input: Omit<BusinessPermit, "id" | "createdAt"> & { id?: string }): BusinessPermit {
    const permit: BusinessPermit = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.permits.set(permit.id, permit);
    this.bus.publish("permits.permit_issued", { permitId: permit.id, type: permit.type, issuedBy: permit.issuingAuthority, expiresAt: permit.expiresAt });
    const daysRemaining = Math.floor((new Date(permit.expiresAt).getTime() - Date.now()) / 86400000);
    if (daysRemaining <= 30 && permit.status === "active") {
      this.bus.publish("permits.permit_expiring", { permitId: permit.id, type: permit.type, expiresAt: permit.expiresAt, daysRemaining });
    }
    return permit;
  }

  scheduleInspection(permitId: string, scheduledAt: string, inspector?: string): PermitInspection | undefined {
    const permit = this.permits.get(permitId);
    if (!permit) return undefined;
    const inspection: PermitInspection = { id: randomUUID(), permitId, scheduledAt, inspector };
    this.inspections.set(inspection.id, inspection);
    this.bus.publish("permits.inspection_scheduled", { permitId, inspectionId: inspection.id, scheduledAt });
    return inspection;
  }

  completeInspection(inspectionId: string, passed: boolean, notes?: string): PermitInspection | undefined {
    const inspection = this.inspections.get(inspectionId);
    if (!inspection) return undefined;
    inspection.passed = passed;
    inspection.notes = notes;
    inspection.completedAt = new Date().toISOString();
    return inspection;
  }

  renewPermit(permitId: string, newExpiresAt: string): BusinessPermit | undefined {
    const permit = this.permits.get(permitId);
    if (!permit) return undefined;
    permit.status = "active";
    permit.expiresAt = newExpiresAt;
    return permit;
  }

  getPermit(id: string): BusinessPermit | undefined { return this.permits.get(id); }
  listPermits(status?: PermitStatus): BusinessPermit[] {
    const all = Array.from(this.permits.values());
    return status ? all.filter(p => p.status === status) : all;
  }
  listInspections(permitId?: string): PermitInspection[] {
    const all = Array.from(this.inspections.values());
    return permitId ? all.filter(i => i.permitId === permitId) : all;
  }

  summary(): PermitSummary {
    const permits = Array.from(this.permits.values());
    const now = Date.now();
    const active = permits.filter(p => p.status === "active");
    const expiring30 = active.filter(p => (new Date(p.expiresAt).getTime() - now) / 86400000 <= 30).length;
    const pending = Array.from(this.inspections.values()).filter(i => !i.completedAt).length;
    return {
      totalPermits: permits.length,
      activePermits: active.length,
      expiringIn30Days: expiring30,
      expired: permits.filter(p => p.status === "expired").length,
      totalAnnualFeesUsd: active.reduce((s, p) => s + p.annualFeeUsd, 0),
      pendingInspections: pending,
    };
  }
}
