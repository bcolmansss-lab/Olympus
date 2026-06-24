/**
 * EngagementTracker — eNPS pulse surveys, engagement scoring, manager effectiveness,
 * and flight risk detection.
 *
 * Events:
 *   - "engagement.pulse_submitted": { responseId, employeeId, eNpsScore, category }
 *   - "engagement.flight_risk_detected": { employeeId, riskScore, signals }
 *   - "engagement.team_scored": { teamId, engagementScore, responseRate }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ENpsCategory = "promoter" | "passive" | "detractor"; // 9-10, 7-8, 0-6
export type FlightRiskLevel = "low" | "medium" | "high";
export type EngagementDriver =
  | "management"
  | "growth"
  | "compensation"
  | "culture"
  | "worklife"
  | "mission"
  | "peers";

export interface PulseSurvey {
  id: string;
  name: string;
  sentAt: string;
  closedAt?: string;
  targetEmployeeIds: string[];
  responseCount: number;
  status: "open" | "closed";
}

export interface PulseResponse {
  id: string;
  surveyId: string;
  employeeId: string;
  eNpsScore: number; // 0-10
  driverScores: Partial<Record<EngagementDriver, number>>; // 1-5 per driver
  comment?: string;
  submittedAt: string;
}

export interface FlightRiskAssessment {
  employeeId: string;
  riskLevel: FlightRiskLevel;
  riskScore: number; // 0-100
  signals: string[];
  assessedAt: string;
}

export interface TeamEngagementScore {
  teamId: string;
  engagementScore: number; // 0-100
  eNps: number; // -100 to 100
  responseRate: number;
  topDriver: EngagementDriver;
  bottomDriver: EngagementDriver;
}

export interface EngagementSummary {
  companyENps: number;
  avgEngagementScore: number;
  totalResponses: number;
  responseRate: number;
  flightRisks: number; // high risk count
  topDrivers: EngagementDriver[];
}

function eNpsCategory(score: number): ENpsCategory {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

export class EngagementTracker {
  private readonly surveys = new Map<string, PulseSurvey>();
  private readonly responses = new Map<string, PulseResponse>();
  private readonly flightRisks = new Map<string, FlightRiskAssessment>();

  constructor(private readonly bus: EventBus) {}

  createSurvey(input: Omit<PulseSurvey, "id" | "responseCount"> & { id?: string }): PulseSurvey {
    const survey: PulseSurvey = {
      id: input.id ?? randomUUID(),
      name: input.name,
      sentAt: input.sentAt,
      closedAt: input.closedAt,
      targetEmployeeIds: input.targetEmployeeIds,
      responseCount: 0,
      status: input.status,
    };
    this.surveys.set(survey.id, survey);
    return survey;
  }

  submitResponse(
    input: Omit<PulseResponse, "id" | "submittedAt"> & { id?: string }
  ): PulseResponse {
    const response: PulseResponse = {
      id: input.id ?? randomUUID(),
      surveyId: input.surveyId,
      employeeId: input.employeeId,
      eNpsScore: input.eNpsScore,
      driverScores: input.driverScores,
      comment: input.comment,
      submittedAt: new Date().toISOString(),
    };
    this.responses.set(response.id, response);

    // Increment survey responseCount
    const survey = this.surveys.get(input.surveyId);
    if (survey) {
      survey.responseCount += 1;
    }

    const category = eNpsCategory(response.eNpsScore);
    this.bus.publish("engagement.pulse_submitted", {
      responseId: response.id,
      employeeId: response.employeeId,
      eNpsScore: response.eNpsScore,
      category,
    });

    return response;
  }

  assessFlightRisk(employeeId: string, signals: string[]): FlightRiskAssessment {
    const riskScore = Math.min(signals.length * 20, 100);
    let riskLevel: FlightRiskLevel;
    if (riskScore >= 60) {
      riskLevel = "high";
    } else if (riskScore >= 30) {
      riskLevel = "medium";
    } else {
      riskLevel = "low";
    }

    const assessment: FlightRiskAssessment = {
      employeeId,
      riskLevel,
      riskScore,
      signals,
      assessedAt: new Date().toISOString(),
    };
    this.flightRisks.set(employeeId, assessment);

    if (riskLevel === "high") {
      this.bus.publish("engagement.flight_risk_detected", {
        employeeId,
        riskScore,
        signals,
      });
    }

    return assessment;
  }

  scoreTeam(teamId: string, employeeIds: string[]): TeamEngagementScore | undefined {
    const teamResponses = Array.from(this.responses.values()).filter((r) =>
      employeeIds.includes(r.employeeId)
    );

    if (teamResponses.length === 0) return undefined;

    const total = teamResponses.length;
    const promoters = teamResponses.filter((r) => eNpsCategory(r.eNpsScore) === "promoter").length;
    const detractors = teamResponses.filter((r) => eNpsCategory(r.eNpsScore) === "detractor").length;
    const eNps = Math.round(((promoters - detractors) / total) * 100);

    // Compute driver averages
    const driverTotals: Partial<Record<EngagementDriver, { sum: number; count: number }>> = {};
    for (const r of teamResponses) {
      for (const [driver, score] of Object.entries(r.driverScores) as [EngagementDriver, number][]) {
        if (!driverTotals[driver]) driverTotals[driver] = { sum: 0, count: 0 };
        driverTotals[driver]!.sum += score;
        driverTotals[driver]!.count += 1;
      }
    }

    const driverAvgs = Object.entries(driverTotals) as [EngagementDriver, { sum: number; count: number }][];
    let topDriver: EngagementDriver = "mission";
    let bottomDriver: EngagementDriver = "mission";
    if (driverAvgs.length > 0) {
      let maxAvg = -Infinity;
      let minAvg = Infinity;
      for (const [d, { sum, count }] of driverAvgs) {
        const avg = sum / count;
        if (avg > maxAvg) { maxAvg = avg; topDriver = d; }
        if (avg < minAvg) { minAvg = avg; bottomDriver = d; }
      }
    }

    // engagementScore: avg of all driverScores * 20 (scale 1-5 → 0-100)
    let totalDriverSum = 0;
    let totalDriverCount = 0;
    for (const { sum, count } of Object.values(driverTotals)) {
      totalDriverSum += sum;
      totalDriverCount += count;
    }
    const engagementScore = totalDriverCount > 0
      ? Math.round((totalDriverSum / totalDriverCount) * 20)
      : 0;

    const responseRate = employeeIds.length > 0 ? total / employeeIds.length : 0;

    const score: TeamEngagementScore = {
      teamId,
      engagementScore,
      eNps,
      responseRate,
      topDriver,
      bottomDriver,
    };

    this.bus.publish("engagement.team_scored", {
      teamId,
      engagementScore,
      responseRate,
    });

    return score;
  }

  getSurvey(id: string): PulseSurvey | undefined {
    return this.surveys.get(id);
  }

  listSurveys(): PulseSurvey[] {
    return Array.from(this.surveys.values());
  }

  getFlightRisk(employeeId: string): FlightRiskAssessment | undefined {
    return this.flightRisks.get(employeeId);
  }

  summary(): EngagementSummary {
    const allResponses = Array.from(this.responses.values());
    const total = allResponses.length;

    const promoters = allResponses.filter((r) => eNpsCategory(r.eNpsScore) === "promoter").length;
    const detractors = allResponses.filter((r) => eNpsCategory(r.eNpsScore) === "detractor").length;
    const companyENps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;

    // Compute driver averages across all responses
    const driverTotals: Partial<Record<EngagementDriver, { sum: number; count: number }>> = {};
    for (const r of allResponses) {
      for (const [driver, score] of Object.entries(r.driverScores) as [EngagementDriver, number][]) {
        if (!driverTotals[driver]) driverTotals[driver] = { sum: 0, count: 0 };
        driverTotals[driver]!.sum += score;
        driverTotals[driver]!.count += 1;
      }
    }

    // avgEngagementScore: avg of all driver scores * 20
    let totalDriverSum = 0;
    let totalDriverCount = 0;
    for (const { sum, count } of Object.values(driverTotals)) {
      totalDriverSum += sum;
      totalDriverCount += count;
    }
    const avgEngagementScore = totalDriverCount > 0
      ? Math.round((totalDriverSum / totalDriverCount) * 20)
      : 0;

    // topDrivers: top 3 drivers by avg score
    const driverAvgs = (Object.entries(driverTotals) as [EngagementDriver, { sum: number; count: number }][])
      .map(([d, { sum, count }]) => ({ driver: d, avg: sum / count }))
      .sort((a, b) => b.avg - a.avg);
    const topDrivers: EngagementDriver[] = driverAvgs.slice(0, 3).map((d) => d.driver);

    // responseRate: total responses / total target employees across all surveys
    const allSurveys = Array.from(this.surveys.values());
    const totalTargeted = allSurveys.reduce((sum, s) => sum + s.targetEmployeeIds.length, 0);
    const responseRate = totalTargeted > 0 ? total / totalTargeted : 0;

    const flightRisks = Array.from(this.flightRisks.values()).filter(
      (a) => a.riskLevel === "high"
    ).length;

    return {
      companyENps,
      avgEngagementScore,
      totalResponses: total,
      responseRate,
      flightRisks,
      topDrivers,
    };
  }
}
