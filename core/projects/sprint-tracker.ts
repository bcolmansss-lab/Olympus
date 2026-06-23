/**
 * SprintTracker — tracks projects, work items (stories/bugs/tasks), sprints, velocity.
 *
 * Events:
 *   - "project.item_completed": { itemId, title, projectId, storyPoints, sprintId }
 *   - "sprint.completed": { sprintId, projectId, velocity, plannedPoints, completedPoints }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ItemStatus = "backlog" | "in-progress" | "review" | "done" | "cancelled";
export type ItemType = "story" | "bug" | "task" | "epic";
export type ItemPriority = "critical" | "high" | "medium" | "low";

export interface WorkItem {
  id: string;
  title: string;
  type: ItemType;
  status: ItemStatus;
  priority: ItemPriority;
  projectId: string;
  sprintId?: string;
  storyPoints: number;
  assigneeId?: string;
  createdAt: string;
  completedAt?: string;
  tags?: string[];
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "planned" | "active" | "completed";
  /** Story points planned for this sprint. */
  plannedPoints: number;
  completedPoints: number;
  /** Velocity = completedPoints / plannedPoints ratio. Computed on completion. */
  velocity?: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "completed" | "cancelled";
  ownerId?: string;
  createdAt: string;
}

export interface ProjectSummary {
  project: Project;
  totalItems: number;
  completedItems: number;
  inProgressItems: number;
  backlogItems: number;
  totalStoryPoints: number;
  completedStoryPoints: number;
  /** Average velocity across completed sprints. */
  averageVelocity: number;
  activeSprint?: Sprint;
}

export class SprintTracker {
  private readonly projects = new Map<string, Project>();
  private readonly items = new Map<string, WorkItem>();
  private readonly sprints = new Map<string, Sprint>();

  constructor(private readonly bus: EventBus) {}

  addProject(input: Omit<Project, "id" | "createdAt"> & { id?: string }): Project {
    const project: Project = {
      id: input.id ?? randomUUID(),
      name: input.name,
      description: input.description,
      status: input.status,
      ownerId: input.ownerId,
      createdAt: new Date().toISOString(),
    };
    this.projects.set(project.id, project);
    return project;
  }

  addItem(input: Omit<WorkItem, "id" | "createdAt"> & { id?: string }): WorkItem {
    const item: WorkItem = {
      id: input.id ?? randomUUID(),
      title: input.title,
      type: input.type,
      status: input.status,
      priority: input.priority,
      projectId: input.projectId,
      sprintId: input.sprintId,
      storyPoints: input.storyPoints,
      assigneeId: input.assigneeId,
      createdAt: new Date().toISOString(),
      completedAt: input.completedAt,
      tags: input.tags,
    };
    this.items.set(item.id, item);
    return item;
  }

  updateItemStatus(itemId: string, status: ItemStatus): WorkItem | undefined {
    const item = this.items.get(itemId);
    if (!item) return undefined;

    const updated: WorkItem = { ...item, status };

    if (status === "done" && item.status !== "done") {
      updated.completedAt = new Date().toISOString();

      // Update sprint completedPoints if assigned to a sprint
      if (item.sprintId) {
        const sprint = this.sprints.get(item.sprintId);
        if (sprint) {
          this.sprints.set(sprint.id, { ...sprint, completedPoints: sprint.completedPoints + item.storyPoints });
        }
      }

      this.bus.publish("project.item_completed", {
        itemId: item.id,
        title: item.title,
        projectId: item.projectId,
        storyPoints: item.storyPoints,
        sprintId: item.sprintId,
      });
    }

    this.items.set(itemId, updated);
    return updated;
  }

  addSprint(input: Omit<Sprint, "completedPoints" | "velocity"> & { completedPoints?: number }): Sprint {
    const sprint: Sprint = {
      id: input.id,
      projectId: input.projectId,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      plannedPoints: input.plannedPoints,
      completedPoints: input.completedPoints ?? 0,
    };
    this.sprints.set(sprint.id, sprint);
    return sprint;
  }

  assignItemToSprint(itemId: string, sprintId: string): WorkItem | undefined {
    const item = this.items.get(itemId);
    if (!item) return undefined;
    const updated: WorkItem = { ...item, sprintId };
    this.items.set(itemId, updated);
    return updated;
  }

  completeSprint(sprintId: string): Sprint | undefined {
    const sprint = this.sprints.get(sprintId);
    if (!sprint) return undefined;

    const velocity = sprint.plannedPoints === 0 ? 0 : sprint.completedPoints / sprint.plannedPoints;
    const completed: Sprint = { ...sprint, status: "completed", velocity };
    this.sprints.set(sprintId, completed);

    this.bus.publish("sprint.completed", {
      sprintId: sprint.id,
      projectId: sprint.projectId,
      velocity,
      plannedPoints: sprint.plannedPoints,
      completedPoints: sprint.completedPoints,
    });

    return completed;
  }

  getProject(id: string): Project | undefined {
    return this.projects.get(id);
  }

  listItems(projectId: string, status?: ItemStatus): WorkItem[] {
    const result: WorkItem[] = [];
    for (const item of this.items.values()) {
      if (item.projectId !== projectId) continue;
      if (status !== undefined && item.status !== status) continue;
      result.push(item);
    }
    return result;
  }

  listSprints(projectId: string): Sprint[] {
    const result: Sprint[] = [];
    for (const sprint of this.sprints.values()) {
      if (sprint.projectId === projectId) result.push(sprint);
    }
    return result;
  }

  activeSprint(projectId: string): Sprint | undefined {
    for (const sprint of this.sprints.values()) {
      if (sprint.projectId === projectId && sprint.status === "active") return sprint;
    }
    return undefined;
  }

  projectSummary(projectId: string): ProjectSummary | undefined {
    const project = this.projects.get(projectId);
    if (!project) return undefined;

    const items = this.listItems(projectId);
    const completedItems = items.filter((i) => i.status === "done").length;
    const inProgressItems = items.filter((i) => i.status === "in-progress").length;
    const backlogItems = items.filter((i) => i.status === "backlog").length;
    const totalStoryPoints = items.reduce((sum, i) => sum + i.storyPoints, 0);
    const completedStoryPoints = items.filter((i) => i.status === "done").reduce((sum, i) => sum + i.storyPoints, 0);

    const completedSprints = this.listSprints(projectId).filter((s) => s.status === "completed" && s.velocity !== undefined);
    const averageVelocity =
      completedSprints.length === 0
        ? 0
        : completedSprints.reduce((sum, s) => sum + (s.velocity ?? 0), 0) / completedSprints.length;

    return {
      project,
      totalItems: items.length,
      completedItems,
      inProgressItems,
      backlogItems,
      totalStoryPoints,
      completedStoryPoints,
      averageVelocity,
      activeSprint: this.activeSprint(projectId),
    };
  }

  listProjects(): Project[] {
    return Array.from(this.projects.values());
  }
}
