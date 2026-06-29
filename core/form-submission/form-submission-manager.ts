/**
 * FormSubmissionManager — web form definitions and submission intake with
 * spam scoring, routing to queues, and processing/conversion tracking.
 *
 * Events:
 *   - "form.submitted": { submissionId, formId, routedTo }
 *   - "form.flagged_spam": { submissionId, formId, score }
 *   - "form.processed": { submissionId, outcome }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type FormType = "contact" | "lead" | "support" | "demo_request" | "newsletter" | "feedback";
export type SubmissionStatus = "new" | "spam" | "processing" | "processed";
export type ProcessOutcome = "converted" | "qualified" | "disqualified" | "closed";

export interface FormDef {
  id: string;
  name: string;
  type: FormType;
  routeTo: string; // queue/team
  active: boolean;
  createdAt: string;
}

export interface FormSubmission {
  id: string;
  formId: string;
  fields: Record<string, string>;
  status: SubmissionStatus;
  spamScore: number;
  routedTo?: string;
  outcome?: ProcessOutcome;
  submittedAt: string;
  processedAt?: string;
}

export interface FormSubmissionSummary {
  totalForms: number;
  totalSubmissions: number;
  spamCount: number;
  processed: number;
  converted: number;
  byFormType: Partial<Record<FormType, number>>;
}

export class FormSubmissionManager {
  private forms: Map<string, FormDef> = new Map();
  private submissions: Map<string, FormSubmission> = new Map();
  private spamThreshold: number;

  constructor(private readonly bus: EventBus, spamThreshold = 0.7) {
    this.spamThreshold = spamThreshold;
  }

  createForm(input: { name: string; type: FormType; routeTo: string }): FormDef {
    const form: FormDef = { ...input, id: randomUUID(), active: true, createdAt: new Date().toISOString() };
    this.forms.set(form.id, form);
    return form;
  }

  setActive(formId: string, active: boolean): FormDef | undefined {
    const form = this.forms.get(formId);
    if (!form) return undefined;
    form.active = active;
    return form;
  }

  submit(formId: string, fields: Record<string, string>, submittedAt: string, spamScore = 0): FormSubmission | undefined {
    const form = this.forms.get(formId);
    if (!form || !form.active) return undefined;
    const isSpam = spamScore >= this.spamThreshold;
    const submission: FormSubmission = {
      id: randomUUID(),
      formId,
      fields,
      status: isSpam ? "spam" : "new",
      spamScore,
      routedTo: isSpam ? undefined : form.routeTo,
      submittedAt,
    };
    this.submissions.set(submission.id, submission);
    if (isSpam) {
      this.bus.publish("form.flagged_spam", { submissionId: submission.id, formId, score: spamScore });
    } else {
      this.bus.publish("form.submitted", { submissionId: submission.id, formId, routedTo: form.routeTo });
    }
    return submission;
  }

  process(submissionId: string, outcome: ProcessOutcome, asOf: string): FormSubmission | undefined {
    const submission = this.submissions.get(submissionId);
    if (!submission || submission.status === "spam" || submission.status === "processed") return undefined;
    submission.status = "processed";
    submission.outcome = outcome;
    submission.processedAt = asOf;
    this.bus.publish("form.processed", { submissionId, outcome });
    return submission;
  }

  getForm(id: string): FormDef | undefined { return this.forms.get(id); }
  getSubmission(id: string): FormSubmission | undefined { return this.submissions.get(id); }
  listForms(type?: FormType): FormDef[] {
    const all = Array.from(this.forms.values());
    return type ? all.filter(f => f.type === type) : all;
  }
  listSubmissions(formId?: string, status?: SubmissionStatus): FormSubmission[] {
    let all = Array.from(this.submissions.values());
    if (formId) all = all.filter(s => s.formId === formId);
    if (status) all = all.filter(s => s.status === status);
    return all;
  }

  summary(): FormSubmissionSummary {
    const forms = Array.from(this.forms.values());
    const submissions = Array.from(this.submissions.values());
    const byFormType: Partial<Record<FormType, number>> = {};
    for (const s of submissions) {
      const form = this.forms.get(s.formId);
      if (form) byFormType[form.type] = (byFormType[form.type] ?? 0) + 1;
    }
    return {
      totalForms: forms.length,
      totalSubmissions: submissions.length,
      spamCount: submissions.filter(s => s.status === "spam").length,
      processed: submissions.filter(s => s.status === "processed").length,
      converted: submissions.filter(s => s.outcome === "converted").length,
      byFormType,
    };
  }
}
