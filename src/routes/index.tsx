import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { Screen } from "@/components/Screen";
import { MemoryCard } from "@/components/MemoryCard";
import { useMemories, CURRENT_USER } from "@/lib/diary-store";
import mascot from "@/assets/mascot.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dear Diary — Turn memories into artwork" },
      {
        name: "description",
        content:
          "Write a memory, get a one-of-a-kind artwork back. Save it, publish it, gift it, or mint it as a collectible.",
      },
      { property: "og:title", content: "Dear Diary — Turn memories into artwork" },
      {
        property: "og:description",
        content: "Write a memory, get artwork back. Save, gift, or mint your memories.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const prompts = [
  { label: "A place you miss", tone: "bg-blush text-blush-foreground" },
  { label: "Someone's laugh", tone: "bg-mint text-mint-foreground" },
  { label: "A small win", tone: "bg-butter text-butter-foreground" },
  { label: "A first time", tone: "bg-sky text-sky-foreground" },
];

function Home() {
  const memories = useMemories();
  const feed = memories.filter((m) => m.status !== "saved");

  return (
    <Screen>
      <header className="flex items-center justify-between px-6 pt-7">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Hi {CURRENT_USER.name} 👋</p>
          <h1 className="text-2xl font-semibold">Dear Diary</h1>
        </div>
        <Link
          to="/profile"
          className={`press grid h-11 w-11 place-items-center rounded-full text-base font-bold ${CURRENT_USER.avatarTone}`}
          aria-label="Profile"
        >
          {CURRENT_USER.name[0]}
        </Link>
      </header>

      <section className="px-6 pt-6">
        <div className="relative overflow-hidden rounded-[2.5rem] gradient-warm p-6 shadow-lift">
          <div className="relative z-10 max-w-[62%]">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blush-foreground">
              Today's page
            </p>
            <h2 className="mt-2 text-[2.1rem] leading-[0.95] font-semibold text-ink">
              What do you
              <br />
              want to
              <br />
              remember?
            </h2>
            <Link
              to="/create"
              className="press mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
            >
              Create a Memory <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <img
            src={mascot}
            alt="Dear Diary mascot"
            width={768}
            height={768}
            className="animate-float pointer-events-none absolute -bottom-4 -right-3 w-40 drop-shadow-xl"
          />
        </div>
      </section>

      <section className="pt-7">
        <h3 className="px-6 text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Need a nudge?
        </h3>
        <div className="mt-3 flex gap-2.5 overflow-x-auto px-6 pb-1 [scrollbar-width:none]">
          {prompts.map((p) => (
            <Link
              key={p.label}
              to="/create"
              search={{ seed: p.label }}
              className={`press whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold ${p.tone}`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-4 px-6 pt-8">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xl font-semibold">Memories today</h3>
          <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> fresh
          </span>
        </div>
        {feed.map((m, i) => (
          <MemoryCard key={m.id} memory={m} index={i} />
        ))}
      </section>
    </Screen>
  );
}
