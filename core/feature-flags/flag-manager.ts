/**
 * FlagManager — feature flags, gradual rollouts, A/B experiments, and kill switches.
 *
 * Evaluation: user → check targeting rules → check rollout % → default
 *
 * Events:
 *   - "flags.flag_updated": { flagKey, enabled, rolloutPct }
 *   - "flags.experiment_concluded": { experimentId, winner, conversionLift }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type FlagStatus = "active" | "inactive" | "archived";
export type RolloutStrategy = "all" | "percentage" | "allowlist" | "segment";

export interface TargetingRule {
  attribute: string; // e.g. "plan", "region", "company"
  operator: "equals" | "not_equals" | "in" | "not_in";
  values: string[];
}

export interface FeatureFlag {
  id: string;
  key: string; // e.g. "new-dashboard-v2"
  name: string;
  description: string;
  status: FlagStatus;
  rolloutStrategy: RolloutStrategy;
  rolloutPct: number; // 0-100
  allowlist?: string[]; // user/account IDs always getting flag=true
  targetingRules?: TargetingRule[];
  defaultValue: boolean;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export interface Experiment {
  id: string;
  flagKey: string;
  name: string;
  hypothesis: string;
  startDate: string;
  endDate?: string;
  status: "running" | "concluded" | "paused";
  controlConversionRate?: number;
  treatmentConversionRate?: number;
  winner?: "control" | "treatment" | "inconclusive";
}

export interface FlagSummary {
  totalFlags: number;
  activeFlags: number;
  experimentsRunning: number;
  killSwitches: number; // flags with rolloutPct=0 and status=active (used as kill switches)
}

export class FlagManager {
  private readonly flags = new Map<string, FeatureFlag>();
  private readonly experiments = new Map<string, Experiment>();

  constructor(private readonly bus: EventBus) {}

  createFlag(input: Omit<FeatureFlag, "id" | "createdAt" | "updatedAt"> & { id?: string }): FeatureFlag {
    const now = new Date().toISOString();
    const flag: FeatureFlag = {
      ...input,
      id: input.id ?? randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.flags.set(flag.key, flag);
    return flag;
  }

  updateFlag(
    key: string,
    updates: Partial<Pick<FeatureFlag, "status" | "rolloutPct" | "allowlist" | "targetingRules" | "rolloutStrategy">>,
  ): FeatureFlag | undefined {
    const flag = this.flags.get(key);
    if (!flag) return undefined;
    Object.assign(flag, updates);
    flag.updatedAt = new Date().toISOString();
    this.bus.publish("flags.flag_updated", {
      flagKey: flag.key,
      enabled: flag.status === "active",
      rolloutPct: flag.rolloutPct,
    });
    return flag;
  }

  evaluate(flagKey: string, userId: string, attributes?: Record<string, string>): boolean {
    const flag = this.flags.get(flagKey);
    if (!flag || flag.status !== "active") return flag?.defaultValue ?? false;

    // Check allowlist
    if (flag.allowlist && flag.allowlist.includes(userId)) return true;

    // Check targeting rules — ALL rules must match
    if (flag.targetingRules && flag.targetingRules.length > 0) {
      const attrs = attributes ?? {};
      const allMatch = flag.targetingRules.every((rule) => {
        const attrValue = attrs[rule.attribute] ?? "";
        switch (rule.operator) {
          case "equals":
            return rule.values.includes(attrValue);
          case "not_equals":
            return !rule.values.includes(attrValue);
          case "in":
            return rule.values.includes(attrValue);
          case "not_in":
            return !rule.values.includes(attrValue);
          default:
            return false;
        }
      });
      if (!allMatch) return flag.defaultValue;
    }

    switch (flag.rolloutStrategy) {
      case "all":
        return true;
      case "percentage": {
        const hash = this.deterministicHash(userId + flagKey);
        return hash < flag.rolloutPct;
      }
      case "allowlist":
        // Already checked above; if not in allowlist return defaultValue
        return flag.defaultValue;
      case "segment":
        // Targeting rules determine result; if rules matched we would have returned above
        // If no rules or rules didn't match, fall through to defaultValue
        return flag.defaultValue;
      default:
        return flag.defaultValue;
    }
  }

  private deterministicHash(input: string): number {
    let sum = 0;
    for (let i = 0; i < input.length; i++) {
      sum += input.charCodeAt(i);
    }
    return sum % 100;
  }

  createExperiment(input: Omit<Experiment, "id"> & { id?: string }): Experiment {
    const experiment: Experiment = {
      ...input,
      id: input.id ?? randomUUID(),
    };
    this.experiments.set(experiment.id, experiment);
    return experiment;
  }

  concludeExperiment(id: string, controlRate: number, treatmentRate: number): Experiment | undefined {
    const experiment = this.experiments.get(id);
    if (!experiment) return undefined;

    const lift = controlRate > 0 ? ((treatmentRate - controlRate) / controlRate) * 100 : 0;
    let winner: "control" | "treatment" | "inconclusive";
    if (treatmentRate > controlRate * 1.05) {
      winner = "treatment";
    } else if (controlRate > treatmentRate * 1.05) {
      winner = "control";
    } else {
      winner = "inconclusive";
    }

    experiment.status = "concluded";
    experiment.controlConversionRate = controlRate;
    experiment.treatmentConversionRate = treatmentRate;
    experiment.winner = winner;
    experiment.endDate = new Date().toISOString();

    this.bus.publish("flags.experiment_concluded", {
      experimentId: experiment.id,
      winner,
      conversionLift: lift,
    });

    return experiment;
  }

  getFlag(key: string): FeatureFlag | undefined {
    return this.flags.get(key);
  }

  listFlags(status?: FlagStatus): FeatureFlag[] {
    const all = Array.from(this.flags.values());
    return status ? all.filter((f) => f.status === status) : all;
  }

  listExperiments(): Experiment[] {
    return Array.from(this.experiments.values());
  }

  summary(): FlagSummary {
    const all = Array.from(this.flags.values());
    return {
      totalFlags: all.length,
      activeFlags: all.filter((f) => f.status === "active").length,
      experimentsRunning: Array.from(this.experiments.values()).filter((e) => e.status === "running").length,
      killSwitches: all.filter((f) => f.rolloutPct === 0 && f.status === "active").length,
    };
  }
}
