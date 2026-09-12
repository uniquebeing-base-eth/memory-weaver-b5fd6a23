/**
 * Onchain payment verification.
 *
 * When Dear Diary settles a payment as a direct onchain USDC transfer (the
 * user's own wallet signs and broadcasts it), the server verifies the
 * transaction against the chain before any artwork work begins:
 *   - the transaction succeeded
 *   - it was a transfer of the expected token
 *   - to the expected recipient
 *   - for at least the required amount
 * Each transaction hash can only pay for one thing, once.
 */

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const DEFAULT_RPC: Record<string, string> = {
  "eip155:8453": "https://mainnet.base.org",
  "eip155:84532": "https://sepolia.base.org",
};

function rpcUrlFor(network: string): string | undefined {
  const custom =
    network.endsWith(":8453") ? process.env["BASE_RPC_URL"] : process.env["BASE_SEPOLIA_RPC_URL"];
  return (custom && custom.trim()) || DEFAULT_RPC[network];
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json()) as { result?: T; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message ?? "RPC error");
  return payload.result as T;
}

interface Receipt {
  status: string;
  logs: { address: string; topics: string[]; data: string }[];
}

/** Waits for the transaction to be mined (transfers on Base confirm in seconds). */
async function waitForReceipt(url: string, hash: string): Promise<Receipt | null> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const receipt = await rpc<Receipt | null>(url, "eth_getTransactionReceipt", [hash]).catch(
      () => null,
    );
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return null;
}

function sameAddress(a?: string, b?: string): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function topicAddress(topic?: string): string {
  return topic ? `0x${topic.slice(-40)}` : "";
}

export interface VerifyOutcome {
  ok: boolean;
  reference: string;
  error?: string;
}

/** Hashes already used to settle something — guards against replay/double use. */
const usedHashes = new Set<string>();

export async function verifyTokenPayment(params: {
  hash: string;
  network: string;
  token?: string;
  payTo: string;
  atomicAmount: string;
}): Promise<VerifyOutcome> {
  const { hash, network, token, payTo, atomicAmount } = params;
  const key = `${network}:${hash.toLowerCase()}`;

  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return { ok: false, reference: hash, error: "That payment couldn't be found." };
  }
  if (usedHashes.has(key)) {
    return { ok: false, reference: hash, error: "That payment was already used." };
  }

  const url = rpcUrlFor(network);
  if (!url) {
    return { ok: false, reference: hash, error: "Payments aren't available on this network." };
  }

  let receipt: Receipt | null;
  try {
    receipt = await waitForReceipt(url, hash);
  } catch {
    return { ok: false, reference: hash, error: "We couldn't confirm your payment." };
  }
  if (!receipt) {
    return { ok: false, reference: hash, error: "Your payment is taking too long to confirm." };
  }
  if (receipt.status !== "0x1") {
    return { ok: false, reference: hash, error: "That payment didn't go through." };
  }

  const required = BigInt(atomicAmount);
  const paid = receipt.logs.some((log) => {
    if (!sameAddress(log.topics[0], TRANSFER_TOPIC)) return false;
    if (token && !sameAddress(log.address, token)) return false;
    if (!sameAddress(topicAddress(log.topics[2]), payTo)) return false;
    try {
      return BigInt(log.data) >= required;
    } catch {
      return false;
    }
  });

  if (!paid) {
    return { ok: false, reference: hash, error: "That payment didn't reach its destination." };
  }

  usedHashes.add(key);
  return { ok: true, reference: hash };
}
