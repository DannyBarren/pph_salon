"use client";

import React, { useState } from "react";
import { KeyRound, Loader2, CheckCircle2 } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { useAuth } from "@/store/AuthContext";
import { authApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { Card, CardBody, Button } from "@/components/ui/primitives";

/** Self-service account settings: change your own password. */
export default function AccountPage() {
  const { currentUser } = useApp();
  const { demoMode } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const field =
    "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand)]";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) {
      setError("New passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await authApi.changePassword(current, next);
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="text-sm text-[var(--color-ink-faint)]">
          Signed in as <b>{currentUser.name}</b> · {currentUser.title}
        </p>
      </div>

      <Card>
        <CardBody>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <KeyRound size={16} /> Change password
          </h2>

          {demoMode ? (
            <p className="rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-ink-faint)]">
              Password management is available in the live (non-demo) app, where each
              user signs in with real credentials.
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <input className={field} type="password" autoComplete="current-password" placeholder="Current password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
              <input className={field} type="password" autoComplete="new-password" placeholder="New password (min 8 chars)" required value={next} onChange={(e) => setNext(e.target.value)} />
              <input className={field} type="password" autoComplete="new-password" placeholder="Confirm new password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              {error && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              {done && (
                <p className="flex items-center gap-2 rounded-lg bg-[var(--color-success-soft)] px-3 py-2 text-sm text-[var(--color-success)]">
                  <CheckCircle2 size={16} /> Password updated.
                </p>
              )}
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Update password
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
