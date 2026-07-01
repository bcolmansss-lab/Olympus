/**
 * ControlTestManager — SOX/ITGC control testing: testable controls with a test
 * plan, per-period test execution (pass/fail/exception), deficiency severity,
 * and effectiveness rollup.
 *
 * Events:
 *   - "controltest.control_registered": { controlId, name, frequency }
 *   - "controltest.executed": { controlId, period, result }
 *   - "controltest.deficiency": { controlId, severity }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ControlFrequency = "continuous" | "daily" | "monthly" | "quarterly" | "annual";
export type TestResult = "pass" | "fail" | "exception";
export type DeficiencySeverity = "none" | "deficiency" | "significant" | "material_weakness";

export interface TestRun {
  id: string;
  period: string;
  result: TestResult;
  sampleSize: number;
  exceptions: number;
  severity: DeficiencySeverity;
  testedAt: string;
}

export interface TestableControl {
  id: string;
  name: string;
  process: string;
  frequency: ControlFrequency;
  automated: boolean;
  runs: TestRun[];
  createdAt: string;
}

export interface ControlTestSummary {
  totalControls: number;
  totalTests: number;
  passedTests: number;
  effectivenessPct: number;
  materialWeaknesses: number;
  bySeverity: Partial<Record<DeficiencySeverity, number>>;
}

export class ControlTestManager {
  private controls: Map<string, TestableControl> = new Map();

  constructor(private readonly bus: EventBus) {}

  registerControl(input: { name: string; process: string; frequency: ControlFrequency; automated?: boolean }): TestableControl {
    const control: TestableControl = { ...input, id: randomUUID(), automated: input.automated ?? false, runs: [], createdAt: new Date().toISOString() };
    this.controls.set(control.id, control);
    this.bus.publish("controltest.control_registered", { controlId: control.id, name: control.name, frequency: control.frequency });
    return control;
  }

  private severityFor(result: TestResult, exceptions: number, sampleSize: number): DeficiencySeverity {
    if (result === "pass") return "none";
    const rate = sampleSize > 0 ? exceptions / sampleSize : 1;
    if (rate >= 0.5) return "material_weakness";
    if (rate >= 0.2) return "significant";
    return "deficiency";
  }

  execute(controlId: string, input: { period: string; sampleSize: number; exceptions: number; testedAt: string }): TestRun | undefined {
    const control = this.controls.get(controlId);
    if (!control) return undefined;
    const result: TestResult = input.exceptions === 0 ? "pass" : input.exceptions >= input.sampleSize ? "fail" : "exception";
    const severity = this.severityFor(result, input.exceptions, input.sampleSize);
    const run: TestRun = { id: randomUUID(), period: input.period, result, sampleSize: input.sampleSize, exceptions: input.exceptions, severity, testedAt: input.testedAt };
    control.runs.push(run);
    this.bus.publish("controltest.executed", { controlId, period: input.period, result });
    if (severity !== "none") this.bus.publish("controltest.deficiency", { controlId, severity });
    return run;
  }

  latestResult(controlId: string): TestRun | undefined {
    const control = this.controls.get(controlId);
    return control && control.runs.length > 0 ? control.runs[control.runs.length - 1] : undefined;
  }

  isEffective(controlId: string): boolean {
    const latest = this.latestResult(controlId);
    return latest?.result === "pass";
  }

  getControl(id: string): TestableControl | undefined { return this.controls.get(id); }
  listControls(frequency?: ControlFrequency): TestableControl[] {
    const all = Array.from(this.controls.values());
    return frequency ? all.filter(c => c.frequency === frequency) : all;
  }

  summary(): ControlTestSummary {
    const controls = Array.from(this.controls.values());
    const runs = controls.flatMap(c => c.runs);
    const passed = runs.filter(r => r.result === "pass").length;
    const bySeverity: Partial<Record<DeficiencySeverity, number>> = {};
    for (const r of runs) { bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1; }
    return {
      totalControls: controls.length,
      totalTests: runs.length,
      passedTests: passed,
      effectivenessPct: runs.length > 0 ? Math.round((passed / runs.length) * 100) : 0,
      materialWeaknesses: runs.filter(r => r.severity === "material_weakness").length,
      bySeverity,
    };
  }
}
