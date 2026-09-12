/**
 * Image retrieval/storage. Uses the configured storage service when available,
 * otherwise keeps the returned image addressable as-is (data URL / remote URL).
 * No database is introduced for generation.
 */

import { getConfig } from "./config.server";

export async function persistImage(image: string, taskId: string): Promise<string> {
  const { imageStorageUrl, imageStorageApiKey } = getConfig();
  if (!imageStorageUrl) return image;

  try {
    const response = await fetch(imageStorageUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(imageStorageApiKey ? { Authorization: `Bearer ${imageStorageApiKey}` } : {}),
      },
      body: JSON.stringify({ key: `memory-${taskId}`, image }),
    });
    if (!response.ok) return image;
    const payload = (await response.json()) as Record<string, unknown>;
    const url = payload["url"] ?? payload["imageUrl"] ?? payload["location"];
    return typeof url === "string" && url ? url : image;
  } catch {
    return image;
  }
}

/** Validates that an agent actually returned a usable image. */
export function isUsableImage(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 24) return false;
  return (
    value.startsWith("data:image/") ||
    value.startsWith("https://") ||
    value.startsWith("http://") ||
    value.startsWith("ipfs://")
  );
}
