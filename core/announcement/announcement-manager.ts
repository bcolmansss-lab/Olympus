/**
 * AnnouncementManager — internal announcements/broadcasts: audience-targeted
 * posts with priority, publish/expire lifecycle, read receipts, and
 * acknowledgement-required tracking.
 *
 * Events:
 *   - "announcement.published": { announcementId, title, audience }
 *   - "announcement.acknowledged": { announcementId, userId }
 *   - "announcement.expired": { announcementId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type Priority = "normal" | "important" | "urgent";
export type AnnouncementStatus = "draft" | "published" | "expired";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: string; // team/dept/"all"
  priority: Priority;
  status: AnnouncementStatus;
  requiresAck: boolean;
  reads: Set<string>;
  acks: Set<string>;
  publishedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface AnnouncementSummary {
  totalAnnouncements: number;
  published: number;
  totalReads: number;
  totalAcks: number;
  ackRequiredPending: number;
  byPriority: Partial<Record<Priority, number>>;
}

export class AnnouncementManager {
  private announcements: Map<string, Announcement> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(input: { title: string; body: string; audience: string; priority?: Priority; requiresAck?: boolean; expiresAt?: string }): Announcement {
    const announcement: Announcement = {
      id: randomUUID(),
      title: input.title,
      body: input.body,
      audience: input.audience,
      priority: input.priority ?? "normal",
      status: "draft",
      requiresAck: input.requiresAck ?? false,
      reads: new Set(),
      acks: new Set(),
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString(),
    };
    this.announcements.set(announcement.id, announcement);
    return announcement;
  }

  publish(announcementId: string, asOf: string): Announcement | undefined {
    const a = this.announcements.get(announcementId);
    if (!a || a.status !== "draft") return undefined;
    a.status = "published";
    a.publishedAt = asOf;
    this.bus.publish("announcement.published", { announcementId, title: a.title, audience: a.audience });
    return a;
  }

  markRead(announcementId: string, userId: string): Announcement | undefined {
    const a = this.announcements.get(announcementId);
    if (!a || a.status !== "published") return undefined;
    a.reads.add(userId);
    return a;
  }

  acknowledge(announcementId: string, userId: string): Announcement | undefined {
    const a = this.announcements.get(announcementId);
    if (!a || a.status !== "published" || !a.requiresAck) return undefined;
    a.reads.add(userId);
    a.acks.add(userId);
    this.bus.publish("announcement.acknowledged", { announcementId, userId });
    return a;
  }

  /** Expire published announcements past their expiry date. */
  expireStale(asOf: string): Announcement[] {
    const cutoff = new Date(asOf).getTime();
    const expired = Array.from(this.announcements.values()).filter(a => a.status === "published" && a.expiresAt && new Date(a.expiresAt).getTime() < cutoff);
    for (const a of expired) {
      a.status = "expired";
      this.bus.publish("announcement.expired", { announcementId: a.id });
    }
    return expired;
  }

  hasAcknowledged(announcementId: string, userId: string): boolean {
    return this.announcements.get(announcementId)?.acks.has(userId) ?? false;
  }

  getAnnouncement(id: string): Announcement | undefined { return this.announcements.get(id); }
  listAnnouncements(status?: AnnouncementStatus, priority?: Priority): Announcement[] {
    let all = Array.from(this.announcements.values());
    if (status) all = all.filter(a => a.status === status);
    if (priority) all = all.filter(a => a.priority === priority);
    return all;
  }

  summary(): AnnouncementSummary {
    const announcements = Array.from(this.announcements.values());
    const byPriority: Partial<Record<Priority, number>> = {};
    for (const a of announcements) { byPriority[a.priority] = (byPriority[a.priority] ?? 0) + 1; }
    return {
      totalAnnouncements: announcements.length,
      published: announcements.filter(a => a.status === "published").length,
      totalReads: announcements.reduce((s, a) => s + a.reads.size, 0),
      totalAcks: announcements.reduce((s, a) => s + a.acks.size, 0),
      ackRequiredPending: announcements.filter(a => a.status === "published" && a.requiresAck && a.acks.size === 0).length,
      byPriority,
    };
  }
}
