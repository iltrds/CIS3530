/**
 * Grading for every question type. Query types (ra, sql) compare against
 * expected results that the build precomputes for the lecture dataset and
 * each hidden grading instance.
 */
import type { Value } from "./ra/ra.ts";
import { run as runRA, sameRelation, relationToTable, RAError } from "./ra/ra.ts";
import { toEnv, type DatasetLike } from "./datasets.ts";
import type { SqlEngine } from "./sql/engine.ts";
import { sqlErrorMessage } from "./sql/engine.ts";

export interface TableData {
  cols: string[];
  rows: Value[][];
}

/** Shape of a compiled question (markdown already rendered to HTML by the build). */
export interface CQuestion {
  id: string;
  type: string;
  week: number;
  topics: string[];
  difficulty: number;
  points: number;
  dataset?: string;
  show: { diagram: boolean; tables: string[] };
  prompt: string;
  explanation: string;
  hints: string[];
  tags: string[];
  // type-specific
  options?: string[];
  answer?: unknown;
  tolerance?: number;
  answers?: string[];
  caseSensitive?: boolean;
  left?: string[];
  right?: string[];
  strictCase?: boolean;
  parts?: { text: string; answer: string; accept: string[] }[];
  attributes?: string[];
  items?: string[];
  ra?: string;
  sql?: string;
  reference?: string;
  compare?: "set" | "bag" | "ordered";
  /** Expected result per dataset id (lecture dataset first, then grading instances). */
  expected?: Record<string, TableData>;
}

export interface Grade {
  /** 0..1 */
  score: number;
  correct: boolean;
  feedback?: string;
  /** Per-part correctness for matching / blanks / multi. */
  parts?: boolean[];
  /** Student's own result, for query questions. */
  got?: TableData;
  /** Which dataset the check failed on (a grading instance means "works by coincidence"). */
  failedOn?: string;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function isAnswered(q: CQuestion, a: unknown): boolean {
  if (a === undefined || a === null) return false;
  if (typeof a === "string") return a.trim() !== "";
  if (Array.isArray(a)) {
    if (q.type === "predict_table") return (a as string[][]).some((r) => r.some((c) => c.trim() !== ""));
    if (q.type === "matching" || q.type === "blanks") return (a as unknown[]).some((x) => x !== null && x !== undefined && x !== "");
    return a.length > 0;
  }
  return true;
}

export function gradeLocal(q: CQuestion, a: unknown, opts: { strict?: boolean } = {}): Grade {
  switch (q.type) {
    case "mcq": {
      const ok = a === q.answer;
      return { score: ok ? 1 : 0, correct: ok };
    }
    case "true_false": {
      const ok = a === q.answer;
      return { score: ok ? 1 : 0, correct: ok };
    }
    case "multi": {
      const want = new Set(q.answer as number[]);
      const got = new Set((a as number[]) ?? []);
      const right = [...got].filter((x) => want.has(x)).length;
      const wrong = [...got].filter((x) => !want.has(x)).length;
      const score = Math.max(0, (right - wrong) / want.size);
      const ok = right === want.size && wrong === 0;
      return { score, correct: ok, parts: q.options!.map((_, i) => got.has(i) === want.has(i)) };
    }
    case "numeric": {
      const n = Number(String(a ?? "").trim());
      const ok = !isNaN(n) && Math.abs(n - (q.answer as number)) <= (q.tolerance ?? 0);
      return { score: ok ? 1 : 0, correct: ok };
    }
    case "short": {
      const s = String(a ?? "");
      const ok = q.answers!.some((x) => (q.caseSensitive ? x.trim() === s.trim() : norm(x) === norm(s)));
      return { score: ok ? 1 : 0, correct: ok };
    }
    case "matching": {
      const want = q.answer as number[];
      const got = (a as (number | null)[]) ?? [];
      const parts = want.map((w, i) => got[i] === w);
      const score = parts.filter(Boolean).length / parts.length;
      return { score, correct: score === 1, parts };
    }
    case "blanks": {
      const got = (a as string[]) ?? [];
      let caseNote = false;
      const parts = q.parts!.map((p, i) => {
        const g = (got[i] ?? "").trim();
        const accepted = [p.answer, ...p.accept];
        if (accepted.some((x) => x === g)) return true;
        const loose = accepted.some((x) => norm(x) === norm(g));
        if (loose && (opts.strict || q.strictCase) && opts.strict !== false) {
          caseNote = true;
          return false;
        }
        return loose;
      });
      const score = parts.filter(Boolean).length / parts.length;
      return {
        score,
        correct: score === 1,
        parts,
        feedback: caseNote ? "CourseLink only accepts the exact spelling, e.g. True, not TRUE or true." : undefined,
      };
    }
    case "select_attributes": {
      const want = new Set((q.answer as string[]).map((x) => x.toLowerCase()));
      const got = new Set(((a as string[]) ?? []).map((x) => x.toLowerCase()));
      const ok = want.size === got.size && [...want].every((x) => got.has(x));
      return { score: ok ? 1 : 0, correct: ok };
    }
    case "order_steps": {
      const got = (a as number[]) ?? [];
      const ok = got.length === q.items!.length && got.every((x, i) => x === i);
      return { score: ok ? 1 : 0, correct: ok };
    }
    case "predict_table": {
      const exp = firstExpected(q);
      const rows = ((a as string[][]) ?? []).filter((r) => r.some((c) => c.trim() !== ""));
      const cmp = sameRelation({ cols: exp.cols, rows: rows.map((r) => r.map(parseCell)) }, exp, "set");
      return { score: cmp.ok ? 1 : 0, correct: cmp.ok, feedback: cmp.reason };
    }
  }
  throw new Error(`gradeLocal cannot grade ${q.type}`);
}

function parseCell(c: string): Value {
  const t = c.trim();
  if (t === "" || t.toLowerCase() === "null") return null;
  return t;
}

function firstExpected(q: CQuestion): TableData {
  const e = q.expected ?? {};
  const k = q.dataset && e[q.dataset] ? q.dataset : Object.keys(e)[0]!;
  return e[k]!;
}

export async function gradeQuery(
  q: CQuestion,
  a: string,
  ctx: { dataset: (id: string) => Promise<DatasetLike>; sql?: () => Promise<SqlEngine> },
): Promise<Grade> {
  const exp = q.expected ?? {};
  const ids = Object.keys(exp);
  let got: TableData | undefined;
  for (const id of ids) {
    let res: TableData;
    try {
      if (q.type === "ra") {
        const env = toEnv(await ctx.dataset(id));
        res = relationToTable(runRA(a, env).result);
      } else {
        const eng = await ctx.sql!();
        res = await eng.run(id, a);
      }
    } catch (e) {
      const msg = e instanceof RAError ? e.message : sqlErrorMessage(e);
      return { score: 0, correct: false, feedback: msg };
    }
    if (id === ids[0]) got = res;
    const cmp = sameRelation(res, exp[id]!, q.type === "sql" ? q.compare ?? "set" : "set");
    if (!cmp.ok) {
      const onLecture = id === ids[0];
      return {
        score: 0,
        correct: false,
        got,
        failedOn: id,
        feedback: onLecture
          ? cmp.reason
          : `Your answer matches on the lecture data, but not on a second instance of the same tables (${cmp.reason?.replace(/^Your result/, "your result")}) It depends on the specific rows rather than the question's logic: look for a hard-coded value, or a boundary like > where >= is needed.`,
      };
    }
  }
  return { score: 1, correct: true, got };
}

export function isQueryType(t: string) {
  return t === "ra" || t === "sql";
}
