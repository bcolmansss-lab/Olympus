/**
 * ChaosEngineeringManager — chaos experiments: fault-injection experiment
 * design with a steady-state hypothesis, blast-radius guardrails, execution
 * with observed-impact recording, hypothesis verdicts, and abort handling.
 *
 * Events:
 *   - "chaos.experiment_started": { experimentId, faultKind }
 *   - "chaos.experiment_concluded": { experimentId, hypothesisHeld }
 *   - "chaos.aborted": { experimentId, reason }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ChaosFaultKind = "latency_injection" | "instance_kill" | "network_partition" | "cpu_stress" | "dependency_outage";
export type ChaosExperimentStatus = "designed" | "running" | "concluded" | "aborted";

export interface ChaosExperiment {
  id: string;
  name: string;
  faultKind: ChaosFaultKind;
  hypothesis: string;
  maxBlastRadiusPct: number;
  status: ChaosExperimentStatus;
  observedImpactPct?: number;
  hypothesisHeld?: boolean;
  abortReason?: string;
}

export interface ChaosSummary {
  totalExperiments: number;
  concluded: number;
  aborted: number;
  hypothesisHoldRatePct: number;
}

export class ChaosEngineeringManager {
  private experiments: Map<string, ChaosExperiment> = new Map();

  constructor(private readonly bus: EventBus) {}

  design(name: string, faultKind: ChaosFaultKind, hypothesis: string, maxBlastRadiusPct = 5): ChaosExperiment {
    const experiment: ChaosExperiment = { id: randomUUID(), name, faultKind, hypothesis, maxBlastRadiusPct, status: "designed" };
    this.experiments.set(experiment.id, experiment);
    return experiment;
  }

  start(experimentId: string): ChaosExperiment | undefined {
    const e = this.experiments.get(experimentId);
    if (!e || e.status !== "designed") return undefined;
    e.status = "running";
    this.bus.publish("chaos.experiment_started", { experimentId, faultKind: e.faultKind });
    return e;
  }

  /**
   * Record observed impact. Exceeding the blast-radius guardrail auto-aborts;
   * otherwise the experiment concludes with a hypothesis verdict.
   */
  observe(experimentId: string, observedImpactPct: number, hypothesisHeld: boolean): ChaosExperiment | undefined {
    const e = this.experiments.get(experimentId);
    if (!e || e.status !== "running") return undefined;
    e.observedImpactPct = observedImpactPct;
    if (observedImpactPct > e.maxBlastRadiusPct) {
      e.status = "aborted";
      e.abortReason = "blast_radius_exceeded";
      this.bus.publish("chaos.aborted", { experimentId, reason: e.abortReason });
      return e;
    }
    e.status = "concluded";
    e.hypothesisHeld = hypothesisHeld;
    this.bus.publish("chaos.experiment_concluded", { experimentId, hypothesisHeld });
    return e;
  }

  abort(experimentId: string, reason: string): ChaosExperiment | undefined {
    const e = this.experiments.get(experimentId);
    if (!e || e.status !== "running") return undefined;
    e.status = "aborted";
    e.abortReason = reason;
    this.bus.publish("chaos.aborted", { experimentId, reason });
    return e;
  }

  getExperiment(id: string): ChaosExperiment | undefined { return this.experiments.get(id); }
  listExperiments(status?: ChaosExperimentStatus): ChaosExperiment[] {
    const all = Array.from(this.experiments.values());
    return status ? all.filter(e => e.status === status) : all;
  }

  summary(): ChaosSummary {
    const experiments = Array.from(this.experiments.values());
    const concluded = experiments.filter(e => e.status === "concluded");
    const held = concluded.filter(e => e.hypothesisHeld).length;
    return {
      totalExperiments: experiments.length,
      concluded: concluded.length,
      aborted: experiments.filter(e => e.status === "aborted").length,
      hypothesisHoldRatePct: concluded.length > 0 ? Math.round((held / concluded.length) * 100) : 0,
    };
  }
}
