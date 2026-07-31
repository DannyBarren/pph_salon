"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/store/AuthContext";
import { PasscodeGate } from "@/components/PasscodeGate";

/**
 * Client-side route guard. In demo mode it is a no-op. In production it blocks
 * rendering until the session is resolved and redirects anonymous users to
 * `/login`. When the user has a fast-access passcode set, it also enforces the
 * daily passcode gate before the app shell. (Defense-in-depth: `middleware.ts`
 * also gates via a presence cookie.)
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { demoMode, status, needsPasscode } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!demoMode && status === "anonymous") {
      router.replace("/login");
    }
  }, [demoMode, status, router]);

  if (demoMode) return <>{children}</>;

  if (status === "loading") {
    return (
      <div className="grid min-h-[60vh] place-items-center text-sm text-[var(--color-ink-faint)]">
        <div className="flex flex-col items-center gap-3">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-brand)]" />
          Loading your workspace…
        </div>
      </div>
    );
  }

  if (status === "anonymous") {
    return (
      <div className="grid min-h-[60vh] place-items-center text-sm text-[var(--color-ink-faint)]">
        Redirecting to sign in…
      </div>
    );
  }

  // Authenticated but the daily passcode hasn't been entered on this device yet.
  if (needsPasscode) {
    return <PasscodeGate />;
  }

  return <>{children}</>;
}
