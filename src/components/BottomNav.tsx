import { Link, useRouterState } from "@tanstack/react-router";
import { Home, PenLine, BookHeart, Smile } from "lucide-react";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/create", label: "Create", icon: PenLine },
  { to: "/diary", label: "My Diary", icon: BookHeart },
  { to: "/profile", label: "Profile", icon: Smile },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-5">
      <div className="pointer-events-auto flex w-[min(26rem,calc(100%-2rem))] items-center justify-between rounded-full border border-border bg-card/95 p-1.5 shadow-lift backdrop-blur">
        {items.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              aria-label={label}
              className={`press flex flex-1 flex-col items-center gap-0.5 rounded-full py-2.5 text-[0.65rem] font-semibold ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
