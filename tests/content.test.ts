import { expect, test } from "bun:test";
import { compile } from "../scripts/lib/compile.ts";

// Runs the same checks as `bun run validate`, including every RA/SQL answer key.
test("all content validates and every answer key runs", async () => {
  const { problems, out } = await compile({ includeDrafts: true });
  expect(problems).toEqual([]);
  expect(out!.stats.questions).toBeGreaterThan(0);
}, 60000);

test("every week has enough questions for the in-class quiz simulator", async () => {
  const { out } = await compile();
  for (const w of Object.values(out!.weeks) as { week: { number: number }; questions: { type: string }[] }[]) {
    const count = (t: string) => w.questions.filter((q) => q.type === t).length;
    expect(count("mcq")).toBeGreaterThanOrEqual(3);
    expect(count("matching")).toBeGreaterThanOrEqual(1);
    expect(count("blanks")).toBeGreaterThanOrEqual(1);
  }
}, 60000);
