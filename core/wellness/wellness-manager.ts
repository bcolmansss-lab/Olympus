/**
 * WellnessManager — employee wellness challenges: challenge creation with a
 * measurable goal, participant enrollment, progress logging, goal-completion
 * detection, and participation reporting.
 *
 * Events:
 *   - "wellness.enrolled": { challengeId, employeeId }
 *   - "wellness.goal_reached": { challengeId, employeeId }
 *   - "wellness.challenge_closed": { challengeId, completionRatePct }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ChallengeStatus = "open" | "closed";

export interface WellnessChallenge {
  id: string;
  name: string;
  metric: string;
  goal: number;
  status: ChallengeStatus;
  startAt: string;
  endAt: string;
}

export interface WellnessParticipant {
  employeeId: string;
  progress: number;
  goalReached: boolean;
}

export interface WellnessSummary {
  totalChallenges: number;
  openChallenges: number;
  totalParticipants: number;
  goalsReached: number;
  overallCompletionPct: number;
}

export class WellnessManager {
  private challenges: Map<string, WellnessChallenge> = new Map();
  private participants: Map<string, Map<string, WellnessParticipant>> = new Map();

  constructor(private readonly bus: EventBus) {}

  createChallenge(name: string, metric: string, goal: number, startAt: string, endAt: string): WellnessChallenge {
    const challenge: WellnessChallenge = { id: randomUUID(), name, metric, goal, status: "open", startAt, endAt };
    this.challenges.set(challenge.id, challenge);
    this.participants.set(challenge.id, new Map());
    return challenge;
  }

  enroll(challengeId: string, employeeId: string): WellnessParticipant | undefined {
    const challenge = this.challenges.get(challengeId);
    const roster = this.participants.get(challengeId);
    if (!challenge || challenge.status !== "open" || !roster || roster.has(employeeId)) return undefined;
    const participant: WellnessParticipant = { employeeId, progress: 0, goalReached: false };
    roster.set(employeeId, participant);
    this.bus.publish("wellness.enrolled", { challengeId, employeeId });
    return participant;
  }

  /** Add progress; publishes once when the participant first reaches the goal. */
  logProgress(challengeId: string, employeeId: string, amount: number): WellnessParticipant | undefined {
    const challenge = this.challenges.get(challengeId);
    const participant = this.participants.get(challengeId)?.get(employeeId);
    if (!challenge || challenge.status !== "open" || !participant || amount <= 0) return undefined;
    participant.progress = Math.round((participant.progress + amount) * 100) / 100;
    if (!participant.goalReached && participant.progress >= challenge.goal) {
      participant.goalReached = true;
      this.bus.publish("wellness.goal_reached", { challengeId, employeeId });
    }
    return participant;
  }

  closeChallenge(challengeId: string): { challenge: WellnessChallenge; completionRatePct: number } | undefined {
    const challenge = this.challenges.get(challengeId);
    const roster = this.participants.get(challengeId);
    if (!challenge || challenge.status !== "open" || !roster) return undefined;
    challenge.status = "closed";
    const total = roster.size;
    const reached = Array.from(roster.values()).filter(p => p.goalReached).length;
    const completionRatePct = total > 0 ? Math.round((reached / total) * 100) : 0;
    this.bus.publish("wellness.challenge_closed", { challengeId, completionRatePct });
    return { challenge, completionRatePct };
  }

  getChallenge(id: string): WellnessChallenge | undefined { return this.challenges.get(id); }
  getParticipant(challengeId: string, employeeId: string): WellnessParticipant | undefined {
    return this.participants.get(challengeId)?.get(employeeId);
  }
  leaderboard(challengeId: string): WellnessParticipant[] {
    const roster = this.participants.get(challengeId);
    if (!roster) return [];
    return Array.from(roster.values()).sort((a, b) => b.progress - a.progress);
  }

  summary(): WellnessSummary {
    const challenges = Array.from(this.challenges.values());
    const all = Array.from(this.participants.values()).flatMap(r => Array.from(r.values()));
    const reached = all.filter(p => p.goalReached).length;
    return {
      totalChallenges: challenges.length,
      openChallenges: challenges.filter(c => c.status === "open").length,
      totalParticipants: all.length,
      goalsReached: reached,
      overallCompletionPct: all.length > 0 ? Math.round((reached / all.length) * 100) : 0,
    };
  }
}
