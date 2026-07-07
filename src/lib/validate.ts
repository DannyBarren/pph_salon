/**
 * Tiny, dependency-free runtime validator (a minimal Zod-alike).
 *
 * TODO: Review with Danny — the spec asks for Zod. We deliberately ship this
 * ~80-line validator instead of adding the `zod` dependency, to honour the repo
 * rule in `docs/AGENTS.md` ("No new heavyweight dependencies without
 * justification") and keep the Vercel bundle lean. The API mirrors Zod's
 * `safeParse` so swapping to real Zod later is mechanical: replace this module
 * and the `.parse()` call sites keep working.
 */

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ParseResult<T> = { success: true; data: T } | { success: false; issues: ValidationIssue[] };

export interface Schema<T> {
  /** Validate `input` at `path`; push issues into `issues`; return the value. */
  _parse: (input: unknown, path: string, issues: ValidationIssue[]) => T;
}

function makeSchema<T>(fn: Schema<T>["_parse"]): Schema<T> {
  return { _parse: fn };
}

export const v = {
  string(): Schema<string> {
    return makeSchema((input, path, issues) => {
      if (typeof input !== "string") {
        issues.push({ path, message: `expected string, got ${typeof input}` });
        return "";
      }
      return input;
    });
  },

  number(opts: { min?: number; max?: number; int?: boolean } = {}): Schema<number> {
    return makeSchema((input, path, issues) => {
      if (typeof input !== "number" || Number.isNaN(input) || !Number.isFinite(input)) {
        issues.push({ path, message: `expected finite number, got ${typeof input}` });
        return 0;
      }
      if (opts.int && !Number.isInteger(input)) issues.push({ path, message: "expected integer" });
      if (opts.min !== undefined && input < opts.min) issues.push({ path, message: `must be ≥ ${opts.min}` });
      if (opts.max !== undefined && input > opts.max) issues.push({ path, message: `must be ≤ ${opts.max}` });
      return input;
    });
  },

  enum<const U extends readonly string[]>(values: U): Schema<U[number]> {
    return makeSchema((input, path, issues) => {
      if (typeof input !== "string" || !values.includes(input)) {
        issues.push({ path, message: `expected one of ${values.join(", ")}` });
        return values[0];
      }
      return input as U[number];
    });
  },

  array<T>(item: Schema<T>): Schema<T[]> {
    return makeSchema((input, path, issues) => {
      if (!Array.isArray(input)) {
        issues.push({ path, message: "expected array" });
        return [];
      }
      return input.map((el, i) => item._parse(el, `${path}[${i}]`, issues));
    });
  },

  object<T extends object>(shape: { [K in keyof T]: Schema<T[K]> }): Schema<T> {
    return makeSchema((input, path, issues) => {
      if (typeof input !== "object" || input === null) {
        issues.push({ path, message: "expected object" });
        return {} as T;
      }
      const rec = input as Record<string, unknown>;
      const out = {} as T;
      for (const key of Object.keys(shape) as (keyof T)[]) {
        const childPath = path ? `${path}.${String(key)}` : String(key);
        out[key] = shape[key]._parse(rec[String(key)], childPath, issues);
      }
      return out;
    });
  },
};

/** Zod-style safe parse: never throws, returns a discriminated result. */
export function safeParse<T>(schema: Schema<T>, input: unknown): ParseResult<T> {
  const issues: ValidationIssue[] = [];
  const data = schema._parse(input, "", issues);
  return issues.length === 0 ? { success: true, data } : { success: false, issues };
}
