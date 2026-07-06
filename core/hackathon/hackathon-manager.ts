/**
 * HackathonManager — internal hackathons: event creation with a theme and
 * team-size cap, team registration, project submission before judging, score
 * aggregation across judges, and winner declaration.
 *
 * Events:
 *   - "hackathon.team_registered": { eventId, teamId }
 *   - "hackathon.submitted": { eventId, teamId, projectName }
 *   - "hackathon.winner": { eventId, teamId, avgScore }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type HackathonPhase = "registration" | "judging" | "closed";

export interface HackathonTeam {
  id: string;
  name: string;
  members: string[];
  projectName?: string;
  projectDescription?: string;
  scores: number[];
}

export interface HackathonEvent {
  id: string;
  theme: string;
  maxTeamSize: number;
  phase: HackathonPhase;
  winnerTeamId?: string;
}

export interface HackathonSummary {
  totalEvents: number;
  totalTeams: number;
  totalSubmissions: number;
  closedEvents: number;
}

export class HackathonManager {
  private events: Map<string, HackathonEvent> = new Map();
  private teams: Map<string, Map<string, HackathonTeam>> = new Map();

  constructor(private readonly bus: EventBus) {}

  createEvent(theme: string, maxTeamSize = 5): HackathonEvent {
    const event: HackathonEvent = { id: randomUUID(), theme, maxTeamSize, phase: "registration" };
    this.events.set(event.id, event);
    this.teams.set(event.id, new Map());
    return event;
  }

  registerTeam(eventId: string, name: string, members: string[]): HackathonTeam | undefined {
    const event = this.events.get(eventId);
    const roster = this.teams.get(eventId);
    if (!event || event.phase !== "registration" || !roster) return undefined;
    if (members.length === 0 || members.length > event.maxTeamSize) return undefined;
    const team: HackathonTeam = { id: randomUUID(), name, members: [...members], scores: [] };
    roster.set(team.id, team);
    this.bus.publish("hackathon.team_registered", { eventId, teamId: team.id });
    return team;
  }

  submitProject(eventId: string, teamId: string, projectName: string, projectDescription: string): HackathonTeam | undefined {
    const event = this.events.get(eventId);
    const team = this.teams.get(eventId)?.get(teamId);
    if (!event || event.phase !== "registration" || !team || team.projectName) return undefined;
    team.projectName = projectName;
    team.projectDescription = projectDescription;
    this.bus.publish("hackathon.submitted", { eventId, teamId, projectName });
    return team;
  }

  startJudging(eventId: string): HackathonEvent | undefined {
    const event = this.events.get(eventId);
    if (!event || event.phase !== "registration") return undefined;
    event.phase = "judging";
    return event;
  }

  /** Judges score submitted teams 0–10 during the judging phase. */
  score(eventId: string, teamId: string, score: number): HackathonTeam | undefined {
    const event = this.events.get(eventId);
    const team = this.teams.get(eventId)?.get(teamId);
    if (!event || event.phase !== "judging" || !team || !team.projectName) return undefined;
    if (score < 0 || score > 10) return undefined;
    team.scores.push(score);
    return team;
  }

  /** Close judging and declare the highest-average submitted team the winner. */
  declareWinner(eventId: string): { team: HackathonTeam; avgScore: number } | undefined {
    const event = this.events.get(eventId);
    const roster = this.teams.get(eventId);
    if (!event || event.phase !== "judging" || !roster) return undefined;
    const scored = Array.from(roster.values()).filter(t => t.projectName && t.scores.length > 0);
    if (scored.length === 0) return undefined;
    const avg = (t: HackathonTeam) => t.scores.reduce((s, x) => s + x, 0) / t.scores.length;
    const winner = scored.sort((a, b) => avg(b) - avg(a))[0]!;
    event.phase = "closed";
    event.winnerTeamId = winner.id;
    const avgScore = Math.round(avg(winner) * 100) / 100;
    this.bus.publish("hackathon.winner", { eventId, teamId: winner.id, avgScore });
    return { team: winner, avgScore };
  }

  getEvent(id: string): HackathonEvent | undefined { return this.events.get(id); }
  getTeam(eventId: string, teamId: string): HackathonTeam | undefined { return this.teams.get(eventId)?.get(teamId); }
  listTeams(eventId: string): HackathonTeam[] { return Array.from(this.teams.get(eventId)?.values() ?? []); }

  summary(): HackathonSummary {
    const events = Array.from(this.events.values());
    const allTeams = Array.from(this.teams.values()).flatMap(r => Array.from(r.values()));
    return {
      totalEvents: events.length,
      totalTeams: allTeams.length,
      totalSubmissions: allTeams.filter(t => t.projectName).length,
      closedEvents: events.filter(e => e.phase === "closed").length,
    };
  }
}
