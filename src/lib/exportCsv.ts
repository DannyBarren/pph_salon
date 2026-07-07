import type { StylistPerformance } from "./teamTypes";

/** Serialize a matrix of rows to an RFC-4180 CSV string. */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (val: string | number) => {
    const s = String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  return lines.join("\n");
}

/** Trigger a client-side download of `content` as `filename`. */
export function downloadFile(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Build a CSV for the current dashboard view. */
export function performancesToCsv(perfs: StylistPerformance[]): string {
  const headers = [
    "Stylist",
    "Stylist ID",
    "Week",
    "Guarantee $/hr",
    "Scheduled Hrs",
    "Actual Hrs",
    "Utilization %",
    "Production $",
    "PPH",
    "Effective $/hr",
    "Target $/hr",
    "Status",
    "Remaining $ to Target",
    "Remaining Hrs",
  ];
  const rows = perfs.map((p) => [
    p.name,
    p.stylistId,
    p.weekLabel,
    p.guaranteeRate,
    round(p.scheduledHours),
    round(p.actualHours),
    Math.round(p.utilization * 100),
    Math.round(p.production),
    round(p.pph),
    round(p.effectiveRate),
    p.targetPayRate,
    p.status,
    Math.round(p.remainingToTarget.remainingProduction),
    round(p.remainingScheduledHours),
  ]);
  return toCsv(headers, rows);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
