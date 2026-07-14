"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "@/lib/api/endpoints";
import { tokenStore } from "@/lib/api/client";
import { DEMO_MODE } from "@/lib/featureFlags";
import type { CurrentUserDTO } from "@/lib/api/types";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthState {
  /** True when the app runs in offline demo mode (no login required). */
  demoMode: boolean;
  status: AuthStatus;
  user: CurrentUserDTO | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(DEMO_MODE ? "authenticated" : "loading");
  const [user, setUser] = useState<CurrentUserDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me);
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  // On mount (production only): resolve the session from a stored token.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (DEMO_MODE) {
      setStatus("authenticated");
      return;
    }
    if (tokenStore.isAuthenticated()) {
      void refreshMe();
    } else {
      setStatus("anonymous");
    }
  }, [refreshMe]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const me = await authApi.login(email, password);
      setUser(me);
      setStatus("authenticated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    authApi.logout();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo<AuthState>(
    () => ({ demoMode: DEMO_MODE, status, user, error, login, logout, refreshMe }),
    [status, user, error, login, logout, refreshMe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
