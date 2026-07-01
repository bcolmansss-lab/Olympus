/**
 * BetaProgramManager — beta/early-access programs: capacity-limited enrollment,
 * NDA gating, feedback capture with severity, and graduation to GA.
 *
 * Events:
 *   - "beta.program_opened": { programId, feature, capacity }
 *   - "beta.enrolled": { programId, participantId }
 *   - "beta.feedback_received": { programId, participantId, severity }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ProgramStatus = "open" | "closed" | "graduated";
export type FeedbackSeverity = "praise" | "minor" | "major" | "blocker";

export interface Participant {
  id: string;
  participantId: string;
  ndaSigned: boolean;
  enrolledAt: string;
  active: boolean;
}

export interface BetaFeedback {
  id: string;
  participantId: string;
  severity: FeedbackSeverity;
  note: string;
  at: string;
}

export interface BetaProgram {
  id: string;
  feature: string;
  status: ProgramStatus;
  capacity: number;
  requiresNda: boolean;
  participants: Participant[];
  feedback: BetaFeedback[];
  createdAt: string;
}

export interface BetaSummary {
  totalPrograms: number;
  open: number;
  totalParticipants: number;
  totalFeedback: number;
  blockers: number;
  graduated: number;
}

export class BetaProgramManager {
  private programs: Map<string, BetaProgram> = new Map();

  constructor(private readonly bus: EventBus) {}

  open(input: { feature: string; capacity: number; requiresNda?: boolean }): BetaProgram {
    const program: BetaProgram = { ...input, id: randomUUID(), requiresNda: input.requiresNda ?? false, status: "open", participants: [], feedback: [], createdAt: new Date().toISOString() };
    this.programs.set(program.id, program);
    this.bus.publish("beta.program_opened", { programId: program.id, feature: program.feature, capacity: program.capacity });
    return program;
  }

  enroll(programId: string, participantId: string, ndaSigned = false, asOf = new Date().toISOString()): Participant | undefined {
    const program = this.programs.get(programId);
    if (!program || program.status !== "open") return undefined;
    if (program.participants.filter(p => p.active).length >= program.capacity) return undefined;
    if (program.requiresNda && !ndaSigned) return undefined;
    if (program.participants.some(p => p.participantId === participantId && p.active)) return undefined;
    const participant: Participant = { id: randomUUID(), participantId, ndaSigned, enrolledAt: asOf, active: true };
    program.participants.push(participant);
    this.bus.publish("beta.enrolled", { programId, participantId });
    return participant;
  }

  unenroll(programId: string, participantId: string): boolean {
    const program = this.programs.get(programId);
    const p = program?.participants.find(x => x.participantId === participantId && x.active);
    if (!p) return false;
    p.active = false;
    return true;
  }

  submitFeedback(programId: string, participantId: string, severity: FeedbackSeverity, note: string, at: string): BetaFeedback | undefined {
    const program = this.programs.get(programId);
    if (!program || !program.participants.some(p => p.participantId === participantId && p.active)) return undefined;
    const feedback: BetaFeedback = { id: randomUUID(), participantId, severity, note, at };
    program.feedback.push(feedback);
    this.bus.publish("beta.feedback_received", { programId, participantId, severity });
    return feedback;
  }

  graduate(programId: string): BetaProgram | undefined {
    const program = this.programs.get(programId);
    if (!program || program.status === "graduated") return undefined;
    if (program.feedback.some(f => f.severity === "blocker")) return undefined;
    program.status = "graduated";
    return program;
  }

  close(programId: string): BetaProgram | undefined {
    const program = this.programs.get(programId);
    if (!program || program.status === "graduated") return undefined;
    program.status = "closed";
    return program;
  }

  getProgram(id: string): BetaProgram | undefined { return this.programs.get(id); }
  listPrograms(status?: ProgramStatus): BetaProgram[] {
    const all = Array.from(this.programs.values());
    return status ? all.filter(p => p.status === status) : all;
  }

  summary(): BetaSummary {
    const programs = Array.from(this.programs.values());
    const participants = programs.flatMap(p => p.participants.filter(x => x.active));
    const feedback = programs.flatMap(p => p.feedback);
    return {
      totalPrograms: programs.length,
      open: programs.filter(p => p.status === "open").length,
      totalParticipants: participants.length,
      totalFeedback: feedback.length,
      blockers: feedback.filter(f => f.severity === "blocker").length,
      graduated: programs.filter(p => p.status === "graduated").length,
    };
  }
}
