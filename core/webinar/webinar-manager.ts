/**
 * WebinarManager — webinar scheduling, registration, attendance tracking,
 * and engagement/conversion analytics.
 *
 * Events:
 *   - "webinar.scheduled": { webinarId, title, scheduledFor, capacity }
 *   - "webinar.registered": { webinarId, registrantId }
 *   - "webinar.attended": { webinarId, registrantId, durationMinutes }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type WebinarStatus = "scheduled" | "live" | "completed" | "cancelled";

export interface Registration {
  id: string;
  registrantId: string;
  email: string;
  registeredAt: string;
  attended: boolean;
  attendanceMinutes: number;
}

export interface Webinar {
  id: string;
  title: string;
  host: string;
  scheduledFor: string;
  durationMinutes: number;
  capacity: number; // 0 = unlimited
  status: WebinarStatus;
  registrations: Registration[];
  createdAt: string;
}

export interface WebinarSummary {
  totalWebinars: number;
  scheduled: number;
  completed: number;
  totalRegistrations: number;
  totalAttendees: number;
  attendanceRatePct: number;
}

export class WebinarManager {
  private webinars: Map<string, Webinar> = new Map();

  constructor(private readonly bus: EventBus) {}

  schedule(input: { title: string; host: string; scheduledFor: string; durationMinutes: number; capacity?: number }): Webinar {
    const webinar: Webinar = {
      id: randomUUID(),
      title: input.title,
      host: input.host,
      scheduledFor: input.scheduledFor,
      durationMinutes: input.durationMinutes,
      capacity: input.capacity ?? 0,
      status: "scheduled",
      registrations: [],
      createdAt: new Date().toISOString(),
    };
    this.webinars.set(webinar.id, webinar);
    this.bus.publish("webinar.scheduled", { webinarId: webinar.id, title: webinar.title, scheduledFor: webinar.scheduledFor, capacity: webinar.capacity });
    return webinar;
  }

  register(webinarId: string, registrantId: string, email: string, registeredAt: string): Registration | undefined {
    const webinar = this.webinars.get(webinarId);
    if (!webinar || webinar.status === "completed" || webinar.status === "cancelled") return undefined;
    if (webinar.capacity > 0 && webinar.registrations.length >= webinar.capacity) return undefined;
    if (webinar.registrations.some(r => r.registrantId === registrantId)) return undefined;
    const reg: Registration = { id: randomUUID(), registrantId, email, registeredAt, attended: false, attendanceMinutes: 0 };
    webinar.registrations.push(reg);
    this.bus.publish("webinar.registered", { webinarId, registrantId });
    return reg;
  }

  start(webinarId: string): Webinar | undefined {
    const webinar = this.webinars.get(webinarId);
    if (!webinar || webinar.status !== "scheduled") return undefined;
    webinar.status = "live";
    return webinar;
  }

  recordAttendance(webinarId: string, registrantId: string, durationMinutes: number): Registration | undefined {
    const webinar = this.webinars.get(webinarId);
    if (!webinar) return undefined;
    const reg = webinar.registrations.find(r => r.registrantId === registrantId);
    if (!reg) return undefined;
    reg.attended = true;
    reg.attendanceMinutes = durationMinutes;
    this.bus.publish("webinar.attended", { webinarId, registrantId, durationMinutes });
    return reg;
  }

  complete(webinarId: string): Webinar | undefined {
    const webinar = this.webinars.get(webinarId);
    if (!webinar || webinar.status === "completed" || webinar.status === "cancelled") return undefined;
    webinar.status = "completed";
    return webinar;
  }

  cancel(webinarId: string): Webinar | undefined {
    const webinar = this.webinars.get(webinarId);
    if (!webinar || webinar.status === "completed") return undefined;
    webinar.status = "cancelled";
    return webinar;
  }

  attendanceRate(webinarId: string): number {
    const webinar = this.webinars.get(webinarId);
    if (!webinar || webinar.registrations.length === 0) return 0;
    return Math.round((webinar.registrations.filter(r => r.attended).length / webinar.registrations.length) * 100);
  }

  getWebinar(id: string): Webinar | undefined { return this.webinars.get(id); }
  listWebinars(status?: WebinarStatus): Webinar[] {
    const all = Array.from(this.webinars.values());
    return status ? all.filter(w => w.status === status) : all;
  }

  summary(): WebinarSummary {
    const webinars = Array.from(this.webinars.values());
    const regs = webinars.flatMap(w => w.registrations);
    const attendees = regs.filter(r => r.attended).length;
    return {
      totalWebinars: webinars.length,
      scheduled: webinars.filter(w => w.status === "scheduled").length,
      completed: webinars.filter(w => w.status === "completed").length,
      totalRegistrations: regs.length,
      totalAttendees: attendees,
      attendanceRatePct: regs.length > 0 ? Math.round((attendees / regs.length) * 100) : 0,
    };
  }
}
