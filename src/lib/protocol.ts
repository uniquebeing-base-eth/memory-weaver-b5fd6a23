/**
 * Dear Diary protocol layer (prototype).
 *
 * Everything here is an interface + in-memory placeholder implementation.
 * Later these are swapped for fully decentralized implementations:
 *  - agent routing  -> on-chain / p2p agent registry
 *  - payments       -> x402 (HTTP 402) settlement with a 10% Dear Diary fee
 *  - storage        -> IPFS / Arweave content addressing
 *  - mint & market  -> onchain collectible contracts
 * No custom backend and no database is used or required.
 */

export const DEAR_DIARY_FEE_BPS = 1000; // 10%

export type Mood = "warm" | "dreamy" | "bright" | "quiet";

export interface ImageAgent {
  id: string;
  /** Agents stay invisible to users; this is infrastructure metadata only. */
  capabilities: Mood[];
  priceUsd: number;
  latencySeconds: number;
  score: number;
}

export interface GenerationRequest {
  memory: string;
  mood: Mood;
}

export interface GenerationResult {
  imageUrl: string;
  agentId: string;
  receipt: PaymentReceipt;
}

export interface PaymentQuote {
  agentUsd: number;
  feeUsd: number;
  totalUsd: number;
}

export interface PaymentReceipt extends PaymentQuote {
  reference: string;
  settledAt: string;
}

/** Agent registry — replaced later by an onchain registry read. */
const REGISTRY: ImageAgent[] = [
  { id: "agent.aurora", capabilities: ["warm", "bright"], priceUsd: 0.4, latencySeconds: 6, score: 0.92 },
  { id: "agent.lumen", capabilities: ["dreamy", "quiet"], priceUsd: 0.35, latencySeconds: 8, score: 0.9 },
  { id: "agent.gouache", capabilities: ["warm", "dreamy", "quiet", "bright"], priceUsd: 0.5, latencySeconds: 5, score: 0.95 },
];

/** Routing is automatic: users never pick an agent. */
export function routeAgent(request: GenerationRequest): ImageAgent {
  const eligible = REGISTRY.filter((a) => a.capabilities.includes(request.mood));
  const pool = eligible.length > 0 ? eligible : REGISTRY;
  return [...pool].sort(
    (a, b) => b.score - a.score || a.priceUsd - b.priceUsd || a.latencySeconds - b.latencySeconds,
  )[0]!;
}

export function quote(agent: ImageAgent): PaymentQuote {
  const feeUsd = Number(((agent.priceUsd * DEAR_DIARY_FEE_BPS) / 10000).toFixed(4));
  return {
    agentUsd: agent.priceUsd,
    feeUsd,
    totalUsd: Number((agent.priceUsd + feeUsd).toFixed(4)),
  };
}

/** x402 settlement placeholder. */
export async function settleX402(q: PaymentQuote): Promise<PaymentReceipt> {
  await wait(500);
  return {
    ...q,
    reference: `x402_${Math.random().toString(36).slice(2, 10)}`,
    settledAt: new Date().toISOString(),
  };
}

export interface MintOptions {
  editions: number;
  priceUsd: number;
}

export interface CollectibleRef {
  tokenId: string;
  chain: string;
  editions: number;
}

export interface GiftReceipt {
  to: string;
  note: string;
  sentAt: string;
}

/** Onchain placeholders. */
export async function mintMemory(memoryId: string, options: MintOptions): Promise<CollectibleRef> {
  await wait(1400);
  return {
    tokenId: `${memoryId.slice(0, 4)}${Math.floor(Math.random() * 9000 + 1000)}`,
    chain: "Base",
    editions: options.editions,
  };
}

export async function giftMemory(memoryId: string, to: string, note: string): Promise<GiftReceipt> {
  await wait(1000);
  void memoryId;
  return { to, note, sentAt: new Date().toISOString() };
}

export async function listForSale(memoryId: string, priceUsd: number): Promise<{ priceUsd: number }> {
  await wait(700);
  void memoryId;
  return { priceUsd };
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
