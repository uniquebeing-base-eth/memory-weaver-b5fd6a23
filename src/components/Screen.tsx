import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

export function Screen({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="paper-grain relative mx-auto min-h-screen w-full max-w-[30rem] overflow-hidden bg-background pb-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 gradient-glow" />
        <div className="relative">{children}</div>
      </div>
      {nav && <BottomNav />}
    </div>
  );
}
