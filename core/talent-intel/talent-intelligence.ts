/**
 * TalentIntelligence — skills gap analysis, succession planning, learning paths,
 * performance calibration, and talent market benchmarking.
 *
 * Events:
 *   - "talent.skills_gap_identified": { employeeId, skill, currentLevel, targetLevel }
 *   - "talent.succession_ready": { roleId, successorId, readinessScore }
 *   - "talent.learning_completed": { employeeId, courseId, skillGained, hoursInvested }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type SkillLevel = 0 | 1 | 2 | 3 | 4 | 5; // 0=none, 5=expert
export type ReadinessLevel = "ready_now" | "ready_12_months" | "ready_24_months" | "not_ready";

export interface SkillProfile {
  employeeId: string;
  skills: Record<string, SkillLevel>; // skill name → level
  lastAssessedAt: string;
}

export interface SuccessionPlan {
  id: string;
  roleId: string;
  roleName: string;
  incumbentId?: string;
  successors: Array<{ employeeId: string; readiness: ReadinessLevel; readinessScore: number }>;
  createdAt: string;
  updatedAt: string;
}

export interface LearningRecord {
  id: string;
  employeeId: string;
  courseId: string;
  courseName: string;
  skillGained: string;
  hoursInvested: number;
  completedAt: string;
  score?: number; // 0-100
}

export interface TalentSummary {
  totalSkillProfiles: number;
  totalSuccessionPlans: number;
  readyNowSuccessors: number;
  totalLearningHours: number;
  avgSkillLevel: number;
  criticalRolesWithoutSuccessors: number;
}

export class TalentIntelligence {
  private skillProfiles: Map<string, SkillProfile> = new Map(); // key: employeeId
  private successionPlans: Map<string, SuccessionPlan> = new Map();
  private learningRecords: Map<string, LearningRecord> = new Map();
  private roleRequirements: Map<string, Record<string, SkillLevel>> = new Map(); // roleId → required skills

  constructor(private readonly bus: EventBus) {}

  updateSkillProfile(employeeId: string, skills: Record<string, SkillLevel>): SkillProfile {
    const profile: SkillProfile = { employeeId, skills, lastAssessedAt: new Date().toISOString() };
    this.skillProfiles.set(employeeId, profile);
    return profile;
  }

  setRoleRequirements(roleId: string, requirements: Record<string, SkillLevel>): void {
    this.roleRequirements.set(roleId, requirements);
  }

  analyzeSkillsGap(employeeId: string, targetRoleId: string): Array<{ skill: string; currentLevel: SkillLevel; targetLevel: SkillLevel }> {
    const profile = this.skillProfiles.get(employeeId);
    const requirements = this.roleRequirements.get(targetRoleId);
    if (!profile || !requirements) return [];

    const gaps: Array<{ skill: string; currentLevel: SkillLevel; targetLevel: SkillLevel }> = [];
    for (const [skill, targetLevel] of Object.entries(requirements)) {
      const currentLevel = (profile.skills[skill] ?? 0) as SkillLevel;
      if (currentLevel < targetLevel) {
        gaps.push({ skill, currentLevel, targetLevel });
        this.bus.publish("talent.skills_gap_identified", { employeeId, skill, currentLevel, targetLevel });
      }
    }
    return gaps;
  }

  createSuccessionPlan(input: Omit<SuccessionPlan, "id" | "createdAt" | "updatedAt"> & { id?: string }): SuccessionPlan {
    const now = new Date().toISOString();
    const plan: SuccessionPlan = { ...input, id: input.id ?? randomUUID(), createdAt: now, updatedAt: now };
    this.successionPlans.set(plan.id, plan);

    for (const s of plan.successors) {
      if (s.readiness === "ready_now" && s.readinessScore >= 80) {
        this.bus.publish("talent.succession_ready", { roleId: plan.roleId, successorId: s.employeeId, readinessScore: s.readinessScore });
      }
    }
    return plan;
  }

  recordLearning(input: Omit<LearningRecord, "id"> & { id?: string }): LearningRecord {
    const record: LearningRecord = { ...input, id: input.id ?? randomUUID() };
    this.learningRecords.set(record.id, record);
    this.bus.publish("talent.learning_completed", { employeeId: record.employeeId, courseId: record.courseId, skillGained: record.skillGained, hoursInvested: record.hoursInvested });
    return record;
  }

  getSkillProfile(employeeId: string): SkillProfile | undefined { return this.skillProfiles.get(employeeId); }
  listSuccessionPlans(): SuccessionPlan[] { return Array.from(this.successionPlans.values()); }
  listLearningRecords(employeeId?: string): LearningRecord[] {
    const all = Array.from(this.learningRecords.values());
    return employeeId ? all.filter((r) => r.employeeId === employeeId) : all;
  }

  summary(): TalentSummary {
    const profiles = Array.from(this.skillProfiles.values());
    const plans = Array.from(this.successionPlans.values());
    const records = Array.from(this.learningRecords.values());
    const allLevels = profiles.flatMap((p) => Object.values(p.skills));
    const avgSkill = allLevels.length > 0 ? allLevels.reduce((s: number, l) => s + l, 0) / allLevels.length : 0;
    const readyNow = plans.flatMap((p) => p.successors.filter((s) => s.readiness === "ready_now")).length;
    const criticalWithoutSuccessors = plans.filter((p) => p.successors.length === 0).length;
    return {
      totalSkillProfiles: profiles.length,
      totalSuccessionPlans: plans.length,
      readyNowSuccessors: readyNow,
      totalLearningHours: records.reduce((s, r) => s + r.hoursInvested, 0),
      avgSkillLevel: Math.round(avgSkill * 10) / 10,
      criticalRolesWithoutSuccessors: criticalWithoutSuccessors,
    };
  }
}
