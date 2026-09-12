/**
 * Generation orchestrator.
 *
 * validate -> interpret -> discover -> select -> price -> payment requirements
 *          -> settle (once) -> invoke agent (with fallback) -> store -> result
 *
 * No database: task state lives in the in-memory task store for the lifetime of
 * a single generation.
 */

import { assertProductionReady, getConfig, useMockPayments } from "./config.server";
import { findCandidateAgents } from "./selection.server";
import { getAgentPrice } from "./selection.server";
import { toImageGenerationAgent } from "./adapter.server";
import { interpretMemory } from "./interpret.server";
import { isUsableImage, persistImage } from "./storage.server";
import { createTask, getTask, updateTask, type GenerationTask } from "./tasks.server";
import { fetchAgentPaymentRequirements, feeRequirement } from "./x402.server";
import { settlePayment } from "./x402.server";
import { verifyTokenPayment } from "./onchain.server";
import type {
  GenerationError,
  GenerationResult,
  OnchainPayments,
  PaymentBreakdown,
  PaymentRequirementLike,
  Quote,
  SettlementMode,
} from "./types";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * A facilitator settles signed x402 authorizations. Without one, the user's own
 * wallet pays onchain directly (still no custodial wallet, still no keys here).
 * Mocks are only reachable outside production and only when no real recipient
 * address is available to pay.
 */
function settlementMode(
  requirements: PaymentRequirementLike[],
  config: { facilitatorUrl?: string | undefined; isProduction: boolean },
): SettlementMode {
  if (config.facilitatorUrl) return "x402";
  const payable = requirements.every((r) => ADDRESS.test(r.payTo) && Boolean(r.asset));
  if (payable) return "onchain";
  if (config.isProduction) return "x402";
  return "mock";
}

export type QuoteOutcome = { ok: true; quote: Quote } | { ok: false; error: GenerationError };

function err(
  code: GenerationError["code"],
  message: string,
  retryable = true,
  followUp?: string,
): GenerationError {
  return { code, message, retryable, ...(followUp ? { followUp } : {}) };
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

export async function createQuote(memory: string): Promise<QuoteOutcome> {
  const config = getConfig();

  const missing = assertProductionReady(config);
  if (missing.length > 0) {
    return {
      ok: false,
      error: err(
        "misconfigured",
        "Memory creation isn't available right now. Please try again later.",
        false,
      ),
    };
  }

  const interpreted = await interpretMemory(memory);
  if (!interpreted.ok) {
    return {
      ok: false,
      error: err(
        interpreted.code,
        interpreted.code === "memory_too_short"
          ? "Tell us a little more about this memory."
          : interpreted.followUp,
        true,
        interpreted.followUp,
      ),
    };
  }

  let candidates;
  try {
    candidates = await findCandidateAgents();
  } catch {
    return {
      ok: false,
      error: err("no_agents_found", "We couldn't reach our artists just now. Try again."),
    };
  }

  const best = candidates[0];
  if (!best) {
    return {
      ok: false,
      error: err("no_agents_found", "No artist is available right now. Please try again soon."),
    };
  }

  const agentUsd = round(getAgentPrice(best));
  const feeUsd = round(config.generationFeeUsd);
  const breakdown: PaymentBreakdown = {
    agentUsd,
    feeUsd,
    totalUsd: round(agentUsd + feeUsd),
    currency: "USD",
  };

  const agentRequirement = await fetchAgentPaymentRequirements(best, agentUsd);
  const requirements: PaymentRequirementLike[] = [agentRequirement, feeRequirement(feeUsd)];

  const settlement = settlementMode(requirements, config);

  const task = createTask({
    settlement,
    originalMemory: memory.trim(),
    interpretation: interpreted.interpretation,
    candidates,
    requirements,
    breakdown,
    mock: settlement === "mock" && useMockPayments(config),
  });

  return {
    ok: true,
    quote: {
      quoteId: task.id,
      breakdown,
      agent: {
        id: best.id,
        name: best.name,
        price: agentUsd,
        network: best.chain,
        supportsX402: best.supportsX402,
      },
      fallbackAgentIds: candidates.slice(1, 4).map((a) => a.id),
      requirements,
      mock: task.mock,
      settlement: task.settlement,
    },
  };
}

function toResult(task: GenerationTask): GenerationResult {
  return {
    taskId: task.id,
    status: task.status,
    originalMemory: task.originalMemory,
    createdAt: task.createdAt,
    breakdown: task.breakdown,
    title: task.interpretation.title,
    ...(task.imageUrl ? { imageUrl: task.imageUrl } : {}),
    ...(task.agentId ? { agentId: task.agentId } : {}),
    ...(task.agentName ? { agentName: task.agentName } : {}),
    ...(task.paymentReference ? { paymentReference: task.paymentReference } : {}),
    ...(task.error ? { error: task.error } : {}),
  };
}

/** Settles the two payments exactly once per task. */
async function ensurePaid(
  task: GenerationTask,
  payments: { agent?: unknown; fee?: unknown },
  onchain?: OnchainPayments,
): Promise<{ ok: true } | { ok: false; error: GenerationError }> {
  if (task.paymentReference && task.feeSettled) return { ok: true };

  const agentRequirement = task.requirements.find((r) => r.kind === "agent")!;
  const fee = task.requirements.find((r) => r.kind === "fee")!;

  if (task.settlement === "onchain") {
    return ensurePaidOnchain(task, agentRequirement, fee, onchain ?? {});
  }

  if (!task.paymentReference) {
    const settled = await settlePayment(agentRequirement, payments.agent);
    if (!settled.settled) {
      return {
        ok: false,
        error: err("payment_failed", settled.error ?? "That payment didn't go through."),
      };
    }
    updateTask(task.id, { paymentReference: settled.reference });
    task.paymentReference = settled.reference;
    if (typeof payments.agent === "string") {
      updateTask(task.id, { agentPaymentHeader: payments.agent });
      task.agentPaymentHeader = payments.agent;
    }
  }

  if (!task.feeSettled) {
    const settled = await settlePayment(fee, payments.fee);
    if (!settled.settled) {
      return {
        ok: false,
        error: err("payment_failed", settled.error ?? "That payment didn't go through."),
      };
    }
    updateTask(task.id, { feeSettled: true });
    task.feeSettled = true;
  }

  return { ok: true };
}

/**
 * Verifies the two onchain transfers the user's wallet already broadcast:
 * the agent's amount to the agent, the Dear Diary fee to the fee wallet.
 * Verified hashes are recorded so a retry never charges again.
 */
async function ensurePaidOnchain(
  task: GenerationTask,
  agentRequirement: PaymentRequirementLike,
  fee: PaymentRequirementLike,
  onchain: OnchainPayments,
): Promise<{ ok: true } | { ok: false; error: GenerationError }> {
  if (!task.paymentReference) {
    if (!onchain.agentTxHash) {
      return { ok: false, error: err("payment_failed", "Payment wasn't authorized.") };
    }
    const verified = await verifyTokenPayment({
      hash: onchain.agentTxHash,
      network: agentRequirement.network,
      ...(agentRequirement.asset ? { token: agentRequirement.asset } : {}),
      payTo: agentRequirement.payTo,
      atomicAmount: agentRequirement.maxAmountRequired,
    });
    if (!verified.ok) {
      return {
        ok: false,
        error: err("payment_failed", verified.error ?? "That payment didn't go through."),
      };
    }
    updateTask(task.id, { paymentReference: verified.reference });
    task.paymentReference = verified.reference;
  }

  if (!task.feeSettled) {
    if (!onchain.feeTxHash) {
      return { ok: false, error: err("payment_failed", "Payment wasn't completed.") };
    }
    const verified = await verifyTokenPayment({
      hash: onchain.feeTxHash,
      network: fee.network,
      ...(fee.asset ? { token: fee.asset } : {}),
      payTo: fee.payTo,
      atomicAmount: fee.maxAmountRequired,
    });
    if (!verified.ok) {
      return {
        ok: false,
        error: err("payment_failed", verified.error ?? "That payment didn't go through."),
      };
    }
    updateTask(task.id, { feeSettled: true });
    task.feeSettled = true;
  }

  return { ok: true };
}

/** Tries the ranked agents in order. The user is only charged once. */
async function attemptAgents(task: GenerationTask): Promise<GenerationResult> {
  const remaining = task.candidates.filter((a) => !task.attemptedAgentIds.includes(a.id));

  for (const candidate of remaining) {
    const agent = toImageGenerationAgent(candidate);
    updateTask(task.id, {
      status: "processing",
      attemptedAgentIds: [...task.attemptedAgentIds, candidate.id],
      agentId: agent.id,
      agentName: agent.name,
    });
    task.attemptedAgentIds = [...task.attemptedAgentIds, candidate.id];

    try {
      const output = await agent.generate({
        prompt: task.interpretation.prompt,
        originalMemory: task.originalMemory,
        ...(task.agentPaymentHeader ? { paymentHeader: task.agentPaymentHeader } : {}),
      });

      if (output.status === "completed" && isUsableImage(output.imageUrl)) {
        const imageUrl = await persistImage(output.imageUrl, task.id);
        const updated = updateTask(task.id, {
          status: "completed",
          imageUrl,
          agentId: agent.id,
          agentName: agent.name,
        })!;
        return toResult(updated);
      }

      if (output.pollUrl && (output.status === "pending" || output.status === "processing")) {
        const updated = updateTask(task.id, {
          status: "processing",
          pollUrl: output.pollUrl,
          agentId: agent.id,
          agentName: agent.name,
        })!;
        return toResult(updated);
      }
    } catch {
      // fall through to the next ranked agent
    }
  }

  const updated = updateTask(task.id, {
    status: "failed",
    error: err(
      task.attemptedAgentIds.length > 1 ? "all_agents_failed" : "generation_failed",
      "We couldn't finish your artwork. You won't be charged again — tap try again.",
    ),
  })!;
  return toResult(updated);
}

export async function runGeneration(
  taskId: string,
  payments: { agent?: unknown; fee?: unknown },
  onchain?: OnchainPayments,
): Promise<GenerationResult | null> {
  const task = getTask(taskId);
  if (!task) return null;
  if (task.status === "completed") return toResult(task);

  const paid = await ensurePaid(task, payments, onchain);
  if (!paid.ok) {
    const updated = updateTask(task.id, { status: "failed", error: paid.error })!;
    return toResult(updated);
  }

  return attemptAgents(getTask(taskId)!);
}

export async function checkGeneration(taskId: string): Promise<GenerationResult | null> {
  const task = getTask(taskId);
  if (!task) return null;
  if (task.status !== "processing" || !task.pollUrl) return toResult(task);

  const candidate = task.candidates.find((a) => a.id === task.agentId);
  if (!candidate) return toResult(task);

  const agent = toImageGenerationAgent(candidate);
  if (!agent.poll) return toResult(task);

  try {
    const output = await agent.poll(task.pollUrl);
    if (output.status === "completed" && isUsableImage(output.imageUrl)) {
      const imageUrl = await persistImage(output.imageUrl, task.id);
      return toResult(updateTask(task.id, { status: "completed", imageUrl })!);
    }
    if (output.status === "failed") {
      // The agent gave up: fall back to the next ranked agent, no extra charge.
      return attemptAgents(task);
    }
  } catch {
    return toResult(
      updateTask(task.id, {
        status: "failed",
        error: err("generation_timeout", "This is taking too long. Tap try again."),
      })!,
    );
  }

  return toResult(task);
}

/** Retry after a failure without re-charging the user. */
export async function retryGeneration(taskId: string): Promise<GenerationResult | null> {
  const task = getTask(taskId);
  if (!task) return null;
  if (!task.paymentReference) return toResult(task);
  updateTask(task.id, { status: "processing", error: undefined as never });
  return attemptAgents(getTask(taskId)!);
}
