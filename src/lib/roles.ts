import type { Role } from "./types";

/**
 * Shared role-hierarchy helpers — the single source of truth for permissions
 * across the app.
 *
 * Hierarchy (highest → lowest): admin > sdl (SDL / Owner) > manager > stylist.
 *
 * Permission matrix:
 * - admin   — EVERYTHING: data import/update, roster & user management,
 *             payment-logic configuration (Danger Zone). Exclusive owner of all
 *             editing/import/config capabilities.
 * - sdl     — view team data + change the Desired Pay Rate (DPR) only. No other
 *             editing/import/config/admin rights.
 * - manager — view their team's data. No editing.
 * - stylist — view only their own personal PPH dashboard. No editing.
 *
 * Backend maps: admin→admin, owner→sdl, manager→manager, stylist→stylist.
 */

export const ROLE_RANK: Record<Role, number> = {
  stylist: 0,
  manager: 1,
  sdl: 2,
  admin: 3,
};

export const ROLE_LABEL: Record<Role, string> = {
  stylist: "Stylist",
  manager: "Manager",
  sdl: "SDL · Owner",
  admin: "Admin",
};

/** True when `role` is at or above `min` in the hierarchy. */
export function isAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** Managers and above oversee a team (Team view, coaching). */
export function canManageTeam(role: Role): boolean {
  return isAtLeast(role, "manager");
}

/** Managers and above can author message-board announcements. */
export function canPostAnnouncements(role: Role): boolean {
  return isAtLeast(role, "manager");
}

/**
 * ADMIN ONLY: every editing / import / data-update / roster & user management /
 * payment-logic configuration capability. SDL/Owner and below cannot administer.
 */
export function canAdminister(role: Role): boolean {
  return role === "admin";
}

/** ADMIN ONLY: reach the payment-logic "Danger Zone". */
export function canConfigurePaymentLogic(role: Role): boolean {
  return role === "admin";
}

/**
 * Who may CHANGE the Desired Pay Rate (DPR): the Admin (full control) and the
 * SDL/Owner (their one editable capability). Managers and stylists view only.
 */
export function canChangeDpr(role: Role): boolean {
  return role === "admin" || role === "sdl";
}

/**
 * Privacy rule (Planner + everywhere): stylists must never see revenue /
 * production dollars. Everyone above stylist may. Pay RATES ($/hr) are still
 * allowed for stylists — only production/revenue TOTALS are hidden.
 */
export function canSeeMoney(role: Role): boolean {
  return isAtLeast(role, "manager");
}
