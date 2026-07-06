/**
 * BoardGovernance — board meeting management, director tracking, resolution
 * recording, committee oversight, and fiduciary compliance analytics.
 *
 * Events:
 *   - "governance.meeting_scheduled": { meetingId, type, scheduledAt, quorumRequired }
 *   - "governance.resolution_passed": { meetingId, resolutionId, title, voteFor, voteAgainst }
 *   - "governance.director_appointed": { directorId, name, role, effectiveAt }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type MeetingType = "board" | "agm" | "egm" | "committee" | "audit_committee" | "compensation_committee";
export type MeetingStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type DirectorRole = "chairman" | "ceo" | "independent" | "executive" | "nominee";
export type ResolutionStatus = "proposed" | "passed" | "failed" | "tabled";

export interface BoardDirector {
  id: string;
  name: string;
  role: DirectorRole;
  email: string;
  appointedAt: string;
  expiresAt?: string;
  committees: string[];
  active: boolean;
}

export interface BoardMeeting {
  id: string;
  type: MeetingType;
  status: MeetingStatus;
  scheduledAt: string;
  location: string;
  quorumRequired: number;
  attendees: string[]; // director IDs
  agendaItems: string[];
  minutesUrl?: string;
  createdAt: string;
}

export interface BoardResolution {
  id: string;
  meetingId: string;
  title: string;
  description: string;
  status: ResolutionStatus;
  voteFor: number;
  voteAgainst: number;
  voteAbstain: number;
  passedAt?: string;
}

export interface GovernanceSummary {
  totalDirectors: number;
  activeDirectors: number;
  totalMeetings: number;
  meetingsThisYear: number;
  totalResolutions: number;
  passedResolutions: number;
  avgAttendanceRate: number;
}

export class BoardGovernance {
  private directors: Map<string, BoardDirector> = new Map();
  private meetings: Map<string, BoardMeeting> = new Map();
  private resolutions: Map<string, BoardResolution> = new Map();

  constructor(private readonly bus: EventBus) {}

  appointDirector(input: Omit<BoardDirector, "id"> & { id?: string }): BoardDirector {
    const director: BoardDirector = { ...input, id: input.id ?? randomUUID() };
    this.directors.set(director.id, director);
    this.bus.publish("governance.director_appointed", { directorId: director.id, name: director.name, role: director.role, effectiveAt: director.appointedAt });
    return director;
  }

  scheduleMeeting(input: Omit<BoardMeeting, "id" | "createdAt"> & { id?: string }): BoardMeeting {
    const meeting: BoardMeeting = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.meetings.set(meeting.id, meeting);
    this.bus.publish("governance.meeting_scheduled", { meetingId: meeting.id, type: meeting.type, scheduledAt: meeting.scheduledAt, quorumRequired: meeting.quorumRequired });
    return meeting;
  }

  recordResolution(input: Omit<BoardResolution, "id"> & { id?: string }): BoardResolution | undefined {
    const meeting = this.meetings.get(input.meetingId);
    if (!meeting) return undefined;
    const resolution: BoardResolution = { ...input, id: input.id ?? randomUUID() };
    if (resolution.voteFor > resolution.voteAgainst) {
      resolution.status = "passed";
      resolution.passedAt = new Date().toISOString();
      this.bus.publish("governance.resolution_passed", { meetingId: input.meetingId, resolutionId: resolution.id, title: resolution.title, voteFor: resolution.voteFor, voteAgainst: resolution.voteAgainst });
    } else {
      resolution.status = "failed";
    }
    this.resolutions.set(resolution.id, resolution);
    return resolution;
  }

  getDirector(id: string): BoardDirector | undefined { return this.directors.get(id); }
  listDirectors(activeOnly = false): BoardDirector[] {
    const all = Array.from(this.directors.values());
    return activeOnly ? all.filter(d => d.active) : all;
  }
  listMeetings(status?: MeetingStatus): BoardMeeting[] {
    const all = Array.from(this.meetings.values());
    return status ? all.filter(m => m.status === status) : all;
  }
  listResolutions(meetingId?: string): BoardResolution[] {
    const all = Array.from(this.resolutions.values());
    return meetingId ? all.filter(r => r.meetingId === meetingId) : all;
  }

  summary(): GovernanceSummary {
    const directors = Array.from(this.directors.values());
    const meetings = Array.from(this.meetings.values());
    const resolutions = Array.from(this.resolutions.values());
    const thisYear = new Date().getFullYear().toString();
    const meetingsThisYear = meetings.filter(m => m.scheduledAt.startsWith(thisYear)).length;
    const totalAttendance = meetings.reduce((s, m) => s + m.attendees.length, 0);
    const activeCount = directors.filter(d => d.active).length;
    const avgAttendance = meetings.length > 0 && activeCount > 0
      ? Math.round((totalAttendance / meetings.length / activeCount) * 100)
      : 0;
    return {
      totalDirectors: directors.length,
      activeDirectors: activeCount,
      totalMeetings: meetings.length,
      meetingsThisYear,
      totalResolutions: resolutions.length,
      passedResolutions: resolutions.filter(r => r.status === "passed").length,
      avgAttendanceRate: avgAttendance,
    };
  }
}
