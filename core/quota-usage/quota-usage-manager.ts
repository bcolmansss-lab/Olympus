/**
 * QuotaUsageManager — per-account resource quota tracking: metered quotas with
 * limits, usage increments, threshold alerts, and period reset.
 *
 * Events:
 *   - "quota.defined": { quotaId, accountId, metric, limit }
 *   - "quota.threshold_reached": { quotaId, metric, usage, limit, pct }
 *   - "quota.exceeded": { quotaId, metric, usage, limit }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export interface Quota {
  id: string;
  accountId: string;
  metric: string; // e.g. "api_calls", "storage_gb"
  limit: number;
  used: number;
  alertThresholdPct: number; // e.g. 80
  alertedThreshold: boolean;
  period: string;
  createdAt: string;
}

export interface QuotaUsageSummary {
  totalQuotas: number;
  overLimit: number;
  nearLimit: number; // >= threshold
  byMetric: Record<string, { limit: number; used: number }>;
}

export class QuotaUsageManager {
  private quotas: Map<string, Quota> = new Map();

  constructor(private readonly bus: EventBus) {}

  define(accountId: string, metric: string, limit: number, period: string, alertThresholdPct = 80): Quota {
    const quota: Quota = { id: randomUUID(), accountId, metric, limit, used: 0, alertThresholdPct, alertedThreshold: false, period, createdAt: new Date().toISOString() };
    this.quotas.set(quota.id, quota);
    this.bus.publish("quota.defined", { quotaId: quota.id, accountId, metric, limit });
    return quota;
  }

  /** Record usage; returns false if it would exceed the limit (still records and emits exceeded). */
  consume(quotaId: string, units: number): boolean {
    const quota = this.quotas.get(quotaId);
    if (!quota || units <= 0) return false;
    quota.used = Math.round((quota.used + units) * 100) / 100;
    const pct = quota.limit > 0 ? Math.round((quota.used / quota.limit) * 100) : 0;
    if (!quota.alertedThreshold && pct >= quota.alertThresholdPct && quota.used <= quota.limit) {
      quota.alertedThreshold = true;
      this.bus.publish("quota.threshold_reached", { quotaId, metric: quota.metric, usage: quota.used, limit: quota.limit, pct });
    }
    if (quota.used > quota.limit) {
      this.bus.publish("quota.exceeded", { quotaId, metric: quota.metric, usage: quota.used, limit: quota.limit });
      return false;
    }
    return true;
  }

  remaining(quotaId: string): number {
    const quota = this.quotas.get(quotaId);
    return quota ? Math.max(0, Math.round((quota.limit - quota.used) * 100) / 100) : 0;
  }

  reset(quotaId: string, newPeriod: string): Quota | undefined {
    const quota = this.quotas.get(quotaId);
    if (!quota) return undefined;
    quota.used = 0;
    quota.alertedThreshold = false;
    quota.period = newPeriod;
    return quota;
  }

  setLimit(quotaId: string, limit: number): Quota | undefined {
    const quota = this.quotas.get(quotaId);
    if (!quota) return undefined;
    quota.limit = limit;
    return quota;
  }

  getQuota(id: string): Quota | undefined { return this.quotas.get(id); }
  quotasForAccount(accountId: string): Quota[] {
    return Array.from(this.quotas.values()).filter(q => q.accountId === accountId);
  }
  listQuotas(metric?: string): Quota[] {
    const all = Array.from(this.quotas.values());
    return metric ? all.filter(q => q.metric === metric) : all;
  }

  summary(): QuotaUsageSummary {
    const quotas = Array.from(this.quotas.values());
    const byMetric: Record<string, { limit: number; used: number }> = {};
    for (const q of quotas) {
      const m = byMetric[q.metric] ?? { limit: 0, used: 0 };
      m.limit += q.limit;
      m.used = Math.round((m.used + q.used) * 100) / 100;
      byMetric[q.metric] = m;
    }
    return {
      totalQuotas: quotas.length,
      overLimit: quotas.filter(q => q.used > q.limit).length,
      nearLimit: quotas.filter(q => q.limit > 0 && (q.used / q.limit) * 100 >= q.alertThresholdPct).length,
      byMetric,
    };
  }
}
