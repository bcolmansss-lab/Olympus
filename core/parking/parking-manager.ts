/**
 * ParkingManager — office parking allocation: space inventory by zone,
 * employee assignment with one-space-per-employee enforcement, a FIFO
 * waitlist when full, and automatic promotion on release.
 *
 * Events:
 *   - "parking.assigned": { spaceId, employeeId }
 *   - "parking.waitlisted": { employeeId, position }
 *   - "parking.released": { spaceId, employeeId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export interface ParkingSpace {
  id: string;
  label: string;
  zone: string;
  assignedTo?: string;
}

export interface ParkingSummary {
  totalSpaces: number;
  occupied: number;
  occupancyPct: number;
  waitlistLength: number;
  byZone: Record<string, { total: number; occupied: number }>;
}

export class ParkingManager {
  private spaces: Map<string, ParkingSpace> = new Map();
  private waitlist: string[] = [];

  constructor(private readonly bus: EventBus) {}

  addSpace(label: string, zone: string): ParkingSpace {
    const space: ParkingSpace = { id: randomUUID(), label, zone };
    this.spaces.set(space.id, space);
    return space;
  }

  /** Assign the first free space; waitlist the employee when none is free. */
  request(employeeId: string): { space?: ParkingSpace; waitlisted: boolean } {
    if (this.assignmentFor(employeeId) || this.waitlist.includes(employeeId)) {
      return { space: this.assignmentFor(employeeId), waitlisted: this.waitlist.includes(employeeId) };
    }
    const free = Array.from(this.spaces.values()).find(s => !s.assignedTo);
    if (free) {
      free.assignedTo = employeeId;
      this.bus.publish("parking.assigned", { spaceId: free.id, employeeId });
      return { space: free, waitlisted: false };
    }
    this.waitlist.push(employeeId);
    this.bus.publish("parking.waitlisted", { employeeId, position: this.waitlist.length });
    return { waitlisted: true };
  }

  /** Release a space; the head of the waitlist is promoted into it. */
  release(spaceId: string): ParkingSpace | undefined {
    const space = this.spaces.get(spaceId);
    if (!space || !space.assignedTo) return undefined;
    const prev = space.assignedTo;
    space.assignedTo = undefined;
    this.bus.publish("parking.released", { spaceId, employeeId: prev });
    const next = this.waitlist.shift();
    if (next) {
      space.assignedTo = next;
      this.bus.publish("parking.assigned", { spaceId, employeeId: next });
    }
    return space;
  }

  assignmentFor(employeeId: string): ParkingSpace | undefined {
    return Array.from(this.spaces.values()).find(s => s.assignedTo === employeeId);
  }

  getSpace(id: string): ParkingSpace | undefined { return this.spaces.get(id); }
  listSpaces(zone?: string): ParkingSpace[] {
    const all = Array.from(this.spaces.values());
    return zone ? all.filter(s => s.zone === zone) : all;
  }
  waitlistPosition(employeeId: string): number {
    const idx = this.waitlist.indexOf(employeeId);
    return idx === -1 ? 0 : idx + 1;
  }

  summary(): ParkingSummary {
    const spaces = Array.from(this.spaces.values());
    const occupied = spaces.filter(s => s.assignedTo).length;
    const byZone: Record<string, { total: number; occupied: number }> = {};
    for (const s of spaces) {
      const z = byZone[s.zone] ?? { total: 0, occupied: 0 };
      z.total += 1;
      if (s.assignedTo) z.occupied += 1;
      byZone[s.zone] = z;
    }
    return {
      totalSpaces: spaces.length,
      occupied,
      occupancyPct: spaces.length > 0 ? Math.round((occupied / spaces.length) * 100) : 0,
      waitlistLength: this.waitlist.length,
      byZone,
    };
  }
}
