/**
 * InfluencerManager — influencer partnerships: roster with reach/engagement,
 * campaign collaborations with deliverables and fees, and ROI by performance.
 *
 * Events:
 *   - "influencer.onboarded": { influencerId, handle, followers }
 *   - "influencer.collab_started": { collabId, influencerId, feeUsd }
 *   - "influencer.collab_completed": { collabId, impressions, engagementRate }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type Platform = "instagram" | "youtube" | "tiktok" | "twitter" | "linkedin" | "twitch";
export type CollabStatus = "negotiating" | "active" | "completed" | "cancelled";

export interface Influencer {
  id: string;
  handle: string;
  platform: Platform;
  followers: number;
  engagementRatePct: number;
  niche: string;
  createdAt: string;
}

export interface Collaboration {
  id: string;
  influencerId: string;
  campaign: string;
  feeUsd: number;
  deliverables: string[];
  status: CollabStatus;
  impressions: number;
  clicks: number;
  conversions: number;
  startedAt: string;
  completedAt?: string;
}

export interface InfluencerSummary {
  totalInfluencers: number;
  totalCollabs: number;
  activeCollabs: number;
  totalSpendUsd: number;
  totalImpressions: number;
  totalConversions: number;
  costPerConversionUsd: number;
}

export class InfluencerManager {
  private influencers: Map<string, Influencer> = new Map();
  private collabs: Map<string, Collaboration> = new Map();

  constructor(private readonly bus: EventBus) {}

  onboard(input: { handle: string; platform: Platform; followers: number; engagementRatePct: number; niche: string }): Influencer {
    const influencer: Influencer = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.influencers.set(influencer.id, influencer);
    this.bus.publish("influencer.onboarded", { influencerId: influencer.id, handle: influencer.handle, followers: influencer.followers });
    return influencer;
  }

  startCollab(influencerId: string, campaign: string, feeUsd: number, deliverables: string[], startedAt: string): Collaboration | undefined {
    if (!this.influencers.get(influencerId)) return undefined;
    const collab: Collaboration = { id: randomUUID(), influencerId, campaign, feeUsd, deliverables, status: "active", impressions: 0, clicks: 0, conversions: 0, startedAt };
    this.collabs.set(collab.id, collab);
    this.bus.publish("influencer.collab_started", { collabId: collab.id, influencerId, feeUsd });
    return collab;
  }

  recordPerformance(collabId: string, impressions: number, clicks: number, conversions: number): Collaboration | undefined {
    const collab = this.collabs.get(collabId);
    if (!collab || collab.status !== "active") return undefined;
    collab.impressions += impressions;
    collab.clicks += clicks;
    collab.conversions += conversions;
    return collab;
  }

  completeCollab(collabId: string, asOf: string): Collaboration | undefined {
    const collab = this.collabs.get(collabId);
    if (!collab || collab.status !== "active") return undefined;
    collab.status = "completed";
    collab.completedAt = asOf;
    const engagementRate = collab.impressions > 0 ? Math.round((collab.clicks / collab.impressions) * 10000) / 100 : 0;
    this.bus.publish("influencer.collab_completed", { collabId, impressions: collab.impressions, engagementRate });
    return collab;
  }

  cancelCollab(collabId: string): Collaboration | undefined {
    const collab = this.collabs.get(collabId);
    if (!collab || collab.status === "completed") return undefined;
    collab.status = "cancelled";
    return collab;
  }

  getInfluencer(id: string): Influencer | undefined { return this.influencers.get(id); }
  getCollab(id: string): Collaboration | undefined { return this.collabs.get(id); }
  listInfluencers(platform?: Platform): Influencer[] {
    const all = Array.from(this.influencers.values());
    return platform ? all.filter(i => i.platform === platform) : all;
  }
  listCollabs(influencerId?: string, status?: CollabStatus): Collaboration[] {
    let all = Array.from(this.collabs.values());
    if (influencerId) all = all.filter(c => c.influencerId === influencerId);
    if (status) all = all.filter(c => c.status === status);
    return all;
  }

  summary(): InfluencerSummary {
    const collabs = Array.from(this.collabs.values());
    const spend = collabs.filter(c => c.status !== "cancelled").reduce((s, c) => s + c.feeUsd, 0);
    const conversions = collabs.reduce((s, c) => s + c.conversions, 0);
    return {
      totalInfluencers: this.influencers.size,
      totalCollabs: collabs.length,
      activeCollabs: collabs.filter(c => c.status === "active").length,
      totalSpendUsd: Math.round(spend * 100) / 100,
      totalImpressions: collabs.reduce((s, c) => s + c.impressions, 0),
      totalConversions: conversions,
      costPerConversionUsd: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : 0,
    };
  }
}
