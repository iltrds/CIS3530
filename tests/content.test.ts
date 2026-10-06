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
    const { shortfalls } = assemble(bp, pool, 1);
    expect({ week: w.number, format: bp.id, shortfalls }).toEqual({ week: w.number, format: bp.id, shortfalls: [] });
  }
}, 60000);
