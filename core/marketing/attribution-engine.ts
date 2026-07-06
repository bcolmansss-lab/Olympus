/**
 * MarketingAttributionEngine — multi-touch attribution, channel ROI, campaign performance.
 *
 * Attribution models:
 *   - first_touch: 100% credit to first channel
 *   - last_touch: 100% credit to last channel
 *   - linear: equal credit across all touchpoints
 *   - time_decay: exponential decay, most recent gets most credit (half-life 7 days)
 *   - position_based: 40% first, 40% last, 20% spread across middle
 *
 * Events:
 *   - "marketing.conversion": { conversionId, dealId, totalRevenue, model, attribution }
 *   - "marketing.campaign_updated": { campaignId, name, spend, attributedRevenue, roi }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type AttributionModel = "first_touch" | "last_touch" | "linear" | "time_decay" | "position_based";
export type ChannelType = "organic_search" | "paid_search" | "paid_social" | "email" | "direct" | "referral" | "content" | "event" | "partner";

export interface TouchPoint {
  channel: ChannelType;
  timestamp: string; // ISO
  campaignId?: string;
  source?: string;
  medium?: string;
}

export interface Conversion {
  id: string;
  dealId?: string;
  accountId?: string;
  touchPoints: TouchPoint[];
  convertedAt: string;
  revenueUsd: number;
  model: AttributionModel;
  /** channel → credited USD */
  attribution: Record<string, number>;
}

export interface Campaign {
  id: string;
  name: string;
  channel: ChannelType;
  startDate: string;
  endDate?: string;
  budgetUsd: number;
  spendUsd: number;
  impressions: number;
  clicks: number;
  leads: number;
}

export interface ChannelSummary {
  channel: ChannelType;
  attributedRevenue: number;
  spend: number;
  roi: number; // (revenue - spend) / spend * 100
  conversions: number;
  avgDealSize: number;
}

export interface AttributionSummary {
  model: AttributionModel;
  totalConversions: number;
  totalRevenue: number;
  totalSpend: number;
  overallRoi: number;
  byChannel: ChannelSummary[];
  topCampaigns: Array<{ campaignId: string; name: string; attributedRevenue: number; roi: number }>;
}

export class MarketingAttributionEngine {
  private readonly bus: EventBus;
  private conversions: Map<string, Conversion> = new Map();
  private campaigns: Map<string, Campaign> = new Map();

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  addCampaign(input: Omit<Campaign, "id"> & { id?: string }): Campaign {
    const campaign: Campaign = {
      id: input.id ?? randomUUID(),
      name: input.name,
      channel: input.channel,
      startDate: input.startDate,
      endDate: input.endDate,
      budgetUsd: input.budgetUsd,
      spendUsd: input.spendUsd,
      impressions: input.impressions,
      clicks: input.clicks,
      leads: input.leads,
    };
    this.campaigns.set(campaign.id, campaign);
    return campaign;
  }

  updateCampaignSpend(
    id: string,
    spendUsd: number,
    impressions?: number,
    clicks?: number,
    leads?: number,
  ): Campaign | undefined {
    const campaign = this.campaigns.get(id);
    if (!campaign) return undefined;

    campaign.spendUsd = spendUsd;
    if (impressions !== undefined) campaign.impressions = impressions;
    if (clicks !== undefined) campaign.clicks = clicks;
    if (leads !== undefined) campaign.leads = leads;

    // Compute attributed revenue using linear model for ROI
    const channelSummaries = this.getChannelSummary("linear");
    const attributedRevenue = channelSummaries.reduce((sum, s) => {
      // Find revenue from conversions that have a touchpoint with this campaign
      return sum;
    }, 0);

    // More accurate: sum up conversion revenue attributed to this campaign's channel
    let campaignRevenue = 0;
    for (const conversion of this.conversions.values()) {
      const hasCampaignTouch = conversion.touchPoints.some((tp) => tp.campaignId === id);
      if (hasCampaignTouch) {
        // Use the linear model attribution for this campaign's channel
        const linearAttrib = this.computeAttribution(conversion.touchPoints, conversion.revenueUsd, "linear");
        for (const tp of conversion.touchPoints) {
          if (tp.campaignId === id) {
            // Get the per-touchpoint share
            const tpCount = conversion.touchPoints.length;
            campaignRevenue += conversion.revenueUsd / tpCount;
          }
        }
        void linearAttrib; // computed above for correctness
      }
    }

    const roi = campaign.spendUsd > 0 ? (campaignRevenue - campaign.spendUsd) / campaign.spendUsd * 100 : 0;

    this.bus.publish("marketing.campaign_updated", {
      campaignId: campaign.id,
      name: campaign.name,
      spend: campaign.spendUsd,
      attributedRevenue: campaignRevenue,
      roi,
    });

    return campaign;
  }

  recordConversion(input: {
    dealId?: string;
    accountId?: string;
    touchPoints: TouchPoint[];
    convertedAt: string;
    revenueUsd: number;
    model?: AttributionModel;
    id?: string;
  }): Conversion {
    const model = input.model ?? "linear";
    const attribution = this.computeAttributionWithDate(input.touchPoints, input.revenueUsd, model, input.convertedAt);

    const conversion: Conversion = {
      id: input.id ?? randomUUID(),
      dealId: input.dealId,
      accountId: input.accountId,
      touchPoints: input.touchPoints,
      convertedAt: input.convertedAt,
      revenueUsd: input.revenueUsd,
      model,
      attribution,
    };

    this.conversions.set(conversion.id, conversion);

    this.bus.publish("marketing.conversion", {
      conversionId: conversion.id,
      dealId: conversion.dealId,
      totalRevenue: conversion.revenueUsd,
      model,
      attribution,
    });

    return conversion;
  }

  private computeAttribution(
    touchPoints: TouchPoint[],
    revenueUsd: number,
    model: AttributionModel,
  ): Record<string, number> {
    if (touchPoints.length === 0) return {};

    const result: Record<string, number> = {};

    if (model === "first_touch") {
      const first = touchPoints[0]!;
      result[first.channel] = (result[first.channel] ?? 0) + revenueUsd;
    } else if (model === "last_touch") {
      const last = touchPoints[touchPoints.length - 1]!;
      result[last.channel] = (result[last.channel] ?? 0) + revenueUsd;
    } else if (model === "linear") {
      const share = revenueUsd / touchPoints.length;
      for (const tp of touchPoints) {
        result[tp.channel] = (result[tp.channel] ?? 0) + share;
      }
    } else if (model === "time_decay") {
      // half-life = 7 days; weight = exp(-ageDays / (7 / ln(2)))
      const convertedMs = new Date(
        // Use a fixed reference if convertedAt is provided via touchPoints context
        touchPoints[touchPoints.length - 1]!.timestamp
      ).getTime();
      // We need convertedAt but it's not passed here; use the last touchpoint as proxy
      // Actually we need to find convertedAt — but it's not a parameter.
      // We'll pass it via a closure trick: since we call this from recordConversion we know convertedAt.
      // For internal use, we'll use the last touchpoint timestamp as convertedAt proxy.
      const ln2 = Math.LN2;
      const halfLifeDays = 7;
      const weights: number[] = touchPoints.map((tp) => {
        const tpMs = new Date(tp.timestamp).getTime();
        const ageDays = (convertedMs - tpMs) / (1000 * 60 * 60 * 24);
        return Math.exp(-ageDays / (halfLifeDays / ln2));
      });
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < touchPoints.length; i++) {
        const tp = touchPoints[i]!;
        const w = totalWeight > 0 ? weights[i]! / totalWeight : 1 / touchPoints.length;
        result[tp.channel] = (result[tp.channel] ?? 0) + revenueUsd * w;
      }
    } else if (model === "position_based") {
      const n = touchPoints.length;
      if (n === 1) {
        result[touchPoints[0]!.channel] = (result[touchPoints[0]!.channel] ?? 0) + revenueUsd;
      } else if (n === 2) {
        result[touchPoints[0]!.channel] = (result[touchPoints[0]!.channel] ?? 0) + revenueUsd * 0.5;
        result[touchPoints[1]!.channel] = (result[touchPoints[1]!.channel] ?? 0) + revenueUsd * 0.5;
      } else {
        // 40% first, 40% last, 20% spread across middle
        result[touchPoints[0]!.channel] = (result[touchPoints[0]!.channel] ?? 0) + revenueUsd * 0.4;
        result[touchPoints[n - 1]!.channel] = (result[touchPoints[n - 1]!.channel] ?? 0) + revenueUsd * 0.4;
        const middleShare = (revenueUsd * 0.2) / (n - 2);
        for (let i = 1; i < n - 1; i++) {
          result[touchPoints[i]!.channel] = (result[touchPoints[i]!.channel] ?? 0) + middleShare;
        }
      }
    }

    return result;
  }

  private computeAttributionWithDate(
    touchPoints: TouchPoint[],
    revenueUsd: number,
    model: AttributionModel,
    convertedAt: string,
  ): Record<string, number> {
    if (model !== "time_decay") {
      return this.computeAttribution(touchPoints, revenueUsd, model);
    }

    if (touchPoints.length === 0) return {};

    const convertedMs = new Date(convertedAt).getTime();
    const ln2 = Math.LN2;
    const halfLifeDays = 7;
    const weights: number[] = touchPoints.map((tp) => {
      const tpMs = new Date(tp.timestamp).getTime();
      const ageDays = (convertedMs - tpMs) / (1000 * 60 * 60 * 24);
      return Math.exp(-ageDays / (halfLifeDays / ln2));
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const result: Record<string, number> = {};
    for (let i = 0; i < touchPoints.length; i++) {
      const tp = touchPoints[i]!;
      const w = totalWeight > 0 ? weights[i]! / totalWeight : 1 / touchPoints.length;
      result[tp.channel] = (result[tp.channel] ?? 0) + revenueUsd * w;
    }
    return result;
  }

  getChannelSummary(model: AttributionModel = "linear"): ChannelSummary[] {
    // Aggregate attributed revenue by channel
    const channelRevenue = new Map<ChannelType, number>();
    const channelConversions = new Map<ChannelType, number>();

    for (const conversion of this.conversions.values()) {
      // Recompute with the requested model
      const attrib = this.computeAttributionWithDate(
        conversion.touchPoints,
        conversion.revenueUsd,
        model,
        conversion.convertedAt,
      );

      // Track which channels contributed
      const channelsSeen = new Set<ChannelType>();
      for (const tp of conversion.touchPoints) {
        channelsSeen.add(tp.channel);
      }

      for (const [channel, amount] of Object.entries(attrib)) {
        const ch = channel as ChannelType;
        channelRevenue.set(ch, (channelRevenue.get(ch) ?? 0) + amount);
      }

      // Count conversion per channel (once per conversion that has any touchpoint in that channel)
      for (const ch of channelsSeen) {
        if (attrib[ch] !== undefined) {
          channelConversions.set(ch, (channelConversions.get(ch) ?? 0) + 1);
        }
      }
    }

    // Aggregate spend by channel from campaigns
    const channelSpend = new Map<ChannelType, number>();
    for (const campaign of this.campaigns.values()) {
      channelSpend.set(campaign.channel, (channelSpend.get(campaign.channel) ?? 0) + campaign.spendUsd);
    }

    // Build summaries for all channels that appear in either revenue or spend
    const allChannels = new Set<ChannelType>([
      ...channelRevenue.keys(),
      ...channelSpend.keys(),
    ]);

    const summaries: ChannelSummary[] = [];
    for (const channel of allChannels) {
      const attributedRevenue = channelRevenue.get(channel) ?? 0;
      const spend = channelSpend.get(channel) ?? 0;
      const conversions = channelConversions.get(channel) ?? 0;
      const roi = spend > 0 ? (attributedRevenue - spend) / spend * 100 : 0;
      const avgDealSize = conversions > 0 ? attributedRevenue / conversions : 0;

      summaries.push({ channel, attributedRevenue, spend, roi, conversions, avgDealSize });
    }

    return summaries.sort((a, b) => b.attributedRevenue - a.attributedRevenue);
  }

  summary(model: AttributionModel = "linear"): AttributionSummary {
    const byChannel = this.getChannelSummary(model);
    const totalRevenue = byChannel.reduce((s, c) => s + c.attributedRevenue, 0);
    const totalSpend = byChannel.reduce((s, c) => s + c.spend, 0);
    const overallRoi = totalSpend > 0 ? (totalRevenue - totalSpend) / totalSpend * 100 : 0;

    // Top campaigns: compute attributed revenue per campaign
    const campaignRevenue = new Map<string, number>();
    for (const conversion of this.conversions.values()) {
      const attrib = this.computeAttributionWithDate(
        conversion.touchPoints,
        conversion.revenueUsd,
        model,
        conversion.convertedAt,
      );
      for (const tp of conversion.touchPoints) {
        if (tp.campaignId) {
          // Attribute campaign share proportionally to touchpoint's channel share
          // Divide the channel's total attribution share among touchpoints in that channel
          const tpsInChannel = conversion.touchPoints.filter((t) => t.channel === tp.channel);
          const channelRevenue = attrib[tp.channel] ?? 0;
          const tpShare = channelRevenue / tpsInChannel.length;
          campaignRevenue.set(tp.campaignId, (campaignRevenue.get(tp.campaignId) ?? 0) + tpShare);
        }
      }
    }

    const topCampaigns = Array.from(this.campaigns.values())
      .map((c) => {
        const attributedRevenue = campaignRevenue.get(c.id) ?? 0;
        const roi = c.spendUsd > 0 ? (attributedRevenue - c.spendUsd) / c.spendUsd * 100 : 0;
        return { campaignId: c.id, name: c.name, attributedRevenue, roi };
      })
      .sort((a, b) => b.attributedRevenue - a.attributedRevenue)
      .slice(0, 5);

    return {
      model,
      totalConversions: this.conversions.size,
      totalRevenue,
      totalSpend,
      overallRoi,
      byChannel,
      topCampaigns,
    };
  }

  getCampaign(id: string): Campaign | undefined {
    return this.campaigns.get(id);
  }

  listCampaigns(): Campaign[] {
    return Array.from(this.campaigns.values());
  }

  getConversion(id: string): Conversion | undefined {
    return this.conversions.get(id);
  }

  listConversions(): Conversion[] {
    return Array.from(this.conversions.values());
  }
}
