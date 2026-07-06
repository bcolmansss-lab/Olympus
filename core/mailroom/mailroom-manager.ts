/**
 * MailroomManager — inbound package handling: intake with carrier and
 * recipient logging, pickup notification, recipient pickup with signature,
 * stale-package flagging, and volume reporting.
 *
 * Events:
 *   - "mailroom.package_received": { packageId, recipientId, carrier }
 *   - "mailroom.picked_up": { packageId, recipientId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type PackageStatus = "received" | "notified" | "picked_up" | "returned_to_sender";

export interface InboundPackage {
  id: string;
  recipientId: string;
  carrier: string;
  trackingRef: string;
  status: PackageStatus;
  receivedAt: string;
  pickedUpAt?: string;
  signature?: string;
}

export interface MailroomSummary {
  totalPackages: number;
  awaitingPickup: number;
  pickedUp: number;
  avgPickupHours: number;
  byCarrier: Record<string, number>;
}

export class MailroomManager {
  private packages: Map<string, InboundPackage> = new Map();

  constructor(private readonly bus: EventBus) {}

  receive(recipientId: string, carrier: string, trackingRef: string, receivedAt: string): InboundPackage {
    const pkg: InboundPackage = { id: randomUUID(), recipientId, carrier, trackingRef, status: "received", receivedAt };
    this.packages.set(pkg.id, pkg);
    this.bus.publish("mailroom.package_received", { packageId: pkg.id, recipientId, carrier });
    return pkg;
  }

  notify(packageId: string): InboundPackage | undefined {
    const pkg = this.packages.get(packageId);
    if (!pkg || pkg.status !== "received") return undefined;
    pkg.status = "notified";
    return pkg;
  }

  pickup(packageId: string, signature: string, pickedUpAt: string): InboundPackage | undefined {
    const pkg = this.packages.get(packageId);
    if (!pkg || (pkg.status !== "received" && pkg.status !== "notified")) return undefined;
    pkg.status = "picked_up";
    pkg.signature = signature;
    pkg.pickedUpAt = pickedUpAt;
    this.bus.publish("mailroom.picked_up", { packageId, recipientId: pkg.recipientId });
    return pkg;
  }

  returnToSender(packageId: string): InboundPackage | undefined {
    const pkg = this.packages.get(packageId);
    if (!pkg || pkg.status === "picked_up" || pkg.status === "returned_to_sender") return undefined;
    pkg.status = "returned_to_sender";
    return pkg;
  }

  /** Packages waiting longer than maxHours as of the given time. */
  stalePackages(asOf: string, maxHours: number): InboundPackage[] {
    const cutoff = new Date(asOf).getTime() - maxHours * 3600000;
    return Array.from(this.packages.values()).filter(
      p => (p.status === "received" || p.status === "notified") && new Date(p.receivedAt).getTime() < cutoff,
    );
  }

  getPackage(id: string): InboundPackage | undefined { return this.packages.get(id); }
  listPackages(status?: PackageStatus, recipientId?: string): InboundPackage[] {
    let all = Array.from(this.packages.values());
    if (status) all = all.filter(p => p.status === status);
    if (recipientId) all = all.filter(p => p.recipientId === recipientId);
    return all;
  }

  summary(): MailroomSummary {
    const pkgs = Array.from(this.packages.values());
    const picked = pkgs.filter(p => p.status === "picked_up" && p.pickedUpAt);
    const byCarrier: Record<string, number> = {};
    for (const p of pkgs) { byCarrier[p.carrier] = (byCarrier[p.carrier] ?? 0) + 1; }
    const totalHours = picked.reduce((s, p) => s + (new Date(p.pickedUpAt!).getTime() - new Date(p.receivedAt).getTime()) / 3600000, 0);
    return {
      totalPackages: pkgs.length,
      awaitingPickup: pkgs.filter(p => p.status === "received" || p.status === "notified").length,
      pickedUp: picked.length,
      avgPickupHours: picked.length > 0 ? Math.round((totalHours / picked.length) * 100) / 100 : 0,
      byCarrier,
    };
  }
}
