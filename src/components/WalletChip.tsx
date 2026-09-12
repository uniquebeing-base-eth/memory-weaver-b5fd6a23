import { Wallet } from "lucide-react";

import { useWallet } from "@/hooks/useWallet";

/**
 * Small wallet row. Users see only "connect" and their short address —
 * no networks, no keys, no payment jargon.
 */
export function WalletChip({ hint }: { hint?: string }) {
  const { address, label, connecting, error, connect, available } = useWallet();

  if (address) {
    return (
      <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-mint text-mint-foreground">
          <Wallet className="h-3 w-3" />
        </span>
        <span>Paying with {label}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={() => void connect()}
        disabled={connecting}
        className="press flex items-center justify-center gap-2 rounded-full bg-card px-4 py-2.5 text-sm font-bold shadow-soft disabled:opacity-60"
      >
        <Wallet className="h-4 w-4" />
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      <p className="text-xs font-semibold text-muted-foreground">
        {error ??
          (available
            ? (hint ?? "Connect your wallet to pay for your artwork.")
            : "Open Dear Diary in Farcaster or a wallet browser to pay.")}
      </p>
    </div>
  );
}
