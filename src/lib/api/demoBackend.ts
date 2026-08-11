/**
 * In-browser stand-in for the FastAPI backend, used only in DEMO_MODE.
 *
 * The credential-free demo build has no backend, so the Admin panel's API calls
 * would otherwise fail with "Failed to fetch". This shim resolves those calls
 * against the offline demo dataset (`mockData`) — real reads, session-local
 * writes, and client-side CSV templates — so the whole Admin experience works
 * reliably with no network. Nothing here is persisted beyond the session.
 */

import { DEFAULT_CONFIG, SALONS, USERS } from "@/lib/mockData";
import { computePreview, getActiveTiers, type ActivePaymentLogic } from "@/lib/paymentLogic";
import { CLIENT_TEMPLATE, DAILY_TEMPLATE, USERS_TEMPLATE, WEEKLY_TEMPLATE } from "@/lib/importTemplates";
import { looksLikeDailyImport, parseDailyBulk, parseWeeklyBulk } from "@/lib/demoImport";
import { importFileToCsv } from "@/lib/xlsx";
import type {
  AuditLogDTO,
  BackendRole,
  BulkUserResult,
  ClientImportResult,
  CreateSalonInput,
  CreateUserInput,
  PaymentLogicDTO,
  PaymentLogicPreviewDTO,
  PaymentLogicPreviewRequestDTO,
  PaymentLogicUpdateDTO,
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
  excluded: u.excluded ?? false,
  created_at: now(),
  updated_at: now(),
}));

const payTiers = new Map<number, PayTierDTO[]>();
const audit: AuditLogDTO[] = [];

// ── Global payment logic (in-memory, session-local, seeded from defaults) ─────
let paymentLogicStore: PaymentLogicUpdateDTO = {
  tiers: DEFAULT_CONFIG.tiers.map((t) => ({ pay_rate: t.payRate, pph_required: t.pphRequired })),
  np_rate: DEFAULT_CONFIG.npRate,
  np_percent: DEFAULT_CONFIG.npPercent,
  guarantee_rate: DEFAULT_CONFIG.guaranteeRate,
  commission_rate: DEFAULT_CONFIG.commissionRate,
  haircut_price: DEFAULT_CONFIG.haircutPrice,
  color_price: DEFAULT_CONFIG.colorPrice,
  avg_ticket_haircut: DEFAULT_CONFIG.avgTicketHaircut,
  avg_ticket_color: DEFAULT_CONFIG.avgTicketColor,
  service_mix_haircut: DEFAULT_CONFIG.serviceMixHaircut,
  min_services_per_day: DEFAULT_CONFIG.minServicesPerDay,
};

function paymentLogicFormula(store: PaymentLogicUpdateDTO): Record<string, unknown> {
  const tiers = [...store.tiers].sort((a, b) => a.pay_rate - b.pay_rate);
  return {
    summary:
      "Every stylist's headline $/hr comes from their Production-Per-Hour (PPH). " +
      "We look up PPH in the tier table to find the pay rate they've earned, then " +
      "never let it drop below the guarantee floor.",
    definitions: [
      { term: "PPH (Production Per Hour)", formula: "PPH = production ÷ hours worked",
        explanation: "How much service revenue a stylist produces per hour." },
      { term: "Effective pay rate ($/hr)", formula: "rate = tier_lookup(PPH), floored at the guarantee",
        explanation: "The highest tier whose required PPH the stylist has fully reached. Never below the guarantee." },
      { term: "Pay", formula: "pay = effective_rate × hours worked",
        explanation: "What the stylist earns for the period." },
      { term: "Required production for a target rate", formula: "required = pph_for(target_rate) × scheduled_hours",
        explanation: "How much production is needed to hit a target $/hr." },
      { term: "Off-tier PPH", formula: `pph = pay_rate ÷ NP rate (${store.np_rate})`,
        explanation: "For a rate that isn't an exact table row, PPH is derived from the net-production (NP) rate." },
      { term: "Service projection", formula: `haircut = $${store.haircut_price}, color = $${store.color_price} of production each`,
        explanation: "Production is translated into service counts using these per-service prices." },
    ],
    parameters: {
      np_rate: store.np_rate,
      np_percent: store.np_percent,
      guarantee_rate: store.guarantee_rate,
      commission_rate: store.commission_rate,
      haircut_price: store.haircut_price,
      color_price: store.color_price,
      avg_ticket_haircut: store.avg_ticket_haircut,
      avg_ticket_color: store.avg_ticket_color,
      service_mix_haircut: store.service_mix_haircut,
      min_services_per_day: store.min_services_per_day,
      tier_count: tiers.length,
      lowest_tier: tiers[0] ?? null,
      highest_tier: tiers[tiers.length - 1] ?? null,
    },
  };
}

function updateDtoToActive(dto: PaymentLogicUpdateDTO): ActivePaymentLogic {
  return {
    tiers: dto.tiers.map((t) => ({ payRate: t.pay_rate, pphRequired: t.pph_required })),
    npRate: dto.np_rate,
    npPercent: dto.np_percent,
    guaranteeRate: dto.guarantee_rate,
    commissionRate: dto.commission_rate,
    haircutPrice: dto.haircut_price,
    colorPrice: dto.color_price,
    avgTicketHaircut: dto.avg_ticket_haircut,
    avgTicketColor: dto.avg_ticket_color,
    serviceMixHaircut: dto.service_mix_haircut,
    minServicesPerDay: dto.min_services_per_day,
  };
}

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
  const text = (await importFileToCsv(file)).replace(/^\uFEFF/, "");
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map(splitCsvLine);
}

/** Import result for a daily file, matching what /admin/import-daily returns. */
function dailyImportResult(text: string): WeeklyImportResult {
  const parsed = parseDailyBulk(text);
  return { inserted: parsed.rows.length, updated: 0, skipped: parsed.skipped, errors: parsed.errors };
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
      excluded: input.excluded ?? false,
      created_at: now(),
      updated_at: now(),
    };
    users.push(user);
    logAudit("user.create", "user", String(user.id));
    return { ...user };
  },
  async updateUser(id: number, patch: Partial<CreateUserInput>): Promise<UserDTO> {
    const user = users.find((u) => u.id === id);
    if (!user) throw new Error(`Unknown user ${id}`);
    if (patch.name !== undefined) user.name = patch.name;
    if (patch.role !== undefined) user.role = patch.role;
    if (patch.salon_id !== undefined) user.salon_id = patch.salon_id;
    if (patch.manager_id !== undefined) user.manager_id = patch.manager_id ?? null;
    if (patch.title !== undefined) user.title = patch.title ?? null;
    if (patch.email !== undefined) user.email = patch.email ?? null;
    if (patch.phone !== undefined) user.phone = patch.phone ?? null;
    if (patch.guarantee_rate !== undefined) user.guarantee_rate = patch.guarantee_rate ?? null;
    if (patch.excluded !== undefined) user.excluded = patch.excluded;
    user.updated_at = now();
    logAudit("user.update", "user", String(id));
    return { ...user };
  },
  async deactivateUser(id: number): Promise<UserDTO> {
    const user = users.find((u) => u.id === id);
    if (!user) throw new Error(`Unknown user ${id}`);
    logAudit("user.deactivate", "user", String(id));
    return { ...user };
  },

  // ── Pay tiers ─────────────────────────────────────────────────────────────
  async listPayTiers(salonId: number): Promise<PayTierDTO[]> {
    if (!payTiers.has(salonId)) {
      payTiers.set(
        salonId,
        getActiveTiers().map((t, i) => ({ id: i + 1, salon_id: salonId, desired_rate: t.payRate, pph: t.pphRequired })),
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

  // ── Global payment logic ──────────────────────────────────────────────────
  async getPaymentLogic(): Promise<PaymentLogicDTO> {
    return {
      ...paymentLogicStore,
      tiers: paymentLogicStore.tiers.map((t) => ({ ...t })),
      updated_by_email: "demo-owner",
      updated_at: now(),
      formula: paymentLogicFormula(paymentLogicStore),
    };
  },
  async updatePaymentLogic(body: PaymentLogicUpdateDTO): Promise<PaymentLogicDTO> {
    paymentLogicStore = {
      ...body,
      tiers: [...body.tiers].sort((a, b) => a.pay_rate - b.pay_rate),
    };
    logAudit("payment_logic.update", "payment_logic_config", "1");
    return {
      ...paymentLogicStore,
      tiers: paymentLogicStore.tiers.map((t) => ({ ...t })),
      updated_by_email: "demo-owner",
      updated_at: now(),
      formula: paymentLogicFormula(paymentLogicStore),
    };
  },
  async previewPaymentLogic(body: PaymentLogicPreviewRequestDTO): Promise<PaymentLogicPreviewDTO> {
    const r = computePreview(updateDtoToActive(body.config), {
      production: body.production,
      hours: body.hours,
      guaranteeRate: body.guarantee_rate ?? undefined,
      targetRate: body.target_rate ?? undefined,
      scheduledHours: body.scheduled_hours ?? undefined,
    });
    return {
      pph: r.pph,
      effective_rate: r.effectiveRate,
      pay: r.pay,
      commission_pay: r.commissionPay,
      guarantee_pay: r.guaranteePay,
      on_guarantee: r.onGuarantee,
      guarantee_rate: r.guaranteeRate,
      min_expected_production: r.minExpectedProduction,
      target_rate: body.target_rate ?? null,
      required_production_for_target: r.requiredProductionForTarget ?? null,
      remaining_production_for_target: r.remainingProductionForTarget ?? null,
    };
  },

  // ── Imports ────────────────────────────────────────────────────────────────
  // User/client imports are simulated (row counts only); the performance imports
  // run the real parsers so the reported rows, employees and errors are the ones
  // the live backend would produce for that file.
  async importUsers(file: File): Promise<BulkUserResult> {
    const rows = await readRows(file);
    const created = Math.max(0, rows.length - 1);
    logAudit("user.bulk_import", "user");
    return { created, updated: 0, skipped: 0, errors: [], credentials: {} };
  },
  async importWeekly(file: File): Promise<WeeklyImportResult> {
    const text = await importFileToCsv(file);
    logAudit("import.weekly", "week");
    // A daily file uploaded under "Weekly" still imports — the live backend
    // routes on the headers too, so mirror that instead of miscounting.
    if (looksLikeDailyImport(text)) return dailyImportResult(text);
    const parsed = parseWeeklyBulk(text);
    return { inserted: parsed.rows.length, updated: 0, skipped: parsed.skipped, errors: parsed.errors };
  },
  async importDaily(file: File): Promise<WeeklyImportResult> {
    const text = await importFileToCsv(file);
    logAudit("import.daily", "daily_performance");
    return dailyImportResult(text);
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
