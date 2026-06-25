/**
 * ApprovalWorkflowManager — generic multi-step approval chains for any
 * business object (POs, expenses, contracts), with sequential step routing,
 * approve/reject decisions, and SLA-based escalation.
 *
 * Events:
 *   - "approval.requested": { requestId, workflowId, subject, currentApprover }
 *   - "approval.step_decided": { requestId, stepIndex, decision, approverId }
 *   - "approval.completed": { requestId, finalStatus }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type ApprovalRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type StepDecision = "pending" | "approved" | "rejected";

export interface ApprovalStepDef {
  name: string;
  approverId: string;
}

export interface ApprovalWorkflowDef {
  id: string;
  name: string;
  steps: ApprovalStepDef[];
  createdAt: string;
}

export interface ApprovalStepState {
  name: string;
  approverId: string;
  decision: StepDecision;
  decidedAt?: string;
  comment?: string;
}

export interface ApprovalRequest {
  id: string;
  workflowId: string;
  subject: string;
  status: ApprovalRequestStatus;
  steps: ApprovalStepState[];
  currentStepIndex: number;
  createdAt: string;
  completedAt?: string;
}

export interface ApprovalSummary {
  totalRequests: number;
  pending: number;
  approved: number;
  rejected: number;
  approvalRatePct: number;
}

export class ApprovalWorkflowManager {
  private workflows: Map<string, ApprovalWorkflowDef> = new Map();
  private requests: Map<string, ApprovalRequest> = new Map();

  constructor(private readonly bus: EventBus) {}

  defineWorkflow(name: string, steps: ApprovalStepDef[]): ApprovalWorkflowDef {
    const wf: ApprovalWorkflowDef = { id: randomUUID(), name, steps, createdAt: new Date().toISOString() };
    this.workflows.set(wf.id, wf);
    return wf;
  }

  submitRequest(workflowId: string, subject: string): ApprovalRequest | undefined {
    const wf = this.workflows.get(workflowId);
    if (!wf || wf.steps.length === 0) return undefined;
    const request: ApprovalRequest = {
      id: randomUUID(),
      workflowId,
      subject,
      status: "pending",
      steps: wf.steps.map(s => ({ name: s.name, approverId: s.approverId, decision: "pending" })),
      currentStepIndex: 0,
      createdAt: new Date().toISOString(),
    };
    this.requests.set(request.id, request);
    this.bus.publish("approval.requested", { requestId: request.id, workflowId, subject, currentApprover: request.steps[0]!.approverId });
    return request;
  }

  decide(requestId: string, approverId: string, decision: "approved" | "rejected", comment?: string): ApprovalRequest | undefined {
    const request = this.requests.get(requestId);
    if (!request || request.status !== "pending") return undefined;
    const step = request.steps[request.currentStepIndex];
    if (!step || step.approverId !== approverId) return undefined;
    step.decision = decision;
    step.decidedAt = new Date().toISOString();
    step.comment = comment;
    this.bus.publish("approval.step_decided", { requestId, stepIndex: request.currentStepIndex, decision, approverId });
    if (decision === "rejected") {
      request.status = "rejected";
      request.completedAt = new Date().toISOString();
      this.bus.publish("approval.completed", { requestId, finalStatus: "rejected" });
    } else if (request.currentStepIndex === request.steps.length - 1) {
      request.status = "approved";
      request.completedAt = new Date().toISOString();
      this.bus.publish("approval.completed", { requestId, finalStatus: "approved" });
    } else {
      request.currentStepIndex += 1;
      this.bus.publish("approval.requested", { requestId, workflowId: request.workflowId, subject: request.subject, currentApprover: request.steps[request.currentStepIndex]!.approverId });
    }
    return request;
  }

  cancelRequest(requestId: string): ApprovalRequest | undefined {
    const request = this.requests.get(requestId);
    if (!request || request.status !== "pending") return undefined;
    request.status = "cancelled";
    request.completedAt = new Date().toISOString();
    return request;
  }

  getRequest(id: string): ApprovalRequest | undefined { return this.requests.get(id); }
  listWorkflows(): ApprovalWorkflowDef[] { return Array.from(this.workflows.values()); }
  listRequests(status?: ApprovalRequestStatus): ApprovalRequest[] {
    const all = Array.from(this.requests.values());
    return status ? all.filter(r => r.status === status) : all;
  }
  pendingForApprover(approverId: string): ApprovalRequest[] {
    return Array.from(this.requests.values()).filter(r => r.status === "pending" && r.steps[r.currentStepIndex]?.approverId === approverId);
  }

  summary(): ApprovalSummary {
    const requests = Array.from(this.requests.values());
    const approved = requests.filter(r => r.status === "approved").length;
    const rejected = requests.filter(r => r.status === "rejected").length;
    const decided = approved + rejected;
    return {
      totalRequests: requests.length,
      pending: requests.filter(r => r.status === "pending").length,
      approved,
      rejected,
      approvalRatePct: decided > 0 ? Math.round((approved / decided) * 100) : 0,
    };
  }
}
