/**
 * bun run build:preview — a single self-contained HTML file (data inlined, no
 * PGlite) for hosts that only accept one page, such as a Claude artifact.
 * SQL features show a note pointing to the full site.
 */
import { Glob } from "bun";
import { compile, printProblems, ROOT } from "./lib/compile.ts";

const { out, problems } = await compile();
if (problems.length) {
  printProblems(problems);
  process.exit(1);
}
const tmp = ROOT + ".preview-build";
const res = await Bun.build({ entrypoints: [ROOT + "src/index.html"], outdir: tmp, minify: true, define: { "process.env.NODE_ENV": JSON.stringify("production") } });
if (!res.success) {
  for (const l of res.logs) console.error(l);
  process.exit(1);
}
const read = async (pat: string) => Bun.file(tmp + "/" + [...new Glob(pat).scanSync({ cwd: tmp })][0]).text();
const css = await read("*.css");
const js = await read("*.js");

const data: Record<string, unknown> = {
  "manifest.json": out!.manifest,
  "datasets.json": out!.datasets,
  "search.json": out!.search,
};
for (const [n, w] of Object.entries(out!.weeks)) data[`week-${String(n).padStart(2, "0")}.json`] = w;
const safe = (s: string) => s.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

const html = `<title>CIS3530 Study</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&family=Noto+Sans+Math&display=swap" rel="stylesheet">
<style>${css}</style>
<div id="root"></div>
<script>
window.__PREVIEW__ = true;
window.__SQL_UNAVAILABLE__ = "SQL questions and the SQL playground run real Postgres, which needs the full site (bun run dev, or the deployed copy). Everything else works here.";
window.__EMBEDDED_DATA__ = ${safe(JSON.stringify(data))};
</script>
<script type="module">${safe(js)}</script>
`;
const dest = ROOT + "preview/cis3530-study.html";
await Bun.write(dest, html);
await Bun.$`rm -rf ${tmp}`;
console.log(`✓ ${dest} (${(html.length / 1024).toFixed(0)} KB)`);
