"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { fetchMe, signOutRequest } from "@/lib/account";
import type { AuthUser } from "@/lib/types";
import { waitForApi, type WarmupStatus } from "@/lib/warmup";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  apiStatus: WarmupStatus;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  retryWarmup: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState<WarmupStatus>("warming");
  const [warmupToken, setWarmupToken] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setUser(await fetchMe());
    } catch {
      // Network or server errors are not a sign-in; keep the guest session.
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();

    const start = async () => {
      setLoading(true);
      setApiStatus("warming");
      try {
        await waitForApi(abort.signal);
        if (cancelled) return;
        setApiStatus("ok");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setApiStatus("error");
      }

      try {
        const next = await fetchMe();
        if (!cancelled) setUser(next);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void start();
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [warmupToken]);

  const retryWarmup = useCallback(() => {
    setWarmupToken((token) => token + 1);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await signOutRequest();
    } catch {
      // Local session still ends so the chrome matches what the user asked for.
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, apiStatus, refresh, signOut, retryWarmup }),
    [user, loading, apiStatus, refresh, signOut, retryWarmup],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
