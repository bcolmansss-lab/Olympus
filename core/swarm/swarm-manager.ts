/**
 * SwarmManager — incident swarm collaboration: spin up a swarm around a
 * problem, pull in responders by expertise, track hypotheses tested, and
 * disband with a resolution note.
 *
 * Events:
 *   - "swarm.started": { swarmId, subject, severity }
 *   - "swarm.responder_joined": { swarmId, responderId, expertise }
 *   - "swarm.disbanded": { swarmId, resolved, durationMinutes }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type SwarmStatus = "active" | "disbanded";
export type HypothesisStatus = "testing" | "confirmed" | "ruled_out";

export interface Responder {
  responderId: string;
  expertise: string;
  joinedAt: string;
}

export interface Hypothesis {
  id: string;
  description: string;
  status: HypothesisStatus;
  proposedBy: string;
}

export interface Swarm {
  id: string;
  subject: string;
  severity: string;
  status: SwarmStatus;
  responders: Responder[];
  hypotheses: Hypothesis[];
  resolved?: boolean;
  resolutionNote?: string;
  startedAt: string;
  disbandedAt?: string;
}

export interface SwarmSummary {
  totalSwarms: number;
  active: number;
  resolvedPct: number;
  avgResponders: number;
  avgDurationMinutes: number;
}

export class SwarmManager {
  private swarms: Map<string, Swarm> = new Map();

  constructor(private readonly bus: EventBus) {}

  start(subject: string, severity: string, asOf: string): Swarm {
    const swarm: Swarm = { id: randomUUID(), subject, severity, status: "active", responders: [], hypotheses: [], startedAt: asOf };
    this.swarms.set(swarm.id, swarm);
    this.bus.publish("swarm.started", { swarmId: swarm.id, subject, severity });
    return swarm;
  }

  join(swarmId: string, responderId: string, expertise: string, asOf: string): Responder | undefined {
    const swarm = this.swarms.get(swarmId);
    if (!swarm || swarm.status !== "active") return undefined;
    if (swarm.responders.some(r => r.responderId === responderId)) return undefined;
    const responder: Responder = { responderId, expertise, joinedAt: asOf };
    swarm.responders.push(responder);
    this.bus.publish("swarm.responder_joined", { swarmId, responderId, expertise });
    return responder;
  }

  proposeHypothesis(swarmId: string, description: string, proposedBy: string): Hypothesis | undefined {
    const swarm = this.swarms.get(swarmId);
    if (!swarm || swarm.status !== "active") return undefined;
    const hypothesis: Hypothesis = { id: randomUUID(), description, status: "testing", proposedBy };
    swarm.hypotheses.push(hypothesis);
    return hypothesis;
  }

  resolveHypothesis(swarmId: string, hypothesisId: string, confirmed: boolean): Hypothesis | undefined {
    const swarm = this.swarms.get(swarmId);
    const h = swarm?.hypotheses.find(x => x.id === hypothesisId);
    if (!h || h.status !== "testing") return undefined;
    h.status = confirmed ? "confirmed" : "ruled_out";
    return h;
  }

  disband(swarmId: string, resolved: boolean, resolutionNote: string, asOf: string): Swarm | undefined {
    const swarm = this.swarms.get(swarmId);
    if (!swarm || swarm.status !== "active") return undefined;
    swarm.status = "disbanded";
    swarm.resolved = resolved;
    swarm.resolutionNote = resolutionNote;
    swarm.disbandedAt = asOf;
    const durationMinutes = Math.round((new Date(asOf).getTime() - new Date(swarm.startedAt).getTime()) / 60000);
    this.bus.publish("swarm.disbanded", { swarmId, resolved, durationMinutes });
    return swarm;
  }

  getSwarm(id: string): Swarm | undefined { return this.swarms.get(id); }
  listSwarms(status?: SwarmStatus): Swarm[] {
    const all = Array.from(this.swarms.values());
    return status ? all.filter(s => s.status === status) : all;
  }

  summary(): SwarmSummary {
    const swarms = Array.from(this.swarms.values());
    const disbanded = swarms.filter(s => s.status === "disbanded");
    const resolved = disbanded.filter(s => s.resolved).length;
    const durations = disbanded.map(s => Math.round((new Date(s.disbandedAt!).getTime() - new Date(s.startedAt).getTime()) / 60000));
    return {
      totalSwarms: swarms.length,
      active: swarms.filter(s => s.status === "active").length,
      resolvedPct: disbanded.length > 0 ? Math.round((resolved / disbanded.length) * 100) : 0,
      avgResponders: swarms.length > 0 ? Math.round(swarms.reduce((s, x) => s + x.responders.length, 0) / swarms.length) : 0,
      avgDurationMinutes: durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0,
    };
  }
}
