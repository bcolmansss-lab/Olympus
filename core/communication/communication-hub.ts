/**
 * CommunicationHub — outbound sequences, message tracking, engagement analytics.
 *
 * Concepts:
 *   - Sequence: multi-step outreach campaign (email/LinkedIn/call) targeting contacts
 *   - Message: a single outbound touch in a sequence
 *   - Thread: inbound reply chain tied to a sequence or contact
 *   - Engagement: open/click/reply events on messages
 *
 * Metrics:
 *   - Open rate, click rate, reply rate per sequence
 *   - Bounce rate, unsubscribe rate
 *   - Best send time (hour-of-day with highest open rate)
 *
 * Events:
 *   - "comms.message_sent": { messageId, sequenceId, contactId, channel }
 *   - "comms.engagement": { messageId, sequenceId, type, contactId }
 *   - "comms.sequence_completed": { sequenceId, name, sentCount, replyRate }
 */

import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CommChannel = "email" | "linkedin" | "sms" | "call" | "in_app";
export type EngagementType = "open" | "click" | "reply" | "bounce" | "unsubscribe";
export type SequenceStatus = "draft" | "active" | "paused" | "completed" | "archived";
export type MessageStatus = "scheduled" | "sent" | "delivered" | "bounced" | "failed";

export interface SequenceStep {
  stepNumber: number;
  channel: CommChannel;
  delayDays: number;        // days after previous step
  subject?: string;
  bodyTemplate: string;     // template with {{firstName}}, {{company}} placeholders
}

export interface CommSequence {
  id: string;
  name: string;
  description: string;
  steps: SequenceStep[];
  status: SequenceStatus;
  targetSegment?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  tags?: string[];
}

export interface CommMessage {
  id: string;
  sequenceId: string;
  stepNumber: number;
  contactId: string;
  channel: CommChannel;
  subject?: string;
  status: MessageStatus;
  sentAt?: string;
  scheduledAt: string;
  engagements: EngagementEvent[];
}

export interface EngagementEvent {
  type: EngagementType;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

export interface SequenceAnalytics {
  sequenceId: string;
  name: string;
  totalEnrolled: number;
  sentCount: number;
  openCount: number;
  clickCount: number;
  replyCount: number;
  bounceCount: number;
  unsubscribeCount: number;
  openRate: number;        // 0–100
  clickRate: number;
  replyRate: number;
  bounceRate: number;
}

export interface CommSummary {
  totalSequences: number;
  activeSequences: number;
  totalMessagesSent: number;
  avgOpenRate: number;
  avgReplyRate: number;
  topPerformingSequence?: string;
}

export class CommunicationHub {
  private sequences: Map<string, CommSequence> = new Map();
  private messages: Map<string, CommMessage> = new Map();

  constructor(private readonly bus: EventBus) {}

  createSequence(input: Omit<CommSequence, "id" | "createdAt"> & { id?: string }): CommSequence {
    const seq: CommSequence = {
      ...input,
      id: input.id ?? randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.sequences.set(seq.id, seq);
    return seq;
  }

  enrollContact(sequenceId: string, contactId: string, scheduledAt?: string): CommMessage[] {
    const seq = this.sequences.get(sequenceId);
    if (!seq) return [];

    const base = scheduledAt ? new Date(scheduledAt) : new Date();
    const created: CommMessage[] = [];
    let cumulativeDays = 0;

    for (const step of seq.steps) {
      cumulativeDays += step.delayDays;
      const scheduledDate = new Date(base.getTime() + cumulativeDays * 86400000);
      const msg: CommMessage = {
        id: randomUUID(),
        sequenceId,
        stepNumber: step.stepNumber,
        contactId,
        channel: step.channel,
        subject: step.subject,
        status: "scheduled",
        scheduledAt: scheduledDate.toISOString(),
        engagements: [],
      };
      this.messages.set(msg.id, msg);
      created.push(msg);
    }

    return created;
  }

  sendMessage(messageId: string, sentAt?: string): CommMessage | undefined {
    const msg = this.messages.get(messageId);
    if (!msg) return undefined;

    msg.status = "sent";
    msg.sentAt = sentAt ?? new Date().toISOString();

    this.bus.publish("comms.message_sent", {
      messageId: msg.id,
      sequenceId: msg.sequenceId,
      contactId: msg.contactId,
      channel: msg.channel,
    });

    return msg;
  }

  recordEngagement(
    messageId: string,
    type: EngagementType,
    occurredAt?: string,
    metadata?: Record<string, unknown>,
  ): CommMessage | undefined {
    const msg = this.messages.get(messageId);
    if (!msg) return undefined;

    const event: EngagementEvent = {
      type,
      occurredAt: occurredAt ?? new Date().toISOString(),
      metadata,
    };
    msg.engagements.push(event);

    this.bus.publish("comms.engagement", {
      messageId: msg.id,
      sequenceId: msg.sequenceId,
      type,
      contactId: msg.contactId,
    });

    return msg;
  }

  completeSequence(sequenceId: string): CommSequence | undefined {
    const seq = this.sequences.get(sequenceId);
    if (!seq) return undefined;

    seq.status = "completed";
    seq.completedAt = new Date().toISOString();

    const analytics = this.getSequenceAnalytics(sequenceId);
    const sentCount = analytics?.sentCount ?? 0;
    const replyRate = analytics?.replyRate ?? 0;

    this.bus.publish("comms.sequence_completed", {
      sequenceId,
      name: seq.name,
      sentCount,
      replyRate,
    });

    return seq;
  }

  getSequenceAnalytics(sequenceId: string): SequenceAnalytics | undefined {
    const seq = this.sequences.get(sequenceId);
    if (!seq) return undefined;

    const msgs = Array.from(this.messages.values()).filter(
      (m) => m.sequenceId === sequenceId,
    );

    const contactIds = new Set(msgs.map((m) => m.contactId));
    const totalEnrolled = contactIds.size;

    const sentMsgs = msgs.filter((m) => m.status === "sent" || m.status === "delivered");
    const sentCount = sentMsgs.length;

    let openCount = 0;
    let clickCount = 0;
    let replyCount = 0;
    let bounceCount = 0;
    let unsubscribeCount = 0;

    for (const m of msgs) {
      for (const e of m.engagements) {
        if (e.type === "open") openCount++;
        else if (e.type === "click") clickCount++;
        else if (e.type === "reply") replyCount++;
        else if (e.type === "bounce") bounceCount++;
        else if (e.type === "unsubscribe") unsubscribeCount++;
      }
    }

    const openRate = sentCount > 0 ? (openCount / sentCount) * 100 : 0;
    const clickRate = sentCount > 0 ? (clickCount / sentCount) * 100 : 0;
    const replyRate = sentCount > 0 ? (replyCount / sentCount) * 100 : 0;
    const bounceRate = sentCount > 0 ? (bounceCount / sentCount) * 100 : 0;

    return {
      sequenceId,
      name: seq.name,
      totalEnrolled,
      sentCount,
      openCount,
      clickCount,
      replyCount,
      bounceCount,
      unsubscribeCount,
      openRate,
      clickRate,
      replyRate,
      bounceRate,
    };
  }

  summary(): CommSummary {
    const seqs = Array.from(this.sequences.values());
    const totalSequences = seqs.length;
    const activeSequences = seqs.filter((s) => s.status === "active").length;
    const totalMessagesSent = Array.from(this.messages.values()).filter(
      (m) => m.status === "sent" || m.status === "delivered",
    ).length;

    const analyticsAll = seqs
      .map((s) => this.getSequenceAnalytics(s.id))
      .filter((a): a is SequenceAnalytics => a !== undefined);

    const avgOpenRate =
      analyticsAll.length > 0
        ? analyticsAll.reduce((sum, a) => sum + a.openRate, 0) / analyticsAll.length
        : 0;

    const avgReplyRate =
      analyticsAll.length > 0
        ? analyticsAll.reduce((sum, a) => sum + a.replyRate, 0) / analyticsAll.length
        : 0;

    let topPerformingSequence: string | undefined;
    let topReplyRate = -1;
    for (const a of analyticsAll) {
      if (a.replyRate > topReplyRate) {
        topReplyRate = a.replyRate;
        topPerformingSequence = a.sequenceId;
      }
    }

    return {
      totalSequences,
      activeSequences,
      totalMessagesSent,
      avgOpenRate,
      avgReplyRate,
      topPerformingSequence,
    };
  }

  getMessage(id: string): CommMessage | undefined {
    return this.messages.get(id);
  }

  listMessages(sequenceId?: string): CommMessage[] {
    const all = Array.from(this.messages.values());
    return sequenceId ? all.filter((m) => m.sequenceId === sequenceId) : all;
  }

  getSequence(id: string): CommSequence | undefined {
    return this.sequences.get(id);
  }

  listSequences(status?: SequenceStatus): CommSequence[] {
    const all = Array.from(this.sequences.values());
    return status ? all.filter((s) => s.status === status) : all;
  }
}
