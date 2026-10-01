/** Copies the parts of PGlite the browser needs into <out>/vendor/pglite. */
import { Glob } from "bun";
import { ROOT } from "./compile.ts";

export const PGLITE_DIR = ROOT + "node_modules/@electric-sql/pglite/dist/";
export const PGLITE_FILES = ["index.js", "pglite.wasm", "pglite.data", "initdb.wasm", ...[...new Glob("chunk-*.js").scanSync({ cwd: PGLITE_DIR })], ...[...new Glob("fs/**/*.js").scanSync({ cwd: PGLITE_DIR })]];

export async function copyPglite(outDir: string) {
  for (const f of PGLITE_FILES) await Bun.write(`${outDir}/vendor/pglite/${f}`, Bun.file(PGLITE_DIR + f));
}
