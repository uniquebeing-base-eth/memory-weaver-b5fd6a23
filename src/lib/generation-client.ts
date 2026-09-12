/**
 * Browser-side client for the memory generation endpoints.
 * Users never see x402, agents or 8004scan — only "creating your artwork".
 */

import type { GenerationError, GenerationResult, Quote } from "./agent/types";
import { authorizePayments, WalletPaymentError } from "./pay.client";

export type QuoteResponse = { ok: true; quote: Quote } | { ok: false; error: GenerationError };

function asError(payload: unknown, fallback: GenerationError): GenerationError {
  const error = (payload as { error?: GenerationError } | null)?.error;
  return error && typeof error.code === "string" ? error : fallback;
}

export async function requestQuote(memory: string): Promise<QuoteResponse> {
  try {
    const response = await fetch("/api/memory/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memory }),
    });
    const payload = await response.json();
    if (!response.ok) {
      return {
        ok: false,
        error: asError(payload, {
          code: "generation_failed",
          message: "Something went wrong. Please try again.",
          retryable: true,
        }),
      };
    }
    return { ok: true, quote: payload as Quote };
  } catch {
    return {
      ok: false,
      error: {
        code: "generation_failed",
        message: "We couldn't reach Dear Diary. Check your connection and try again.",
        retryable: true,
      },
    };
  }
}

async function postGenerate(body: Record<string, unknown>): Promise<GenerationResult> {
  const response = await fetch("/api/memory/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      taskId: String(body["quoteId"] ?? ""),
      status: "failed",
      originalMemory: "",
      createdAt: new Date().toISOString(),
      error: asError(payload, {
        code: "generation_failed",
        message: "We couldn't finish your artwork.",
        retryable: true,
      }),
    };
  }
  return payload as GenerationResult;
}

async function pollUntilDone(taskId: string, timeoutMs = 180_000): Promise<GenerationResult> {
  const deadline = Date.now() + timeoutMs;
  let last: GenerationResult | null = null;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const response = await fetch(`/api/memory/status/${taskId}`);
    const payload = (await response.json()) as GenerationResult;
    last = payload;
    if (payload.status === "completed" || payload.status === "failed") return payload;
  }

  return (
    last ?? {
      taskId,
      status: "failed",
      originalMemory: "",
      createdAt: new Date().toISOString(),
      error: {
        code: "generation_timeout",
        message: "This is taking longer than usual. Tap try again.",
        retryable: true,
      },
    }
  );
}

/** Pays (once) and generates. Retries reuse the same payment. */
export async function payAndGenerate(quote: Quote): Promise<GenerationResult> {
  let payments: { agent?: unknown; fee?: unknown } | null = null;
  try {
    payments = await authorizePayments(quote.requirements, `${location.origin}/api/memory/generate`);
  } catch (error) {
    const code = error instanceof WalletPaymentError ? error.code : "payment_failed";
    return {
      taskId: quote.quoteId,
      status: "failed",
      originalMemory: "",
      createdAt: new Date().toISOString(),
      error: {
        code: code === "payment_rejected" ? "payment_rejected" : "payment_failed",
        message:
          code === "payment_rejected"
            ? "You cancelled the payment. Nothing was charged."
            : "That payment didn't go through. Please try again.",
        retryable: true,
      },
    };
  }

  const result = await postGenerate({
    quoteId: quote.quoteId,
    payments: payments ?? {},
  });

  if (result.status === "processing") return pollUntilDone(result.taskId);
  return result;
}

/** Retry a failed generation without charging again. */
export async function retryGeneration(taskId: string): Promise<GenerationResult> {
  const result = await postGenerate({ quoteId: taskId, retry: true });
  if (result.status === "processing") return pollUntilDone(result.taskId);
  return result;
}
