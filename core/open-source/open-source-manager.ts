/**
 * OpenSourceManager — open-source program office: project registry with
 * licenses, contributor CLA tracking, CLA-gated external contribution
 * acceptance, release tagging, and program health reporting.
 *
 * Events:
 *   - "oss.project_registered": { projectId, license }
 *   - "oss.contribution_merged": { projectId, contributionId }
 *   - "oss.release_tagged": { projectId, version }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ContributionStatus = "opened" | "merged" | "rejected";

export interface OSSProject {
  id: string;
  name: string;
  license: string;
  releases: string[];
}

export interface OSSContribution {
  id: string;
  projectId: string;
  contributorId: string;
  title: string;
  status: ContributionStatus;
  openedAt: string;
}

export interface OpenSourceSummary {
  totalProjects: number;
  claSigners: number;
  totalContributions: number;
  merged: number;
  mergeRatePct: number;
  totalReleases: number;
}

export class OpenSourceManager {
  private projects: Map<string, OSSProject> = new Map();
  private claSigned: Set<string> = new Set();
  private contributions: Map<string, OSSContribution> = new Map();

  constructor(private readonly bus: EventBus) {}

  registerProject(name: string, license: string): OSSProject {
    const project: OSSProject = { id: randomUUID(), name, license, releases: [] };
    this.projects.set(project.id, project);
    this.bus.publish("oss.project_registered", { projectId: project.id, license });
    return project;
  }

  signCla(contributorId: string): void { this.claSigned.add(contributorId); }
  hasSignedCla(contributorId: string): boolean { return this.claSigned.has(contributorId); }

  openContribution(projectId: string, contributorId: string, title: string, openedAt: string): OSSContribution | undefined {
    if (!this.projects.has(projectId)) return undefined;
    const c: OSSContribution = { id: randomUUID(), projectId, contributorId, title, status: "opened", openedAt };
    this.contributions.set(c.id, c);
    return c;
  }

  /** Merge requires a signed CLA from the contributor. */
  merge(contributionId: string): OSSContribution | undefined {
    const c = this.contributions.get(contributionId);
    if (!c || c.status !== "opened" || !this.claSigned.has(c.contributorId)) return undefined;
    c.status = "merged";
    this.bus.publish("oss.contribution_merged", { projectId: c.projectId, contributionId });
    return c;
  }

  rejectContribution(contributionId: string): OSSContribution | undefined {
    const c = this.contributions.get(contributionId);
    if (!c || c.status !== "opened") return undefined;
    c.status = "rejected";
    return c;
  }

  /** Tag a release; versions must be unique per project. */
  tagRelease(projectId: string, version: string): OSSProject | undefined {
    const project = this.projects.get(projectId);
    if (!project || project.releases.includes(version)) return undefined;
    project.releases.push(version);
    this.bus.publish("oss.release_tagged", { projectId, version });
    return project;
  }

  getProject(id: string): OSSProject | undefined { return this.projects.get(id); }
  getContribution(id: string): OSSContribution | undefined { return this.contributions.get(id); }
  listContributions(projectId?: string, status?: ContributionStatus): OSSContribution[] {
    let all = Array.from(this.contributions.values());
    if (projectId) all = all.filter(c => c.projectId === projectId);
    if (status) all = all.filter(c => c.status === status);
    return all;
  }

  summary(): OpenSourceSummary {
    const contributions = Array.from(this.contributions.values());
    const merged = contributions.filter(c => c.status === "merged").length;
    const decided = contributions.filter(c => c.status !== "opened").length;
    return {
      totalProjects: this.projects.size,
      claSigners: this.claSigned.size,
      totalContributions: contributions.length,
      merged,
      mergeRatePct: decided > 0 ? Math.round((merged / decided) * 100) : 0,
      totalReleases: Array.from(this.projects.values()).reduce((s, p) => s + p.releases.length, 0),
    };
  }
}
