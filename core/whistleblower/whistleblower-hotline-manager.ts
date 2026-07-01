/**
 * WhistleblowerHotlineManager — anonymous reporting hotline: intake with a
 * private reference code for two-way anonymous follow-up, triage/routing, and
 * resolution tracking distinct from named ethics cases.
 *
 * Events:
 *   - "hotline.report_received": { reportId, category, anonymous }
 *   - "hotline.message_added": { reportId, fromReporter }
 *   - "hotline.closed": { reportId, outcome }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ReportCategory = "fraud" | "harassment" | "safety" | "corruption" | "data_privacy" | "other";
export type ReportStatus = "received" | "triaged" | "investigating" | "closed";
export type Outcome = "substantiated" | "unsubstantiated" | "insufficient_info";

export interface HotlineMessage {
  id: string;
  fromReporter: boolean;
  body: string;
  at: string;
}

export interface HotlineReport {
  id: string;
  referenceCode: string; // anonymous follow-up code
  category: ReportCategory;
  summary: string;
  anonymous: boolean;
  status: ReportStatus;
  assignedTo?: string;
  outcome?: Outcome;
  messages: HotlineMessage[];
  receivedAt: string;
  closedAt?: string;
}

export interface HotlineSummary {
  totalReports: number;
  open: number;
  closed: number;
  substantiated: number;
  anonymousPct: number;
  byCategory: Partial<Record<ReportCategory, number>>;
}

export class WhistleblowerHotlineManager {
  private reports: Map<string, HotlineReport> = new Map();
  private byCode: Map<string, string> = new Map();
  private seq = 0;

  constructor(private readonly bus: EventBus) {}

  private genCode(): string {
    this.seq += 1;
    return `WB-${this.seq.toString(36).toUpperCase().padStart(6, "0")}`;
  }

  report(input: { category: ReportCategory; summary: string; anonymous: boolean; receivedAt: string }): HotlineReport {
    const referenceCode = this.genCode();
    const report: HotlineReport = { ...input, id: randomUUID(), referenceCode, status: "received", messages: [] };
    this.reports.set(report.id, report);
    this.byCode.set(referenceCode, report.id);
    this.bus.publish("hotline.report_received", { reportId: report.id, category: report.category, anonymous: report.anonymous });
    return report;
  }

  /** Reporter posts a follow-up using only their reference code (anonymous). */
  reporterMessage(referenceCode: string, body: string, at: string): HotlineMessage | undefined {
    const id = this.byCode.get(referenceCode);
    if (!id) return undefined;
    const report = this.reports.get(id)!;
    if (report.status === "closed") return undefined;
    const msg: HotlineMessage = { id: randomUUID(), fromReporter: true, body, at };
    report.messages.push(msg);
    this.bus.publish("hotline.message_added", { reportId: report.id, fromReporter: true });
    return msg;
  }

  investigatorMessage(reportId: string, body: string, at: string): HotlineMessage | undefined {
    const report = this.reports.get(reportId);
    if (!report || report.status === "closed") return undefined;
    const msg: HotlineMessage = { id: randomUUID(), fromReporter: false, body, at };
    report.messages.push(msg);
    this.bus.publish("hotline.message_added", { reportId, fromReporter: false });
    return msg;
  }

  triage(reportId: string, assignedTo: string): HotlineReport | undefined {
    const report = this.reports.get(reportId);
    if (!report || report.status !== "received") return undefined;
    report.status = "triaged";
    report.assignedTo = assignedTo;
    return report;
  }

  investigate(reportId: string): HotlineReport | undefined {
    const report = this.reports.get(reportId);
    if (!report || report.status !== "triaged") return undefined;
    report.status = "investigating";
    return report;
  }

  close(reportId: string, outcome: Outcome, asOf: string): HotlineReport | undefined {
    const report = this.reports.get(reportId);
    if (!report || report.status === "closed") return undefined;
    report.status = "closed";
    report.outcome = outcome;
    report.closedAt = asOf;
    this.bus.publish("hotline.closed", { reportId, outcome });
    return report;
  }

  getByCode(referenceCode: string): HotlineReport | undefined {
    const id = this.byCode.get(referenceCode);
    return id ? this.reports.get(id) : undefined;
  }
  getReport(id: string): HotlineReport | undefined { return this.reports.get(id); }
  listReports(status?: ReportStatus, category?: ReportCategory): HotlineReport[] {
    let all = Array.from(this.reports.values());
    if (status) all = all.filter(r => r.status === status);
    if (category) all = all.filter(r => r.category === category);
    return all;
  }

  summary(): HotlineSummary {
    const reports = Array.from(this.reports.values());
    const byCategory: Partial<Record<ReportCategory, number>> = {};
    for (const r of reports) { byCategory[r.category] = (byCategory[r.category] ?? 0) + 1; }
    return {
      totalReports: reports.length,
      open: reports.filter(r => r.status !== "closed").length,
      closed: reports.filter(r => r.status === "closed").length,
      substantiated: reports.filter(r => r.outcome === "substantiated").length,
      anonymousPct: reports.length > 0 ? Math.round((reports.filter(r => r.anonymous).length / reports.length) * 100) : 0,
      byCategory,
    };
  }
}
