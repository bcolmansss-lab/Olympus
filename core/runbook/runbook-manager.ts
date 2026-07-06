/**
 * RunbookManager — operational runbooks: versioned step-by-step procedures,
 * execution instances with per-step completion, and success/duration analytics.
 *
 * Events:
 *   - "runbook.published": { runbookId, name, version }
 *   - "runbook.execution_started": { executionId, runbookId, operatorId }
 *   - "runbook.execution_completed": { executionId, success, durationMinutes }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ExecutionStatus = "running" | "completed" | "aborted";

export interface RunbookStep {
  order: number;
  instruction: string;
  automated: boolean;
}

export interface Runbook {
  id: string;
  name: string;
  category: string;
  version: number;
  steps: RunbookStep[];
  published: boolean;
  createdAt: string;
}

export interface StepExecution {
  order: number;
  completed: boolean;
  completedAt?: string;
}

export interface Execution {
  id: string;
  runbookId: string;
  operatorId: string;
  status: ExecutionStatus;
  steps: StepExecution[];
  startedAt: string;
  completedAt?: string;
}

export interface RunbookSummary {
  totalRunbooks: number;
  published: number;
  totalExecutions: number;
  successfulExecutions: number;
  successRatePct: number;
}

export class RunbookManager {
  private runbooks: Map<string, Runbook> = new Map();
  private executions: Map<string, Execution> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(name: string, category: string, steps: { instruction: string; automated?: boolean }[]): Runbook {
    const runbook: Runbook = {
      id: randomUUID(),
      name,
      category,
      version: 1,
      steps: steps.map((s, i) => ({ order: i + 1, instruction: s.instruction, automated: s.automated ?? false })),
      published: false,
      createdAt: new Date().toISOString(),
    };
    this.runbooks.set(runbook.id, runbook);
    return runbook;
  }

  publish(runbookId: string): Runbook | undefined {
    const rb = this.runbooks.get(runbookId);
    if (!rb || rb.steps.length === 0) return undefined;
    rb.published = true;
    this.bus.publish("runbook.published", { runbookId, name: rb.name, version: rb.version });
    return rb;
  }

  newVersion(runbookId: string, steps: { instruction: string; automated?: boolean }[]): Runbook | undefined {
    const rb = this.runbooks.get(runbookId);
    if (!rb) return undefined;
    rb.steps = steps.map((s, i) => ({ order: i + 1, instruction: s.instruction, automated: s.automated ?? false }));
    rb.version += 1;
    rb.published = false;
    return rb;
  }

  startExecution(runbookId: string, operatorId: string, asOf: string): Execution | undefined {
    const rb = this.runbooks.get(runbookId);
    if (!rb || !rb.published) return undefined;
    const execution: Execution = {
      id: randomUUID(),
      runbookId,
      operatorId,
      status: "running",
      steps: rb.steps.map(s => ({ order: s.order, completed: false })),
      startedAt: asOf,
    };
    this.executions.set(execution.id, execution);
    this.bus.publish("runbook.execution_started", { executionId: execution.id, runbookId, operatorId });
    return execution;
  }

  completeStep(executionId: string, order: number, asOf: string): Execution | undefined {
    const ex = this.executions.get(executionId);
    if (!ex || ex.status !== "running") return undefined;
    const step = ex.steps.find(s => s.order === order);
    if (!step || step.completed) return undefined;
    step.completed = true;
    step.completedAt = asOf;
    if (ex.steps.every(s => s.completed)) this.finish(ex, true, asOf);
    return ex;
  }

  abort(executionId: string, asOf: string): Execution | undefined {
    const ex = this.executions.get(executionId);
    if (!ex || ex.status !== "running") return undefined;
    this.finish(ex, false, asOf);
    return ex;
  }

  private finish(ex: Execution, success: boolean, asOf: string): void {
    ex.status = success ? "completed" : "aborted";
    ex.completedAt = asOf;
    const durationMinutes = Math.round((new Date(asOf).getTime() - new Date(ex.startedAt).getTime()) / 60000);
    this.bus.publish("runbook.execution_completed", { executionId: ex.id, success, durationMinutes });
  }

  getRunbook(id: string): Runbook | undefined { return this.runbooks.get(id); }
  getExecution(id: string): Execution | undefined { return this.executions.get(id); }
  listRunbooks(category?: string): Runbook[] {
    const all = Array.from(this.runbooks.values());
    return category ? all.filter(r => r.category === category) : all;
  }
  listExecutions(status?: ExecutionStatus): Execution[] {
    const all = Array.from(this.executions.values());
    return status ? all.filter(e => e.status === status) : all;
  }

  summary(): RunbookSummary {
    const runbooks = Array.from(this.runbooks.values());
    const executions = Array.from(this.executions.values());
    const successful = executions.filter(e => e.status === "completed").length;
    const finished = executions.filter(e => e.status !== "running").length;
    return {
      totalRunbooks: runbooks.length,
      published: runbooks.filter(r => r.published).length,
      totalExecutions: executions.length,
      successfulExecutions: successful,
      successRatePct: finished > 0 ? Math.round((successful / finished) * 100) : 0,
    };
  }
}
