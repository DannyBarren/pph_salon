"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  Search,
  Save,
  Check,
  Upload,
  Download,
  FileSpreadsheet,
  CalendarOff,
  UserCog,
} from "lucide-react";
import { useApp } from "@/store/AppContext";
import { SALONS, getStylistsBySalon, salonById } from "@/lib/mockData";
import { guaranteeRateFor } from "@/lib/payEngine";
import { servicePricesFor } from "@/lib/privacy";
import { WEEKS, CURRENT_WEEK, addDays } from "@/lib/time";
import { DAILY_TEMPLATE, WEEKLY_TEMPLATE } from "@/lib/importTemplates";
import {
  dailyRowsToWeeks,
  looksLikeDailyImport,
  parseDailyBulk,
  parseWeeklyBulk,
  weeklyRowToDays,
} from "@/lib/demoImport";
import { importFileToCsv } from "@/lib/xlsx";
import { Card, CardBody, Button, Select, NumberField, SectionTitle, Badge, Avatar } from "@/components/ui/primitives";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Column order for the downloadable import templates (matches the live backend). */
const TEMPLATE_COLUMNS = [
  "employee_id",
  "salon_name",
  "week_start",
  "scheduled_hrs",
  "actual_hrs",
  "actual_haircuts",
  "actual_colors",
  "actual_other_value",
  "notes",
];

/** The client's daily export layout (one row per employee per work day). */
const DAILY_TEMPLATE_COLUMNS = [
  "employee_id",
  "salon_name",
  "sale_date",
  "scheduled_hrs",
  "actual_hrs",
  "actual_haircuts",
  "actual_colors",
  "service_revenue",
  "Employee Name",
  "pay_period",
  "Include/Exclude",
];

/**
 * Admin "Data Management" (spec §2): filter by salon → stylist, then fully edit
 * that stylist's profile and any week's data (manual CRUD that works even when
 * Zenoti/PayCor are down). Plus a bulk CSV import that upserts by user_id +
 * week_start. Saves are idempotent upserts into the app store.
 */
export function DataManagementPanel() {
  const [tab, setTab] = useState<"manual" | "import">("manual");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>
          <span className="inline-flex items-center gap-2 normal-case">
            <UserCog size={16} className="text-[var(--color-brand)]" /> Data Management
          </span>
        </SectionTitle>
        <div className="inline-flex rounded-full bg-[var(--color-surface-2)] p-1">
          {(["manual", "import"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium capitalize transition",
                tab === t ? "bg-[var(--color-surface)] shadow-sm" : "text-[var(--color-ink-soft)]",
              )}
            >
              {t === "manual" ? "Manual entry" : "Bulk import"}
            </button>
          ))}
        </div>
      </div>
      {tab === "manual" ? <ManualCrud /> : <BulkImport />}
    </div>
  );
}

/* ─────────────────────────── Manual CRUD ─────────────────────────── */

function ManualCrud() {
  const { config, resolveUser, upsertUserProfile, getWeeklyData, upsertWeeklyData } = useApp();

  const [salonId, setSalonId] = useState(SALONS[0].id);
  const [search, setSearch] = useState("");
  const [stylistId, setStylistId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(CURRENT_WEEK.start);
  const [savedFlash, setSavedFlash] = useState(false);

  const stylists = useMemo(() => {
    const list = getStylistsBySalon(salonId);
    const q = search.trim().toLowerCase();
    return q ? list.filter((s) => s.name.toLowerCase().includes(q) || s.id.includes(q)) : list;
  }, [salonId, search]);

  // Reset the selection when the salon changes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setStylistId(null);
  }, [salonId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const stylist = stylistId ? resolveUser(stylistId) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      {/* Filters + list */}
      <Card>
        <CardBody className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Salon</span>
            <Select className="h-9 w-full text-sm" value={salonId} onChange={(e) => setSalonId(e.target.value)}>
              {SALONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.city}
                </option>
              ))}
            </Select>
          </label>

          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stylist…"
              aria-label="Search stylists"
              className="h-9 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] pl-8 pr-3 text-sm outline-none focus:border-[var(--color-brand)]"
            />
          </div>

          <div className="max-h-[360px] space-y-1 overflow-y-auto">
            {stylists.length === 0 && (
              <p className="px-1 py-3 text-sm text-[var(--color-ink-faint)]">No stylists match.</p>
            )}
            {stylists.map((s) => (
              <button
                key={s.id}
                onClick={() => setStylistId(s.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl border p-2 text-left transition",
                  s.id === stylistId
                    ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]"
                    : "border-transparent hover:bg-[var(--color-surface-2)]",
                )}
              >
                <Avatar initials={s.initials} hue={s.hue} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.name}</span>
                  <span className="block text-[11px] text-[var(--color-ink-faint)]">#{s.id}</span>
                </span>
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Editor */}
      {!stylist ? (
        <Card>
          <CardBody className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Users size={28} className="text-[var(--color-ink-faint)]" />
            <p className="text-sm text-[var(--color-ink-faint)]">Select a stylist to edit their profile &amp; weekly data.</p>
          </CardBody>
        </Card>
      ) : (
        <StylistEditor
          key={`${stylist.id}:${weekStart}`}
          stylistId={stylist.id}
          weekStart={weekStart}
          onWeekChange={setWeekStart}
          onSaved={() => {
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 2500);
          }}
          savedFlash={savedFlash}
          salonId={salonId}
          config={config}
          resolveUser={resolveUser}
          upsertUserProfile={upsertUserProfile}
          getWeeklyData={getWeeklyData}
          upsertWeeklyData={upsertWeeklyData}
        />
      )}
    </div>
  );
}

interface EditorProps {
  stylistId: string;
  weekStart: string;
  onWeekChange: (w: string) => void;
  onSaved: () => void;
  savedFlash: boolean;
  salonId: string;
  config: ReturnType<typeof useApp>["config"];
  resolveUser: ReturnType<typeof useApp>["resolveUser"];
  upsertUserProfile: ReturnType<typeof useApp>["upsertUserProfile"];
  getWeeklyData: ReturnType<typeof useApp>["getWeeklyData"];
  upsertWeeklyData: ReturnType<typeof useApp>["upsertWeeklyData"];
}

function StylistEditor({
  stylistId,
  weekStart,
  onWeekChange,
  onSaved,
  savedFlash,
  salonId,
  config,
  resolveUser,
  upsertUserProfile,
  getWeeklyData,
  upsertWeeklyData,
}: EditorProps) {
  const user = resolveUser(stylistId)!;
  const salon = salonById(salonId);
  const prices = servicePricesFor();
  const fallbackGuarantee = guaranteeRateFor(salonId, config);

  // Profile form.
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [guaranteeRate, setGuaranteeRate] = useState(user.guaranteeRate ?? fallbackGuarantee);

  // Weekly data form — synced when the picked week changes.
  const existing = getWeeklyData(stylistId, weekStart);
  const [wd, setWd] = useState({
    scheduledHrs: existing?.scheduledHrs ?? 0,
    actualHrs: existing?.actualHrs ?? 0,
    actualHaircuts: existing?.actualHaircuts ?? 0,
    actualColors: existing?.actualColors ?? 0,
    actualOtherValue: existing?.actualOtherValue ?? 0,
    notes: existing?.notes ?? "",
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const e = getWeeklyData(stylistId, weekStart);
    setWd({
      scheduledHrs: e?.scheduledHrs ?? 0,
      actualHrs: e?.actualHrs ?? 0,
      actualHaircuts: e?.actualHaircuts ?? 0,
      actualColors: e?.actualColors ?? 0,
      actualOtherValue: e?.actualOtherValue ?? 0,
      notes: e?.notes ?? "",
    });
  }, [stylistId, weekStart, getWeeklyData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const production = wd.actualHaircuts * prices.haircut + wd.actualColors * prices.color + wd.actualOtherValue;
  const isCallOff = wd.scheduledHrs === 0 && wd.actualHrs === 0;

  const save = () => {
    upsertUserProfile(stylistId, { name, email, phone, guaranteeRate });
    upsertWeeklyData(stylistId, weekStart, {
      weekEnd: addDays(weekStart, 6),
      scheduledHrs: wd.scheduledHrs,
      actualHrs: wd.actualHrs,
      actualHaircuts: wd.actualHaircuts,
      actualColors: wd.actualColors,
      actualOtherValue: wd.actualOtherValue,
      notes: wd.notes,
    });
    onSaved();
  };

  return (
    <Card>
      <CardBody className="space-y-5">
        {/* Profile */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Avatar initials={user.initials} hue={user.hue} size={38} />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{user.name}</h3>
                <Badge tone="neutral">#{user.id}</Badge>
                <Badge tone="brand">{user.role}</Badge>
              </div>
              <div className="text-xs text-[var(--color-ink-faint)]">{salon.name} · {salon.city}</div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TextField label="Name" value={name} onChange={setName} />
            <TextField label="Email" value={email} onChange={setEmail} type="email" />
            <TextField label="Phone" value={phone} onChange={setPhone} />
            <NumberField label="Guarantee rate" value={guaranteeRate} prefix="$" suffix="/hr" step={0.5} onChange={setGuaranteeRate} />
          </div>
        </div>

        {/* Week picker + weekly data */}
        <div className="border-t border-[var(--color-border)] pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Weekly data</h4>
            <label className="inline-flex items-center gap-2">
              <span className="text-xs text-[var(--color-ink-soft)]">Week</span>
              <Select className="h-9 text-sm" value={weekStart} onChange={(e) => onWeekChange(e.target.value)}>
                {[...WEEKS].reverse().map((w) => (
                  <option key={w.id} value={w.start}>
                    {w.label}
                    {w.id === CURRENT_WEEK.id ? " · This week" : ""}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField label="Scheduled hrs" value={wd.scheduledHrs} step={0.25} min={0} onChange={(v) => setWd((f) => ({ ...f, scheduledHrs: Math.max(0, v) }))} />
            <NumberField label="Actual hrs" value={wd.actualHrs} step={0.25} min={0} onChange={(v) => setWd((f) => ({ ...f, actualHrs: Math.max(0, v) }))} />
            <NumberField label="Actual haircuts" value={wd.actualHaircuts} min={0} onChange={(v) => setWd((f) => ({ ...f, actualHaircuts: Math.max(0, Math.round(v)) }))} />
            <NumberField label="Actual colors" value={wd.actualColors} min={0} onChange={(v) => setWd((f) => ({ ...f, actualColors: Math.max(0, Math.round(v)) }))} />
            <NumberField label="Other value" value={wd.actualOtherValue} prefix="$" min={0} onChange={(v) => setWd((f) => ({ ...f, actualOtherValue: Math.max(0, v) }))} />
            <TextField label="Notes" value={wd.notes} onChange={(v) => setWd((f) => ({ ...f, notes: v }))} />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--color-surface-2)] p-3 text-sm">
            {isCallOff ? (
              <span className="inline-flex items-center gap-1.5 text-[var(--color-warning)]">
                <CalendarOff size={15} /> Full-week call-off / sick time (0 hours)
              </span>
            ) : (
              <span className="text-[var(--color-ink-soft)]">
                Derived production (haircuts × {money(prices.haircut)} + colors × {money(prices.color)} + other):{" "}
                <b className="tabular-nums">{money(production)}</b>
              </span>
            )}
            <div className="flex items-center gap-2">
              {savedFlash && (
                <span className="animate-pop inline-flex items-center gap-1 text-sm font-medium text-[var(--color-success)]">
                  <Check size={15} /> Saved
                </span>
              )}
              <Button onClick={save}>
                <Save size={16} /> Save (upsert)
              </Button>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/* ─────────────────────────── Bulk import ─────────────────────────── */

interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

function BulkImport() {
  const { getWeeklyData, upsertWeeklyData, addRecords } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setError(null);
    try {
      setResult(runImport(await importFileToCsv(file)));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Could not read that file.");
    }
  };

  const runImport = (text: string): ImportResult => {
    // The client's daily export: each row is one work day, and service_revenue
    // is that day's production (never re-derived from the counts).
    if (looksLikeDailyImport(text)) {
      const parsed = parseDailyBulk(text);
      for (const w of dailyRowsToWeeks(parsed.rows)) addRecords(w.userId, w.days);
      // Day rows are upserted by (employee, date), so every parsed row lands.
      return { inserted: parsed.rows.length, updated: 0, skipped: parsed.skipped, errors: parsed.errors };
    }

    const parsed = parseWeeklyBulk(text);
    const res: ImportResult = { inserted: 0, updated: 0, skipped: parsed.skipped, errors: parsed.errors };
    for (const r of parsed.rows) {
      const existed = getWeeklyData(r.userId, r.weekStart) !== undefined;
      // Weekly store (for the editor/team views) + day records (for dashboards).
      upsertWeeklyData(r.userId, r.weekStart, {
        weekEnd: addDays(r.weekStart, 6),
        scheduledHrs: r.scheduledHrs,
        actualHrs: r.actualHrs,
        actualHaircuts: r.actualHaircuts,
        actualColors: r.actualColors,
        actualOtherValue: r.actualOtherValue,
        notes: r.notes,
      });
      addRecords(r.userId, weeklyRowToDays(r));
      if (existed) res.updated += 1;
      else res.inserted += 1;
    }
    return res;
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardBody className="space-y-3">
          <h4 className="text-sm font-semibold">1. Download the template</h4>
          <p className="text-sm text-[var(--color-ink-faint)]">
            <b>Daily</b> ({DAILY_TEMPLATE_COLUMNS.join(", ")}) is the client&apos;s own export — one row per{" "}
            <b>employee per work day</b>, with <b>service_revenue</b> as that day&apos;s production and{" "}
            <b>Include/Exclude</b> setting the pay-plan flag.
          </p>
          <p className="text-sm text-[var(--color-ink-faint)]">
            <b>Weekly</b> ({TEMPLATE_COLUMNS.join(", ")}) is one row per <b>employee per week</b>. Either way, many
            employees and pay periods fit in one file and rows are routed by <b>employee_id</b> (Employee code like{" "}
            <code>VG-1426</code>, or a user id) <b>regardless of salon_name</b>. Set hours to 0 for a call-off.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadText(DAILY_TEMPLATE, "pph-daily-template.csv")}>
              <Download size={15} /> Daily template
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadText(buildTemplate(), "pph-payperiod-template.csv")}>
              <Download size={15} /> Weekly template
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <h4 className="text-sm font-semibold">2. Upload &amp; import</h4>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 text-center transition hover:border-[var(--color-brand)]"
          >
            <Upload size={24} className="text-[var(--color-brand)]" />
            <span className="text-sm font-medium">Click to upload a CSV or XLSX</span>
            <span className="text-xs text-[var(--color-ink-faint)]">
              Bulk: many employees × pay periods. Daily or weekly — the layout is detected from the headers.
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.xlsx,.xlsm"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {error && (
            <p className="rounded-2xl bg-[var(--color-surface-2)] p-3 text-xs text-[var(--color-warning)]">{error}</p>
          )}
          {result && (
            <div className="animate-pop space-y-2 rounded-2xl bg-[var(--color-surface-2)] p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <FileSpreadsheet size={15} className="text-[var(--color-brand)]" /> {fileName}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="success">{result.inserted} inserted</Badge>
                <Badge tone="brand">{result.updated} updated</Badge>
                {result.skipped > 0 && <Badge tone="warning">{result.skipped} skipped</Badge>}
              </div>
              {result.errors.length > 0 && (
                <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-[var(--color-warning)]">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* ─────────────────────────── Helpers ─────────────────────────── */

function buildTemplate(): string {
  // Shared, corrected bulk template (employee_id + salon_name, many employees
  // across many pay periods). Kept in sync with the live backend template.
  return WEEKLY_TEMPLATE;
}

function downloadText(text: string, name: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[var(--color-ink-soft)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-brand)]"
      />
    </label>
  );
}
