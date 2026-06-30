/**
 * AuctionManager — timed auctions: lot listing with reserve price, bid
 * placement with min-increment enforcement, proxy/highest-bidder tracking,
 * and settlement (sold/passed) at close.
 *
 * Events:
 *   - "auction.opened": { auctionId, lot, startingBidUsd }
 *   - "auction.bid_placed": { auctionId, bidderId, amountUsd }
 *   - "auction.closed": { auctionId, soldTo, finalPriceUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type AuctionStatus = "open" | "closed_sold" | "closed_passed";

export interface AuctionBid {
  id: string;
  bidderId: string;
  amountUsd: number;
  at: string;
}

export interface Auction {
  id: string;
  lot: string;
  startingBidUsd: number;
  reservePriceUsd: number;
  minIncrementUsd: number;
  status: AuctionStatus;
  bids: AuctionBid[];
  endsAt: string;
  createdAt: string;
}

export interface AuctionSummary {
  totalAuctions: number;
  open: number;
  sold: number;
  passed: number;
  totalBids: number;
  totalHammerUsd: number;
  sellThroughPct: number;
}

export class AuctionManager {
  private auctions: Map<string, Auction> = new Map();

  constructor(private readonly bus: EventBus) {}

  open(input: { lot: string; startingBidUsd: number; reservePriceUsd: number; minIncrementUsd: number; endsAt: string }): Auction {
    const auction: Auction = { ...input, id: randomUUID(), status: "open", bids: [], createdAt: new Date().toISOString() };
    this.auctions.set(auction.id, auction);
    this.bus.publish("auction.opened", { auctionId: auction.id, lot: auction.lot, startingBidUsd: auction.startingBidUsd });
    return auction;
  }

  highestBid(auctionId: string): AuctionBid | undefined {
    const auction = this.auctions.get(auctionId);
    if (!auction || auction.bids.length === 0) return undefined;
    return auction.bids.reduce((h, b) => b.amountUsd > h.amountUsd ? b : h, auction.bids[0]!);
  }

  placeBid(auctionId: string, bidderId: string, amountUsd: number, at: string): AuctionBid | undefined {
    const auction = this.auctions.get(auctionId);
    if (!auction || auction.status !== "open") return undefined;
    if (new Date(at).getTime() > new Date(auction.endsAt).getTime()) return undefined;
    const highest = this.highestBid(auctionId);
    const minRequired = highest ? highest.amountUsd + auction.minIncrementUsd : auction.startingBidUsd;
    if (amountUsd < minRequired) return undefined;
    const bid: AuctionBid = { id: randomUUID(), bidderId, amountUsd, at };
    auction.bids.push(bid);
    this.bus.publish("auction.bid_placed", { auctionId, bidderId, amountUsd });
    return bid;
  }

  close(auctionId: string): Auction | undefined {
    const auction = this.auctions.get(auctionId);
    if (!auction || auction.status !== "open") return undefined;
    const highest = this.highestBid(auctionId);
    if (highest && highest.amountUsd >= auction.reservePriceUsd) {
      auction.status = "closed_sold";
      this.bus.publish("auction.closed", { auctionId, soldTo: highest.bidderId, finalPriceUsd: highest.amountUsd });
    } else {
      auction.status = "closed_passed";
      this.bus.publish("auction.closed", { auctionId, soldTo: null, finalPriceUsd: highest?.amountUsd ?? 0 });
    }
    return auction;
  }

  getAuction(id: string): Auction | undefined { return this.auctions.get(id); }
  listAuctions(status?: AuctionStatus): Auction[] {
    const all = Array.from(this.auctions.values());
    return status ? all.filter(a => a.status === status) : all;
  }

  summary(): AuctionSummary {
    const auctions = Array.from(this.auctions.values());
    const sold = auctions.filter(a => a.status === "closed_sold");
    const closed = auctions.filter(a => a.status !== "open").length;
    return {
      totalAuctions: auctions.length,
      open: auctions.filter(a => a.status === "open").length,
      sold: sold.length,
      passed: auctions.filter(a => a.status === "closed_passed").length,
      totalBids: auctions.reduce((s, a) => s + a.bids.length, 0),
      totalHammerUsd: Math.round(sold.reduce((s, a) => s + (this.highestBid(a.id)?.amountUsd ?? 0), 0) * 100) / 100,
      sellThroughPct: closed > 0 ? Math.round((sold.length / closed) * 100) : 0,
    };
  }
}
