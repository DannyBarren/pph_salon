"use client";

import React from "react";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

/** Shimmering placeholder block. */
export function Shimmer({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-[var(--color-surface-2)]", className)} aria-hidden="true" />;
}

export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="p-4">
          <Shimmer className="h-3 w-20" />
          <Shimmer className="mt-3 h-6 w-16" />
          <Shimmer className="mt-2 h-3 w-24" />
        </Card>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <Card className="p-4" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Shimmer className="h-11 w-11 rounded-full" />
        <div className="flex-1">
          <Shimmer className="h-4 w-32" />
          <Shimmer className="mt-2 h-3 w-20" />
        </div>
        <Shimmer className="h-6 w-16 rounded-full" />
      </div>
      <Shimmer className="mt-4 h-9 w-24" />
      <Shimmer className="mt-4 h-2 w-full" />
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Shimmer className="h-10" />
        <Shimmer className="h-10" />
        <Shimmer className="h-10" />
      </div>
    </Card>
  );
}

export function CardsGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading stylists">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
