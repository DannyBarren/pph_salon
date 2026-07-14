"use client";

import React from "react";
import Link from "next/link";
import { ShieldCheck, ArrowLeft } from "lucide-react";

/**
 * Self-service registration is intentionally disabled — this is an invite-only,
 * multi-tenant app. Accounts are created by a super-admin (single form or CSV
 * bulk import in the Admin panel). This page explains that and links to sign-in.
 */
export default function RegisterPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-surface-2)] px-4">
      <div className="w-full max-w-md rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-xl">
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          <ShieldCheck size={22} />
        </span>
        <h1 className="text-xl font-bold tracking-tight">Accounts are invite-only</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-faint)]">
          For security, stylists and managers can&apos;t self-register. Your salon
          owner or admin creates accounts from the Admin panel — individually or
          in bulk via CSV — and shares your first sign-in credentials.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <ArrowLeft size={16} />
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
