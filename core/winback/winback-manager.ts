/**
 * WinbackManager — churned-customer winback campaigns: target segmentation,
 * offer assignment, outreach attempts, and reactivation conversion analytics.
 *
 * Events:
 *   - "winback.campaign_launched": { campaignId, name, targetCount }
 *   - "winback.offer_sent": { campaignId, customerId, offer }
 *   - "winback.reactivated": { campaignId, customerId, recoveredMrrUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type WinbackStatus = "active" | "completed";
export type TargetState = "targeted" | "contacted" | "reactivated" | "declined";

export interface WinbackTarget {
  customerId: string;
  lostMrrUsd: number;
  churnReason: string;
  state: TargetState;
  offer?: string;
  recoveredMrrUsd: number;
}

export interface WinbackCampaign {
  id: string;
  name: string;
  offer: string;
  status: WinbackStatus;
  targets: WinbackTarget[];
  createdAt: string;
}

export interface WinbackSummary {
  totalCampaigns: number;
  totalTargets: number;
  contacted: number;
  reactivated: number;
  reactivationRatePct: number;
  recoveredMrrUsd: number;
}

export class WinbackManager {
  private campaigns: Map<string, WinbackCampaign> = new Map();

  constructor(private readonly bus: EventBus) {}

  launch(name: string, offer: string, targets: { customerId: string; lostMrrUsd: number; churnReason: string }[]): WinbackCampaign {
    const campaign: WinbackCampaign = {
      id: randomUUID(),
      name,
      offer,
      status: "active",
      targets: targets.map(t => ({ customerId: t.customerId, lostMrrUsd: t.lostMrrUsd, churnReason: t.churnReason, state: "targeted", recoveredMrrUsd: 0 })),
      createdAt: new Date().toISOString(),
    };
    this.campaigns.set(campaign.id, campaign);
    this.bus.publish("winback.campaign_launched", { campaignId: campaign.id, name, targetCount: targets.length });
    return campaign;
  }

  sendOffer(campaignId: string, customerId: string, offer?: string): WinbackTarget | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.status !== "active") return undefined;
    const target = campaign.targets.find(t => t.customerId === customerId);
    if (!target || target.state !== "targeted") return undefined;
    target.state = "contacted";
    target.offer = offer ?? campaign.offer;
    this.bus.publish("winback.offer_sent", { campaignId, customerId, offer: target.offer });
    return target;
  }

  reactivate(campaignId: string, customerId: string, recoveredMrrUsd: number): WinbackTarget | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return undefined;
    const target = campaign.targets.find(t => t.customerId === customerId);
    if (!target || target.state !== "contacted") return undefined;
    target.state = "reactivated";
    target.recoveredMrrUsd = recoveredMrrUsd;
    this.bus.publish("winback.reactivated", { campaignId, customerId, recoveredMrrUsd });
    return target;
  }

  decline(campaignId: string, customerId: string): WinbackTarget | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return undefined;
    const target = campaign.targets.find(t => t.customerId === customerId);
    if (!target || target.state === "reactivated") return undefined;
    target.state = "declined";
    return target;
  }

  complete(campaignId: string): WinbackCampaign | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return undefined;
    campaign.status = "completed";
    return campaign;
  }

  reactivationRate(campaignId: string): number {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.targets.length === 0) return 0;
    return Math.round((campaign.targets.filter(t => t.state === "reactivated").length / campaign.targets.length) * 100);
  }

  getCampaign(id: string): WinbackCampaign | undefined { return this.campaigns.get(id); }
  listCampaigns(status?: WinbackStatus): WinbackCampaign[] {
    const all = Array.from(this.campaigns.values());
    return status ? all.filter(c => c.status === status) : all;
  }

  summary(): WinbackSummary {
    const campaigns = Array.from(this.campaigns.values());
    const targets = campaigns.flatMap(c => c.targets);
    const reactivated = targets.filter(t => t.state === "reactivated");
    const contacted = targets.filter(t => t.state !== "targeted").length;
    return {
      totalCampaigns: campaigns.length,
      totalTargets: targets.length,
      contacted,
      reactivated: reactivated.length,
      reactivationRatePct: targets.length > 0 ? Math.round((reactivated.length / targets.length) * 100) : 0,
      recoveredMrrUsd: Math.round(reactivated.reduce((s, t) => s + t.recoveredMrrUsd, 0) * 100) / 100,
    };
  }
}
