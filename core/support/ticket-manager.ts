/**
 * SupportTicketManager — helpdesk lifecycle, SLA enforcement, CSAT, and agent workload.
 *
 * Lifecycle: open → in_progress → pending_customer → resolved → closed
 *
 * Metrics:
 *   - First Response Time (FRT): time from created to first agent reply
 *   - Resolution Time: time from created to resolved
 *   - CSAT: customer satisfaction score (1–5)
 *   - SLA breach: whether FRT or resolution exceeded thresholds by priority
 *
 * SLA thresholds (default):
 *   critical: FRT 1h, resolution 4h
 *   high:     FRT 4h, resolution 24h
 *   medium:   FRT 8h, resolution 72h
 *   low:      FRT 24h, resolution 168h
 *
 * Events:
 *   - "support.ticket_opened": { ticketId, priority, category, customerId }
 *   - "support.ticket_resolved": { ticketId, priority, frtMs, resolutionMs, slaBreached }
 *   - "support.sla_breached": { ticketId, priority, breachType, overdueMs }
 *   - "support.csat_submitted": { ticketId, score, comment }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type TicketPriority = "critical" | "high" | "medium" | "low";
export type TicketStatus = "open" | "in_progress" | "pending_customer" | "resolved" | "closed";
export type TicketCategory = "bug" | "feature_request" | "billing" | "access" | "performance" | "integration" | "other";

export interface Ticket {
  id: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  category: TicketCategory;
  customerId: string;
  assigneeId?: string;
  createdAt: string;
  firstReplyAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  csatScore?: number;      // 1–5
  csatComment?: string;
  slaBreached: boolean;
  tags?: string[];
}

export interface SLAThresholds {
  frtMs: number;
  resolutionMs: number;
}

export type SLAConfig = Record<TicketPriority, SLAThresholds>;

export interface TicketMetrics {
  totalTickets: number;
  openTickets: number;
  avgFrtMs: number;
  avgResolutionMs: number;
  avgCsat: number;
  slaBreachRate: number;  // 0–100
  byPriority: Record<TicketPriority, number>;
  byCategory: Record<TicketCategory, number>;
  byStatus: Record<TicketStatus, number>;
}

const DEFAULT_SLA: SLAConfig = {
  critical: { frtMs: 60 * 60 * 1000, resolutionMs: 4 * 60 * 60 * 1000 },
  high: { frtMs: 4 * 60 * 60 * 1000, resolutionMs: 24 * 60 * 60 * 1000 },
  medium: { frtMs: 8 * 60 * 60 * 1000, resolutionMs: 72 * 60 * 60 * 1000 },
  low: { frtMs: 24 * 60 * 60 * 1000, resolutionMs: 7 * 24 * 60 * 60 * 1000 },
};

export class SupportTicketManager {
  private readonly tickets: Map<string, Ticket> = new Map();
  private readonly slaConfig: SLAConfig;

  constructor(private readonly bus: EventBus, slaConfig?: SLAConfig) {
    this.slaConfig = slaConfig ?? DEFAULT_SLA;
  }

  openTicket(input: Omit<Ticket, "id" | "status" | "slaBreached" | "createdAt"> & { id?: string; createdAt?: string }): Ticket {
    const ticket: Ticket = {
      ...input,
      id: input.id ?? randomUUID(),
      status: "open",
      slaBreached: false,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    this.tickets.set(ticket.id, ticket);
    this.bus.publish("support.ticket_opened", {
      ticketId: ticket.id,
      priority: ticket.priority,
      category: ticket.category,
      customerId: ticket.customerId,
    });
    return ticket;
  }

  assignTicket(id: string, assigneeId: string): Ticket | undefined {
    const ticket = this.tickets.get(id);
    if (!ticket) return undefined;
    ticket.assigneeId = assigneeId;
    ticket.status = "in_progress";
    return ticket;
  }

  recordFirstReply(id: string, replyAt?: string): Ticket | undefined {
    const ticket = this.tickets.get(id);
    if (!ticket) return undefined;
    ticket.firstReplyAt = replyAt ?? new Date().toISOString();
    const frtMs = new Date(ticket.firstReplyAt).getTime() - new Date(ticket.createdAt).getTime();
    const threshold = this.slaConfig[ticket.priority].frtMs;
    if (frtMs > threshold) {
      ticket.slaBreached = true;
      this.bus.publish("support.sla_breached", {
        ticketId: ticket.id,
        priority: ticket.priority,
        breachType: "frt",
        overdueMs: frtMs - threshold,
      });
    }
    return ticket;
  }

  resolveTicket(id: string, resolvedAt?: string): Ticket | undefined {
    const ticket = this.tickets.get(id);
    if (!ticket) return undefined;
    ticket.resolvedAt = resolvedAt ?? new Date().toISOString();
    ticket.status = "resolved";
    const resolutionMs = new Date(ticket.resolvedAt).getTime() - new Date(ticket.createdAt).getTime();
    const threshold = this.slaConfig[ticket.priority].resolutionMs;
    if (resolutionMs > threshold) {
      ticket.slaBreached = true;
      this.bus.publish("support.sla_breached", {
        ticketId: ticket.id,
        priority: ticket.priority,
        breachType: "resolution",
        overdueMs: resolutionMs - threshold,
      });
    }
    const frtMs = ticket.firstReplyAt
      ? new Date(ticket.firstReplyAt).getTime() - new Date(ticket.createdAt).getTime()
      : 0;
    this.bus.publish("support.ticket_resolved", {
      ticketId: ticket.id,
      priority: ticket.priority,
      frtMs,
      resolutionMs,
      slaBreached: ticket.slaBreached,
    });
    return ticket;
  }

  closeTicket(id: string): Ticket | undefined {
    const ticket = this.tickets.get(id);
    if (!ticket) return undefined;
    ticket.closedAt = new Date().toISOString();
    ticket.status = "closed";
    return ticket;
  }

  submitCsat(id: string, score: number, comment?: string): Ticket | undefined {
    const ticket = this.tickets.get(id);
    if (!ticket) return undefined;
    ticket.csatScore = Math.min(5, Math.max(1, score));
    ticket.csatComment = comment;
    this.bus.publish("support.csat_submitted", {
      ticketId: ticket.id,
      score: ticket.csatScore,
      comment,
    });
    return ticket;
  }

  get(id: string): Ticket | undefined {
    return this.tickets.get(id);
  }

  list(status?: TicketStatus): Ticket[] {
    const all = Array.from(this.tickets.values());
    if (status === undefined) return all;
    return all.filter((t) => t.status === status);
  }

  metrics(): TicketMetrics {
    const all = Array.from(this.tickets.values());
    const total = all.length;

    const byPriority: Record<TicketPriority, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const byCategory: Record<TicketCategory, number> = {
      bug: 0, feature_request: 0, billing: 0, access: 0, performance: 0, integration: 0, other: 0,
    };
    const byStatus: Record<TicketStatus, number> = {
      open: 0, in_progress: 0, pending_customer: 0, resolved: 0, closed: 0,
    };

    let frtSum = 0;
    let frtCount = 0;
    let resolutionSum = 0;
    let resolutionCount = 0;
    let csatSum = 0;
    let csatCount = 0;
    let breachCount = 0;

    for (const t of all) {
      byPriority[t.priority]++;
      byCategory[t.category]++;
      byStatus[t.status]++;
      if (t.slaBreached) breachCount++;
      if (t.firstReplyAt) {
        frtSum += new Date(t.firstReplyAt).getTime() - new Date(t.createdAt).getTime();
        frtCount++;
      }
      if ((t.status === "resolved" || t.status === "closed") && t.resolvedAt) {
        resolutionSum += new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime();
        resolutionCount++;
      }
      if (t.csatScore !== undefined) {
        csatSum += t.csatScore;
        csatCount++;
      }
    }

    return {
      totalTickets: total,
      openTickets: byStatus.open,
      avgFrtMs: frtCount > 0 ? frtSum / frtCount : 0,
      avgResolutionMs: resolutionCount > 0 ? resolutionSum / resolutionCount : 0,
      avgCsat: csatCount > 0 ? csatSum / csatCount : 0,
      slaBreachRate: total > 0 ? (breachCount / total) * 100 : 0,
      byPriority,
      byCategory,
      byStatus,
    };
  }
}
