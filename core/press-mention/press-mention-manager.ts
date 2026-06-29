/**
 * PressMentionManager — media monitoring: press/social mentions with sentiment,
 * reach, source tiering, and share-of-voice analytics.
 *
 * Events:
 *   - "press.mention_logged": { mentionId, source, sentiment, reach }
 *   - "press.negative_spike": { period, negativeCount }
 *   - "press.high_reach": { mentionId, reach }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type MentionSentiment = "positive" | "neutral" | "negative";
export type SourceTier = "tier1" | "tier2" | "trade" | "blog" | "social";

export interface PressMention {
  id: string;
  source: string;
  tier: SourceTier;
  url: string;
  sentiment: MentionSentiment;
  reach: number; // estimated audience
  period: string;
  topics: string[];
  loggedAt: string;
}

export interface PressSummary {
  totalMentions: number;
  positive: number;
  neutral: number;
  negative: number;
  totalReach: number;
  sentimentScore: number; // -100..100
  byTier: Partial<Record<SourceTier, number>>;
}

export class PressMentionManager {
  private mentions: PressMention[] = [];
  private highReachThreshold: number;
  private negativeSpikeThreshold: number;

  constructor(private readonly bus: EventBus, highReachThreshold = 1_000_000, negativeSpikeThreshold = 3) {
    this.highReachThreshold = highReachThreshold;
    this.negativeSpikeThreshold = negativeSpikeThreshold;
  }

  log(input: { source: string; tier: SourceTier; url: string; sentiment: MentionSentiment; reach: number; period: string; topics: string[]; loggedAt: string }): PressMention {
    const mention: PressMention = { ...input, id: randomUUID() };
    this.mentions.push(mention);
    this.bus.publish("press.mention_logged", { mentionId: mention.id, source: mention.source, sentiment: mention.sentiment, reach: mention.reach });
    if (mention.reach >= this.highReachThreshold) {
      this.bus.publish("press.high_reach", { mentionId: mention.id, reach: mention.reach });
    }
    if (mention.sentiment === "negative") {
      const negCount = this.mentions.filter(m => m.period === mention.period && m.sentiment === "negative").length;
      if (negCount === this.negativeSpikeThreshold) {
        this.bus.publish("press.negative_spike", { period: mention.period, negativeCount: negCount });
      }
    }
    return mention;
  }

  sentimentScore(period?: string): number {
    const recs = period ? this.mentions.filter(m => m.period === period) : this.mentions;
    if (recs.length === 0) return 0;
    const score = recs.reduce((s, m) => s + (m.sentiment === "positive" ? 1 : m.sentiment === "negative" ? -1 : 0), 0);
    return Math.round((score / recs.length) * 100);
  }

  shareOfVoice(topic: string): number {
    if (this.mentions.length === 0) return 0;
    const withTopic = this.mentions.filter(m => m.topics.includes(topic)).length;
    return Math.round((withTopic / this.mentions.length) * 100);
  }

  listMentions(sentiment?: MentionSentiment, tier?: SourceTier): PressMention[] {
    let all = [...this.mentions];
    if (sentiment) all = all.filter(m => m.sentiment === sentiment);
    if (tier) all = all.filter(m => m.tier === tier);
    return all;
  }

  summary(): PressSummary {
    const byTier: Partial<Record<SourceTier, number>> = {};
    for (const m of this.mentions) { byTier[m.tier] = (byTier[m.tier] ?? 0) + 1; }
    return {
      totalMentions: this.mentions.length,
      positive: this.mentions.filter(m => m.sentiment === "positive").length,
      neutral: this.mentions.filter(m => m.sentiment === "neutral").length,
      negative: this.mentions.filter(m => m.sentiment === "negative").length,
      totalReach: this.mentions.reduce((s, m) => s + m.reach, 0),
      sentimentScore: this.sentimentScore(),
      byTier,
    };
  }
}
