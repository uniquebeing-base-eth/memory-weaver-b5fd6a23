/**
 * Agent selection layer:
 * discoverAgents -> normalize -> filter (image / active / x402) -> rank -> select.
 * Dear Diary never depends on one hard-coded agent.
 */

import { getConfig } from "./config.server";
import { discoverAgents, looksLikeImageAgent, type NormalizedAgent } from "./discovery.server";

export function filterImageGenerationAgents(agents: NormalizedAgent[]): NormalizedAgent[] {
  return agents.filter(looksLikeImageAgent);
}

export function filterActiveAgents(agents: NormalizedAgent[]): NormalizedAgent[] {
  return agents.filter((a) => a.active && a.services.some((s) => Boolean(s.endpoint)));
}

export function filterX402CompatibleAgents(agents: NormalizedAgent[]): NormalizedAgent[] {
  const compatible = agents.filter((a) => a.supportsX402);
  // x402 is preferred, not mandatory: a free/open agent is still usable.
  return compatible.length > 0 ? compatible : agents;
}

function endpointQuality(agent: NormalizedAgent): number {
  const endpoint = agent.services[0]?.endpoint ?? "";
  if (endpoint.startsWith("https://")) return 1;
  if (endpoint.startsWith("mock://")) return 0.8;
  if (endpoint.startsWith("http://")) return 0.4;
  return 0.1;
}

export function scoreAgent(agent: NormalizedAgent, baseNetwork: string): number {
  const price = agent.priceUsd ?? 0.1;
  const baseChain = baseNetwork.split(":")[1] ?? "8453";
  const onBase = agent.chain.includes("8453") || agent.chain.includes(baseChain);

  return (
    (looksLikeImageAgent(agent) ? 3 : 0) +
    (agent.supportsX402 ? 2 : 0) +
    (onBase ? 1.5 : 0) +
    Math.max(0, 1 - price * 2) +
    (agent.active ? 1 : 0) +
    endpointQuality(agent) +
    Math.min(1, agent.reputation ?? 0)
  );
}

export function rankAgents(agents: NormalizedAgent[]): NormalizedAgent[] {
  const { network } = getConfig();
  return [...agents].sort((a, b) => scoreAgent(b, network) - scoreAgent(a, network));
}

export function selectBestAgent(agents: NormalizedAgent[]): NormalizedAgent | undefined {
  return rankAgents(agents)[0];
}

/** Full pipeline. Returns the ranked candidate list (best first). */
export async function findCandidateAgents(): Promise<NormalizedAgent[]> {
  const discovered = await discoverAgents();
  const imageAgents = filterImageGenerationAgents(discovered);
  const active = filterActiveAgents(imageAgents);
  const compatible = filterX402CompatibleAgents(active);
  return rankAgents(compatible);
}

export function getAgentPrice(agent: NormalizedAgent): number {
  const price = agent.priceUsd ?? agent.services.find((s) => s.priceUsd)?.priceUsd ?? 0.1;
  return Number(price.toFixed(4));
}
