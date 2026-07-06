/**
 * ApplicantTracker — job requisitions, candidate pipeline, interview scheduling, offer management.
 *
 * Pipeline stages: applied → screening → interview → offer → hired | rejected | withdrawn
 *
 * Events:
 *   - "recruitment.candidate_advanced": { candidateId, jobId, from, to }
 *   - "recruitment.offer_extended": { candidateId, jobId, offerUsd, equity }
 *   - "recruitment.hired": { candidateId, jobId, startDate, salaryUsd }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CandidateStage = "applied" | "screening" | "phone_screen" | "technical" | "onsite" | "offer" | "hired" | "rejected" | "withdrawn";
export type JobStatus = "draft" | "open" | "paused" | "closed" | "filled";
export type InterviewType = "phone_screen" | "technical" | "system_design" | "behavioral" | "panel" | "executive";

export interface JobRequisition {
  id: string;
  title: string;
  department: string;
  level: string;
  status: JobStatus;
  headcount: number;
  filledCount: number;
  salaryMinUsd: number;
  salaryMaxUsd: number;
  equityPct?: number;
  requiredSkills: string[];
  niceToHaveSkills?: string[];
  hiringManagerId: string;
  recruiterId?: string;
  openedAt: string;
  targetFilledBy?: string;
  tags?: string[];
}

export interface Candidate {
  id: string;
  jobId: string;
  name: string;
  email: string;
  stage: CandidateStage;
  source: string;
  resumeUrl?: string;
  currentCompany?: string;
  currentTitle?: string;
  appliedAt: string;
  lastActivityAt: string;
  offerSalaryUsd?: number;
  offerEquityPct?: number;
  startDate?: string;
  rejectionReason?: string;
  tags?: string[];
  scorecards: Scorecard[];
}

export interface Scorecard {
  interviewType: InterviewType;
  interviewerId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  notes: string;
  submittedAt: string;
}

export interface RecruitmentMetrics {
  openRequisitions: number;
  totalCandidates: number;
  activeCandidates: number;
  hiredThisQuarter: number;
  avgTimeToHireDays: number;
  offerAcceptanceRate: number;
  sourceBreakdown: Record<string, number>;
  pipelineByStage: Partial<Record<CandidateStage, number>>;
}

export class ApplicantTracker {
  private readonly bus: EventBus;
  private readonly requisitions: Map<string, JobRequisition> = new Map();
  private readonly candidates: Map<string, Candidate> = new Map();

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  openRequisition(input: Omit<JobRequisition, "id" | "filledCount" | "openedAt"> & { id?: string }): JobRequisition {
    const req: JobRequisition = {
      ...input,
      id: input.id ?? randomUUID(),
      filledCount: 0,
      openedAt: new Date().toISOString(),
    };
    this.requisitions.set(req.id, req);
    return req;
  }

  addCandidate(input: Omit<Candidate, "id" | "appliedAt" | "lastActivityAt" | "scorecards"> & { id?: string }): Candidate {
    const now = new Date().toISOString();
    const candidate: Candidate = {
      ...input,
      id: input.id ?? randomUUID(),
      appliedAt: now,
      lastActivityAt: now,
      scorecards: [],
    };
    this.candidates.set(candidate.id, candidate);
    return candidate;
  }

  advanceStage(candidateId: string, stage: CandidateStage, reason?: string): Candidate | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return undefined;
    }
    const from = candidate.stage;
    candidate.stage = stage;
    candidate.lastActivityAt = new Date().toISOString();
    if (stage === "rejected" && reason !== undefined) {
      candidate.rejectionReason = reason;
    }
    this.bus.publish("recruitment.candidate_advanced", {
      candidateId: candidate.id,
      jobId: candidate.jobId,
      from,
      to: stage,
    });
    return candidate;
  }

  addScorecard(candidateId: string, scorecard: Omit<Scorecard, "submittedAt">): Candidate | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return undefined;
    }
    candidate.scorecards.push({
      ...scorecard,
      submittedAt: new Date().toISOString(),
    });
    candidate.lastActivityAt = new Date().toISOString();
    return candidate;
  }

  extendOffer(candidateId: string, offerSalaryUsd: number, offerEquityPct?: number): Candidate | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return undefined;
    }
    candidate.offerSalaryUsd = offerSalaryUsd;
    if (offerEquityPct !== undefined) {
      candidate.offerEquityPct = offerEquityPct;
    }
    const from = candidate.stage;
    candidate.stage = "offer";
    candidate.lastActivityAt = new Date().toISOString();
    this.bus.publish("recruitment.offer_extended", {
      candidateId: candidate.id,
      jobId: candidate.jobId,
      offerUsd: offerSalaryUsd,
      equity: offerEquityPct,
    });
    // Also emit candidate_advanced if stage changed
    if (from !== "offer") {
      this.bus.publish("recruitment.candidate_advanced", {
        candidateId: candidate.id,
        jobId: candidate.jobId,
        from,
        to: "offer",
      });
    }
    return candidate;
  }

  hire(candidateId: string, startDate: string): Candidate | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return undefined;
    }
    const from = candidate.stage;
    candidate.stage = "hired";
    candidate.startDate = startDate;
    candidate.lastActivityAt = new Date().toISOString();

    const req = this.requisitions.get(candidate.jobId);
    if (req) {
      req.filledCount += 1;
      if (req.filledCount >= req.headcount) {
        req.status = "filled";
      }
    }

    this.bus.publish("recruitment.hired", {
      candidateId: candidate.id,
      jobId: candidate.jobId,
      startDate,
      salaryUsd: candidate.offerSalaryUsd,
    });
    if (from !== "hired") {
      this.bus.publish("recruitment.candidate_advanced", {
        candidateId: candidate.id,
        jobId: candidate.jobId,
        from,
        to: "hired",
      });
    }
    return candidate;
  }

  get(id: string): Candidate | undefined {
    return this.candidates.get(id);
  }

  listCandidates(jobId?: string, stage?: CandidateStage): Candidate[] {
    const all = Array.from(this.candidates.values());
    return all.filter((c) => {
      if (jobId !== undefined && c.jobId !== jobId) {
        return false;
      }
      if (stage !== undefined && c.stage !== stage) {
        return false;
      }
      return true;
    });
  }

  getRequisition(id: string): JobRequisition | undefined {
    return this.requisitions.get(id);
  }

  listRequisitions(status?: JobStatus): JobRequisition[] {
    const all = Array.from(this.requisitions.values());
    if (status === undefined) {
      return all;
    }
    return all.filter((r) => r.status === status);
  }

  metrics(): RecruitmentMetrics {
    const allCandidates = Array.from(this.candidates.values());
    const allReqs = Array.from(this.requisitions.values());

    const terminalStages = new Set<CandidateStage>(["hired", "rejected", "withdrawn"]);
    const activeCandidates = allCandidates.filter((c) => !terminalStages.has(c.stage));

    // Hired this quarter
    const now = new Date();
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const hiredCandidates = allCandidates.filter((c) => c.stage === "hired");
    const hiredThisQuarter = hiredCandidates.filter((c) => {
      const hiredAt = new Date(c.lastActivityAt);
      return hiredAt >= quarterStart;
    }).length;

    // Avg time to hire
    let avgTimeToHireDays = 0;
    if (hiredCandidates.length > 0) {
      const totalDays = hiredCandidates.reduce((sum, c) => {
        const applied = new Date(c.appliedAt).getTime();
        const hired = new Date(c.lastActivityAt).getTime();
        return sum + (hired - applied) / (1000 * 60 * 60 * 24);
      }, 0);
      avgTimeToHireDays = totalDays / hiredCandidates.length;
    }

    // Offer acceptance rate: hired / candidates who reached offer stage * 100
    const offerCandidates = allCandidates.filter((c) => {
      return c.stage === "offer" || c.stage === "hired";
    });
    const offerAcceptanceRate = offerCandidates.length > 0
      ? (hiredCandidates.length / offerCandidates.length) * 100
      : 0;

    // Source breakdown
    const sourceBreakdown: Record<string, number> = {};
    for (const c of allCandidates) {
      sourceBreakdown[c.source] = (sourceBreakdown[c.source] ?? 0) + 1;
    }

    // Pipeline by stage
    const pipelineByStage: Partial<Record<CandidateStage, number>> = {};
    for (const c of allCandidates) {
      pipelineByStage[c.stage] = (pipelineByStage[c.stage] ?? 0) + 1;
    }

    return {
      openRequisitions: allReqs.filter((r) => r.status === "open").length,
      totalCandidates: allCandidates.length,
      activeCandidates: activeCandidates.length,
      hiredThisQuarter,
      avgTimeToHireDays,
      offerAcceptanceRate,
      sourceBreakdown,
      pipelineByStage,
    };
  }
}
