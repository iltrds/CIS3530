import { expect, test } from "bun:test";
import { compile } from "../scripts/lib/compile.ts";
import { assemble } from "../src/lib/quiz.ts";
import type { Blueprint } from "../src/lib/data.ts";
import type { CQuestion } from "../src/engines/grading.ts";

// Runs the same checks as `bun run validate`, including every RA/SQL answer key.
test("all content validates and every answer key runs", async () => {
  const { problems, out } = await compile({ includeDrafts: true });
  expect(problems).toEqual([]);
  expect(out!.stats.questions).toBeGreaterThan(0);
}, 60000);

test("every week has enough questions for its in-class quiz format", async () => {
  const { out } = await compile();
  const m = out!.manifest as { blueprints: Blueprint[]; weeks: { number: number; quizFormat: string }[] };
  for (const w of m.weeks) {
    const bp = m.blueprints.find((b) => b.id === w.quizFormat)!;
    const pool = (out!.weeks[w.number] as { questions: CQuestion[] }).questions;
    const { shortfalls, items } = assemble(bp, pool, 1);
    // every item has its slot's style: conceptual unless a slot asks otherwise (the ER quiz has one recall question)
    const want = bp.slots.flatMap((s) => Array(s.count).fill(s.style ?? bp.style));
    expect(items.map((it) => it.q.style)).toEqual(want.slice(0, items.length));
    expect({ week: w.number, format: bp.id, shortfalls }).toEqual({ week: w.number, format: bp.id, shortfalls: [] });
  }
}, 60000);

test("a diagram group's slots all share one diagram or relation", async () => {
  const { out } = await compile();
  const m = out!.manifest as { blueprints: Blueprint[] };
  for (const [week, format, prefix] of [[6, "in-class-er", "diagram:"], [7, "in-class-nf", "context:"]] as const) {
    const bp = m.blueprints.find((b) => b.id === format)!;
    const pool = (out!.weeks[week] as { questions: CQuestion[] }).questions;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { items, shortfalls } = assemble(bp, pool, seed);
      expect(shortfalls).toEqual([]);
      const s1 = items.filter((it) => it.section === "Section I");
      expect(s1.length).toBe(5);
      const shared = new Set(s1.map((it) => it.q.tags.find((t) => t.startsWith(prefix))));
      expect({ week, seed, shared: shared.size }).toEqual({ week, seed, shared: 1 });
    }
  }
}, 60000);

// The in-class quizzes are conceptual. Each week leans the same way but keeps
// some direct questions (writing queries, definitions) for rounded practice.
test("every week is mostly conceptual but keeps some direct questions", async () => {
  const { out } = await compile();
  for (const [n, w] of Object.entries(out!.weeks) as [string, { questions: CQuestion[] }][]) {
    const total = w.questions.length;
    const direct = w.questions.filter((q) => q.style === "direct").length;
    const conceptual = total - direct;
    expect({ week: n, conceptualAtLeastTwoThirds: conceptual / total >= 2 / 3, someDirect: direct >= 5 }).toEqual({ week: n, conceptualAtLeastTwoThirds: true, someDirect: true });
  }
}, 60000);
