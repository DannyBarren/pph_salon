"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldPlus, Loader2, ArrowLeft } from "lucide-react";
import { authApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";

/**
 * First-run setup: create the very first admin (top of the hierarchy) using the
 * server's one-time `BOOTSTRAP_TOKEN`. Only works while the backend has no users;
 * afterwards the endpoint returns 409 and this page reports it. From here the
 * admin creates owners/managers, and managers create their stylists.
 */
export default function SetupPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [salon, setSalon] = useState("Main Salon");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authApi.bootstrap({
        token: token.trim(),
        email: email.trim(),
        password,
        name: name.trim(),
        salon_name: salon.trim() || "Main Salon",
      });
      setDone(true);
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("This application is already set up. Please sign in instead.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Setup is disabled or the token is invalid. Check BOOTSTRAP_TOKEN on the server.");
      } else {
        setError(err instanceof Error ? err.message : "Setup failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)]";

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-surface-2)] px-4">
      <div className="w-full max-w-md rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-brand)] text-white">
            <ShieldPlus size={22} />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">First-run setup</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-faint)]">
              Create the first admin account. This is a one-time, token-protected step.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <input
            className={field}
            placeholder="Setup token (BOOTSTRAP_TOKEN)"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <input className={field} placeholder="Your full name" required value={name} onChange={(e) => setName(e.target.value)} />
          <input className={field} type="email" placeholder="Admin email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={field} type="password" placeholder="Password (min 8 chars)" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <input className={field} placeholder="Salon name" value={salon} onChange={(e) => setSalon(e.target.value)} />

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || done}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldPlus size={16} />}
            {busy ? "Creating admin…" : "Create admin & sign in"}
          </button>
        </form>

        <Link
          href="/login"
          className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        >
          <ArrowLeft size={13} /> Already set up? Sign in
        </Link>
      </div>
    </div>
  );
}
