/**
 * Shared (client-safe) types for the Dear Diary agent generation system.
 * No secrets, no server-only imports here — this module is imported by UI code.
 */

export type GenerationStatus = "pending" | "processing" | "completed" | "failed";

export type GenerationErrorCode =
  | "memory_too_short"
  | "insufficient_visual_detail"
  | "no_agents_found"
  | "agent_unavailable"
  | "payment_rejected"
  | "payment_failed"
  | "generation_failed"
  | "generation_timeout"
  | "image_unavailable"
  | "all_agents_failed"
  | "misconfigured";

export interface GenerationError {
  code: GenerationErrorCode;
  message: string;
  /** A single follow-up question when the memory lacks visual detail. */
  followUp?: string;
  retryable: boolean;
}

/** Internal visual interpretation of a memory (never shown as raw JSON to users). */
export interface VisualInterpretation {
  subjects: string[];
  relationships: string[];
  actions: string[];
  setting: string;
  location: string;
  objects: string[];
  time: string;
  weather: string;
  distinctiveDetails: string[];
  emotionalTone: string;
  composition: string;
  viewpoint: string;
  style: string;
  /** The final prompt handed to the selected agent. */
  prompt: string;
  /** Short human title for the memory. */
  title: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  price: number;
  network: string;
  supportsX402: boolean;
}

export interface PaymentBreakdown {
  agentUsd: number;
  feeUsd: number;
  totalUsd: number;
  currency: "USD";
}

/** One x402 payment the wallet must authorize. */
export interface PaymentRequirementLike {
  /** "agent" or "dear-diary-fee" */
  kind: "agent" | "fee";
  network: string;
  payTo: string;
  maxAmountRequired: string;
  asset?: string;
  description: string;
  /** Raw requirement object from the agent's 402 challenge, when present. */
  raw?: Record<string, unknown>;
}

export interface Quote {
  quoteId: string;
  breakdown: PaymentBreakdown;
  agent: AgentSummary;
  /** Agents considered as fallbacks, in ranked order (ids only). */
  fallbackAgentIds: string[];
  requirements: PaymentRequirementLike[];
  /** True when running with mock adapters (local development). */
  mock: boolean;
}

export interface GenerationResult {
  taskId: string;
  status: GenerationStatus;
  originalMemory: string;
  imageUrl?: string;
  title?: string;
  agentId?: string;
  agentName?: string;
  createdAt: string;
  breakdown?: PaymentBreakdown;
  paymentReference?: string;
  error?: GenerationError;
}

export const MIN_MEMORY_WORDS = 20;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
