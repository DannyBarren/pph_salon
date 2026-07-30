"use client";

import React, { useState } from "react";
import { useApp } from "@/store/AppContext";
import { salonById } from "@/lib/mockData";
import { isAtLeast } from "@/lib/roles";
import { Avatar, Card, Select } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export function StylistSwitcher() {
  const { allowedStylists, viewedStylistId, setViewedStylistId, currentUser } = useApp();
  const [salonFilter, setSalonFilter] = useState<string>("all");

  if (currentUser.role === "stylist") return null;

  // SDL/Owner and Admin browse across salons; managers see only their own.
  const seesAllSalons = isAtLeast(currentUser.role, "sdl");
  const salonIds = Array.from(new Set(allowedStylists.map((s) => s.salonId)));
  const showFilter = seesAllSalons && salonIds.length > 1;
  const list = salonFilter === "all" ? allowedStylists : allowedStylists.filter((s) => s.salonId === salonFilter);

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <span className="text-xs font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
          {currentUser.role === "manager" ? "Your team" : "All stylists"} · {list.length}
        </span>
        {showFilter && (
          <Select className="h-8 text-xs" value={salonFilter} onChange={(e) => setSalonFilter(e.target.value)}>
            <option value="all">All salons</option>
            {salonIds.map((id) => (
              <option key={id} value={id}>
                {salonById(id).name}
              </option>
            ))}
          </Select>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {list.map((s) => {
          const active = s.id === viewedStylistId;
          return (
            <button
              key={s.id}
              onClick={() => setViewedStylistId(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 transition",
                active ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]" : "border-[var(--color-border)] hover:bg-[var(--color-surface-2)]",
              )}
            >
              <Avatar initials={s.initials} hue={s.hue} size={30} />
              <span className="text-left leading-tight">
                <span className="block text-sm font-medium">{s.name.split(" ")[0]}</span>
                {seesAllSalons && <span className="block text-[10px] text-[var(--color-ink-faint)]">{salonById(s.salonId).name}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
