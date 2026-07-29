"use client";

import React from "react";
import { Lock } from "lucide-react";
import { Card, CardBody } from "@/components/ui/primitives";

/**
 * Shown in place of a soft-disabled feature's page (see `featureFlags.ts`).
 * The feature's real code stays intact behind the flag; flip the flag to bring
 * it back. Nav links to disabled features are hidden, so this only appears if a
 * user navigates directly to the URL.
 */
export function FeatureUnavailable({ title }: { title: string }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <Lock size={20} className="text-[var(--color-ink-faint)]" />
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-faint)]">
            This feature is temporarily unavailable.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
