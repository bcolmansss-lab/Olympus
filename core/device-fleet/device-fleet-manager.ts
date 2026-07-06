/**
 * DeviceFleetManager — IoT device fleet: device enrollment with model and
 * site, heartbeat ingestion with battery/firmware state, staleness-based
 * offline detection, decommissioning, and fleet health reporting.
 *
 * Events:
 *   - "devices.enrolled": { deviceId, model, site }
 *   - "devices.offline": { deviceId, lastSeenAt }
 *   - "devices.low_battery": { deviceId, batteryPct }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type DeviceStatus = "online" | "offline" | "decommissioned";

export interface FleetDevice {
  id: string;
  model: string;
  site: string;
  status: DeviceStatus;
  firmwareVersion: string;
  batteryPct: number;
  lastSeenAt: string;
}

export interface DeviceFleetSummary {
  totalDevices: number;
  online: number;
  offline: number;
  lowBattery: number;
  bySite: Record<string, number>;
}

export class DeviceFleetManager {
  private devices: Map<string, FleetDevice> = new Map();
  private lowBatteryPct: number;

  constructor(private readonly bus: EventBus, lowBatteryPct = 20) {
    this.lowBatteryPct = lowBatteryPct;
  }

  enroll(model: string, site: string, firmwareVersion: string, enrolledAt: string): FleetDevice {
    const device: FleetDevice = { id: randomUUID(), model, site, status: "online", firmwareVersion, batteryPct: 100, lastSeenAt: enrolledAt };
    this.devices.set(device.id, device);
    this.bus.publish("devices.enrolled", { deviceId: device.id, model, site });
    return device;
  }

  /** Ingest a heartbeat; crossing the low-battery threshold publishes once per crossing. */
  heartbeat(deviceId: string, batteryPct: number, firmwareVersion: string, seenAt: string): FleetDevice | undefined {
    const device = this.devices.get(deviceId);
    if (!device || device.status === "decommissioned") return undefined;
    const wasLow = device.batteryPct <= this.lowBatteryPct;
    device.batteryPct = batteryPct;
    device.firmwareVersion = firmwareVersion;
    device.lastSeenAt = seenAt;
    device.status = "online";
    if (!wasLow && batteryPct <= this.lowBatteryPct) {
      this.bus.publish("devices.low_battery", { deviceId, batteryPct });
    }
    return device;
  }

  /** Mark online devices unseen for more than maxSilenceMinutes as offline. */
  sweepOffline(asOf: string, maxSilenceMinutes: number): FleetDevice[] {
    const cutoff = new Date(asOf).getTime() - maxSilenceMinutes * 60000;
    const flagged: FleetDevice[] = [];
    for (const d of this.devices.values()) {
      if (d.status === "online" && new Date(d.lastSeenAt).getTime() < cutoff) {
        d.status = "offline";
        flagged.push(d);
        this.bus.publish("devices.offline", { deviceId: d.id, lastSeenAt: d.lastSeenAt });
      }
    }
    return flagged;
  }

  decommission(deviceId: string): FleetDevice | undefined {
    const device = this.devices.get(deviceId);
    if (!device || device.status === "decommissioned") return undefined;
    device.status = "decommissioned";
    return device;
  }

  getDevice(id: string): FleetDevice | undefined { return this.devices.get(id); }
  listDevices(status?: DeviceStatus, site?: string): FleetDevice[] {
    let all = Array.from(this.devices.values());
    if (status) all = all.filter(d => d.status === status);
    if (site) all = all.filter(d => d.site === site);
    return all;
  }
  /** Devices running a firmware version other than the given target. */
  outdatedDevices(targetVersion: string): FleetDevice[] {
    return Array.from(this.devices.values()).filter(d => d.status !== "decommissioned" && d.firmwareVersion !== targetVersion);
  }

  summary(): DeviceFleetSummary {
    const devices = Array.from(this.devices.values()).filter(d => d.status !== "decommissioned");
    const bySite: Record<string, number> = {};
    for (const d of devices) { bySite[d.site] = (bySite[d.site] ?? 0) + 1; }
    return {
      totalDevices: devices.length,
      online: devices.filter(d => d.status === "online").length,
      offline: devices.filter(d => d.status === "offline").length,
      lowBattery: devices.filter(d => d.batteryPct <= this.lowBatteryPct).length,
      bySite,
    };
  }
}
