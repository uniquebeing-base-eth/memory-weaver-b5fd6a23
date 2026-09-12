import { useCallback, useEffect, useState } from "react";

import {
  connectWallet,
  readWallet,
  shortAddress,
  WalletError,
  type ConnectedWallet,
} from "@/lib/wallet.client";

export interface WalletState {
  address: string | null;
  label: string | null;
  chainId: number | null;
  kind: ConnectedWallet["kind"] | null;
  available: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<ConnectedWallet | null>;
}

/**
 * Wallet state for the UI: the Farcaster wallet when we're inside Farcaster,
 * otherwise the injected browser wallet. Auto-restores an existing connection.
 */
export function useWallet(): WalletState {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [available, setAvailable] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await readWallet();
      if (cancelled) return;
      if (existing) {
        setWallet(existing);
        setAvailable(true);
        return;
      }
      const { getWalletProvider } = await import("@/lib/wallet.client");
      const found = await getWalletProvider();
      if (!cancelled) setAvailable(Boolean(found));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const provider = wallet?.provider;
    if (!provider?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const accounts = (args[0] as string[] | undefined) ?? [];
      const next = accounts[0];
      setWallet((current) =>
        current ? (next ? { ...current, address: next as `0x${string}` } : null) : null,
      );
    };
    const onChain = (...args: unknown[]) => {
      const raw = args[0] as string | undefined;
      const chainId = raw ? Number.parseInt(raw, 16) : undefined;
      setWallet((current) => (current && chainId ? { ...current, chainId } : current));
    };
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [wallet?.provider]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const connected = await connectWallet();
      setWallet(connected);
      setAvailable(true);
      return connected;
    } catch (caught) {
      setError(caught instanceof WalletError ? caught.message : "We couldn't connect your wallet.");
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  return {
    address: wallet?.address ?? null,
    label: wallet ? shortAddress(wallet.address) : null,
    chainId: wallet?.chainId ?? null,
    kind: wallet?.kind ?? null,
    available,
    connecting,
    error,
    connect,
  };
}
