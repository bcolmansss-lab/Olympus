/**
 * ESGTracker — Environmental, Social & Governance metric tracking,
 * carbon footprint modeling, DEI reporting, and governance scoring.
 *
 * Events:
 *   - "esg.metric_recorded": { metricId, category, value, unit }
 *   - "esg.target_missed": { metricId, category, target, actual, gapPct }
 *   - "esg.report_published": { reportId, period, overallScore }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ESGCategory = "environmental" | "social" | "governance";
export type MetricFrequency = "monthly" | "quarterly" | "annual";

export interface ESGMetric {
  id: string;
  name: string;
  category: ESGCategory;
  unit: string;
  description: string;
  target?: number;
  frequency: MetricFrequency;
  createdAt: string;
}

export interface ESGDataPoint {
  id: string;
  metricId: string;
  value: number;
  period: string; // e.g. "2026-Q2"
  recordedAt: string;
  notes?: string;
}

export interface ESGReport {
  id: string;
  period: string;
  overallScore: number; // 0-100
  environmentalScore: number;
  socialScore: number;
  governanceScore: number;
  highlights: string[];
  improvements: string[];
  publishedAt: string;
}

export interface ESGSummary {
  totalMetrics: number;
  byCategory: Record<ESGCategory, number>;
  totalDataPoints: number;
  latestReport?: ESGReport;
  targetsOnTrack: number;
  targetsMissed: number;
}

export class ESGTracker {
  private metrics: Map<string, ESGMetric> = new Map();
  private dataPoints: Map<string, ESGDataPoint> = new Map();
  private reports: Map<string, ESGReport> = new Map();

  constructor(private readonly bus: EventBus) {}

  defineMetric(input: Omit<ESGMetric, "id" | "createdAt"> & { id?: string }): ESGMetric {
    const metric: ESGMetric = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.metrics.set(metric.id, metric);
    return metric;
  }

  recordDataPoint(input: Omit<ESGDataPoint, "id" | "recordedAt"> & { id?: string }): ESGDataPoint | undefined {
    const metric = this.metrics.get(input.metricId);
    if (!metric) return undefined;
    const dp: ESGDataPoint = { ...input, id: input.id ?? randomUUID(), recordedAt: new Date().toISOString() };
    this.dataPoints.set(dp.id, dp);
    this.bus.publish("esg.metric_recorded", { metricId: dp.metricId, category: metric.category, value: dp.value, unit: metric.unit });

    if (metric.target !== undefined) {
      const gapPct = ((dp.value - metric.target) / metric.target) * 100;
      if (Math.abs(gapPct) > 10 && dp.value > metric.target) {
        this.bus.publish("esg.target_missed", { metricId: dp.metricId, category: metric.category, target: metric.target, actual: dp.value, gapPct: Math.round(gapPct) });
      }
    }
    return dp;
  }

  publishReport(input: Omit<ESGReport, "id"> & { id?: string }): ESGReport {
    const report: ESGReport = { ...input, id: input.id ?? randomUUID() };
    this.reports.set(report.id, report);
    this.bus.publish("esg.report_published", { reportId: report.id, period: report.period, overallScore: report.overallScore });
    return report;
  }

  getMetric(id: string): ESGMetric | undefined { return this.metrics.get(id); }
  listMetrics(category?: ESGCategory): ESGMetric[] {
    const all = Array.from(this.metrics.values());
    return category ? all.filter((m) => m.category === category) : all;
  }

  listDataPoints(metricId?: string): ESGDataPoint[] {
    const all = Array.from(this.dataPoints.values());
    return metricId ? all.filter((d) => d.metricId === metricId) : all;
  }

  listReports(): ESGReport[] { return Array.from(this.reports.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)); }

  summary(): ESGSummary {
    const metrics = Array.from(this.metrics.values());
    const dataPoints = Array.from(this.dataPoints.values());
    const byCategory: Record<ESGCategory, number> = { environmental: 0, social: 0, governance: 0 };
    for (const m of metrics) { byCategory[m.category]++; }

    let onTrack = 0, missed = 0;
    for (const m of metrics) {
      if (m.target === undefined) continue;
      const mDps = dataPoints.filter((d) => d.metricId === m.id);
      if (mDps.length === 0) continue;
      const latest = mDps.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]!;
      if (latest.value <= m.target) onTrack++;
      else missed++;
    }

    const reports = this.listReports();
    return {
      totalMetrics: metrics.length,
      byCategory,
      totalDataPoints: dataPoints.length,
      latestReport: reports[0],
      targetsOnTrack: onTrack,
      targetsMissed: missed,
    };
  }
}
