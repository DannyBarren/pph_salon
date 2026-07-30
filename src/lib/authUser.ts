/** Bridge a backend `CurrentUserDTO` into the frontend `User` shape. */

import type { CurrentUserDTO } from "@/lib/api/types";
import { toFrontendRole } from "@/lib/api/endpoints";
import type { User } from "@/lib/types";

const HUES = [265, 200, 150, 25, 330, 95, 305, 55];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function authUserToFrontend(dto: CurrentUserDTO): User {
  return {
    id: `u${dto.id}`,
    name: dto.name,
    role: toFrontendRole(dto.role),
    salonId: `s${dto.salon_id}`,
    managerId: dto.manager_id != null ? `u${dto.manager_id}` : undefined,
    title:
      dto.role === "owner"
        ? "Owner"
        : dto.role === "admin"
          ? "Administrator"
          : dto.role === "manager"
            ? "Salon Manager"
            : "Stylist",
    email: dto.email ?? undefined,
    initials: initialsOf(dto.name),
    hue: HUES[dto.id % HUES.length],
    excluded: dto.excluded ?? false,
  };
}
