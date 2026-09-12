/**
 * Wallet access for the browser.
 *
 * Inside Farcaster the wallet comes from the Mini App SDK; everywhere else we
 * use the injected EIP-1193 provider (MetaMask, Rabby, Coinbase Wallet, ...).
 * Dear Diary never asks for keys or seed phrases and never holds funds.
 */

export type WalletKind = "farcaster" | "injected";

export interface ConnectedWallet {
  address: `0x${string}`;
  kind: WalletKind;
  chainId: number;
  provider: Eip1193Provider;
}

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

export type WalletErrorCode = "no_wallet" | "rejected" | "wrong_network" | "failed";

export class WalletError extends Error {
  code: WalletErrorCode;
  constructor(code: WalletErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const CHAIN_META: Record<number, { name: string; rpc: string[]; explorer: string }> = {
  8453: {
    name: "Base",
    rpc: ["https://mainnet.base.org"],
    explorer: "https://basescan.org",
  },
  84532: {
    name: "Base Sepolia",
    rpc: ["https://sepolia.base.org"],
    explorer: "https://sepolia.basescan.org",
  },
};

export function chainIdFromNetwork(network: string): number {
  const parsed = Number(network.split(":")[1] ?? network);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8453;
}

export function chainName(chainId: number): string {
  return CHAIN_META[chainId]?.name ?? `chain ${chainId}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function isRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = (error as { code?: number } | null)?.code;
  return code === 4001 || /reject|denied|cancel/i.test(message);
}

/** Resolves a provider without prompting the user. */
export async function getWalletProvider(): Promise<{
  provider: Eip1193Provider;
  kind: WalletKind;
} | null> {
  try {
    const { sdk } = await import("@farcaster/miniapp-sdk");
    if (await sdk.isInMiniApp().catch(() => false)) {
      const provider = (await sdk.wallet.getEthereumProvider()) as Eip1193Provider | null;
      if (provider) return { provider, kind: "farcaster" };
    }
  } catch {
    /* not running inside Farcaster */
  }
  const injected = (globalThis as { ethereum?: Eip1193Provider }).ethereum;
  return injected ? { provider: injected, kind: "injected" } : null;
}

async function accountsOf(provider: Eip1193Provider, prompt: boolean): Promise<string[]> {
  const method = prompt ? "eth_requestAccounts" : "eth_accounts";
  const accounts = (await provider.request({ method })) as string[] | undefined;
  return Array.isArray(accounts) ? accounts : [];
}

async function chainIdOf(provider: Eip1193Provider): Promise<number> {
  const raw = (await provider.request({ method: "eth_chainId" })) as string | number;
  return typeof raw === "string" ? Number.parseInt(raw, 16) : Number(raw);
}

/** Returns the already-authorized wallet, or null (no popup). */
export async function readWallet(): Promise<ConnectedWallet | null> {
  const found = await getWalletProvider();
  if (!found) return null;
  try {
    const [account] = await accountsOf(found.provider, false);
    if (!account) return null;
    return {
      address: account as `0x${string}`,
      kind: found.kind,
      chainId: await chainIdOf(found.provider),
      provider: found.provider,
    };
  } catch {
    return null;
  }
}

/** Prompts the user to connect their wallet. */
export async function connectWallet(): Promise<ConnectedWallet> {
  const found = await getWalletProvider();
  if (!found) {
    throw new WalletError(
      "no_wallet",
      "We couldn't find a wallet on this device. Open Dear Diary in Farcaster or a wallet browser.",
    );
  }
  try {
    const [account] = await accountsOf(found.provider, true);
    if (!account) throw new WalletError("rejected", "No account was shared.");
    return {
      address: account as `0x${string}`,
      kind: found.kind,
      chainId: await chainIdOf(found.provider),
      provider: found.provider,
    };
  } catch (error) {
    if (error instanceof WalletError) throw error;
    if (isRejection(error)) throw new WalletError("rejected", "Wallet connection cancelled.");
    throw new WalletError("failed", "We couldn't connect to your wallet.");
  }
}

/** Makes sure the wallet is on the network the payment needs. */
export async function ensureChain(
  provider: Eip1193Provider,
  chainId: number,
): Promise<void> {
  const current = await chainIdOf(provider).catch(() => 0);
  if (current === chainId) return;

  const hexId = `0x${chainId.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
    return;
  } catch (error) {
    const code = (error as { code?: number } | null)?.code;
    if (isRejection(error)) {
      throw new WalletError("rejected", `Please switch to ${chainName(chainId)} to pay.`);
    }
    if (code !== 4902) {
      throw new WalletError("wrong_network", `Please switch to ${chainName(chainId)} to pay.`);
    }
  }

  const meta = CHAIN_META[chainId];
  if (!meta) throw new WalletError("wrong_network", `Please switch to ${chainName(chainId)}.`);
  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexId,
          chainName: meta.name,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: meta.rpc,
          blockExplorerUrls: [meta.explorer],
        },
      ],
    });
  } catch (error) {
    if (isRejection(error)) {
      throw new WalletError("rejected", `Please switch to ${chainName(chainId)} to pay.`);
    }
    throw new WalletError("wrong_network", `Please switch to ${chainName(chainId)} to pay.`);
  }
}

const TRANSFER_SELECTOR = "0xa9059cbb";

function padHex(value: string): string {
  return value.replace(/^0x/, "").padStart(64, "0");
}

/**
 * Sends a real onchain ERC-20 (USDC) transfer from the user's wallet.
 * Returns the transaction hash; the server verifies it against the chain.
 */
export async function sendTokenTransfer(params: {
  provider: Eip1193Provider;
  from: `0x${string}`;
  token: string;
  to: string;
  atomicAmount: string;
  chainId: number;
}): Promise<`0x${string}`> {
  const { provider, from, token, to, atomicAmount, chainId } = params;
  await ensureChain(provider, chainId);

  const data = `${TRANSFER_SELECTOR}${padHex(to)}${padHex(BigInt(atomicAmount).toString(16))}`;

  try {
    const hash = (await provider.request({
      method: "eth_sendTransaction",
      params: [{ from, to: token, data, value: "0x0" }],
    })) as string;
    if (typeof hash !== "string" || !hash.startsWith("0x")) {
      throw new WalletError("failed", "The payment didn't go through.");
    }
    return hash as `0x${string}`;
  } catch (error) {
    if (error instanceof WalletError) throw error;
    if (isRejection(error)) throw new WalletError("rejected", "Payment cancelled.");
    const message = error instanceof Error ? error.message : "";
    if (/insufficient|balance|funds/i.test(message)) {
      throw new WalletError("failed", "Your wallet doesn't have enough USDC for this memory.");
    }
    throw new WalletError("failed", "That payment didn't go through.");
  }
}
