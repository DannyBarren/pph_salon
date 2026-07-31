/** Typed API surface — thin wrappers over the shared client. */

import { api, apiRequest, tokenStore } from "@/lib/api/client";
import { DEMO_MODE } from "@/lib/featureFlags";
import { DEMO_TEMPLATES, demoBackend } from "@/lib/api/demoBackend";
import type {
  AuditLogDTO,
  BackendRole,
  BulkUserResult,
  ClientImportResult,
  CreateSalonInput,
  CreateUserInput,
  CurrentUserDTO,
  InvitePreview,
  InviteResponse,
  PaymentLogicDTO,
  PaymentLogicPreviewDTO,
  PaymentLogicPreviewRequestDTO,
  PaymentLogicUpdateDTO,
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
  /** Set or change the fast-access numeric passcode (requires current password). */
  setPasscode(passcode: string, currentPassword: string): Promise<{ has_passcode: boolean }> {
    return api.post<{ has_passcode: boolean }>("/auth/passcode", {
      passcode,
      current_password: currentPassword,
    });
  },
  /** Disable the fast-access passcode. */
  clearPasscode(): Promise<{ has_passcode: boolean }> {
    return api.del<{ has_passcode: boolean }>("/auth/passcode");
  },
  /** Verify the passcode for a remembered device; refreshes the token pair. */
  async verifyPasscode(passcode: string): Promise<void> {
    const tokens = await api.post<TokenResponse>("/auth/passcode/verify", { passcode });
    tokenStore.set(tokens.access_token, tokens.refresh_token);
  },
  logout(): void {
    tokenStore.clear();
  },
  /** Public: preview whom a setup link is for (validates the token). */
  validateInvite(token: string): Promise<InvitePreview> {
    return api.get<InvitePreview>(`/auth/invite/${encodeURIComponent(token)}`, { auth: false });
  },
  /** Public: complete account setup by choosing a password → signs the user in. */
  async acceptInvite(token: string, newPassword: string): Promise<CurrentUserDTO> {
    const tokens = await api.post<TokenResponse>(
      "/auth/accept-invite",
      { token, new_password: newPassword },
      { auth: false },
    );
    tokenStore.set(tokens.access_token, tokens.refresh_token);
    return authApi.me();
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
  list: () => (DEMO_MODE ? demoBackend.listSalons() : api.get<SalonDTO[]>("/salons")),
  create: (input: CreateSalonInput) =>
    DEMO_MODE ? demoBackend.createSalon(input) : api.post<SalonDTO>("/salons", input),
  update: (id: number, patch: Partial<CreateSalonInput>) =>
    api.patch<SalonDTO>(`/salons/${id}`, patch),
  listPayTiers: (id: number) =>
    DEMO_MODE ? demoBackend.listPayTiers(id) : api.get<PayTierDTO[]>(`/salons/${id}/pay-tiers`),
  replacePayTiers: (id: number, tiers: { salon_id: number; desired_rate: number; pph: number }[]) =>
    DEMO_MODE ? demoBackend.replacePayTiers(id, tiers) : api.put<PayTierDTO[]>(`/salons/${id}/pay-tiers`, tiers),
};

// ── Global payment logic (highest-admin only) ────────────────────────────────
export const paymentLogicApi = {
  get: () =>
    DEMO_MODE ? demoBackend.getPaymentLogic() : api.get<PaymentLogicDTO>("/payment-logic"),
  update: (body: PaymentLogicUpdateDTO) =>
    DEMO_MODE
      ? demoBackend.updatePaymentLogic(body)
      : api.put<PaymentLogicDTO>("/payment-logic", body),
  preview: (body: PaymentLogicPreviewRequestDTO) =>
    DEMO_MODE
      ? demoBackend.previewPaymentLogic(body)
      : api.post<PaymentLogicPreviewDTO>("/payment-logic/preview", body),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const userApi = {
  list: (params?: { salon_id?: number; role?: BackendRole }) => {
    if (DEMO_MODE) return demoBackend.listUsers();
    const qs = new URLSearchParams();
    if (params?.salon_id != null) qs.set("salon_id", String(params.salon_id));
    if (params?.role) qs.set("role", params.role);
    const q = qs.toString();
    return api.get<UserDTO[]>(`/users${q ? `?${q}` : ""}`);
  },
  visibleStylists: () => api.get<UserDTO[]>("/users/visible-stylists"),
  create: (input: CreateUserInput) =>
    DEMO_MODE ? demoBackend.createUser(input) : api.post<UserDTO>("/users", input),
  update: (id: number, patch: Partial<CreateUserInput>) =>
    DEMO_MODE ? demoBackend.updateUser(id, patch) : api.patch<UserDTO>(`/users/${id}`, patch),
  deactivate: (id: number) =>
    DEMO_MODE ? demoBackend.deactivateUser(id) : api.post<UserDTO>(`/users/${id}/deactivate`),
  resetPassword: (id: number, emailCredentials = false) =>
    DEMO_MODE
      ? demoBackend.resetPassword(id)
      : api.post<{ user_id: number; email: string | null; emailed: boolean; temporary_password: string | null }>(
          `/users/${id}/reset-password?email_credentials=${emailCredentials}`,
        ),
  /** Unlock an account + email a "set your password" link (email optional to set it). */
  invite: (id: number, email?: string) =>
    DEMO_MODE ? demoBackend.invite(id, email) : api.post<InviteResponse>(`/users/${id}/invite`, email ? { email } : {}),
};

// ── Admin imports + audit ─────────────────────────────────────────────────────
function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<T>(path, { method: "POST", body: form });
}

export const adminApi = {
  importUsers: (file: File, emailCredentials = false) =>
    DEMO_MODE
      ? demoBackend.importUsers(file)
      : upload<BulkUserResult>(`/admin/import-users?email_credentials=${emailCredentials}`, file),
  importWeekly: (file: File, source = "native") =>
    DEMO_MODE
      ? demoBackend.importWeekly(file)
      : upload<WeeklyImportResult>(`/admin/import-weekly?source=${source}`, file),
  importDaily: (file: File, source = "native") =>
    DEMO_MODE
      ? demoBackend.importDaily(file)
      : upload<WeeklyImportResult>(`/admin/import-daily?source=${source}`, file),
  importClient: (file: File, weekStart?: string) =>
    DEMO_MODE
      ? demoBackend.importClient(file, weekStart)
      : upload<ClientImportResult>(
          `/admin/import-client${weekStart ? `?week_start=${encodeURIComponent(weekStart)}` : ""}`,
          file,
        ),
  audit: (limit = 100) => (DEMO_MODE ? demoBackend.audit(limit) : api.get<AuditLogDTO[]>(`/admin/audit?limit=${limit}`)),
  // Templates are static and generated client-side so downloads never depend on
  // a live backend or session (fixes the demo "Failed to fetch").
  usersTemplate: () => Promise.resolve(DEMO_TEMPLATES.users),
  weeklyTemplate: () => Promise.resolve(DEMO_TEMPLATES.weekly),
  dailyTemplate: () => Promise.resolve(DEMO_TEMPLATES.daily),
  clientTemplate: () => Promise.resolve(DEMO_TEMPLATES.client),
};

// ── Health ────────────────────────────────────────────────────────────────────
export const healthApi = {
  ready: () => api.get<{ status: string; database: { ok: boolean } }>("/health/ready", {
    auth: false,
  }),
};

/**
 * Map backend roles onto the frontend role model.
 * admin→admin (top), owner→sdl (SDL/Owner), manager→manager, stylist→stylist.
 */
export function toFrontendRole(role: BackendRole): "stylist" | "manager" | "sdl" | "admin" {
  if (role === "manager") return "manager";
  if (role === "stylist") return "stylist";
  if (role === "admin") return "admin";
  return "sdl"; // owner
}
