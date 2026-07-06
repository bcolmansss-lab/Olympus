/**
 * MaintenanceWindowManager — scheduled maintenance windows: window creation
 * with affected services, notification lead-time, status lifecycle, and
 * overlap detection.
 *
 * Events:
 *   - "maintwindow.scheduled": { windowId, services, start, end }
 *   - "maintwindow.started": { windowId }
 *   - "maintwindow.completed": { windowId, actualDurationMinutes }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type WindowStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type WindowType = "planned" | "emergency";

export interface MaintenanceWindow {
  id: string;
  title: string;
  type: WindowType;
  services: string[];
  status: WindowStatus;
  start: string;
  end: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface MaintenanceWindowSummary {
  totalWindows: number;
  scheduled: number;
  inProgress: number;
  completed: number;
  emergencyCount: number;
  affectedServices: number;
}

export class MaintenanceWindowManager {
  private windows: Map<string, MaintenanceWindow> = new Map();

  constructor(private readonly bus: EventBus) {}

  schedule(input: { title: string; type: WindowType; services: string[]; start: string; end: string }): MaintenanceWindow {
    const window: MaintenanceWindow = { ...input, id: randomUUID(), status: "scheduled", createdAt: new Date().toISOString() };
    this.windows.set(window.id, window);
    this.bus.publish("maintwindow.scheduled", { windowId: window.id, services: window.services, start: window.start, end: window.end });
    return window;
  }

  /** Windows that overlap the given time range and share a service. */
  conflicts(services: string[], start: string, end: string): MaintenanceWindow[] {
    const s = new Date(start).getTime(), e = new Date(end).getTime();
    return Array.from(this.windows.values()).filter(w =>
      (w.status === "scheduled" || w.status === "in_progress") &&
      w.services.some(sv => services.includes(sv)) &&
      s < new Date(w.end).getTime() && e > new Date(w.start).getTime()
    );
  }

  start(windowId: string, asOf: string): MaintenanceWindow | undefined {
    const w = this.windows.get(windowId);
    if (!w || w.status !== "scheduled") return undefined;
    w.status = "in_progress";
    w.startedAt = asOf;
    this.bus.publish("maintwindow.started", { windowId });
    return w;
  }

  complete(windowId: string, asOf: string): MaintenanceWindow | undefined {
    const w = this.windows.get(windowId);
    if (!w || w.status !== "in_progress") return undefined;
    w.status = "completed";
    w.completedAt = asOf;
    const durationMinutes = w.startedAt ? Math.round((new Date(asOf).getTime() - new Date(w.startedAt).getTime()) / 60000) : 0;
    this.bus.publish("maintwindow.completed", { windowId, actualDurationMinutes: durationMinutes });
    return w;
  }

  cancel(windowId: string): MaintenanceWindow | undefined {
    const w = this.windows.get(windowId);
    if (!w || w.status === "completed") return undefined;
    w.status = "cancelled";
    return w;
  }

  isServiceInMaintenance(service: string, asOf: string): boolean {
    const now = new Date(asOf).getTime();
    return Array.from(this.windows.values()).some(w =>
      w.status === "in_progress" && w.services.includes(service) &&
      new Date(w.start).getTime() <= now && now <= new Date(w.end).getTime()
    );
  }

  getWindow(id: string): MaintenanceWindow | undefined { return this.windows.get(id); }
  listWindows(status?: WindowStatus): MaintenanceWindow[] {
    const all = Array.from(this.windows.values());
    return status ? all.filter(w => w.status === status) : all;
  }

  summary(): MaintenanceWindowSummary {
    const windows = Array.from(this.windows.values());
    const services = new Set<string>();
    for (const w of windows) for (const s of w.services) services.add(s);
    return {
      totalWindows: windows.length,
      scheduled: windows.filter(w => w.status === "scheduled").length,
      inProgress: windows.filter(w => w.status === "in_progress").length,
      completed: windows.filter(w => w.status === "completed").length,
      emergencyCount: windows.filter(w => w.type === "emergency").length,
      affectedServices: services.size,
    };
  }
}
