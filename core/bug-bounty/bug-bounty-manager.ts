/**
 * BugBountyManager — responsible-disclosure / bug bounty program: researcher
 * submissions, triage and validity, severity-based reward payout, and
 * duplicate handling.
 *
 * Events:
 *   - "bounty.submitted": { submissionId, researcherId, severity }
 *   - "bounty.validated": { submissionId, severity, rewardUsd }
 *   - "bounty.paid": { submissionId, researcherId, rewardUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type Severity = "low" | "medium" | "high" | "critical";
export type SubmissionStatus = "submitted" | "triaging" | "valid" | "duplicate" | "invalid" | "paid";

const REWARD_TABLE: Record<Severity, number> = { low: 100, medium: 500, high: 2000, critical: 10000 };

export interface Submission {
  id: string;
  researcherId: string;
  title: string;
  severity: Severity;
  status: SubmissionStatus;
  rewardUsd: number;
  duplicateOf?: string;
  submittedAt: string;
  resolvedAt?: string;
}

export interface BugBountySummary {
  totalSubmissions: number;
  valid: number;
  duplicates: number;
  invalid: number;
  totalPaidUsd: number;
  bySeverity: Partial<Record<Severity, number>>;
}

export class BugBountyManager {
  private submissions: Map<string, Submission> = new Map();
  private rewardTable: Record<Severity, number>;

  constructor(private readonly bus: EventBus, rewardTable: Record<Severity, number> = REWARD_TABLE) {
    this.rewardTable = rewardTable;
  }

  submit(researcherId: string, title: string, severity: Severity): Submission {
    const submission: Submission = { id: randomUUID(), researcherId, title, severity, status: "submitted", rewardUsd: 0, submittedAt: new Date().toISOString() };
    this.submissions.set(submission.id, submission);
    this.bus.publish("bounty.submitted", { submissionId: submission.id, researcherId, severity });
    return submission;
  }

  triage(submissionId: string): Submission | undefined {
    const s = this.submissions.get(submissionId);
    if (!s || s.status !== "submitted") return undefined;
    s.status = "triaging";
    return s;
  }

  validate(submissionId: string, severity?: Severity): Submission | undefined {
    const s = this.submissions.get(submissionId);
    if (!s || (s.status !== "submitted" && s.status !== "triaging")) return undefined;
    if (severity) s.severity = severity;
    s.status = "valid";
    s.rewardUsd = this.rewardTable[s.severity];
    this.bus.publish("bounty.validated", { submissionId, severity: s.severity, rewardUsd: s.rewardUsd });
    return s;
  }

  markDuplicate(submissionId: string, duplicateOf: string): Submission | undefined {
    const s = this.submissions.get(submissionId);
    if (!s || s.status === "paid") return undefined;
    s.status = "duplicate";
    s.duplicateOf = duplicateOf;
    return s;
  }

  markInvalid(submissionId: string): Submission | undefined {
    const s = this.submissions.get(submissionId);
    if (!s || s.status === "paid") return undefined;
    s.status = "invalid";
    return s;
  }

  payReward(submissionId: string, asOf: string): Submission | undefined {
    const s = this.submissions.get(submissionId);
    if (!s || s.status !== "valid") return undefined;
    s.status = "paid";
    s.resolvedAt = asOf;
    this.bus.publish("bounty.paid", { submissionId, researcherId: s.researcherId, rewardUsd: s.rewardUsd });
    return s;
  }

  getSubmission(id: string): Submission | undefined { return this.submissions.get(id); }
  researcherEarnings(researcherId: string): number {
    return Array.from(this.submissions.values()).filter(s => s.researcherId === researcherId && s.status === "paid").reduce((sum, s) => sum + s.rewardUsd, 0);
  }
  listSubmissions(status?: SubmissionStatus, severity?: Severity): Submission[] {
    let all = Array.from(this.submissions.values());
    if (status) all = all.filter(s => s.status === status);
    if (severity) all = all.filter(s => s.severity === severity);
    return all;
  }

  summary(): BugBountySummary {
    const subs = Array.from(this.submissions.values());
    const bySeverity: Partial<Record<Severity, number>> = {};
    for (const s of subs) { bySeverity[s.severity] = (bySeverity[s.severity] ?? 0) + 1; }
    return {
      totalSubmissions: subs.length,
      valid: subs.filter(s => s.status === "valid" || s.status === "paid").length,
      duplicates: subs.filter(s => s.status === "duplicate").length,
      invalid: subs.filter(s => s.status === "invalid").length,
      totalPaidUsd: subs.filter(s => s.status === "paid").reduce((sum, s) => sum + s.rewardUsd, 0),
      bySeverity,
    };
  }
}
