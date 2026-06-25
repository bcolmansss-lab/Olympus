/**
 * CorporateTravelManager — corporate travel requests, policy-based approval,
 * booking, and travel spend analytics.
 *
 * Events:
 *   - "travel.requested": { tripId, travelerId, estimatedCostUsd, withinPolicy }
 *   - "travel.approved": { tripId, approverId }
 *   - "travel.booked": { tripId, actualCostUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type TripStatus = "requested" | "approved" | "rejected" | "booked" | "completed" | "cancelled";
export type TripPurpose = "client_meeting" | "conference" | "internal" | "training" | "sales" | "other";

export interface TravelSegment {
  kind: "flight" | "hotel" | "car" | "rail";
  description: string;
  costUsd: number;
}

export interface Trip {
  id: string;
  travelerId: string;
  purpose: TripPurpose;
  destination: string;
  departDate: string;
  returnDate: string;
  estimatedCostUsd: number;
  actualCostUsd?: number;
  status: TripStatus;
  withinPolicy: boolean;
  segments: TravelSegment[];
  approverId?: string;
  createdAt: string;
}

export interface TravelSummary {
  totalTrips: number;
  pendingApproval: number;
  booked: number;
  totalEstimatedUsd: number;
  totalActualUsd: number;
  outOfPolicyCount: number;
  byPurpose: Partial<Record<TripPurpose, number>>;
}

export class CorporateTravelManager {
  private trips: Map<string, Trip> = new Map();
  private policyCapUsd: number;

  constructor(private readonly bus: EventBus, policyCapUsd = 3000) {
    this.policyCapUsd = policyCapUsd;
  }

  request(input: { travelerId: string; purpose: TripPurpose; destination: string; departDate: string; returnDate: string; segments: TravelSegment[] }): Trip {
    const estimatedCostUsd = input.segments.reduce((s, seg) => s + seg.costUsd, 0);
    const withinPolicy = estimatedCostUsd <= this.policyCapUsd;
    const trip: Trip = {
      id: randomUUID(),
      travelerId: input.travelerId,
      purpose: input.purpose,
      destination: input.destination,
      departDate: input.departDate,
      returnDate: input.returnDate,
      estimatedCostUsd,
      status: "requested",
      withinPolicy,
      segments: input.segments,
      createdAt: new Date().toISOString(),
    };
    this.trips.set(trip.id, trip);
    this.bus.publish("travel.requested", { tripId: trip.id, travelerId: trip.travelerId, estimatedCostUsd, withinPolicy });
    return trip;
  }

  approve(tripId: string, approverId: string): Trip | undefined {
    const trip = this.trips.get(tripId);
    if (!trip || trip.status !== "requested") return undefined;
    trip.status = "approved";
    trip.approverId = approverId;
    this.bus.publish("travel.approved", { tripId, approverId });
    return trip;
  }

  reject(tripId: string, approverId: string): Trip | undefined {
    const trip = this.trips.get(tripId);
    if (!trip || trip.status !== "requested") return undefined;
    trip.status = "rejected";
    trip.approverId = approverId;
    return trip;
  }

  book(tripId: string, actualCostUsd: number): Trip | undefined {
    const trip = this.trips.get(tripId);
    if (!trip || trip.status !== "approved") return undefined;
    trip.status = "booked";
    trip.actualCostUsd = actualCostUsd;
    this.bus.publish("travel.booked", { tripId, actualCostUsd });
    return trip;
  }

  complete(tripId: string): Trip | undefined {
    const trip = this.trips.get(tripId);
    if (!trip || trip.status !== "booked") return undefined;
    trip.status = "completed";
    return trip;
  }

  cancel(tripId: string): Trip | undefined {
    const trip = this.trips.get(tripId);
    if (!trip || trip.status === "completed") return undefined;
    trip.status = "cancelled";
    return trip;
  }

  getTrip(id: string): Trip | undefined { return this.trips.get(id); }
  listTrips(travelerId?: string, status?: TripStatus): Trip[] {
    let all = Array.from(this.trips.values());
    if (travelerId) all = all.filter(t => t.travelerId === travelerId);
    if (status) all = all.filter(t => t.status === status);
    return all;
  }

  summary(): TravelSummary {
    const trips = Array.from(this.trips.values());
    const byPurpose: Partial<Record<TripPurpose, number>> = {};
    for (const t of trips) { byPurpose[t.purpose] = (byPurpose[t.purpose] ?? 0) + 1; }
    return {
      totalTrips: trips.length,
      pendingApproval: trips.filter(t => t.status === "requested").length,
      booked: trips.filter(t => t.status === "booked" || t.status === "completed").length,
      totalEstimatedUsd: trips.reduce((s, t) => s + t.estimatedCostUsd, 0),
      totalActualUsd: trips.reduce((s, t) => s + (t.actualCostUsd ?? 0), 0),
      outOfPolicyCount: trips.filter(t => !t.withinPolicy).length,
      byPurpose,
    };
  }
}
