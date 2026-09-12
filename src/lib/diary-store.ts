import { useSyncExternalStore } from "react";
import type { Mood, PaymentReceipt } from "./protocol";

import art1 from "@/assets/art-1.jpg";
import art2 from "@/assets/art-2.jpg";
import art3 from "@/assets/art-3.jpg";
import art4 from "@/assets/art-4.jpg";
import art5 from "@/assets/art-5.jpg";
import art6 from "@/assets/art-6.jpg";

export const ARTWORK_POOL = [art1, art2, art3, art4, art5, art6];

export type MemoryStatus = "saved" | "published" | "gifted" | "minted" | "listed";

export interface Memory {
  id: string;
  title: string;
  story: string;
  mood: Mood;
  imageUrl: string;
  author: { name: string; handle: string; avatarTone: string };
  createdAt: string;
  status: MemoryStatus;
  hearts: number;
  keepsakes: number;
  giftedTo?: string;
  collectible?: { tokenId: string; chain: string; editions: number; priceUsd: number };
  receipt?: PaymentReceipt;
}

const you = { name: "Mira", handle: "@mira", avatarTone: "bg-blush" };

const seed: Memory[] = [
  {
    id: "m1",
    title: "The rooftop we never told anyone about",
    story:
      "We climbed up with warm cans and stayed until the city turned orange. Nobody spoke for a while. It was the last good evening of that summer.",
    mood: "warm",
    imageUrl: art1,
    author: you,
    createdAt: "2 days ago",
    status: "published",
    hearts: 248,
    keepsakes: 31,
  },
  {
    id: "m2",
    title: "Lake morning, no phone",
    story:
      "Dad rowed out before sunrise. The water was so still it felt rude to move. I remember the sound of the oars more than anything else.",
    mood: "quiet",
    imageUrl: art2,
    author: { name: "Theo", handle: "@theo", avatarTone: "bg-sky" },
    createdAt: "5 days ago",
    status: "minted",
    hearts: 512,
    keepsakes: 88,
    collectible: { tokenId: "m2-4821", chain: "Base", editions: 25, priceUsd: 9 },
  },
  {
    id: "m3",
    title: "Grandma's kitchen at 7am",
    story:
      "Steam on the window, tea too hot to drink, her radio humming. I can still smell the lemon soap on the counter.",
    mood: "bright",
    imageUrl: art3,
    author: { name: "Ana", handle: "@anaflora", avatarTone: "bg-butter" },
    createdAt: "1 week ago",
    status: "gifted",
    hearts: 386,
    keepsakes: 54,
    giftedTo: "@lucia",
  },
  {
    id: "m4",
    title: "First snow on Wren Street",
    story:
      "Everyone's windows were gold and the whole street went silent at once. I walked slower than I needed to.",
    mood: "dreamy",
    imageUrl: art4,
    author: { name: "Nils", handle: "@nils", avatarTone: "bg-grape" },
    createdAt: "2 weeks ago",
    status: "published",
    hearts: 174,
    keepsakes: 12,
  },
  {
    id: "m5",
    title: "Biscuit meets the ocean",
    story:
      "She had never seen water bigger than a bathtub. She ran at it like it owed her something.",
    mood: "bright",
    imageUrl: art5,
    author: you,
    createdAt: "3 weeks ago",
    status: "listed",
    hearts: 921,
    keepsakes: 143,
    collectible: { tokenId: "m5-1190", chain: "Base", editions: 50, priceUsd: 12 },
  },
  {
    id: "m6",
    title: "The spring I learned to slow down",
    story:
      "I stopped under the blossom tree on the way home every day for a week. Nothing happened. That was the point.",
    mood: "dreamy",
    imageUrl: art6,
    author: you,
    createdAt: "1 month ago",
    status: "saved",
    hearts: 63,
    keepsakes: 4,
  },
];

let memories: Memory[] = seed;
const listeners = new Set<() => void>();

function emit() {
  memories = [...memories];
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useMemories(): Memory[] {
  return useSyncExternalStore(
    subscribe,
    () => memories,
    () => memories,
  );
}

export function useMemory(id: string): Memory | undefined {
  return useMemories().find((m) => m.id === id);
}

export function getMemory(id: string) {
  return memories.find((m) => m.id === id);
}

export function addMemory(memory: Memory) {
  memories = [memory, ...memories];
  emit();
}

export function updateMemory(id: string, patch: Partial<Memory>) {
  memories = memories.map((m) => (m.id === id ? { ...m, ...patch } : m));
  emit();
}

export const CURRENT_USER = you;

export const MOOD_LABEL: Record<Mood, string> = {
  warm: "Warm",
  dreamy: "Dreamy",
  bright: "Bright",
  quiet: "Quiet",
};

export const MOOD_TONE: Record<Mood, string> = {
  warm: "bg-blush text-blush-foreground",
  dreamy: "bg-grape text-grape-foreground",
  bright: "bg-butter text-butter-foreground",
  quiet: "bg-mint text-mint-foreground",
};

export const STATUS_LABEL: Record<MemoryStatus, string> = {
  saved: "In your diary",
  published: "Published",
  gifted: "Gifted",
  minted: "Minted",
  listed: "For sale",
};
