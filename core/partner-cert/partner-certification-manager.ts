/**
 * PartnerCertificationManager — partner enablement: certification tracks with
 * required exams, partner progress, pass/fail scoring, and credential expiry.
 *
 * Events:
 *   - "partnercert.track_created": { trackId, name, examCount }
 *   - "partnercert.exam_passed": { partnerId, trackId, examId, score }
 *   - "partnercert.certified": { partnerId, trackId, expiresAt }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CertLevel = "associate" | "professional" | "expert";
export type EnrollmentState = "enrolled" | "certified" | "expired";

export interface CertExam {
  id: string;
  name: string;
  passingScore: number;
}

export interface CertTrack {
  id: string;
  name: string;
  level: CertLevel;
  exams: CertExam[];
  validityDays: number;
  createdAt: string;
}

export interface PartnerEnrollment {
  id: string;
  partnerId: string;
  trackId: string;
  state: EnrollmentState;
  passedExams: Map<string, number>; // examId -> score
  enrolledAt: string;
  certifiedAt?: string;
  expiresAt?: string;
}

export interface PartnerCertSummary {
  totalTracks: number;
  totalEnrollments: number;
  certified: number;
  expired: number;
  byLevel: Partial<Record<CertLevel, number>>;
}

export class PartnerCertificationManager {
  private tracks: Map<string, CertTrack> = new Map();
  private enrollments: Map<string, PartnerEnrollment> = new Map(); // key: `${partnerId}:${trackId}`

  constructor(private readonly bus: EventBus) {}

  private key(partnerId: string, trackId: string): string { return `${partnerId}:${trackId}`; }

  createTrack(name: string, level: CertLevel, exams: { name: string; passingScore: number }[], validityDays: number): CertTrack {
    const track: CertTrack = { id: randomUUID(), name, level, exams: exams.map(e => ({ id: randomUUID(), name: e.name, passingScore: e.passingScore })), validityDays, createdAt: new Date().toISOString() };
    this.tracks.set(track.id, track);
    this.bus.publish("partnercert.track_created", { trackId: track.id, name, examCount: exams.length });
    return track;
  }

  enroll(partnerId: string, trackId: string, asOf: string): PartnerEnrollment | undefined {
    const track = this.tracks.get(trackId);
    if (!track) return undefined;
    const k = this.key(partnerId, trackId);
    let enrollment = this.enrollments.get(k);
    if (!enrollment) {
      enrollment = { id: randomUUID(), partnerId, trackId, state: "enrolled", passedExams: new Map(), enrolledAt: asOf };
      this.enrollments.set(k, enrollment);
    }
    return enrollment;
  }

  submitExam(partnerId: string, trackId: string, examId: string, score: number, asOf: string): PartnerEnrollment | undefined {
    const track = this.tracks.get(trackId);
    const enrollment = this.enrollments.get(this.key(partnerId, trackId));
    if (!track || !enrollment) return undefined;
    const exam = track.exams.find(e => e.id === examId);
    if (!exam || score < exam.passingScore) return undefined;
    enrollment.passedExams.set(examId, score);
    this.bus.publish("partnercert.exam_passed", { partnerId, trackId, examId, score });
    if (track.exams.every(e => enrollment.passedExams.has(e.id)) && enrollment.state !== "certified") {
      enrollment.state = "certified";
      enrollment.certifiedAt = asOf;
      const exp = new Date(asOf);
      exp.setUTCDate(exp.getUTCDate() + track.validityDays);
      enrollment.expiresAt = exp.toISOString();
      this.bus.publish("partnercert.certified", { partnerId, trackId, expiresAt: enrollment.expiresAt });
    }
    return enrollment;
  }

  isCertified(partnerId: string, trackId: string, asOf: string): boolean {
    const enrollment = this.enrollments.get(this.key(partnerId, trackId));
    if (!enrollment || enrollment.state !== "certified" || !enrollment.expiresAt) return false;
    return new Date(asOf).getTime() <= new Date(enrollment.expiresAt).getTime();
  }

  checkExpiry(asOf: string): PartnerEnrollment[] {
    const cutoff = new Date(asOf).getTime();
    const expired = Array.from(this.enrollments.values()).filter(e => e.state === "certified" && e.expiresAt && new Date(e.expiresAt).getTime() < cutoff);
    for (const e of expired) e.state = "expired";
    return expired;
  }

  getTrack(id: string): CertTrack | undefined { return this.tracks.get(id); }
  getEnrollment(partnerId: string, trackId: string): PartnerEnrollment | undefined { return this.enrollments.get(this.key(partnerId, trackId)); }
  listTracks(level?: CertLevel): CertTrack[] {
    const all = Array.from(this.tracks.values());
    return level ? all.filter(t => t.level === level) : all;
  }
  listEnrollments(state?: EnrollmentState): PartnerEnrollment[] {
    const all = Array.from(this.enrollments.values());
    return state ? all.filter(e => e.state === state) : all;
  }

  summary(): PartnerCertSummary {
    const enrollments = Array.from(this.enrollments.values());
    const byLevel: Partial<Record<CertLevel, number>> = {};
    for (const e of enrollments) {
      if (e.state !== "certified") continue;
      const track = this.tracks.get(e.trackId);
      if (track) byLevel[track.level] = (byLevel[track.level] ?? 0) + 1;
    }
    return {
      totalTracks: this.tracks.size,
      totalEnrollments: enrollments.length,
      certified: enrollments.filter(e => e.state === "certified").length,
      expired: enrollments.filter(e => e.state === "expired").length,
      byLevel,
    };
  }
}
