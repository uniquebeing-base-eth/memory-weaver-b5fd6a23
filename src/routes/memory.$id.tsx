import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Gift,
  Heart,
  Share2,
  Sparkles,
  Tag,
  Check,
  Loader2,
  X,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import {
  MOOD_LABEL,
  MOOD_TONE,
  STATUS_LABEL,
  updateMemory,
  useMemory,
} from "@/lib/diary-store";
import { giftMemory, listForSale, mintMemory } from "@/lib/protocol";
import mascot from "@/assets/mascot.png";

export const Route = createFileRoute("/memory/$id")({
  head: () => ({
    meta: [
      { title: "A memory — Dear Diary" },
      {
        name: "description",
        content: "A memory turned into artwork. Keep it, gift it, or mint it as a collectible.",
      },
      { property: "og:title", content: "A memory — Dear Diary" },
      { property: "og:description", content: "A memory turned into artwork on Dear Diary." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MemoryDetail,
});

type Sheet = "gift" | "mint" | "sell" | null;

function MemoryDetail() {
  const { id } = Route.useParams();
  const memory = useMemory(id);
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [liked, setLiked] = useState(false);

  if (!memory) {
    return (
      <Screen>
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-8 text-center">
          <img src={mascot} alt="" width={768} height={768} className="w-28" />
          <h1 className="text-2xl font-semibold">That page is empty</h1>
          <Link to="/" className="press rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">
            Back home
          </Link>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <header className="flex items-center justify-between px-6 pt-7">
        <button
          onClick={() => navigate({ to: "/" })}
          aria-label="Back"
          className="press grid h-10 w-10 place-items-center rounded-full bg-card shadow-soft"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          aria-label="Share"
          className="press grid h-10 w-10 place-items-center rounded-full bg-card shadow-soft"
        >
          <Share2 className="h-4 w-4" />
        </button>
      </header>

      <section className="animate-rise px-6 pt-4">
        <div className="surface-card overflow-hidden p-2.5">
          <img
            src={memory.imageUrl}
            alt={memory.title}
            width={1024}
            height={1024}
            className="aspect-square w-full rounded-[2rem] object-cover"
          />
        </div>
      </section>

      <section className="px-6 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-[0.7rem] font-bold ${MOOD_TONE[memory.mood]}`}>
            {MOOD_LABEL[memory.mood]}
          </span>
          <span className="rounded-full bg-secondary px-3 py-1 text-[0.7rem] font-bold text-secondary-foreground">
            {STATUS_LABEL[memory.status]}
          </span>
          <span className="text-xs font-semibold text-muted-foreground">{memory.createdAt}</span>
        </div>
        <h1 className="mt-3 text-[2.1rem] leading-[1.02] font-semibold">{memory.title}</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{memory.story}</p>

        {memory.giftedTo && (
          <p className="mt-4 rounded-2xl bg-blush px-4 py-3 text-sm font-semibold text-blush-foreground">
            Gifted to {memory.giftedTo} 💌
          </p>
        )}
        {memory.collectible && (
          <div className="mt-4 rounded-2xl bg-sky px-4 py-3 text-sm font-semibold text-sky-foreground">
            Minted on {memory.collectible.chain} · #{memory.collectible.tokenId} ·{" "}
            {memory.collectible.editions} editions
          </div>
        )}
      </section>

      <section className="flex items-center gap-3 px-6 pt-5">
        <button
          onClick={() => {
            setLiked((v) => !v);
            updateMemory(memory.id, { hearts: memory.hearts + (liked ? -1 : 1) });
          }}
          className={`press flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold ${
            liked ? "bg-primary text-primary-foreground" : "bg-card shadow-soft"
          }`}
        >
          <Heart className="h-4 w-4" /> {memory.hearts}
        </button>
        <span className="flex items-center gap-2 rounded-full bg-card px-4 py-2.5 text-sm font-bold shadow-soft">
          <Sparkles className="h-4 w-4" /> {memory.keepsakes} kept
        </span>
      </section>

      <section className="grid grid-cols-2 gap-3 px-6 pt-6">
        <button
          onClick={() => setSheet("gift")}
          className="press col-span-2 flex items-center justify-center gap-2 rounded-full bg-primary py-4 text-base font-bold text-primary-foreground"
        >
          <Gift className="h-4 w-4" /> Gift a Memory
        </button>
        <button
          onClick={() => setSheet("mint")}
          className="press flex items-center justify-center gap-2 rounded-2xl bg-butter py-4 text-sm font-bold text-butter-foreground"
        >
          <Sparkles className="h-4 w-4" /> Mint Memory
        </button>
        <button
          onClick={() => setSheet("sell")}
          className="press flex items-center justify-center gap-2 rounded-2xl bg-mint py-4 text-sm font-bold text-mint-foreground"
        >
          <Tag className="h-4 w-4" /> Sell Memory
        </button>
      </section>

      {sheet && (
        <Sheets kind={sheet} memoryId={memory.id} title={memory.title} imageUrl={memory.imageUrl} onClose={() => setSheet(null)} />
      )}
    </Screen>
  );
}

function Sheets({
  kind,
  memoryId,
  title,
  imageUrl,
  onClose,
}: {
  kind: Exclude<Sheet, null>;
  memoryId: string;
  title: string;
  imageUrl: string;
  onClose: () => void;
}) {
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [editions, setEditions] = useState(25);
  const [price, setPrice] = useState(9);
  const [state, setState] = useState<"idle" | "working" | "done">("idle");

  async function run() {
    setState("working");
    if (kind === "gift") {
      const r = await giftMemory(memoryId, to || "@friend", note);
      updateMemory(memoryId, { status: "gifted", giftedTo: r.to });
    } else if (kind === "mint") {
      const c = await mintMemory(memoryId, { editions, priceUsd: price });
      updateMemory(memoryId, { status: "minted", collectible: { ...c, priceUsd: price } });
    } else {
      await listForSale(memoryId, price);
      updateMemory(memoryId, { status: "listed" });
    }
    setState("done");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm">
      <div className="animate-rise w-[min(30rem,100%)] rounded-t-[2.5rem] bg-card p-6 pb-10 shadow-lift">
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-border" />
        <button
          onClick={onClose}
          aria-label="Close"
          className="press absolute right-6 grid h-9 w-9 -translate-y-1 place-items-center rounded-full bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>

        {state === "done" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-mint text-mint-foreground">
              <Check className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-semibold">
              {kind === "gift" ? "Memory sent" : kind === "mint" ? "Minted" : "It's for sale"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {kind === "gift"
                ? `${to || "@friend"} will find it in their diary.`
                : kind === "mint"
                  ? `${editions} editions live on Base.`
                  : `Listed at $${price}.`}
            </p>
            <button
              onClick={onClose}
              className="press mt-3 w-full rounded-full bg-primary py-3.5 text-sm font-bold text-primary-foreground"
            >
              Nice
            </button>
          </div>
        ) : kind === "gift" ? (
          <>
            <h2 className="text-2xl font-semibold">Gift a Memory</h2>
            <p className="mt-1 text-sm text-muted-foreground">Send this artwork to someone who was there.</p>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="@username"
              className="mt-5 w-full rounded-2xl bg-secondary px-4 py-3.5 text-sm font-semibold outline-none"
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Add a note…"
              className="mt-3 w-full resize-none rounded-2xl bg-secondary px-4 py-3.5 text-sm outline-none"
            />
            <Action label="Send the gift" state={state} onClick={run} />
          </>
        ) : kind === "mint" ? (
          <>
            <div className="relative overflow-hidden rounded-[2rem] gradient-dream p-5">
              <img
                src={imageUrl}
                alt={title}
                loading="lazy"
                width={1024}
                height={1024}
                className="mx-auto aspect-square w-40 rotate-[-3deg] rounded-2xl object-cover shadow-lift"
              />
              <p className="mt-4 text-center font-display text-xl leading-tight text-ink">{title}</p>
              <p className="mt-1 text-center text-[0.7rem] font-bold uppercase tracking-[0.2em] text-grape-foreground">
                Dear Diary Collectible
              </p>
            </div>
            <h2 className="mt-5 text-2xl font-semibold">Mint Memory</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Editions" value={editions} onChange={setEditions} />
              <Field label="Price ($)" value={price} onChange={setPrice} />
            </div>
            <Action label="Mint it" state={state} onClick={run} />
          </>
        ) : (
          <>
            <h2 className="text-2xl font-semibold">Sell Memory</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Set a price. Dear Diary keeps 10%, the rest is yours.
            </p>
            <div className="mt-4">
              <Field label="Price ($)" value={price} onChange={setPrice} />
            </div>
            <p className="mt-3 text-xs font-semibold text-muted-foreground">
              You receive ${(price * 0.9).toFixed(2)} per sale.
            </p>
            <Action label="List it" state={state} onClick={run} />
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block rounded-2xl bg-secondary px-4 py-3">
      <span className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-transparent text-lg font-bold outline-none"
      />
    </label>
  );
}

function Action({
  label,
  state,
  onClick,
}: {
  label: string;
  state: "idle" | "working" | "done";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={state === "working"}
      className="press mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 text-base font-bold text-primary-foreground disabled:opacity-60"
    >
      {state === "working" && <Loader2 className="h-4 w-4 animate-spin" />}
      {state === "working" ? "Working…" : label}
    </button>
  );
}
