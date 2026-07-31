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
  excluded?: boolean;
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
  excluded?: boolean;
  created_at: string;
  updated_at: string;
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

// ── Global payment logic (org-wide, highest-admin only) ──────────────────────
export interface PaymentTierDTO {
  pay_rate: number;
  pph_required: number;
}

export interface PaymentLogicDTO {
  tiers: PaymentTierDTO[];
  np_rate: number;
  np_percent: number;
  guarantee_rate: number;
  commission_rate: number;
  haircut_price: number;
  color_price: number;
  avg_ticket_haircut: number;
  avg_ticket_color: number;
  service_mix_haircut: number;
  min_services_per_day: number;
  updated_by_email?: string | null;
  updated_at?: string | null;
  formula?: Record<string, unknown> | null;
}

/** The mutable subset sent on PUT / used for preview (no server metadata). */
export type PaymentLogicUpdateDTO = Omit<
  PaymentLogicDTO,
  "updated_by_email" | "updated_at" | "formula"
>;

export interface PaymentLogicPreviewRequestDTO {
  config: PaymentLogicUpdateDTO;
  production: number;
  hours: number;
  guarantee_rate?: number | null;
  target_rate?: number | null;
  scheduled_hours?: number | null;
}

export interface PaymentLogicPreviewDTO {
  pph: number;
  effective_rate: number;
  pay: number;
  commission_pay: number;
  guarantee_pay: number;
  on_guarantee: boolean;
  guarantee_rate: number;
  min_expected_production: number;
  target_rate?: number | null;
  required_production_for_target?: number | null;
  remaining_production_for_target?: number | null;
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

// ── Historical performance (pay-period / week selectors) ─────────────────────
export interface StoredWeekDTO {
  week_start: string;
  week_end: string | null;
  has_actuals: boolean;
}

export interface PayPeriodSummaryDTO {
  period_start: string;
  period_end: string;
  weeks: StoredWeekDTO[];
}

export interface PerformanceDayDTO {
  date: string;
  scheduled_hrs: number;
  actual_hrs: number | null;
  actual_production: number | null;
  haircuts: number | null;
  colors: number | null;
}

export interface WeekPerformanceDTO {
  stylist_id: number;
  week_start: string;
  week_end: string | null;
  scheduled_total_hrs: number;
  actual_total_hrs: number | null;
  actual_production: number | null;
  actual_haircuts: number | null;
  actual_colors: number | null;
  actual_other_value: number | null;
  notes: string | null;
  daily: PerformanceDayDTO[];
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
  excluded?: boolean;
  password?: string;
}

export interface CreateSalonInput {
  name: string;
  city?: string;
  location?: string;
  guarantee_rate?: number | null;
  service_prices?: Record<string, number>;
}
