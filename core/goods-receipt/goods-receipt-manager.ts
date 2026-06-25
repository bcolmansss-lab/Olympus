/**
 * GoodsReceiptManager — receiving against purchase orders: expected vs received
 * quantity reconciliation, partial/over receipts, and discrepancy flagging.
 *
 * Events:
 *   - "goodsreceipt.po_registered": { poId, lineCount, expectedUnits }
 *   - "goodsreceipt.received": { receiptId, poId, lineKey, receivedQty }
 *   - "goodsreceipt.discrepancy": { poId, lineKey, expected, received }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type POReceiptStatus = "open" | "partial" | "complete" | "closed";

export interface POLine {
  sku: string;
  expectedQty: number;
  receivedQty: number;
}

export interface ReceivablePO {
  id: string;
  poNumber: string;
  supplierId: string;
  lines: POLine[];
  status: POReceiptStatus;
  createdAt: string;
}

export interface GoodsReceipt {
  id: string;
  poId: string;
  sku: string;
  receivedQty: number;
  condition: "good" | "damaged";
  receivedAt: string;
}

export interface GoodsReceiptSummary {
  totalPOs: number;
  openPOs: number;
  completePOs: number;
  totalReceipts: number;
  discrepancyCount: number;
}

export class GoodsReceiptManager {
  private pos: Map<string, ReceivablePO> = new Map();
  private receipts: GoodsReceipt[] = [];

  constructor(private readonly bus: EventBus) {}

  registerPO(poNumber: string, supplierId: string, lines: { sku: string; expectedQty: number }[]): ReceivablePO {
    const po: ReceivablePO = {
      id: randomUUID(),
      poNumber,
      supplierId,
      lines: lines.map(l => ({ sku: l.sku, expectedQty: l.expectedQty, receivedQty: 0 })),
      status: "open",
      createdAt: new Date().toISOString(),
    };
    this.pos.set(po.id, po);
    this.bus.publish("goodsreceipt.po_registered", { poId: po.id, lineCount: lines.length, expectedUnits: lines.reduce((s, l) => s + l.expectedQty, 0) });
    return po;
  }

  receive(poId: string, sku: string, qty: number, condition: "good" | "damaged", receivedAt: string): GoodsReceipt | undefined {
    const po = this.pos.get(poId);
    if (!po || po.status === "closed" || qty <= 0) return undefined;
    const line = po.lines.find(l => l.sku === sku);
    if (!line) return undefined;
    const receipt: GoodsReceipt = { id: randomUUID(), poId, sku, receivedQty: qty, condition, receivedAt };
    this.receipts.push(receipt);
    line.receivedQty += qty;
    this.bus.publish("goodsreceipt.received", { receiptId: receipt.id, poId, lineKey: sku, receivedQty: qty });
    if (line.receivedQty !== line.expectedQty) {
      this.bus.publish("goodsreceipt.discrepancy", { poId, lineKey: sku, expected: line.expectedQty, received: line.receivedQty });
    }
    po.status = po.lines.every(l => l.receivedQty >= l.expectedQty) ? "complete" : "partial";
    return receipt;
  }

  closePO(poId: string): ReceivablePO | undefined {
    const po = this.pos.get(poId);
    if (!po) return undefined;
    po.status = "closed";
    return po;
  }

  discrepancies(poId: string): POLine[] {
    const po = this.pos.get(poId);
    if (!po) return [];
    return po.lines.filter(l => l.receivedQty !== l.expectedQty);
  }

  getPO(id: string): ReceivablePO | undefined { return this.pos.get(id); }
  listPOs(status?: POReceiptStatus): ReceivablePO[] {
    const all = Array.from(this.pos.values());
    return status ? all.filter(p => p.status === status) : all;
  }
  listReceipts(poId?: string): GoodsReceipt[] {
    return poId ? this.receipts.filter(r => r.poId === poId) : [...this.receipts];
  }

  summary(): GoodsReceiptSummary {
    const pos = Array.from(this.pos.values());
    const discrepancyCount = pos.reduce((s, p) => s + p.lines.filter(l => l.receivedQty !== l.expectedQty && l.receivedQty > 0).length, 0);
    return {
      totalPOs: pos.length,
      openPOs: pos.filter(p => p.status === "open" || p.status === "partial").length,
      completePOs: pos.filter(p => p.status === "complete").length,
      totalReceipts: this.receipts.length,
      discrepancyCount,
    };
  }
}
