/**
 * PreorderManager — preorder campaigns: capacity-limited preorders with deposit
 * collection, allocation on stock availability, and fulfillment/cancellation.
 *
 * Events:
 *   - "preorder.campaign_opened": { campaignId, sku, capacity, releaseDate }
 *   - "preorder.reserved": { preorderId, campaignId, customerId }
 *   - "preorder.fulfilled": { preorderId, customerId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CampaignStatus = "open" | "sold_out" | "released" | "cancelled";
export type PreorderStatus = "reserved" | "fulfilled" | "refunded";

export interface PreorderCampaign {
  id: string;
  sku: string;
  productName: string;
  capacity: number;
  reserved: number;
  depositUsd: number;
  fullPriceUsd: number;
  status: CampaignStatus;
  releaseDate: string;
  createdAt: string;
}

export interface Preorder {
  id: string;
  campaignId: string;
  customerId: string;
  status: PreorderStatus;
  depositPaidUsd: number;
  reservedAt: string;
  fulfilledAt?: string;
}

export interface PreorderSummary {
  totalCampaigns: number;
  open: number;
  totalPreorders: number;
  fulfilled: number;
  totalDepositsUsd: number;
  expectedRevenueUsd: number;
}

export class PreorderManager {
  private campaigns: Map<string, PreorderCampaign> = new Map();
  private preorders: Map<string, Preorder> = new Map();

  constructor(private readonly bus: EventBus) {}

  openCampaign(input: { sku: string; productName: string; capacity: number; depositUsd: number; fullPriceUsd: number; releaseDate: string }): PreorderCampaign {
    const campaign: PreorderCampaign = { ...input, id: randomUUID(), reserved: 0, status: "open", createdAt: new Date().toISOString() };
    this.campaigns.set(campaign.id, campaign);
    this.bus.publish("preorder.campaign_opened", { campaignId: campaign.id, sku: campaign.sku, capacity: campaign.capacity, releaseDate: campaign.releaseDate });
    return campaign;
  }

  reserve(campaignId: string, customerId: string, asOf: string): Preorder | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.status !== "open") return undefined;
    if (campaign.reserved >= campaign.capacity) return undefined;
    const preorder: Preorder = { id: randomUUID(), campaignId, customerId, status: "reserved", depositPaidUsd: campaign.depositUsd, reservedAt: asOf };
    this.preorders.set(preorder.id, preorder);
    campaign.reserved += 1;
    this.bus.publish("preorder.reserved", { preorderId: preorder.id, campaignId, customerId });
    if (campaign.reserved >= campaign.capacity) campaign.status = "sold_out";
    return preorder;
  }

  release(campaignId: string): PreorderCampaign | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.status === "cancelled") return undefined;
    campaign.status = "released";
    return campaign;
  }

  fulfill(preorderId: string, asOf: string): Preorder | undefined {
    const preorder = this.preorders.get(preorderId);
    if (!preorder || preorder.status !== "reserved") return undefined;
    preorder.status = "fulfilled";
    preorder.fulfilledAt = asOf;
    this.bus.publish("preorder.fulfilled", { preorderId, customerId: preorder.customerId });
    return preorder;
  }

  refund(preorderId: string): Preorder | undefined {
    const preorder = this.preorders.get(preorderId);
    if (!preorder || preorder.status === "fulfilled") return undefined;
    preorder.status = "refunded";
    const campaign = this.campaigns.get(preorder.campaignId);
    if (campaign && campaign.reserved > 0) {
      campaign.reserved -= 1;
      if (campaign.status === "sold_out") campaign.status = "open";
    }
    return preorder;
  }

  getCampaign(id: string): PreorderCampaign | undefined { return this.campaigns.get(id); }
  getPreorder(id: string): Preorder | undefined { return this.preorders.get(id); }
  listCampaigns(status?: CampaignStatus): PreorderCampaign[] {
    const all = Array.from(this.campaigns.values());
    return status ? all.filter(c => c.status === status) : all;
  }
  listPreorders(campaignId?: string, status?: PreorderStatus): Preorder[] {
    let all = Array.from(this.preorders.values());
    if (campaignId) all = all.filter(p => p.campaignId === campaignId);
    if (status) all = all.filter(p => p.status === status);
    return all;
  }

  summary(): PreorderSummary {
    const campaigns = Array.from(this.campaigns.values());
    const preorders = Array.from(this.preorders.values());
    const active = preorders.filter(p => p.status !== "refunded");
    return {
      totalCampaigns: campaigns.length,
      open: campaigns.filter(c => c.status === "open").length,
      totalPreorders: preorders.length,
      fulfilled: preorders.filter(p => p.status === "fulfilled").length,
      totalDepositsUsd: Math.round(active.reduce((s, p) => s + p.depositPaidUsd, 0) * 100) / 100,
      expectedRevenueUsd: Math.round(active.reduce((s, p) => {
        const c = this.campaigns.get(p.campaignId);
        return s + (c ? c.fullPriceUsd : 0);
      }, 0) * 100) / 100,
    };
  }
}
