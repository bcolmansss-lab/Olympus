/**
 * GrantManager — grant applications, award tracking, milestone reporting,
 * compliance requirements, and funding source management.
 *
 * Events:
 *   - "grant.awarded": { grantId, title, awardedAmountUsd, fundingSource }
 *   - "grant.milestone_submitted": { grantId, milestoneId, title, dueDate }
 *   - "grant.deadline_approaching": { grantId, title, deadlineDate, daysRemaining }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type GrantStatus = "identifying" | "drafting" | "submitted" | "under_review" | "awarded" | "rejected" | "active" | "closed";
export type GrantType = "federal" | "state" | "foundation" | "corporate" | "eu" | "international" | "internal";

export interface GrantMilestone {
  id: string;
  grantId: string;
  title: string;
  description: string;
  dueDate: string;
  submittedAt?: string;
  status: "pending" | "submitted" | "accepted" | "revision_required";
  reportUrl?: string;
}

export interface Grant {
  id: string;
  title: string;
  fundingSource: string;
  type: GrantType;
  status: GrantStatus;
  requestedAmountUsd: number;
  awardedAmountUsd: number;
  appliedAt?: string;
  awardedAt?: string;
  expiresAt?: string;
  principalInvestigator: string;
  milestones: string[]; // GrantMilestone IDs
  complianceNotes: string;
  tags: string[];
  createdAt: string;
}

export interface GrantSummary {
  totalGrants: number;
  activeGrants: number;
  totalAwardedUsd: number;
  totalRequestedUsd: number;
  successRate: number; // %
  pendingMilestones: number;
}

export class GrantManager {
  private grants: Map<string, Grant> = new Map();
  private milestones: Map<string, GrantMilestone> = new Map();

  constructor(private readonly bus: EventBus) {}

  createGrant(input: Omit<Grant, "id" | "awardedAmountUsd" | "milestones" | "createdAt"> & { id?: string }): Grant {
    const grant: Grant = {
      ...input,
      id: input.id ?? randomUUID(),
      awardedAmountUsd: 0,
      milestones: [],
      createdAt: new Date().toISOString(),
    };
    this.grants.set(grant.id, grant);
    return grant;
  }

  awardGrant(grantId: string, awardedAmountUsd: number): Grant | undefined {
    const grant = this.grants.get(grantId);
    if (!grant) return undefined;
    grant.status = "awarded";
    grant.awardedAmountUsd = awardedAmountUsd;
    grant.awardedAt = new Date().toISOString();
    this.bus.publish("grant.awarded", { grantId, title: grant.title, awardedAmountUsd, fundingSource: grant.fundingSource });
    return grant;
  }

  addMilestone(input: Omit<GrantMilestone, "id"> & { id?: string }): GrantMilestone | undefined {
    const grant = this.grants.get(input.grantId);
    if (!grant) return undefined;
    const milestone: GrantMilestone = { ...input, id: input.id ?? randomUUID() };
    this.milestones.set(milestone.id, milestone);
    grant.milestones.push(milestone.id);
    const daysRemaining = Math.round((new Date(milestone.dueDate).getTime() - Date.now()) / 86400000);
    if (daysRemaining <= 30 && daysRemaining >= 0) {
      this.bus.publish("grant.deadline_approaching", { grantId: input.grantId, title: grant.title, deadlineDate: milestone.dueDate, daysRemaining });
    }
    return milestone;
  }

  submitMilestone(milestoneId: string, reportUrl?: string): GrantMilestone | undefined {
    const milestone = this.milestones.get(milestoneId);
    if (!milestone) return undefined;
    milestone.status = "submitted";
    milestone.submittedAt = new Date().toISOString();
    if (reportUrl) milestone.reportUrl = reportUrl;
    const grant = this.grants.get(milestone.grantId);
    if (grant) {
      this.bus.publish("grant.milestone_submitted", { grantId: milestone.grantId, milestoneId, title: milestone.title, dueDate: milestone.dueDate });
    }
    return milestone;
  }

  activateGrant(grantId: string): Grant | undefined {
    const grant = this.grants.get(grantId);
    if (!grant) return undefined;
    grant.status = "active";
    return grant;
  }

  getGrant(id: string): Grant | undefined { return this.grants.get(id); }
  listGrants(status?: GrantStatus): Grant[] {
    const all = Array.from(this.grants.values());
    return status ? all.filter((g) => g.status === status) : all;
  }

  getMilestone(id: string): GrantMilestone | undefined { return this.milestones.get(id); }
  listMilestones(grantId?: string): GrantMilestone[] {
    const all = Array.from(this.milestones.values());
    return grantId ? all.filter((m) => m.grantId === grantId) : all;
  }

  summary(): GrantSummary {
    const grants = Array.from(this.grants.values());
    const milestones = Array.from(this.milestones.values());
    const decided = grants.filter((g) => g.status === "awarded" || g.status === "rejected" || g.status === "active" || g.status === "closed");
    const won = grants.filter((g) => g.status === "awarded" || g.status === "active" || g.status === "closed");
    const successRate = decided.length > 0 ? Math.round((won.length / decided.length) * 100) : 0;
    return {
      totalGrants: grants.length,
      activeGrants: grants.filter((g) => g.status === "active").length,
      totalAwardedUsd: grants.reduce((s, g) => s + g.awardedAmountUsd, 0),
      totalRequestedUsd: grants.reduce((s, g) => s + g.requestedAmountUsd, 0),
      successRate,
      pendingMilestones: milestones.filter((m) => m.status === "pending").length,
    };
  }
}
