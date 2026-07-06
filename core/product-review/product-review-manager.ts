/**
 * ProductReviewManager — user-generated product reviews: submission, moderation
 * (approve/reject), verified-purchase flagging, helpfulness votes, and rating
 * aggregation per product.
 *
 * Events:
 *   - "review.submitted": { reviewId, productId, rating }
 *   - "review.approved": { reviewId, productId }
 *   - "review.flagged": { reviewId, reason }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface ProductReview {
  id: string;
  productId: string;
  authorId: string;
  rating: number; // 1-5
  title: string;
  body: string;
  verifiedPurchase: boolean;
  status: ReviewStatus;
  helpfulVotes: number;
  submittedAt: string;
}

export interface ProductRatingSummary {
  productId: string;
  approvedCount: number;
  averageRating: number;
  distribution: Record<number, number>;
}

export interface ReviewSummary {
  totalReviews: number;
  approved: number;
  pending: number;
  rejected: number;
  verifiedPct: number;
  overallAverageRating: number;
}

export class ProductReviewManager {
  private reviews: Map<string, ProductReview> = new Map();

  constructor(private readonly bus: EventBus) {}

  submit(input: { productId: string; authorId: string; rating: number; title: string; body: string; verifiedPurchase?: boolean }): ProductReview | undefined {
    if (input.rating < 1 || input.rating > 5) return undefined;
    const review: ProductReview = {
      id: randomUUID(),
      productId: input.productId,
      authorId: input.authorId,
      rating: input.rating,
      title: input.title,
      body: input.body,
      verifiedPurchase: input.verifiedPurchase ?? false,
      status: "pending",
      helpfulVotes: 0,
      submittedAt: new Date().toISOString(),
    };
    this.reviews.set(review.id, review);
    this.bus.publish("review.submitted", { reviewId: review.id, productId: review.productId, rating: review.rating });
    return review;
  }

  approve(reviewId: string): ProductReview | undefined {
    const r = this.reviews.get(reviewId);
    if (!r || r.status !== "pending") return undefined;
    r.status = "approved";
    this.bus.publish("review.approved", { reviewId, productId: r.productId });
    return r;
  }

  reject(reviewId: string, reason: string): ProductReview | undefined {
    const r = this.reviews.get(reviewId);
    if (!r || r.status !== "pending") return undefined;
    r.status = "rejected";
    this.bus.publish("review.flagged", { reviewId, reason });
    return r;
  }

  voteHelpful(reviewId: string): ProductReview | undefined {
    const r = this.reviews.get(reviewId);
    if (!r || r.status !== "approved") return undefined;
    r.helpfulVotes += 1;
    return r;
  }

  productRating(productId: string): ProductRatingSummary {
    const approved = Array.from(this.reviews.values()).filter(r => r.productId === productId && r.status === "approved");
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of approved) distribution[r.rating] = (distribution[r.rating] ?? 0) + 1;
    const avg = approved.length > 0 ? Math.round((approved.reduce((s, r) => s + r.rating, 0) / approved.length) * 100) / 100 : 0;
    return { productId, approvedCount: approved.length, averageRating: avg, distribution };
  }

  getReview(id: string): ProductReview | undefined { return this.reviews.get(id); }
  listReviews(productId?: string, status?: ReviewStatus): ProductReview[] {
    let all = Array.from(this.reviews.values());
    if (productId) all = all.filter(r => r.productId === productId);
    if (status) all = all.filter(r => r.status === status);
    return all;
  }

  summary(): ReviewSummary {
    const reviews = Array.from(this.reviews.values());
    const approved = reviews.filter(r => r.status === "approved");
    const verified = reviews.filter(r => r.verifiedPurchase).length;
    return {
      totalReviews: reviews.length,
      approved: approved.length,
      pending: reviews.filter(r => r.status === "pending").length,
      rejected: reviews.filter(r => r.status === "rejected").length,
      verifiedPct: reviews.length > 0 ? Math.round((verified / reviews.length) * 100) : 0,
      overallAverageRating: approved.length > 0 ? Math.round((approved.reduce((s, r) => s + r.rating, 0) / approved.length) * 100) / 100 : 0,
    };
  }
}
