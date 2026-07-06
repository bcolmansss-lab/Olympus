/**
 * CSATManager — post-interaction customer satisfaction (CSAT) surveys: 1-5
 * ratings tied to tickets/agents, CSAT-% computation (4-5 = satisfied), and
 * low-score alerting for follow-up.
 *
 * Events:
 *   - "csat.response_received": { responseId, score, satisfied }
 *   - "csat.low_score": { responseId, agentId, score }
 *   - "csat.follow_up_needed": { responseId, customerId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type Channel = "email" | "chat" | "phone" | "self_service";

export interface CSATResponse {
  id: string;
  ticketRef: string;
  customerId: string;
  agentId: string;
  channel: Channel;
  score: number; // 1-5
  satisfied: boolean;
  comment?: string;
  respondedAt: string;
}

export interface CSATSummary {
  totalResponses: number;
  satisfied: number;
  csatPct: number;
  avgScore: number;
  lowScores: number;
  byChannel: Partial<Record<Channel, number>>;
}

export class CSATManager {
  private responses: Map<string, CSATResponse> = new Map();

  constructor(private readonly bus: EventBus) {}

  submit(input: { ticketRef: string; customerId: string; agentId: string; channel: Channel; score: number; comment?: string; respondedAt: string }): CSATResponse | undefined {
    if (input.score < 1 || input.score > 5) return undefined;
    const satisfied = input.score >= 4;
    const response: CSATResponse = { ...input, id: randomUUID(), satisfied };
    this.responses.set(response.id, response);
    this.bus.publish("csat.response_received", { responseId: response.id, score: input.score, satisfied });
    if (input.score <= 2) {
      this.bus.publish("csat.low_score", { responseId: response.id, agentId: input.agentId, score: input.score });
      this.bus.publish("csat.follow_up_needed", { responseId: response.id, customerId: input.customerId });
    }
    return response;
  }

  agentCsatPct(agentId: string): number {
    const responses = Array.from(this.responses.values()).filter(r => r.agentId === agentId);
    if (responses.length === 0) return 0;
    return Math.round((responses.filter(r => r.satisfied).length / responses.length) * 100);
  }

  getResponse(id: string): CSATResponse | undefined { return this.responses.get(id); }
  listResponses(agentId?: string, channel?: Channel): CSATResponse[] {
    let all = Array.from(this.responses.values());
    if (agentId) all = all.filter(r => r.agentId === agentId);
    if (channel) all = all.filter(r => r.channel === channel);
    return all;
  }

  summary(): CSATSummary {
    const responses = Array.from(this.responses.values());
    const satisfied = responses.filter(r => r.satisfied).length;
    const byChannel: Partial<Record<Channel, number>> = {};
    for (const r of responses) { byChannel[r.channel] = (byChannel[r.channel] ?? 0) + 1; }
    return {
      totalResponses: responses.length,
      satisfied,
      csatPct: responses.length > 0 ? Math.round((satisfied / responses.length) * 100) : 0,
      avgScore: responses.length > 0 ? Math.round((responses.reduce((s, r) => s + r.score, 0) / responses.length) * 100) / 100 : 0,
      lowScores: responses.filter(r => r.score <= 2).length,
      byChannel,
    };
  }
}
