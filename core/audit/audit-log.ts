/**
 * AuditLog — immutable append-only log of all significant system actions.
 * Supports compliance queries, user activity reports, and forensic investigation.
 *
 * No bus events — the audit log IS the record of events.
 */

import { randomUUID } from "node:crypto";

export type AuditAction =
  | "user.login" | "user.logout" | "user.permission_changed"
  | "data.created" | "data.updated" | "data.deleted" | "data.exported"
  | "config.changed" | "integration.connected" | "integration.disconnected"
  | "approval.granted" | "approval.denied" | "escalation.triggered"
  | "autonomy.level_changed" | "policy.updated" | "alert.fired";

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  severity: AuditSeverity;
  actorId: string;
  actorType: "user" | "system" | "agent";
  resourceType: string;
  resourceId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  sessionId?: string;
}

export interface AuditQuery {
  actorId?: string;
  action?: AuditAction;
  resourceType?: string;
  severity?: AuditSeverity;
  since?: string; // ISO
  until?: string; // ISO
  limit?: number;
}

export interface AuditSummary {
  totalEntries: number;
  criticalEntries: number;
  uniqueActors: number;
  topActions: Array<{ action: AuditAction; count: number }>;
  recentCritical: AuditEntry[];
}

export class AuditLog {
  private entries: AuditEntry[] = [];

  constructor() {}

  record(input: Omit<AuditEntry, "id" | "timestamp"> & { timestamp?: string }): AuditEntry {
    const entry: AuditEntry = {
      ...input,
      id: randomUUID(),
      timestamp: input.timestamp ?? new Date().toISOString(),
    };
    this.entries.push(entry);
    return entry;
  }

  query(q: AuditQuery): AuditEntry[] {
    const limit = q.limit ?? 100;
    let results = this.entries.slice();

    if (q.actorId !== undefined) results = results.filter((e) => e.actorId === q.actorId);
    if (q.action !== undefined) results = results.filter((e) => e.action === q.action);
    if (q.resourceType !== undefined) results = results.filter((e) => e.resourceType === q.resourceType);
    if (q.severity !== undefined) results = results.filter((e) => e.severity === q.severity);
    if (q.since !== undefined) results = results.filter((e) => e.timestamp >= q.since!);
    if (q.until !== undefined) results = results.filter((e) => e.timestamp <= q.until!);

    // Return newest-first
    results = results.slice().reverse();
    return results.slice(0, limit);
  }

  getEntry(id: string): AuditEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  summary(): AuditSummary {
    const total = this.entries.length;
    const critical = this.entries.filter((e) => e.severity === "critical");
    const uniqueActors = new Set(this.entries.map((e) => e.actorId)).size;

    // Count by action
    const actionCounts = new Map<AuditAction, number>();
    for (const e of this.entries) {
      actionCounts.set(e.action, (actionCounts.get(e.action) ?? 0) + 1);
    }
    const topActions = Array.from(actionCounts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Last 10 critical entries (newest first)
    const recentCritical = critical.slice().reverse().slice(0, 10);

    return {
      totalEntries: total,
      criticalEntries: critical.length,
      uniqueActors,
      topActions,
      recentCritical,
    };
  }
}
