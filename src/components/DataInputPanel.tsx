"use client";

import React, { useRef, useState } from "react";
import { Upload, FileSpreadsheet, Download, PlusCircle, ClipboardList, AlertTriangle } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { ALL_STYLISTS as STYLISTS_FOR_ADMIN, salonById } from "@/lib/mockData";
import { WEEKS, daysOfWeek, weekById, fmtShort, WEEKDAY_LABELS, weekdayIndex, addDays } from "@/lib/time";
import { WEEKLY_TEMPLATE } from "@/lib/importTemplates";
import { parseWeeklyBulk, weeklyRowToDays } from "@/lib/demoImport";
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
  imported: number;
  employees: number;
  skipped: number;
  errors: string[];
}

/**
 * Bulk pay-period import for the WHOLE organization: one file, many employees,
 * many weeks / pay periods. Each row is routed to a stylist by `employee_id`
 * (Employee code like VG1426, or user id) — the `salon_name` column is just a
 * label and does not affect routing. Mirrors the live /admin/import-weekly.
 */
function UploadTab() {
  const { addRecords, upsertWeeklyData } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [fileName, setFileName] = useState("");

  const runText = (text: string, name: string) => {
    const parsed = parseWeeklyBulk(text);
    const employees = new Set<string>();
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
    setFileName(name);
    setResult({ imported: parsed.rows.length, employees: employees.size, skipped: parsed.skipped, errors: parsed.errors });
  };

  const onFile = async (file: File) => {
    runText(await file.text(), file.name);
  };

  return (
    <div className="space-y-4">
      <button
        onClick={() => fileRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] p-8 text-center transition hover:border-[var(--color-brand)]"
      >
        <Upload size={28} className="text-[var(--color-brand)]" />
        <span className="font-medium">Upload the whole org&apos;s pay-period data (CSV)</span>
        <span className="text-xs text-[var(--color-ink-faint)]">
          Columns: employee_id, salon_name, week_start, scheduled_hrs, actual_hrs, actual_haircuts, actual_colors, actual_other_value, notes
        </span>
        <span className="text-xs text-[var(--color-ink-faint)]">
          One row per employee per week — many employees &amp; pay periods per file. Routed by employee_id (salon is just a label).
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => downloadCsv(WEEKLY_TEMPLATE, "pph-payperiod-template.csv")}>
          <Download size={14} /> Download template
        </Button>
        <Button variant="outline" size="sm" onClick={() => runText(WEEKLY_TEMPLATE, "sample-payperiods.csv")}>
          <FileSpreadsheet size={14} /> Load sample data
        </Button>
      </div>
      <p className="text-xs text-[var(--color-ink-faint)]">
        <b>employee_id</b> is the routing key (client Employee code like <code>VG1426</code>, or a user id). Data goes to
        the right person regardless of the <b>salon_name</b> value. XLSX files should be exported to CSV first for this
        prototype&apos;s parser.
      </p>

      {result && (
        <div className="animate-pop space-y-2 rounded-2xl bg-[var(--color-surface-2)] p-3 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <FileSpreadsheet size={15} className="text-[var(--color-brand)]" /> {fileName}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">{result.imported} rows imported</Badge>
            <Badge tone="brand">{result.employees} employees</Badge>
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
              <AlertTriangle size={13} /> No rows imported — check the employee_id and week_start columns.
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
