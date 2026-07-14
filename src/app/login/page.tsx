"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, LogIn, Loader2 } from "lucide-react";
import { useAuth } from "@/store/AuthContext";

export default function LoginPage() {
  const { demoMode, status, login, error } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // In demo mode there is no login; go straight to the app. Also bounce already
  // authenticated users away from the login screen.
  useEffect(() => {
    if (demoMode || status === "authenticated") router.replace("/");
  }, [demoMode, status, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setLocalError(null);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Login failed");
    } finally {
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
            <p className="mt-1 text-sm text-[var(--color-ink-faint)]">Sign in to your account</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)]"
              placeholder="you@salon.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)]"
              placeholder="••••••••"
            />
          </div>

          {(localError || error) && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {localError || error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--color-ink-faint)]">
          Accounts are provisioned by your salon admin. Need access? Contact your manager or owner.
        </p>
        <p className="mt-2 text-center text-xs text-[var(--color-ink-faint)]">
          Setting up a new deployment?{" "}
          <a href="/setup" className="font-semibold text-[var(--color-brand)] hover:underline">
            First-run setup
          </a>
        </p>
      </div>
    </div>
  );
}
