/**
 * CustomerFeedbackEngine — NPS surveys, CSAT collection, feedback categorization,
 * sentiment trend analysis, and closed-loop resolution tracking.
 *
 * Events:
 *   - "feedback.nps_submitted": { respondentId, score, category, comment }
 *   - "feedback.csat_submitted": { respondentId, ticketId, score, comment }
 *   - "feedback.issue_escalated": { feedbackId, respondentId, reason }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type FeedbackType = "nps" | "csat" | "ces" | "review" | "complaint" | "suggestion";
export type FeedbackSentiment = "positive" | "neutral" | "negative";
export type NPSCategory = "promoter" | "passive" | "detractor";

export interface FeedbackResponse {
  id: string;
  type: FeedbackType;
  respondentId: string;
  score: number; // 0-10 for NPS, 1-5 for CSAT/CES
  sentiment: FeedbackSentiment;
  category?: NPSCategory;
  comment?: string;
  ticketId?: string;
  productArea?: string;
  resolved: boolean;
  submittedAt: string;
  resolvedAt?: string;
}

export interface FeedbackSurvey {
  id: string;
  name: string;
  type: FeedbackType;
  targetSegment: string;
  sentAt: string;
  responseCount: number;
  avgScore: number;
  createdAt: string;
}

export interface FeedbackSummary {
  totalResponses: number;
  npsScore: number; // -100 to 100
  avgCsat: number; // 1-5
  promoters: number;
  passives: number;
  detractors: number;
  unresolvedCount: number;
  sentimentBreakdown: Record<FeedbackSentiment, number>;
}

export class CustomerFeedbackEngine {
  private responses: Map<string, FeedbackResponse> = new Map();
  private surveys: Map<string, FeedbackSurvey> = new Map();

  constructor(private readonly bus: EventBus) {}

  submitNPS(respondentId: string, score: number, comment?: string, productArea?: string): FeedbackResponse {
    const category: NPSCategory = score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor";
    const sentiment: FeedbackSentiment = score >= 8 ? "positive" : score >= 6 ? "neutral" : "negative";
    const response: FeedbackResponse = { id: randomUUID(), type: "nps", respondentId, score, sentiment, category, comment, productArea, resolved: false, submittedAt: new Date().toISOString() };
    this.responses.set(response.id, response);
    this.bus.publish("feedback.nps_submitted", { respondentId, score, category, comment });
    return response;
  }

  submitCSAT(respondentId: string, score: number, ticketId?: string, comment?: string): FeedbackResponse {
    const sentiment: FeedbackSentiment = score >= 4 ? "positive" : score >= 3 ? "neutral" : "negative";
    const response: FeedbackResponse = { id: randomUUID(), type: "csat", respondentId, score, sentiment, comment, ticketId, resolved: false, submittedAt: new Date().toISOString() };
    this.responses.set(response.id, response);
    this.bus.publish("feedback.csat_submitted", { respondentId, ticketId, score, comment });
    return response;
  }

  escalate(feedbackId: string, reason: string): FeedbackResponse | undefined {
    const fb = this.responses.get(feedbackId);
    if (!fb) return undefined;
    this.bus.publish("feedback.issue_escalated", { feedbackId, respondentId: fb.respondentId, reason });
    return fb;
  }

  resolve(feedbackId: string): FeedbackResponse | undefined {
    const fb = this.responses.get(feedbackId);
    if (!fb) return undefined;
    fb.resolved = true;
    fb.resolvedAt = new Date().toISOString();
    return fb;
  }

  createSurvey(input: Omit<FeedbackSurvey, "id" | "responseCount" | "avgScore" | "createdAt"> & { id?: string }): FeedbackSurvey {
    const survey: FeedbackSurvey = { ...input, id: input.id ?? randomUUID(), responseCount: 0, avgScore: 0, createdAt: new Date().toISOString() };
    this.surveys.set(survey.id, survey);
    return survey;
  }

  listResponses(type?: FeedbackType, resolved?: boolean): FeedbackResponse[] {
    let all = Array.from(this.responses.values());
    if (type) all = all.filter(r => r.type === type);
    if (resolved !== undefined) all = all.filter(r => r.resolved === resolved);
    return all;
  }

  summary(): FeedbackSummary {
    const responses = Array.from(this.responses.values());
    const npsResponses = responses.filter(r => r.type === "nps");
    const csatResponses = responses.filter(r => r.type === "csat");
    const promoters = npsResponses.filter(r => r.category === "promoter").length;
    const passives = npsResponses.filter(r => r.category === "passive").length;
    const detractors = npsResponses.filter(r => r.category === "detractor").length;
    const npsScore = npsResponses.length > 0 ? Math.round(((promoters - detractors) / npsResponses.length) * 100) : 0;
    const avgCsat = csatResponses.length > 0 ? Math.round((csatResponses.reduce((s, r) => s + r.score, 0) / csatResponses.length) * 10) / 10 : 0;
    const breakdown: Record<FeedbackSentiment, number> = { positive: 0, neutral: 0, negative: 0 };
    for (const r of responses) { breakdown[r.sentiment]++; }
    return {
      totalResponses: responses.length,
      npsScore,
      avgCsat,
      promoters,
      passives,
      detractors,
      unresolvedCount: responses.filter(r => !r.resolved).length,
      sentimentBreakdown: breakdown,
    };
  }
}
