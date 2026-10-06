/**
 * Builds the SQL-reading question types into plain mcq / multi questions,
 * with the answer computed by running the queries. Nothing here trusts a
 * hand-written answer key.
 */
import { sameRelation, type Value } from "../../src/engines/ra/ra.ts";
import type { TableData } from "../../src/engines/grading.ts";
import { rng, shuffle } from "../../src/lib/quiz.ts";

export const NONE_CHOICES = "None of the given choices";
export const NONE_QUERIES = "None of the given queries";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const codeBlock = (q: string) => `<pre><code>${esc(q.trim())}</code></pre>`;

const isNum = (v: Value) => typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v));

/** Same markup as the DataTable component, so it picks up the same styles. */
export function tableHtml(t: TableData, caption?: string): string {
  const head = t.cols.map((c) => `<th scope="col"><span>${esc(c)}</span></th>`).join("");
  const body = t.rows
    .map((r) => "<tr>" + r.map((v) => (v === null ? `<td class="null">null</td>` : `<td${isNum(v) ? ' class="num"' : ""}>${esc(String(v))}</td>`)).join("") + "</tr>")
    .join("");
  const n = t.rows.length;
  return `<div class="rel"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><div class="rel-count">(${n} row${n === 1 ? "" : "s"})${caption ? ` · ${esc(caption)}` : ""}</div></div>`;
}

const seedOf = (id: string) => {
  let s = 7;
  for (const ch of id) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return s;
};

const pairText = (d: number, c: number) => `Degree = ${d}, Cardinality = ${c}`;

// ------------------------------------------------------------------ query_shape

export function buildShape(
  id: string,
  result: TableData,
  distractors: [number, number][],
  answerIsNone: boolean,
): { options: string[]; answer: number; problems: string[]; degree: number; cardinality: number } {
  const degree = result.cols.length;
  const cardinality = result.rows.length;
  const problems: string[] = [];
  const key = (p: [number, number]) => p.join(",");
  const seen = new Set<string>();
  for (const d of distractors) {
    if (d[0] === degree && d[1] === cardinality) problems.push(`distractor ${pairText(...d)} is the actual answer; the query returns ${degree} column(s) and ${cardinality} row(s)`);
    if (seen.has(key(d))) problems.push(`distractor ${pairText(...d)} is listed twice`);
    seen.add(key(d));
  }
  const pairs: [number, number][] = answerIsNone ? distractors : [[degree, cardinality], ...distractors];
  const labels = shuffle([...pairs.map((p) => pairText(...p)), NONE_CHOICES], rng(seedOf(id)));
  const answer = labels.indexOf(answerIsNone ? NONE_CHOICES : pairText(degree, cardinality));
  return { options: labels.map(esc), answer, problems, degree, cardinality };
}

export function shapeExplanation(result: TableData, answerIsNone: boolean): string {
  const d = result.cols.length;
  const c = result.rows.length;
  const lead = `The result has <strong>${d}</strong> column${d === 1 ? "" : "s"} (degree) and <strong>${c}</strong> row${c === 1 ? "" : "s"} (cardinality)${answerIsNone ? `, which isn't among the choices, so the answer is "${NONE_CHOICES}"` : ""}:`;
  return `<p>${lead}</p>${tableHtml(result)}`;
}

// ------------------------------------------------------------------ query_choices

export interface CandidateRun {
  /** dataset id → result, or an error message */
  results: Record<string, TableData | { error: string }>;
}

export interface CandidateVerdict {
  correct: boolean;
  reason: string;
}

const lc = (s: string) => s.toLowerCase().replace(/^.*\./, "");

/** Explains, in plain words, how a candidate's result differs from the expected one. */
export function describeMismatch(got: TableData, want: TableData, mode: "set" | "bag" | "ordered"): string {
  const g = got.cols.map(lc);
  const w = want.cols.map(lc);
  const sameCols = g.length === w.length && [...g].sort().join("|") === [...w].sort().join("|");
  if (!sameCols) {
    return `Returns the columns (${got.cols.join(", ")}) instead of (${want.cols.join(", ")}).`;
  }
  const cmp = sameRelation(got, want, mode);
  if (cmp.ok) return "";
  const asSet = sameRelation(got, want, "set").ok;
  if (asSet && got.rows.length > want.rows.length) {
    return `Returns the right rows but repeats some of them (${got.rows.length} rows instead of ${want.rows.length}). It needs DISTINCT.`;
  }
  if (asSet && got.rows.length < want.rows.length) {
    return `Drops repeated rows that should be kept (${got.rows.length} rows instead of ${want.rows.length}).`;
  }
  if (asSet && mode === "ordered") return "Returns the right rows in the wrong order.";
  if (got.rows.length === want.rows.length) {
    return `Returns ${got.rows.length} row${got.rows.length === 1 ? "" : "s"}, as expected, but not the right ones.`;
  }
  return `Returns different rows: ${got.rows.length} row${got.rows.length === 1 ? "" : "s"} instead of ${want.rows.length}.`;
}

const sentence = (m: string) => m.trim().replace(/[.\s]+$/, "") + ".";

export function judgeCandidate(
  run: CandidateRun,
  want: Record<string, TableData>,
  mainId: string,
  mode: "set" | "bag" | "ordered",
  lang: "sql" | "ra" = "sql",
): CandidateVerdict {
  const main = run.results[mainId]!;
  if ("error" in main) return { correct: false, reason: lang === "sql" ? `Doesn't run. Postgres says: ${sentence(main.error)}` : `Isn't a valid expression: ${sentence(main.error)}` };
  const r = describeMismatch(main, want[mainId]!, mode);
  if (r) return { correct: false, reason: r };
  for (const [id, res] of Object.entries(run.results)) {
    if (id === mainId) continue;
    if ("error" in res) return { correct: false, reason: `Fails on a different instance of the same tables: ${sentence(res.error)}` };
    const alt = describeMismatch(res, want[id]!, mode);
    if (alt) return { correct: false, reason: `Gives the right answer on these rows only by coincidence. On a different instance of the same tables it ${alt.charAt(0).toLowerCase()}${alt.slice(1)}` };
  }
  const reordered = main.cols.map(lc).join("|") !== want[mainId]!.cols.map(lc).join("|");
  return { correct: true, reason: reordered ? "Same result. The columns are in a different order, which doesn't change the relation." : "Same result." };
}

export function buildChoices(
  id: string,
  candidates: { query: string; why: string; verdict: CandidateVerdict }[],
  opts: { multi: boolean; noneOption: boolean; noneLabel?: string },
): { options: string[]; answer: number | number[]; order: number[]; problems: string[]; noneIndex: number } {
  const problems: string[] = [];
  const rand = rng(seedOf(id));
  const order = shuffle(candidates.map((_, i) => i), rand);
  const options = order.map((i) => codeBlock(candidates[i]!.query));
  let noneIndex = -1;
  const label = opts.noneLabel ?? NONE_QUERIES;
  if (opts.noneOption) {
    noneIndex = opts.multi ? options.length : Math.floor(rand() * (options.length + 1));
    options.splice(noneIndex, 0, esc(label));
  }
  const posOf = (cand: number) => {
    const p = order.indexOf(cand);
    return noneIndex >= 0 && p >= noneIndex ? p + 1 : p;
  };
  const correct = candidates.map((c, i) => (c.verdict.correct ? posOf(i) : -1)).filter((p) => p >= 0).sort((a, b) => a - b);
  let answer: number | number[];
  if (opts.multi) {
    if (!correct.length && noneIndex < 0) problems.push("no candidate is correct and there's no 'None' option");
    answer = correct.length ? correct : [noneIndex];
  } else {
    if (correct.length > 1) problems.push(`${correct.length} candidates are correct; set multi: true or change them`);
    if (!correct.length && noneIndex < 0) problems.push("no candidate is correct and there's no 'None' option");
    answer = correct.length ? correct[0]! : noneIndex;
  }
  return { options, answer, order, problems, noneIndex };
}

export function choicesExplanation(
  candidates: { query: string; why: string; verdict: CandidateVerdict }[],
  order: number[],
  noneIndex: number,
  expected: TableData,
  whyHtml: (s: string) => string,
): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const items: string[] = [];
  let pos = 0;
  for (const i of order) {
    if (pos === noneIndex) pos++;
    const c = candidates[i]!;
    const mark = c.verdict.correct ? "✓" : "✗";
    const extra = c.why ? ` ${whyHtml(c.why)}` : "";
    items.push(`<li><strong>${letters[pos]}) ${mark}</strong> ${esc(c.verdict.reason)}${extra}</li>`);
    pos++;
  }
  return `<ul class="why-list">${items.join("")}</ul><p>The result it should produce:</p>${tableHtml(expected)}`;
}
