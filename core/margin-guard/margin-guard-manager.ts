/**
 * MarginGuardManager — deal margin-floor enforcement: per-product-category
 * minimum gross-margin thresholds, deal evaluation against cost, and
 * block/warn verdicts with override tracking.
 *
 * Events:
 *   - "marginguard.floor_set": { category, minMarginPct }
 *   - "marginguard.violation": { dealId, category, marginPct, floorPct }
 *   - "marginguard.override_granted": { dealId, approverId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type MarginVerdict = "pass" | "warn" | "block";

export interface MarginCheck {
  id: string;
  dealId: string;
  category: string;
  priceUsd: number;
  costUsd: number;
  marginPct: number;
  floorPct: number;
  verdict: MarginVerdict;
  overridden: boolean;
  overrideBy?: string;
  checkedAt: string;
}

export interface MarginGuardSummary {
  totalChecks: number;
  passed: number;
  warned: number;
  blocked: number;
  overridden: number;
  avgMarginPct: number;
}

export class MarginGuardManager {
  private floors: Map<string, number> = new Map(); // category -> min margin pct
  private warnBufferPct: number; // within this above floor => warn
  private checks: Map<string, MarginCheck> = new Map();

  constructor(private readonly bus: EventBus, warnBufferPct = 5) {
    this.warnBufferPct = warnBufferPct;
  }

  setFloor(category: string, minMarginPct: number): void {
    this.floors.set(category, minMarginPct);
    this.bus.publish("marginguard.floor_set", { category, minMarginPct });
  }

  evaluate(input: { dealId: string; category: string; priceUsd: number; costUsd: number }): MarginCheck {
    const marginPct = input.priceUsd > 0 ? Math.round(((input.priceUsd - input.costUsd) / input.priceUsd) * 100) : 0;
    const floorPct = this.floors.get(input.category) ?? 0;
    let verdict: MarginVerdict = "pass";
    if (marginPct < floorPct) verdict = "block";
    else if (marginPct < floorPct + this.warnBufferPct) verdict = "warn";
    const check: MarginCheck = { id: randomUUID(), dealId: input.dealId, category: input.category, priceUsd: input.priceUsd, costUsd: input.costUsd, marginPct, floorPct, verdict, overridden: false, checkedAt: new Date().toISOString() };
    this.checks.set(check.id, check);
    if (verdict === "block") this.bus.publish("marginguard.violation", { dealId: input.dealId, category: input.category, marginPct, floorPct });
    return check;
  }

  override(checkId: string, approverId: string): MarginCheck | undefined {
    const check = this.checks.get(checkId);
    if (!check || check.verdict !== "block") return undefined;
    check.overridden = true;
    check.overrideBy = approverId;
    this.bus.publish("marginguard.override_granted", { dealId: check.dealId, approverId });
    return check;
  }

  /** Whether a deal may proceed: pass/warn, or blocked-but-overridden. */
  canProceed(checkId: string): boolean {
    const check = this.checks.get(checkId);
    if (!check) return false;
    return check.verdict !== "block" || check.overridden;
  }

  getFloor(category: string): number | undefined { return this.floors.get(category); }
  getCheck(id: string): MarginCheck | undefined { return this.checks.get(id); }
  listChecks(verdict?: MarginVerdict): MarginCheck[] {
    const all = Array.from(this.checks.values());
    return verdict ? all.filter(c => c.verdict === verdict) : all;
  }

  summary(): MarginGuardSummary {
    const checks = Array.from(this.checks.values());
    return {
      totalChecks: checks.length,
      passed: checks.filter(c => c.verdict === "pass").length,
      warned: checks.filter(c => c.verdict === "warn").length,
      blocked: checks.filter(c => c.verdict === "block").length,
      overridden: checks.filter(c => c.overridden).length,
      avgMarginPct: checks.length > 0 ? Math.round(checks.reduce((s, c) => s + c.marginPct, 0) / checks.length) : 0,
    };
  }
}
