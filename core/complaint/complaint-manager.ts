/**
 * ComplaintManager — formal customer complaint intake, severity triage,
 * resolution workflow, SLA breach detection, and root-cause categorization.
 *
 * Events:
 *   - "complaint.filed": { complaintId, category, severity, channel }
 *   - "complaint.escalated": { complaintId, fromSeverity, toSeverity }
 *   - "complaint.resolved": { complaintId, resolutionHours, satisfied }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ComplaintCategory = "product_defect" | "billing" | "service" | "delivery" | "staff_conduct" | "privacy" | "other";
export type ComplaintSeverity = "low" | "medium" | "high" | "critical";
export type ComplaintStatus = "filed" | "investigating" | "resolved" | "closed";
export type ComplaintChannel = "email" | "phone" | "web" | "social" | "in_person";

export interface Complaint {
  id: string;
  customerId: string;
  category: ComplaintCategory;
  severity: ComplaintSeverity;
  channel: ComplaintChannel;
  description: string;
  status: ComplaintStatus;
  assignedTo?: string;
  resolution?: string;
  satisfied?: boolean;
  filedAt: string;
  resolvedAt?: string;
}

export interface ComplaintSummary {
  totalComplaints: number;
  open: number;
  resolved: number;
  byCategory: Partial<Record<ComplaintCategory, number>>;
  bySeverity: Partial<Record<ComplaintSeverity, number>>;
  satisfactionRatePct: number;
}

const SEVERITY_ORDER: ComplaintSeverity[] = ["low", "medium", "high", "critical"];

export class ComplaintManager {
  private complaints: Map<string, Complaint> = new Map();

  constructor(private readonly bus: EventBus) {}

  file(input: { customerId: string; category: ComplaintCategory; severity: ComplaintSeverity; channel: ComplaintChannel; description: string; filedAt: string }): Complaint {
    const complaint: Complaint = { ...input, id: randomUUID(), status: "filed" };
    this.complaints.set(complaint.id, complaint);
    this.bus.publish("complaint.filed", { complaintId: complaint.id, category: complaint.category, severity: complaint.severity, channel: complaint.channel });
    return complaint;
  }

  assign(complaintId: string, agentId: string): Complaint | undefined {
    const c = this.complaints.get(complaintId);
    if (!c || c.status === "resolved" || c.status === "closed") return undefined;
    c.assignedTo = agentId;
    c.status = "investigating";
    return c;
  }

  escalate(complaintId: string, toSeverity: ComplaintSeverity): Complaint | undefined {
    const c = this.complaints.get(complaintId);
    if (!c) return undefined;
    if (SEVERITY_ORDER.indexOf(toSeverity) <= SEVERITY_ORDER.indexOf(c.severity)) return undefined;
    const from = c.severity;
    c.severity = toSeverity;
    this.bus.publish("complaint.escalated", { complaintId, fromSeverity: from, toSeverity });
    return c;
  }

  resolve(complaintId: string, resolution: string, satisfied: boolean, asOf: string): Complaint | undefined {
    const c = this.complaints.get(complaintId);
    if (!c || c.status === "resolved" || c.status === "closed") return undefined;
    c.status = "resolved";
    c.resolution = resolution;
    c.satisfied = satisfied;
    c.resolvedAt = asOf;
    const resolutionHours = Math.round((new Date(asOf).getTime() - new Date(c.filedAt).getTime()) / 3600000);
    this.bus.publish("complaint.resolved", { complaintId, resolutionHours, satisfied });
    return c;
  }

  close(complaintId: string): Complaint | undefined {
    const c = this.complaints.get(complaintId);
    if (!c || c.status !== "resolved") return undefined;
    c.status = "closed";
    return c;
  }

  getComplaint(id: string): Complaint | undefined { return this.complaints.get(id); }
  listComplaints(status?: ComplaintStatus, category?: ComplaintCategory): Complaint[] {
    let all = Array.from(this.complaints.values());
    if (status) all = all.filter(c => c.status === status);
    if (category) all = all.filter(c => c.category === category);
    return all;
  }

  summary(): ComplaintSummary {
    const complaints = Array.from(this.complaints.values());
    const byCategory: Partial<Record<ComplaintCategory, number>> = {};
    const bySeverity: Partial<Record<ComplaintSeverity, number>> = {};
    for (const c of complaints) {
      byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
      bySeverity[c.severity] = (bySeverity[c.severity] ?? 0) + 1;
    }
    const rated = complaints.filter(c => c.satisfied !== undefined);
    const satisfied = rated.filter(c => c.satisfied).length;
    return {
      totalComplaints: complaints.length,
      open: complaints.filter(c => c.status === "filed" || c.status === "investigating").length,
      resolved: complaints.filter(c => c.status === "resolved" || c.status === "closed").length,
      byCategory,
      bySeverity,
      satisfactionRatePct: rated.length > 0 ? Math.round((satisfied / rated.length) * 100) : 0,
    };
  }
}
