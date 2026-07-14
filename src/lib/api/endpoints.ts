/** Typed API surface — thin wrappers over the shared client. */

import { api, apiRequest, tokenStore } from "@/lib/api/client";
import type {
  AuditLogDTO,
  BackendRole,
  BulkUserResult,
  CreateSalonInput,
  CreateUserInput,
  CurrentUserDTO,
  PayTierDTO,
  SalonDTO,
  TokenResponse,
  UserDTO,
  WeeklyImportResult,
} from "@/lib/api/types";

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  async login(email: string, password: string): Promise<CurrentUserDTO> {
    const tokens = await api.post<TokenResponse>(
      "/auth/login",
      { email, password },
      { auth: false },
    );
    tokenStore.set(tokens.access_token, tokens.refresh_token);
    return authApi.me();
  },
  me(): Promise<CurrentUserDTO> {
    return api.get<CurrentUserDTO>("/auth/me");
  },
  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return api.post<void>("/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },
  logout(): void {
    tokenStore.clear();
  },
  register(input: {
    email: string;
    password: string;
    name: string;
    role: BackendRole;
    salon_id: number;
    manager_id?: number | null;
    title?: string;
  }): Promise<UserDTO> {
    return api.post<UserDTO>("/auth/register", input);
  },
  /** First-run: create the very first owner (token-gated) and sign in. */
  async bootstrap(input: {
    token: string;
    email: string;
    password: string;
    name: string;
    salon_name: string;
  }): Promise<CurrentUserDTO> {
    const tokens = await api.post<TokenResponse>("/auth/bootstrap", input, { auth: false });
    tokenStore.set(tokens.access_token, tokens.refresh_token);
    return authApi.me();
  },
};

// ── Salons + pay-plan config ──────────────────────────────────────────────────
export const salonApi = {
  list: () => api.get<SalonDTO[]>("/salons"),
  create: (input: CreateSalonInput) => api.post<SalonDTO>("/salons", input),
  update: (id: number, patch: Partial<CreateSalonInput>) =>
    api.patch<SalonDTO>(`/salons/${id}`, patch),
  listPayTiers: (id: number) => api.get<PayTierDTO[]>(`/salons/${id}/pay-tiers`),
  replacePayTiers: (id: number, tiers: { salon_id: number; desired_rate: number; pph: number }[]) =>
    api.put<PayTierDTO[]>(`/salons/${id}/pay-tiers`, tiers),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const userApi = {
  list: (params?: { salon_id?: number; role?: BackendRole }) => {
    const qs = new URLSearchParams();
    if (params?.salon_id != null) qs.set("salon_id", String(params.salon_id));
    if (params?.role) qs.set("role", params.role);
    const q = qs.toString();
    return api.get<UserDTO[]>(`/users${q ? `?${q}` : ""}`);
  },
  visibleStylists: () => api.get<UserDTO[]>("/users/visible-stylists"),
  create: (input: CreateUserInput) => api.post<UserDTO>("/users", input),
  update: (id: number, patch: Partial<CreateUserInput>) =>
    api.patch<UserDTO>(`/users/${id}`, patch),
  deactivate: (id: number) => api.post<UserDTO>(`/users/${id}/deactivate`),
  resetPassword: (id: number, emailCredentials = false) =>
    api.post<{ user_id: number; email: string | null; emailed: boolean; temporary_password: string | null }>(
      `/users/${id}/reset-password?email_credentials=${emailCredentials}`,
    ),
};

// ── Admin imports + audit ─────────────────────────────────────────────────────
function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<T>(path, { method: "POST", body: form });
}

export const adminApi = {
  importUsers: (file: File, emailCredentials = false) =>
    upload<BulkUserResult>(`/admin/import-users?email_credentials=${emailCredentials}`, file),
  importWeekly: (file: File, source = "native") =>
    upload<WeeklyImportResult>(`/admin/import-weekly?source=${source}`, file),
  importDaily: (file: File, source = "native") =>
    upload<WeeklyImportResult>(`/admin/import-daily?source=${source}`, file),
  audit: (limit = 100) => api.get<AuditLogDTO[]>(`/admin/audit?limit=${limit}`),
  usersTemplate: () => api.get<string>("/admin/import-users-template", { raw: false }),
  weeklyTemplate: () => api.get<string>("/admin/import-template", { raw: false }),
  dailyTemplate: () => api.get<string>("/admin/import-daily-template", { raw: false }),
};

// ── Health ────────────────────────────────────────────────────────────────────
export const healthApi = {
  ready: () => api.get<{ status: string; database: { ok: boolean } }>("/health/ready", {
    auth: false,
  }),
};

/** Map backend roles onto the frontend's 3-role model (sdl == owner/admin). */
export function toFrontendRole(role: BackendRole): "stylist" | "manager" | "sdl" {
  if (role === "manager") return "manager";
  if (role === "stylist") return "stylist";
  return "sdl";
}
