/**
 * Global payment-logic runtime store (frontend single source of truth).
 *
 * The pure calculation helpers in `tiers.ts`, `payEngine.ts`, and `planner.ts`
 * do not have access to React context, so they read the *active* organisation-
 * wide payment logic from this module. The `AppContext` keeps this module in
 * sync with the authoritative `PayConfig` (seeded from defaults / the backend),
 * so a change the highest admin (Owner) applies globally flows through to every
 * screen instantly.
 *
 * Payment logic is GLOBAL ONLY — there are no per-salon or per-user overrides of
 * the tier table / core calculation rules.
 *
 * ⚠️ The fallback default below is only a safety net for the brief window before
 * `tiers.ts` initialises this store with its canonical (parity-tested) tier
 * table. `tiers.ts` remains the source literal that the pay-parity test guards.
 */

import type { PayConfig, PayTierRow } from "@/lib/types";
import type { PaymentLogicDTO, PaymentLogicUpdateDTO } from "@/lib/api/types";

/** The calculation-relevant fields the pure engines consume. */
export interface ActivePaymentLogic {
  tiers: PayTierRow[];
  npRate: number;
  npPercent: number;
  guaranteeRate: number;
  commissionRate: number;
  haircutPrice: number;
  colorPrice: number;
  avgTicketHaircut: number;
  avgTicketColor: number;
  serviceMixHaircut: number;
  minServicesPerDay: number;
}

// Safety-net fallback. Overwritten by `tiers.ts` at module load with the
// canonical, parity-tested tier table + rates, and then by `AppContext` with the
// authoritative config. Kept in agreement with `tiers.ts` constants.
let active: ActivePaymentLogic = {
  tiers: [
    { payRate: 8, pphRequired: 20 },
    { payRate: 9, pphRequired: 22.5 },
    { payRate: 10, pphRequired: 25 },
    { payRate: 11, pphRequired: 27.5 },
    { payRate: 12, pphRequired: 30 },
    { payRate: 13, pphRequired: 32.5 },
    { payRate: 14, pphRequired: 35 },
    { payRate: 15, pphRequired: 37.5 },
    { payRate: 16, pphRequired: 40 },
    { payRate: 17, pphRequired: 42.5 },
    { payRate: 18, pphRequired: 45 },
    { payRate: 19, pphRequired: 47.5 },
    { payRate: 20, pphRequired: 50 },
  ],
  npRate: 0.4,
  npPercent: 0.195,
  guaranteeRate: 10,
  commissionRate: 0.4,
  haircutPrice: 23,
  colorPrice: 85,
  avgTicketHaircut: 23,
  avgTicketColor: 85,
  serviceMixHaircut: 0.6,
  minServicesPerDay: 6,
};

const listeners = new Set<() => void>();

/** The active global payment logic the calculation engines read from. */
export function getActivePaymentLogic(): ActivePaymentLogic {
  return active;
}

/** Sorted (ascending by payRate) copy of the active tier table. */
export function getActiveTiers(): PayTierRow[] {
  return [...active.tiers].sort((a, b) => a.payRate - b.payRate);
}

/** Replace the active global payment logic and notify subscribers. */
export function setActivePaymentLogic(next: ActivePaymentLogic): void {
  active = {
    ...next,
    tiers: [...next.tiers].sort((a, b) => a.payRate - b.payRate),
  };
  for (const l of listeners) l();
}

/** Subscribe to active-config changes (returns an unsubscribe fn). */
export function subscribePaymentLogic(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Project the authoritative `PayConfig` onto the calculation-relevant subset. */
export function payConfigToActive(config: PayConfig): ActivePaymentLogic {
  return {
    tiers: config.tiers,
    npRate: config.npRate,
    npPercent: config.npPercent,
    guaranteeRate: config.guaranteeRate,
    commissionRate: config.commissionRate,
    haircutPrice: config.haircutPrice,
    colorPrice: config.colorPrice,
    avgTicketHaircut: config.avgTicketHaircut,
    avgTicketColor: config.avgTicketColor,
    serviceMixHaircut: config.serviceMixHaircut,
    minServicesPerDay: config.minServicesPerDay,
  };
}

// ── Backend DTO mappers ──────────────────────────────────────────────────────

/** Project the authoritative `PayConfig` onto the backend update payload. */
export function payConfigToUpdateDTO(config: PayConfig): PaymentLogicUpdateDTO {
  return {
    tiers: config.tiers.map((t) => ({ pay_rate: t.payRate, pph_required: t.pphRequired })),
    np_rate: config.npRate,
    np_percent: config.npPercent,
    guarantee_rate: config.guaranteeRate,
    commission_rate: config.commissionRate,
    haircut_price: config.haircutPrice,
    color_price: config.colorPrice,
    avg_ticket_haircut: config.avgTicketHaircut,
    avg_ticket_color: config.avgTicketColor,
    service_mix_haircut: config.serviceMixHaircut,
    min_services_per_day: config.minServicesPerDay,
  };
}

/** Merge a backend payment-logic DTO into a `PayConfig` (preserving legacy fields). */
export function paymentLogicDTOToPayConfig(dto: PaymentLogicDTO, base: PayConfig): PayConfig {
  return {
    ...base,
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

// ── Preview (pure, parameterised — never touches the active store) ───────────

export interface PreviewInput {
  production: number;
  hours: number;
  guaranteeRate?: number;
  targetRate?: number;
  scheduledHours?: number;
}

export interface PreviewResult {
  pph: number;
  effectiveRate: number;
  pay: number;
  commissionPay: number;
  guaranteePay: number;
  onGuarantee: boolean;
  guaranteeRate: number;
  minExpectedProduction: number;
  requiredProductionForTarget?: number;
  remainingProductionForTarget?: number;
}

/**
 * PPH required for a Desired Pay Rate under a specific config.
 * Client rule: `ceil(DPR / NP_RATE)` (round up to the nearest whole dollar).
 */
function pphForRateWith(logic: ActivePaymentLogic, payRate: number): number {
  return logic.npRate > 0 ? Math.ceil(payRate / logic.npRate) : 0;
}

/** Tiered effective $/hr for an achieved PPH under a specific config. */
function effectiveRateWith(
  logic: ActivePaymentLogic,
  achievedPph: number,
  guaranteeRate: number,
  applyGuarantee = true,
): number {
  const tiers = [...logic.tiers].sort((a, b) => a.payRate - b.payRate);
  if (tiers.length === 0 || achievedPph < tiers[0].pphRequired) {
    return applyGuarantee ? guaranteeRate : 0;
  }
  let rate = tiers[0].payRate;
  for (const t of tiers) {
    if (t.pphRequired <= achievedPph) rate = t.payRate;
    else break;
  }
  return applyGuarantee ? Math.max(rate, guaranteeRate) : rate;
}

/**
 * Compute the user-facing numbers a *given* payment-logic config would produce
 * for a sample scenario. Pure — used for instant, non-destructive live preview
 * of proposed changes before they are applied globally.
 */
export function computePreview(logic: ActivePaymentLogic, input: PreviewInput): PreviewResult {
  const gtd = input.guaranteeRate ?? logic.guaranteeRate;
  const pph = input.hours > 0 ? input.production / input.hours : 0;
  const effectiveRate = input.hours > 0 ? effectiveRateWith(logic, pph, gtd) : 0;
  const tierRateNoFloor = input.hours > 0 ? effectiveRateWith(logic, pph, gtd, false) : 0;
  const pay = effectiveRate * input.hours;
  const commissionPay = input.production * logic.commissionRate;
  const guaranteePay = gtd * input.hours;

  const result: PreviewResult = {
    pph: round2(pph),
    effectiveRate: round2(effectiveRate),
    pay: round2(pay),
    commissionPay: round2(commissionPay),
    guaranteePay: round2(guaranteePay),
    onGuarantee: input.hours > 0 && tierRateNoFloor < gtd,
    guaranteeRate: round2(gtd),
    minExpectedProduction: round2((gtd / logic.npRate) * (input.scheduledHours ?? input.hours)),
  };
  if (input.targetRate != null) {
    const sched = input.scheduledHours ?? input.hours;
    const required = pphForRateWith(logic, input.targetRate) * sched;
    result.requiredProductionForTarget = round2(required);
    result.remainingProductionForTarget = round2(Math.max(0, required - input.production));
  }
  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
