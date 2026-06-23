/**
 * BoardReportGenerator — synthesizes the live state of every module into a single
 * executive board report in Markdown. This is the artifact a CEO hands the board:
 * health headline, financial position, growth pipeline, top risks, reliability,
 * goals progress, and prediction-calibration quality.
 */

import type { Olympus } from "../index.js";

export interface BoardReportOptions {
  companyName?: string;
  /** Number of top risks to include. Default 5. */
  topRiskCount?: number;
}

export class BoardReportGenerator {
  constructor(private readonly olympus: Olympus) {}

  /** Render the full board report as Markdown. */
  render(opts?: BoardReportOptions): string {
    const companyName = opts?.companyName ?? "Olympus";
    const topRiskCount = opts?.topRiskCount ?? 5;
    const lines: string[] = [];

    lines.push(`# Board Report — ${companyName}`);
    lines.push(`_Generated ${new Date().toISOString()}_`);
    lines.push("");

    lines.push(...this.executiveSummary());
    lines.push(...this.financialPosition());
    lines.push(...this.growthPipeline());
    lines.push(...this.topRisks(topRiskCount));
    lines.push(...this.reliability());
    lines.push(...this.goals());
    lines.push(...this.healthDimensions());

    return lines.join("\n");
  }

  // -- sections -------------------------------------------------------------

  private executiveSummary(): string[] {
    const out: string[] = ["## Executive Summary", ""];
    const health = this.olympus.health.score();
    out.push(`- **Health:** ${health.composite}/100 (${health.grade}) — ${health.headline}`);
    const briefing = this.olympus.briefing.generate();
    out.push(`- **Briefing:** ${briefing.headline} (${briefing.pendingCount} decision${briefing.pendingCount === 1 ? "" : "s"} pending)`);
    out.push("");
    return out;
  }

  private financialPosition(): string[] {
    const out: string[] = ["## Financial Position", ""];
    const burn = this.olympus.ledger.burnRate();
    if (this.olympus.ledger.listAccounts().length === 0) {
      out.push("No data.", "");
      return out;
    }
    const runway = burn.runwayMonths === Infinity ? "∞ (cash-flow positive)" : `${burn.runwayMonths.toFixed(1)} months`;
    out.push(`- **Cash balance:** ${this.money(burn.cashBalance)}`);
    out.push(`- **Monthly burn:** ${this.money(burn.monthlyBurn)}`);
    out.push(`- **Runway:** ${runway}`);
    out.push(`- **Net income:** ${this.money(this.olympus.ledger.netIncome())}`);
    out.push("");
    return out;
  }

  private growthPipeline(): string[] {
    const out: string[] = ["## Growth & Pipeline", ""];
    if (this.olympus.pipeline.list().length === 0) {
      out.push("No data.", "");
      return out;
    }
    const s = this.olympus.pipeline.summary();
    out.push(`- **Weighted ARR (open):** ${this.money(s.weightedArrUsd)}`);
    out.push(`- **Closed-won ARR:** ${this.money(s.closedWonArrUsd)}`);
    out.push(`- **Open deals:** ${s.openDeals}`);
    out.push("");
    return out;
  }

  private topRisks(n: number): string[] {
    const out: string[] = ["## Top Risks", ""];
    const risks = this.olympus.riskRegister.topRisks(n);
    if (risks.length === 0) {
      out.push("No data.", "");
      return out;
    }
    out.push("| Title | Category | Residual Score | Status |");
    out.push("| --- | --- | --- | --- |");
    for (const r of risks) {
      out.push(`| ${r.title} | ${r.category} | ${r.residualScore.toFixed(2)} | ${r.status} |`);
    }
    out.push("");
    return out;
  }

  private reliability(): string[] {
    const out: string[] = ["## Reliability (SLAs)", ""];
    const slas = this.olympus.sla.list();
    if (slas.length === 0) {
      out.push("No data.", "");
      return out;
    }
    const healthy = slas.filter((s) => s.status === "healthy").length;
    out.push(`- **Healthy:** ${healthy}/${slas.length}`);
    out.push(`- **At risk:** ${this.olympus.sla.atRisk().length}`);
    out.push(`- **Total penalties:** ${this.money(this.olympus.sla.totalPenalties())}`);
    out.push("");
    return out;
  }

  private goals(): string[] {
    const out: string[] = ["## Goals (OKRs)", ""];
    const objectives = this.olympus.okr.list();
    if (objectives.length === 0) {
      out.push("No data.", "");
      return out;
    }
    for (const o of objectives) {
      out.push(`- **${o.label}:** ${(o.overallProgress * 100).toFixed(0)}% (${o.overallStatus})`);
    }
    out.push("");
    return out;
  }

  private healthDimensions(): string[] {
    const out: string[] = ["## Health Dimensions", ""];
    const dims = this.olympus.health.score().dimensions;
    if (dims.length === 0) {
      out.push("No data.", "");
      return out;
    }
    out.push("| Dimension | Score | Detail |");
    out.push("| --- | --- | --- |");
    for (const d of dims) {
      out.push(`| ${d.name} | ${d.score.toFixed(0)} | ${d.detail} |`);
    }
    out.push("");
    return out;
  }

  // -- helpers --------------------------------------------------------------

  /** Format a USD amount readably ($1.2M, $850.0K, $420). */
  private money(amount: number): string {
    const sign = amount < 0 ? "-" : "";
    const abs = Math.abs(amount);
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
  }
}
