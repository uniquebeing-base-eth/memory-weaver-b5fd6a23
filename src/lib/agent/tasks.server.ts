/**
 * In-memory generation task store (no database).
 * Holds the short-lived state of a single generation: quote, interpretation,
 * candidate agents, payment settlement and the final artwork.
 */

import type { NormalizedAgent } from "./discovery.server";
import type {
  GenerationError,
  GenerationStatus,
  PaymentBreakdown,
  PaymentRequirementLike,
  VisualInterpretation,
} from "./types";

export interface GenerationTask {
  id: string;
  originalMemory: string;
  interpretation: VisualInterpretation;
  candidates: NormalizedAgent[];
  requirements: PaymentRequirementLike[];
  breakdown: PaymentBreakdown;
  status: GenerationStatus;
  createdAt: string;
  /** Set once — guarantees the user is never charged twice for one generation. */
  paymentReference?: string;
  feeSettled?: boolean;
  agentPaymentHeader?: string;
  attemptedAgentIds: string[];
  agentId?: string;
  agentName?: string;
  imageUrl?: string;
  pollUrl?: string;
  error?: GenerationError;
  mock: boolean;
}

const TASK_TTL_MS = 30 * 60 * 1000;
const tasks = new Map<string, GenerationTask>();

function sweep() {
  const now = Date.now();
  for (const [id, task] of tasks) {
    if (now - new Date(task.createdAt).getTime() > TASK_TTL_MS) tasks.delete(id);
  }
}

export function createTask(
  task: Omit<GenerationTask, "id" | "createdAt" | "status" | "attemptedAgentIds">,
): GenerationTask {
  sweep();
  const created: GenerationTask = {
    ...task,
    id: `gen_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    status: "pending",
    attemptedAgentIds: [],
  };
  tasks.set(created.id, created);
  return created;
}

export function getTask(id: string): GenerationTask | undefined {
  return tasks.get(id);
}

export function updateTask(id: string, patch: Partial<GenerationTask>): GenerationTask | undefined {
  const existing = tasks.get(id);
  if (!existing) return undefined;
  const next = { ...existing, ...patch };
  tasks.set(id, next);
  return next;
}
