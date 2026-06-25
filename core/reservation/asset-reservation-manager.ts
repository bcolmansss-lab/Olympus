/**
 * AssetReservationManager — shared resource/equipment booking with conflict
 * detection, check-out/return, and utilization analytics.
 *
 * Events:
 *   - "reservation.resource_added": { resourceId, name, category }
 *   - "reservation.booked": { reservationId, resourceId, holderId, start, end }
 *   - "reservation.returned": { reservationId, resourceId, lateMinutes }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ReservationStatus = "booked" | "checked_out" | "returned" | "cancelled";

export interface ReservableResource {
  id: string;
  name: string;
  category: string;
  location: string;
  active: boolean;
  createdAt: string;
}

export interface Reservation {
  id: string;
  resourceId: string;
  holderId: string;
  start: string;
  end: string;
  status: ReservationStatus;
  checkedOutAt?: string;
  returnedAt?: string;
  createdAt: string;
}

export interface ReservationSummary {
  totalResources: number;
  totalReservations: number;
  activeBookings: number;
  checkedOut: number;
  returned: number;
  byCategory: Record<string, number>;
}

export class AssetReservationManager {
  private resources: Map<string, ReservableResource> = new Map();
  private reservations: Map<string, Reservation> = new Map();

  constructor(private readonly bus: EventBus) {}

  addResource(input: { name: string; category: string; location: string }): ReservableResource {
    const resource: ReservableResource = { ...input, id: randomUUID(), active: true, createdAt: new Date().toISOString() };
    this.resources.set(resource.id, resource);
    this.bus.publish("reservation.resource_added", { resourceId: resource.id, name: resource.name, category: resource.category });
    return resource;
  }

  private overlaps(resourceId: string, start: string, end: string): boolean {
    const s = new Date(start).getTime(), e = new Date(end).getTime();
    return Array.from(this.reservations.values()).some(r =>
      r.resourceId === resourceId &&
      (r.status === "booked" || r.status === "checked_out") &&
      s < new Date(r.end).getTime() && e > new Date(r.start).getTime()
    );
  }

  book(resourceId: string, holderId: string, start: string, end: string): Reservation | undefined {
    const resource = this.resources.get(resourceId);
    if (!resource || !resource.active) return undefined;
    if (new Date(start).getTime() >= new Date(end).getTime()) return undefined;
    if (this.overlaps(resourceId, start, end)) return undefined;
    const reservation: Reservation = { id: randomUUID(), resourceId, holderId, start, end, status: "booked", createdAt: new Date().toISOString() };
    this.reservations.set(reservation.id, reservation);
    this.bus.publish("reservation.booked", { reservationId: reservation.id, resourceId, holderId, start, end });
    return reservation;
  }

  checkOut(reservationId: string, asOf: string): Reservation | undefined {
    const reservation = this.reservations.get(reservationId);
    if (!reservation || reservation.status !== "booked") return undefined;
    reservation.status = "checked_out";
    reservation.checkedOutAt = asOf;
    return reservation;
  }

  returnResource(reservationId: string, asOf: string): Reservation | undefined {
    const reservation = this.reservations.get(reservationId);
    if (!reservation || reservation.status !== "checked_out") return undefined;
    reservation.status = "returned";
    reservation.returnedAt = asOf;
    const lateMinutes = Math.max(0, Math.round((new Date(asOf).getTime() - new Date(reservation.end).getTime()) / 60000));
    this.bus.publish("reservation.returned", { reservationId, resourceId: reservation.resourceId, lateMinutes });
    return reservation;
  }

  cancel(reservationId: string): Reservation | undefined {
    const reservation = this.reservations.get(reservationId);
    if (!reservation || reservation.status === "returned") return undefined;
    reservation.status = "cancelled";
    return reservation;
  }

  getResource(id: string): ReservableResource | undefined { return this.resources.get(id); }
  listResources(category?: string): ReservableResource[] {
    const all = Array.from(this.resources.values());
    return category ? all.filter(r => r.category === category) : all;
  }
  listReservations(resourceId?: string, status?: ReservationStatus): Reservation[] {
    let all = Array.from(this.reservations.values());
    if (resourceId) all = all.filter(r => r.resourceId === resourceId);
    if (status) all = all.filter(r => r.status === status);
    return all;
  }

  summary(): ReservationSummary {
    const resources = Array.from(this.resources.values());
    const reservations = Array.from(this.reservations.values());
    const byCategory: Record<string, number> = {};
    for (const r of resources) { byCategory[r.category] = (byCategory[r.category] ?? 0) + 1; }
    return {
      totalResources: resources.length,
      totalReservations: reservations.length,
      activeBookings: reservations.filter(r => r.status === "booked").length,
      checkedOut: reservations.filter(r => r.status === "checked_out").length,
      returned: reservations.filter(r => r.status === "returned").length,
      byCategory,
    };
  }
}
