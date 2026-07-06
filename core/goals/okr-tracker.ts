/**
 * OKRTracker — stores Objectives + Key Results and tracks progress
 * from metric.observed events on the event spine.
 *
 * An Objective has 1–N KeyResults. Each KeyResult has:
 *   - a metricKey (matches metric.observed payload.key)
 *   - a baseline (starting value)
 *   - a target (desired value)
 *   - current (latest observed value, starts at baseline)
 *
 * Progress = (current - baseline) / (target - baseline), clamped [0, 1].
 * Status:
 *   - "on-track": progress >= 0.7 of expected progress (linear by time)
 *   - "at-risk":  progress >= 0.4 but < 0.7 of expected
 *   - "off-track": progress < 0.4 of expected
 *   - "achieved": progress >= 1.0
 *   - "not-started": no observations yet (current === baseline)
 *
 * Note: for simplicity, "expected progress" is computed as if the deadline
 * is always in the future — use (current/target ratio) directly for status
 * unless dueDate math is requested. Keep it simple: just use raw progress.
 * Status rules (simplified, no time math):
 *   - progress >= 1.0 → "achieved"
 *   - progress >= 0.7 → "on-track"
 *   - progress >= 0.4 → "at-risk"
 *   - progress > 0 → "off-track"
 *   - else → "not-started"
 */

import type { EventBus } from "../events/event-bus.js";

export type KRStatus = "not-started" | "off-track" | "at-risk" | "on-track" | "achieved";

export interface KeyResult {
  id: string;
  label: string;
  metricKey: string;
  baseline: number;
  target: number;
  current: number;
  progress: number; // [0, 1]
  status: KRStatus;
  lastUpdated?: string; // ISO
}

export interface Objective {
  id: string;
  label: string;
  owner: string;
  dueDate: string; // ISO date
  keyResults: KeyResult[];
  /** Average progress across all key results. */
  overallProgress: number;
  overallStatus: KRStatus;
}

export interface AddObjectiveInput {
  id: string;
  label: string;
  owner: string;
  dueDate: string;
  keyResults: Array<{
    id: string;
    label: string;
    metricKey: string;
    baseline: number;
    target: number;
  }>;
}

function computeProgress(baseline: number, target: number, current: number): number {
  const range = target - baseline;
  if (range === 0) return current >= target ? 1 : 0;
  return Math.max(0, Math.min(1, (current - baseline) / range));
}

function computeStatus(progress: number): KRStatus {
  if (progress >= 1.0) return "achieved";
  if (progress >= 0.7) return "on-track";
  if (progress >= 0.4) return "at-risk";
  if (progress > 0) return "off-track";
  return "not-started";
}

function worstStatus(statuses: KRStatus[]): KRStatus {
  const order: KRStatus[] = ["not-started", "off-track", "at-risk", "on-track", "achieved"];
  let worst = order.length - 1;
  for (const s of statuses) {
    const idx = order.indexOf(s);
    if (idx < worst) worst = idx;
  }
  return order[worst] ?? "not-started";
}

export class OKRTracker {
  private readonly objectives = new Map<string, Objective>();
  /** metricKey → Set of KR ids that track it */
  private readonly metricIndex = new Map<string, Set<string>>();
  /** krId → objectiveId */
  private readonly krToObjective = new Map<string, string>();
  private unsubscribe?: () => void;

  constructor(private readonly bus: EventBus) {}

  attach(): this {
    this.unsubscribe = this.bus.subscribe("metric.observed", (event) => {
      const { key, value } = event.payload as { key: string; value: number };
      this.recordMetric(key, value, event.id);
    });
    return this;
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  addObjective(input: AddObjectiveInput): Objective {
    const krs: KeyResult[] = input.keyResults.map((kr) => ({
      ...kr,
      current: kr.baseline,
      progress: 0,
      status: "not-started" as KRStatus,
    }));

    const objective: Objective = {
      id: input.id,
      label: input.label,
      owner: input.owner,
      dueDate: input.dueDate,
      keyResults: krs,
      overallProgress: 0,
      overallStatus: "not-started",
    };

    this.objectives.set(input.id, objective);
    for (const kr of krs) {
      const krIds = this.metricIndex.get(kr.metricKey) ?? new Set();
      krIds.add(kr.id);
      this.metricIndex.set(kr.metricKey, krIds);
      this.krToObjective.set(kr.id, input.id);
    }
    return objective;
  }

  recordMetric(metricKey: string, value: number, _eventId?: string): void {
    const krIds = this.metricIndex.get(metricKey);
    if (!krIds) return;

    for (const krId of krIds) {
      const objId = this.krToObjective.get(krId);
      if (!objId) continue;
      const obj = this.objectives.get(objId);
      if (!obj) continue;

      const kr = obj.keyResults.find((k) => k.id === krId);
      if (!kr) continue;

      kr.current = value;
      kr.progress = computeProgress(kr.baseline, kr.target, value);
      kr.status = computeStatus(kr.progress);
      kr.lastUpdated = new Date().toISOString();

      // Recompute objective-level aggregates
      const progresses = obj.keyResults.map((k) => k.progress);
      obj.overallProgress = progresses.reduce((a, b) => a + b, 0) / progresses.length;
      obj.overallStatus = worstStatus(obj.keyResults.map((k) => k.status));
    }
  }

  get(id: string): Objective | undefined {
    return this.objectives.get(id);
  }

  list(): Objective[] {
    return [...this.objectives.values()];
  }

  /** Return all objectives with overallStatus in ["at-risk", "off-track", "not-started"]. */
  atRisk(): Objective[] {
    return this.list().filter(
      (o) => o.overallStatus === "at-risk" || o.overallStatus === "off-track" || o.overallStatus === "not-started"
    );
  }
}
