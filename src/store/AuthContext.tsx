"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "@/lib/api/endpoints";
import { tokenStore } from "@/lib/api/client";
import { DEMO_MODE } from "@/lib/featureFlags";
import {
  clearUnlock,
  forgetUser,
  isUnlockedToday,
  markUnlockedToday,
  rememberUser,
} from "@/lib/passcode";
import type { CurrentUserDTO } from "@/lib/api/types";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthState {
  /** True when the app runs in offline demo mode (no login required). */
  demoMode: boolean;
  status: AuthStatus;
  user: CurrentUserDTO | null;
  error: string | null;
  /**
   * True when the user is authenticated but must (re)enter their daily passcode
   * on this device before the main app shell is shown. Never true in demo mode.
   */
  needsPasscode: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  /** Mark the passcode gate satisfied for today (after a successful verify). */
  satisfyPasscode: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(DEMO_MODE ? "authenticated" : "loading");
  const [user, setUser] = useState<CurrentUserDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Whether the daily passcode gate has been satisfied this session/day.
  const [passcodeOk, setPasscodeOk] = useState(false);

  const refreshMe = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me);
      setStatus("authenticated");
      // On a page load with an existing session, require the passcode again if
      // one is set and today's device unlock hasn't happened yet.
      setPasscodeOk(!me.has_passcode || isUnlockedToday(me.id));
      if (me.has_passcode) rememberUser(me.id, me.name);
    } catch {
      setUser(null);
      setStatus("anonymous");
      setPasscodeOk(false);
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
      // A full password login inherently satisfies today's passcode gate.
      setPasscodeOk(true);
      if (me.has_passcode) {
        rememberUser(me.id, me.name);
        markUnlockedToday(me.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      throw err;
    }
  }, []);

  const satisfyPasscode = useCallback(() => {
    if (user) markUnlockedToday(user.id);
    setPasscodeOk(true);
  }, [user]);

  const logout = useCallback(() => {
    authApi.logout();
    clearUnlock();
    forgetUser();
    setUser(null);
    setStatus("anonymous");
    setPasscodeOk(false);
  }, []);

  const needsPasscode =
    !DEMO_MODE && status === "authenticated" && !!user?.has_passcode && !passcodeOk;

  const value = useMemo<AuthState>(
    () => ({
      demoMode: DEMO_MODE,
      status,
      user,
      error,
      needsPasscode,
      login,
      logout,
      refreshMe,
      satisfyPasscode,
    }),
    [status, user, error, needsPasscode, login, logout, refreshMe, satisfyPasscode],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
