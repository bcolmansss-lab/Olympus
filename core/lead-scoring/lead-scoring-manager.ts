/**
 * LeadScoringManager — rule-based lead scoring: demographic + behavioral
 * scoring rules, per-lead score accumulation, grade tiers, and MQL threshold
 * detection.
 *
 * Events:
 *   - "leadscoring.rule_added": { ruleId, attribute, points }
 *   - "leadscoring.scored": { leadId, score, grade }
 *   - "leadscoring.mql_reached": { leadId, score }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type LeadGrade = "A" | "B" | "C" | "D";
export type RuleKind = "demographic" | "behavioral";

export interface ScoringRule {
  id: string;
  kind: RuleKind;
  attribute: string; // e.g. "title=VP", "visited_pricing"
  points: number;
}

export interface Lead {
  id: string;
  email: string;
  score: number;
  grade: LeadGrade;
  isMQL: boolean;
  signals: string[];
  createdAt: string;
}

export interface LeadScoringSummary {
  totalLeads: number;
  mqls: number;
  totalRules: number;
  byGrade: Partial<Record<LeadGrade, number>>;
  avgScore: number;
}

export class LeadScoringManager {
  private rules: Map<string, ScoringRule> = new Map();
  private leads: Map<string, Lead> = new Map();
  private mqlThreshold: number;

  constructor(private readonly bus: EventBus, mqlThreshold = 100) {
    this.mqlThreshold = mqlThreshold;
  }

  addRule(kind: RuleKind, attribute: string, points: number): ScoringRule {
    const rule: ScoringRule = { id: randomUUID(), kind, attribute, points };
    this.rules.set(attribute, rule);
    this.bus.publish("leadscoring.rule_added", { ruleId: rule.id, attribute, points });
    return rule;
  }

  private gradeFor(score: number): LeadGrade {
    if (score >= 100) return "A";
    if (score >= 60) return "B";
    if (score >= 30) return "C";
    return "D";
  }

  createLead(email: string): Lead {
    const lead: Lead = { id: randomUUID(), email, score: 0, grade: "D", isMQL: false, signals: [], createdAt: new Date().toISOString() };
    this.leads.set(lead.id, lead);
    return lead;
  }

  /** Record a signal (matching a rule attribute) and rescore the lead. */
  recordSignal(leadId: string, attribute: string): Lead | undefined {
    const lead = this.leads.get(leadId);
    const rule = this.rules.get(attribute);
    if (!lead || !rule) return undefined;
    if (lead.signals.includes(attribute)) return lead;
    lead.signals.push(attribute);
    lead.score += rule.points;
    lead.grade = this.gradeFor(lead.score);
    this.bus.publish("leadscoring.scored", { leadId, score: lead.score, grade: lead.grade });
    if (!lead.isMQL && lead.score >= this.mqlThreshold) {
      lead.isMQL = true;
      this.bus.publish("leadscoring.mql_reached", { leadId, score: lead.score });
    }
    return lead;
  }

  /** Decay a lead's score (e.g. for inactivity). */
  decay(leadId: string, points: number): Lead | undefined {
    const lead = this.leads.get(leadId);
    if (!lead) return undefined;
    lead.score = Math.max(0, lead.score - points);
    lead.grade = this.gradeFor(lead.score);
    return lead;
  }

  getLead(id: string): Lead | undefined { return this.leads.get(id); }
  listRules(kind?: RuleKind): ScoringRule[] {
    const all = Array.from(this.rules.values());
    return kind ? all.filter(r => r.kind === kind) : all;
  }
  listLeads(grade?: LeadGrade, mqlOnly = false): Lead[] {
    let all = Array.from(this.leads.values());
    if (grade) all = all.filter(l => l.grade === grade);
    if (mqlOnly) all = all.filter(l => l.isMQL);
    return all;
  }

  summary(): LeadScoringSummary {
    const leads = Array.from(this.leads.values());
    const byGrade: Partial<Record<LeadGrade, number>> = {};
    for (const l of leads) { byGrade[l.grade] = (byGrade[l.grade] ?? 0) + 1; }
    return {
      totalLeads: leads.length,
      mqls: leads.filter(l => l.isMQL).length,
      totalRules: this.rules.size,
      byGrade,
      avgScore: leads.length > 0 ? Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length) : 0,
    };
  }
}
