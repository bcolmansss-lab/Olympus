/**
 * CampaignManager — marketing campaign lifecycle, audience segmentation,
 * A/B test tracking, spend management, and ROI analytics.
 *
 * Events:
 *   - "campaign.launched": { campaignId, name, channel, budgetUsd }
 *   - "campaign.completed": { campaignId, name, roiPct, leadsGenerated }
 *   - "campaign.ab_winner_selected": { campaignId, variantId, reason }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "cancelled";
export type CampaignChannel = "email" | "social" | "paid_search" | "display" | "content" | "event" | "referral" | "direct";

export interface CampaignVariant {
  id: string;
  campaignId: string;
  name: string;
  isControl: boolean;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number; // click-through rate %
  conversionRate: number; // %
}

export interface Campaign {
  id: string;
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  audienceSegment: string;
  budgetUsd: number;
  spentUsd: number;
  startDate: string;
  endDate: string;
  leadsGenerated: number;
  revenueAttributedUsd: number;
  variants: string[]; // CampaignVariant IDs
  winningVariantId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignSummary {
  totalCampaigns: number;
  activeCampaigns: number;
  totalBudgetUsd: number;
  totalSpentUsd: number;
  totalLeads: number;
  totalRevenueUsd: number;
  avgRoiPct: number;
}

export class CampaignManager {
  private campaigns: Map<string, Campaign> = new Map();
  private variants: Map<string, CampaignVariant> = new Map();

  constructor(private readonly bus: EventBus) {}

  createCampaign(input: Omit<Campaign, "id" | "variants" | "spentUsd" | "leadsGenerated" | "revenueAttributedUsd" | "createdAt" | "updatedAt"> & { id?: string }): Campaign {
    const now = new Date().toISOString();
    const campaign: Campaign = { ...input, id: input.id ?? randomUUID(), variants: [], spentUsd: 0, leadsGenerated: 0, revenueAttributedUsd: 0, createdAt: now, updatedAt: now };
    this.campaigns.set(campaign.id, campaign);
    return campaign;
  }

  launchCampaign(campaignId: string): Campaign | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return undefined;
    campaign.status = "active";
    campaign.updatedAt = new Date().toISOString();
    this.bus.publish("campaign.launched", { campaignId, name: campaign.name, channel: campaign.channel, budgetUsd: campaign.budgetUsd });
    return campaign;
  }

  completeCampaign(campaignId: string): Campaign | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return undefined;
    campaign.status = "completed";
    campaign.updatedAt = new Date().toISOString();
    const roiPct = campaign.budgetUsd > 0 ? ((campaign.revenueAttributedUsd - campaign.budgetUsd) / campaign.budgetUsd) * 100 : 0;
    this.bus.publish("campaign.completed", { campaignId, name: campaign.name, roiPct: Math.round(roiPct), leadsGenerated: campaign.leadsGenerated });
    return campaign;
  }

  addVariant(input: Omit<CampaignVariant, "id" | "ctr" | "conversionRate"> & { id?: string }): CampaignVariant | undefined {
    const campaign = this.campaigns.get(input.campaignId);
    if (!campaign) return undefined;
    const ctr = input.impressions > 0 ? (input.clicks / input.impressions) * 100 : 0;
    const conversionRate = input.clicks > 0 ? (input.conversions / input.clicks) * 100 : 0;
    const variant: CampaignVariant = { ...input, id: input.id ?? randomUUID(), ctr, conversionRate };
    this.variants.set(variant.id, variant);
    campaign.variants.push(variant.id);
    campaign.updatedAt = new Date().toISOString();
    return variant;
  }

  selectWinner(campaignId: string, variantId: string, reason: string): Campaign | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return undefined;
    campaign.winningVariantId = variantId;
    campaign.updatedAt = new Date().toISOString();
    this.bus.publish("campaign.ab_winner_selected", { campaignId, variantId, reason });
    return campaign;
  }

  recordResults(campaignId: string, leadsGenerated: number, revenueAttributedUsd: number, spentUsd: number): Campaign | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return undefined;
    campaign.leadsGenerated += leadsGenerated;
    campaign.revenueAttributedUsd += revenueAttributedUsd;
    campaign.spentUsd += spentUsd;
    campaign.updatedAt = new Date().toISOString();
    return campaign;
  }

  getCampaign(id: string): Campaign | undefined { return this.campaigns.get(id); }
  listCampaigns(status?: CampaignStatus, channel?: CampaignChannel): Campaign[] {
    let all = Array.from(this.campaigns.values());
    if (status) all = all.filter(c => c.status === status);
    if (channel) all = all.filter(c => c.channel === channel);
    return all;
  }

  summary(): CampaignSummary {
    const campaigns = Array.from(this.campaigns.values());
    const active = campaigns.filter(c => c.status === "active");
    const withBudget = campaigns.filter(c => c.budgetUsd > 0 && c.status === "completed");
    const avgRoi = withBudget.length > 0 ? withBudget.reduce((s, c) => s + ((c.revenueAttributedUsd - c.budgetUsd) / c.budgetUsd) * 100, 0) / withBudget.length : 0;
    return {
      totalCampaigns: campaigns.length,
      activeCampaigns: active.length,
      totalBudgetUsd: campaigns.reduce((s, c) => s + c.budgetUsd, 0),
      totalSpentUsd: campaigns.reduce((s, c) => s + c.spentUsd, 0),
      totalLeads: campaigns.reduce((s, c) => s + c.leadsGenerated, 0),
      totalRevenueUsd: campaigns.reduce((s, c) => s + c.revenueAttributedUsd, 0),
      avgRoiPct: Math.round(avgRoi * 10) / 10,
    };
  }
}
