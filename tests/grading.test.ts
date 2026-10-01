import { describe, expect, test } from "bun:test";
import { gradeLocal, type CQuestion } from "../src/engines/grading.ts";

const base = { id: "t", week: 1, topics: ["x"], difficulty: 1, points: 1, show: { diagram: false, tables: [] }, prompt: "", explanation: "", hints: [], tags: [] };

describe("gradeLocal", () => {
  const blanks: CQuestion = { ...base, type: "blanks", strictCase: true, parts: [{ text: "a", answer: "True", accept: [] }, { text: "b", answer: "False", accept: [] }] };
  test("blanks: exact spelling required in simulator mode, like CourseLink", () => {
    const g = gradeLocal(blanks, ["TRUE", "False"], { strict: true });
    expect(g.parts).toEqual([false, true]);
    expect(g.score).toBe(0.5);
    expect(g.feedback).toContain("exact");
  });
  test("blanks: case is forgiven in practice mode", () => {
    expect(gradeLocal(blanks, ["true", "false"], { strict: false }).correct).toBe(true);
  });
  test("matching gives partial credit", () => {
    const q: CQuestion = { ...base, type: "matching", left: ["a", "b", "c"], right: ["x", "y", "z"], answer: [2, 1, 0] };
    expect(gradeLocal(q, [2, 0, 0]).score).toBeCloseTo(2 / 3);
  });
  test("multi: wrong picks cancel right ones", () => {
    const q: CQuestion = { ...base, type: "multi", options: ["a", "b", "c", "d"], answer: [0, 1] };
    expect(gradeLocal(q, [0, 1]).correct).toBe(true);
    expect(gradeLocal(q, [0, 2]).score).toBe(0);
    expect(gradeLocal(q, [0]).score).toBe(0.5);
  });
  test("numeric and short answers", () => {
    expect(gradeLocal({ ...base, type: "numeric", answer: 24, tolerance: 0 }, " 24 ").correct).toBe(true);
    expect(gradeLocal({ ...base, type: "short", answers: ["integers"], caseSensitive: false }, "Integers").correct).toBe(true);
  });
  test("predict_table compares rows as a set, null allowed", () => {
    const q: CQuestion = { ...base, type: "predict_table", expected: { toy: { cols: ["a", "b"], rows: [["x", 1], ["y", null]] } } };
    expect(gradeLocal(q, [["y", "null"], ["x", "1"], ["", ""]]).correct).toBe(true);
    expect(gradeLocal(q, [["x", "1"]]).correct).toBe(false);
  });
  test("order_steps", () => {
    const q: CQuestion = { ...base, type: "order_steps", items: ["FROM", "WHERE", "SELECT"] };
    expect(gradeLocal(q, [0, 1, 2]).correct).toBe(true);
    expect(gradeLocal(q, [1, 0, 2]).correct).toBe(false);
  });
});
