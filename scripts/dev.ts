/**
 * bun run dev: serves the app with hot reload at http://localhost:3000 and
 * recompiles content whenever a file under content/ changes.
 */
import { watch } from "node:fs";
import index from "../src/index.html";
import { compile, printProblems, writeData, ROOT } from "./lib/compile.ts";
import { PGLITE_DIR } from "./lib/vendor.ts";

const DATA = ROOT + ".data";
let building = false;
let again = false;

async function rebuild() {
  if (building) {
    again = true;
    return;
  }
  building = true;
  const t = performance.now();
  const { out, problems } = await compile({ includeDrafts: true });
  if (problems.length) printProblems(problems);
  else {
    await writeData(out!, DATA);
    console.log(`content compiled in ${Math.round(performance.now() - t)} ms (drafts included); reload the page to see it`);
  }
  building = false;
  if (again) {
    again = false;
    rebuild();
  }
}
await rebuild();

let timer: Timer | undefined;
watch(ROOT + "content", { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 150);
});

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  development: { hmr: true, console: true },
  routes: {
    "/": index,
    "/data/*": (req) => new Response(Bun.file(DATA + new URL(req.url).pathname)),
    "/vendor/pglite/*": (req) => {
      const f = new URL(req.url).pathname.replace("/vendor/pglite/", "");
      return new Response(Bun.file(PGLITE_DIR + f));
    },
  },
});
console.log(`CIS3530 Study running at ${server.url}`);
