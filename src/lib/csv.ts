export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** Minimal RFC-4180-ish CSV parser supporting quoted fields. */
export function parseCsv(text: string): ParsedCsv {
  const lines: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    lines.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else if (c === "\r") {
      // ignore
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  const all = lines.filter((r) => r.some((c) => c.trim() !== ""));
  if (all.length === 0) return { headers: [], rows: [] };
  return { headers: all[0].map((h) => h.trim()), rows: all.slice(1) };
}

export const SAMPLE_CSV = `date,scheduledHours,workedHours,haircuts,colors,production
2026-06-23,8,8,6,3,612
2026-06-24,8,7.5,5,4,705
2026-06-25,8,8,7,2,560
2026-06-26,8,8,4,5,820
2026-06-27,6,6,8,1,498`;
