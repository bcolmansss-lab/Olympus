/**
 * AnalyticsEngine — cross-module KPI tracking, custom metrics, dashboards, and trend analysis.
 *
 * Aggregates signals from all Olympus modules into queryable time-series metrics.
 *
 * Events:
 *   - "analytics.metric_recorded": { metricId, name, value, timestamp }
 *   - "analytics.threshold_breached": { metricId, name, value, threshold, direction }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type MetricType = "counter" | "gauge" | "rate" | "ratio" | "currency";
export type AggregationMethod = "sum" | "avg" | "min" | "max" | "last" | "count";
export type TrendDirection = "up" | "down" | "flat";

export interface MetricDefinition {
  id: string;
  name: string;
  description: string;
  type: MetricType;
  unit: string; // "usd", "count", "%", "ms", etc.
  tags?: string[];
  thresholdHigh?: number; // alert if value exceeds
  thresholdLow?: number;  // alert if value falls below
  createdAt: string;
}

export interface MetricDataPoint {
  id: string;
  metricId: string;
  value: number;
  timestamp: string;
  dimensions?: Record<string, string>; // e.g. { region: "us-west", product: "platform" }
}

export interface MetricSeries {
  metricId: string;
  name: string;
  dataPoints: MetricDataPoint[];
  latest: number;
  trend: TrendDirection; // compare last 2 points
  aggregations: Record<AggregationMethod, number>;
}

export interface AnalyticsSummary {
  totalMetrics: number;
  totalDataPoints: number;
  metricsWithAlerts: number; // metrics currently breaching thresholds
  topMetrics: Array<{ id: string; name: string; latest: number; unit: string }>;
}

export class AnalyticsEngine {
  private metrics: Map<string, MetricDefinition> = new Map();
  private dataPoints: MetricDataPoint[] = [];

  constructor(private readonly bus: EventBus) {}

  defineMetric(input: Omit<MetricDefinition, "id" | "createdAt"> & { id?: string }): MetricDefinition {
    const metric: MetricDefinition = {
      ...input,
      id: input.id ?? randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.metrics.set(metric.id, metric);
    return metric;
  }

  record(metricId: string, value: number, timestamp?: string, dimensions?: Record<string, string>): MetricDataPoint | undefined {
    const metric = this.metrics.get(metricId);
    if (!metric) return undefined;

    const dp: MetricDataPoint = {
      id: randomUUID(),
      metricId,
      value,
      timestamp: timestamp ?? new Date().toISOString(),
      dimensions,
    };
    this.dataPoints.push(dp);

    this.bus.publish("analytics.metric_recorded", {
      metricId,
      name: metric.name,
      value,
      timestamp: dp.timestamp,
    });

    if (metric.thresholdHigh !== undefined && value > metric.thresholdHigh) {
      this.bus.publish("analytics.threshold_breached", {
        metricId,
        name: metric.name,
        value,
        threshold: metric.thresholdHigh,
        direction: "up",
      });
    }
    if (metric.thresholdLow !== undefined && value < metric.thresholdLow) {
      this.bus.publish("analytics.threshold_breached", {
        metricId,
        name: metric.name,
        value,
        threshold: metric.thresholdLow,
        direction: "down",
      });
    }

    return dp;
  }

  getMetric(id: string): MetricDefinition | undefined {
    return this.metrics.get(id);
  }

  getSeries(metricId: string, since?: string, until?: string): MetricSeries {
    const metric = this.metrics.get(metricId);
    const name = metric?.name ?? metricId;

    let points = this.dataPoints.filter((dp) => dp.metricId === metricId);
    if (since) points = points.filter((dp) => dp.timestamp >= since);
    if (until) points = points.filter((dp) => dp.timestamp <= until);

    // Sort by timestamp ascending
    points = [...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const values = points.map((dp) => dp.value);
    const latest = values.length > 0 ? values[values.length - 1]! : 0;

    let trend: TrendDirection = "flat";
    if (values.length >= 2) {
      const last = values[values.length - 1]!;
      const secondLast = values[values.length - 2]!;
      if (last > secondLast) trend = "up";
      else if (last < secondLast) trend = "down";
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = values.length > 0 ? sum / values.length : 0;
    const min = values.length > 0 ? Math.min(...values) : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;
    const count = values.length;

    const aggregations: Record<AggregationMethod, number> = { sum, avg, min, max, last: latest, count };

    return { metricId, name, dataPoints: points, latest, trend, aggregations };
  }

  query(metricIds: string[], since?: string, until?: string): MetricSeries[] {
    return metricIds.map((id) => this.getSeries(id, since, until));
  }

  listMetrics(): MetricDefinition[] {
    return Array.from(this.metrics.values());
  }

  summary(): AnalyticsSummary {
    const allMetrics = Array.from(this.metrics.values());
    let metricsWithAlerts = 0;

    const topMetrics: Array<{ id: string; name: string; latest: number; unit: string }> = [];

    for (const metric of allMetrics) {
      const series = this.getSeries(metric.id);
      const latest = series.latest;
      topMetrics.push({ id: metric.id, name: metric.name, latest, unit: metric.unit });

      const breachHigh = metric.thresholdHigh !== undefined && latest > metric.thresholdHigh;
      const breachLow = metric.thresholdLow !== undefined && latest < metric.thresholdLow;
      if (breachHigh || breachLow) metricsWithAlerts++;
    }

    return {
      totalMetrics: allMetrics.length,
      totalDataPoints: this.dataPoints.length,
      metricsWithAlerts,
      topMetrics: topMetrics.slice(0, 5),
    };
  }
}
