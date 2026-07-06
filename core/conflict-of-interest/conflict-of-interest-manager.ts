/**
 * ConflictOfInterestManager — conflict-of-interest disclosures: employee
 * disclosures by category, review workflow with mitigation plans, and
 * recusal/approval decisions.
 *
 * Events:
 *   - "coi.disclosed": { disclosureId, employeeId, category }
 *   - "coi.reviewed": { disclosureId, decision }
 *   - "coi.mitigation_required": { disclosureId, employeeId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type COICategory = "financial_interest" | "outside_employment" | "family_relationship" | "gifts" | "board_membership" | "vendor_relationship";
export type COIStatus = "disclosed" | "under_review" | "cleared" | "mitigated" | "prohibited";

export interface Disclosure {
  id: string;
  employeeId: string;
  category: COICategory;
  description: string;
  relatedParty: string;
  status: COIStatus;
  mitigationPlan?: string;
  reviewerId?: string;
  disclosedAt: string;
  reviewedAt?: string;
}

export interface COISummary {
  totalDisclosures: number;
  pendingReview: number;
  cleared: number;
  mitigated: number;
  prohibited: number;
  byCategory: Partial<Record<COICategory, number>>;
}

export class ConflictOfInterestManager {
  private disclosures: Map<string, Disclosure> = new Map();

  constructor(private readonly bus: EventBus) {}

  disclose(input: { employeeId: string; category: COICategory; description: string; relatedParty: string; disclosedAt: string }): Disclosure {
    const disclosure: Disclosure = { ...input, id: randomUUID(), status: "disclosed" };
    this.disclosures.set(disclosure.id, disclosure);
    this.bus.publish("coi.disclosed", { disclosureId: disclosure.id, employeeId: disclosure.employeeId, category: disclosure.category });
    return disclosure;
  }

  startReview(disclosureId: string, reviewerId: string): Disclosure | undefined {
    const d = this.disclosures.get(disclosureId);
    if (!d || d.status !== "disclosed") return undefined;
    d.status = "under_review";
    d.reviewerId = reviewerId;
    return d;
  }

  clear(disclosureId: string, asOf: string): Disclosure | undefined {
    const d = this.disclosures.get(disclosureId);
    if (!d || (d.status !== "disclosed" && d.status !== "under_review")) return undefined;
    d.status = "cleared";
    d.reviewedAt = asOf;
    this.bus.publish("coi.reviewed", { disclosureId, decision: "cleared" });
    return d;
  }

  requireMitigation(disclosureId: string, mitigationPlan: string, asOf: string): Disclosure | undefined {
    const d = this.disclosures.get(disclosureId);
    if (!d || (d.status !== "disclosed" && d.status !== "under_review")) return undefined;
    d.status = "mitigated";
    d.mitigationPlan = mitigationPlan;
    d.reviewedAt = asOf;
    this.bus.publish("coi.reviewed", { disclosureId, decision: "mitigated" });
    this.bus.publish("coi.mitigation_required", { disclosureId, employeeId: d.employeeId });
    return d;
  }

  prohibit(disclosureId: string, asOf: string): Disclosure | undefined {
    const d = this.disclosures.get(disclosureId);
    if (!d || (d.status !== "disclosed" && d.status !== "under_review")) return undefined;
    d.status = "prohibited";
    d.reviewedAt = asOf;
    this.bus.publish("coi.reviewed", { disclosureId, decision: "prohibited" });
    return d;
  }

  getDisclosure(id: string): Disclosure | undefined { return this.disclosures.get(id); }
  employeeDisclosures(employeeId: string): Disclosure[] {
    return Array.from(this.disclosures.values()).filter(d => d.employeeId === employeeId);
  }
  listDisclosures(status?: COIStatus, category?: COICategory): Disclosure[] {
    let all = Array.from(this.disclosures.values());
    if (status) all = all.filter(d => d.status === status);
    if (category) all = all.filter(d => d.category === category);
    return all;
  }

  summary(): COISummary {
    const disclosures = Array.from(this.disclosures.values());
    const byCategory: Partial<Record<COICategory, number>> = {};
    for (const d of disclosures) { byCategory[d.category] = (byCategory[d.category] ?? 0) + 1; }
    return {
      totalDisclosures: disclosures.length,
      pendingReview: disclosures.filter(d => d.status === "disclosed" || d.status === "under_review").length,
      cleared: disclosures.filter(d => d.status === "cleared").length,
      mitigated: disclosures.filter(d => d.status === "mitigated").length,
      prohibited: disclosures.filter(d => d.status === "prohibited").length,
      byCategory,
    };
  }
}
