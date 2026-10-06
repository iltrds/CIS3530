import { describe, expect, test } from "bun:test";
import { buildChoices, buildShape, describeMismatch, judgeCandidate, NONE_CHOICES, NONE_QUERIES } from "../scripts/lib/query-questions.ts";

const t = (cols: string[], rows: (string | number | null)[][]) => ({ cols, rows });

describe("query_shape", () => {
  const r = t(["sno"], [["S1"], ["S2"], ["S3"]]);
  test("the computed pair is the answer, options are stable per id", () => {
    const a = buildShape("q1", r, [[1, 4], [2, 3]], false);
    expect(a.problems).toEqual([]);
    expect(a.options[a.answer as number]).toBe("Degree = 1, Cardinality = 3");
    expect(a.options).toContain(NONE_CHOICES);
    expect(buildShape("q1", r, [[1, 4], [2, 3]], false).options).toEqual(a.options);
  });
  test("answerIsNone leaves the real pair out", () => {
    const a = buildShape("q2", r, [[1, 4], [2, 3]], true);
    expect(a.options[a.answer]).toBe(NONE_CHOICES);
    expect(a.options).not.toContain("Degree = 1, Cardinality = 3");
  });
  test("a distractor equal to the real answer is reported", () => {
    expect(buildShape("q3", r, [[1, 3], [2, 3]], false).problems.length).toBe(1);
  });
});

describe("query_choices", () => {
  const want = { main: t(["sno", "city"], [["S1", "X"], ["S2", "Y"]]), alt: t(["sno", "city"], [["S9", "Z"]]) };
  test("reordered columns are still the same relation", () => {
    const v = judgeCandidate({ results: { main: t(["city", "sno"], [["X", "S1"], ["Y", "S2"]]), alt: t(["city", "sno"], [["Z", "S9"]]) } }, want, "main", "bag");
    expect(v.correct).toBe(true);
    expect(v.reason).toContain("different order");
  });
  test("duplicates are caught in bag mode and explained", () => {
    expect(describeMismatch(t(["sno", "city"], [["S1", "X"], ["S1", "X"], ["S2", "Y"]]), want.main, "bag")).toContain("DISTINCT");
  });
  test("right only by coincidence on the lecture data is wrong", () => {
    const v = judgeCandidate({ results: { main: want.main, alt: t(["sno", "city"], []) } }, want, "main", "bag");
    expect(v.correct).toBe(false);
    expect(v.reason).toContain("coincidence");
  });
  test("errors are wrong answers with the database message", () => {
    const v = judgeCandidate({ results: { main: { error: 'column reference "sno" is ambiguous' }, alt: want.alt } }, want, "main", "bag");
    expect(v).toEqual({ correct: false, reason: 'Doesn\'t run. Postgres says: column reference "sno" is ambiguous.' });
  });
  const ok = { correct: true, reason: "" };
  const bad = { correct: false, reason: "" };
  test("single choice: None is the answer when nothing is right; two right answers is an authoring error", () => {
    const none = buildChoices("c1", [{ query: "a", why: "", verdict: bad }, { query: "b", why: "", verdict: bad }], { multi: false, noneOption: true });
    expect(none.options[none.answer as number]).toBe(NONE_QUERIES);
    const two = buildChoices("c2", [{ query: "a", why: "", verdict: ok }, { query: "b", why: "", verdict: ok }], { multi: false, noneOption: true });
    expect(two.problems.length).toBe(1);
  });
  test("multi: every correct candidate is an answer, None goes last", () => {
    const m = buildChoices("c3", [{ query: "a", why: "", verdict: ok }, { query: "b", why: "", verdict: bad }, { query: "c", why: "", verdict: ok }], { multi: true, noneOption: true });
    expect((m.answer as number[]).length).toBe(2);
    expect(m.options[m.options.length - 1]).toBe(NONE_QUERIES);
  });
});
