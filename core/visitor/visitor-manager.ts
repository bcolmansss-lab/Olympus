/**
 * VisitorManager — facility visitor pre-registration, check-in/check-out,
 * host notification, NDA/badge tracking, and on-site headcount.
 *
 * Events:
 *   - "visitor.preregistered": { visitId, visitorName, hostId, expectedAt }
 *   - "visitor.checked_in": { visitId, visitorName, badgeNumber }
 *   - "visitor.checked_out": { visitId, durationMinutes }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type VisitStatus = "preregistered" | "checked_in" | "checked_out" | "no_show" | "cancelled";
export type VisitPurpose = "meeting" | "interview" | "delivery" | "contractor" | "tour" | "other";

export interface Visit {
  id: string;
  visitorName: string;
  visitorCompany?: string;
  hostId: string;
  purpose: VisitPurpose;
  status: VisitStatus;
  expectedAt: string;
  ndaSigned: boolean;
  badgeNumber?: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  createdAt: string;
}

export interface VisitorSummary {
  totalVisits: number;
  onSite: number;
  preregistered: number;
  checkedOut: number;
  noShows: number;
  byPurpose: Partial<Record<VisitPurpose, number>>;
}

export class VisitorManager {
  private visits: Map<string, Visit> = new Map();
  private badgeSeq = 0;

  constructor(private readonly bus: EventBus) {}

  preregister(input: { visitorName: string; visitorCompany?: string; hostId: string; purpose: VisitPurpose; expectedAt: string }): Visit {
    const visit: Visit = { ...input, id: randomUUID(), status: "preregistered", ndaSigned: false, createdAt: new Date().toISOString() };
    this.visits.set(visit.id, visit);
    this.bus.publish("visitor.preregistered", { visitId: visit.id, visitorName: visit.visitorName, hostId: visit.hostId, expectedAt: visit.expectedAt });
    return visit;
  }

  signNDA(visitId: string): Visit | undefined {
    const visit = this.visits.get(visitId);
    if (!visit) return undefined;
    visit.ndaSigned = true;
    return visit;
  }

  checkIn(visitId: string, asOf: string): Visit | undefined {
    const visit = this.visits.get(visitId);
    if (!visit || (visit.status !== "preregistered")) return undefined;
    this.badgeSeq += 1;
    const badgeNumber = `V-${String(this.badgeSeq).padStart(4, "0")}`;
    visit.status = "checked_in";
    visit.badgeNumber = badgeNumber;
    visit.checkedInAt = asOf;
    this.bus.publish("visitor.checked_in", { visitId, visitorName: visit.visitorName, badgeNumber });
    return visit;
  }

  checkOut(visitId: string, asOf: string): Visit | undefined {
    const visit = this.visits.get(visitId);
    if (!visit || visit.status !== "checked_in") return undefined;
    visit.status = "checked_out";
    visit.checkedOutAt = asOf;
    const durationMinutes = visit.checkedInAt ? Math.round((new Date(asOf).getTime() - new Date(visit.checkedInAt).getTime()) / 60000) : 0;
    this.bus.publish("visitor.checked_out", { visitId, durationMinutes });
    return visit;
  }

  markNoShow(visitId: string): Visit | undefined {
    const visit = this.visits.get(visitId);
    if (!visit || visit.status !== "preregistered") return undefined;
    visit.status = "no_show";
    return visit;
  }

  cancel(visitId: string): Visit | undefined {
    const visit = this.visits.get(visitId);
    if (!visit || visit.status === "checked_out") return undefined;
    visit.status = "cancelled";
    return visit;
  }

  getVisit(id: string): Visit | undefined { return this.visits.get(id); }
  currentlyOnSite(): Visit[] { return Array.from(this.visits.values()).filter(v => v.status === "checked_in"); }
  listVisits(status?: VisitStatus, hostId?: string): Visit[] {
    let all = Array.from(this.visits.values());
    if (status) all = all.filter(v => v.status === status);
    if (hostId) all = all.filter(v => v.hostId === hostId);
    return all;
  }

  summary(): VisitorSummary {
    const visits = Array.from(this.visits.values());
    const byPurpose: Partial<Record<VisitPurpose, number>> = {};
    for (const v of visits) { byPurpose[v.purpose] = (byPurpose[v.purpose] ?? 0) + 1; }
    return {
      totalVisits: visits.length,
      onSite: visits.filter(v => v.status === "checked_in").length,
      preregistered: visits.filter(v => v.status === "preregistered").length,
      checkedOut: visits.filter(v => v.status === "checked_out").length,
      noShows: visits.filter(v => v.status === "no_show").length,
      byPurpose,
    };
  }
}
