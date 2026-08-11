/**
 * Module-resolution hooks so `node --test` can exercise the app's real TypeScript
 * modules instead of a hand-written mirror of them.
 *
 * Node strips the types itself (`--experimental-strip-types`); this only teaches
 * its resolver the two things the app's source relies on — the `@/…` path alias
 * from tsconfig, and extensionless relative imports (`./csv` → `./csv.ts`).
 *
 * Register it from a test before importing any app module:
 *
 *   import { register } from "node:module";
 *   register("./ts-loader.mjs", import.meta.url);
 *   const { parseDailyBulk } = await import("../src/lib/demoImport.ts");
 */

import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const EXTENSIONS = [".ts", ".tsx", "/index.ts"];

export async function resolve(specifier, context, next) {
  const spec = specifier.startsWith("@/") ? pathToFileURL(join(SRC, specifier.slice(2))).href : specifier;
  try {
    return await next(spec, context);
  } catch (err) {
    for (const ext of EXTENSIONS) {
      const candidate = new URL(spec + ext, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
    }
    throw err;
  }
}
