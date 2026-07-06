/**
 * DataQualityManager — dataset quality rules and check runs: per-dataset rules
 * (completeness, uniqueness, freshness, validity), check execution with pass
 * rates, failure quarantine, and dataset quality scoring.
 *
 * Events:
 *   - "dataquality.rule_added": { datasetId, ruleId, kind }
 *   - "dataquality.check_failed": { datasetId, ruleId, passRatePct }
 *   - "dataquality.dataset_quarantined": { datasetId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RuleKind = "completeness" | "uniqueness" | "freshness" | "validity" | "range";

export interface QualityRule {
  id: string;
  datasetId: string;
  kind: RuleKind;
  description: string;
  minPassRatePct: number;
}

export interface CheckRun {
  id: string;
  ruleId: string;
  passRatePct: number;
  passed: boolean;
  at: string;
}

export interface DatasetState {
  datasetId: string;
  quarantined: boolean;
}

export interface DataQualitySummary {
  totalDatasets: number;
  totalRules: number;
  totalChecks: number;
  failedChecks: number;
  quarantinedDatasets: number;
  overallPassRatePct: number;
}

export class DataQualityManager {
  private rules: Map<string, QualityRule> = new Map();
  private checks: CheckRun[] = [];
  private datasets: Map<string, DatasetState> = new Map();
  private quarantineFailures: number;

  constructor(private readonly bus: EventBus, quarantineFailures = 3) {
    this.quarantineFailures = quarantineFailures;
  }

  addRule(datasetId: string, kind: RuleKind, description: string, minPassRatePct = 95): QualityRule {
    const rule: QualityRule = { id: randomUUID(), datasetId, kind, description, minPassRatePct };
    this.rules.set(rule.id, rule);
    if (!this.datasets.has(datasetId)) this.datasets.set(datasetId, { datasetId, quarantined: false });
    this.bus.publish("dataquality.rule_added", { datasetId, ruleId: rule.id, kind });
    return rule;
  }

  runCheck(ruleId: string, passRatePct: number, at: string): CheckRun | undefined {
    const rule = this.rules.get(ruleId);
    if (!rule) return undefined;
    const passed = passRatePct >= rule.minPassRatePct;
    const check: CheckRun = { id: randomUUID(), ruleId, passRatePct, passed, at };
    this.checks.push(check);
    if (!passed) {
      this.bus.publish("dataquality.check_failed", { datasetId: rule.datasetId, ruleId, passRatePct });
      const recentFailures = this.checks.filter(c => {
        const r = this.rules.get(c.ruleId);
        return r?.datasetId === rule.datasetId && !c.passed;
      }).length;
      const ds = this.datasets.get(rule.datasetId)!;
      if (recentFailures >= this.quarantineFailures && !ds.quarantined) {
        ds.quarantined = true;
        this.bus.publish("dataquality.dataset_quarantined", { datasetId: rule.datasetId });
      }
    }
    return check;
  }

  releaseQuarantine(datasetId: string): boolean {
    const ds = this.datasets.get(datasetId);
    if (!ds || !ds.quarantined) return false;
    ds.quarantined = false;
    return true;
  }

  datasetScore(datasetId: string): number {
    const ruleIds = new Set(Array.from(this.rules.values()).filter(r => r.datasetId === datasetId).map(r => r.id));
    const checks = this.checks.filter(c => ruleIds.has(c.ruleId));
    if (checks.length === 0) return 100;
    return Math.round(checks.reduce((s, c) => s + c.passRatePct, 0) / checks.length);
  }

  isQuarantined(datasetId: string): boolean { return this.datasets.get(datasetId)?.quarantined ?? false; }
  listRules(datasetId?: string): QualityRule[] {
    const all = Array.from(this.rules.values());
    return datasetId ? all.filter(r => r.datasetId === datasetId) : all;
  }
  listChecks(ruleId?: string): CheckRun[] {
    return ruleId ? this.checks.filter(c => c.ruleId === ruleId) : [...this.checks];
  }

  summary(): DataQualitySummary {
    const failed = this.checks.filter(c => !c.passed).length;
    return {
      totalDatasets: this.datasets.size,
      totalRules: this.rules.size,
      totalChecks: this.checks.length,
      failedChecks: failed,
      quarantinedDatasets: Array.from(this.datasets.values()).filter(d => d.quarantined).length,
      overallPassRatePct: this.checks.length > 0 ? Math.round(((this.checks.length - failed) / this.checks.length) * 100) : 100,
    };
  }
}
