/**
 * Minimal, dependency-free reader for the client's .xlsx exports.
 *
 * The client sends their pay-period data as a workbook, and the credential-free
 * demo has no backend to parse it — so we unzip and read the first worksheet in
 * the browser. Only what a flat data export needs is supported: one sheet,
 * shared/inline strings, numbers, booleans and date-formatted cells. Everything
 * is returned as text and handed to the existing CSV-based importers.
 *
 * Uses `DecompressionStream("deflate-raw")` (browsers + Node 18+); callers get a
 * clear error when it is unavailable rather than a corrupt parse.
 */

export interface SheetTable {
  /** First row of the sheet — header cells keep any embedded newline. */
  headers: string[];
  rows: string[][];
}

const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;

export function isXlsxName(name: string): boolean {
  return /\.(xlsx|xlsm)$/i.test((name ?? "").trim());
}

/* ─────────────────────────── ZIP ─────────────────────────── */

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot unzip .xlsx files — export the sheet to CSV and upload that.");
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Read every file in a ZIP archive into a name → bytes map. */
async function unzip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // The end-of-central-directory record sits in the last 64KB (+ comment).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === ZIP_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a readable .xlsx file (no ZIP directory found).");

  const entries = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();

  for (let i = 0; i < entries; i++) {
    if (view.getUint32(p, true) !== ZIP_CENTRAL) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error("This .xlsx uses ZIP64 — export the sheet to CSV and upload that.");
    }
    // The local header repeats the name and may carry a different extra field.
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const raw = bytes.subarray(start, start + compressedSize);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflateRaw(raw));
    // Any other compression method is skipped — Excel only ever emits 0 or 8.
  }
  return out;
}

/* ─────────────────────────── XML ─────────────────────────── */

function unescapeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (m, code: string) => {
    if (code === "amp") return "&";
    if (code === "lt") return "<";
    if (code === "gt") return ">";
    if (code === "quot") return '"';
    if (code === "apos") return "'";
    const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  });
}

/** Concatenate the text of every `<t>` in a fragment (rich-text runs included). */
function textOf(fragment: string): string {
  let out = "";
  for (const m of fragment.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += unescapeXml(m[1]);
  return out;
}

function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return Array.from(xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g), (m) => textOf(m[1]));
}

/** Column reference ("AB12") → zero-based column index. */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/* ───────────────────────── Dates ───────────────────────── */

// Built-in number formats that mean "date" (ECMA-376 §18.8.30).
const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** Style index → true when that style renders the number as a date/time. */
function dateStyles(stylesXml: string | undefined): Set<number> {
  const out = new Set<number>();
  if (!stylesXml) return out;
  const customDateIds = new Set<number>();
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    const code = unescapeXml(m[2]).replace(/\[[^\]]*\]/g, "").replace(/"[^"]*"/g, "");
    if (/[dmyh]/i.test(code) && /[dy]/i.test(code)) customDateIds.add(Number(m[1]));
  }
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
  if (!cellXfs) return out;
  let i = 0;
  for (const m of cellXfs[1].matchAll(/<xf\b[^>]*>/g)) {
    const id = /numFmtId="(\d+)"/.exec(m[0]);
    const numFmtId = id ? Number(id[1]) : 0;
    if (DATE_FORMAT_IDS.has(numFmtId) || customDateIds.has(numFmtId)) out.add(i);
    i++;
  }
  return out;
}

/** Excel serial day → ISO date (1900 system, including its leap-year quirk). */
function serialToIso(serial: number): string {
  const days = Math.floor(serial);
  const ms = Math.round((days - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

/* ───────────────────────── Sheet ───────────────────────── */

function firstSheetPath(files: Map<string, Uint8Array>, workbookXml: string | undefined,
                        relsXml: string | undefined): string | undefined {
  const firstId = workbookXml && /<sheet\b[^>]*r:id="([^"]+)"/.exec(workbookXml)?.[1];
  if (firstId && relsXml) {
    const rel = new RegExp(`<Relationship\\b[^>]*Id="${firstId}"[^>]*Target="([^"]+)"`).exec(relsXml);
    if (rel) {
      const target = rel[1].replace(/^\/?xl\//, "").replace(/^\//, "");
      if (files.has(`xl/${target}`)) return `xl/${target}`;
    }
  }
  return Array.from(files.keys())
    .filter((n) => /^xl\/worksheets\/sheet\d*\.xml$/.test(n))
    .sort()[0];
}

/** Read the first worksheet of an .xlsx as a table of strings. */
export async function readXlsxSheet(buffer: ArrayBuffer): Promise<SheetTable> {
  const files = await unzip(buffer);
  const decode = (name: string) => {
    const bytes = files.get(name);
    return bytes ? new TextDecoder().decode(bytes) : undefined;
  };

  const strings = sharedStrings(decode("xl/sharedStrings.xml"));
  const styles = dateStyles(decode("xl/styles.xml"));
  const path = firstSheetPath(files, decode("xl/workbook.xml"), decode("xl/_rels/workbook.xml.rels"));
  const sheet = path ? decode(path) : undefined;
  if (!sheet) throw new Error("No worksheet found in the .xlsx file.");

  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: string[] = [];
    for (const cellMatch of (rowMatch[1] ?? "").matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] ?? "";
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      const styleIdx = Number(/s="(\d+)"/.exec(attrs)?.[1] ?? NaN);
      const rawValue = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];

      let value = "";
      if (type === "s") value = strings[Number(rawValue)] ?? "";
      else if (type === "inlineStr") value = textOf(body);
      else if (type === "str" || type === "e") value = unescapeXml(rawValue ?? "");
      else if (type === "b") value = rawValue === "1" ? "TRUE" : "FALSE";
      else if (type === "d") value = (rawValue ?? "").slice(0, 10);
      else if (rawValue != null && rawValue !== "") {
        const n = Number(rawValue);
        value = styles.has(styleIdx) && Number.isFinite(n) && n > 0 ? serialToIso(n) : rawValue;
      }

      const at = ref ? columnIndex(ref) : cells.length;
      while (cells.length < at) cells.push("");
      cells[at] = value;
    }
    rows.push(cells);
  }

  // Drop leading/trailing rows with no content at all.
  const filled = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (filled.length === 0) return { headers: [], rows: [] };
  return { headers: filled[0], rows: filled.slice(1) };
}

/* ─────────────────────── Public helpers ─────────────────────── */

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialise a sheet as CSV text so the CSV importers can consume it unchanged. */
export function sheetToCsv(table: SheetTable): string {
  return [table.headers, ...table.rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/**
 * Read an uploaded import file as CSV text — .xlsx/.xlsm workbooks are unzipped
 * and flattened, anything else is read as plain text.
 */
export async function importFileToCsv(file: File): Promise<string> {
  if (!isXlsxName(file.name)) return file.text();
  return sheetToCsv(await readXlsxSheet(await file.arrayBuffer()));
}
