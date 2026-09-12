import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Screen } from "@/components/Screen";
import { MemoryCard } from "@/components/MemoryCard";
import { CURRENT_USER, useMemories } from "@/lib/diary-store";
import mascot from "@/assets/mascot.png";

export const Route = createFileRoute("/diary")({
  head: () => ({
    meta: [
      { title: "My Diary — Dear Diary" },
      { name: "description", content: "Every memory you've made, kept, gifted or minted." },
      { property: "og:title", content: "My Diary — Dear Diary" },
      { property: "og:description", content: "Your album of memories turned into artwork." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyDiary,
});

const tabs = ["All", "Kept", "Published", "Gifted", "Minted"] as const;

function MyDiary() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("All");
  const mine = useMemories().filter((m) => m.author.handle === CURRENT_USER.handle);

  const filtered = mine.filter((m) => {
    if (tab === "All") return true;
    if (tab === "Kept") return m.status === "saved";
    if (tab === "Published") return m.status === "published";
    if (tab === "Gifted") return m.status === "gifted";
    return m.status === "minted" || m.status === "listed";
  });

  return (
    <Screen>
      <header className="px-6 pt-7">
        <p className="text-sm font-semibold text-muted-foreground">{mine.length} memories</p>
        <h1 className="text-[2.4rem] leading-none font-semibold">My Diary</h1>
      </header>

      <div className="mt-5 flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none]">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`press whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${
              tab === t ? "bg-primary text-primary-foreground" : "bg-card shadow-soft"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <section className="space-y-4 px-6 pt-6">
        {filtered.length === 0 ? (
          <div className="surface-card flex flex-col items-center gap-3 p-10 text-center">
            <img src={mascot} alt="" loading="lazy" width={768} height={768} className="w-24" />
            <p className="font-display text-xl">Nothing here yet</p>
            <Link
              to="/create"
              className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Create a Memory
            </Link>
          </div>
        ) : (
          filtered.map((m, i) => <MemoryCard key={m.id} memory={m} index={i} />)
        )}
      </section>
    </Screen>
  );
}
