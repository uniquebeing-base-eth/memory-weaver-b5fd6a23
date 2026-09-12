import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Wallet, Bell, Palette, ShieldCheck } from "lucide-react";
import { Screen } from "@/components/Screen";
import { CURRENT_USER, useMemories } from "@/lib/diary-store";
import mascot from "@/assets/mascot.png";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Dear Diary" },
      { name: "description", content: "Your Dear Diary profile, wallet and memory stats." },
      { property: "og:title", content: "Profile — Dear Diary" },
      { property: "og:description", content: "Your Dear Diary profile and memory stats." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Profile,
});

const rows = [
  { icon: Wallet, label: "Wallet", value: "0x4f…9ac2" },
  { icon: Bell, label: "Notifications", value: "On" },
  { icon: Palette, label: "Diary cover", value: "Sunrise" },
  { icon: ShieldCheck, label: "Your memories are yours", value: "Onchain" },
];

function Profile() {
  const mine = useMemories().filter((m) => m.author.handle === CURRENT_USER.handle);
  const hearts = mine.reduce((s, m) => s + m.hearts, 0);
  const minted = mine.filter((m) => m.status === "minted" || m.status === "listed").length;

  return (
    <Screen>
      <section className="px-6 pt-7">
        <div className="relative overflow-hidden rounded-[2.5rem] gradient-dream p-6">
          <div className="relative z-10">
            <div className={`grid h-16 w-16 place-items-center rounded-full text-2xl font-bold ${CURRENT_USER.avatarTone}`}>
              {CURRENT_USER.name[0]}
            </div>
            <h1 className="mt-4 text-[2rem] leading-none font-semibold text-ink">{CURRENT_USER.name}</h1>
            <p className="text-sm font-semibold text-grape-foreground">{CURRENT_USER.handle}</p>
          </div>
          <img
            src={mascot}
            alt=""
            loading="lazy"
            width={768}
            height={768}
            className="animate-float pointer-events-none absolute -bottom-6 right-0 w-28"
          />
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3 px-6 pt-5">
        {[
          { k: "Memories", v: mine.length },
          { k: "Hearts", v: hearts },
          { k: "Minted", v: minted },
        ].map((s) => (
          <div key={s.k} className="surface-card p-4 text-center">
            <p className="font-display text-2xl">{s.v}</p>
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {s.k}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-6 px-6">
        <div className="surface-card divide-y divide-border overflow-hidden">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 px-5 py-4">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary">
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm font-bold">{label}</span>
              <span className="text-sm font-semibold text-muted-foreground">{value}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          ))}
        </div>
      </section>

      <div className="px-6 pt-6">
        <Link
          to="/create"
          className="press flex w-full items-center justify-center rounded-full bg-primary py-4 text-base font-bold text-primary-foreground"
        >
          Create a Memory
        </Link>
      </div>
    </Screen>
  );
}
