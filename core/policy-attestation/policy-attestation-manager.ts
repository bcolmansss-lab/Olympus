/**
 * PolicyAttestationManager — policy sign-off campaigns: publish a policy
 * version, assign attestations to a population, collect signatures, and track
 * completion / overdue for compliance evidence.
 *
 * Events:
 *   - "attestation.campaign_launched": { campaignId, policy, version, assigned }
 *   - "attestation.signed": { campaignId, userId }
 *   - "attestation.overdue": { campaignId, outstanding }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CampaignStatus = "active" | "closed";

export interface AttestationRecord {
  userId: string;
  signed: boolean;
  signedAt?: string;
}

export interface AttestationCampaign {
  id: string;
  policy: string;
  version: string;
  status: CampaignStatus;
  dueDate: string;
  records: AttestationRecord[];
  launchedAt: string;
}

export interface AttestationSummary {
  totalCampaigns: number;
  active: number;
  totalAssigned: number;
  totalSigned: number;
  completionPct: number;
}

export class PolicyAttestationManager {
  private campaigns: Map<string, AttestationCampaign> = new Map();

  constructor(private readonly bus: EventBus) {}

  launch(input: { policy: string; version: string; dueDate: string; population: string[] }): AttestationCampaign {
    const campaign: AttestationCampaign = {
      id: randomUUID(),
      policy: input.policy,
      version: input.version,
      status: "active",
      dueDate: input.dueDate,
      records: Array.from(new Set(input.population)).map(u => ({ userId: u, signed: false })),
      launchedAt: new Date().toISOString(),
    };
    this.campaigns.set(campaign.id, campaign);
    this.bus.publish("attestation.campaign_launched", { campaignId: campaign.id, policy: campaign.policy, version: campaign.version, assigned: campaign.records.length });
    return campaign;
  }

  sign(campaignId: string, userId: string, asOf: string): AttestationRecord | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.status !== "active") return undefined;
    const record = campaign.records.find(r => r.userId === userId);
    if (!record || record.signed) return undefined;
    record.signed = true;
    record.signedAt = asOf;
    this.bus.publish("attestation.signed", { campaignId, userId });
    return record;
  }

  completionPct(campaignId: string): number {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.records.length === 0) return 0;
    return Math.round((campaign.records.filter(r => r.signed).length / campaign.records.length) * 100);
  }

  outstanding(campaignId: string): string[] {
    const campaign = this.campaigns.get(campaignId);
    return campaign ? campaign.records.filter(r => !r.signed).map(r => r.userId) : [];
  }

  /** Emit overdue if past due date with outstanding signers. */
  checkOverdue(campaignId: string, asOf: string): boolean {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.status !== "active") return false;
    if (new Date(asOf).getTime() <= new Date(campaign.dueDate).getTime()) return false;
    const out = this.outstanding(campaignId);
    if (out.length > 0) {
      this.bus.publish("attestation.overdue", { campaignId, outstanding: out.length });
      return true;
    }
    return false;
  }

  close(campaignId: string): AttestationCampaign | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return undefined;
    campaign.status = "closed";
    return campaign;
  }

  getCampaign(id: string): AttestationCampaign | undefined { return this.campaigns.get(id); }
  listCampaigns(status?: CampaignStatus): AttestationCampaign[] {
    const all = Array.from(this.campaigns.values());
    return status ? all.filter(c => c.status === status) : all;
  }

  summary(): AttestationSummary {
    const campaigns = Array.from(this.campaigns.values());
    const records = campaigns.flatMap(c => c.records);
    const signed = records.filter(r => r.signed).length;
    return {
      totalCampaigns: campaigns.length,
      active: campaigns.filter(c => c.status === "active").length,
      totalAssigned: records.length,
      totalSigned: signed,
      completionPct: records.length > 0 ? Math.round((signed / records.length) * 100) : 0,
    };
  }
}
