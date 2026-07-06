/**
 * Briefing Engine — proactive intelligence (BLUEPRINT §16, §22.3).
 *
 * Olympus doesn't wait to be asked. The Briefing Engine synthesizes the live
 * state of the business into a single executive briefing: what needs a human
 * decision, what the system did autonomously, where its predictions are drifting
 * (the calibration flywheel), which risks are open, and what its current
 * autonomy posture is. It reads only from existing layers — inbox projection,
 * memory, OKG, autonomy — so it holds no authoritative state of its own.
 *
 * This is what lands in an operator's inbox each morning, and what the dashboard
 * renders at a glance.
 */

import type { Olympus } from "../index.js";
import type { InboxItem } from "../projections/decision-inbox.js";

export interface BriefingSection {
  heading: string;
  severity: "info" | "attention" | "urgent";
  lines: string[];
}

export interface Briefing {
  generatedAt: string;
  headline: string;
  /** Count of decisions awaiting a human. */
  pendingCount: number;
  sections: BriefingSection[];
}

export class BriefingEngine {
  constructor(private readonly olympus: Olympus) {}

  generate(): Briefing {
    const sections: BriefingSection[] = [];
    const pending = this.olympus.inbox.pending();

    sections.push(this.needsAttention(pending));
    sections.push(this.autonomousActivity());
    sections.push(this.calibration());
    sections.push(this.openRisks());
    sections.push(this.autonomyPosture());

    const briefing: Briefing = {
      generatedAt: new Date().toISOString(),
      headline: this.headline(pending),
      pendingCount: pending.length,
      sections: sections.filter((s) => s.lines.length > 0),
    };
    this.olympus.bus.publish("briefing.generated", {
      pendingCount: briefing.pendingCount,
      sections: briefing.sections.length,
    });
    return briefing;
  }

  // -- sections -------------------------------------------------------------

  private needsAttention(pending: InboxItem[]): BriefingSection {
    return {
      heading: "Needs your decision",
      severity: pending.some((p) => p.status === "escalated") ? "urgent" : pending.length ? "attention" : "info",
      lines: pending.map(
        (p) => `${p.status === "escalated" ? "⚠ " : "• "}${p.question} — ${p.note}`,
      ),
    };
  }

  private autonomousActivity(): BriefingSection {
    const auto = this.olympus.inbox.all().filter((i) => i.status === "auto_executed");
    return {
      heading: "Acted autonomously (for awareness)",
      severity: "info",
      lines: auto.map((a) => `• ${a.question} → ${a.recommendation} (consensus ${a.consensusScore ?? "n/a"})`),
    };
  }

  private calibration(): BriefingSection {
    const mae = this.olympus.memory.maeByDomain();
    const entries = Object.entries(mae);
    const lines = entries.map(([domain, err]) => {
      const flag = err > 0.5 ? " ⚠ drifting — consider auto-demotion" : "";
      return `• ${domain}: mean abs error ${err.toFixed(2)}${flag}`;
    });
    return {
      heading: "Prediction accuracy (calibration flywheel)",
      severity: entries.some(([, e]) => e > 0.5) ? "attention" : "info",
      lines,
    };
  }

  private openRisks(): BriefingSection {
    const risks = this.olympus.okg.nodesByType("Risk");
    return {
      heading: "Open risks in the graph",
      severity: risks.length ? "attention" : "info",
      lines: risks.map((r) => {
        const p = r.props as Record<string, unknown>;
        return `• ${String(p.name ?? "risk")}${p.deltaPts ? ` (${p.deltaPts}pt)` : ""}`;
      }),
    };
  }

  private autonomyPosture(): BriefingSection {
    if (this.olympus.autonomy.isKilled()) {
      return { heading: "Autonomy posture", severity: "urgent", lines: ["⚠ KILL SWITCH ENGAGED — all capabilities at L0 (advisory only)."] };
    }
    const grants = this.olympus.autonomy.listGrants();
    return {
      heading: "Autonomy posture",
      severity: "info",
      lines: grants.map((g) => {
        const cap =
          g.blastRadius?.maxAmount !== undefined
            ? ` (≤$${g.blastRadius.maxAmount.toLocaleString("en-US")}/action)`
            : "";
        return `• ${g.domain}/${g.capability}: L${g.level}${cap}`;
      }),
    };
  }

  // -- headline -------------------------------------------------------------

  private headline(pending: InboxItem[]): string {
    if (this.olympus.autonomy.isKilled()) return "Kill switch is engaged — Olympus is advisory-only until re-armed.";
    const urgent = pending.filter((p) => p.status === "escalated").length;
    if (urgent) return `${urgent} decision${urgent > 1 ? "s" : ""} escalated to you; ${pending.length} total awaiting approval.`;
    if (pending.length) return `${pending.length} decision${pending.length > 1 ? "s" : ""} queued for your approval.`;
    return "All clear — no decisions awaiting you. Olympus is operating within charter.";
  }
}
