/**
 * NewsletterManager — email newsletter operations: subscriber management with
 * unsubscribe handling, issue drafting and sending to active subscribers,
 * open/click logging, and engagement-rate reporting.
 *
 * Events:
 *   - "newsletter.subscribed": { email }
 *   - "newsletter.issue_sent": { issueId, recipients }
 *   - "newsletter.unsubscribed": { email }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type NewsletterIssueStatus = "draft" | "sent";

export interface NewsletterIssue {
  id: string;
  subject: string;
  status: NewsletterIssueStatus;
  recipients: number;
  opens: number;
  clicks: number;
  sentAt?: string;
}

export interface NewsletterSummary {
  activeSubscribers: number;
  unsubscribed: number;
  issuesSent: number;
  avgOpenRatePct: number;
  avgClickRatePct: number;
}

export class NewsletterManager {
  private subscribers: Map<string, { active: boolean }> = new Map();
  private issues: Map<string, NewsletterIssue> = new Map();

  constructor(private readonly bus: EventBus) {}

  subscribe(email: string): boolean {
    const key = email.toLowerCase();
    const existing = this.subscribers.get(key);
    if (existing?.active) return false;
    this.subscribers.set(key, { active: true });
    this.bus.publish("newsletter.subscribed", { email: key });
    return true;
  }

  unsubscribe(email: string): boolean {
    const key = email.toLowerCase();
    const existing = this.subscribers.get(key);
    if (!existing || !existing.active) return false;
    existing.active = false;
    this.bus.publish("newsletter.unsubscribed", { email: key });
    return true;
  }

  draftIssue(subject: string): NewsletterIssue {
    const issue: NewsletterIssue = { id: randomUUID(), subject, status: "draft", recipients: 0, opens: 0, clicks: 0 };
    this.issues.set(issue.id, issue);
    return issue;
  }

  /** Send a draft to all active subscribers. */
  sendIssue(issueId: string, sentAt: string): NewsletterIssue | undefined {
    const issue = this.issues.get(issueId);
    if (!issue || issue.status !== "sent" && issue.status !== "draft" || issue.status === "sent") return undefined;
    const recipients = Array.from(this.subscribers.values()).filter(s => s.active).length;
    if (recipients === 0) return undefined;
    issue.status = "sent";
    issue.recipients = recipients;
    issue.sentAt = sentAt;
    this.bus.publish("newsletter.issue_sent", { issueId, recipients });
    return issue;
  }

  logOpen(issueId: string, count = 1): NewsletterIssue | undefined {
    const issue = this.issues.get(issueId);
    if (!issue || issue.status !== "sent" || count <= 0) return undefined;
    issue.opens = Math.min(issue.recipients, issue.opens + count);
    return issue;
  }

  logClick(issueId: string, count = 1): NewsletterIssue | undefined {
    const issue = this.issues.get(issueId);
    if (!issue || issue.status !== "sent" || count <= 0) return undefined;
    issue.clicks = Math.min(issue.opens, issue.clicks + count);
    return issue;
  }

  isSubscribed(email: string): boolean { return this.subscribers.get(email.toLowerCase())?.active ?? false; }
  getIssue(id: string): NewsletterIssue | undefined { return this.issues.get(id); }
  listIssues(status?: NewsletterIssueStatus): NewsletterIssue[] {
    const all = Array.from(this.issues.values());
    return status ? all.filter(i => i.status === status) : all;
  }

  summary(): NewsletterSummary {
    const subs = Array.from(this.subscribers.values());
    const sent = Array.from(this.issues.values()).filter(i => i.status === "sent");
    const openRates = sent.filter(i => i.recipients > 0).map(i => i.opens / i.recipients);
    const clickRates = sent.filter(i => i.recipients > 0).map(i => i.clicks / i.recipients);
    const avg = (xs: number[]) => (xs.length > 0 ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 100) : 0);
    return {
      activeSubscribers: subs.filter(s => s.active).length,
      unsubscribed: subs.filter(s => !s.active).length,
      issuesSent: sent.length,
      avgOpenRatePct: avg(openRates),
      avgClickRatePct: avg(clickRates),
    };
  }
}
