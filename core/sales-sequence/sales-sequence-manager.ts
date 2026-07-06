/**
 * SalesSequenceManager — multi-step outreach cadences: sequence templates with
 * delayed steps, prospect enrollment, step execution, reply/bounce handling,
 * and engagement analytics.
 *
 * Events:
 *   - "sequence.enrolled": { sequenceId, prospectId }
 *   - "sequence.step_executed": { enrollmentId, stepIndex, channel }
 *   - "sequence.replied": { enrollmentId, prospectId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type StepChannel = "email" | "call" | "linkedin" | "sms";
export type EnrollmentStatus = "active" | "replied" | "bounced" | "completed" | "unsubscribed";

export interface SequenceStep {
  channel: StepChannel;
  delayDays: number;
  template: string;
}

export interface Sequence {
  id: string;
  name: string;
  steps: SequenceStep[];
  active: boolean;
  createdAt: string;
}

export interface Enrollment {
  id: string;
  sequenceId: string;
  prospectId: string;
  currentStep: number;
  status: EnrollmentStatus;
  enrolledAt: string;
  stepsExecuted: number;
}

export interface SequenceSummary {
  totalSequences: number;
  totalEnrollments: number;
  active: number;
  replied: number;
  replyRatePct: number;
  totalStepsExecuted: number;
}

export class SalesSequenceManager {
  private sequences: Map<string, Sequence> = new Map();
  private enrollments: Map<string, Enrollment> = new Map();

  constructor(private readonly bus: EventBus) {}

  createSequence(name: string, steps: SequenceStep[]): Sequence {
    const sequence: Sequence = { id: randomUUID(), name, steps, active: true, createdAt: new Date().toISOString() };
    this.sequences.set(sequence.id, sequence);
    return sequence;
  }

  pause(sequenceId: string): Sequence | undefined {
    const seq = this.sequences.get(sequenceId);
    if (!seq) return undefined;
    seq.active = false;
    return seq;
  }

  enroll(sequenceId: string, prospectId: string, asOf: string): Enrollment | undefined {
    const seq = this.sequences.get(sequenceId);
    if (!seq || !seq.active || seq.steps.length === 0) return undefined;
    const existing = Array.from(this.enrollments.values()).find(e => e.sequenceId === sequenceId && e.prospectId === prospectId && e.status === "active");
    if (existing) return existing;
    const enrollment: Enrollment = { id: randomUUID(), sequenceId, prospectId, currentStep: 0, status: "active", enrolledAt: asOf, stepsExecuted: 0 };
    this.enrollments.set(enrollment.id, enrollment);
    this.bus.publish("sequence.enrolled", { sequenceId, prospectId });
    return enrollment;
  }

  executeNextStep(enrollmentId: string): Enrollment | undefined {
    const enrollment = this.enrollments.get(enrollmentId);
    if (!enrollment || enrollment.status !== "active") return undefined;
    const seq = this.sequences.get(enrollment.sequenceId)!;
    const step = seq.steps[enrollment.currentStep];
    if (!step) return undefined;
    enrollment.stepsExecuted += 1;
    this.bus.publish("sequence.step_executed", { enrollmentId, stepIndex: enrollment.currentStep, channel: step.channel });
    enrollment.currentStep += 1;
    if (enrollment.currentStep >= seq.steps.length) enrollment.status = "completed";
    return enrollment;
  }

  recordReply(enrollmentId: string): Enrollment | undefined {
    const enrollment = this.enrollments.get(enrollmentId);
    if (!enrollment || enrollment.status !== "active") return undefined;
    enrollment.status = "replied";
    this.bus.publish("sequence.replied", { enrollmentId, prospectId: enrollment.prospectId });
    return enrollment;
  }

  recordBounce(enrollmentId: string): Enrollment | undefined {
    const enrollment = this.enrollments.get(enrollmentId);
    if (!enrollment || enrollment.status !== "active") return undefined;
    enrollment.status = "bounced";
    return enrollment;
  }

  unsubscribe(enrollmentId: string): Enrollment | undefined {
    const enrollment = this.enrollments.get(enrollmentId);
    if (!enrollment) return undefined;
    enrollment.status = "unsubscribed";
    return enrollment;
  }

  getSequence(id: string): Sequence | undefined { return this.sequences.get(id); }
  getEnrollment(id: string): Enrollment | undefined { return this.enrollments.get(id); }
  listSequences(): Sequence[] { return Array.from(this.sequences.values()); }
  listEnrollments(status?: EnrollmentStatus): Enrollment[] {
    const all = Array.from(this.enrollments.values());
    return status ? all.filter(e => e.status === status) : all;
  }

  summary(): SequenceSummary {
    const enrollments = Array.from(this.enrollments.values());
    const replied = enrollments.filter(e => e.status === "replied").length;
    return {
      totalSequences: this.sequences.size,
      totalEnrollments: enrollments.length,
      active: enrollments.filter(e => e.status === "active").length,
      replied,
      replyRatePct: enrollments.length > 0 ? Math.round((replied / enrollments.length) * 100) : 0,
      totalStepsExecuted: enrollments.reduce((s, e) => s + e.stepsExecuted, 0),
    };
  }
}
