/**
 * AppointmentManager — appointment scheduling against provider availability
 * with double-booking prevention, confirmation, cancellation, and no-show
 * tracking.
 *
 * Events:
 *   - "appointment.booked": { appointmentId, providerId, customerId, start }
 *   - "appointment.cancelled": { appointmentId, reason }
 *   - "appointment.completed": { appointmentId, durationMinutes }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type AppointmentStatus = "booked" | "confirmed" | "completed" | "cancelled" | "no_show";

export interface Appointment {
  id: string;
  providerId: string;
  customerId: string;
  service: string;
  start: string;
  end: string;
  status: AppointmentStatus;
  createdAt: string;
}

export interface AppointmentSummary {
  totalAppointments: number;
  booked: number;
  completed: number;
  cancelled: number;
  noShows: number;
  noShowRatePct: number;
  byProvider: Record<string, number>;
}

export class AppointmentManager {
  private appointments: Map<string, Appointment> = new Map();

  constructor(private readonly bus: EventBus) {}

  private conflicts(providerId: string, start: string, end: string): boolean {
    const s = new Date(start).getTime(), e = new Date(end).getTime();
    return Array.from(this.appointments.values()).some(a =>
      a.providerId === providerId &&
      (a.status === "booked" || a.status === "confirmed") &&
      s < new Date(a.end).getTime() && e > new Date(a.start).getTime()
    );
  }

  book(input: { providerId: string; customerId: string; service: string; start: string; end: string }): Appointment | undefined {
    if (new Date(input.start).getTime() >= new Date(input.end).getTime()) return undefined;
    if (this.conflicts(input.providerId, input.start, input.end)) return undefined;
    const appointment: Appointment = { ...input, id: randomUUID(), status: "booked", createdAt: new Date().toISOString() };
    this.appointments.set(appointment.id, appointment);
    this.bus.publish("appointment.booked", { appointmentId: appointment.id, providerId: appointment.providerId, customerId: appointment.customerId, start: appointment.start });
    return appointment;
  }

  confirm(appointmentId: string): Appointment | undefined {
    const a = this.appointments.get(appointmentId);
    if (!a || a.status !== "booked") return undefined;
    a.status = "confirmed";
    return a;
  }

  complete(appointmentId: string): Appointment | undefined {
    const a = this.appointments.get(appointmentId);
    if (!a || (a.status !== "booked" && a.status !== "confirmed")) return undefined;
    a.status = "completed";
    const durationMinutes = Math.round((new Date(a.end).getTime() - new Date(a.start).getTime()) / 60000);
    this.bus.publish("appointment.completed", { appointmentId, durationMinutes });
    return a;
  }

  cancel(appointmentId: string, reason: string): Appointment | undefined {
    const a = this.appointments.get(appointmentId);
    if (!a || a.status === "completed") return undefined;
    a.status = "cancelled";
    this.bus.publish("appointment.cancelled", { appointmentId, reason });
    return a;
  }

  markNoShow(appointmentId: string): Appointment | undefined {
    const a = this.appointments.get(appointmentId);
    if (!a || (a.status !== "booked" && a.status !== "confirmed")) return undefined;
    a.status = "no_show";
    return a;
  }

  getAppointment(id: string): Appointment | undefined { return this.appointments.get(id); }
  listAppointments(providerId?: string, status?: AppointmentStatus): Appointment[] {
    let all = Array.from(this.appointments.values());
    if (providerId) all = all.filter(a => a.providerId === providerId);
    if (status) all = all.filter(a => a.status === status);
    return all;
  }

  summary(): AppointmentSummary {
    const appts = Array.from(this.appointments.values());
    const noShows = appts.filter(a => a.status === "no_show").length;
    const finished = appts.filter(a => a.status === "completed" || a.status === "no_show").length;
    const byProvider: Record<string, number> = {};
    for (const a of appts) { byProvider[a.providerId] = (byProvider[a.providerId] ?? 0) + 1; }
    return {
      totalAppointments: appts.length,
      booked: appts.filter(a => a.status === "booked" || a.status === "confirmed").length,
      completed: appts.filter(a => a.status === "completed").length,
      cancelled: appts.filter(a => a.status === "cancelled").length,
      noShows,
      noShowRatePct: finished > 0 ? Math.round((noShows / finished) * 100) : 0,
      byProvider,
    };
  }
}
