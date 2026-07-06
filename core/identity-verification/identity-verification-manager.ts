/**
 * IdentityVerificationManager — KYC/identity verification: per-subject check
 * sessions across document/biometric/database steps, step pass/fail, and an
 * overall verified/rejected verdict with risk level.
 *
 * Events:
 *   - "kyc.session_started": { sessionId, subjectId, level }
 *   - "kyc.step_completed": { sessionId, step, passed }
 *   - "kyc.verdict": { sessionId, subjectId, verdict }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type VerificationLevel = "basic" | "standard" | "enhanced";
export type KYCStep = "document" | "selfie_match" | "liveness" | "database" | "sanctions" | "address";
export type SessionVerdict = "pending" | "verified" | "rejected" | "manual_review";

export interface StepResult {
  step: KYCStep;
  passed: boolean;
  completedAt: string;
}

export interface KYCSession {
  id: string;
  subjectId: string;
  level: VerificationLevel;
  requiredSteps: KYCStep[];
  results: StepResult[];
  verdict: SessionVerdict;
  startedAt: string;
  completedAt?: string;
}

export interface KYCSummary {
  totalSessions: number;
  verified: number;
  rejected: number;
  pending: number;
  manualReview: number;
  verificationRatePct: number;
}

const LEVEL_STEPS: Record<VerificationLevel, KYCStep[]> = {
  basic: ["document"],
  standard: ["document", "selfie_match", "database"],
  enhanced: ["document", "selfie_match", "liveness", "database", "sanctions", "address"],
};

export class IdentityVerificationManager {
  private sessions: Map<string, KYCSession> = new Map();

  constructor(private readonly bus: EventBus) {}

  start(subjectId: string, level: VerificationLevel): KYCSession {
    const session: KYCSession = {
      id: randomUUID(),
      subjectId,
      level,
      requiredSteps: [...LEVEL_STEPS[level]],
      results: [],
      verdict: "pending",
      startedAt: new Date().toISOString(),
    };
    this.sessions.set(session.id, session);
    this.bus.publish("kyc.session_started", { sessionId: session.id, subjectId, level });
    return session;
  }

  completeStep(sessionId: string, step: KYCStep, passed: boolean, asOf: string): KYCSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || session.verdict !== "pending") return undefined;
    if (!session.requiredSteps.includes(step)) return undefined;
    if (session.results.some(r => r.step === step)) return undefined;
    session.results.push({ step, passed, completedAt: asOf });
    this.bus.publish("kyc.step_completed", { sessionId, step, passed });
    // sanctions failure = hard reject; other failures route to manual review when all done
    if (step === "sanctions" && !passed) {
      session.verdict = "rejected";
      session.completedAt = asOf;
      this.bus.publish("kyc.verdict", { sessionId, subjectId: session.subjectId, verdict: "rejected" });
      return session;
    }
    if (session.results.length === session.requiredSteps.length) {
      const allPassed = session.results.every(r => r.passed);
      session.verdict = allPassed ? "verified" : "manual_review";
      session.completedAt = asOf;
      this.bus.publish("kyc.verdict", { sessionId, subjectId: session.subjectId, verdict: session.verdict });
    }
    return session;
  }

  resolveManualReview(sessionId: string, verified: boolean, asOf: string): KYCSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || session.verdict !== "manual_review") return undefined;
    session.verdict = verified ? "verified" : "rejected";
    session.completedAt = asOf;
    this.bus.publish("kyc.verdict", { sessionId, subjectId: session.subjectId, verdict: session.verdict });
    return session;
  }

  getSession(id: string): KYCSession | undefined { return this.sessions.get(id); }
  isVerified(subjectId: string): boolean {
    return Array.from(this.sessions.values()).some(s => s.subjectId === subjectId && s.verdict === "verified");
  }
  listSessions(verdict?: SessionVerdict): KYCSession[] {
    const all = Array.from(this.sessions.values());
    return verdict ? all.filter(s => s.verdict === verdict) : all;
  }

  summary(): KYCSummary {
    const sessions = Array.from(this.sessions.values());
    const verified = sessions.filter(s => s.verdict === "verified").length;
    const resolved = sessions.filter(s => s.verdict === "verified" || s.verdict === "rejected").length;
    return {
      totalSessions: sessions.length,
      verified,
      rejected: sessions.filter(s => s.verdict === "rejected").length,
      pending: sessions.filter(s => s.verdict === "pending").length,
      manualReview: sessions.filter(s => s.verdict === "manual_review").length,
      verificationRatePct: resolved > 0 ? Math.round((verified / resolved) * 100) : 0,
    };
  }
}
