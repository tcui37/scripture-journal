"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { fetchMe, signOutRequest } from "@/lib/account";
import type { AuthUser } from "@/lib/types";
import { warmupOptionsForHost } from "@/lib/startup";
import { waitForApi, type WarmupStatus } from "@/lib/warmup";

interface AuthContextValue {
  user: AuthUser | null;
  /** True while pinging `/api/health` — gates scripture/catalog only. */
  loading: boolean;
  /** True after the first `/api/auth/me` attempt finishes (success or guest). */
  sessionReady: boolean;
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
  const [sessionReady, setSessionReady] = useState(false);
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
      setSessionReady(false);
      setApiStatus("warming");
      try {
        const warmup = warmupOptionsForHost(window.location.hostname);
        await waitForApi(abort.signal, warmup);
        if (cancelled) return;
        setApiStatus("ok");
        setLoading(false);

        void fetchMe()
          .then((next) => {
            if (!cancelled) setUser(next);
          })
          .catch(() => {
            if (!cancelled) setUser(null);
          })
          .finally(() => {
            if (!cancelled) setSessionReady(true);
          });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setApiStatus("error");
        setLoading(false);
        setSessionReady(true);
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
    () => ({ user, loading, sessionReady, apiStatus, refresh, signOut, retryWarmup }),
    [user, loading, sessionReady, apiStatus, refresh, signOut, retryWarmup],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
