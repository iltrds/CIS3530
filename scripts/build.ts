/**
 * bun run build: validate content, compile it to JSON, bundle the app and copy
 * PGlite, producing a static site in dist/ that any static host can serve.
 */
import { rm } from "node:fs/promises";
import { compile, printProblems, writeData, ROOT } from "./lib/compile.ts";
import { copyPglite } from "./lib/vendor.ts";

const OUT = ROOT + "dist";
const t = performance.now();

const { out, problems } = await compile();
if (problems.length) {
  printProblems(problems);
  console.error("Build stopped: fix the content problems above.");
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await writeData(out!, OUT);

const result = await Bun.build({
  entrypoints: [ROOT + "src/index.html"],
  outdir: OUT,
  minify: true,
  sourcemap: "linked",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
await copyPglite(OUT);

const s = out!.stats;
console.log(`✓ Built dist/ in ${((performance.now() - t) / 1000).toFixed(1)}s: ${s.weeks} weeks, ${s.flashcards} cards, ${s.examples} examples, ${s.questions} questions.`);
