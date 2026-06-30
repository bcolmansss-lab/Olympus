/**
 * DealRoomManager — secure virtual deal rooms: document sharing with buyer/seller
 * access, view tracking, and engagement analytics (who viewed what).
 *
 * Events:
 *   - "dealroom.created": { roomId, dealId }
 *   - "dealroom.document_added": { roomId, documentId, name }
 *   - "dealroom.viewed": { roomId, documentId, viewerId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type RoomStatus = "active" | "archived";

export interface DealDocument {
  id: string;
  name: string;
  category: string;
  views: number;
  uniqueViewers: Set<string>;
  addedAt: string;
}

export interface DealRoom {
  id: string;
  dealId: string;
  buyerOrg: string;
  status: RoomStatus;
  members: Set<string>;
  documents: Map<string, DealDocument>;
  createdAt: string;
}

export interface DealRoomSummary {
  totalRooms: number;
  active: number;
  totalDocuments: number;
  totalViews: number;
  avgEngagementScore: number;
}

export class DealRoomManager {
  private rooms: Map<string, DealRoom> = new Map();

  constructor(private readonly bus: EventBus) {}

  create(dealId: string, buyerOrg: string): DealRoom {
    const room: DealRoom = { id: randomUUID(), dealId, buyerOrg, status: "active", members: new Set(), documents: new Map(), createdAt: new Date().toISOString() };
    this.rooms.set(room.id, room);
    this.bus.publish("dealroom.created", { roomId: room.id, dealId });
    return room;
  }

  addMember(roomId: string, memberId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== "active") return false;
    room.members.add(memberId);
    return true;
  }

  addDocument(roomId: string, name: string, category: string): DealDocument | undefined {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== "active") return undefined;
    const doc: DealDocument = { id: randomUUID(), name, category, views: 0, uniqueViewers: new Set(), addedAt: new Date().toISOString() };
    room.documents.set(doc.id, doc);
    this.bus.publish("dealroom.document_added", { roomId, documentId: doc.id, name });
    return doc;
  }

  recordView(roomId: string, documentId: string, viewerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const doc = room.documents.get(documentId);
    if (!doc) return false;
    doc.views += 1;
    doc.uniqueViewers.add(viewerId);
    this.bus.publish("dealroom.viewed", { roomId, documentId, viewerId });
    return true;
  }

  /** Engagement: unique viewers across docs relative to members. */
  engagementScore(roomId: string): number {
    const room = this.rooms.get(roomId);
    if (!room || room.documents.size === 0 || room.members.size === 0) return 0;
    const viewers = new Set<string>();
    for (const doc of room.documents.values()) for (const v of doc.uniqueViewers) viewers.add(v);
    return Math.round((viewers.size / room.members.size) * 100);
  }

  archive(roomId: string): DealRoom | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    room.status = "archived";
    return room;
  }

  getRoom(id: string): DealRoom | undefined { return this.rooms.get(id); }
  listRooms(status?: RoomStatus): DealRoom[] {
    const all = Array.from(this.rooms.values());
    return status ? all.filter(r => r.status === status) : all;
  }

  summary(): DealRoomSummary {
    const rooms = Array.from(this.rooms.values());
    const docs = rooms.flatMap(r => Array.from(r.documents.values()));
    const avgEngagement = rooms.length > 0 ? Math.round(rooms.reduce((s, r) => s + this.engagementScore(r.id), 0) / rooms.length) : 0;
    return {
      totalRooms: rooms.length,
      active: rooms.filter(r => r.status === "active").length,
      totalDocuments: docs.length,
      totalViews: docs.reduce((s, d) => s + d.views, 0),
      avgEngagementScore: avgEngagement,
    };
  }
}
