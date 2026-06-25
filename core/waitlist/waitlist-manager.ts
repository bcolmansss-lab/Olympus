/**
 * WaitlistManager — ordered waitlists for products/services with position
 * tracking, capacity-based promotion (offer), and conversion analytics.
 *
 * Events:
 *   - "waitlist.joined": { waitlistId, entryId, position }
 *   - "waitlist.offered": { waitlistId, entryId, expiresAt }
 *   - "waitlist.converted": { waitlistId, entryId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type EntryStatus = "waiting" | "offered" | "converted" | "expired" | "removed";

export interface WaitlistEntry {
  id: string;
  waitlistId: string;
  partyId: string;
  joinedAt: string;
  status: EntryStatus;
  offeredAt?: string;
  offerExpiresAt?: string;
  convertedAt?: string;
}

export interface Waitlist {
  id: string;
  name: string;
  capacity: number;
  filledSlots: number;
  createdAt: string;
}

export interface WaitlistSummary {
  totalWaitlists: number;
  totalWaiting: number;
  totalOffered: number;
  totalConverted: number;
  conversionRatePct: number;
}

export class WaitlistManager {
  private waitlists: Map<string, Waitlist> = new Map();
  private entries: Map<string, WaitlistEntry> = new Map();

  constructor(private readonly bus: EventBus) {}

  createWaitlist(name: string, capacity: number): Waitlist {
    const waitlist: Waitlist = { id: randomUUID(), name, capacity, filledSlots: 0, createdAt: new Date().toISOString() };
    this.waitlists.set(waitlist.id, waitlist);
    return waitlist;
  }

  private waiting(waitlistId: string): WaitlistEntry[] {
    return Array.from(this.entries.values())
      .filter(e => e.waitlistId === waitlistId && e.status === "waiting")
      .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
  }

  join(waitlistId: string, partyId: string, joinedAt: string): WaitlistEntry | undefined {
    const waitlist = this.waitlists.get(waitlistId);
    if (!waitlist) return undefined;
    const entry: WaitlistEntry = { id: randomUUID(), waitlistId, partyId, joinedAt, status: "waiting" };
    this.entries.set(entry.id, entry);
    this.bus.publish("waitlist.joined", { waitlistId, entryId: entry.id, position: this.position(entry.id) });
    return entry;
  }

  position(entryId: string): number {
    const entry = this.entries.get(entryId);
    if (!entry || entry.status !== "waiting") return -1;
    return this.waiting(entry.waitlistId).findIndex(e => e.id === entryId) + 1;
  }

  /** Offer the next waiting entry a slot if capacity allows. */
  offerNext(waitlistId: string, offerExpiresAt: string, asOf: string): WaitlistEntry | undefined {
    const waitlist = this.waitlists.get(waitlistId);
    if (!waitlist || waitlist.filledSlots >= waitlist.capacity) return undefined;
    const next = this.waiting(waitlistId)[0];
    if (!next) return undefined;
    next.status = "offered";
    next.offeredAt = asOf;
    next.offerExpiresAt = offerExpiresAt;
    this.bus.publish("waitlist.offered", { waitlistId, entryId: next.id, expiresAt: offerExpiresAt });
    return next;
  }

  convert(entryId: string, asOf: string): WaitlistEntry | undefined {
    const entry = this.entries.get(entryId);
    if (!entry || entry.status !== "offered") return undefined;
    const waitlist = this.waitlists.get(entry.waitlistId)!;
    entry.status = "converted";
    entry.convertedAt = asOf;
    waitlist.filledSlots += 1;
    this.bus.publish("waitlist.converted", { waitlistId: entry.waitlistId, entryId });
    return entry;
  }

  expireOffer(entryId: string): WaitlistEntry | undefined {
    const entry = this.entries.get(entryId);
    if (!entry || entry.status !== "offered") return undefined;
    entry.status = "expired";
    return entry;
  }

  remove(entryId: string): WaitlistEntry | undefined {
    const entry = this.entries.get(entryId);
    if (!entry || entry.status === "converted") return undefined;
    entry.status = "removed";
    return entry;
  }

  getEntry(id: string): WaitlistEntry | undefined { return this.entries.get(id); }
  getWaitlist(id: string): Waitlist | undefined { return this.waitlists.get(id); }
  listEntries(waitlistId?: string, status?: EntryStatus): WaitlistEntry[] {
    let all = Array.from(this.entries.values());
    if (waitlistId) all = all.filter(e => e.waitlistId === waitlistId);
    if (status) all = all.filter(e => e.status === status);
    return all;
  }

  summary(): WaitlistSummary {
    const entries = Array.from(this.entries.values());
    const converted = entries.filter(e => e.status === "converted").length;
    const offered = entries.filter(e => e.status === "offered" || e.status === "converted" || e.status === "expired").length;
    return {
      totalWaitlists: this.waitlists.size,
      totalWaiting: entries.filter(e => e.status === "waiting").length,
      totalOffered: entries.filter(e => e.status === "offered").length,
      totalConverted: converted,
      conversionRatePct: offered > 0 ? Math.round((converted / offered) * 100) : 0,
    };
  }
}
