import { describe, expect, test } from "bun:test";
import { findProblems, parseSchedule, runSchedule, serialResults, sameDb } from "../scripts/lib/schedule.ts";

const kinds = (rows: string[]) => [...new Set(findProblems(parseSchedule(rows)).map((f) => f.kind))].sort();

describe("schedules", () => {
  test("lost update from the slides: A ends at 15, serial gives 13", () => {
    const rows = ["T1: Read(A)", "T1: A = A - 2", "T2: Read(A)", "T2: A = A + 10", "T1: Write(A)", "T2: Write(A)"];
    const st = parseSchedule(rows);
    expect(runSchedule({ A: 5 }, st).final.get("A")).toBe(15);
    expect(serialResults({ A: 5 }, st).map((s) => s.final.get("A"))).toEqual([13, 13]);
    expect(kinds(rows)).toEqual(["lost"]);
  });
  test("rollback restores the before-image; the dirty reader keeps its stale value", () => {
    const rows = ["T2: Begin", "T2: Read(X)", "T2: X = X + 120", "T1: Begin | T2: Write(X)", "T1: Read(X)", "T1: X = X - 50 | T2: Rollback", "T1: Write(X)", "T1: Commit"];
    expect(runSchedule({ X: 100 }, parseSchedule(rows)).final.get("X")).toBe(170);
    expect(kinds(rows)).toEqual(["dirty"]);
  });
  test("unrepeatable vs phantom", () => {
    expect(kinds(["T1: Read(A)", "T1: A = 10", "T2: Read(A)", "T1: Write(A)", "T2: Read(A)"])).toEqual(["unrepeatable"]);
    expect(kinds(["T1: Read(A)", "T2: Read(A)", "T1: Delete(A)", "T2: Read(A)"])).toEqual(["phantom"]);
  });
  test("a read of a committed write is not dirty, and re-reading your own write is fine", () => {
    expect(kinds(["T1: Read(A)", "T1: A = A + 1", "T1: Write(A)", "T1: Commit", "T2: Read(A)", "T2: A = A * 2", "T2: Write(A)", "T2: Read(A)"])).toEqual([]);
  });
  test("an interleaving equal to a serial order", () => {
    const st = parseSchedule(["T1: Read(A)", "T1: A = A - 30", "T1: Write(A)", "T2: Read(A)", "T2: T = A * 0.1", "T2: A = A - T", "T2: Write(A)", "T1: Read(B)", "T1: B = B + 30", "T1: Write(B)", "T2: Read(B)", "T2: B = B + T", "T2: Write(B)"]);
    const run = runSchedule({ A: 600, B: 900 }, st);
    expect(serialResults({ A: 600, B: 900 }, st).some((s) => sameDb(s.final, run.final))).toBe(true);
  });
  test("bad steps are reported", () => {
    expect(() => parseSchedule(["T1 Read(A)"])).toThrow();
    expect(() => runSchedule({ A: 1 }, parseSchedule(["T1: Write(A)"]))).toThrow();
    expect(() => runSchedule({ A: 1 }, parseSchedule(["T1: Commit", "T1: Read(A)"]))).toThrow();
  });
});
