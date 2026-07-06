/**
 * DeliveryRouteManager — last-mile delivery routing: route planning with
 * ordered stops, driver assignment, stop completion/failure tracking, and
 * on-time performance analytics.
 *
 * Events:
 *   - "route.planned": { routeId, driverId, stopCount }
 *   - "route.stop_completed": { routeId, stopId, onTime }
 *   - "route.completed": { routeId, completedStops, failedStops }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RouteStatus = "planned" | "in_progress" | "completed";
export type StopStatus = "pending" | "delivered" | "failed";

export interface RouteStop {
  id: string;
  sequence: number;
  address: string;
  orderRef: string;
  windowEnd: string; // promised delivery deadline
  status: StopStatus;
  deliveredAt?: string;
  failureReason?: string;
}

export interface DeliveryRoute {
  id: string;
  driverId: string;
  vehicleId: string;
  date: string;
  status: RouteStatus;
  stops: RouteStop[];
  createdAt: string;
}

export interface DeliveryRouteSummary {
  totalRoutes: number;
  activeRoutes: number;
  totalStops: number;
  delivered: number;
  failed: number;
  onTimeRatePct: number;
}

export class DeliveryRouteManager {
  private routes: Map<string, DeliveryRoute> = new Map();

  constructor(private readonly bus: EventBus) {}

  plan(input: { driverId: string; vehicleId: string; date: string; stops: { address: string; orderRef: string; windowEnd: string }[] }): DeliveryRoute {
    const route: DeliveryRoute = {
      id: randomUUID(),
      driverId: input.driverId,
      vehicleId: input.vehicleId,
      date: input.date,
      status: "planned",
      stops: input.stops.map((s, i) => ({ id: randomUUID(), sequence: i + 1, address: s.address, orderRef: s.orderRef, windowEnd: s.windowEnd, status: "pending" })),
      createdAt: new Date().toISOString(),
    };
    this.routes.set(route.id, route);
    this.bus.publish("route.planned", { routeId: route.id, driverId: route.driverId, stopCount: route.stops.length });
    return route;
  }

  start(routeId: string): DeliveryRoute | undefined {
    const route = this.routes.get(routeId);
    if (!route || route.status !== "planned") return undefined;
    route.status = "in_progress";
    return route;
  }

  completeStop(routeId: string, stopId: string, deliveredAt: string): RouteStop | undefined {
    const route = this.routes.get(routeId);
    if (!route) return undefined;
    const stop = route.stops.find(s => s.id === stopId);
    if (!stop || stop.status !== "pending") return undefined;
    if (route.status === "planned") route.status = "in_progress";
    stop.status = "delivered";
    stop.deliveredAt = deliveredAt;
    const onTime = new Date(deliveredAt).getTime() <= new Date(stop.windowEnd).getTime();
    this.bus.publish("route.stop_completed", { routeId, stopId, onTime });
    this.maybeComplete(route);
    return stop;
  }

  failStop(routeId: string, stopId: string, reason: string): RouteStop | undefined {
    const route = this.routes.get(routeId);
    if (!route) return undefined;
    const stop = route.stops.find(s => s.id === stopId);
    if (!stop || stop.status !== "pending") return undefined;
    stop.status = "failed";
    stop.failureReason = reason;
    this.maybeComplete(route);
    return stop;
  }

  private maybeComplete(route: DeliveryRoute): void {
    if (route.stops.every(s => s.status !== "pending")) {
      route.status = "completed";
      this.bus.publish("route.completed", {
        routeId: route.id,
        completedStops: route.stops.filter(s => s.status === "delivered").length,
        failedStops: route.stops.filter(s => s.status === "failed").length,
      });
    }
  }

  getRoute(id: string): DeliveryRoute | undefined { return this.routes.get(id); }
  listRoutes(status?: RouteStatus, driverId?: string): DeliveryRoute[] {
    let all = Array.from(this.routes.values());
    if (status) all = all.filter(r => r.status === status);
    if (driverId) all = all.filter(r => r.driverId === driverId);
    return all;
  }

  summary(): DeliveryRouteSummary {
    const routes = Array.from(this.routes.values());
    const stops = routes.flatMap(r => r.stops);
    const delivered = stops.filter(s => s.status === "delivered");
    const onTime = delivered.filter(s => s.deliveredAt && new Date(s.deliveredAt).getTime() <= new Date(s.windowEnd).getTime()).length;
    return {
      totalRoutes: routes.length,
      activeRoutes: routes.filter(r => r.status === "in_progress" || r.status === "planned").length,
      totalStops: stops.length,
      delivered: delivered.length,
      failed: stops.filter(s => s.status === "failed").length,
      onTimeRatePct: delivered.length > 0 ? Math.round((onTime / delivered.length) * 100) : 0,
    };
  }
}
