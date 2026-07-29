"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  Check,
  Info,
  Layers,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  Sliders,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import { useApp } from "@/store/AppContext";
import { DEFAULT_CONFIG } from "@/lib/mockData";
import type { PayConfig, PayTierRow } from "@/lib/types";
import { computePreview, payConfigToActive, type PreviewResult } from "@/lib/paymentLogic";
import { resolveSelection, sliceDays } from "@/lib/selection";
import {
  Button,
  Card,
  CardBody,
  Modal,
  NumberField,
  SectionTitle,
  Segmented,
  Select,
} from "@/components/ui/primitives";
import { money, num, pct, rate } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Clone a config so the draft never mutates the live global logic. */
function cloneConfig(c: PayConfig): PayConfig {
  return { ...c, tiers: c.tiers.map((t) => ({ ...t })) };
}

interface DraftErrors {
  errors: string[];
}

function validate(draft: PayConfig): DraftErrors {
  const errors: string[] = [];
  if (draft.tiers.length === 0) errors.push("Add at least one tier to the pay table.");
  const rates = draft.tiers.map((t) => t.payRate);
  if (new Set(rates).size !== rates.length) errors.push("Each pay rate in the tier table must be unique.");
  if (draft.tiers.some((t) => !(t.payRate > 0) || !(t.pphRequired > 0)))
    errors.push("Every tier needs a pay rate and required PPH greater than 0.");
  const sorted = [...draft.tiers].sort((a, b) => a.payRate - b.payRate);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].pphRequired < sorted[i - 1].pphRequired) {
      errors.push("Required PPH must not go down as the pay rate goes up.");
      break;
    }
  }
  if (!(draft.npRate > 0 && draft.npRate <= 1)) errors.push("NP rate must be between 0 and 1 (e.g. 0.40).");
  if (!(draft.commissionRate > 0 && draft.commissionRate <= 1))
    errors.push("Commission rate must be between 0 and 1.");
  if (!(draft.npPercent >= 0 && draft.npPercent <= 1)) errors.push("Net-profit % must be between 0 and 1.");
  if (draft.guaranteeRate < 0) errors.push("Guarantee rate cannot be negative.");
  if (!(draft.haircutPrice > 0) || !(draft.colorPrice > 0)) errors.push("Service prices must be greater than 0.");
  if (!(draft.avgTicketHaircut > 0) || !(draft.avgTicketColor > 0))
    errors.push("Average ticket values must be greater than 0.");
  if (!(draft.serviceMixHaircut >= 0 && draft.serviceMixHaircut <= 1))
    errors.push("Service mix (haircuts) must be between 0% and 100%.");
  if (draft.minServicesPerDay < 0) errors.push("Minimum services / day cannot be negative.");
  return { errors };
}

export function PaymentLogicPanel() {
  const {
    config,
    savePaymentLogic,
    allowedStylists,
    getDays,
    resolveUser,
    timeView,
    selectedWeekId,
    selectedPeriodIndex,
  } = useApp();

  const [draft, setDraft] = useState<PayConfig>(() => cloneConfig(config));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { errors } = useMemo(() => validate(draft), [draft]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(config), [draft, config]);

  const updateField = (patch: Partial<PayConfig>) => setDraft((d) => ({ ...d, ...patch }));
  const updateTier = (i: number, patch: Partial<PayTierRow>) =>
    setDraft((d) => ({ ...d, tiers: d.tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) }));
  const addTier = () =>
    setDraft((d) => {
      const last = [...d.tiers].sort((a, b) => a.payRate - b.payRate).at(-1);
      const payRate = last ? last.payRate + 1 : 11;
      const pphRequired = last ? Math.round(payRate / (d.npRate || 0.4)) : 28;
      return { ...d, tiers: [...d.tiers, { payRate, pphRequired }] };
    });
  const removeTier = (i: number) => setDraft((d) => ({ ...d, tiers: d.tiers.filter((_, idx) => idx !== i) }));

  const revert = () => {
    setDraft(cloneConfig(config));
    setError(null);
  };
  const resetDefaults = () => {
    setDraft(cloneConfig(DEFAULT_CONFIG));
    setError(null);
  };

  const apply = async () => {
    setSaving(true);
    setError(null);
    try {
      await savePaymentLogic({
        ...draft,
        tiers: [...draft.tiers].sort((a, b) => a.payRate - b.payRate),
      });
      setSaved(true);
      setConfirmOpen(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <DangerZone />

      <OverviewSection draft={draft} />

      <TierTableSection
        tiers={draft.tiers}
        onUpdate={updateTier}
        onAdd={addTier}
        onRemove={removeTier}
      />

      <CoreRatesSection draft={draft} onChange={updateField} />

      <LivePreviewSection
        draft={draft}
        current={config}
        allowedStylists={allowedStylists}
        getDays={getDays}
        resolveUser={resolveUser}
        selection={resolveSelection(timeView, selectedWeekId, selectedPeriodIndex)}
      />

      {/* ── Save / Apply globally ─────────────────────────────────────────── */}
      <Card className="border-[var(--color-brand)]/40">
        <CardBody className="space-y-3">
          <SectionTitle hint="Takes effect immediately for every user and every location">
            <span className="inline-flex items-center gap-2 normal-case">
              <Save size={16} className="text-[var(--color-brand)]" /> Save &amp; apply globally
            </span>
          </SectionTitle>

          {errors.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
              {errors.map((e) => (
                <li key={e} className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {e}
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p className="rounded-xl bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">{error}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setConfirmOpen(true)} disabled={errors.length > 0 || !dirty || saving}>
              {saved ? <Check size={16} /> : <Save size={16} />}
              {saved ? "Applied globally" : "Apply globally"}
            </Button>
            <Button variant="ghost" size="sm" onClick={revert} disabled={!dirty || saving}>
              <Undo2 size={14} /> Revert changes
            </Button>
            <Button variant="ghost" size="sm" onClick={resetDefaults} disabled={saving}>
              <RotateCcw size={14} /> Reset to defaults
            </Button>
            <span className="ml-auto text-xs text-[var(--color-ink-faint)]">
              {dirty ? "Unsaved changes" : "No changes"}
            </span>
          </div>
        </CardBody>
      </Card>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Apply payment logic globally?" size="md">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" />
            <p>
              This replaces the payment logic and calculations for the <b>entire organization</b> — every
              stylist, manager, and admin, across <b>every location</b>. All dashboards, planners, and team views
              will immediately reflect the new numbers.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <SummaryStat label="Tiers" value={`${draft.tiers.length}`} />
            <SummaryStat label="Guarantee" value={`${rate(draft.guaranteeRate)}/hr`} />
            <SummaryStat label="NP rate" value={pct(draft.npRate)} />
            <SummaryStat label="Haircut / Color" value={`${money(draft.haircutPrice)} / ${money(draft.colorPrice)}`} />
          </dl>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={apply} disabled={saving}>
              {saving ? "Applying…" : "Yes, apply to everyone"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function DangerZone() {
  return (
    <Card className="border-[var(--color-danger)]/50 bg-[var(--color-danger-soft)]">
      <CardBody>
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-danger)] text-white">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--color-danger)]">Danger Zone — organization-wide settings</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              This page controls the payment tier logic and calculations that drive{" "}
              <b>every number shown to every user, in every location</b>. Changes here are{" "}
              <b>global only</b> — there are no per-salon or per-employee variations. A change applies to the
              entire user population the moment you apply it. Only make changes here if you fully understand the
              impact on pay calculations across the whole company.
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function OverviewSection({ draft }: { draft: PayConfig }) {
  const lowest = [...draft.tiers].sort((a, b) => a.payRate - b.payRate)[0];
  const highest = [...draft.tiers].sort((a, b) => a.payRate - b.payRate).at(-1);
  return (
    <Card>
      <CardBody className="space-y-3">
        <SectionTitle hint="Plain-language explanation of how the numbers are derived">
          <span className="inline-flex items-center gap-2 normal-case">
            <Info size={16} className="text-[var(--color-brand)]" /> Overview — how the calculations work
          </span>
        </SectionTitle>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Every stylist&apos;s headline <b>$/hr</b> comes from their <b>Production Per Hour (PPH)</b> — the service
          revenue they produce divided by hours worked. We look that PPH up in the <b>tier table</b> below to find
          the pay rate they&apos;ve earned, and never let it fall below the <b>guarantee floor</b>. These same rules
          drive planners, goals, and every team view.
        </p>
        <ul className="space-y-2 text-sm">
          <Formula term="Production Per Hour" body="PPH = production ÷ hours worked" />
          <Formula
            term="Effective pay rate ($/hr)"
            body="rate = highest tier whose required PPH is met, floored at the guarantee"
          />
          <Formula term="Pay for the period" body="pay = effective rate × hours worked" />
          <Formula
            term="Production needed for a target rate"
            body={`required = (PPH for that rate) × scheduled hours`}
          />
          <Formula
            term="Off-tier rates"
            body={`for a rate that isn't in the table, PPH = rate ÷ NP rate (${draft.npRate})`}
          />
          <Formula
            term="Service projection"
            body={`production is split into services using $${draft.haircutPrice}/haircut and $${draft.colorPrice}/color`}
          />
        </ul>
        {lowest && highest && (
          <p className="text-xs text-[var(--color-ink-faint)]">
            Current ladder: {draft.tiers.length} tiers from{" "}
            <b>
              {rate(lowest.payRate)}/hr @ {num(lowest.pphRequired)} PPH
            </b>{" "}
            up to{" "}
            <b>
              {rate(highest.payRate)}/hr @ {num(highest.pphRequired)} PPH
            </b>
            .
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function Formula({ term, body }: { term: string; body: string }) {
  return (
    <li className="rounded-xl bg-[var(--color-surface-2)] px-3 py-2">
      <span className="font-semibold">{term}:</span>{" "}
      <span className="text-[var(--color-ink-soft)]">{body}</span>
    </li>
  );
}

function TierTableSection({
  tiers,
  onUpdate,
  onAdd,
  onRemove,
}: {
  tiers: PayTierRow[];
  onUpdate: (i: number, patch: Partial<PayTierRow>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between">
          <SectionTitle hint="The pay rate a stylist earns for reaching each Production-Per-Hour level">
            <span className="inline-flex items-center gap-2 normal-case">
              <Layers size={16} className="text-[var(--color-brand)]" /> Payment tier table
            </span>
          </SectionTitle>
          <Button variant="soft" size="sm" onClick={onAdd}>
            <Plus size={14} /> Add tier
          </Button>
        </div>
        <p className="text-sm text-[var(--color-ink-faint)]">
          Each row maps a <b>pay rate ($/hr)</b> to the <b>Production Per Hour</b> a stylist must reach to earn it.
          Rows are automatically sorted by pay rate when you apply.
        </p>

        <div className="hidden grid-cols-[1fr_1fr_auto] gap-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-faint)] sm:grid">
          <span>Pay rate ($/hr)</span>
          <span>PPH required</span>
          <span className="w-9" />
        </div>
        <div className="space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
              <NumberField
                label=""
                value={t.payRate}
                onChange={(v) => onUpdate(i, { payRate: v })}
                prefix="$"
                suffix="/hr"
                step={0.5}
                min={0}
              />
              <NumberField
                label=""
                value={t.pphRequired}
                onChange={(v) => onUpdate(i, { pphRequired: v })}
                suffix="PPH"
                step={1}
                min={0}
              />
              <button
                type="button"
                aria-label={`Remove tier ${t.payRate}`}
                onClick={() => onRemove(i)}
                className="grid h-11 w-9 place-items-center rounded-xl border border-[var(--color-border)] text-[var(--color-ink-faint)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {tiers.length === 0 && (
            <p className="rounded-xl bg-[var(--color-warning-soft)] px-3 py-2 text-sm text-[var(--color-warning)]">
              No tiers yet — add at least one so stylists can earn above the guarantee.
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function CoreRatesSection({
  draft,
  onChange,
}: {
  draft: PayConfig;
  onChange: (patch: Partial<PayConfig>) => void;
}) {
  return (
    <Card>
      <CardBody className="space-y-4">
        <SectionTitle hint="The global rates, prices and parameters used by the calculation engine">
          <span className="inline-flex items-center gap-2 normal-case">
            <Sliders size={16} className="text-[var(--color-brand)]" /> Core rates &amp; parameters
          </span>
        </SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            label="Guarantee rate"
            value={draft.guaranteeRate}
            onChange={(v) => onChange({ guaranteeRate: v })}
            prefix="$"
            suffix="/hr"
            step={0.5}
            hint="The minimum $/hr any stylist earns, regardless of production."
          />
          <NumberField
            label="NP rate (net-production share)"
            value={draft.npRate}
            onChange={(v) => onChange({ npRate: v })}
            step={0.01}
            hint="Drives PPH for off-table rates and the guarantee-as-production floor."
          />
          <NumberField
            label="Commission rate"
            value={Math.round(draft.commissionRate * 100)}
            onChange={(v) => onChange({ commissionRate: Math.max(0, Math.min(100, v)) / 100 })}
            suffix="%"
            step={1}
            hint="Net-production share shown in the commission-vs-guarantee split."
          />
          <NumberField
            label="Net-profit %"
            value={Math.round(draft.npPercent * 100)}
            onChange={(v) => onChange({ npPercent: Math.max(0, Math.min(100, v)) / 100 })}
            suffix="%"
            step={0.5}
            hint="Informational net-profit percentage surfaced on reports."
          />
          <NumberField
            label="Service price · Haircut"
            value={draft.haircutPrice}
            onChange={(v) => onChange({ haircutPrice: v, avgTicketHaircut: v })}
            prefix="$"
            step={1}
            min={1}
            hint="Production earned per haircut — used everywhere production maps to services."
          />
          <NumberField
            label="Service price · Color"
            value={draft.colorPrice}
            onChange={(v) => onChange({ colorPrice: v, avgTicketColor: v })}
            prefix="$"
            step={1}
            min={1}
            hint="Production earned per color service."
          />
          <NumberField
            label="Default service mix (haircuts)"
            value={Math.round(draft.serviceMixHaircut * 100)}
            onChange={(v) => onChange({ serviceMixHaircut: Math.max(0, Math.min(100, v)) / 100 })}
            suffix="%"
            step={5}
            hint="Assumed haircut share when projecting future services (rest are colors)."
          />
          <NumberField
            label="Min expected services / day"
            value={draft.minServicesPerDay}
            onChange={(v) => onChange({ minServicesPerDay: v })}
            step={1}
            min={0}
            hint="Used for planner feasibility checks."
          />
        </div>
      </CardBody>
    </Card>
  );
}

/* ── Live preview ─────────────────────────────────────────────────────────── */

interface Selection {
  start: string;
  end: string;
}

function LivePreviewSection({
  draft,
  current,
  allowedStylists,
  getDays,
  resolveUser,
  selection,
}: {
  draft: PayConfig;
  current: PayConfig;
  allowedStylists: { id: string; name: string }[];
  getDays: (id: string) => import("@/lib/types").DayRecord[];
  resolveUser: (id: string) => import("@/lib/types").User | undefined;
  selection: Selection;
}) {
  const [mode, setMode] = useState<"sample" | "employee">("sample");
  const [production, setProduction] = useState(560);
  const [hours, setHours] = useState(8);
  const [scheduledHours, setScheduledHours] = useState(40);
  const [targetRate, setTargetRate] = useState(20);
  const [stylistId, setStylistId] = useState(allowedStylists[0]?.id ?? "");

  const employeeSample = useMemo(() => {
    if (mode !== "employee" || !stylistId) return null;
    const days = sliceDays(getDays(stylistId), selection.start, selection.end);
    const prod = days.reduce((a, d) => a + d.production, 0);
    const worked = days.reduce((a, d) => a + d.workedHours, 0);
    const sched = days.reduce((a, d) => a + d.scheduledHours, 0);
    const gtd = resolveUser(stylistId)?.guaranteeRate ?? draft.guaranteeRate;
    return { production: prod, hours: worked, scheduledHours: sched, guaranteeRate: gtd };
  }, [mode, stylistId, getDays, resolveUser, selection.start, selection.end, draft.guaranteeRate]);

  const input = employeeSample ?? {
    production,
    hours,
    scheduledHours,
    guaranteeRate: draft.guaranteeRate,
  };

  const before = useMemo(
    () =>
      computePreview(payConfigToActive(current), {
        production: input.production,
        hours: input.hours,
        guaranteeRate: mode === "employee" ? input.guaranteeRate : current.guaranteeRate,
        targetRate,
        scheduledHours: input.scheduledHours,
      }),
    [current, input.production, input.hours, input.guaranteeRate, input.scheduledHours, targetRate, mode],
  );
  const after = useMemo(
    () =>
      computePreview(payConfigToActive(draft), {
        production: input.production,
        hours: input.hours,
        guaranteeRate: mode === "employee" ? input.guaranteeRate : draft.guaranteeRate,
        targetRate,
        scheduledHours: input.scheduledHours,
      }),
    [draft, input.production, input.hours, input.guaranteeRate, input.scheduledHours, targetRate, mode],
  );

  return (
    <Card className="border-transparent bg-[var(--color-brand-soft)]">
      <CardBody className="space-y-4">
        <SectionTitle hint="See exactly how the numbers change before you apply them">
          <span className="inline-flex items-center gap-2 normal-case">
            <Calculator size={16} className="text-[var(--color-brand-ink)]" /> Live preview
          </span>
        </SectionTitle>

        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "sample", label: "Sample scenario" },
            { value: "employee", label: "Real employee" },
          ]}
        />

        {mode === "sample" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <NumberField label="Production" value={production} onChange={setProduction} prefix="$" step={20} min={0} />
            <NumberField label="Hours worked" value={hours} onChange={setHours} suffix="h" step={1} min={0} />
            <NumberField label="Scheduled hours" value={scheduledHours} onChange={setScheduledHours} suffix="h" step={1} min={0} />
            <NumberField label="Target rate" value={targetRate} onChange={setTargetRate} prefix="$" suffix="/hr" step={1} min={0} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)]">
                <Users size={14} /> Employee
              </span>
              <Select value={stylistId} onChange={(e) => setStylistId(e.target.value)}>
                {allowedStylists.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
            <NumberField label="Target rate" value={targetRate} onChange={setTargetRate} prefix="$" suffix="/hr" step={1} min={0} />
            <p className="sm:col-span-2 text-xs text-[var(--color-ink-faint)]">
              Using this employee&apos;s actual production ({money(input.production)}) over {num(input.hours)} worked
              hours for the selected period.
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <PreviewCard title="Current logic" result={before} tone="neutral" targetRate={targetRate} />
          <PreviewCard title="New logic (proposed)" result={after} tone="brand" targetRate={targetRate} />
        </div>
        <p className="text-xs text-[var(--color-ink-soft)]">
          These are the exact numbers users would see. Nothing is saved until you apply globally.
        </p>
      </CardBody>
    </Card>
  );
}

function PreviewCard({
  title,
  result,
  tone,
  targetRate,
}: {
  title: string;
  result: PreviewResult;
  tone: "neutral" | "brand";
  targetRate: number;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl p-4",
        tone === "brand" ? "bg-[var(--color-brand)] text-white" : "bg-[var(--color-surface)]",
      )}
    >
      <div className={cn("text-xs font-semibold uppercase tracking-wide", tone === "brand" ? "text-white/80" : "text-[var(--color-ink-faint)]")}>
        {title}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <PreviewStat label="Effective rate" value={`${rate(result.effectiveRate)}/hr`} tone={tone} big />
        <PreviewStat label="PPH" value={num(result.pph)} tone={tone} />
        <PreviewStat label="Pay" value={money(result.pay)} tone={tone} />
        <PreviewStat label={result.onGuarantee ? "On guarantee" : "Above guarantee"} value={result.onGuarantee ? "Yes" : "No"} tone={tone} />
        {result.requiredProductionForTarget != null && (
          <PreviewStat
            label={`Need for $${targetRate}/hr`}
            value={money(result.requiredProductionForTarget)}
            tone={tone}
          />
        )}
        {result.remainingProductionForTarget != null && (
          <PreviewStat label="Still needed" value={money(result.remainingProductionForTarget)} tone={tone} />
        )}
      </div>
    </div>
  );
}

function PreviewStat({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string;
  tone: "neutral" | "brand";
  big?: boolean;
}) {
  return (
    <div>
      <div className={cn("text-[11px] font-medium uppercase", tone === "brand" ? "text-white/70" : "text-[var(--color-ink-faint)]")}>
        {label}
      </div>
      <div className={cn("mt-0.5 font-bold tabular-nums", big ? "text-xl" : "text-base")}>{value}</div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] p-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">{label}</div>
      <div className="mt-0.5 text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}
