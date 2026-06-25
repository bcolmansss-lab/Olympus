/**
 * DocumentSignatureManager — e-signature envelopes with ordered or parallel
 * signers, signing/decline tracking, and completion detection.
 *
 * Events:
 *   - "esign.envelope_sent": { envelopeId, title, signerCount }
 *   - "esign.signer_signed": { envelopeId, signerId, remaining }
 *   - "esign.envelope_completed": { envelopeId, completedAt }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type EnvelopeStatus = "draft" | "sent" | "completed" | "declined" | "voided";
export type SignerStatus = "pending" | "signed" | "declined";
export type SigningOrder = "sequential" | "parallel";

export interface Signer {
  id: string;
  name: string;
  email: string;
  order: number;
  status: SignerStatus;
  signedAt?: string;
}

export interface SignatureEnvelope {
  id: string;
  title: string;
  documentRef: string;
  signingOrder: SigningOrder;
  status: EnvelopeStatus;
  signers: Signer[];
  createdAt: string;
  sentAt?: string;
  completedAt?: string;
}

export interface SignatureSummary {
  totalEnvelopes: number;
  sent: number;
  completed: number;
  declined: number;
  pendingSigners: number;
  completionRatePct: number;
}

export class DocumentSignatureManager {
  private envelopes: Map<string, SignatureEnvelope> = new Map();

  constructor(private readonly bus: EventBus) {}

  createEnvelope(title: string, documentRef: string, signers: { name: string; email: string }[], signingOrder: SigningOrder = "sequential"): SignatureEnvelope {
    const envelope: SignatureEnvelope = {
      id: randomUUID(),
      title,
      documentRef,
      signingOrder,
      status: "draft",
      signers: signers.map((s, i) => ({ id: randomUUID(), name: s.name, email: s.email, order: i, status: "pending" })),
      createdAt: new Date().toISOString(),
    };
    this.envelopes.set(envelope.id, envelope);
    return envelope;
  }

  send(envelopeId: string): SignatureEnvelope | undefined {
    const envelope = this.envelopes.get(envelopeId);
    if (!envelope || envelope.status !== "draft" || envelope.signers.length === 0) return undefined;
    envelope.status = "sent";
    envelope.sentAt = new Date().toISOString();
    this.bus.publish("esign.envelope_sent", { envelopeId, title: envelope.title, signerCount: envelope.signers.length });
    return envelope;
  }

  private canSign(envelope: SignatureEnvelope, signer: Signer): boolean {
    if (envelope.signingOrder === "parallel") return true;
    const earlierPending = envelope.signers.some(s => s.order < signer.order && s.status === "pending");
    return !earlierPending;
  }

  sign(envelopeId: string, signerId: string, asOf: string): SignatureEnvelope | undefined {
    const envelope = this.envelopes.get(envelopeId);
    if (!envelope || envelope.status !== "sent") return undefined;
    const signer = envelope.signers.find(s => s.id === signerId);
    if (!signer || signer.status !== "pending" || !this.canSign(envelope, signer)) return undefined;
    signer.status = "signed";
    signer.signedAt = asOf;
    const remaining = envelope.signers.filter(s => s.status === "pending").length;
    this.bus.publish("esign.signer_signed", { envelopeId, signerId, remaining });
    if (remaining === 0) {
      envelope.status = "completed";
      envelope.completedAt = asOf;
      this.bus.publish("esign.envelope_completed", { envelopeId, completedAt: asOf });
    }
    return envelope;
  }

  decline(envelopeId: string, signerId: string): SignatureEnvelope | undefined {
    const envelope = this.envelopes.get(envelopeId);
    if (!envelope || envelope.status !== "sent") return undefined;
    const signer = envelope.signers.find(s => s.id === signerId);
    if (!signer || signer.status !== "pending") return undefined;
    signer.status = "declined";
    envelope.status = "declined";
    return envelope;
  }

  void(envelopeId: string): SignatureEnvelope | undefined {
    const envelope = this.envelopes.get(envelopeId);
    if (!envelope || envelope.status === "completed") return undefined;
    envelope.status = "voided";
    return envelope;
  }

  getEnvelope(id: string): SignatureEnvelope | undefined { return this.envelopes.get(id); }
  listEnvelopes(status?: EnvelopeStatus): SignatureEnvelope[] {
    const all = Array.from(this.envelopes.values());
    return status ? all.filter(e => e.status === status) : all;
  }

  summary(): SignatureSummary {
    const envelopes = Array.from(this.envelopes.values());
    const completed = envelopes.filter(e => e.status === "completed").length;
    const finished = envelopes.filter(e => e.status === "completed" || e.status === "declined").length;
    return {
      totalEnvelopes: envelopes.length,
      sent: envelopes.filter(e => e.status === "sent").length,
      completed,
      declined: envelopes.filter(e => e.status === "declined").length,
      pendingSigners: envelopes.flatMap(e => e.signers).filter(s => s.status === "pending").length,
      completionRatePct: finished > 0 ? Math.round((completed / finished) * 100) : 0,
    };
  }
}
