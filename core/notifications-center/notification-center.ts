/**
 * NotificationCenter — user notification preferences, digest scheduling,
 * delivery tracking, and cross-channel orchestration.
 *
 * Events:
 *   - "notif_center.digest_sent": { userId, channel, notificationCount }
 *   - "notif_center.preference_updated": { userId, channel, enabled }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type NotifChannel = "email" | "slack" | "sms" | "push" | "in_app" | "webhook";
export type NotifCategory = "incident" | "approval" | "mention" | "digest" | "alert" | "billing" | "security" | "product_update";
export type DigestFrequency = "realtime" | "hourly" | "daily" | "weekly";

export interface NotifPreference {
  userId: string;
  channel: NotifChannel;
  enabled: boolean;
  categories: NotifCategory[];
  digestFrequency: DigestFrequency;
  quietHoursStart?: number; // 0-23 hour
  quietHoursEnd?: number;
  updatedAt: string;
}

export interface NotifMessage {
  id: string;
  userId: string;
  category: NotifCategory;
  title: string;
  body: string;
  channel: NotifChannel;
  status: "pending" | "sent" | "delivered" | "failed" | "read";
  priority: "low" | "normal" | "high" | "urgent";
  sentAt?: string;
  readAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface DigestEntry {
  id: string;
  userId: string;
  channel: NotifChannel;
  messageIds: string[];
  sentAt: string;
}

export interface NotifCenterSummary {
  totalUsers: number;
  pendingNotifications: number;
  sentToday: number;
  deliveryRate: number; // delivered / sent * 100
  digestsSentToday: number;
}

export class NotificationCenter {
  private readonly preferences: Map<string, NotifPreference[]> = new Map();
  private readonly messages: Map<string, NotifMessage> = new Map();
  private readonly digests: DigestEntry[] = [];

  constructor(private readonly bus: EventBus) {}

  setPreference(pref: Omit<NotifPreference, "updatedAt">): NotifPreference {
    const full: NotifPreference = { ...pref, updatedAt: new Date().toISOString() };
    const userPrefs = this.preferences.get(pref.userId) ?? [];
    const idx = userPrefs.findIndex((p) => p.channel === pref.channel);
    if (idx >= 0) {
      userPrefs[idx] = full;
    } else {
      userPrefs.push(full);
    }
    this.preferences.set(pref.userId, userPrefs);
    this.bus.publish("notif_center.preference_updated", { userId: pref.userId, channel: pref.channel, enabled: pref.enabled });
    return full;
  }

  getPreferences(userId: string): NotifPreference[] {
    return this.preferences.get(userId) ?? [];
  }

  send(input: Omit<NotifMessage, "id" | "createdAt" | "status"> & { id?: string }): NotifMessage {
    const userPrefs = this.preferences.get(input.userId) ?? [];
    const pref = userPrefs.find((p) => p.channel === input.channel);

    const now = new Date().toISOString();
    let status: NotifMessage["status"] = "pending";
    let sentAt: string | undefined;

    if (pref && pref.enabled && pref.categories.includes(input.category)) {
      status = "sent";
      sentAt = now;
    }

    const msg: NotifMessage = {
      id: input.id ?? randomUUID(),
      userId: input.userId,
      category: input.category,
      title: input.title,
      body: input.body,
      channel: input.channel,
      status,
      priority: input.priority,
      sentAt,
      readAt: input.readAt,
      metadata: input.metadata,
      createdAt: now,
    };
    this.messages.set(msg.id, msg);
    return msg;
  }

  markDelivered(messageId: string): NotifMessage | undefined {
    const msg = this.messages.get(messageId);
    if (!msg) return undefined;
    msg.status = "delivered";
    return msg;
  }

  markRead(messageId: string): NotifMessage | undefined {
    const msg = this.messages.get(messageId);
    if (!msg) return undefined;
    msg.status = "read";
    msg.readAt = new Date().toISOString();
    return msg;
  }

  sendDigest(userId: string, channel: NotifChannel): DigestEntry | undefined {
    const pending = Array.from(this.messages.values()).filter(
      (m) => m.userId === userId && m.channel === channel && m.category === "digest" && m.status === "pending",
    );
    if (pending.length === 0) return undefined;

    const now = new Date().toISOString();
    for (const msg of pending) {
      msg.status = "sent";
      msg.sentAt = now;
    }

    const entry: DigestEntry = {
      id: randomUUID(),
      userId,
      channel,
      messageIds: pending.map((m) => m.id),
      sentAt: now,
    };
    this.digests.push(entry);
    this.bus.publish("notif_center.digest_sent", { userId, channel, notificationCount: pending.length });
    return entry;
  }

  listMessages(userId: string, status?: string): NotifMessage[] {
    const all = Array.from(this.messages.values()).filter((m) => m.userId === userId);
    if (status === undefined) return all;
    return all.filter((m) => m.status === status);
  }

  summary(): NotifCenterSummary {
    const todayStr = new Date().toISOString().slice(0, 10);
    const allMsgs = Array.from(this.messages.values());
    const pendingNotifications = allMsgs.filter((m) => m.status === "pending").length;
    const sentToday = allMsgs.filter((m) => m.sentAt?.startsWith(todayStr)).length;
    const delivered = allMsgs.filter((m) => m.status === "delivered").length;
    const sent = allMsgs.filter((m) => m.status === "sent").length;
    const deliveryRate = sent + delivered > 0 ? (delivered / (sent + delivered)) * 100 : 0;
    const digestsSentToday = this.digests.filter((d) => d.sentAt.startsWith(todayStr)).length;

    return {
      totalUsers: this.preferences.size,
      pendingNotifications,
      sentToday,
      deliveryRate,
      digestsSentToday,
    };
  }
}
