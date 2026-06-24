/**
 * InsuranceManager — corporate insurance policy tracking, claims management,
 * coverage gap analysis, renewal reminders, and premium cost tracking.
 *
 * Events:
 *   - "insurance.claim_filed": { claimId, policyId, type, estimatedUsd }
 *   - "insurance.claim_settled": { claimId, settledAmountUsd, outcome }
 *   - "insurance.renewal_due": { policyId, type, renewalDate, premiumUsd }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type InsuranceType = "general_liability" | "professional_liability" | "cyber" | "directors_officers" | "workers_comp" | "property" | "umbrella" | "keyman";
export type PolicyStatus = "active" | "expired" | "cancelled" | "pending_renewal";
export type ClaimStatus = "filed" | "under_review" | "settled" | "denied" | "appealed";

export interface InsurancePolicy {
  id: string;
  type: InsuranceType;
  carrier: string;
  policyNumber: string;
  status: PolicyStatus;
  coverageLimitUsd: number;
  deductibleUsd: number;
  annualPremiumUsd: number;
  effectiveDate: string;
  expirationDate: string;
  broker?: string;
  notes: string;
  createdAt: string;
}

export interface InsuranceClaim {
  id: string;
  policyId: string;
  type: InsuranceType;
  description: string;
  status: ClaimStatus;
  estimatedLossUsd: number;
  settledAmountUsd?: number;
  filedAt: string;
  settledAt?: string;
  adjuster?: string;
  outcome?: string;
}

export interface InsuranceSummary {
  totalPolicies: number;
  activePolicies: number;
  totalAnnualPremiumUsd: number;
  totalCoverageUsd: number;
  openClaims: number;
  totalSettledUsd: number;
  renewalsDueIn30Days: number;
}

export class InsuranceManager {
  private policies: Map<string, InsurancePolicy> = new Map();
  private claims: Map<string, InsuranceClaim> = new Map();

  constructor(private readonly bus: EventBus) {}

  addPolicy(input: Omit<InsurancePolicy, "id" | "createdAt"> & { id?: string }): InsurancePolicy {
    const policy: InsurancePolicy = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.policies.set(policy.id, policy);
    const daysToRenewal = Math.round((new Date(policy.expirationDate).getTime() - Date.now()) / 86400000);
    if (daysToRenewal <= 30 && daysToRenewal >= 0) {
      this.bus.publish("insurance.renewal_due", { policyId: policy.id, type: policy.type, renewalDate: policy.expirationDate, premiumUsd: policy.annualPremiumUsd });
    }
    return policy;
  }

  fileClaim(input: Omit<InsuranceClaim, "id" | "filedAt"> & { id?: string }): InsuranceClaim | undefined {
    if (!this.policies.has(input.policyId)) return undefined;
    const claim: InsuranceClaim = { ...input, id: input.id ?? randomUUID(), filedAt: new Date().toISOString() };
    this.claims.set(claim.id, claim);
    this.bus.publish("insurance.claim_filed", { claimId: claim.id, policyId: claim.policyId, type: claim.type, estimatedUsd: claim.estimatedLossUsd });
    return claim;
  }

  settleClaim(claimId: string, settledAmountUsd: number, outcome: string): InsuranceClaim | undefined {
    const claim = this.claims.get(claimId);
    if (!claim) return undefined;
    claim.status = "settled";
    claim.settledAmountUsd = settledAmountUsd;
    claim.outcome = outcome;
    claim.settledAt = new Date().toISOString();
    this.bus.publish("insurance.claim_settled", { claimId, settledAmountUsd, outcome });
    return claim;
  }

  renewPolicy(policyId: string, newExpirationDate: string, newPremiumUsd?: number): InsurancePolicy | undefined {
    const policy = this.policies.get(policyId);
    if (!policy) return undefined;
    policy.expirationDate = newExpirationDate;
    policy.status = "active";
    if (newPremiumUsd !== undefined) policy.annualPremiumUsd = newPremiumUsd;
    return policy;
  }

  getPolicy(id: string): InsurancePolicy | undefined { return this.policies.get(id); }
  listPolicies(status?: PolicyStatus): InsurancePolicy[] {
    const all = Array.from(this.policies.values());
    return status ? all.filter((p) => p.status === status) : all;
  }

  getClaim(id: string): InsuranceClaim | undefined { return this.claims.get(id); }
  listClaims(policyId?: string): InsuranceClaim[] {
    const all = Array.from(this.claims.values());
    return policyId ? all.filter((c) => c.policyId === policyId) : all;
  }

  summary(): InsuranceSummary {
    const policies = Array.from(this.policies.values());
    const claims = Array.from(this.claims.values());
    const active = policies.filter((p) => p.status === "active");
    const renewalsDue = policies.filter((p) => {
      const days = Math.round((new Date(p.expirationDate).getTime() - Date.now()) / 86400000);
      return days >= 0 && days <= 30;
    });
    const settled = claims.filter((c) => c.status === "settled");
    return {
      totalPolicies: policies.length,
      activePolicies: active.length,
      totalAnnualPremiumUsd: active.reduce((s, p) => s + p.annualPremiumUsd, 0),
      totalCoverageUsd: active.reduce((s, p) => s + p.coverageLimitUsd, 0),
      openClaims: claims.filter((c) => c.status === "filed" || c.status === "under_review").length,
      totalSettledUsd: settled.reduce((s, c) => s + (c.settledAmountUsd ?? 0), 0),
      renewalsDueIn30Days: renewalsDue.length,
    };
  }
}
