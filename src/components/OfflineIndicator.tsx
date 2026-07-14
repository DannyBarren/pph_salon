"use client";

import React, { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** A small fixed banner shown when the browser goes offline (PWA UX). */
export function OfflineIndicator() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-xs font-semibold text-white shadow"
    >
      <WifiOff size={14} />
      You&apos;re offline — showing the last loaded data. Changes will sync when you reconnect.
    </div>
  );
}
