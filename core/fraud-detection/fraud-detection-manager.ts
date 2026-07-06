/**
 * FraudDetectionManager — transaction fraud scoring: weighted rule evaluation
 * producing a risk score and decision (approve/review/decline), with manual
 * review resolution and false-positive tracking.
 *
 * Events:
 *   - "fraud.evaluated": { assessmentId, transactionId, score, decision }
 *   - "fraud.flagged_for_review": { assessmentId, transactionId, score }
 *   - "fraud.declined": { assessmentId, transactionId, score }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type FraudDecision = "approve" | "review" | "decline";
export type ReviewOutcome = "legitimate" | "fraud";

export interface FraudRule {
  id: string;
  name: string;
  points: number; // risk points if signal present
}

export interface FraudAssessment {
  id: string;
  transactionId: string;
  amountUsd: number;
  score: number;
  decision: FraudDecision;
  triggeredRules: string[];
  reviewOutcome?: ReviewOutcome;
  createdAt: string;
}

export interface FraudSummary {
  totalAssessments: number;
  approved: number;
  reviewed: number;
  declined: number;
  confirmedFraud: number;
  falsePositives: number;
  fraudAmountBlockedUsd: number;
}

export class FraudDetectionManager {
  private rules: Map<string, FraudRule> = new Map();
  private assessments: Map<string, FraudAssessment> = new Map();
  private reviewThreshold: number;
  private declineThreshold: number;

  constructor(private readonly bus: EventBus, reviewThreshold = 40, declineThreshold = 75) {
    this.reviewThreshold = reviewThreshold;
    this.declineThreshold = declineThreshold;
  }

  addRule(name: string, points: number): FraudRule {
    const rule: FraudRule = { id: randomUUID(), name, points };
    this.rules.set(name, rule);
    return rule;
  }

  /** Evaluate a transaction against the named signals that fired. */
  evaluate(transactionId: string, amountUsd: number, signals: string[]): FraudAssessment {
    const triggered = signals.filter(s => this.rules.has(s));
    const score = Math.min(100, triggered.reduce((sum, s) => sum + this.rules.get(s)!.points, 0));
    const decision: FraudDecision = score >= this.declineThreshold ? "decline" : score >= this.reviewThreshold ? "review" : "approve";
    const assessment: FraudAssessment = { id: randomUUID(), transactionId, amountUsd, score, decision, triggeredRules: triggered, createdAt: new Date().toISOString() };
    this.assessments.set(assessment.id, assessment);
    this.bus.publish("fraud.evaluated", { assessmentId: assessment.id, transactionId, score, decision });
    if (decision === "review") this.bus.publish("fraud.flagged_for_review", { assessmentId: assessment.id, transactionId, score });
    if (decision === "decline") this.bus.publish("fraud.declined", { assessmentId: assessment.id, transactionId, score });
    return assessment;
  }

  resolveReview(assessmentId: string, outcome: ReviewOutcome): FraudAssessment | undefined {
    const a = this.assessments.get(assessmentId);
    if (!a || a.decision !== "review") return undefined;
    a.reviewOutcome = outcome;
    return a;
  }

  getAssessment(id: string): FraudAssessment | undefined { return this.assessments.get(id); }
  listAssessments(decision?: FraudDecision): FraudAssessment[] {
    const all = Array.from(this.assessments.values());
    return decision ? all.filter(a => a.decision === decision) : all;
  }
  listRules(): FraudRule[] { return Array.from(this.rules.values()); }

  summary(): FraudSummary {
    const assessments = Array.from(this.assessments.values());
    const declined = assessments.filter(a => a.decision === "decline");
    return {
      totalAssessments: assessments.length,
      approved: assessments.filter(a => a.decision === "approve").length,
      reviewed: assessments.filter(a => a.decision === "review").length,
      declined: declined.length,
      confirmedFraud: assessments.filter(a => a.reviewOutcome === "fraud").length,
      falsePositives: assessments.filter(a => a.reviewOutcome === "legitimate").length,
      fraudAmountBlockedUsd: Math.round(declined.reduce((s, a) => s + a.amountUsd, 0) * 100) / 100,
    };
  }
}
