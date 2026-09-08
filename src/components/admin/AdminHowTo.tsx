"use client";

// localStorage hydration on mount — same pattern as AdminManagement.
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Card, CardBody, Button } from "@/components/ui/primitives";

const STORAGE_KEY = "pph.admin.howto.v1";

/**
 * Live-mode only: three client-language steps at the top of Admin.
 * Dismissed into localStorage so it doesn't nag after the first week.
 */
export function AdminHowTo() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore quota / private mode */
    }
    setHidden(true);
  };

  if (hidden) return null;

  return (
    <Card className="border-[var(--color-brand)]/30">
      <CardBody>
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold">Getting started</h2>
          <Button variant="ghost" size="sm" onClick={dismiss} aria-label="Dismiss">
            <X size={14} />
          </Button>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--color-ink-soft)]">
          <li>
            <b>Add a pay period</b> — open the Import tab and drop the Venita daily
            .xlsx. The new date range shows up in every stylist&apos;s Pay Period
            dropdown.
          </li>
          <li>
            <b>Add a stylist</b> — Users → Add user (name, employee code, salon) →
            Activate → paste their email → copy the setup link.
          </li>
          <li>
            <b>If import skips a name</b> — add them from the skip list, then
            re-upload the same file.
          </li>
        </ol>
      </CardBody>
    </Card>
  );
}
