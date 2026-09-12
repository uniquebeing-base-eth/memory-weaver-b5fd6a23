/**
 * Memory validation + visual interpretation.
 * The user's raw memory is never sent blindly to an image model: it is first
 * turned into a structured visual interpretation that preserves their details.
 */

import { getConfig } from "./config.server";
import { countWords, MIN_MEMORY_WORDS, type VisualInterpretation } from "./types";

export type InterpretationOutcome =
  | { ok: true; interpretation: VisualInterpretation }
  | { ok: false; code: "memory_too_short" | "insufficient_visual_detail"; followUp: string };

const SYSTEM_PROMPT = `You turn a personal memory into a faithful visual interpretation for an image generation agent.

Rules:
- Preserve the specific details the person wrote: who, where, weather, time of day, objects, actions, mood.
- NEVER invent major people, locations, events, objects or circumstances that the memory does not support.
- Small atmospheric touches are fine; new story elements are not.
- If the memory has no usable visual information (no place, no people/objects, no action or atmosphere), set sufficient=false and give ONE short, warm follow-up question asking for one extra detail.

Return ONLY JSON matching:
{
  "sufficient": boolean,
  "followUp": string,
  "title": string,
  "subjects": string[],
  "relationships": string[],
  "actions": string[],
  "setting": string,
  "location": string,
  "objects": string[],
  "time": string,
  "weather": string,
  "distinctiveDetails": string[],
  "emotionalTone": string,
  "composition": string,
  "viewpoint": string,
  "style": string,
  "prompt": string
}

"prompt" is a single rich paragraph describing exactly the scene in the memory, in a warm, painterly illustration style, mentioning every preserved detail.`;

function heuristicInterpretation(memory: string): VisualInterpretation {
  const clean = memory.trim().replace(/\s+/g, " ");
  return {
    subjects: [],
    relationships: [],
    actions: [],
    setting: "",
    location: "",
    objects: [],
    time: "",
    weather: "",
    distinctiveDetails: [],
    emotionalTone: "nostalgic",
    composition: "intimate mid-shot",
    viewpoint: "eye level",
    style: "warm painterly illustration, soft light, gentle grain",
    title: clean.split(/[.!?]/)[0]?.slice(0, 60) || "Untitled memory",
    prompt: `A warm painterly illustration that faithfully depicts this remembered moment, keeping every detail exactly as described and inventing nothing new: ${clean}. Soft nostalgic light, gentle grain, intimate composition at eye level.`,
  };
}

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function s(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export async function interpretMemory(memory: string): Promise<InterpretationOutcome> {
  const words = countWords(memory);
  if (words < MIN_MEMORY_WORDS) {
    return {
      ok: false,
      code: "memory_too_short",
      followUp: "Tell us a little more about this memory.",
    };
  }

  const { lovableApiKey } = getConfig();
  if (!lovableApiKey) {
    return { ok: true, interpretation: heuristicInterpretation(memory) };
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-3.8-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: memory.trim() },
      ],
    }),
  });

  if (!response.ok) {
    // Interpretation is best-effort: fall back rather than block the memory.
    return { ok: true, interpretation: heuristicInterpretation(memory) };
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const parsed = extractJson(payload.choices?.[0]?.message?.content ?? "");
  if (!parsed) return { ok: true, interpretation: heuristicInterpretation(memory) };

  if (parsed["sufficient"] === false) {
    return {
      ok: false,
      code: "insufficient_visual_detail",
      followUp:
        s(parsed["followUp"]) ||
        "Could you add one more detail — where you were, or what you could see?",
    };
  }

  const fallback = heuristicInterpretation(memory);
  return {
    ok: true,
    interpretation: {
      subjects: strList(parsed["subjects"]),
      relationships: strList(parsed["relationships"]),
      actions: strList(parsed["actions"]),
      setting: s(parsed["setting"]),
      location: s(parsed["location"]),
      objects: strList(parsed["objects"]),
      time: s(parsed["time"]),
      weather: s(parsed["weather"]),
      distinctiveDetails: strList(parsed["distinctiveDetails"]),
      emotionalTone: s(parsed["emotionalTone"], fallback.emotionalTone),
      composition: s(parsed["composition"], fallback.composition),
      viewpoint: s(parsed["viewpoint"], fallback.viewpoint),
      style: s(parsed["style"], fallback.style),
      title: s(parsed["title"], fallback.title).slice(0, 70),
      prompt: s(parsed["prompt"], fallback.prompt),
    },
  };
}
