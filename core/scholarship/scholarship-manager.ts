/**
 * ScholarshipManager — scholarship programs: fund creation with award size
 * and seat count, application intake with scoring, ranked awarding limited by
 * seats and fund balance, and disbursement tracking.
 *
 * Events:
 *   - "scholarship.application_received": { programId, applicationId }
 *   - "scholarship.awarded": { programId, applicationId, amountUsd }
 *   - "scholarship.disbursed": { programId, applicationId, amountUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ScholarshipAppStatus = "submitted" | "awarded" | "declined" | "disbursed";

export interface ScholarshipProgram {
  id: string;
  name: string;
  awardUsd: number;
  seats: number;
  fundUsd: number;
  open: boolean;
}

export interface ScholarshipApplication {
  id: string;
  programId: string;
  applicantName: string;
  score: number;
  status: ScholarshipAppStatus;
  submittedAt: string;
}

export interface ScholarshipSummary {
  totalPrograms: number;
  totalApplications: number;
  awarded: number;
  disbursed: number;
  totalDisbursedUsd: number;
}

export class ScholarshipManager {
  private programs: Map<string, ScholarshipProgram> = new Map();
  private applications: Map<string, ScholarshipApplication> = new Map();

  constructor(private readonly bus: EventBus) {}

  createProgram(name: string, awardUsd: number, seats: number, fundUsd: number): ScholarshipProgram {
    const program: ScholarshipProgram = { id: randomUUID(), name, awardUsd, seats, fundUsd, open: true };
    this.programs.set(program.id, program);
    return program;
  }

  apply(programId: string, applicantName: string, score: number, submittedAt: string): ScholarshipApplication | undefined {
    const program = this.programs.get(programId);
    if (!program || !program.open) return undefined;
    const app: ScholarshipApplication = { id: randomUUID(), programId, applicantName, score, status: "submitted", submittedAt };
    this.applications.set(app.id, app);
    this.bus.publish("scholarship.application_received", { programId, applicationId: app.id });
    return app;
  }

  /**
   * Close applications and award top-scored applicants up to the seat count
   * and available fund; remaining applicants are declined.
   */
  awardTop(programId: string): ScholarshipApplication[] {
    const program = this.programs.get(programId);
    if (!program || !program.open) return [];
    program.open = false;
    const apps = Array.from(this.applications.values())
      .filter(a => a.programId === programId && a.status === "submitted")
      .sort((a, b) => b.score - a.score);
    const awarded: ScholarshipApplication[] = [];
    for (const app of apps) {
      if (awarded.length < program.seats && program.fundUsd >= program.awardUsd) {
        app.status = "awarded";
        program.fundUsd = Math.round((program.fundUsd - program.awardUsd) * 100) / 100;
        awarded.push(app);
        this.bus.publish("scholarship.awarded", { programId, applicationId: app.id, amountUsd: program.awardUsd });
      } else {
        app.status = "declined";
      }
    }
    return awarded;
  }

  disburse(applicationId: string): ScholarshipApplication | undefined {
    const app = this.applications.get(applicationId);
    if (!app || app.status !== "awarded") return undefined;
    const program = this.programs.get(app.programId);
    if (!program) return undefined;
    app.status = "disbursed";
    this.bus.publish("scholarship.disbursed", { programId: app.programId, applicationId, amountUsd: program.awardUsd });
    return app;
  }

  getProgram(id: string): ScholarshipProgram | undefined { return this.programs.get(id); }
  getApplication(id: string): ScholarshipApplication | undefined { return this.applications.get(id); }
  listApplications(programId?: string, status?: ScholarshipAppStatus): ScholarshipApplication[] {
    let all = Array.from(this.applications.values());
    if (programId) all = all.filter(a => a.programId === programId);
    if (status) all = all.filter(a => a.status === status);
    return all;
  }

  summary(): ScholarshipSummary {
    const apps = Array.from(this.applications.values());
    const disbursed = apps.filter(a => a.status === "disbursed");
    let totalDisbursed = 0;
    for (const a of disbursed) {
      totalDisbursed += this.programs.get(a.programId)?.awardUsd ?? 0;
    }
    return {
      totalPrograms: this.programs.size,
      totalApplications: apps.length,
      awarded: apps.filter(a => a.status === "awarded").length,
      disbursed: disbursed.length,
      totalDisbursedUsd: Math.round(totalDisbursed * 100) / 100,
    };
  }
}
