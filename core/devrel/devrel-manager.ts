/**
 * DevRelManager — developer relations: activity logging across kinds (talks,
 * blog posts, videos, workshops) with audience reach, developer signup
 * attribution, per-advocate contribution rollups, and reach reporting.
 *
 * Events:
 *   - "devrel.activity_logged": { activityId, kind, reach }
 *   - "devrel.signups_attributed": { activityId, count }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DevRelActivityKind = "talk" | "blog_post" | "video" | "workshop" | "livestream";

export interface DevRelActivity {
  id: string;
  advocateId: string;
  kind: DevRelActivityKind;
  title: string;
  reach: number;
  attributedSignups: number;
  occurredAt: string;
}

export interface DevRelSummary {
  totalActivities: number;
  totalReach: number;
  totalSignups: number;
  conversionPct: number;
  byKind: Record<DevRelActivityKind, number>;
  topAdvocate?: string;
}

export class DevRelManager {
  private activities: Map<string, DevRelActivity> = new Map();

  constructor(private readonly bus: EventBus) {}

  logActivity(advocateId: string, kind: DevRelActivityKind, title: string, reach: number, occurredAt: string): DevRelActivity | undefined {
    if (reach < 0) return undefined;
    const activity: DevRelActivity = { id: randomUUID(), advocateId, kind, title, reach, attributedSignups: 0, occurredAt };
    this.activities.set(activity.id, activity);
    this.bus.publish("devrel.activity_logged", { activityId: activity.id, kind, reach });
    return activity;
  }

  attributeSignups(activityId: string, count: number): DevRelActivity | undefined {
    const a = this.activities.get(activityId);
    if (!a || count <= 0) return undefined;
    a.attributedSignups += count;
    this.bus.publish("devrel.signups_attributed", { activityId, count });
    return a;
  }

  getActivity(id: string): DevRelActivity | undefined { return this.activities.get(id); }
  listActivities(kind?: DevRelActivityKind, advocateId?: string): DevRelActivity[] {
    let all = Array.from(this.activities.values());
    if (kind) all = all.filter(a => a.kind === kind);
    if (advocateId) all = all.filter(a => a.advocateId === advocateId);
    return all;
  }

  /** Reach and signups per advocate, sorted by signups then reach. */
  advocateLeaderboard(): Array<{ advocateId: string; activities: number; reach: number; signups: number }> {
    const rollup = new Map<string, { advocateId: string; activities: number; reach: number; signups: number }>();
    for (const a of this.activities.values()) {
      const row = rollup.get(a.advocateId) ?? { advocateId: a.advocateId, activities: 0, reach: 0, signups: 0 };
      row.activities += 1;
      row.reach += a.reach;
      row.signups += a.attributedSignups;
      rollup.set(a.advocateId, row);
    }
    return Array.from(rollup.values()).sort((a, b) => b.signups - a.signups || b.reach - a.reach);
  }

  summary(): DevRelSummary {
    const activities = Array.from(this.activities.values());
    const totalReach = activities.reduce((s, a) => s + a.reach, 0);
    const totalSignups = activities.reduce((s, a) => s + a.attributedSignups, 0);
    const byKind: Record<DevRelActivityKind, number> = { talk: 0, blog_post: 0, video: 0, workshop: 0, livestream: 0 };
    for (const a of activities) byKind[a.kind] += 1;
    return {
      totalActivities: activities.length,
      totalReach,
      totalSignups,
      conversionPct: totalReach > 0 ? Math.round((totalSignups / totalReach) * 10000) / 100 : 0,
      byKind,
      topAdvocate: this.advocateLeaderboard()[0]?.advocateId,
    };
  }
}
