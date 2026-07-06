/**
 * PhishingSimulationManager — security-awareness phishing simulations: campaign
 * targets, per-recipient outcome (delivered/opened/clicked/reported/trained),
 * and click/report-rate analytics.
 *
 * Events:
 *   - "phishing.campaign_launched": { campaignId, name, targetCount }
 *   - "phishing.clicked": { campaignId, recipientId }
 *   - "phishing.reported": { campaignId, recipientId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CampaignStatus = "active" | "completed";
export type RecipientOutcome = "delivered" | "opened" | "clicked" | "reported";

export interface Target {
  recipientId: string;
  email: string;
  outcome: RecipientOutcome;
  trainingAssigned: boolean;
  trainingCompleted: boolean;
}

export interface PhishingCampaign {
  id: string;
  name: string;
  template: string;
  status: CampaignStatus;
  targets: Target[];
  launchedAt: string;
  completedAt?: string;
}

export interface PhishingSummary {
  totalCampaigns: number;
  totalTargets: number;
  clicked: number;
  reported: number;
  clickRatePct: number;
  reportRatePct: number;
  trainingCompletionPct: number;
}

export class PhishingSimulationManager {
  private campaigns: Map<string, PhishingCampaign> = new Map();

  constructor(private readonly bus: EventBus) {}

  launch(name: string, template: string, recipients: { recipientId: string; email: string }[]): PhishingCampaign {
    const campaign: PhishingCampaign = {
      id: randomUUID(),
      name,
      template,
      status: "active",
      targets: recipients.map(r => ({ recipientId: r.recipientId, email: r.email, outcome: "delivered", trainingAssigned: false, trainingCompleted: false })),
      launchedAt: new Date().toISOString(),
    };
    this.campaigns.set(campaign.id, campaign);
    this.bus.publish("phishing.campaign_launched", { campaignId: campaign.id, name, targetCount: recipients.length });
    return campaign;
  }

  private target(campaignId: string, recipientId: string): Target | undefined {
    return this.campaigns.get(campaignId)?.targets.find(t => t.recipientId === recipientId);
  }

  recordOpen(campaignId: string, recipientId: string): Target | undefined {
    const t = this.target(campaignId, recipientId);
    if (!t || t.outcome !== "delivered") return undefined;
    t.outcome = "opened";
    return t;
  }

  recordClick(campaignId: string, recipientId: string): Target | undefined {
    const t = this.target(campaignId, recipientId);
    if (!t || t.outcome === "reported") return undefined;
    t.outcome = "clicked";
    t.trainingAssigned = true; // auto-assign remedial training
    this.bus.publish("phishing.clicked", { campaignId, recipientId });
    return t;
  }

  recordReport(campaignId: string, recipientId: string): Target | undefined {
    const t = this.target(campaignId, recipientId);
    if (!t) return undefined;
    t.outcome = "reported";
    this.bus.publish("phishing.reported", { campaignId, recipientId });
    return t;
  }

  completeTraining(campaignId: string, recipientId: string): Target | undefined {
    const t = this.target(campaignId, recipientId);
    if (!t || !t.trainingAssigned) return undefined;
    t.trainingCompleted = true;
    return t;
  }

  complete(campaignId: string, asOf: string): PhishingCampaign | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.status === "completed") return undefined;
    campaign.status = "completed";
    campaign.completedAt = asOf;
    return campaign;
  }

  getCampaign(id: string): PhishingCampaign | undefined { return this.campaigns.get(id); }
  listCampaigns(status?: CampaignStatus): PhishingCampaign[] {
    const all = Array.from(this.campaigns.values());
    return status ? all.filter(c => c.status === status) : all;
  }

  summary(): PhishingSummary {
    const campaigns = Array.from(this.campaigns.values());
    const targets = campaigns.flatMap(c => c.targets);
    const clicked = targets.filter(t => t.outcome === "clicked").length;
    const reported = targets.filter(t => t.outcome === "reported").length;
    const assigned = targets.filter(t => t.trainingAssigned);
    return {
      totalCampaigns: campaigns.length,
      totalTargets: targets.length,
      clicked,
      reported,
      clickRatePct: targets.length > 0 ? Math.round((clicked / targets.length) * 100) : 0,
      reportRatePct: targets.length > 0 ? Math.round((reported / targets.length) * 100) : 0,
      trainingCompletionPct: assigned.length > 0 ? Math.round((assigned.filter(t => t.trainingCompleted).length / assigned.length) * 100) : 0,
    };
  }
}
