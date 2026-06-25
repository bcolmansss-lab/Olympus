/**
 * BackgroundCheckManager — pre-employment / vendor background screening:
 * check ordering across screen types, adjudication, and turnaround analytics.
 *
 * Events:
 *   - "backgroundcheck.ordered": { checkId, subjectId, screens }
 *   - "backgroundcheck.completed": { checkId, result }
 *   - "backgroundcheck.adverse_action": { checkId, subjectId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ScreenType = "criminal" | "employment" | "education" | "credit" | "drug" | "identity" | "reference";
export type CheckStatus = "ordered" | "in_progress" | "completed" | "cancelled";
export type CheckResult = "clear" | "consider" | "adverse";

export interface BackgroundCheck {
  id: string;
  subjectId: string;
  subjectName: string;
  screens: ScreenType[];
  status: CheckStatus;
  result?: CheckResult;
  orderedAt: string;
  completedAt?: string;
  adverseActionSent: boolean;
}

export interface BackgroundCheckSummary {
  totalChecks: number;
  inProgress: number;
  completed: number;
  clear: number;
  adverse: number;
  adverseActionsSent: number;
  avgTurnaroundDays: number;
}

export class BackgroundCheckManager {
  private checks: Map<string, BackgroundCheck> = new Map();

  constructor(private readonly bus: EventBus) {}

  order(subjectId: string, subjectName: string, screens: ScreenType[], orderedAt: string): BackgroundCheck | undefined {
    if (screens.length === 0) return undefined;
    const check: BackgroundCheck = { id: randomUUID(), subjectId, subjectName, screens, status: "ordered", orderedAt, adverseActionSent: false };
    this.checks.set(check.id, check);
    this.bus.publish("backgroundcheck.ordered", { checkId: check.id, subjectId, screens });
    return check;
  }

  start(checkId: string): BackgroundCheck | undefined {
    const check = this.checks.get(checkId);
    if (!check || check.status !== "ordered") return undefined;
    check.status = "in_progress";
    return check;
  }

  complete(checkId: string, result: CheckResult, completedAt: string): BackgroundCheck | undefined {
    const check = this.checks.get(checkId);
    if (!check || check.status === "completed" || check.status === "cancelled") return undefined;
    check.status = "completed";
    check.result = result;
    check.completedAt = completedAt;
    this.bus.publish("backgroundcheck.completed", { checkId, result });
    return check;
  }

  sendAdverseAction(checkId: string): BackgroundCheck | undefined {
    const check = this.checks.get(checkId);
    if (!check || check.result !== "adverse" || check.adverseActionSent) return undefined;
    check.adverseActionSent = true;
    this.bus.publish("backgroundcheck.adverse_action", { checkId, subjectId: check.subjectId });
    return check;
  }

  cancel(checkId: string): BackgroundCheck | undefined {
    const check = this.checks.get(checkId);
    if (!check || check.status === "completed") return undefined;
    check.status = "cancelled";
    return check;
  }

  getCheck(id: string): BackgroundCheck | undefined { return this.checks.get(id); }
  listChecks(status?: CheckStatus, result?: CheckResult): BackgroundCheck[] {
    let all = Array.from(this.checks.values());
    if (status) all = all.filter(c => c.status === status);
    if (result) all = all.filter(c => c.result === result);
    return all;
  }

  summary(): BackgroundCheckSummary {
    const checks = Array.from(this.checks.values());
    const completed = checks.filter(c => c.status === "completed" && c.completedAt);
    const turnarounds = completed.map(c => Math.floor((new Date(c.completedAt!).getTime() - new Date(c.orderedAt).getTime()) / 86400000));
    const avgTurnaround = turnarounds.length > 0 ? Math.round(turnarounds.reduce((s, d) => s + d, 0) / turnarounds.length) : 0;
    return {
      totalChecks: checks.length,
      inProgress: checks.filter(c => c.status === "ordered" || c.status === "in_progress").length,
      completed: completed.length,
      clear: checks.filter(c => c.result === "clear").length,
      adverse: checks.filter(c => c.result === "adverse").length,
      adverseActionsSent: checks.filter(c => c.adverseActionSent).length,
      avgTurnaroundDays: avgTurnaround,
    };
  }
}
