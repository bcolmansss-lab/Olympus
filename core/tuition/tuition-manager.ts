/**
 * TuitionReimbursementManager — education benefits: per-employee annual
 * reimbursement caps, claim submission with course details, approval with
 * cap-aware partial reimbursement, and completion-proof gated payout.
 *
 * Events:
 *   - "tuition.claim_submitted": { claimId, employeeId, amountUsd }
 *   - "tuition.claim_approved": { claimId, approvedUsd }
 *   - "tuition.paid": { claimId, paidUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type TuitionClaimStatus = "submitted" | "approved" | "rejected" | "paid";

export interface TuitionClaim {
  id: string;
  employeeId: string;
  courseName: string;
  provider: string;
  amountUsd: number;
  year: number;
  status: TuitionClaimStatus;
  approvedUsd?: number;
  proofProvided: boolean;
  submittedAt: string;
  paidAt?: string;
}

export interface TuitionSummary {
  totalClaims: number;
  approved: number;
  paid: number;
  totalPaidUsd: number;
  totalApprovedUsd: number;
}

export class TuitionReimbursementManager {
  private claims: Map<string, TuitionClaim> = new Map();
  private annualCapUsd: number;

  constructor(private readonly bus: EventBus, annualCapUsd = 5000) {
    this.annualCapUsd = annualCapUsd;
  }

  submit(input: { employeeId: string; courseName: string; provider: string; amountUsd: number; year: number; submittedAt: string }): TuitionClaim {
    const claim: TuitionClaim = { ...input, id: randomUUID(), status: "submitted", proofProvided: false };
    this.claims.set(claim.id, claim);
    this.bus.publish("tuition.claim_submitted", { claimId: claim.id, employeeId: claim.employeeId, amountUsd: claim.amountUsd });
    return claim;
  }

  /** Amount already approved or paid for an employee in a year. */
  usedAllowance(employeeId: string, year: number): number {
    const used = Array.from(this.claims.values())
      .filter(c => c.employeeId === employeeId && c.year === year && (c.status === "approved" || c.status === "paid"))
      .reduce((s, c) => s + (c.approvedUsd ?? 0), 0);
    return Math.round(used * 100) / 100;
  }

  /** Approve up to the remaining annual allowance; zero remaining → rejected. */
  approve(claimId: string): TuitionClaim | undefined {
    const c = this.claims.get(claimId);
    if (!c || c.status !== "submitted") return undefined;
    const remaining = Math.max(0, this.annualCapUsd - this.usedAllowance(c.employeeId, c.year));
    if (remaining <= 0) {
      c.status = "rejected";
      return c;
    }
    c.status = "approved";
    c.approvedUsd = Math.round(Math.min(c.amountUsd, remaining) * 100) / 100;
    this.bus.publish("tuition.claim_approved", { claimId, approvedUsd: c.approvedUsd });
    return c;
  }

  reject(claimId: string): TuitionClaim | undefined {
    const c = this.claims.get(claimId);
    if (!c || c.status !== "submitted") return undefined;
    c.status = "rejected";
    return c;
  }

  provideProof(claimId: string): TuitionClaim | undefined {
    const c = this.claims.get(claimId);
    if (!c || c.status !== "approved") return undefined;
    c.proofProvided = true;
    return c;
  }

  /** Pay out an approved claim; requires completion proof. */
  pay(claimId: string, paidAt: string): TuitionClaim | undefined {
    const c = this.claims.get(claimId);
    if (!c || c.status !== "approved" || !c.proofProvided) return undefined;
    c.status = "paid";
    c.paidAt = paidAt;
    this.bus.publish("tuition.paid", { claimId, paidUsd: c.approvedUsd });
    return c;
  }

  getClaim(id: string): TuitionClaim | undefined { return this.claims.get(id); }
  listClaims(status?: TuitionClaimStatus, employeeId?: string): TuitionClaim[] {
    let all = Array.from(this.claims.values());
    if (status) all = all.filter(c => c.status === status);
    if (employeeId) all = all.filter(c => c.employeeId === employeeId);
    return all;
  }

  summary(): TuitionSummary {
    const claims = Array.from(this.claims.values());
    const paid = claims.filter(c => c.status === "paid");
    return {
      totalClaims: claims.length,
      approved: claims.filter(c => c.status === "approved").length,
      paid: paid.length,
      totalPaidUsd: Math.round(paid.reduce((s, c) => s + (c.approvedUsd ?? 0), 0) * 100) / 100,
      totalApprovedUsd: Math.round(claims.filter(c => c.status === "approved" || c.status === "paid").reduce((s, c) => s + (c.approvedUsd ?? 0), 0) * 100) / 100,
    };
  }
}
