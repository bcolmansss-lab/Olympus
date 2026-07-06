/**
 * MentorshipManager — mentorship programs: mentor registration with capacity
 * and skill areas, mentee matching by requested skill, session logging, and
 * pairing lifecycle through completion.
 *
 * Events:
 *   - "mentorship.matched": { pairingId, mentorId, menteeId, skill }
 *   - "mentorship.session_logged": { pairingId, sessionCount }
 *   - "mentorship.completed": { pairingId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PairingStatus = "active" | "completed" | "dissolved";

export interface Mentor {
  id: string;
  name: string;
  skills: string[];
  capacity: number;
  activePairings: number;
}

export interface MentorshipPairing {
  id: string;
  mentorId: string;
  menteeId: string;
  skill: string;
  status: PairingStatus;
  sessionCount: number;
  startedAt: string;
  endedAt?: string;
}

export interface MentorshipSummary {
  totalMentors: number;
  activePairings: number;
  completedPairings: number;
  totalSessions: number;
  avgSessionsPerCompletedPairing: number;
}

export class MentorshipManager {
  private mentors: Map<string, Mentor> = new Map();
  private pairings: Map<string, MentorshipPairing> = new Map();

  constructor(private readonly bus: EventBus) {}

  registerMentor(name: string, skills: string[], capacity = 2): Mentor {
    const mentor: Mentor = { id: randomUUID(), name, skills: skills.map(s => s.toLowerCase()), capacity, activePairings: 0 };
    this.mentors.set(mentor.id, mentor);
    return mentor;
  }

  /** Match a mentee to the mentor with the requested skill and most free capacity. */
  match(menteeId: string, skill: string, startedAt: string): MentorshipPairing | undefined {
    const want = skill.toLowerCase();
    const candidates = Array.from(this.mentors.values())
      .filter(m => m.skills.includes(want) && m.activePairings < m.capacity)
      .sort((a, b) => (b.capacity - b.activePairings) - (a.capacity - a.activePairings));
    const mentor = candidates[0];
    if (!mentor) return undefined;
    mentor.activePairings += 1;
    const pairing: MentorshipPairing = { id: randomUUID(), mentorId: mentor.id, menteeId, skill: want, status: "active", sessionCount: 0, startedAt };
    this.pairings.set(pairing.id, pairing);
    this.bus.publish("mentorship.matched", { pairingId: pairing.id, mentorId: mentor.id, menteeId, skill: want });
    return pairing;
  }

  logSession(pairingId: string): MentorshipPairing | undefined {
    const p = this.pairings.get(pairingId);
    if (!p || p.status !== "active") return undefined;
    p.sessionCount += 1;
    this.bus.publish("mentorship.session_logged", { pairingId, sessionCount: p.sessionCount });
    return p;
  }

  complete(pairingId: string, endedAt: string): MentorshipPairing | undefined {
    return this.end(pairingId, "completed", endedAt, true);
  }

  dissolve(pairingId: string, endedAt: string): MentorshipPairing | undefined {
    return this.end(pairingId, "dissolved", endedAt, false);
  }

  private end(pairingId: string, status: PairingStatus, endedAt: string, publish: boolean): MentorshipPairing | undefined {
    const p = this.pairings.get(pairingId);
    if (!p || p.status !== "active") return undefined;
    p.status = status;
    p.endedAt = endedAt;
    const mentor = this.mentors.get(p.mentorId);
    if (mentor) mentor.activePairings = Math.max(0, mentor.activePairings - 1);
    if (publish) this.bus.publish("mentorship.completed", { pairingId });
    return p;
  }

  getMentor(id: string): Mentor | undefined { return this.mentors.get(id); }
  getPairing(id: string): MentorshipPairing | undefined { return this.pairings.get(id); }
  listPairings(status?: PairingStatus): MentorshipPairing[] {
    const all = Array.from(this.pairings.values());
    return status ? all.filter(p => p.status === status) : all;
  }

  summary(): MentorshipSummary {
    const pairings = Array.from(this.pairings.values());
    const completed = pairings.filter(p => p.status === "completed");
    const completedSessions = completed.reduce((s, p) => s + p.sessionCount, 0);
    return {
      totalMentors: this.mentors.size,
      activePairings: pairings.filter(p => p.status === "active").length,
      completedPairings: completed.length,
      totalSessions: pairings.reduce((s, p) => s + p.sessionCount, 0),
      avgSessionsPerCompletedPairing: completed.length > 0 ? Math.round((completedSessions / completed.length) * 100) / 100 : 0,
    };
  }
}
