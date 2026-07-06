/**
 * TradeShowManager — trade-show operations: show registration with booth
 * cost, staffing assignment, on-floor lead capture with quality ratings,
 * show closeout, and cost-per-lead reporting.
 *
 * Events:
 *   - "tradeshow.registered": { showId, name, boothCostUsd }
 *   - "tradeshow.lead_captured": { showId, leadId, quality }
 *   - "tradeshow.closed": { showId, leadCount, costPerLeadUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type TradeShowStatus = "registered" | "live" | "closed";
export type BoothLeadQuality = "hot" | "warm" | "cold";

export interface BoothLead {
  id: string;
  showId: string;
  contactName: string;
  company: string;
  quality: BoothLeadQuality;
  capturedAt: string;
}

export interface TradeShow {
  id: string;
  name: string;
  city: string;
  boothCostUsd: number;
  staff: string[];
  status: TradeShowStatus;
  startAt: string;
  endAt: string;
}

export interface TradeShowSummary {
  totalShows: number;
  liveShows: number;
  totalLeads: number;
  hotLeads: number;
  totalSpendUsd: number;
  avgCostPerLeadUsd: number;
}

export class TradeShowManager {
  private shows: Map<string, TradeShow> = new Map();
  private leads: Map<string, BoothLead> = new Map();

  constructor(private readonly bus: EventBus) {}

  register(name: string, city: string, boothCostUsd: number, startAt: string, endAt: string): TradeShow {
    const show: TradeShow = { id: randomUUID(), name, city, boothCostUsd, staff: [], status: "registered", startAt, endAt };
    this.shows.set(show.id, show);
    this.bus.publish("tradeshow.registered", { showId: show.id, name, boothCostUsd });
    return show;
  }

  assignStaff(showId: string, employeeId: string): TradeShow | undefined {
    const show = this.shows.get(showId);
    if (!show || show.status === "closed" || show.staff.includes(employeeId)) return undefined;
    show.staff.push(employeeId);
    return show;
  }

  goLive(showId: string): TradeShow | undefined {
    const show = this.shows.get(showId);
    if (!show || show.status !== "registered" || show.staff.length === 0) return undefined;
    show.status = "live";
    return show;
  }

  captureLead(showId: string, contactName: string, company: string, quality: BoothLeadQuality, capturedAt: string): BoothLead | undefined {
    const show = this.shows.get(showId);
    if (!show || show.status !== "live") return undefined;
    const lead: BoothLead = { id: randomUUID(), showId, contactName, company, quality, capturedAt };
    this.leads.set(lead.id, lead);
    this.bus.publish("tradeshow.lead_captured", { showId, leadId: lead.id, quality });
    return lead;
  }

  close(showId: string): { show: TradeShow; leadCount: number; costPerLeadUsd: number } | undefined {
    const show = this.shows.get(showId);
    if (!show || show.status !== "live") return undefined;
    show.status = "closed";
    const leadCount = this.leadsFor(showId).length;
    const costPerLeadUsd = leadCount > 0 ? Math.round((show.boothCostUsd / leadCount) * 100) / 100 : show.boothCostUsd;
    this.bus.publish("tradeshow.closed", { showId, leadCount, costPerLeadUsd });
    return { show, leadCount, costPerLeadUsd };
  }

  getShow(id: string): TradeShow | undefined { return this.shows.get(id); }
  leadsFor(showId: string, quality?: BoothLeadQuality): BoothLead[] {
    let all = Array.from(this.leads.values()).filter(l => l.showId === showId);
    if (quality) all = all.filter(l => l.quality === quality);
    return all;
  }
  listShows(status?: TradeShowStatus): TradeShow[] {
    const all = Array.from(this.shows.values());
    return status ? all.filter(s => s.status === status) : all;
  }

  summary(): TradeShowSummary {
    const shows = Array.from(this.shows.values());
    const leads = Array.from(this.leads.values());
    const closed = shows.filter(s => s.status === "closed");
    const closedSpend = closed.reduce((s, x) => s + x.boothCostUsd, 0);
    const closedLeads = leads.filter(l => closed.some(s => s.id === l.showId)).length;
    return {
      totalShows: shows.length,
      liveShows: shows.filter(s => s.status === "live").length,
      totalLeads: leads.length,
      hotLeads: leads.filter(l => l.quality === "hot").length,
      totalSpendUsd: Math.round(shows.reduce((s, x) => s + x.boothCostUsd, 0) * 100) / 100,
      avgCostPerLeadUsd: closedLeads > 0 ? Math.round((closedSpend / closedLeads) * 100) / 100 : 0,
    };
  }
}
