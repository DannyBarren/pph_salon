/**
 * In-browser stand-in for the FastAPI backend, used only in DEMO_MODE.
 *
 * The credential-free demo build has no backend, so the Admin panel's API calls
 * would otherwise fail with "Failed to fetch". This shim resolves those calls
 * against the offline demo dataset (`mockData`) — real reads, session-local
 * writes, and client-side CSV templates — so the whole Admin experience works
 * reliably with no network. Nothing here is persisted beyond the session.
 */

import { SALONS, USERS } from "@/lib/mockData";
import { PPH_TIERS } from "@/lib/tiers";
import { CLIENT_TEMPLATE, DAILY_TEMPLATE, USERS_TEMPLATE, WEEKLY_TEMPLATE } from "@/lib/importTemplates";
import type {
  AuditLogDTO,
  BackendRole,
  BulkUserResult,
  ClientImportResult,
  CreateSalonInput,
  CreateUserInput,
  InviteResponse,
  PayTierDTO,
  SalonDTO,
  UserDTO,
  WeeklyImportResult,
} from "@/lib/api/types";

const now = () => new Date().toISOString();

function roleToBackend(role: string): BackendRole {
  if (role === "manager") return "manager";
  if (role === "stylist") return "stylist";
  return "owner"; // sdl → owner
}

// Stable numeric ids for the demo (string ids like "s1"/"u3" → numbers).
const salonNumById = new Map<string, number>();
SALONS.forEach((s, i) => salonNumById.set(s.id, i + 1));

let salonSeq = SALONS.length;
let userSeq = 100000;

const salons: SalonDTO[] = SALONS.map((s, i) => ({
  id: i + 1,
  name: s.name,
  city: s.city ?? null,
  location: null,
  guarantee_rate: s.guaranteeRate ?? null,
  service_prices: { ...(s.servicePrices ?? { haircut: 23, color: 85 }) },
  created_at: now(),
  updated_at: now(),
}));

const users: UserDTO[] = USERS.map((u, i) => ({
  id: i + 1,
  name: u.name,
  role: roleToBackend(u.role),
  salon_id: salonNumById.get(u.salonId) ?? 1,
  manager_id: null,
  title: u.title ?? null,
  email: u.email ?? null,
  phone: u.phone ?? null,
  guarantee_rate: u.guaranteeRate ?? null,
  created_at: now(),
  updated_at: now(),
}));

const payTiers = new Map<number, PayTierDTO[]>();
const audit: AuditLogDTO[] = [];

function logAudit(action: string, target_type: string, target_id?: string) {
  audit.unshift({
    id: audit.length + 1,
    actor_id: null,
    actor_email: "demo-owner",
    actor_role: "owner",
    action,
    target_type,
    target_id: target_id ?? null,
    salon_id: null,
    detail: {},
    created_at: now(),
  });
}

/** Quote-aware CSV line split (handles fields with commas like salon codes). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

async function readRows(file: File): Promise<string[][]> {
  const text = (await file.text()).replace(/^\uFEFF/, "");
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map(splitCsvLine);
}

export const demoBackend = {
  // ── Salons ──────────────────────────────────────────────────────────────
  async listSalons(): Promise<SalonDTO[]> {
    return salons.map((s) => ({ ...s }));
  },
  async createSalon(input: CreateSalonInput): Promise<SalonDTO> {
    const salon: SalonDTO = {
      id: ++salonSeq,
      name: input.name,
      city: input.city ?? null,
      location: input.location ?? null,
      guarantee_rate: input.guarantee_rate ?? null,
      service_prices: input.service_prices ?? { haircut: 23, color: 85 },
      created_at: now(),
      updated_at: now(),
    };
    salons.push(salon);
    logAudit("salon.create", "salon", String(salon.id));
    return { ...salon };
  },

  // ── Users ───────────────────────────────────────────────────────────────
  async listUsers(): Promise<UserDTO[]> {
    return users.map((u) => ({ ...u }));
  },
  async createUser(input: CreateUserInput): Promise<UserDTO> {
    const user: UserDTO = {
      id: ++userSeq,
      name: input.name,
      role: input.role,
      salon_id: input.salon_id,
      manager_id: input.manager_id ?? null,
      title: input.title ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      guarantee_rate: input.guarantee_rate ?? null,
      created_at: now(),
      updated_at: now(),
    };
    users.push(user);
    logAudit("user.create", "user", String(user.id));
    return { ...user };
  },

  // ── Pay tiers ─────────────────────────────────────────────────────────────
  async listPayTiers(salonId: number): Promise<PayTierDTO[]> {
    if (!payTiers.has(salonId)) {
      payTiers.set(
        salonId,
        PPH_TIERS.map((t, i) => ({ id: i + 1, salon_id: salonId, desired_rate: t.payRate, pph: t.pphRequired })),
      );
    }
    return (payTiers.get(salonId) ?? []).map((t) => ({ ...t }));
  },
  async replacePayTiers(salonId: number, tiers: { salon_id: number; desired_rate: number; pph: number }[]): Promise<PayTierDTO[]> {
    const saved = tiers.map((t, i) => ({ id: i + 1, salon_id: salonId, desired_rate: t.desired_rate, pph: t.pph }));
    payTiers.set(salonId, saved);
    logAudit("payplan.replace", "pay_tier", String(salonId));
    return saved.map((t) => ({ ...t }));
  },

  // ── Imports (simulated: parse the file to report believable counts) ────────
  async importUsers(file: File): Promise<BulkUserResult> {
    const rows = await readRows(file);
    const created = Math.max(0, rows.length - 1);
    logAudit("user.bulk_import", "user");
    return { created, updated: 0, skipped: 0, errors: [], credentials: {} };
  },
  async importWeekly(file: File): Promise<WeeklyImportResult> {
    const rows = await readRows(file);
    logAudit("import.weekly", "week");
    return { inserted: Math.max(0, rows.length - 1), updated: 0, skipped: 0, errors: [] };
  },
  async importDaily(file: File): Promise<WeeklyImportResult> {
    const rows = await readRows(file);
    logAudit("import.daily", "daily_performance");
    return { inserted: Math.max(0, rows.length - 1), updated: 0, skipped: 0, errors: [] };
  },
  async importClient(file: File, weekStart?: string): Promise<ClientImportResult> {
    const rows = await readRows(file);
    const dataRows = rows.slice(1);
    const salonCol = new Set(dataRows.map((r) => (r[0] ?? "").trim()).filter(Boolean));
    logAudit("import.client", "week");
    return {
      week_start: weekStart || "2026-06-22",
      salons_created: salonCol.size,
      users_created: dataRows.length,
      users_updated: 0,
      weeks_inserted: dataRows.length,
      weeks_updated: 0,
      skipped: 0,
      errors: [],
      credentials: {},
    };
  },

  // ── Account setup: reset password + invite (session-local simulation) ──────
  async resetPassword(userId: number): Promise<{ user_id: number; email: string | null; emailed: boolean; temporary_password: string | null }> {
    const u = users.find((x) => x.id === userId);
    logAudit("user.reset_password", "user", String(userId));
    return { user_id: userId, email: u?.email ?? null, emailed: false, temporary_password: "Demo-Temp-1234" };
  },
  async invite(userId: number, email?: string): Promise<InviteResponse> {
    const u = users.find((x) => x.id === userId);
    const to = email ?? u?.email ?? null;
    if (u && email) u.email = email;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    logAudit("user.invite", "user", String(userId));
    return {
      user_id: userId,
      email: to,
      emailed: false,
      setup_link: `${origin}/accept-invite?token=demo-${userId}`,
      expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    };
  },

  // ── Audit + templates ─────────────────────────────────────────────────────
  async audit(limit = 100): Promise<AuditLogDTO[]> {
    return audit.slice(0, limit).map((a) => ({ ...a }));
  },
};

export const DEMO_TEMPLATES = {
  users: USERS_TEMPLATE,
  weekly: WEEKLY_TEMPLATE,
  daily: DAILY_TEMPLATE,
  client: CLIENT_TEMPLATE,
};
