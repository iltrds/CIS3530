/**
 * Renders every diagram in content/diagrams/ into one HTML page, for checking layouts.
 *   bun scripts/er-preview.ts [out.html] [--dark]
 */
import { Glob } from "bun";
import { ErDiagram } from "../src/schema/content.ts";
import { figureHtml, renderEr } from "./lib/er.ts";
import { ROOT } from "./lib/compile.ts";

const out = process.argv[2] ?? ROOT + "dist/er-preview.html";
const dark = process.argv.includes("--dark");
const css = await Bun.file(ROOT + "src/styles.css").text();
const parts: string[] = [];
for (const f of [...new Glob("*.yaml").scanSync({ cwd: ROOT + "content/diagrams" })].sort()) {
  const d = ErDiagram.parse(Bun.YAML.parse(await Bun.file(ROOT + "content/diagrams/" + f).text()));
  const r = renderEr(d);
  if (r.problems.length) console.error(f, r.problems);
  parts.push(`<section style="max-width:${d.width + 40}px;margin:24px auto">${figureHtml(d, r, d.caption)}</section>`);
}
await Bun.write(out, `<!doctype html><html${dark ? ' data-theme="dark"' : ""}><head><meta charset="utf-8"><style>${css}</style></head><body style="padding:16px">${parts.join("")}</body></html>`);
console.log(`wrote ${out} (${parts.length} diagrams)`);
