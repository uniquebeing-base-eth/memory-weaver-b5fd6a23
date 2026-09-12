import { Link } from "@tanstack/react-router";
import { Heart, Sparkles } from "lucide-react";
import { MOOD_LABEL, MOOD_TONE, STATUS_LABEL, type Memory } from "@/lib/diary-store";

export function MemoryCard({ memory, index = 0 }: { memory: Memory; index?: number }) {
  return (
    <Link
      to="/memory/$id"
      params={{ id: memory.id }}
      className="press animate-rise block"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <article className="surface-card overflow-hidden">
        <div className="relative aspect-square overflow-hidden rounded-[calc(var(--radius)+24px)] p-2">
          <img
            src={memory.imageUrl}
            alt={memory.title}
            loading="lazy"
            width={1024}
            height={1024}
            className="h-full w-full rounded-[calc(var(--radius)+16px)] object-cover"
          />
          <span
            className={`absolute left-5 top-5 rounded-full px-3 py-1 text-[0.7rem] font-bold ${MOOD_TONE[memory.mood]}`}
          >
            {MOOD_LABEL[memory.mood]}
          </span>
          {memory.status !== "saved" && (
            <span className="absolute right-5 top-5 rounded-full bg-card/90 px-3 py-1 text-[0.7rem] font-bold text-foreground backdrop-blur">
              {STATUS_LABEL[memory.status]}
            </span>
          )}
        </div>
        <div className="space-y-3 px-5 pb-5 pt-3">
          <h3 className="text-[1.35rem] leading-[1.15] font-semibold">{memory.title}</h3>
          <p className="line-clamp-2 text-sm text-muted-foreground">{memory.story}</p>
          <div className="flex items-center justify-between pt-1 text-xs font-semibold text-muted-foreground">
            <span className="flex items-center gap-2">
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-[0.65rem] text-foreground ${memory.author.avatarTone}`}
              >
                {memory.author.name[0]}
              </span>
              {memory.author.handle}
            </span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Heart className="h-3.5 w-3.5" /> {memory.hearts}
              </span>
              <span className="flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" /> {memory.keepsakes}
              </span>
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
