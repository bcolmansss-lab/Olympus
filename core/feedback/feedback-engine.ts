/**
 * FeedbackEngine — NPS surveys, CSAT collection, feature requests, and sentiment analysis.
 *
 * Events:
 *   - "feedback.nps_submitted": { responseId, respondentId, score, category }
 *   - "feedback.feature_request": { requestId, title, requesterId, votes }
 *   - "feedback.survey_completed": { surveyId, responseCount, avgScore }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type NpsCategory = "promoter" | "passive" | "detractor"; // 9-10, 7-8, 0-6
export type SurveyType = "nps" | "csat" | "ces" | "product" | "onboarding" | "exit";
export type FeedbackSentiment = "positive" | "neutral" | "negative";
export type RequestStatus = "open" | "under_review" | "planned" | "in_progress" | "shipped" | "declined";

export interface Survey {
  id: string;
  name: string;
  type: SurveyType;
  questions: Array<{ id: string; text: string; type: "rating" | "text" | "choice" }>;
  targetSegment?: string;
  status: "draft" | "active" | "closed";
  createdAt: string;
  closedAt?: string;
}

export interface SurveyResponse {
  id: string;
  surveyId: string;
  respondentId: string;
  answers: Array<{ questionId: string; value: string | number }>;
  npsScore?: number; // 0-10
  csatScore?: number; // 1-5
  sentiment?: FeedbackSentiment;
  comment?: string;
  submittedAt: string;
}

export interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  requesterId: string;
  status: RequestStatus;
  votes: number;
  tags?: string[];
  linkedSurveyIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackSummary {
  npsScore: number; // net promoter score: %promoters - %detractors
  avgCsat: number;
  totalResponses: number;
  promoters: number;
  passives: number;
  detractors: number;
  openFeatureRequests: number;
  topRequests: Array<{ id: string; title: string; votes: number }>;
}

export class FeedbackEngine {
  private readonly surveys = new Map<string, Survey>();
  private readonly responses = new Map<string, SurveyResponse>();
  private readonly featureRequests = new Map<string, FeatureRequest>();

  constructor(private readonly bus: EventBus) {}

  createSurvey(input: Omit<Survey, "id" | "createdAt"> & { id?: string }): Survey {
    const survey: Survey = {
      ...input,
      id: input.id ?? randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.surveys.set(survey.id, survey);
    return survey;
  }

  submitResponse(input: Omit<SurveyResponse, "id" | "submittedAt"> & { id?: string }): SurveyResponse {
    const response: SurveyResponse = {
      ...input,
      id: input.id ?? randomUUID(),
      submittedAt: new Date().toISOString(),
    };
    this.responses.set(response.id, response);

    if (response.npsScore !== undefined) {
      const category = this.npsCategory(response.npsScore);
      this.bus.publish("feedback.nps_submitted", {
        responseId: response.id,
        respondentId: response.respondentId,
        score: response.npsScore,
        category,
      });
    }

    // Check if survey has reached threshold (5 responses)
    const surveyResponses = this.getResponses(response.surveyId);
    if (surveyResponses.length >= 5 && surveyResponses.length % 5 === 0) {
      const scores = surveyResponses
        .filter((r) => r.npsScore !== undefined)
        .map((r) => r.npsScore as number);
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      this.bus.publish("feedback.survey_completed", {
        surveyId: response.surveyId,
        responseCount: surveyResponses.length,
        avgScore,
      });
    }

    return response;
  }

  private npsCategory(score: number): NpsCategory {
    if (score >= 9) return "promoter";
    if (score >= 7) return "passive";
    return "detractor";
  }

  createFeatureRequest(
    input: Omit<FeatureRequest, "id" | "createdAt" | "updatedAt" | "votes"> & { id?: string },
  ): FeatureRequest {
    const now = new Date().toISOString();
    const request: FeatureRequest = {
      ...input,
      id: input.id ?? randomUUID(),
      votes: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.featureRequests.set(request.id, request);
    this.bus.publish("feedback.feature_request", {
      requestId: request.id,
      title: request.title,
      requesterId: request.requesterId,
      votes: 0,
    });
    return request;
  }

  voteForRequest(id: string): FeatureRequest | undefined {
    const request = this.featureRequests.get(id);
    if (!request) return undefined;
    request.votes += 1;
    request.updatedAt = new Date().toISOString();
    return request;
  }

  updateRequestStatus(id: string, status: RequestStatus): FeatureRequest | undefined {
    const request = this.featureRequests.get(id);
    if (!request) return undefined;
    request.status = status;
    request.updatedAt = new Date().toISOString();
    return request;
  }

  getSurvey(id: string): Survey | undefined {
    return this.surveys.get(id);
  }

  listSurveys(type?: SurveyType): Survey[] {
    const all = Array.from(this.surveys.values());
    return type ? all.filter((s) => s.type === type) : all;
  }

  getResponses(surveyId: string): SurveyResponse[] {
    return Array.from(this.responses.values()).filter((r) => r.surveyId === surveyId);
  }

  listFeatureRequests(status?: RequestStatus): FeatureRequest[] {
    const all = Array.from(this.featureRequests.values());
    return status ? all.filter((r) => r.status === status) : all;
  }

  summary(): FeedbackSummary {
    const allResponses = Array.from(this.responses.values());
    const npsResponses = allResponses.filter((r) => r.npsScore !== undefined);
    const csatResponses = allResponses.filter((r) => r.csatScore !== undefined);

    let promoters = 0;
    let passives = 0;
    let detractors = 0;

    for (const r of npsResponses) {
      const cat = this.npsCategory(r.npsScore!);
      if (cat === "promoter") promoters++;
      else if (cat === "passive") passives++;
      else detractors++;
    }

    const total = npsResponses.length;
    const npsScore =
      total === 0
        ? 0
        : Math.round(((promoters / total - detractors / total) * 100) * 10) / 10;

    const avgCsat =
      csatResponses.length === 0
        ? 0
        : csatResponses.reduce((sum, r) => sum + (r.csatScore ?? 0), 0) / csatResponses.length;

    const openRequests = this.listFeatureRequests("open");

    const topRequests = Array.from(this.featureRequests.values())
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 3)
      .map((r) => ({ id: r.id, title: r.title, votes: r.votes }));

    return {
      npsScore,
      avgCsat,
      totalResponses: allResponses.length,
      promoters,
      passives,
      detractors,
      openFeatureRequests: openRequests.length,
      topRequests,
    };
  }
}
