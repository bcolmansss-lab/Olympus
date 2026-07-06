/**
 * SpeakerBureauManager — expert speaker program: speaker roster with topics
 * and fee expectations, engagement requests from event organizers, topic-based
 * matching and booking with date-conflict prevention, and delivery tracking.
 *
 * Events:
 *   - "speakers.requested": { requestId, topic, eventDate }
 *   - "speakers.booked": { requestId, speakerId }
 *   - "speakers.delivered": { requestId, speakerId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type SpeakingRequestStatus = "requested" | "booked" | "delivered" | "declined";

export interface Speaker {
  id: string;
  name: string;
  topics: string[];
  feeUsd: number;
}

export interface SpeakingRequest {
  id: string;
  eventName: string;
  topic: string;
  eventDate: string;
  budgetUsd: number;
  status: SpeakingRequestStatus;
  speakerId?: string;
}

export interface SpeakerBureauSummary {
  totalSpeakers: number;
  totalRequests: number;
  booked: number;
  delivered: number;
  totalFeesUsd: number;
}

export class SpeakerBureauManager {
  private speakers: Map<string, Speaker> = new Map();
  private requests: Map<string, SpeakingRequest> = new Map();

  constructor(private readonly bus: EventBus) {}

  addSpeaker(name: string, topics: string[], feeUsd: number): Speaker {
    const speaker: Speaker = { id: randomUUID(), name, topics: topics.map(t => t.toLowerCase()), feeUsd };
    this.speakers.set(speaker.id, speaker);
    return speaker;
  }

  request(eventName: string, topic: string, eventDate: string, budgetUsd: number): SpeakingRequest {
    const req: SpeakingRequest = { id: randomUUID(), eventName, topic: topic.toLowerCase(), eventDate, budgetUsd, status: "requested" };
    this.requests.set(req.id, req);
    this.bus.publish("speakers.requested", { requestId: req.id, topic: req.topic, eventDate });
    return req;
  }

  /** Speakers covering the topic, within budget, and free on the date. */
  candidatesFor(requestId: string): Speaker[] {
    const req = this.requests.get(requestId);
    if (!req) return [];
    const busyOn = new Set(
      Array.from(this.requests.values())
        .filter(r => r.speakerId && r.eventDate === req.eventDate && (r.status === "booked" || r.status === "delivered"))
        .map(r => r.speakerId),
    );
    return Array.from(this.speakers.values()).filter(
      s => s.topics.includes(req.topic) && s.feeUsd <= req.budgetUsd && !busyOn.has(s.id),
    );
  }

  /** Book the cheapest available candidate; declines when none exists. */
  book(requestId: string): SpeakingRequest | undefined {
    const req = this.requests.get(requestId);
    if (!req || req.status !== "requested") return undefined;
    const candidates = this.candidatesFor(requestId).sort((a, b) => a.feeUsd - b.feeUsd);
    const speaker = candidates[0];
    if (!speaker) {
      req.status = "declined";
      return req;
    }
    req.status = "booked";
    req.speakerId = speaker.id;
    this.bus.publish("speakers.booked", { requestId, speakerId: speaker.id });
    return req;
  }

  markDelivered(requestId: string): SpeakingRequest | undefined {
    const req = this.requests.get(requestId);
    if (!req || req.status !== "booked" || !req.speakerId) return undefined;
    req.status = "delivered";
    this.bus.publish("speakers.delivered", { requestId, speakerId: req.speakerId });
    return req;
  }

  getRequest(id: string): SpeakingRequest | undefined { return this.requests.get(id); }
  getSpeaker(id: string): Speaker | undefined { return this.speakers.get(id); }
  listRequests(status?: SpeakingRequestStatus): SpeakingRequest[] {
    const all = Array.from(this.requests.values());
    return status ? all.filter(r => r.status === status) : all;
  }

  summary(): SpeakerBureauSummary {
    const requests = Array.from(this.requests.values());
    const withFees = requests.filter(r => (r.status === "booked" || r.status === "delivered") && r.speakerId);
    const fees = withFees.reduce((s, r) => s + (this.speakers.get(r.speakerId!)?.feeUsd ?? 0), 0);
    return {
      totalSpeakers: this.speakers.size,
      totalRequests: requests.length,
      booked: requests.filter(r => r.status === "booked").length,
      delivered: requests.filter(r => r.status === "delivered").length,
      totalFeesUsd: Math.round(fees * 100) / 100,
    };
  }
}
