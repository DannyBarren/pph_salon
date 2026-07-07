import type { Role } from "./types";

/**
 * Shared role-hierarchy helpers — the single source of truth for permissions
 * across the app (Planner privacy, Team, Admin, and the Message Board).
 *
 * Hierarchy: sdl (SDL / Owner) > manager > stylist. `sdl` carries owner + admin
 * privileges on the frontend; the backend uses the fuller
 * stylist | manager | admin | owner set and maps `sdl` → owner/admin.
 */

export const ROLE_RANK: Record<Role, number> = {
  stylist: 0,
  manager: 1,
  sdl: 2,
};

export const ROLE_LABEL: Record<Role, string> = {
  stylist: "Stylist",
  manager: "Manager",
  sdl: "SDL · Owner",
};

/** True when `role` is at or above `min` in the hierarchy. */
export function isAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** Managers and above oversee a team (Team view, data management, coaching). */
export function canManageTeam(role: Role): boolean {
  return isAtLeast(role, "manager");
}

/** Managers and above can author message-board announcements. */
export function canPostAnnouncements(role: Role): boolean {
  return isAtLeast(role, "manager");
}

/**
 * Privacy rule (Planner + everywhere): stylists must never see revenue /
 * production dollars. Everyone above stylist may. Pay RATES ($/hr) are still
 * allowed for stylists — only production/revenue TOTALS are hidden.
 */
export function canSeeMoney(role: Role): boolean {
  return isAtLeast(role, "manager");
}
