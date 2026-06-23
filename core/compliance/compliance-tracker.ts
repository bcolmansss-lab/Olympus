import type { EventBus } from "../events/event-bus.js";

export type ControlStatus = "compliant" | "at-risk" | "non-compliant" | "not-started";
export type EvidenceType = "screenshot" | "log_export" | "policy_doc" | "test_result" | "attestation" | "report";
export type Framework = "SOC2" | "ISO27001" | "GDPR" | "HIPAA" | "PCI-DSS" | "internal";

export interface Control {
  id: string;
  title: string;
  description: string;
  framework: Framework;
  category: string;
  reviewCycleDays: number;
  status: ControlStatus;
  owner: string;
  evidence: Evidence[];
  lastEvidenceDate?: string;
}

export interface Evidence {
  id: string;
  controlId: string;
  type: EvidenceType;
  description: string;
  collectedAt: string;
  collectedBy: string;
  ref?: string;
}

export interface AddControlInput {
  id?: string;
  title: string;
  description: string;
  framework: Framework;
  category: string;
  reviewCycleDays?: number;
  owner: string;
}

export interface ComplianceSummary {
  totalControls: number;
  compliant: number;
  atRisk: number;
  nonCompliant: number;
  notStarted: number;
  overallScore: number;
  byFramework: Record<string, { total: number; compliant: number }>;
}

export class ComplianceTracker {
  private readonly controls = new Map<string, Control>();
  private counter = 0;

  constructor(private readonly bus: EventBus) {}

  private nextId(prefix: string): string {
    this.counter++;
    return `${prefix}-${this.counter}`;
  }

  addControl(input: AddControlInput): Control {
    const id = input.id ?? this.nextId("ctrl");
    const control: Control = {
      id,
      title: input.title,
      description: input.description,
      framework: input.framework,
      category: input.category,
      reviewCycleDays: input.reviewCycleDays ?? 90,
      status: "not-started",
      owner: input.owner,
      evidence: [],
    };
    this.controls.set(id, control);
    this.bus.publish("compliance.control_added", {
      controlId: id,
      framework: input.framework,
      category: input.category,
    });
    this.checkControl(id);
    return control;
  }

  recordEvidence(
    controlId: string,
    input: Omit<Evidence, "id" | "controlId">,
  ): Evidence | undefined {
    const control = this.controls.get(controlId);
    if (!control) return undefined;
    const id = this.nextId("evid");
    const evidence: Evidence = { id, controlId, ...input };
    control.evidence.push(evidence);
    control.lastEvidenceDate = input.collectedAt;
    this.checkControl(controlId);
    this.bus.publish("compliance.evidence_recorded", {
      controlId,
      evidenceId: id,
      type: input.type,
    });
    return evidence;
  }

  checkControl(controlId: string, asOf?: Date): ControlStatus | undefined {
    const control = this.controls.get(controlId);
    if (!control) return undefined;

    const now = asOf ?? new Date();

    if (!control.lastEvidenceDate || control.evidence.length === 0) {
      control.status = "not-started";
      return control.status;
    }

    const lastDate = new Date(control.lastEvidenceDate);
    const daysSince = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince <= control.reviewCycleDays) {
      control.status = "compliant";
    } else if (daysSince <= control.reviewCycleDays * 1.5) {
      control.status = "at-risk";
    } else {
      control.status = "non-compliant";
      this.bus.publish("compliance.gap_detected", {
        controlId,
        title: control.title,
        daysSinceLastEvidence: Math.round(daysSince),
        reviewCycleDays: control.reviewCycleDays,
      });
    }

    return control.status;
  }

  checkGaps(asOf?: Date): Control[] {
    for (const id of this.controls.keys()) {
      this.checkControl(id, asOf);
    }
    return Array.from(this.controls.values()).filter((c) => c.status === "non-compliant");
  }

  get(controlId: string): Control | undefined {
    return this.controls.get(controlId);
  }

  list(framework?: Framework): Control[] {
    const all = Array.from(this.controls.values());
    if (!framework) return all;
    return all.filter((c) => c.framework === framework);
  }

  summary(): ComplianceSummary {
    const all = Array.from(this.controls.values());
    const totalControls = all.length;
    let compliant = 0;
    let atRisk = 0;
    let nonCompliant = 0;
    let notStarted = 0;
    const byFramework: Record<string, { total: number; compliant: number }> = {};

    for (const c of all) {
      if (c.status === "compliant") compliant++;
      else if (c.status === "at-risk") atRisk++;
      else if (c.status === "non-compliant") nonCompliant++;
      else notStarted++;

      if (!byFramework[c.framework]) {
        byFramework[c.framework] = { total: 0, compliant: 0 };
      }
      byFramework[c.framework]!.total++;
      if (c.status === "compliant") byFramework[c.framework]!.compliant++;
    }

    const overallScore = totalControls > 0 ? (compliant / totalControls) * 100 : 0;

    return { totalControls, compliant, atRisk, nonCompliant, notStarted, overallScore, byFramework };
  }
}
