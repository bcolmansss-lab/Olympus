/**
 * EventManager — conferences, webinars, field events, and trade shows.
 * Tracks registrations, attendance, budget, leads generated, and ROI.
 *
 * Events (bus):
 *   - "event_mgmt.event_created": { eventId, name, type, startDate }
 *   - "event_mgmt.registration": { eventId, attendeeId, type }
 *   - "event_mgmt.completed": { eventId, attendees, leadsGenerated, roiPct }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type EventType = "conference" | "webinar" | "trade_show" | "user_conference" | "workshop" | "meetup" | "field_event";
export type EventStatus = "planning" | "registration_open" | "in_progress" | "completed" | "cancelled";
export type AttendeeType = "customer" | "prospect" | "partner" | "employee" | "speaker" | "sponsor";

export interface ManagedEvent {
  id: string;
  name: string;
  type: EventType;
  status: EventStatus;
  startDate: string;
  endDate: string;
  location: string; // physical or "virtual"
  budgetUsd: number;
  actualSpendUsd: number;
  expectedAttendees: number;
  registrationCount: number;
  attendanceCount: number;
  leadsGenerated: number;
  pipelineGeneratedUsd: number;
  ownerId: string;
  tags?: string[];
  createdAt: string;
}

export interface EventRegistration {
  id: string;
  eventId: string;
  attendeeId: string;
  attendeeName: string;
  attendeeType: AttendeeType;
  company?: string;
  registeredAt: string;
  attended: boolean;
  leadQualified: boolean;
}

export interface EventSummary {
  totalEvents: number;
  upcomingEvents: number;
  completedEvents: number;
  totalBudgetUsd: number;
  totalSpendUsd: number;
  totalLeadsGenerated: number;
  totalPipelineUsd: number;
  avgRoiPct: number;
}

export class EventManager {
  private events: Map<string, ManagedEvent> = new Map();
  private registrations: Map<string, EventRegistration> = new Map();

  constructor(private readonly bus: EventBus) {}

  createEvent(
    input: Omit<ManagedEvent, "id" | "createdAt" | "registrationCount" | "attendanceCount" | "leadsGenerated" | "pipelineGeneratedUsd" | "actualSpendUsd"> & { id?: string },
  ): ManagedEvent {
    const event: ManagedEvent = {
      ...input,
      id: input.id ?? randomUUID(),
      actualSpendUsd: 0,
      registrationCount: 0,
      attendanceCount: 0,
      leadsGenerated: 0,
      pipelineGeneratedUsd: 0,
      createdAt: new Date().toISOString(),
    };
    this.events.set(event.id, event);
    this.bus.publish("event_mgmt.event_created", {
      eventId: event.id,
      name: event.name,
      type: event.type,
      startDate: event.startDate,
    });
    return event;
  }

  registerAttendee(
    eventId: string,
    reg: Omit<EventRegistration, "id" | "eventId" | "registeredAt" | "attended" | "leadQualified"> & { registeredAt?: string },
  ): EventRegistration | undefined {
    const event = this.events.get(eventId);
    if (!event) return undefined;

    const registration: EventRegistration = {
      ...reg,
      id: randomUUID(),
      eventId,
      registeredAt: reg.registeredAt ?? new Date().toISOString(),
      attended: false,
      leadQualified: false,
    };
    this.registrations.set(registration.id, registration);
    event.registrationCount += 1;

    this.bus.publish("event_mgmt.registration", {
      eventId,
      attendeeId: reg.attendeeId,
      type: reg.attendeeType,
    });
    return registration;
  }

  recordAttendance(registrationId: string): EventRegistration | undefined {
    const reg = this.registrations.get(registrationId);
    if (!reg) return undefined;
    if (!reg.attended) {
      reg.attended = true;
      const event = this.events.get(reg.eventId);
      if (event) event.attendanceCount += 1;
    }
    return reg;
  }

  qualifyLead(registrationId: string): EventRegistration | undefined {
    const reg = this.registrations.get(registrationId);
    if (!reg) return undefined;
    if (!reg.leadQualified) {
      reg.leadQualified = true;
      const event = this.events.get(reg.eventId);
      if (event) event.leadsGenerated += 1;
    }
    return reg;
  }

  completeEvent(eventId: string, actualSpendUsd: number, pipelineGeneratedUsd: number): ManagedEvent | undefined {
    const event = this.events.get(eventId);
    if (!event) return undefined;

    event.status = "completed";
    event.actualSpendUsd = actualSpendUsd;
    event.pipelineGeneratedUsd = pipelineGeneratedUsd;

    const roiPct = actualSpendUsd > 0
      ? (pipelineGeneratedUsd - actualSpendUsd) / actualSpendUsd * 100
      : 0;

    this.bus.publish("event_mgmt.completed", {
      eventId,
      attendees: event.attendanceCount,
      leadsGenerated: event.leadsGenerated,
      roiPct,
    });
    return event;
  }

  get(id: string): ManagedEvent | undefined {
    return this.events.get(id);
  }

  list(status?: EventStatus): ManagedEvent[] {
    const all = Array.from(this.events.values());
    if (status === undefined) return all;
    return all.filter((e) => e.status === status);
  }

  getRegistrations(eventId: string): EventRegistration[] {
    return Array.from(this.registrations.values()).filter((r) => r.eventId === eventId);
  }

  summary(): EventSummary {
    const all = Array.from(this.events.values());
    const completed = all.filter((e) => e.status === "completed");
    const upcoming = all.filter((e) => e.status === "registration_open" || e.status === "planning");

    const roiValues = completed
      .filter((e) => e.actualSpendUsd > 0)
      .map((e) => (e.pipelineGeneratedUsd - e.actualSpendUsd) / e.actualSpendUsd * 100);
    const avgRoiPct = roiValues.length > 0
      ? roiValues.reduce((a, b) => a + b, 0) / roiValues.length
      : 0;

    return {
      totalEvents: all.length,
      upcomingEvents: upcoming.length,
      completedEvents: completed.length,
      totalBudgetUsd: all.reduce((sum, e) => sum + e.budgetUsd, 0),
      totalSpendUsd: all.reduce((sum, e) => sum + e.actualSpendUsd, 0),
      totalLeadsGenerated: all.reduce((sum, e) => sum + e.leadsGenerated, 0),
      totalPipelineUsd: all.reduce((sum, e) => sum + e.pipelineGeneratedUsd, 0),
      avgRoiPct,
    };
  }
}
