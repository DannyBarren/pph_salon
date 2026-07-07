"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  DayRecord,
  MessageAcknowledgment,
  MessageBoardPost,
  PayConfig,
  TargetAudience,
  TimeView,
  User,
  Week,
} from "@/lib/types";
import {
  BOARD_SEED_ACKS,
  BOARD_SEED_POSTS,
  DEFAULT_CONFIG,
  STYLIST_DATA,
  USERS,
  stylistsForUser,
  userById,
} from "@/lib/mockData";
import { CURRENT_WEEK, WEEKS } from "@/lib/time";

const STORAGE_KEY = "pph-state-v1";

interface PersistShape {
  currentUserId: string;
  config: PayConfig;
  overrides: Record<string, DayRecord[]>;
  boardPosts: MessageBoardPost[];
  boardAcks: MessageAcknowledgment[];
  boardLastSeen: Record<string, string>;
}

/** Input accepted by createPost (author + targeting are resolved by role). */
export interface NewPostInput {
  title: string;
  content: string;
  targetAudience: TargetAudience;
  expiresAt?: string;
  isPinned: boolean;
}

interface AppState {
  currentUser: User;
  setCurrentUserId: (id: string) => void;

  viewedStylistId: string | null;
  setViewedStylistId: (id: string | null) => void;
  allowedStylists: User[];

  config: PayConfig;
  updateConfig: (patch: Partial<PayConfig>) => void;
  setSalonGuarantee: (salonId: string, value: number) => void;
  resetConfig: () => void;

  timeView: TimeView;
  setTimeView: (v: TimeView) => void;
  selectedWeekId: string;
  setSelectedWeekId: (id: string) => void;
  selectedPeriodIndex: number;
  setSelectedPeriodIndex: (i: number) => void;

  getDays: (stylistId: string) => DayRecord[];
  addRecords: (stylistId: string, records: DayRecord[]) => void;

  // ── Message board ────────────────────────────────────────────────────────
  boardPosts: MessageBoardPost[];
  boardAcks: MessageAcknowledgment[];
  boardLastSeen: Record<string, string>;
  createPost: (input: NewPostInput) => void;
  acknowledgePost: (postId: string) => void;
  markBoardSeen: () => void;

  ready: boolean;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentUserId, setCurrentUserIdState] = useState("st1");
  const [viewedStylistIdRaw, setViewedStylistId] = useState<string | null>("st1");
  const [config, setConfig] = useState<PayConfig>(DEFAULT_CONFIG);
  const [overrides, setOverrides] = useState<Record<string, DayRecord[]>>({});
  const [boardPosts, setBoardPosts] = useState<MessageBoardPost[]>(BOARD_SEED_POSTS);
  const [boardAcks, setBoardAcks] = useState<MessageAcknowledgment[]>(BOARD_SEED_ACKS);
  const [boardLastSeen, setBoardLastSeen] = useState<Record<string, string>>({});
  const [timeView, setTimeView] = useState<TimeView>("current-prior");
  const [selectedWeekId, setSelectedWeekId] = useState<string>(CURRENT_WEEK.id);
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState<number>(CURRENT_WEEK.periodIndex);
  const [ready, setReady] = useState(false);

  // Load persisted state after mount (avoids SSR hydration mismatch). Setting
  // state from persisted storage on mount is the intended pattern here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<PersistShape>;
        if (p.currentUserId && userById(p.currentUserId)) setCurrentUserIdState(p.currentUserId);
        if (p.config) setConfig({ ...DEFAULT_CONFIG, ...p.config, salonGuarantee: { ...DEFAULT_CONFIG.salonGuarantee, ...p.config.salonGuarantee } });
        if (p.overrides) setOverrides(p.overrides);
        if (p.boardPosts) setBoardPosts(p.boardPosts);
        if (p.boardAcks) setBoardAcks(p.boardAcks);
        if (p.boardLastSeen) setBoardLastSeen(p.boardLastSeen);
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist relevant state.
  useEffect(() => {
    if (!ready) return;
    const payload: PersistShape = { currentUserId, config, overrides, boardPosts, boardAcks, boardLastSeen };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [ready, currentUserId, config, overrides, boardPosts, boardAcks, boardLastSeen]);

  const currentUser = userById(currentUserId) ?? USERS[0];
  const allowedStylists = useMemo(() => stylistsForUser(currentUser), [currentUser]);

  // Derive a guaranteed-valid viewed stylist for the current role (no effect
  // needed): stylists always view themselves; managers/SDL fall back to the
  // first allowed report when their raw selection isn't in scope.
  const viewedStylistId = useMemo(() => {
    if (currentUser.role === "stylist") return currentUser.id;
    if (viewedStylistIdRaw && allowedStylists.some((s) => s.id === viewedStylistIdRaw)) return viewedStylistIdRaw;
    return allowedStylists[0]?.id ?? null;
  }, [currentUser, allowedStylists, viewedStylistIdRaw]);

  const setCurrentUserId = useCallback((id: string) => {
    if (!userById(id)) return;
    setCurrentUserIdState(id);
  }, []);

  const updateConfig = useCallback((patch: Partial<PayConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
  }, []);

  const setSalonGuarantee = useCallback((salonId: string, value: number) => {
    setConfig((c) => ({ ...c, salonGuarantee: { ...c.salonGuarantee, [salonId]: value } }));
  }, []);

  const resetConfig = useCallback(() => setConfig(DEFAULT_CONFIG), []);

  const getDays = useCallback(
    (stylistId: string): DayRecord[] => {
      const base = STYLIST_DATA[stylistId]?.days ?? [];
      const ov = overrides[stylistId];
      if (!ov || ov.length === 0) return base;
      const map = new Map(base.map((d) => [d.date, d]));
      for (const r of ov) map.set(r.date, r);
      return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    },
    [overrides],
  );

  const addRecords = useCallback((stylistId: string, records: DayRecord[]) => {
    setOverrides((o) => {
      const existing = o[stylistId] ?? [];
      const map = new Map(existing.map((d) => [d.date, d]));
      for (const r of records) map.set(r.date, r);
      return { ...o, [stylistId]: Array.from(map.values()) };
    });
  }, []);

  // ── Message board actions ────────────────────────────────────────────────
  const createPost = useCallback(
    (input: NewPostInput) => {
      const author = userById(currentUserId) ?? USERS[0];
      if (author.role !== "manager" && author.role !== "sdl") return; // guard

      // Smart targeting: managers are auto-limited to their own salon.
      let audience: TargetAudience = input.targetAudience;
      let salonId: string | null = null;
      if (author.role === "manager") {
        audience = { kind: "salons", salonIds: [author.salonId] };
        salonId = author.salonId;
      } else if (audience.kind === "salons") {
        salonId = audience.salonIds.length === 1 ? audience.salonIds[0] : null;
      }

      const post: MessageBoardPost = {
        id: `mp-${Date.now()}`,
        authorId: author.id,
        authorRole: author.role,
        salonId,
        targetAudience: audience,
        title: input.title.trim(),
        content: input.content.trim(),
        createdAt: new Date().toISOString(),
        expiresAt: input.expiresAt,
        isPinned: input.isPinned,
      };
      setBoardPosts((posts) => [post, ...posts]);
    },
    [currentUserId],
  );

  const acknowledgePost = useCallback(
    (postId: string) => {
      setBoardAcks((acks) => {
        if (acks.some((a) => a.postId === postId && a.userId === currentUserId)) return acks;
        return [
          ...acks,
          { id: `ma-${Date.now()}`, postId, userId: currentUserId, acknowledgedAt: new Date().toISOString() },
        ];
      });
    },
    [currentUserId],
  );

  const markBoardSeen = useCallback(() => {
    setBoardLastSeen((seen) => ({ ...seen, [currentUserId]: new Date().toISOString() }));
  }, [currentUserId]);

  const value: AppState = {
    currentUser,
    setCurrentUserId,
    viewedStylistId,
    setViewedStylistId,
    allowedStylists,
    config,
    updateConfig,
    setSalonGuarantee,
    resetConfig,
    timeView,
    setTimeView,
    selectedWeekId,
    setSelectedWeekId,
    selectedPeriodIndex,
    setSelectedPeriodIndex,
    getDays,
    addRecords,
    boardPosts,
    boardAcks,
    boardLastSeen,
    createPost,
    acknowledgePost,
    markBoardSeen,
    ready,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export { WEEKS };
export type { Week };
