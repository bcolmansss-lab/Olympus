/**
 * ProjectPortfolio — portfolio-level project prioritization, resource allocation,
 * ROI tracking, strategic alignment scoring, and executive dashboards.
 *
 * Events:
 *   - "portfolio.project_approved": { projectId, name, budgetUsd, priority }
 *   - "portfolio.project_completed": { projectId, name, actualCostUsd, roiPct }
 *   - "portfolio.resource_conflict": { projectId, resourceId, conflictingProjectId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PortfolioProjectStatus = "proposed" | "approved" | "active" | "on_hold" | "completed" | "cancelled";
export type StrategicPillar = "growth" | "efficiency" | "innovation" | "compliance" | "customer_experience" | "infrastructure";

export interface PortfolioProject {
  id: string;
  name: string;
  description: string;
  status: PortfolioProjectStatus;
  strategicPillar: StrategicPillar;
  priority: number; // 1-10
  budgetUsd: number;
  actualCostUsd: number;
  expectedRoiUsd: number;
  actualRoiUsd?: number;
  startDate: string;
  targetEndDate: string;
  actualEndDate?: string;
  assignedResources: string[];
  completionPct: number;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioSummary {
  totalProjects: number;
  approved: number;
  active: number;
  completed: number;
  totalBudgetUsd: number;
  totalActualCostUsd: number;
  avgCompletionPct: number;
  avgPriority: number;
  byPillar: Partial<Record<StrategicPillar, number>>;
}

export class ProjectPortfolio {
  private projects: Map<string, PortfolioProject> = new Map();

  constructor(private readonly bus: EventBus) {}

  addProject(input: Omit<PortfolioProject, "id" | "actualCostUsd" | "completionPct" | "createdAt" | "updatedAt"> & { id?: string }): PortfolioProject {
    const now = new Date().toISOString();
    const project: PortfolioProject = { ...input, id: input.id ?? randomUUID(), actualCostUsd: 0, completionPct: 0, createdAt: now, updatedAt: now };
    this.projects.set(project.id, project);
    return project;
  }

  approveProject(projectId: string): PortfolioProject | undefined {
    const project = this.projects.get(projectId);
    if (!project) return undefined;
    project.status = "approved";
    project.updatedAt = new Date().toISOString();
    this.bus.publish("portfolio.project_approved", { projectId, name: project.name, budgetUsd: project.budgetUsd, priority: project.priority });
    return project;
  }

  updateProgress(projectId: string, completionPct: number, actualCostUsd: number): PortfolioProject | undefined {
    const project = this.projects.get(projectId);
    if (!project) return undefined;
    project.completionPct = Math.min(100, completionPct);
    project.actualCostUsd = actualCostUsd;
    project.updatedAt = new Date().toISOString();
    return project;
  }

  completeProject(projectId: string, actualRoiUsd: number): PortfolioProject | undefined {
    const project = this.projects.get(projectId);
    if (!project) return undefined;
    project.status = "completed";
    project.completionPct = 100;
    project.actualRoiUsd = actualRoiUsd;
    project.actualEndDate = new Date().toISOString();
    project.updatedAt = project.actualEndDate;
    const roiPct = project.actualCostUsd > 0 ? Math.round(((actualRoiUsd - project.actualCostUsd) / project.actualCostUsd) * 100) : 0;
    this.bus.publish("portfolio.project_completed", { projectId, name: project.name, actualCostUsd: project.actualCostUsd, roiPct });
    return project;
  }

  flagResourceConflict(projectId: string, resourceId: string, conflictingProjectId: string): void {
    this.bus.publish("portfolio.resource_conflict", { projectId, resourceId, conflictingProjectId });
  }

  getProject(id: string): PortfolioProject | undefined { return this.projects.get(id); }
  listProjects(status?: PortfolioProjectStatus, pillar?: StrategicPillar): PortfolioProject[] {
    let all = Array.from(this.projects.values());
    if (status) all = all.filter(p => p.status === status);
    if (pillar) all = all.filter(p => p.strategicPillar === pillar);
    return all;
  }

  summary(): PortfolioSummary {
    const projects = Array.from(this.projects.values());
    const byPillar: Partial<Record<StrategicPillar, number>> = {};
    for (const p of projects) { byPillar[p.strategicPillar] = (byPillar[p.strategicPillar] ?? 0) + 1; }
    const avgCompletion = projects.length > 0 ? Math.round(projects.reduce((s, p) => s + p.completionPct, 0) / projects.length) : 0;
    const avgPriority = projects.length > 0 ? Math.round((projects.reduce((s, p) => s + p.priority, 0) / projects.length) * 10) / 10 : 0;
    return {
      totalProjects: projects.length,
      approved: projects.filter(p => p.status === "approved").length,
      active: projects.filter(p => p.status === "active").length,
      completed: projects.filter(p => p.status === "completed").length,
      totalBudgetUsd: projects.reduce((s, p) => s + p.budgetUsd, 0),
      totalActualCostUsd: projects.reduce((s, p) => s + p.actualCostUsd, 0),
      avgCompletionPct: avgCompletion,
      avgPriority,
      byPillar,
    };
  }
}
