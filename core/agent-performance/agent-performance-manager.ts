/**
 * AgentPerformanceManager — support agent scorecards: per-agent ticket volume,
 * resolution time, CSAT, and SLA adherence rolled into a composite score with
 * ranking.
 *
 * Events:
 *   - "agentperf.agent_added": { agentId, name, team }
 *   - "agentperf.metrics_recorded": { agentId, period }
 *   - "agentperf.top_performer": { agentId, score }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export interface AgentPeriodMetrics {
  period: string;
  ticketsResolved: number;
  avgResolutionHours: number;
  csatPct: number;
  slaAdherencePct: number;
}

export interface Agent {
  id: string;
  agentId: string;
  name: string;
  team: string;
  metrics: AgentPeriodMetrics[];
  createdAt: string;
}

export interface AgentScore {
  agentId: string;
  name: string;
  score: number;
}

export interface AgentPerformanceSummary {
  totalAgents: number;
  avgCsatPct: number;
  avgSlaAdherencePct: number;
  totalTicketsResolved: number;
  ranking: AgentScore[];
}

export class AgentPerformanceManager {
  private agents: Map<string, Agent> = new Map(); // key: agentId
  private topScoreThreshold: number;

  constructor(private readonly bus: EventBus, topScoreThreshold = 85) {
    this.topScoreThreshold = topScoreThreshold;
  }

  addAgent(agentId: string, name: string, team: string): Agent {
    const agent: Agent = { id: randomUUID(), agentId, name, team, metrics: [], createdAt: new Date().toISOString() };
    this.agents.set(agentId, agent);
    this.bus.publish("agentperf.agent_added", { agentId, name, team });
    return agent;
  }

  recordMetrics(agentId: string, m: AgentPeriodMetrics): Agent | undefined {
    const agent = this.agents.get(agentId);
    if (!agent) return undefined;
    agent.metrics = agent.metrics.filter(x => x.period !== m.period);
    agent.metrics.push(m);
    this.bus.publish("agentperf.metrics_recorded", { agentId, period: m.period });
    if (this.compositeScore(agentId) >= this.topScoreThreshold) {
      this.bus.publish("agentperf.top_performer", { agentId, score: this.compositeScore(agentId) });
    }
    return agent;
  }

  /** Composite 0-100: CSAT 40%, SLA 40%, resolution-speed 20% (faster is better). */
  compositeScore(agentId: string): number {
    const agent = this.agents.get(agentId);
    if (!agent || agent.metrics.length === 0) return 0;
    const latest = agent.metrics[agent.metrics.length - 1]!;
    const speedScore = Math.max(0, 100 - latest.avgResolutionHours * 2); // 0h=100, 50h=0
    return Math.round(latest.csatPct * 0.4 + latest.slaAdherencePct * 0.4 + speedScore * 0.2);
  }

  ranking(): AgentScore[] {
    return Array.from(this.agents.values())
      .map(a => ({ agentId: a.agentId, name: a.name, score: this.compositeScore(a.agentId) }))
      .sort((a, b) => b.score - a.score);
  }

  getAgent(agentId: string): Agent | undefined { return this.agents.get(agentId); }
  listAgents(team?: string): Agent[] {
    const all = Array.from(this.agents.values());
    return team ? all.filter(a => a.team === team) : all;
  }

  summary(): AgentPerformanceSummary {
    const agents = Array.from(this.agents.values());
    const withMetrics = agents.filter(a => a.metrics.length > 0).map(a => a.metrics[a.metrics.length - 1]!);
    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : 0;
    return {
      totalAgents: agents.length,
      avgCsatPct: avg(withMetrics.map(m => m.csatPct)),
      avgSlaAdherencePct: avg(withMetrics.map(m => m.slaAdherencePct)),
      totalTicketsResolved: withMetrics.reduce((s, m) => s + m.ticketsResolved, 0),
      ranking: this.ranking(),
    };
  }
}
