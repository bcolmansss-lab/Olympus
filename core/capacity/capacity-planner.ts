/**
 * CapacityPlanner — models team headcount and project resource demands.
 *
 * Concepts:
 *   - Resource: a person or role with availability (0–1, fraction of full-time)
 *   - Project: a demand for resources by role, with a duration window
 *   - Allocation: a Resource assigned to a Project at a given utilization
 *
 * The planner detects overallocation (a resource's total utilization > 1.0)
 * and emits "capacity.overallocated" events on the bus.
 *
 * All state is in-memory (zero deps).
 */

import type { EventBus } from "../events/event-bus.js";

export interface Resource {
  id: string;
  name: string;
  role: string;
  /** Available fraction (0–1). Default 1.0. */
  availability: number;
}

export interface Project {
  id: string;
  name: string;
  startDate: string; // ISO date
  endDate: string;   // ISO date
  /** Role → required FTE (e.g. { "engineer": 2, "designer": 0.5 }) */
  demands: Record<string, number>;
}

export interface Allocation {
  resourceId: string;
  projectId: string;
  /** Fraction of the resource's time committed to this project (0–1). */
  utilization: number;
}

export interface OverallocationReport {
  resourceId: string;
  resourceName: string;
  totalUtilization: number;
  availability: number;
  projects: string[]; // project IDs they're over-allocated across
}

export class CapacityPlanner {
  private readonly resources = new Map<string, Resource>();
  private readonly projects = new Map<string, Project>();
  private readonly allocations: Allocation[] = [];

  constructor(private readonly bus: EventBus) {}

  addResource(resource: Resource): this {
    this.resources.set(resource.id, { ...resource, availability: resource.availability ?? 1.0 });
    return this;
  }

  addProject(project: Project): this {
    this.projects.set(project.id, project);
    return this;
  }

  /**
   * Allocate a resource to a project at a given utilization.
   * Automatically checks for overallocation and emits event if detected.
   */
  allocate(allocation: Allocation): OverallocationReport | undefined {
    this.allocations.push(allocation);
    return this.checkOverallocation(allocation.resourceId);
  }

  deallocate(resourceId: string, projectId: string): void {
    const idx = this.allocations.findIndex(
      (a) => a.resourceId === resourceId && a.projectId === projectId
    );
    if (idx !== -1) this.allocations.splice(idx, 1);
  }

  /** Returns an OverallocationReport if the resource is over-allocated, undefined otherwise. */
  checkOverallocation(resourceId: string): OverallocationReport | undefined {
    const resource = this.resources.get(resourceId);
    if (!resource) return undefined;

    const myAllocations = this.allocations.filter((a) => a.resourceId === resourceId);
    const total = myAllocations.reduce((sum, a) => sum + a.utilization, 0);

    if (total <= resource.availability) return undefined;

    const report: OverallocationReport = {
      resourceId,
      resourceName: resource.name,
      totalUtilization: total,
      availability: resource.availability,
      projects: myAllocations.map((a) => a.projectId),
    };

    this.bus.publish("capacity.overallocated", report);
    return report;
  }

  /** Get total utilization for a resource. */
  utilizationFor(resourceId: string): number {
    return this.allocations
      .filter((a) => a.resourceId === resourceId)
      .reduce((sum, a) => sum + a.utilization, 0);
  }

  /** Get all resources over-allocated. */
  overallocatedResources(): OverallocationReport[] {
    const seen = new Set<string>();
    const reports: OverallocationReport[] = [];
    for (const a of this.allocations) {
      if (seen.has(a.resourceId)) continue;
      seen.add(a.resourceId);
      const r = this.checkOverallocation(a.resourceId);
      if (r) reports.push(r);
    }
    return reports;
  }

  /** Get team capacity summary: role → { available FTE, allocated FTE }. */
  capacitySummary(): Record<string, { available: number; allocated: number }> {
    const summary: Record<string, { available: number; allocated: number }> = {};
    for (const r of this.resources.values()) {
      if (!summary[r.role]) summary[r.role] = { available: 0, allocated: 0 };
      summary[r.role]!.available += r.availability;
    }
    for (const a of this.allocations) {
      const res = this.resources.get(a.resourceId);
      if (!res) continue;
      if (!summary[res.role]) summary[res.role] = { available: 0, allocated: 0 };
      summary[res.role]!.allocated += a.utilization;
    }
    return summary;
  }

  listResources(): Resource[] { return [...this.resources.values()]; }
  listProjects(): Project[] { return [...this.projects.values()]; }
  listAllocations(): Allocation[] { return [...this.allocations]; }
}
