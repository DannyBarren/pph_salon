"use client";

import React, { useCallback, useState } from "react";
import { Delete, Loader2, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { authApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";

const MAX_LEN = 6;

/**
 * Daily passcode gate. Shown (in production only) when the user is remembered on
 * this device but must re-enter their numeric passcode for the new calendar day.
 * Large thumb-friendly keypad; falls back to full password login after repeated
 * failures or via "Use password instead".
 */
export function PasscodeGate() {
  const { user, satisfyPasscode, logout } = useAuth();
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (code: string) => {
      setBusy(true);
      setError(null);
      try {
        await authApi.verifyPasscode(code);
        satisfyPasscode();
      } catch (err) {
        setDigits("");
        if (err instanceof ApiError && err.status === 429) {
          // Locked out — the server cleared the passcode; force full login.
          setError("Too many attempts. Please sign in with your password.");
          setTimeout(() => logout(), 1200);
        } else {
          setError(err instanceof Error ? err.message : "Incorrect passcode");
        }
        setBusy(false);
      }
    },
    [satisfyPasscode, logout],
  );

  const press = useCallback(
    (n: string) => {
      if (busy) return;
      setError(null);
      setDigits((prev) => {
        if (prev.length >= MAX_LEN) return prev;
        const next = prev + n;
        if (next.length >= 4) {
          // Auto-submit at 4; user can keep typing up to 6 before we submit at max.
          if (next.length === MAX_LEN) void submit(next);
        }
        return next;
      });
    },
    [busy, submit],
  );

  const backspace = useCallback(() => {
    if (busy) return;
    setError(null);
    setDigits((prev) => prev.slice(0, -1));
  }, [busy]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-surface-2)] px-4">
      <div className="w-full max-w-xs rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-brand)] text-white">
            <ShieldCheck size={22} />
          </span>
          <h1 className="text-lg font-bold tracking-tight">
            Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-sm text-[var(--color-ink-faint)]">Enter your passcode to continue</p>
        </div>

        {/* Passcode dots */}
        <div className="mb-5 flex items-center justify-center gap-3" aria-label="Passcode entry">
          {Array.from({ length: MAX_LEN }).map((_, i) => (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-full border transition ${
                i < digits.length
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)]"
                  : "border-[var(--color-border)] bg-transparent"
              }`}
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700">
            {error}
          </p>
        )}

        {/* Numeric keypad — large touch targets for thumbs */}
        <div className="grid grid-cols-3 gap-3">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              disabled={busy}
              className="grid h-16 place-items-center rounded-2xl bg-[var(--color-surface-2)] text-2xl font-semibold tabular-nums transition active:scale-95 hover:bg-[var(--color-brand-soft)] disabled:opacity-60"
            >
              {k}
            </button>
          ))}
          <button
            type="button"
            onClick={() => (digits.length >= 4 ? void submit(digits) : undefined)}
            disabled={busy || digits.length < 4}
            aria-label="Confirm passcode"
            className="grid h-16 place-items-center rounded-2xl text-[var(--color-brand)] transition active:scale-95 disabled:opacity-30"
          >
            {busy ? <Loader2 size={22} className="animate-spin" /> : <Sparkles size={20} />}
          </button>
          <button
            type="button"
            onClick={() => press("0")}
            disabled={busy}
            className="grid h-16 place-items-center rounded-2xl bg-[var(--color-surface-2)] text-2xl font-semibold tabular-nums transition active:scale-95 hover:bg-[var(--color-brand-soft)] disabled:opacity-60"
          >
            0
          </button>
          <button
            type="button"
            onClick={backspace}
            disabled={busy || digits.length === 0}
            aria-label="Delete last digit"
            className="grid h-16 place-items-center rounded-2xl text-[var(--color-ink-soft)] transition active:scale-95 disabled:opacity-30"
          >
            <Delete size={22} />
          </button>
        </div>

        <button
          type="button"
          onClick={logout}
          className="mt-5 flex w-full items-center justify-center gap-2 text-sm font-medium text-[var(--color-ink-faint)] hover:text-[var(--color-brand)]"
        >
          <LogOut size={14} /> Use password instead
        </button>
      </div>
    </div>
  );
}
