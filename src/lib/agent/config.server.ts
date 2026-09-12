/**
 * Server-only configuration. Every secret is read from the environment at call
 * time (never at module scope — env is injected per request on the edge runtime).
 */

export interface DearDiaryConfig {
  scanApiKey?: string | undefined;
  scanBaseUrl: string;
  facilitatorUrl?: string | undefined;
  feeWallet: string;
  network: string;
  generationFeeUsd: number;
  imageStorageUrl?: string | undefined;
  imageStorageApiKey?: string | undefined;
  discoveryQuery: string;
  lovableApiKey?: string | undefined;
  isProduction: boolean;
}

const DEFAULT_FEE_WALLET = "0xF7A2d71253701a7706972002c8718728E0e98b49";
const DEFAULT_DISCOVERY_QUERY =
  "active image generation agent: text-to-image, visual generation, memory or story to image, creative image generation";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function getConfig(): DearDiaryConfig {
  const isProduction = (env("NODE_ENV") ?? "development") === "production";
  const mainnet = env("BASE_NETWORK") ?? "eip155:8453";
  const sepolia = env("BASE_SEPOLIA_NETWORK") ?? "eip155:84532";

  return {
    scanApiKey: env("8004SCAN_API_KEY") ?? env("SCAN8004_API_KEY"),
    scanBaseUrl: env("SCAN8004_BASE_URL") ?? "https://api.8004scan.io/api/v1",
    facilitatorUrl: env("X402_FACILITATOR_URL"),
    feeWallet: env("DEAR_DIARY_FEE_WALLET") ?? DEFAULT_FEE_WALLET,
    network: isProduction ? mainnet : sepolia,
    generationFeeUsd: Number(env("GENERATION_FEE_USD") ?? "0.10"),
    imageStorageUrl: env("IMAGE_STORAGE_URL"),
    imageStorageApiKey: env("IMAGE_STORAGE_API_KEY"),
    discoveryQuery: env("AGENT_DISCOVERY_QUERY") ?? DEFAULT_DISCOVERY_QUERY,
    lovableApiKey: env("LOVABLE_API_KEY"),
    isProduction,
  };
}

/**
 * Mocks are allowed only outside production. In production a missing credential
 * is a hard, visible failure instead of a silently faked generation.
 */
export function assertProductionReady(config: DearDiaryConfig): string[] {
  if (!config.isProduction) return [];
  const missing: string[] = [];
  if (!config.scanApiKey) missing.push("8004SCAN_API_KEY");
  if (!config.facilitatorUrl) missing.push("X402_FACILITATOR_URL");
  if (!config.feeWallet) missing.push("DEAR_DIARY_FEE_WALLET");
  return missing;
}

export function useMockDiscovery(config: DearDiaryConfig): boolean {
  return !config.isProduction && !config.scanApiKey;
}

export function useMockPayments(config: DearDiaryConfig): boolean {
  return !config.isProduction && !config.facilitatorUrl;
}
