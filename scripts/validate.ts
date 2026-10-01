/**
 * bun run validate: checks every content file and runs every answer key.
 * Exits non-zero on any problem, so CI blocks a broken week from deploying.
 *   bun run validate            all published weeks
 *   bun run validate --drafts   include draft weeks
 *   bun run validate --week 4   one week only
 */
import { compile, printProblems } from "./lib/compile.ts";

const args = process.argv.slice(2);
const includeDrafts = args.includes("--drafts");
const wi = args.indexOf("--week");
const onlyWeek = wi >= 0 ? Number(args[wi + 1]) : undefined;

const t = performance.now();
const { out, problems } = await compile({ includeDrafts: includeDrafts || onlyWeek !== undefined, onlyWeek });
if (problems.length) {
  printProblems(problems);
  process.exit(1);
}
const s = out!.stats;
console.log(
  `✓ Content OK in ${((performance.now() - t) / 1000).toFixed(1)}s: ${s.weeks} week(s), ${s.flashcards} flash cards, ${s.examples} examples, ${s.questions} questions, ${s.datasets} datasets. Every RA/SQL answer key ran.`,
);
