/**
 * PhysicalAccessManager — badge-based physical access control: badge issuance,
 * zone access grants, entry/exit logging, and anti-passback / access checks.
 *
 * Events:
 *   - "physaccess.badge_issued": { badgeId, holderId, zones }
 *   - "physaccess.access_granted": { badgeId, zone, at }
 *   - "physaccess.access_denied": { badgeId, zone, reason }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type BadgeStatus = "active" | "suspended" | "revoked";

export interface Badge {
  id: string;
  holderId: string;
  holderName: string;
  zones: string[]; // authorized zone codes
  status: BadgeStatus;
  issuedAt: string;
}

export interface AccessEvent {
  id: string;
  badgeId: string;
  zone: string;
  direction: "entry" | "exit";
  granted: boolean;
  reason?: string;
  at: string;
}

export interface PhysicalAccessSummary {
  totalBadges: number;
  activeBadges: number;
  totalEvents: number;
  grantedEvents: number;
  deniedEvents: number;
  currentlyInside: number;
}

export class PhysicalAccessManager {
  private badges: Map<string, Badge> = new Map();
  private events: AccessEvent[] = [];
  private inside: Map<string, string> = new Map(); // badgeId -> zone

  constructor(private readonly bus: EventBus) {}

  issueBadge(holderId: string, holderName: string, zones: string[]): Badge {
    const badge: Badge = { id: randomUUID(), holderId, holderName, zones, status: "active", issuedAt: new Date().toISOString() };
    this.badges.set(badge.id, badge);
    this.bus.publish("physaccess.badge_issued", { badgeId: badge.id, holderId, zones });
    return badge;
  }

  setStatus(badgeId: string, status: BadgeStatus): Badge | undefined {
    const badge = this.badges.get(badgeId);
    if (!badge) return undefined;
    badge.status = status;
    return badge;
  }

  grantZone(badgeId: string, zone: string): Badge | undefined {
    const badge = this.badges.get(badgeId);
    if (!badge) return undefined;
    if (!badge.zones.includes(zone)) badge.zones.push(zone);
    return badge;
  }

  attemptEntry(badgeId: string, zone: string, at: string): AccessEvent {
    const badge = this.badges.get(badgeId);
    let granted = true;
    let reason: string | undefined;
    if (!badge) { granted = false; reason = "unknown_badge"; }
    else if (badge.status !== "active") { granted = false; reason = "badge_" + badge.status; }
    else if (!badge.zones.includes(zone)) { granted = false; reason = "zone_not_authorized"; }
    else if (this.inside.has(badgeId)) { granted = false; reason = "anti_passback"; }
    const event: AccessEvent = { id: randomUUID(), badgeId, zone, direction: "entry", granted, reason, at };
    this.events.push(event);
    if (granted) {
      this.inside.set(badgeId, zone);
      this.bus.publish("physaccess.access_granted", { badgeId, zone, at });
    } else {
      this.bus.publish("physaccess.access_denied", { badgeId, zone, reason });
    }
    return event;
  }

  recordExit(badgeId: string, zone: string, at: string): AccessEvent {
    const event: AccessEvent = { id: randomUUID(), badgeId, zone, direction: "exit", granted: true, at };
    this.events.push(event);
    this.inside.delete(badgeId);
    return event;
  }

  getBadge(id: string): Badge | undefined { return this.badges.get(id); }
  isInside(badgeId: string): boolean { return this.inside.has(badgeId); }
  listBadges(status?: BadgeStatus): Badge[] {
    const all = Array.from(this.badges.values());
    return status ? all.filter(b => b.status === status) : all;
  }
  listEvents(badgeId?: string, grantedOnly?: boolean): AccessEvent[] {
    let all = [...this.events];
    if (badgeId) all = all.filter(e => e.badgeId === badgeId);
    if (grantedOnly !== undefined) all = all.filter(e => e.granted === grantedOnly);
    return all;
  }

  summary(): PhysicalAccessSummary {
    const badges = Array.from(this.badges.values());
    return {
      totalBadges: badges.length,
      activeBadges: badges.filter(b => b.status === "active").length,
      totalEvents: this.events.length,
      grantedEvents: this.events.filter(e => e.granted && e.direction === "entry").length,
      deniedEvents: this.events.filter(e => !e.granted).length,
      currentlyInside: this.inside.size,
    };
  }
}
