/**
 * CaseStudyManager — customer reference/case-study library: reference accounts,
 * approval & publishing workflow, usage tracking (for sales/marketing), and
 * reference-fatigue protection.
 *
 * Events:
 *   - "casestudy.created": { caseStudyId, customer, industry }
 *   - "casestudy.published": { caseStudyId, customer }
 *   - "casestudy.referenced": { caseStudyId, usageCount }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CaseStudyStatus = "draft" | "pending_approval" | "published" | "archived";
export type ReferenceType = "written" | "video" | "logo" | "speaking" | "peer_call";

export interface CaseStudy {
  id: string;
  customer: string;
  industry: string;
  title: string;
  referenceTypes: ReferenceType[];
  status: CaseStudyStatus;
  metrics: Record<string, string>; // e.g. "roi": "300%"
  usageCount: number;
  maxUsesPerQuarter: number;
  createdAt: string;
  publishedAt?: string;
}

export interface CaseStudySummary {
  totalCaseStudies: number;
  published: number;
  totalReferences: number;
  byIndustry: Record<string, number>;
  availableForReference: number;
}

export class CaseStudyManager {
  private studies: Map<string, CaseStudy> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(input: { customer: string; industry: string; title: string; referenceTypes: ReferenceType[]; metrics?: Record<string, string>; maxUsesPerQuarter?: number }): CaseStudy {
    const study: CaseStudy = {
      id: randomUUID(),
      customer: input.customer,
      industry: input.industry,
      title: input.title,
      referenceTypes: input.referenceTypes,
      status: "draft",
      metrics: input.metrics ?? {},
      usageCount: 0,
      maxUsesPerQuarter: input.maxUsesPerQuarter ?? 4,
      createdAt: new Date().toISOString(),
    };
    this.studies.set(study.id, study);
    this.bus.publish("casestudy.created", { caseStudyId: study.id, customer: study.customer, industry: study.industry });
    return study;
  }

  submitForApproval(id: string): CaseStudy | undefined {
    const study = this.studies.get(id);
    if (!study || study.status !== "draft") return undefined;
    study.status = "pending_approval";
    return study;
  }

  publish(id: string, asOf: string): CaseStudy | undefined {
    const study = this.studies.get(id);
    if (!study || study.status !== "pending_approval") return undefined;
    study.status = "published";
    study.publishedAt = asOf;
    this.bus.publish("casestudy.published", { caseStudyId: id, customer: study.customer });
    return study;
  }

  archive(id: string): CaseStudy | undefined {
    const study = this.studies.get(id);
    if (!study) return undefined;
    study.status = "archived";
    return study;
  }

  /** Record a sales/marketing use; respects reference-fatigue cap. */
  recordReference(id: string): CaseStudy | undefined {
    const study = this.studies.get(id);
    if (!study || study.status !== "published") return undefined;
    if (study.usageCount >= study.maxUsesPerQuarter) return undefined;
    study.usageCount += 1;
    this.bus.publish("casestudy.referenced", { caseStudyId: id, usageCount: study.usageCount });
    return study;
  }

  resetQuarter(): void {
    for (const study of this.studies.values()) study.usageCount = 0;
  }

  isAvailable(id: string): boolean {
    const study = this.studies.get(id);
    return !!study && study.status === "published" && study.usageCount < study.maxUsesPerQuarter;
  }

  getCaseStudy(id: string): CaseStudy | undefined { return this.studies.get(id); }
  listCaseStudies(status?: CaseStudyStatus, industry?: string): CaseStudy[] {
    let all = Array.from(this.studies.values());
    if (status) all = all.filter(s => s.status === status);
    if (industry) all = all.filter(s => s.industry === industry);
    return all;
  }

  summary(): CaseStudySummary {
    const studies = Array.from(this.studies.values());
    const byIndustry: Record<string, number> = {};
    for (const s of studies) { byIndustry[s.industry] = (byIndustry[s.industry] ?? 0) + 1; }
    return {
      totalCaseStudies: studies.length,
      published: studies.filter(s => s.status === "published").length,
      totalReferences: studies.reduce((s, c) => s + c.usageCount, 0),
      byIndustry,
      availableForReference: studies.filter(s => s.status === "published" && s.usageCount < s.maxUsesPerQuarter).length,
    };
  }
}
