"use client";

import React, { useRef, useState } from "react";
import { Upload, FileSpreadsheet, Download, PlusCircle, ClipboardList, AlertTriangle } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { ALL_STYLISTS as STYLISTS_FOR_ADMIN, salonById } from "@/lib/mockData";
import { WEEKS, daysOfWeek, weekById, fmtShort, WEEKDAY_LABELS, weekdayIndex, addDays } from "@/lib/time";
import { DAILY_TEMPLATE, WEEKLY_TEMPLATE } from "@/lib/importTemplates";
import {
  dailyRowsToWeeks,
  looksLikeDailyImport,
  parseDailyBulk,
  parseWeeklyBulk,
  weeklyRowToDays,
} from "@/lib/demoImport";
import { importFileToCsv } from "@/lib/xlsx";
import { Card, CardBody, Button, Select, Segmented, SectionTitle, Badge, NumberField } from "@/components/ui/primitives";

export function DataInputPanel() {
  const [tab, setTab] = useState<"upload" | "manual">("upload");
  return (
    <Card>
      <CardBody>
        <div className="mb-4 flex items-center justify-between">
          <SectionTitle>
            <span className="inline-flex items-center gap-2 normal-case">
              <ClipboardList size={16} className="text-[var(--color-brand)]" /> Data input
            </span>
          </SectionTitle>
          <Segmented
            options={[
              { value: "upload", label: "Bulk import" },
              { value: "manual", label: "Manual entry" },
            ]}
            value={tab}
            onChange={(v) => setTab(v as "upload" | "manual")}
          />
        </div>
        {tab === "upload" ? <UploadTab /> : <ManualTab />}
      </CardBody>
    </Card>
  );
}

interface BulkResult {
  kind: "daily" | "weekly";
  imported: number;
  employees: number;
  weeks: string[];
  skipped: number;
  errors: string[];
}

/**
 * Bulk pay-period import for the WHOLE organization: one file, many employees,
 * many weeks / pay periods. Accepts the client's daily export (one row per
 * employee per work day) and our weekly template, in CSV or XLSX. Each row is
 * routed to a stylist by `employee_id` (Employee code like VG1426, or user id)
 * — the `salon_name` column is just a label and does not affect routing.
 * Mirrors the live /admin/import-daily and /admin/import-weekly.
 */
function UploadTab() {
  const { addRecords, upsertWeeklyData } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const runText = (text: string, name: string) => {
    setError(null);
    setFileName(name);
    const employees = new Set<string>();

    // Daily export: the day rows ARE the data (service_revenue is the day's
    // production), so they are written straight to the dashboards.
    if (looksLikeDailyImport(text)) {
      const parsed = parseDailyBulk(text);
      const weeks = dailyRowsToWeeks(parsed.rows);
      for (const w of weeks) {
        employees.add(w.userId);
        addRecords(w.userId, w.days);
      }
      setResult({
        kind: "daily",
        imported: parsed.rows.length,
        employees: employees.size,
        weeks: Array.from(new Set(weeks.map((w) => w.weekStart))).sort(),
        skipped: parsed.skipped,
        errors: parsed.errors,
      });
      return;
    }

    const parsed = parseWeeklyBulk(text);
    for (const r of parsed.rows) {
      employees.add(r.userId);
      addRecords(r.userId, weeklyRowToDays(r));
      upsertWeeklyData(r.userId, r.weekStart, {
        weekEnd: addDays(r.weekStart, 6),
        scheduledHrs: r.scheduledHrs,
        actualHrs: r.actualHrs,
        actualHaircuts: r.actualHaircuts,
        actualColors: r.actualColors,
        actualOtherValue: r.actualOtherValue,
        notes: r.notes,
      });
    }
    setResult({
      kind: "weekly",
      imported: parsed.rows.length,
      employees: employees.size,
      weeks: Array.from(new Set(parsed.rows.map((r) => r.weekStart))).sort(),
      skipped: parsed.skipped,
      errors: parsed.errors,
    });
  };

  const onFile = async (file: File) => {
    try {
      runText(await importFileToCsv(file), file.name);
    } catch (err) {
      setResult(null);
      setFileName(file.name);
      setError(err instanceof Error ? err.message : "Could not read that file.");
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={() => fileRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] p-8 text-center transition hover:border-[var(--color-brand)]"
      >
        <Upload size={28} className="text-[var(--color-brand)]" />
        <span className="font-medium">Upload the whole org&apos;s pay-period data (CSV or XLSX)</span>
        <span className="text-xs text-[var(--color-ink-faint)]">
          <b>Daily</b> (the client export): employee_id, salon_name, sale_date, scheduled_hrs, actual_hrs, actual_haircuts, actual_colors, service_revenue, Employee Name, pay_period, Include/Exclude
        </span>
        <span className="text-xs text-[var(--color-ink-faint)]">
          <b>Weekly</b>: employee_id, salon_name, week_start, scheduled_hrs, actual_hrs, actual_haircuts, actual_colors, actual_other_value, notes
        </span>
        <span className="text-xs text-[var(--color-ink-faint)]">
          The layout is detected from the headers — drop the client&apos;s workbook in as-is. Routed by employee_id (salon is just a label).
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,.xlsx,.xlsm"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => downloadCsv(DAILY_TEMPLATE, "pph-daily-template.csv")}>
          <Download size={14} /> Daily template
        </Button>
        <Button variant="ghost" size="sm" onClick={() => downloadCsv(WEEKLY_TEMPLATE, "pph-payperiod-template.csv")}>
          <Download size={14} /> Weekly template
        </Button>
        <Button variant="outline" size="sm" onClick={() => runText(DAILY_TEMPLATE, "sample-daily.csv")}>
          <FileSpreadsheet size={14} /> Load sample data
        </Button>
      </div>
      <p className="text-xs text-[var(--color-ink-faint)]">
        <b>employee_id</b> is the routing key (client Employee code like <code>VG-1426</code>, or a user id). Data goes to
        the right person regardless of the <b>salon_name</b> value. On daily rows <b>service_revenue</b> is the day&apos;s
        production as reported — it is never recalculated from the haircut/color counts.
      </p>

      {error && (
        <p className="flex items-center gap-1.5 rounded-2xl bg-[var(--color-surface-2)] p-3 text-xs text-[var(--color-warning)]">
          <AlertTriangle size={13} /> {error}
        </p>
      )}

      {result && (
        <div className="animate-pop space-y-2 rounded-2xl bg-[var(--color-surface-2)] p-3 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <FileSpreadsheet size={15} className="text-[var(--color-brand)]" /> {fileName}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">
              {result.imported} {result.kind === "daily" ? "day rows" : "weekly rows"} imported
            </Badge>
            <Badge tone="brand">{result.employees} employees</Badge>
            {result.weeks.length > 0 && <Badge tone="neutral">weeks {result.weeks.join(", ")}</Badge>}
            {result.skipped > 0 && <Badge tone="warning">{result.skipped} skipped</Badge>}
          </div>
          {result.errors.length > 0 && (
            <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-[var(--color-warning)]">
              {result.errors.slice(0, 20).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          {result.imported > 0 && (
            <p className="text-xs text-[var(--color-ink-faint)]">Open the dashboard and pick the pay period/week to see it reflected.</p>
          )}
          {result.imported === 0 && result.skipped > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-[var(--color-warning)]">
              <AlertTriangle size={13} /> No rows imported — check the employee_id and date columns.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ManualTab() {
  const { addRecords } = useApp();
  const [stylistId, setStylistId] = useState(STYLISTS_FOR_ADMIN[0].id);
  const [weekId, setWeekId] = useState(WEEKS[WEEKS.length - 1].id);
  const [dayIdx, setDayIdx] = useState(0);
  const [form, setForm] = useState({ scheduledHours: 8, workedHours: 8, haircuts: 6, colors: 3, production: 560 });
  const [saved, setSaved] = useState(false);

  const week = weekById(weekId);
  const days = daysOfWeek(week);
  const date = days[dayIdx];

  const save = () => {
    addRecords(stylistId, [{ date, ...form }]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Stylist</span>
          <Select className="h-9 w-full text-sm" value={stylistId} onChange={(e) => setStylistId(e.target.value)}>
            {STYLISTS_FOR_ADMIN.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · {salonById(s.salonId).name}</option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Week</span>
          <Select className="h-9 w-full text-sm" value={weekId} onChange={(e) => setWeekId(e.target.value)}>
            {[...WEEKS].reverse().map((w) => (
              <option key={w.id} value={w.id}>{w.label}</option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Day</span>
          <Select className="h-9 w-full text-sm" value={dayIdx} onChange={(e) => setDayIdx(Number(e.target.value))}>
            {days.map((d, i) => (
              <option key={d} value={i}>{WEEKDAY_LABELS[weekdayIndex(d)]} · {fmtShort(d)}</option>
            ))}
          </Select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <NumberField label="Scheduled h" value={form.scheduledHours} step={0.5} onChange={(v) => setForm((f) => ({ ...f, scheduledHours: v }))} />
        <NumberField label="Worked h" value={form.workedHours} step={0.5} onChange={(v) => setForm((f) => ({ ...f, workedHours: v }))} />
        <NumberField label="Haircuts" value={form.haircuts} onChange={(v) => setForm((f) => ({ ...f, haircuts: v }))} />
        <NumberField label="Colors" value={form.colors} onChange={(v) => setForm((f) => ({ ...f, colors: v }))} />
        <NumberField label="Production" value={form.production} prefix="$" onChange={(v) => setForm((f) => ({ ...f, production: v }))} />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save}>
          <PlusCircle size={16} /> Save day record
        </Button>
        {saved && <span className="animate-pop text-sm font-medium text-[var(--color-success)]">✓ Saved to {fmtShort(date)}</span>}
      </div>
    </div>
  );
}

function downloadCsv(text: string, name: string) {
  const blob = new Blob([text], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
