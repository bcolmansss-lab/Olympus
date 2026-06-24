/**
 * ProductUsageTracker — feature adoption tracking, DAU/MAU computation,
 * user session analytics, stickiness metrics, and usage-based expansion signals.
 *
 * Events:
 *   - "usage.feature_adopted": { accountId, userId, feature, firstSeenAt }
 *   - "usage.power_user_detected": { userId, accountId, sessionsLast30d }
 *   - "usage.expansion_signal": { accountId, feature, usagePct, threshold }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export interface FeatureEvent {
  id: string;
  accountId: string;
  userId: string;
  feature: string;
  action: string;
  occurredAt: string;
  metadata?: Record<string, string | number>;
}

export interface FeatureAdoption {
  feature: string;
  accountId: string;
  firstSeenAt: string;
  eventCount: number;
  uniqueUsers: number;
  lastSeenAt: string;
}

export interface UserSession {
  id: string;
  accountId: string;
  userId: string;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  pagesViewed: number;
  featuresUsed: string[];
}

export interface UsageSummary {
  totalEvents: number;
  totalSessions: number;
  uniqueAccounts: number;
  uniqueUsers: number;
  topFeatures: Array<{ feature: string; eventCount: number }>;
  avgSessionDurationSeconds: number;
}

export class ProductUsageTracker {
  private events: Map<string, FeatureEvent> = new Map();
  private sessions: Map<string, UserSession> = new Map();
  private adoptions: Map<string, FeatureAdoption> = new Map(); // key: `${accountId}:${feature}`
  private adoptedUsers: Map<string, Set<string>> = new Map(); // key: `${accountId}:${feature}` → userIds

  constructor(private readonly bus: EventBus) {}

  trackEvent(input: Omit<FeatureEvent, "id"> & { id?: string }): FeatureEvent {
    const event: FeatureEvent = { ...input, id: input.id ?? randomUUID() };
    this.events.set(event.id, event);

    const adoptionKey = `${event.accountId}:${event.feature}`;
    const existing = this.adoptions.get(adoptionKey);
    if (!existing) {
      this.adoptions.set(adoptionKey, {
        feature: event.feature,
        accountId: event.accountId,
        firstSeenAt: event.occurredAt,
        eventCount: 1,
        uniqueUsers: 1,
        lastSeenAt: event.occurredAt,
      });
      if (!this.adoptedUsers.has(adoptionKey)) this.adoptedUsers.set(adoptionKey, new Set());
      this.adoptedUsers.get(adoptionKey)!.add(event.userId);
      this.bus.publish("usage.feature_adopted", { accountId: event.accountId, userId: event.userId, feature: event.feature, firstSeenAt: event.occurredAt });
    } else {
      existing.eventCount++;
      existing.lastSeenAt = event.occurredAt;
      const users = this.adoptedUsers.get(adoptionKey)!;
      users.add(event.userId);
      existing.uniqueUsers = users.size;
    }

    return event;
  }

  startSession(input: Omit<UserSession, "id"> & { id?: string }): UserSession {
    const session: UserSession = { ...input, id: input.id ?? randomUUID() };
    this.sessions.set(session.id, session);
    return session;
  }

  endSession(sessionId: string, pagesViewed: number, featuresUsed: string[]): UserSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    session.endedAt = new Date().toISOString();
    session.durationSeconds = Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000);
    session.pagesViewed = pagesViewed;
    session.featuresUsed = featuresUsed;

    // Detect power users: >10 sessions (simplified: check if this user has >10 sessions)
    const userSessions = Array.from(this.sessions.values()).filter((s) => s.userId === session.userId && s.endedAt);
    if (userSessions.length >= 10) {
      this.bus.publish("usage.power_user_detected", { userId: session.userId, accountId: session.accountId, sessionsLast30d: userSessions.length });
    }

    return session;
  }

  checkExpansionSignal(accountId: string, feature: string, threshold: number): boolean {
    const adoptionKey = `${accountId}:${feature}`;
    const adoption = this.adoptions.get(adoptionKey);
    if (!adoption) return false;
    const accountEvents = Array.from(this.events.values()).filter((e) => e.accountId === accountId);
    const featureEvents = accountEvents.filter((e) => e.feature === feature);
    const usagePct = accountEvents.length > 0 ? (featureEvents.length / accountEvents.length) * 100 : 0;
    if (usagePct >= threshold) {
      this.bus.publish("usage.expansion_signal", { accountId, feature, usagePct: Math.round(usagePct), threshold });
      return true;
    }
    return false;
  }

  getAdoption(accountId: string, feature: string): FeatureAdoption | undefined {
    return this.adoptions.get(`${accountId}:${feature}`);
  }

  listAdoptions(accountId?: string): FeatureAdoption[] {
    const all = Array.from(this.adoptions.values());
    return accountId ? all.filter((a) => a.accountId === accountId) : all;
  }

  summary(): UsageSummary {
    const events = Array.from(this.events.values());
    const sessions = Array.from(this.sessions.values()).filter((s) => s.durationSeconds !== undefined);
    const featureCounts: Record<string, number> = {};
    for (const e of events) { featureCounts[e.feature] = (featureCounts[e.feature] ?? 0) + 1; }
    const topFeatures = Object.entries(featureCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([feature, eventCount]) => ({ feature, eventCount }));
    const avgDuration = sessions.length > 0 ? Math.round(sessions.reduce((s, se) => s + (se.durationSeconds ?? 0), 0) / sessions.length) : 0;
    return {
      totalEvents: events.length,
      totalSessions: this.sessions.size,
      uniqueAccounts: new Set(events.map((e) => e.accountId)).size,
      uniqueUsers: new Set(events.map((e) => e.userId)).size,
      topFeatures,
      avgSessionDurationSeconds: avgDuration,
    };
  }
}
