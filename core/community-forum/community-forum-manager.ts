/**
 * CommunityForumManager — community discussion forum: thread creation with
 * categories, replies with accepted-answer marking, flag-based moderation
 * with lock/remove actions, and activity reporting.
 *
 * Events:
 *   - "forum.thread_created": { threadId, category }
 *   - "forum.answer_accepted": { threadId, replyId }
 *   - "forum.thread_moderated": { threadId, action }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ThreadStatus = "open" | "answered" | "locked" | "removed";

export interface ForumReply {
  id: string;
  authorId: string;
  body: string;
  accepted: boolean;
  postedAt: string;
}

export interface ForumThread {
  id: string;
  authorId: string;
  category: string;
  title: string;
  status: ThreadStatus;
  replies: ForumReply[];
  flags: number;
  createdAt: string;
}

export interface CommunityForumSummary {
  totalThreads: number;
  answered: number;
  answerRatePct: number;
  totalReplies: number;
  flaggedThreads: number;
}

export class CommunityForumManager {
  private threads: Map<string, ForumThread> = new Map();
  private flagThreshold: number;

  constructor(private readonly bus: EventBus, flagThreshold = 3) {
    this.flagThreshold = flagThreshold;
  }

  createThread(authorId: string, category: string, title: string, createdAt: string): ForumThread {
    const thread: ForumThread = { id: randomUUID(), authorId, category, title, status: "open", replies: [], flags: 0, createdAt };
    this.threads.set(thread.id, thread);
    this.bus.publish("forum.thread_created", { threadId: thread.id, category });
    return thread;
  }

  reply(threadId: string, authorId: string, body: string, postedAt: string): ForumReply | undefined {
    const thread = this.threads.get(threadId);
    if (!thread || (thread.status !== "open" && thread.status !== "answered")) return undefined;
    const r: ForumReply = { id: randomUUID(), authorId, body, accepted: false, postedAt };
    thread.replies.push(r);
    return r;
  }

  /** Thread author accepts a reply as the answer. */
  acceptAnswer(threadId: string, replyId: string): ForumThread | undefined {
    const thread = this.threads.get(threadId);
    if (!thread || thread.status !== "open") return undefined;
    const reply = thread.replies.find(r => r.id === replyId);
    if (!reply) return undefined;
    reply.accepted = true;
    thread.status = "answered";
    this.bus.publish("forum.answer_accepted", { threadId, replyId });
    return thread;
  }

  /** Flag a thread; hitting the threshold locks it pending moderation. */
  flag(threadId: string): ForumThread | undefined {
    const thread = this.threads.get(threadId);
    if (!thread || thread.status === "removed") return undefined;
    thread.flags += 1;
    if (thread.flags >= this.flagThreshold && thread.status !== "locked") {
      thread.status = "locked";
      this.bus.publish("forum.thread_moderated", { threadId, action: "locked" });
    }
    return thread;
  }

  /** Moderator resolution: restore a locked thread or remove it. */
  moderate(threadId: string, action: "restore" | "remove"): ForumThread | undefined {
    const thread = this.threads.get(threadId);
    if (!thread || thread.status !== "locked") return undefined;
    if (action === "restore") {
      thread.status = "open";
      thread.flags = 0;
    } else {
      thread.status = "removed";
      this.bus.publish("forum.thread_moderated", { threadId, action: "removed" });
    }
    return thread;
  }

  getThread(id: string): ForumThread | undefined { return this.threads.get(id); }
  listThreads(category?: string, status?: ThreadStatus): ForumThread[] {
    let all = Array.from(this.threads.values());
    if (category) all = all.filter(t => t.category === category);
    if (status) all = all.filter(t => t.status === status);
    return all;
  }

  summary(): CommunityForumSummary {
    const threads = Array.from(this.threads.values()).filter(t => t.status !== "removed");
    const answered = threads.filter(t => t.status === "answered").length;
    return {
      totalThreads: threads.length,
      answered,
      answerRatePct: threads.length > 0 ? Math.round((answered / threads.length) * 100) : 0,
      totalReplies: threads.reduce((s, t) => s + t.replies.length, 0),
      flaggedThreads: threads.filter(t => t.flags > 0).length,
    };
  }
}
