/**
 * Wallet-side payment authorization (x402 v2).
 *
 * The user's own wallet signs; Dear Diary never holds keys or funds.
 * In the Farcaster Mini App the wallet comes from the Mini App SDK, otherwise
 * from an injected EIP-1193 provider.
 */

import type { OnchainPayments, PaymentRequirementLike } from "./agent/types";
import {
  chainIdFromNetwork,
  connectWallet,
  readWallet,
  sendTokenTransfer,
  WalletError,
} from "./wallet.client";

export type PaymentError = "payment_rejected" | "payment_failed" | "no_wallet";

export class WalletPaymentError extends Error {
  code: PaymentError;
  constructor(code: PaymentError, message: string) {
    super(message);
    this.code = code;
  }
}

async function getProvider(): Promise<unknown | null> {
  try {
    const { sdk } = await import("@farcaster/miniapp-sdk");
    const inMiniApp = await sdk.isInMiniApp().catch(() => false);
    if (inMiniApp) {
      const provider = await sdk.wallet.getEthereumProvider();
      if (provider) return provider;
    }
  } catch {
    /* not in a Mini App */
  }
  const injected = (globalThis as { ethereum?: unknown }).ethereum;
  return injected ?? null;
}

function toPaymentRequired(requirement: PaymentRequirementLike, resource: string) {
  return {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: requirement.network,
        maxAmountRequired: requirement.maxAmountRequired,
        resource,
        description: requirement.description,
        mimeType: "application/json",
        payTo: requirement.payTo,
        maxTimeoutSeconds: 120,
        asset: requirement.asset,
        extra: { name: "USD Coin", version: "2" },
        ...(requirement.raw ?? {}),
      },
    ],
  };
}

/**
 * Signs one payment authorization per requirement (agent + Dear Diary fee).
 * Returns `null` when no wallet is available — the server then decides whether
 * that is acceptable (development) or a hard failure (production).
 */
export async function authorizePayments(
  requirements: PaymentRequirementLike[],
  resource: string,
): Promise<{ agent?: unknown; fee?: unknown } | null> {
  const provider = await getProvider();
  if (!provider) return null;

  try {
    const [{ x402Client }, { registerExactEvmScheme }, viem] = await Promise.all([
      import("@x402/core/client"),
      import("@x402/evm/exact/client"),
      import("viem"),
    ]);

    const accounts = (await (provider as { request: (a: unknown) => Promise<string[]> }).request({
      method: "eth_requestAccounts",
    })) as string[];
    const account = accounts[0];
    if (!account) throw new WalletPaymentError("payment_rejected", "No wallet account.");

    const walletClient = viem.createWalletClient({
      account: account as `0x${string}`,
      transport: viem.custom(provider as never),
    });

    const client = new x402Client();
    registerExactEvmScheme(client, { signer: walletClient as never });

    const payments: { agent?: unknown; fee?: unknown } = {};
    for (const requirement of requirements) {
      const payload = await client.createPaymentPayload(
        toPaymentRequired(requirement, resource) as never,
      );
      if (requirement.kind === "agent") payments.agent = payload;
      else payments.fee = payload;
    }
    return payments;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/reject|denied|cancel/i.test(message)) {
      throw new WalletPaymentError("payment_rejected", "Payment cancelled.");
    }
    throw new WalletPaymentError("payment_failed", "That payment didn't go through.");
  }
}

/**
 * Real onchain settlement: the user's wallet sends the agent's amount to the
 * agent and the Dear Diary fee to the fee wallet, as two USDC transfers.
 * The server then verifies both transactions against the chain.
 */
export async function payOnchain(requirements: PaymentRequirementLike[]): Promise<OnchainPayments> {
  const wallet = (await readWallet()) ?? (await connectWallet());
  const payments: OnchainPayments = {};

  for (const requirement of requirements) {
    if (!requirement.asset) {
      throw new WalletPaymentError("payment_failed", "This payment isn't available right now.");
    }
    try {
      const hash = await sendTokenTransfer({
        provider: wallet.provider,
        from: wallet.address,
        token: requirement.asset,
        to: requirement.payTo,
        atomicAmount: requirement.maxAmountRequired,
        chainId: chainIdFromNetwork(requirement.network),
      });
      if (requirement.kind === "agent") payments.agentTxHash = hash;
      else payments.feeTxHash = hash;
    } catch (error) {
      if (error instanceof WalletError) {
        throw new WalletPaymentError(
          error.code === "rejected" ? "payment_rejected" : "payment_failed",
          error.message,
        );
      }
      throw new WalletPaymentError("payment_failed", "That payment didn't go through.");
    }
  }

  return payments;
}
