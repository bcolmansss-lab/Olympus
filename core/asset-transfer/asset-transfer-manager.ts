/**
 * AssetTransferManager — inter-location asset transfers: transfer requests,
 * dispatch/receipt confirmation, in-transit tracking, and location ledger.
 *
 * Events:
 *   - "assettransfer.requested": { transferId, assetTag, fromLocation, toLocation }
 *   - "assettransfer.dispatched": { transferId, carrier }
 *   - "assettransfer.received": { transferId, condition }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type TransferState = "requested" | "in_transit" | "received" | "cancelled";
export type AssetCondition = "good" | "damaged" | "lost";

export interface AssetTransfer {
  id: string;
  assetTag: string;
  assetName: string;
  fromLocation: string;
  toLocation: string;
  state: TransferState;
  carrier?: string;
  condition?: AssetCondition;
  requestedBy: string;
  requestedAt: string;
  dispatchedAt?: string;
  receivedAt?: string;
}

export interface AssetTransferSummary {
  totalTransfers: number;
  inTransit: number;
  received: number;
  damaged: number;
  lost: number;
  byToLocation: Record<string, number>;
}

export class AssetTransferManager {
  private transfers: Map<string, AssetTransfer> = new Map();
  private currentLocation: Map<string, string> = new Map(); // assetTag -> location

  constructor(private readonly bus: EventBus) {}

  request(input: { assetTag: string; assetName: string; fromLocation: string; toLocation: string; requestedBy: string }): AssetTransfer | undefined {
    if (input.fromLocation === input.toLocation) return undefined;
    const transfer: AssetTransfer = { ...input, id: randomUUID(), state: "requested", requestedAt: new Date().toISOString() };
    this.transfers.set(transfer.id, transfer);
    if (!this.currentLocation.has(input.assetTag)) this.currentLocation.set(input.assetTag, input.fromLocation);
    this.bus.publish("assettransfer.requested", { transferId: transfer.id, assetTag: transfer.assetTag, fromLocation: transfer.fromLocation, toLocation: transfer.toLocation });
    return transfer;
  }

  dispatch(transferId: string, carrier: string, asOf: string): AssetTransfer | undefined {
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.state !== "requested") return undefined;
    transfer.state = "in_transit";
    transfer.carrier = carrier;
    transfer.dispatchedAt = asOf;
    this.bus.publish("assettransfer.dispatched", { transferId, carrier });
    return transfer;
  }

  receive(transferId: string, condition: AssetCondition, asOf: string): AssetTransfer | undefined {
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.state !== "in_transit") return undefined;
    transfer.state = "received";
    transfer.condition = condition;
    transfer.receivedAt = asOf;
    if (condition !== "lost") this.currentLocation.set(transfer.assetTag, transfer.toLocation);
    this.bus.publish("assettransfer.received", { transferId, condition });
    return transfer;
  }

  cancel(transferId: string): AssetTransfer | undefined {
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.state === "received") return undefined;
    transfer.state = "cancelled";
    return transfer;
  }

  locationOf(assetTag: string): string | undefined { return this.currentLocation.get(assetTag); }
  getTransfer(id: string): AssetTransfer | undefined { return this.transfers.get(id); }
  listTransfers(state?: TransferState): AssetTransfer[] {
    const all = Array.from(this.transfers.values());
    return state ? all.filter(t => t.state === state) : all;
  }

  summary(): AssetTransferSummary {
    const transfers = Array.from(this.transfers.values());
    const byToLocation: Record<string, number> = {};
    for (const t of transfers) { byToLocation[t.toLocation] = (byToLocation[t.toLocation] ?? 0) + 1; }
    return {
      totalTransfers: transfers.length,
      inTransit: transfers.filter(t => t.state === "in_transit").length,
      received: transfers.filter(t => t.state === "received").length,
      damaged: transfers.filter(t => t.condition === "damaged").length,
      lost: transfers.filter(t => t.condition === "lost").length,
      byToLocation,
    };
  }
}
