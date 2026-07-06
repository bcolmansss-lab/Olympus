/**
 * NPSSurveyManager — Net Promoter Score survey campaigns: response collection,
 * promoter/passive/detractor classification, NPS computation, and verbatim
 * theme tagging.
 *
 * Events:
 *   - "npssurvey.launched": { surveyId, name, audienceSize }
 *   - "npssurvey.response_received": { surveyId, score, category }
 *   - "npssurvey.detractor_flagged": { surveyId, respondentId, score }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type NPSBucket = "promoter" | "passive" | "detractor";
export type SurveyState = "active" | "closed";

export interface NPSResponse {
  id: string;
  surveyId: string;
  respondentId: string;
  score: number; // 0-10
  bucket: NPSBucket;
  comment?: string;
  themes: string[];
  respondedAt: string;
}

export interface NPSSurvey {
  id: string;
  name: string;
  audienceSize: number;
  state: SurveyState;
  responses: NPSResponse[];
  launchedAt: string;
  closedAt?: string;
}

export interface NPSSummary {
  totalSurveys: number;
  totalResponses: number;
  promoters: number;
  passives: number;
  detractors: number;
  npsScore: number; // -100..100
  responseRatePct: number;
}

export class NPSSurveyManager {
  private surveys: Map<string, NPSSurvey> = new Map();

  constructor(private readonly bus: EventBus) {}

  private bucketFor(score: number): NPSBucket {
    if (score >= 9) return "promoter";
    if (score >= 7) return "passive";
    return "detractor";
  }

  launch(name: string, audienceSize: number): NPSSurvey {
    const survey: NPSSurvey = { id: randomUUID(), name, audienceSize, state: "active", responses: [], launchedAt: new Date().toISOString() };
    this.surveys.set(survey.id, survey);
    this.bus.publish("npssurvey.launched", { surveyId: survey.id, name, audienceSize });
    return survey;
  }

  respond(surveyId: string, respondentId: string, score: number, respondedAt: string, comment?: string, themes: string[] = []): NPSResponse | undefined {
    const survey = this.surveys.get(surveyId);
    if (!survey || survey.state !== "active" || score < 0 || score > 10) return undefined;
    const bucket = this.bucketFor(score);
    const response: NPSResponse = { id: randomUUID(), surveyId, respondentId, score, bucket, comment, themes, respondedAt };
    survey.responses.push(response);
    this.bus.publish("npssurvey.response_received", { surveyId, score, category: bucket });
    if (bucket === "detractor") {
      this.bus.publish("npssurvey.detractor_flagged", { surveyId, respondentId, score });
    }
    return response;
  }

  npsScore(surveyId: string): number {
    const survey = this.surveys.get(surveyId);
    if (!survey || survey.responses.length === 0) return 0;
    const promoters = survey.responses.filter(r => r.bucket === "promoter").length;
    const detractors = survey.responses.filter(r => r.bucket === "detractor").length;
    return Math.round(((promoters - detractors) / survey.responses.length) * 100);
  }

  topThemes(surveyId: string): { theme: string; count: number }[] {
    const survey = this.surveys.get(surveyId);
    if (!survey) return [];
    const counts: Record<string, number> = {};
    for (const r of survey.responses) { for (const t of r.themes) { counts[t] = (counts[t] ?? 0) + 1; } }
    return Object.entries(counts).map(([theme, count]) => ({ theme, count })).sort((a, b) => b.count - a.count);
  }

  close(surveyId: string, asOf: string): NPSSurvey | undefined {
    const survey = this.surveys.get(surveyId);
    if (!survey || survey.state !== "active") return undefined;
    survey.state = "closed";
    survey.closedAt = asOf;
    return survey;
  }

  getSurvey(id: string): NPSSurvey | undefined { return this.surveys.get(id); }
  listSurveys(state?: SurveyState): NPSSurvey[] {
    const all = Array.from(this.surveys.values());
    return state ? all.filter(s => s.state === state) : all;
  }

  summary(): NPSSummary {
    const surveys = Array.from(this.surveys.values());
    const responses = surveys.flatMap(s => s.responses);
    const promoters = responses.filter(r => r.bucket === "promoter").length;
    const detractors = responses.filter(r => r.bucket === "detractor").length;
    const passives = responses.filter(r => r.bucket === "passive").length;
    const audience = surveys.reduce((s, sv) => s + sv.audienceSize, 0);
    return {
      totalSurveys: surveys.length,
      totalResponses: responses.length,
      promoters,
      passives,
      detractors,
      npsScore: responses.length > 0 ? Math.round(((promoters - detractors) / responses.length) * 100) : 0,
      responseRatePct: audience > 0 ? Math.round((responses.length / audience) * 100) : 0,
    };
  }
}
