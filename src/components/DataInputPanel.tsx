"use client";

import React, { useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, Download, Check, PlusCircle, ClipboardList } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { ALL_STYLISTS as STYLISTS_FOR_ADMIN, salonById } from "@/lib/mockData";
import { parseCsv, SAMPLE_CSV, type ParsedCsv } from "@/lib/csv";
import { WEEKS, daysOfWeek, weekById, fmtShort, WEEKDAY_LABELS, weekdayIndex } from "@/lib/time";
import type { DayRecord } from "@/lib/types";
import { Card, CardBody, Button, Select, Segmented, SectionTitle, Badge, NumberField } from "@/components/ui/primitives";

const FIELDS = ["date", "scheduledHours", "workedHours", "haircuts", "colors", "production"] as const;
type Field = (typeof FIELDS)[number];

function autoMap(headers: string[]): Record<Field, number> {
  const map = {} as Record<Field, number>;
  for (const f of FIELDS) {
    const idx = headers.findIndex((h) => h.toLowerCase().replace(/[^a-z]/g, "").includes(f.toLowerCase().replace(/[^a-z]/g, "")));
    map[f] = idx;
  }
  if (map.date < 0) map.date = headers.findIndex((h) => /date|day/i.test(h));
  return map;
}

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
              { value: "upload", label: "File upload" },
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

function UploadTab() {
  const { addRecords } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<Field, number>>({} as Record<Field, number>);
  const [stylistId, setStylistId] = useState(STYLISTS_FOR_ADMIN[0].id);
  const [remapWeek, setRemapWeek] = useState<string>("none");
  const [applied, setApplied] = useState(0);

  const ingest = (text: string, name: string) => {
    const p = parseCsv(text);
    setParsed(p);
    setFileName(name);
    setMapping(autoMap(p.headers));
    setApplied(0);
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    ingest(text, file.name);
  };

  const records: DayRecord[] = useMemo(() => {
    if (!parsed) return [];
    const week = remapWeek !== "none" ? weekById(remapWeek) : null;
    const weekDays = week ? daysOfWeek(week) : null;
    const num = (v: string) => {
      const n = parseFloat((v ?? "").replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(n) ? n : 0;
    };
    return parsed.rows
      .map((r, i) => {
        let date = mapping.date >= 0 ? (r[mapping.date] ?? "").trim() : "";
        if (weekDays) date = weekDays[i % 7];
        if (!date) return null;
        return {
          date,
          scheduledHours: num(r[mapping.scheduledHours]),
          workedHours: num(r[mapping.workedHours]),
          haircuts: Math.round(num(r[mapping.haircuts])),
          colors: Math.round(num(r[mapping.colors])),
          production: Math.round(num(r[mapping.production])),
        } as DayRecord;
      })
      .filter((d): d is DayRecord => d !== null);
  }, [parsed, mapping, remapWeek]);

  const apply = () => {
    if (records.length === 0) return;
    addRecords(stylistId, records);
    setApplied(records.length);
  };

  return (
    <div className="space-y-4">
      {!parsed ? (
        <div>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] p-8 text-center transition hover:border-[var(--color-brand)]"
          >
            <Upload size={28} className="text-[var(--color-brand)]" />
            <span className="font-medium">Click to upload a CSV or XLSX</span>
            <span className="text-xs text-[var(--color-ink-faint)]">Columns: date, scheduledHours, workedHours, haircuts, colors, production</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.xlsx"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => ingest(SAMPLE_CSV, "sample-week.csv")}>
              <FileSpreadsheet size={14} /> Load sample data
            </Button>
            <Button variant="ghost" size="sm" onClick={() => downloadCsv(SAMPLE_CSV, "pph-template.csv")}>
              <Download size={14} /> Download template
            </Button>
          </div>
          <p className="mt-3 text-xs text-[var(--color-ink-faint)]">
            XLSX files should be exported to CSV first for this prototype&apos;s parser.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <Badge tone="brand">
              <FileSpreadsheet size={13} /> {fileName} · {parsed.rows.length} rows
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => setParsed(null)}>
              Choose another
            </Button>
          </div>

          {/* Preview */}
          <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-2)] text-left">
                <tr>
                  {parsed.headers.map((h, i) => (
                    <th key={i} className="px-3 py-2 font-semibold text-[var(--color-ink-soft)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 6).map((r, i) => (
                  <tr key={i} className="border-t border-[var(--color-border)]">
                    {parsed.headers.map((_, j) => (
                      <td key={j} className="px-3 py-1.5 tabular-nums text-[var(--color-ink-soft)]">{r[j]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mapping + assignment */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map((f) => (
              <label key={f} className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">{f}</span>
                <Select
                  className="h-9 w-full text-sm"
                  value={mapping[f] ?? -1}
                  onChange={(e) => setMapping((m) => ({ ...m, [f]: Number(e.target.value) }))}
                >
                  <option value={-1}>—</option>
                  {parsed.headers.map((h, i) => (
                    <option key={i} value={i}>{h}</option>
                  ))}
                </Select>
              </label>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Assign to stylist</span>
              <Select className="h-9 w-full text-sm" value={stylistId} onChange={(e) => setStylistId(e.target.value)}>
                {STYLISTS_FOR_ADMIN.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {salonById(s.salonId).name}</option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Assign to week (optional remap)</span>
              <Select className="h-9 w-full text-sm" value={remapWeek} onChange={(e) => setRemapWeek(e.target.value)}>
                <option value="none">Use dates from file</option>
                {[...WEEKS].reverse().map((w) => (
                  <option key={w.id} value={w.id}>{w.label}</option>
                ))}
              </Select>
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-surface-2)] p-3">
            <span className="text-sm text-[var(--color-ink-soft)]">
              {records.length} valid records → <b>{STYLISTS_FOR_ADMIN.find((s) => s.id === stylistId)?.name}</b>
              {remapWeek !== "none" && <> · remapped to {fmtShort(weekById(remapWeek).start)}</>}
            </span>
            <Button onClick={apply} disabled={records.length === 0}>
              <Check size={16} /> Apply data
            </Button>
          </div>

          {applied > 0 && (
            <div className="animate-pop rounded-2xl bg-[var(--color-success-soft)] p-3 text-sm font-medium text-[var(--color-success)]">
              ✓ Imported {applied} day records. Open the dashboard to see them reflected.
            </div>
          )}
        </>
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
