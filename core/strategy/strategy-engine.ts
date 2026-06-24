/**
 * StrategyEngine — company vision, strategic pillars, initiative tracking, and goal cascading.
 *
 * Hierarchy: Vision → Strategic Pillar → Initiative → Milestone
 * Each level cascades goals downward and rolls up progress upward.
 *
 * Events:
 *   - "strategy.initiative_updated": { initiativeId, title, progress, status }
 *   - "strategy.milestone_completed": { milestoneId, initiativeId, title }
 *   - "strategy.pillar_health_changed": { pillarId, name, healthScore }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type InitiativeStatus = "not_started" | "on_track" | "at_risk" | "blocked" | "completed" | "cancelled";
export type StrategicHorizon = "now" | "next" | "later"; // 0-3mo, 3-12mo, 12mo+

export interface StrategicPillar {
  id: string;
  name: string;
  description: string;
  owner: string;
  horizon: StrategicHorizon;
  createdAt: string;
}

export interface Initiative {
  id: string;
  pillarId: string;
  title: string;
  description: string;
  owner: string;
  status: InitiativeStatus;
  progressPct: number; // 0-100
  startDate: string;
  targetDate: string;
  actualCompletedDate?: string;
  dependsOn?: string[]; // other initiative IDs
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  initiativeId: string;
  title: string;
  dueDate: string;
  completedAt?: string;
  completed: boolean;
}

export interface StrategySummary {
  totalPillars: number;
  totalInitiatives: number;
  byStatus: Partial<Record<InitiativeStatus, number>>;
  avgProgress: number;
  onTrackPct: number; // on_track / (total - not_started - cancelled) * 100
  upcomingMilestones: Array<{ id: string; title: string; dueDate: string; initiativeTitle: string }>;
}

export class StrategyEngine {
  private pillars = new Map<string, StrategicPillar>();
  private initiatives = new Map<string, Initiative>();
  private milestones = new Map<string, Milestone>();
  private pillarHealthCache = new Map<string, number>();

  constructor(private readonly bus: EventBus) {}

  addPillar(input: Omit<StrategicPillar, "id" | "createdAt"> & { id?: string }): StrategicPillar {
    const pillar: StrategicPillar = {
      id: input.id ?? randomUUID(),
      name: input.name,
      description: input.description,
      owner: input.owner,
      horizon: input.horizon,
      createdAt: new Date().toISOString(),
    };
    this.pillars.set(pillar.id, pillar);
    return pillar;
  }

  addInitiative(input: Omit<Initiative, "id" | "createdAt" | "updatedAt"> & { id?: string }): Initiative {
    const now = new Date().toISOString();
    const initiative: Initiative = {
      id: input.id ?? randomUUID(),
      pillarId: input.pillarId,
      title: input.title,
      description: input.description,
      owner: input.owner,
      status: input.status,
      progressPct: input.progressPct,
      startDate: input.startDate,
      targetDate: input.targetDate,
      actualCompletedDate: input.actualCompletedDate,
      dependsOn: input.dependsOn,
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
    };
    this.initiatives.set(initiative.id, initiative);
    return initiative;
  }

  updateInitiative(
    id: string,
    updates: Partial<Pick<Initiative, "status" | "progressPct" | "actualCompletedDate">>,
  ): Initiative | undefined {
    const initiative = this.initiatives.get(id);
    if (!initiative) return undefined;

    const now = new Date().toISOString();
    const updated: Initiative = { ...initiative, ...updates, updatedAt: now };

    // Auto-set completion date
    if (
      (updated.progressPct === 100 || updated.status === "completed") &&
      !updated.actualCompletedDate
    ) {
      updated.actualCompletedDate = now;
    }

    this.initiatives.set(id, updated);

    this.bus.publish("strategy.initiative_updated", {
      initiativeId: updated.id,
      title: updated.title,
      progress: updated.progressPct,
      status: updated.status,
    });

    // Recompute pillar health
    this.recomputePillarHealth(updated.pillarId);

    return updated;
  }

  private recomputePillarHealth(pillarId: string): void {
    const pillar = this.pillars.get(pillarId);
    if (!pillar) return;

    const pillarInitiatives = this.listInitiatives(pillarId);
    if (pillarInitiatives.length === 0) return;

    const healthScore =
      pillarInitiatives.reduce((sum, i) => sum + i.progressPct, 0) / pillarInitiatives.length;

    const prev = this.pillarHealthCache.get(pillarId) ?? 0;
    if (Math.abs(healthScore - prev) > 5) {
      this.pillarHealthCache.set(pillarId, healthScore);
      this.bus.publish("strategy.pillar_health_changed", {
        pillarId,
        name: pillar.name,
        healthScore,
      });
    }
  }

  addMilestone(input: Omit<Milestone, "id" | "completed" | "completedAt"> & { id?: string }): Milestone {
    const milestone: Milestone = {
      id: input.id ?? randomUUID(),
      initiativeId: input.initiativeId,
      title: input.title,
      dueDate: input.dueDate,
      completed: false,
    };
    this.milestones.set(milestone.id, milestone);
    return milestone;
  }

  completeMilestone(id: string): Milestone | undefined {
    const milestone = this.milestones.get(id);
    if (!milestone) return undefined;

    const now = new Date().toISOString();
    const completed: Milestone = { ...milestone, completed: true, completedAt: now };
    this.milestones.set(id, completed);

    this.bus.publish("strategy.milestone_completed", {
      milestoneId: completed.id,
      initiativeId: completed.initiativeId,
      title: completed.title,
    });

    // Auto-update parent initiative progress
    const allMilestones = this.getMilestones(completed.initiativeId);
    const completedCount = allMilestones.filter((m) => m.completed).length;
    const progressPct = Math.round((completedCount / allMilestones.length) * 100);
    this.updateInitiative(completed.initiativeId, { progressPct });

    return completed;
  }

  getPillar(id: string): StrategicPillar | undefined {
    return this.pillars.get(id);
  }

  listPillars(): StrategicPillar[] {
    return Array.from(this.pillars.values());
  }

  getInitiative(id: string): Initiative | undefined {
    return this.initiatives.get(id);
  }

  listInitiatives(pillarId?: string, status?: InitiativeStatus): Initiative[] {
    let list = Array.from(this.initiatives.values());
    if (pillarId !== undefined) list = list.filter((i) => i.pillarId === pillarId);
    if (status !== undefined) list = list.filter((i) => i.status === status);
    return list;
  }

  getMilestones(initiativeId: string): Milestone[] {
    return Array.from(this.milestones.values()).filter((m) => m.initiativeId === initiativeId);
  }

  summary(): StrategySummary {
    const allInitiatives = Array.from(this.initiatives.values());
    const byStatus: Partial<Record<InitiativeStatus, number>> = {};
    for (const i of allInitiatives) {
      byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
    }

    const avgProgress =
      allInitiatives.length > 0
        ? allInitiatives.reduce((s, i) => s + i.progressPct, 0) / allInitiatives.length
        : 0;

    const active = allInitiatives.filter(
      (i) => i.status !== "not_started" && i.status !== "cancelled",
    );
    const onTrackCount = allInitiatives.filter((i) => i.status === "on_track").length;
    const onTrackPct = active.length > 0 ? (onTrackCount / active.length) * 100 : 0;

    const incompleteMilestones = Array.from(this.milestones.values())
      .filter((m) => !m.completed)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);

    const upcomingMilestones = incompleteMilestones.map((m) => {
      const initiative = this.initiatives.get(m.initiativeId);
      return {
        id: m.id,
        title: m.title,
        dueDate: m.dueDate,
        initiativeTitle: initiative?.title ?? "",
      };
    });

    return {
      totalPillars: this.pillars.size,
      totalInitiatives: this.initiatives.size,
      byStatus,
      avgProgress,
      onTrackPct,
      upcomingMilestones,
    };
  }
}
