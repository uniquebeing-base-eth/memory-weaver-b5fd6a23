/**
 * ERC-8004 agent discovery through the 8004scan registry.
 * The API key stays server-side; nothing here is importable from the browser.
 */

import { getConfig, useMockDiscovery, type DearDiaryConfig } from "./config.server";

/** Internal, normalized representation of an ERC-8004 agent registration. */
export interface NormalizedAgent {
  id: string;
  name: string;
  chain: string;
  registrationUri?: string | undefined;
  description: string;
  services: NormalizedService[];
  supportsX402: boolean;
  active: boolean;
  protocols: string[];
  capabilities: string[];
  wallet?: string | undefined;
  priceUsd?: number | undefined;
  reputation?: number | undefined;
  raw: Record<string, unknown>;
}

export interface NormalizedService {
  name: string;
  endpoint: string;
  protocol?: string | undefined;
  priceUsd?: number | undefined;
  x402: boolean;
}

const IMAGE_KEYWORDS = [
  "image",
  "text-to-image",
  "text2image",
  "txt2img",
  "visual",
  "art",
  "illustration",
  "picture",
  "render",
  "diffusion",
  "generative-art",
];

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value as object);
  return [];
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(parsed) && value.trim() !== "") return parsed;
  }
  return undefined;
}

function detectX402(record: Record<string, unknown>): boolean {
  const blob = JSON.stringify(record).toLowerCase();
  return blob.includes("x402");
}

function normalizeService(entry: unknown): NormalizedService | null {
  if (typeof entry === "string") {
    return { name: "service", endpoint: entry, x402: false };
  }
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  const endpoint =
    str(record["endpoint"]) ??
    str(record["url"]) ??
    str(record["serviceEndpoint"]) ??
    str(record["uri"]) ??
    str(record["href"]);
  if (!endpoint) return null;
  return {
    name: str(record["name"]) ?? str(record["type"]) ?? str(record["id"]) ?? "service",
    endpoint,
    protocol: str(record["protocol"]) ?? str(record["type"]) ?? str(record["transport"]),
    priceUsd:
      num(record["priceUsd"]) ??
      num(record["price"]) ??
      num((record["pricing"] as Record<string, unknown> | undefined)?.["amount"]),
    x402: detectX402(record),
  };
}

/**
 * Normalizes an ERC-8004 registration. The current `services` field is used
 * first; legacy `endpoints` is supported as a fallback.
 */
export function normalizeAgentMetadata(registration: Record<string, unknown>): NormalizedAgent {
  const rawServices =
    (registration["services"] as unknown) ?? (registration["endpoints"] as unknown) ?? [];

  const services = asArray(rawServices)
    .map(normalizeService)
    .filter((s): s is NormalizedService => s !== null);

  const metadata = (registration["metadata"] as Record<string, unknown> | undefined) ?? {};
  const registrations = asArray(registration["registrations"])[0] as
    | Record<string, unknown>
    | undefined;

  const capabilities = [
    ...asArray(registration["capabilities"] ?? metadata["capabilities"]),
    ...asArray(registration["skills"] ?? metadata["skills"]),
    ...asArray(registration["tags"] ?? metadata["tags"]),
  ]
    .map((c) =>
      typeof c === "string" ? c : str((c as Record<string, unknown> | null)?.["name"] ?? ""),
    )
    .filter((c): c is string => Boolean(c));

  const statusValue = (
    str(registration["status"]) ??
    str(metadata["status"]) ??
    ""
  ).toLowerCase();
  const activeFlag = registration["active"] ?? registration["isActive"] ?? metadata["active"];

  return {
    id:
      str(registration["agentId"]) ??
      str(registration["id"]) ??
      str(registration["agent_id"]) ??
      str(registration["address"]) ??
      `agent-${Math.random().toString(36).slice(2, 10)}`,
    name:
      str(registration["name"]) ??
      str(metadata["name"]) ??
      str(registration["agentName"]) ??
      "Unnamed agent",
    chain:
      str(registration["chain"]) ??
      str(registration["network"]) ??
      str(registrations?.["chain"]) ??
      str(registrations?.["chainId"]) ??
      "unknown",
    registrationUri:
      str(registration["registrationUri"]) ??
      str(registration["registration_uri"]) ??
      str(registration["agentCardUri"]) ??
      str(registrations?.["uri"]),
    description: str(registration["description"]) ?? str(metadata["description"]) ?? "",
    services,
    supportsX402:
      detectX402(registration) || services.some((s) => s.x402) || Boolean(registration["x402"]),
    active:
      typeof activeFlag === "boolean"
        ? activeFlag
        : statusValue === ""
          ? true
          : ["active", "live", "online", "available"].includes(statusValue),
    protocols: asArray(registration["protocols"] ?? metadata["protocols"])
      .map((p) => (typeof p === "string" ? p : ""))
      .filter(Boolean),
    capabilities,
    wallet:
      str(registration["wallet"]) ??
      str(registration["walletAddress"]) ??
      str(registration["payTo"]) ??
      str(registration["address"]),
    priceUsd:
      num(registration["priceUsd"]) ??
      num(registration["price"]) ??
      services.find((s) => s.priceUsd !== undefined)?.priceUsd,
    reputation:
      num(registration["reputation"]) ??
      num(registration["score"]) ??
      num(registration["feedbackScore"]) ??
      num((registration["feedback"] as Record<string, unknown> | undefined)?.["score"]),
    raw: registration,
  };
}

export function looksLikeImageAgent(agent: NormalizedAgent): boolean {
  const haystack = [
    agent.name,
    agent.description,
    agent.capabilities.join(" "),
    agent.services.map((s) => `${s.name} ${s.endpoint}`).join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return IMAGE_KEYWORDS.some((k) => haystack.includes(k));
}

/** Semantic discovery against the live 8004scan API. */
async function fetchFromScan(config: DearDiaryConfig): Promise<NormalizedAgent[]> {
  const url = new URL(`${config.scanBaseUrl}/agents/search/semantic`);
  url.searchParams.set("query", config.discoveryQuery);
  url.searchParams.set("limit", "25");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-api-key": config.scanApiKey ?? "",
      Authorization: `Bearer ${config.scanApiKey ?? ""}`,
    },
  });

  if (!response.ok) {
    throw new Error(`8004scan discovery failed (${response.status})`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const items =
    (payload["results"] as unknown) ??
    (payload["agents"] as unknown) ??
    (payload["data"] as unknown) ??
    payload;

  return asArray(items)
    .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object")
    .map((item) =>
      normalizeAgentMetadata(
        (item["agent"] as Record<string, unknown> | undefined) ??
          (item["registration"] as Record<string, unknown> | undefined) ??
          item,
      ),
    );
}

/** Local development registry: one in-process studio agent, clearly marked. */
function mockAgents(config: DearDiaryConfig): NormalizedAgent[] {
  return [
    {
      id: "mock:dear-diary-studio",
      name: "Dear Diary Studio (development)",
      chain: config.network,
      description: "Local development image generation agent for text-to-image memory artwork.",
      services: [
        {
          name: "image-generation",
          endpoint: "mock://image-generation",
          protocol: "http",
          priceUsd: 0.1,
          x402: true,
        },
      ],
      supportsX402: true,
      active: true,
      protocols: ["http", "x402"],
      capabilities: ["image-generation", "text-to-image", "creative image generation"],
      priceUsd: 0.1,
      reputation: 0.9,
      raw: {},
    },
  ];
}

export async function discoverAgents(): Promise<NormalizedAgent[]> {
  const config = getConfig();
  if (useMockDiscovery(config)) return mockAgents(config);
  return fetchFromScan(config);
}
