/**
 * x402 (v2) payment plumbing. The user's wallet authorizes payments client-side;
 * the server assembles the payment requirements and settles the Dear Diary fee
 * through a facilitator. No custodial wallet, no custom settlement logic.
 */

import { getConfig, useMockPayments } from "./config.server";
import type { NormalizedAgent } from "./discovery.server";
import type { PaymentRequirementLike } from "./types";

/** USDC (6 decimals) is the default x402 asset on Base. */
const USDC = {
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
} as const;

export function usdToAtomic(usd: number): string {
  return Math.round(usd * 1_000_000).toString();
}

export function feeRequirement(usd: number): PaymentRequirementLike {
  const { feeWallet, network } = getConfig();
  return {
    kind: "fee",
    network,
    payTo: feeWallet,
    maxAmountRequired: usdToAtomic(usd),
    asset: USDC[network as keyof typeof USDC],
    description: "Dear Diary fee",
  };
}

/**
 * Asks the agent's service endpoint for its payment requirements by performing
 * the x402 handshake: an unpaid request returns HTTP 402 with the requirements.
 */
export async function fetchAgentPaymentRequirements(
  agent: NormalizedAgent,
  fallbackUsd: number,
): Promise<PaymentRequirementLike> {
  const { network } = getConfig();
  const endpoint = agent.services[0]?.endpoint ?? "";

  const base: PaymentRequirementLike = {
    kind: "agent",
    network: agent.chain.startsWith("eip155:") ? agent.chain : network,
    payTo: agent.wallet ?? "",
    maxAmountRequired: usdToAtomic(fallbackUsd),
    asset: USDC[network as keyof typeof USDC],
    description: `Artwork by ${agent.name}`,
  };

  if (!endpoint.startsWith("http")) return base;

  try {
    const probe = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ probe: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (probe.status !== 402) return base;

    const challenge = (await probe.json()) as Record<string, unknown>;
    const accepts = (challenge["accepts"] ?? challenge["paymentRequirements"]) as
      | Record<string, unknown>[]
      | undefined;
    const requirement = accepts?.[0];
    if (!requirement) return base;

    const amount = requirement["maxAmountRequired"] ?? requirement["amount"];
    return {
      ...base,
      network: (requirement["network"] as string) ?? base.network,
      payTo: (requirement["payTo"] as string) ?? base.payTo,
      maxAmountRequired: typeof amount === "string" ? amount : base.maxAmountRequired,
      asset: (requirement["asset"] as string) ?? base.asset,
      raw: requirement,
    };
  } catch {
    return base;
  }
}

export function atomicToUsd(atomic: string): number {
  const value = Number(atomic);
  return Number.isFinite(value) ? Number((value / 1_000_000).toFixed(4)) : 0;
}

export interface SettlementResult {
  settled: boolean;
  reference: string;
  mock: boolean;
  error?: string;
}

/**
 * Settles a signed payment payload through the configured facilitator.
 * In local development (no facilitator configured) this is mocked.
 */
export async function settlePayment(
  requirement: PaymentRequirementLike,
  signedPayload: unknown,
): Promise<SettlementResult> {
  const config = getConfig();
  const reference = `x402_${Math.random().toString(36).slice(2, 12)}`;

  if (useMockPayments(config)) {
    return { settled: true, reference, mock: true };
  }
  if (!config.facilitatorUrl) {
    return { settled: false, reference, mock: false, error: "Payments are not configured." };
  }
  if (!signedPayload) {
    return { settled: false, reference, mock: false, error: "Payment was not authorized." };
  }

  try {
    const { HTTPFacilitatorClient } = await import("@x402/core/http");
    const facilitator = new HTTPFacilitatorClient({ url: config.facilitatorUrl });
    const result = (await (
      facilitator as unknown as {
        settle: (payload: unknown, requirements: unknown) => Promise<Record<string, unknown>>;
      }
    ).settle(signedPayload, requirement.raw ?? requirement)) as Record<string, unknown>;

    const success = result["success"] !== false;
    return {
      settled: success,
      reference: (result["transaction"] as string) ?? reference,
      mock: false,
      ...(success ? {} : { error: (result["errorReason"] as string) ?? "Payment failed." }),
    };
  } catch (error) {
    return {
      settled: false,
      reference,
      mock: false,
      error: error instanceof Error ? error.message : "Payment failed.",
    };
  }
}
