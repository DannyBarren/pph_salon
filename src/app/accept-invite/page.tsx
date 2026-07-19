"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, KeyRound, Loader2, CheckCircle2 } from "lucide-react";
import { authApi } from "@/lib/api/endpoints";
import { useAuth } from "@/store/AuthContext";
import type { InvitePreview } from "@/lib/api/types";

function AcceptInviteInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { demoMode, refreshMe } = useAuth();
  const token = params.get("token") ?? "";

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (demoMode) {
      setChecking(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const p = await authApi.validateInvite(token);
        if (active) setPreview(p);
      } catch {
        if (active) setPreview({ name: "", email: null, valid: false });
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, demoMode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await authApi.acceptInvite(token, password);
      await refreshMe();
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't complete setup. The link may have expired.");
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-surface-2)] px-4">
      <div className="w-full max-w-sm rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-brand)] text-white">
            <Sparkles size={22} />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              PPH<span className="text-[var(--color-brand)]"> Stylist</span>
            </h1>
            <p className="mt-1 text-sm text-[var(--color-ink-faint)]">Set up your account</p>
          </div>
        </div>

        {demoMode ? (
          <p className="rounded-lg bg-[var(--color-brand-soft)] px-3 py-2 text-sm text-[var(--color-brand-ink)]">
            Account setup runs on the live (credentialed) app. This is the offline demo.
          </p>
        ) : checking ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-[var(--color-ink-faint)]">
            <Loader2 size={16} className="animate-spin" /> Validating your link…
          </div>
        ) : !token || !preview?.valid ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            This setup link is invalid or has expired. Ask your manager or admin to send a new one.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-sm">
              <div className="font-semibold">{preview.name}</div>
              {preview.email && (
                <div className="text-[var(--color-ink-faint)]">
                  Sign in with <span className="font-medium">{preview.email}</span>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="pw" className="mb-1 block text-sm font-medium">Create a password</label>
              <input
                id="pw"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)]"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label htmlFor="pw2" className="mb-1 block text-sm font-medium">Confirm password</label>
              <input
                id="pw2"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)]"
                placeholder="Re-enter password"
              />
            </div>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {submitting ? "Setting up…" : "Activate account & sign in"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-[var(--color-ink-faint)]">
          Already set up?{" "}
          <a href="/login" className="font-semibold text-[var(--color-brand)] hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center text-sm text-[var(--color-ink-faint)]">
          <span className="inline-flex items-center gap-2">
            <KeyRound size={16} /> Loading…
          </span>
        </div>
      }
    >
      <AcceptInviteInner />
    </Suspense>
  );
}
