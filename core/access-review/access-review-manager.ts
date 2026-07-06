/**
 * AccessReviewManager — periodic access certification campaigns: reviewers
 * attest to user entitlements, with approve/revoke decisions and completion
 * tracking for SOX/SOC2-style access governance.
 *
 * Events:
 *   - "accessreview.campaign_started": { campaignId, name, itemCount }
 *   - "accessreview.item_decided": { campaignId, itemId, decision, reviewerId }
 *   - "accessreview.campaign_completed": { campaignId, approved, revoked }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CampaignStatus = "draft" | "in_progress" | "completed";
export type ReviewDecision = "pending" | "approved" | "revoked";

export interface AccessItem {
  id: string;
  userId: string;
  resource: string;
  entitlement: string;
  reviewerId: string;
  decision: ReviewDecision;
  decidedAt?: string;
  comment?: string;
}

export interface AccessReviewCampaign {
  id: string;
  name: string;
  status: CampaignStatus;
  items: AccessItem[];
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface AccessReviewSummary {
  totalCampaigns: number;
  inProgress: number;
  completed: number;
  totalItems: number;
  pendingItems: number;
  approvedItems: number;
  revokedItems: number;
}

export class AccessReviewManager {
  private campaigns: Map<string, AccessReviewCampaign> = new Map();

  constructor(private readonly bus: EventBus) {}

  createCampaign(name: string): AccessReviewCampaign {
    const campaign: AccessReviewCampaign = { id: randomUUID(), name, status: "draft", items: [], createdAt: new Date().toISOString() };
    this.campaigns.set(campaign.id, campaign);
    return campaign;
  }

  addItem(campaignId: string, input: Omit<AccessItem, "id" | "decision" | "decidedAt">): AccessItem | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.status === "completed") return undefined;
    const item: AccessItem = { ...input, id: randomUUID(), decision: "pending" };
    campaign.items.push(item);
    return item;
  }

  start(campaignId: string): AccessReviewCampaign | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.items.length === 0) return undefined;
    campaign.status = "in_progress";
    campaign.startedAt = new Date().toISOString();
    this.bus.publish("accessreview.campaign_started", { campaignId, name: campaign.name, itemCount: campaign.items.length });
    return campaign;
  }

  decide(campaignId: string, itemId: string, reviewerId: string, decision: "approved" | "revoked", comment?: string): AccessItem | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.status !== "in_progress") return undefined;
    const item = campaign.items.find(i => i.id === itemId);
    if (!item || item.reviewerId !== reviewerId) return undefined;
    item.decision = decision;
    item.decidedAt = new Date().toISOString();
    item.comment = comment;
    this.bus.publish("accessreview.item_decided", { campaignId, itemId, decision, reviewerId });
    if (campaign.items.every(i => i.decision !== "pending")) {
      campaign.status = "completed";
      campaign.completedAt = new Date().toISOString();
      this.bus.publish("accessreview.campaign_completed", {
        campaignId,
        approved: campaign.items.filter(i => i.decision === "approved").length,
        revoked: campaign.items.filter(i => i.decision === "revoked").length,
      });
    }
    return item;
  }

  getCampaign(id: string): AccessReviewCampaign | undefined { return this.campaigns.get(id); }
  listCampaigns(status?: CampaignStatus): AccessReviewCampaign[] {
    const all = Array.from(this.campaigns.values());
    return status ? all.filter(c => c.status === status) : all;
  }
  pendingForReviewer(reviewerId: string): AccessItem[] {
    return Array.from(this.campaigns.values())
      .filter(c => c.status === "in_progress")
      .flatMap(c => c.items.filter(i => i.reviewerId === reviewerId && i.decision === "pending"));
  }

  summary(): AccessReviewSummary {
    const campaigns = Array.from(this.campaigns.values());
    const items = campaigns.flatMap(c => c.items);
    return {
      totalCampaigns: campaigns.length,
      inProgress: campaigns.filter(c => c.status === "in_progress").length,
      completed: campaigns.filter(c => c.status === "completed").length,
      totalItems: items.length,
      pendingItems: items.filter(i => i.decision === "pending").length,
      approvedItems: items.filter(i => i.decision === "approved").length,
      revokedItems: items.filter(i => i.decision === "revoked").length,
    };
  }
}
