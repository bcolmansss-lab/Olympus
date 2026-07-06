/**
 * RouteOptimizerManager — delivery route planning: stop registration with
 * coordinates, greedy nearest-neighbor route sequencing from a depot, stop
 * completion tracking, and per-route distance reporting.
 *
 * Events:
 *   - "route.planned": { routeId, stopCount, totalDistanceKm }
 *   - "route.completed": { routeId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RoutePlanStatus = "planned" | "in_progress" | "completed";

export interface DeliveryStop {
  id: string;
  address: string;
  lat: number;
  lon: number;
  completed: boolean;
}

export interface RoutePlan {
  id: string;
  driverId: string;
  stops: DeliveryStop[];
  totalDistanceKm: number;
  status: RoutePlanStatus;
  plannedAt: string;
}

export interface RouteOptimizerSummary {
  totalRoutes: number;
  completedRoutes: number;
  totalStops: number;
  stopsCompleted: number;
  totalDistanceKm: number;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class RouteOptimizerManager {
  private routes: Map<string, RoutePlan> = new Map();

  constructor(private readonly bus: EventBus) {}

  /**
   * Plan a route: order stops by greedy nearest-neighbor starting from the
   * depot, computing total travel distance depot → stops in sequence.
   */
  planRoute(driverId: string, depot: { lat: number; lon: number }, stops: Array<{ address: string; lat: number; lon: number }>, plannedAt: string): RoutePlan | undefined {
    if (stops.length === 0) return undefined;
    const remaining = stops.map(s => ({ id: randomUUID(), address: s.address, lat: s.lat, lon: s.lon, completed: false }));
    const ordered: DeliveryStop[] = [];
    let cur = { lat: depot.lat, lon: depot.lon };
    let totalKm = 0;
    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const s = remaining[i]!;
        const d = haversineKm(cur.lat, cur.lon, s.lat, s.lon);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      const next = remaining.splice(bestIdx, 1)[0]!;
      ordered.push(next);
      totalKm += bestDist;
      cur = { lat: next.lat, lon: next.lon };
    }
    const route: RoutePlan = {
      id: randomUUID(),
      driverId,
      stops: ordered,
      totalDistanceKm: Math.round(totalKm * 100) / 100,
      status: "planned",
      plannedAt,
    };
    this.routes.set(route.id, route);
    this.bus.publish("route.planned", { routeId: route.id, stopCount: ordered.length, totalDistanceKm: route.totalDistanceKm });
    return route;
  }

  start(routeId: string): RoutePlan | undefined {
    const r = this.routes.get(routeId);
    if (!r || r.status !== "planned") return undefined;
    r.status = "in_progress";
    return r;
  }

  /** Mark a stop done; when the last stop completes, the route completes. */
  completeStop(routeId: string, stopId: string): RoutePlan | undefined {
    const r = this.routes.get(routeId);
    if (!r || r.status !== "in_progress") return undefined;
    const stop = r.stops.find(s => s.id === stopId);
    if (!stop || stop.completed) return undefined;
    stop.completed = true;
    if (r.stops.every(s => s.completed)) {
      r.status = "completed";
      this.bus.publish("route.completed", { routeId });
    }
    return r;
  }

  getRoute(id: string): RoutePlan | undefined { return this.routes.get(id); }
  listRoutes(status?: RoutePlanStatus): RoutePlan[] {
    const all = Array.from(this.routes.values());
    return status ? all.filter(r => r.status === status) : all;
  }

  summary(): RouteOptimizerSummary {
    const routes = Array.from(this.routes.values());
    const allStops = routes.flatMap(r => r.stops);
    return {
      totalRoutes: routes.length,
      completedRoutes: routes.filter(r => r.status === "completed").length,
      totalStops: allStops.length,
      stopsCompleted: allStops.filter(s => s.completed).length,
      totalDistanceKm: Math.round(routes.reduce((s, r) => s + r.totalDistanceKm, 0) * 100) / 100,
    };
  }
}
