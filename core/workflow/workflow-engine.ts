/**
 * Workflow Engine — executes procedural memory as governed action.
 *
 * Procedural memory (MemoryStore) stores named skill sequences; this engine
 * runs them. Each step is dispatched as an MCP tool invocation, so every action
 * flows through the same ABAC gate + tamper-evident audit chain as any other
 * action in the system (BLUEPRINT §13, §23). A run is sequential and fail-fast:
 * the first denied or failing step halts the workflow with a complete record of
 * what ran and what didn't — no partial action escapes the audit trail.
 *
 * This closes the last open loop in the reference core: a learned procedure can
 * be executed autonomously, but only within the caller's granted authority.
 */

import type { OlympusMCPServer, Caller } from "../mcp/olympus-mcp-server.js";
import type { MemoryStore, ProcedureStep } from "../memory/memory-store.js";
import type { EventBus } from "../events/event-bus.js";

export interface StepResult {
  action: string;
  status: "executed" | "denied" | "failed";
  result?: unknown;
  error?: string;
}

export interface WorkflowRun {
  procedure: string;
  status: "completed" | "halted";
  steps: StepResult[];
  /** Index of the step that halted the run, if any. */
  haltedAt?: number;
}

export class WorkflowEngine {
  constructor(
    private readonly mcp: OlympusMCPServer,
    private readonly memory: MemoryStore,
    private readonly bus: EventBus,
  ) {}

  /**
   * Run a registered procedure by name. Each step's `action` is the MCP tool to
   * invoke; `params` is its input. Halts on the first denied or failing step.
   */
  async run(procedureName: string, caller: Caller): Promise<WorkflowRun> {
    const proc = this.memory.invokeProce(procedureName);
    if (!proc) {
      return { procedure: procedureName, status: "halted", steps: [], haltedAt: 0 };
    }

    this.bus.publish("workflow.started", { procedure: procedureName, actor: caller.id, steps: proc.steps.length });

    const steps: StepResult[] = [];
    for (let i = 0; i < proc.steps.length; i++) {
      const step = proc.steps[i] as ProcedureStep;
      try {
        const result = await this.mcp.invoke(step.action, step.params ?? {}, caller);
        steps.push({ action: step.action, status: "executed", result });
      } catch (err) {
        const message = (err as Error).message;
        // The MCP gate throws on policy denial; treat that distinctly from a
        // genuine handler failure for a cleaner audit story.
        const status: StepResult["status"] = /requires autonomy|unknown tool/i.test(message) ? "denied" : "failed";
        steps.push({ action: step.action, status, error: message });
        this.bus.publish("workflow.halted", { procedure: procedureName, haltedAt: i, reason: status });
        return { procedure: procedureName, status: "halted", steps, haltedAt: i };
      }
    }

    this.bus.publish("workflow.completed", { procedure: procedureName, steps: steps.length });
    return { procedure: procedureName, status: "completed", steps };
  }
}
