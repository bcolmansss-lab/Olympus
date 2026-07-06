/**
 * MileageManager — employee mileage reimbursement: per-trip distance logging
 * at a configurable rate, approval workflow, and reimbursement totals.
 *
 * Events:
 *   - "mileage.logged": { claimId, employeeId, miles, amountUsd }
 *   - "mileage.approved": { claimId, amountUsd, approverId }
 *   - "mileage.reimbursed": { claimId, amountUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type MileageClaimStatus = "logged" | "approved" | "rejected" | "reimbursed";

export interface MileageClaim {
  id: string;
  employeeId: string;
  date: string;
  origin: string;
  destination: string;
  miles: number;
  ratePerMileUsd: number;
  amountUsd: number;
  purpose: string;
  status: MileageClaimStatus;
  approverId?: string;
  loggedAt: string;
  reimbursedAt?: string;
}

export interface MileageSummary {
  totalClaims: number;
  pendingApproval: number;
  approved: number;
  reimbursed: number;
  totalMiles: number;
  totalReimbursedUsd: number;
  pendingAmountUsd: number;
}

export class MileageManager {
  private claims: Map<string, MileageClaim> = new Map();
  private defaultRate: number;

  constructor(private readonly bus: EventBus, defaultRatePerMileUsd = 0.67) {
    this.defaultRate = defaultRatePerMileUsd;
  }

  logTrip(input: { employeeId: string; date: string; origin: string; destination: string; miles: number; purpose: string; ratePerMileUsd?: number }): MileageClaim | undefined {
    if (input.miles <= 0) return undefined;
    const rate = input.ratePerMileUsd ?? this.defaultRate;
    const amountUsd = Math.round(input.miles * rate * 100) / 100;
    const claim: MileageClaim = {
      id: randomUUID(),
      employeeId: input.employeeId,
      date: input.date,
      origin: input.origin,
      destination: input.destination,
      miles: input.miles,
      ratePerMileUsd: rate,
      amountUsd,
      purpose: input.purpose,
      status: "logged",
      loggedAt: new Date().toISOString(),
    };
    this.claims.set(claim.id, claim);
    this.bus.publish("mileage.logged", { claimId: claim.id, employeeId: claim.employeeId, miles: claim.miles, amountUsd });
    return claim;
  }

  approve(claimId: string, approverId: string): MileageClaim | undefined {
    const claim = this.claims.get(claimId);
    if (!claim || claim.status !== "logged") return undefined;
    claim.status = "approved";
    claim.approverId = approverId;
    this.bus.publish("mileage.approved", { claimId, amountUsd: claim.amountUsd, approverId });
    return claim;
  }

  reject(claimId: string, approverId: string): MileageClaim | undefined {
    const claim = this.claims.get(claimId);
    if (!claim || claim.status !== "logged") return undefined;
    claim.status = "rejected";
    claim.approverId = approverId;
    return claim;
  }

  reimburse(claimId: string, asOf: string): MileageClaim | undefined {
    const claim = this.claims.get(claimId);
    if (!claim || claim.status !== "approved") return undefined;
    claim.status = "reimbursed";
    claim.reimbursedAt = asOf;
    this.bus.publish("mileage.reimbursed", { claimId, amountUsd: claim.amountUsd });
    return claim;
  }

  getClaim(id: string): MileageClaim | undefined { return this.claims.get(id); }
  listClaims(employeeId?: string, status?: MileageClaimStatus): MileageClaim[] {
    let all = Array.from(this.claims.values());
    if (employeeId) all = all.filter(c => c.employeeId === employeeId);
    if (status) all = all.filter(c => c.status === status);
    return all;
  }

  summary(): MileageSummary {
    const claims = Array.from(this.claims.values());
    return {
      totalClaims: claims.length,
      pendingApproval: claims.filter(c => c.status === "logged").length,
      approved: claims.filter(c => c.status === "approved").length,
      reimbursed: claims.filter(c => c.status === "reimbursed").length,
      totalMiles: Math.round(claims.reduce((s, c) => s + c.miles, 0) * 100) / 100,
      totalReimbursedUsd: Math.round(claims.filter(c => c.status === "reimbursed").reduce((s, c) => s + c.amountUsd, 0) * 100) / 100,
      pendingAmountUsd: Math.round(claims.filter(c => c.status === "logged" || c.status === "approved").reduce((s, c) => s + c.amountUsd, 0) * 100) / 100,
    };
  }
}
