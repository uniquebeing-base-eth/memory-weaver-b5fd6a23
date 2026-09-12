/**
 * Provider-independent image generation agent adapter.
 * The rest of Dear Diary never knows which agent produced the artwork.
 */

import { getConfig } from "./config.server";
import type { NormalizedAgent } from "./discovery.server";
import { getAgentPrice } from "./selection.server";
import { isUsableImage } from "./storage.server";
import type { GenerationStatus } from "./types";

export interface AgentGenerateInput {
  prompt: string;
  originalMemory: string;
  /** Signed x402 payment payload for this agent, when payment is required. */
  paymentHeader?: string;
}

export interface AgentGenerateOutput {
  imageUrl?: string;
  status: GenerationStatus;
  /** Polling handle for agents that answer asynchronously. */
  pollUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface ImageGenerationAgent {
  id: string;
  name: string;
  price: string;
  network?: string;
  supportsX402: boolean;
  generate(input: AgentGenerateInput): Promise<AgentGenerateOutput>;
  /** Optional async completion check. */
  poll?(pollUrl: string): Promise<AgentGenerateOutput>;
}

function pickImage(payload: unknown): string | undefined {
  if (isUsableImage(payload)) return payload;
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const direct = [
    record["imageUrl"],
    record["image_url"],
    record["image"],
    record["url"],
    record["output"],
    record["result"],
  ];
  for (const value of direct) {
    if (isUsableImage(value)) return value;
    if (value && typeof value === "object") {
      const nested = pickImage(value);
      if (nested) return nested;
    }
  }
  const b64 = record["b64_json"] ?? record["base64"];
  if (typeof b64 === "string" && b64.length > 100) return `data:image/png;base64,${b64}`;
  if (Array.isArray(record["data"])) {
    for (const entry of record["data"]) {
      const nested = pickImage(entry);
      if (nested) return nested;
    }
  }
  return undefined;
}

function statusOf(payload: Record<string, unknown>): GenerationStatus | undefined {
  const raw = String(payload["status"] ?? payload["state"] ?? "").toLowerCase();
  if (["pending", "queued", "accepted"].includes(raw)) return "pending";
  if (["processing", "running", "in_progress"].includes(raw)) return "processing";
  if (["completed", "succeeded", "success", "done"].includes(raw)) return "completed";
  if (["failed", "error", "cancelled"].includes(raw)) return "failed";
  return undefined;
}

/** Real ERC-8004 agent reached over HTTP, paid with x402 when required. */
function httpAgent(agent: NormalizedAgent): ImageGenerationAgent {
  const endpoint = agent.services[0]?.endpoint ?? "";

  async function request(input: AgentGenerateInput): Promise<AgentGenerateOutput> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(input.paymentHeader ? { "X-PAYMENT": input.paymentHeader } : {}),
      },
      body: JSON.stringify({
        prompt: input.prompt,
        input: { prompt: input.prompt },
        memory: input.originalMemory,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (response.status === 402) throw new Error("payment_required");
    if (!response.ok) throw new Error(`Agent responded ${response.status}`);

    const payload = (await response.json()) as Record<string, unknown>;
    const imageUrl = pickImage(payload);
    const pollUrl =
      (payload["pollUrl"] as string) ??
      (payload["statusUrl"] as string) ??
      (payload["taskUrl"] as string);
    const status = statusOf(payload) ?? (imageUrl ? "completed" : pollUrl ? "processing" : "failed");

    return {
      ...(imageUrl ? { imageUrl } : {}),
      status,
      ...(pollUrl ? { pollUrl } : {}),
      metadata: { agentId: agent.id },
    };
  }

  return {
    id: agent.id,
    name: agent.name,
    price: getAgentPrice(agent).toFixed(2),
    network: agent.chain,
    supportsX402: agent.supportsX402,
    generate: request,
    async poll(pollUrl: string) {
      const response = await fetch(pollUrl, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Agent polling failed (${response.status})`);
      const payload = (await response.json()) as Record<string, unknown>;
      const imageUrl = pickImage(payload);
      return {
        ...(imageUrl ? { imageUrl } : {}),
        status: statusOf(payload) ?? (imageUrl ? "completed" : "processing"),
      };
    },
  };
}

/** Development-only agent so the full flow can be exercised without credentials. */
function mockAgent(agent: NormalizedAgent): ImageGenerationAgent {
  return {
    id: agent.id,
    name: agent.name,
    price: getAgentPrice(agent).toFixed(2),
    network: agent.chain,
    supportsX402: true,
    async generate(input) {
      const { lovableApiKey } = getConfig();
      if (!lovableApiKey) throw new Error("No development image provider configured.");

      const response = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableApiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image",
          messages: [{ role: "user", content: input.prompt }],
          modalities: ["image", "text"],
        }),
      });

      if (!response.ok) throw new Error(`Development agent failed (${response.status})`);
      const payload = (await response.json()) as Record<string, unknown>;
      const imageUrl = pickImage(payload);
      if (!imageUrl) throw new Error("Development agent returned no image.");
      return { imageUrl, status: "completed", metadata: { development: true } };
    },
  };
}

export function toImageGenerationAgent(agent: NormalizedAgent): ImageGenerationAgent {
  return agent.id.startsWith("mock:") ? mockAgent(agent) : httpAgent(agent);
}
