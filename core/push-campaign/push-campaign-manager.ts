/**
 * PushCampaignManager — mobile push campaigns: device token registry with
 * platform/opt-in, audience-targeted sends, delivery/open tracking, and
 * token hygiene (invalid-token pruning).
 *
 * Events:
 *   - "push.campaign_sent": { campaignId, targeted, delivered }
 *   - "push.opened": { campaignId, deviceId }
 *   - "push.token_invalidated": { deviceId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DevicePlatform = "ios" | "android" | "web";

export interface Device {
  deviceId: string;
  userId: string;
  platform: DevicePlatform;
  optedIn: boolean;
  valid: boolean;
  tags: string[];
}

export interface PushCampaign {
  id: string;
  title: string;
  body: string;
  targetTag?: string;
  targeted: number;
  delivered: number;
  opened: Set<string>;
  sentAt: string;
}

export interface PushSummary {
  totalDevices: number;
  optedIn: number;
  totalCampaigns: number;
  totalDelivered: number;
  avgOpenRatePct: number;
  invalidTokens: number;
}

export class PushCampaignManager {
  private devices: Map<string, Device> = new Map();
  private campaigns: Map<string, PushCampaign> = new Map();
  private invalidated = 0;

  constructor(private readonly bus: EventBus) {}

  registerDevice(deviceId: string, userId: string, platform: DevicePlatform, tags: string[] = []): Device {
    const device: Device = { deviceId, userId, platform, optedIn: true, valid: true, tags };
    this.devices.set(deviceId, device);
    return device;
  }

  setOptIn(deviceId: string, optedIn: boolean): Device | undefined {
    const d = this.devices.get(deviceId);
    if (!d) return undefined;
    d.optedIn = optedIn;
    return d;
  }

  invalidateToken(deviceId: string): Device | undefined {
    const d = this.devices.get(deviceId);
    if (!d || !d.valid) return undefined;
    d.valid = false;
    this.invalidated += 1;
    this.bus.publish("push.token_invalidated", { deviceId });
    return d;
  }

  /** Send to all opted-in, valid devices (optionally filtered by tag). */
  send(title: string, body: string, at: string, targetTag?: string): PushCampaign {
    const targets = Array.from(this.devices.values()).filter(d => d.optedIn && d.valid && (!targetTag || d.tags.includes(targetTag)));
    const campaign: PushCampaign = { id: randomUUID(), title, body, targetTag, targeted: targets.length, delivered: targets.length, opened: new Set(), sentAt: at };
    this.campaigns.set(campaign.id, campaign);
    this.bus.publish("push.campaign_sent", { campaignId: campaign.id, targeted: campaign.targeted, delivered: campaign.delivered });
    return campaign;
  }

  recordOpen(campaignId: string, deviceId: string): boolean {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || !this.devices.has(deviceId)) return false;
    if (campaign.opened.has(deviceId)) return false;
    campaign.opened.add(deviceId);
    this.bus.publish("push.opened", { campaignId, deviceId });
    return true;
  }

  openRatePct(campaignId: string): number {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.delivered === 0) return 0;
    return Math.round((campaign.opened.size / campaign.delivered) * 100);
  }

  getDevice(id: string): Device | undefined { return this.devices.get(id); }
  getCampaign(id: string): PushCampaign | undefined { return this.campaigns.get(id); }
  listCampaigns(): PushCampaign[] { return Array.from(this.campaigns.values()); }

  summary(): PushSummary {
    const devices = Array.from(this.devices.values());
    const campaigns = Array.from(this.campaigns.values());
    const rates = campaigns.map(c => this.openRatePct(c.id));
    return {
      totalDevices: devices.length,
      optedIn: devices.filter(d => d.optedIn && d.valid).length,
      totalCampaigns: campaigns.length,
      totalDelivered: campaigns.reduce((s, c) => s + c.delivered, 0),
      avgOpenRatePct: rates.length > 0 ? Math.round(rates.reduce((s, r) => s + r, 0) / rates.length) : 0,
      invalidTokens: this.invalidated,
    };
  }
}
