/**
 * KnowledgeGapManager — support content gap analysis: track searches that
 * returned no/low results, cluster by topic, prioritize gaps by demand, and
 * mark gaps as filled when articles are authored.
 *
 * Events:
 *   - "knowledgegap.miss_recorded": { topic, query }
 *   - "knowledgegap.escalated": { topic, missCount }
 *   - "knowledgegap.filled": { topic, articleRef }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type GapStatus = "open" | "in_progress" | "filled";

export interface KnowledgeGap {
  id: string;
  topic: string;
  missCount: number;
  sampleQueries: string[];
  status: GapStatus;
  articleRef?: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface KnowledgeGapSummary {
  totalGaps: number;
  open: number;
  filled: number;
  totalMisses: number;
  topGaps: { topic: string; missCount: number }[];
}

export class KnowledgeGapManager {
  private gaps: Map<string, KnowledgeGap> = new Map(); // key: topic
  private escalateThreshold: number;

  constructor(private readonly bus: EventBus, escalateThreshold = 10) {
    this.escalateThreshold = escalateThreshold;
  }

  /** Record a search that failed to find good content. */
  recordMiss(topic: string, query: string, asOf: string): KnowledgeGap {
    let gap = this.gaps.get(topic);
    if (!gap) {
      gap = { id: randomUUID(), topic, missCount: 0, sampleQueries: [], status: "open", firstSeenAt: asOf, lastSeenAt: asOf };
      this.gaps.set(topic, gap);
    }
    gap.missCount += 1;
    gap.lastSeenAt = asOf;
    if (gap.sampleQueries.length < 10 && !gap.sampleQueries.includes(query)) gap.sampleQueries.push(query);
    this.bus.publish("knowledgegap.miss_recorded", { topic, query });
    if (gap.missCount === this.escalateThreshold) {
      this.bus.publish("knowledgegap.escalated", { topic, missCount: gap.missCount });
    }
    return gap;
  }

  startWork(topic: string): KnowledgeGap | undefined {
    const gap = this.gaps.get(topic);
    if (!gap || gap.status === "filled") return undefined;
    gap.status = "in_progress";
    return gap;
  }

  fill(topic: string, articleRef: string): KnowledgeGap | undefined {
    const gap = this.gaps.get(topic);
    if (!gap || gap.status === "filled") return undefined;
    gap.status = "filled";
    gap.articleRef = articleRef;
    this.bus.publish("knowledgegap.filled", { topic, articleRef });
    return gap;
  }

  getGap(topic: string): KnowledgeGap | undefined { return this.gaps.get(topic); }
  listGaps(status?: GapStatus): KnowledgeGap[] {
    const all = Array.from(this.gaps.values());
    return status ? all.filter(g => g.status === status) : all;
  }
  prioritized(): KnowledgeGap[] {
    return Array.from(this.gaps.values()).filter(g => g.status !== "filled").sort((a, b) => b.missCount - a.missCount);
  }

  summary(): KnowledgeGapSummary {
    const gaps = Array.from(this.gaps.values());
    return {
      totalGaps: gaps.length,
      open: gaps.filter(g => g.status !== "filled").length,
      filled: gaps.filter(g => g.status === "filled").length,
      totalMisses: gaps.reduce((s, g) => s + g.missCount, 0),
      topGaps: gaps.filter(g => g.status !== "filled").sort((a, b) => b.missCount - a.missCount).slice(0, 5).map(g => ({ topic: g.topic, missCount: g.missCount })),
    };
  }
}
