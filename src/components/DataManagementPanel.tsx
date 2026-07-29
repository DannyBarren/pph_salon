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
import { SALONS, getStylistsBySalon, salonById, userById } from "@/lib/mockData";
import { guaranteeRateFor } from "@/lib/payEngine";
import { servicePricesFor } from "@/lib/privacy";
import { WEEKS, CURRENT_WEEK, weekById, addDays } from "@/lib/time";
import { parseCsv } from "@/lib/csv";
import { Card, CardBody, Button, Select, NumberField, SectionTitle, Badge, Avatar } from "@/components/ui/primitives";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Column order for the downloadable import template (matches the backend). */
const TEMPLATE_COLUMNS = [
  "user_id",
  "salon_name",
  "week_start",
  "guarantee_rate",
  "scheduled_hrs",
  "actual_hrs",
  "actual_haircuts",
  "actual_colors",
  "actual_other_value",
  "notes",
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
  const { getWeeklyData, upsertWeeklyData, upsertUserProfile } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");

  const handleFile = async (file: File) => {
    const text = await file.text();
    setFileName(file.name);
    setResult(runImport(text));
  };

  const runImport = (text: string): ImportResult => {
    const parsed = parseCsv(text);
    const idx = (name: string) => parsed.headers.findIndex((h) => h.toLowerCase().replace(/[^a-z]/g, "") === name.replace(/_/g, ""));
    const col = {
      user_id: idx("userid"),
      week_start: idx("weekstart"),
      guarantee_rate: idx("guaranteerate"),
      scheduled_hrs: idx("scheduledhrs"),
      actual_hrs: idx("actualhrs"),
      actual_haircuts: idx("actualhaircuts"),
      actual_colors: idx("actualcolors"),
      actual_other_value: idx("actualothervalue"),
      notes: idx("notes"),
    };
    const res: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
    const numOf = (v: string) => {
      const n = parseFloat((v ?? "").replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(n) ? n : 0;
    };

    parsed.rows.forEach((row, i) => {
      const line = i + 2; // header is line 1
      const userId = (row[col.user_id] ?? "").trim();
      const weekStart = (row[col.week_start] ?? "").trim().slice(0, 10);
      if (!userId) return;
      if (!userById(userId)) {
        res.skipped += 1;
        res.errors.push(`Row ${line}: unknown user_id "${userId}"`);
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        res.skipped += 1;
        res.errors.push(`Row ${line}: invalid week_start "${weekStart}" (use YYYY-MM-DD)`);
        return;
      }
      const existed = getWeeklyData(userId, weekStart) !== undefined;
      if (col.guarantee_rate >= 0 && (row[col.guarantee_rate] ?? "").trim() !== "") {
        upsertUserProfile(userId, { guaranteeRate: numOf(row[col.guarantee_rate]) });
      }
      upsertWeeklyData(userId, weekStart, {
        weekEnd: addDays(weekStart, 6),
        scheduledHrs: numOf(row[col.scheduled_hrs]),
        actualHrs: numOf(row[col.actual_hrs]),
        actualHaircuts: Math.round(numOf(row[col.actual_haircuts])),
        actualColors: Math.round(numOf(row[col.actual_colors])),
        actualOtherValue: numOf(row[col.actual_other_value]),
        notes: col.notes >= 0 ? (row[col.notes] ?? "").trim() : undefined,
      });
      if (existed) res.updated += 1;
      else res.inserted += 1;
    });
    return res;
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardBody className="space-y-3">
          <h4 className="text-sm font-semibold">1. Download the template</h4>
          <p className="text-sm text-[var(--color-ink-faint)]">
            Columns: {TEMPLATE_COLUMNS.join(", ")}. One row per stylist-week; the key is{" "}
            <b>user_id + week_start</b>. Set hours to 0 for a full-week call-off.
          </p>
          <Button variant="outline" size="sm" onClick={() => downloadText(buildTemplate(), "pph-weekly-template.csv")}>
            <Download size={15} /> Download CSV template
          </Button>
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
            <span className="text-sm font-medium">Click to upload a CSV</span>
            <span className="text-xs text-[var(--color-ink-faint)]">Idempotent upsert by user_id + week_start</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
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
  const rows: string[][] = [TEMPLATE_COLUMNS];
  // Two example rows using real seed stylists + the current week.
  const samples = getStylistsBySalon("s1").slice(0, 2);
  const wk = weekById(CURRENT_WEEK.id);
  samples.forEach((s, i) => {
    rows.push([
      s.id,
      salonById(s.salonId).name,
      wk.start,
      "16",
      "40",
      i === 1 ? "0" : "38",
      i === 1 ? "0" : "22",
      i === 1 ? "0" : "9",
      i === 1 ? "0" : "40",
      i === 1 ? "Full-week call-off (sick)" : "Great color week",
    ]);
  });
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
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
