/**
 * PollManager — quick polls: single/multi-choice questions, one-vote-per-user
 * enforcement, live tallying, and closing with a winning option.
 *
 * Events:
 *   - "poll.created": { pollId, question, optionCount }
 *   - "poll.voted": { pollId, voterId }
 *   - "poll.closed": { pollId, winningOption, totalVotes }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PollStatus = "open" | "closed";

export interface PollOption {
  id: string;
  label: string;
  votes: number;
}

export interface Poll {
  id: string;
  question: string;
  multiSelect: boolean;
  status: PollStatus;
  options: PollOption[];
  voters: Set<string>;
  createdAt: string;
  closedAt?: string;
}

export interface PollSummary {
  totalPolls: number;
  open: number;
  closed: number;
  totalVotes: number;
  totalVoters: number;
}

export class PollManager {
  private polls: Map<string, Poll> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(question: string, optionLabels: string[], multiSelect = false): Poll | undefined {
    if (optionLabels.length < 2) return undefined;
    const poll: Poll = {
      id: randomUUID(),
      question,
      multiSelect,
      status: "open",
      options: optionLabels.map(l => ({ id: randomUUID(), label: l, votes: 0 })),
      voters: new Set(),
      createdAt: new Date().toISOString(),
    };
    this.polls.set(poll.id, poll);
    this.bus.publish("poll.created", { pollId: poll.id, question, optionCount: optionLabels.length });
    return poll;
  }

  vote(pollId: string, voterId: string, optionIds: string[]): Poll | undefined {
    const poll = this.polls.get(pollId);
    if (!poll || poll.status !== "open") return undefined;
    if (poll.voters.has(voterId)) return undefined;
    if (optionIds.length === 0 || (!poll.multiSelect && optionIds.length > 1)) return undefined;
    const valid = optionIds.filter(id => poll.options.some(o => o.id === id));
    if (valid.length !== optionIds.length) return undefined;
    for (const id of valid) {
      const opt = poll.options.find(o => o.id === id)!;
      opt.votes += 1;
    }
    poll.voters.add(voterId);
    this.bus.publish("poll.voted", { pollId, voterId });
    return poll;
  }

  results(pollId: string): { label: string; votes: number; pct: number }[] {
    const poll = this.polls.get(pollId);
    if (!poll) return [];
    const total = poll.options.reduce((s, o) => s + o.votes, 0);
    return poll.options.map(o => ({ label: o.label, votes: o.votes, pct: total > 0 ? Math.round((o.votes / total) * 100) : 0 }));
  }

  close(pollId: string, asOf: string): Poll | undefined {
    const poll = this.polls.get(pollId);
    if (!poll || poll.status !== "open") return undefined;
    poll.status = "closed";
    poll.closedAt = asOf;
    const winner = poll.options.reduce((w, o) => o.votes > w.votes ? o : w, poll.options[0]!);
    this.bus.publish("poll.closed", { pollId, winningOption: winner.label, totalVotes: poll.options.reduce((s, o) => s + o.votes, 0) });
    return poll;
  }

  getPoll(id: string): Poll | undefined { return this.polls.get(id); }
  listPolls(status?: PollStatus): Poll[] {
    const all = Array.from(this.polls.values());
    return status ? all.filter(p => p.status === status) : all;
  }

  summary(): PollSummary {
    const polls = Array.from(this.polls.values());
    return {
      totalPolls: polls.length,
      open: polls.filter(p => p.status === "open").length,
      closed: polls.filter(p => p.status === "closed").length,
      totalVotes: polls.reduce((s, p) => s + p.options.reduce((x, o) => x + o.votes, 0), 0),
      totalVoters: polls.reduce((s, p) => s + p.voters.size, 0),
    };
  }
}
