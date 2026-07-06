/**
 * DealPipeline — tracks deals through sales stages with ARR projection.
 *
 * Stages (in order): lead → qualified → proposal → negotiation → closed_won | closed_lost
 * Each stage has a default win probability used for weighted ARR projection.
 *
 * Events:
 *   - "crm.deal_created": { dealId, name, arrUsd, stage }
 *   - "crm.deal_advanced": { dealId, name, fromStage, toStage, arrUsd }
 *   - "crm.deal_closed": { dealId, name, outcome: "won"|"lost", arrUsd }
 */

import type { EventBus } from "../events/event-bus.js";

export type DealStage =
  | "lead"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost";

export interface Deal {
  id: string;
  name: string;
  /** Annual Recurring Revenue in USD. */
  arrUsd: number;
  stage: DealStage;
  owner: string;
  createdAt: string;
  updatedAt: string;
  /** Optional close date target. */
  targetCloseDate?: string;
  tags?: string[];
}

export interface PipelineSummary {
  /** Total deals by stage. */
  byStage: Record<DealStage, number>;
  /** Total ARR value by stage. */
  arrByStage: Record<DealStage, number>;
  /** Weighted ARR = sum of (arrUsd × stageProbability) for all open deals. */
  weightedArrUsd: number;
  /** ARR already closed won this period. */
  closedWonArrUsd: number;
  /** Total open deal count (excluding closed). */
  openDeals: number;
}

const STAGE_WIN_PROBABILITY: Record<DealStage, number> = {
  lead: 0.05,
  qualified: 0.20,
  proposal: 0.45,
  negotiation: 0.75,
  closed_won: 1.0,
  closed_lost: 0.0,
};

const STAGE_ORDER: DealStage[] = [
  "lead", "qualified", "proposal", "negotiation", "closed_won",
];

export class DealPipeline {
  private readonly deals = new Map<string, Deal>();
  private dealSeq = 0;

  constructor(private readonly bus: EventBus) {}

  createDeal(input: Omit<Deal, "id" | "createdAt" | "updatedAt"> & { id?: string }): Deal {
    const deal: Deal = {
      ...input,
      id: input.id ?? `deal-${++this.dealSeq}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.deals.set(deal.id, deal);
    this.bus.publish("crm.deal_created", {
      dealId: deal.id,
      name: deal.name,
      arrUsd: deal.arrUsd,
      stage: deal.stage,
    });
    return deal;
  }

  /**
   * Advance a deal to the next stage (or directly to closed_won/closed_lost).
   * Returns the updated deal, or undefined if not found.
   */
  advance(dealId: string, toStage: DealStage): Deal | undefined {
    const deal = this.deals.get(dealId);
    if (!deal) return undefined;

    const fromStage = deal.stage;
    deal.stage = toStage;
    deal.updatedAt = new Date().toISOString();

    if (toStage === "closed_won" || toStage === "closed_lost") {
      this.bus.publish("crm.deal_closed", {
        dealId: deal.id,
        name: deal.name,
        outcome: toStage === "closed_won" ? "won" : "lost",
        arrUsd: deal.arrUsd,
      });
    } else {
      this.bus.publish("crm.deal_advanced", {
        dealId: deal.id,
        name: deal.name,
        fromStage,
        toStage,
        arrUsd: deal.arrUsd,
      });
    }

    return deal;
  }

  get(dealId: string): Deal | undefined {
    return this.deals.get(dealId);
  }

  list(stage?: DealStage): Deal[] {
    const all = [...this.deals.values()];
    return stage ? all.filter((d) => d.stage === stage) : all;
  }

  summary(): PipelineSummary {
    const byStage = {} as Record<DealStage, number>;
    const arrByStage = {} as Record<DealStage, number>;
    const allStages: DealStage[] = ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"];
    for (const s of allStages) {
      byStage[s] = 0;
      arrByStage[s] = 0;
    }

    let weightedArr = 0;
    let closedWonArr = 0;
    let openDeals = 0;

    for (const deal of this.deals.values()) {
      byStage[deal.stage]++;
      arrByStage[deal.stage] += deal.arrUsd;
      if (deal.stage !== "closed_won" && deal.stage !== "closed_lost") {
        weightedArr += deal.arrUsd * STAGE_WIN_PROBABILITY[deal.stage];
        openDeals++;
      }
      if (deal.stage === "closed_won") closedWonArr += deal.arrUsd;
    }

    return {
      byStage,
      arrByStage,
      weightedArrUsd: weightedArr,
      closedWonArrUsd: closedWonArr,
      openDeals,
    };
  }

  /** Conversion rate from stageA to stageB (or closed_won) for historical deals. */
  conversionRate(fromStage: DealStage, toStage: DealStage = "closed_won"): number {
    const fromDeals = [...this.deals.values()].filter((d) => {
      // A deal "passed through" fromStage if its current stage is at or beyond fromStage
      const fromIdx = STAGE_ORDER.indexOf(fromStage);
      const currentIdx = STAGE_ORDER.indexOf(d.stage);
      return fromIdx !== -1 && currentIdx >= fromIdx;
    });
    if (fromDeals.length === 0) return 0;
    const reached = fromDeals.filter((d) => d.stage === toStage ||
      (toStage !== "closed_won" && STAGE_ORDER.indexOf(d.stage) >= STAGE_ORDER.indexOf(toStage))
    ).length;
    return reached / fromDeals.length;
  }
}
