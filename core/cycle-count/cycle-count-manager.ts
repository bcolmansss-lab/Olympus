/**
 * CycleCountManager — inventory cycle counting: scheduled counts of SKU/bin
 * locations, variance detection between system and physical counts, and
 * adjustment approval.
 *
 * Events:
 *   - "cyclecount.scheduled": { countId, location, skuCount }
 *   - "cyclecount.variance_detected": { countId, sku, systemQty, countedQty, variance }
 *   - "cyclecount.completed": { countId, accuracyPct, adjustments }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CountStatus = "scheduled" | "in_progress" | "completed";

export interface CountLine {
  sku: string;
  systemQty: number;
  countedQty?: number;
  variance: number;
  counted: boolean;
}

export interface CycleCount {
  id: string;
  location: string;
  status: CountStatus;
  lines: CountLine[];
  scheduledFor: string;
  completedAt?: string;
}

export interface CycleCountSummary {
  totalCounts: number;
  scheduled: number;
  completed: number;
  totalVarianceUnits: number;
  avgAccuracyPct: number;
}

export class CycleCountManager {
  private counts: Map<string, CycleCount> = new Map();

  constructor(private readonly bus: EventBus) {}

  schedule(location: string, scheduledFor: string, items: { sku: string; systemQty: number }[]): CycleCount {
    const count: CycleCount = {
      id: randomUUID(),
      location,
      status: "scheduled",
      lines: items.map(i => ({ sku: i.sku, systemQty: i.systemQty, variance: 0, counted: false })),
      scheduledFor,
    };
    this.counts.set(count.id, count);
    this.bus.publish("cyclecount.scheduled", { countId: count.id, location, skuCount: items.length });
    return count;
  }

  recordCount(countId: string, sku: string, countedQty: number): CountLine | undefined {
    const count = this.counts.get(countId);
    if (!count || count.status === "completed") return undefined;
    const line = count.lines.find(l => l.sku === sku);
    if (!line) return undefined;
    if (count.status === "scheduled") count.status = "in_progress";
    line.countedQty = countedQty;
    line.variance = countedQty - line.systemQty;
    line.counted = true;
    if (line.variance !== 0) {
      this.bus.publish("cyclecount.variance_detected", { countId, sku, systemQty: line.systemQty, countedQty, variance: line.variance });
    }
    return line;
  }

  accuracy(countId: string): number {
    const count = this.counts.get(countId);
    if (!count) return 0;
    const counted = count.lines.filter(l => l.counted);
    if (counted.length === 0) return 0;
    const accurate = counted.filter(l => l.variance === 0).length;
    return Math.round((accurate / counted.length) * 100);
  }

  complete(countId: string, asOf: string): CycleCount | undefined {
    const count = this.counts.get(countId);
    if (!count || count.status === "completed") return undefined;
    if (!count.lines.every(l => l.counted)) return undefined;
    count.status = "completed";
    count.completedAt = asOf;
    const adjustments = count.lines.filter(l => l.variance !== 0).length;
    this.bus.publish("cyclecount.completed", { countId, accuracyPct: this.accuracy(countId), adjustments });
    return count;
  }

  getCount(id: string): CycleCount | undefined { return this.counts.get(id); }
  listCounts(status?: CountStatus): CycleCount[] {
    const all = Array.from(this.counts.values());
    return status ? all.filter(c => c.status === status) : all;
  }

  summary(): CycleCountSummary {
    const counts = Array.from(this.counts.values());
    const completed = counts.filter(c => c.status === "completed");
    const totalVariance = counts.flatMap(c => c.lines).reduce((s, l) => s + Math.abs(l.variance), 0);
    const avgAccuracy = completed.length > 0 ? Math.round(completed.reduce((s, c) => s + this.accuracy(c.id), 0) / completed.length) : 0;
    return {
      totalCounts: counts.length,
      scheduled: counts.filter(c => c.status === "scheduled").length,
      completed: completed.length,
      totalVarianceUnits: totalVariance,
      avgAccuracyPct: avgAccuracy,
    };
  }
}
