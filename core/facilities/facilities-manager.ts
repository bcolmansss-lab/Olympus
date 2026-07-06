/**
 * FacilitiesManager — office space, lease management, maintenance requests,
 * room bookings, asset tracking, and space utilization analytics.
 *
 * Events:
 *   - "facilities.lease_expiring": { locationId, name, expiresAt, daysRemaining }
 *   - "facilities.maintenance_completed": { requestId, locationId, cost }
 *   - "facilities.room_booked": { roomId, bookingId, bookedBy, startTime, endTime }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type LeaseStatus = "active" | "expired" | "pending" | "terminated";
export type MaintenanceStatus = "open" | "in_progress" | "completed" | "cancelled";
export type MaintenancePriority = "low" | "medium" | "high" | "critical";

export interface FacilityLocation {
  id: string;
  name: string;
  address: string;
  country: string;
  sqft: number;
  capacity: number;
  leaseStatus: LeaseStatus;
  monthlyRentUsd: number;
  leaseStartDate: string;
  leaseEndDate: string;
  createdAt: string;
}

export interface MaintenanceRequest {
  id: string;
  locationId: string;
  title: string;
  description: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  assignedTo?: string;
  estimatedCostUsd: number;
  actualCostUsd?: number;
  requestedAt: string;
  completedAt?: string;
}

export interface RoomBooking {
  id: string;
  roomId: string;
  locationId: string;
  bookedBy: string;
  title: string;
  startTime: string;
  endTime: string;
  attendeeCount: number;
  createdAt: string;
}

export interface FacilitiesSummary {
  totalLocations: number;
  activeLeases: number;
  totalSqft: number;
  monthlyRentUsd: number;
  openMaintenanceRequests: number;
  pendingMaintenanceCostUsd: number;
  upcomingLeaseExpirations: number; // expiring within 90 days
}

export class FacilitiesManager {
  private locations: Map<string, FacilityLocation> = new Map();
  private maintenanceRequests: Map<string, MaintenanceRequest> = new Map();
  private bookings: Map<string, RoomBooking> = new Map();

  constructor(private readonly bus: EventBus) {}

  addLocation(input: Omit<FacilityLocation, "id" | "createdAt"> & { id?: string }): FacilityLocation {
    const location: FacilityLocation = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.locations.set(location.id, location);
    // Check if expiring within 90 days
    const daysRemaining = Math.floor((new Date(location.leaseEndDate).getTime() - Date.now()) / 86400000);
    if (daysRemaining <= 90 && location.leaseStatus === "active") {
      this.bus.publish("facilities.lease_expiring", { locationId: location.id, name: location.name, expiresAt: location.leaseEndDate, daysRemaining });
    }
    return location;
  }

  createMaintenanceRequest(input: Omit<MaintenanceRequest, "id"> & { id?: string }): MaintenanceRequest {
    const req: MaintenanceRequest = { ...input, id: input.id ?? randomUUID() };
    this.maintenanceRequests.set(req.id, req);
    return req;
  }

  completeMaintenanceRequest(requestId: string, actualCostUsd: number): MaintenanceRequest | undefined {
    const req = this.maintenanceRequests.get(requestId);
    if (!req) return undefined;
    req.status = "completed";
    req.actualCostUsd = actualCostUsd;
    req.completedAt = new Date().toISOString();
    this.bus.publish("facilities.maintenance_completed", { requestId, locationId: req.locationId, cost: actualCostUsd });
    return req;
  }

  bookRoom(input: Omit<RoomBooking, "id" | "createdAt"> & { id?: string }): RoomBooking {
    const booking: RoomBooking = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.bookings.set(booking.id, booking);
    this.bus.publish("facilities.room_booked", { roomId: booking.roomId, bookingId: booking.id, bookedBy: booking.bookedBy, startTime: booking.startTime, endTime: booking.endTime });
    return booking;
  }

  getLocation(id: string): FacilityLocation | undefined { return this.locations.get(id); }
  listLocations(): FacilityLocation[] { return Array.from(this.locations.values()); }
  listMaintenanceRequests(status?: MaintenanceStatus): MaintenanceRequest[] {
    const all = Array.from(this.maintenanceRequests.values());
    return status ? all.filter(r => r.status === status) : all;
  }
  listBookings(locationId?: string): RoomBooking[] {
    const all = Array.from(this.bookings.values());
    return locationId ? all.filter(b => b.locationId === locationId) : all;
  }

  summary(): FacilitiesSummary {
    const locs = Array.from(this.locations.values());
    const active = locs.filter(l => l.leaseStatus === "active");
    const now = Date.now();
    const upcoming = locs.filter(l => l.leaseStatus === "active" && (new Date(l.leaseEndDate).getTime() - now) / 86400000 <= 90).length;
    const openReqs = Array.from(this.maintenanceRequests.values()).filter(r => r.status === "open" || r.status === "in_progress");
    return {
      totalLocations: locs.length,
      activeLeases: active.length,
      totalSqft: active.reduce((s, l) => s + l.sqft, 0),
      monthlyRentUsd: active.reduce((s, l) => s + l.monthlyRentUsd, 0),
      openMaintenanceRequests: openReqs.length,
      pendingMaintenanceCostUsd: openReqs.reduce((s, r) => s + r.estimatedCostUsd, 0),
      upcomingLeaseExpirations: upcoming,
    };
  }
}
