/** DTOs mirroring the FastAPI backend (backend uses stylist|manager|admin|owner). */

export type BackendRole = "stylist" | "manager" | "admin" | "owner";

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface CurrentUserDTO {
  id: number;
  name: string;
  email: string | null;
  role: BackendRole;
  salon_id: number;
  manager_id: number | null;
  is_demo: boolean;
}

export interface UserDTO {
  id: number;
  name: string;
  role: BackendRole;
  salon_id: number;
  manager_id: number | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  guarantee_rate: number | null;
  created_at: string;
  updated_at: string;
}

export interface InviteResponse {
  user_id: number;
  email: string | null;
  emailed: boolean;
  /** One-time setup link, present when email delivery isn't configured. */
  setup_link: string | null;
  expires_at: string;
}

export interface InvitePreview {
  name: string;
  email: string | null;
  valid: boolean;
}

export interface SalonDTO {
  id: number;
  name: string;
  city: string | null;
  location: string | null;
  guarantee_rate: number | null;
  service_prices: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface PayTierDTO {
  id: number;
  salon_id: number;
  desired_rate: number;
  pph: number;
}

export interface BulkUserResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  credentials: Record<string, string>;
}

export interface WeeklyImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface ClientImportResult {
  week_start: string;
  salons_created: number;
  users_created: number;
  users_updated: number;
  weeks_inserted: number;
  weeks_updated: number;
  skipped: number;
  errors: string[];
  credentials: Record<string, string>;
}

export interface AuditLogDTO {
  id: number;
  actor_id: number | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  salon_id: number | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface CreateUserInput {
  name: string;
  role: BackendRole;
  salon_id: number;
  email?: string;
  manager_id?: number | null;
  title?: string;
  phone?: string;
  guarantee_rate?: number | null;
  password?: string;
}

export interface CreateSalonInput {
  name: string;
  city?: string;
  location?: string;
  guarantee_rate?: number | null;
  service_prices?: Record<string, number>;
}
