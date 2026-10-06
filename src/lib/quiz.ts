/** Builds quizzes and exams from blueprints or builder settings, with a seed so an attempt can be reproduced. */
import type { CQuestion } from "../engines/grading.ts";
import type { Blueprint } from "./data.ts";

export interface QuizItem {
  q: CQuestion;
  points: number;
  section?: string;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export const newSeed = () => Math.floor(Math.random() * 1e9);

export function assemble(bp: Blueprint, pool: CQuestion[], seed: number): { items: QuizItem[]; shortfalls: string[] } {
  const rand = rng(seed);
  const used = new Set<string>();
  const items: QuizItem[] = [];
  const shortfalls: string[] = [];
  for (const slot of bp.slots) {
    let cands = pool.filter((q) => slot.types.includes(q.type) && !used.has(q.id));
    if (slot.topics.length) cands = cands.filter((q) => q.topics.some((t) => slot.topics.includes(t)));
    if (slot.requireTags.length) cands = cands.filter((q) => q.tags.some((t) => slot.requireTags.includes(t)));
    const shuffled = shuffle(cands, rand);
    const preferred = slot.preferTags.length ? shuffled.filter((q) => q.tags.some((t) => slot.preferTags.includes(t))) : [];
    const rest = shuffled.filter((q) => !preferred.includes(q));
    const pick = [...preferred, ...rest].slice(0, slot.count);
    if (pick.length < slot.count) shortfalls.push(`${slot.name ?? slot.types.join("/")}: ${pick.length} of ${slot.count} available`);
    for (const q of pick) {
      used.add(q.id);
      items.push({ q, points: slot.points ?? q.points, section: slot.name });
    }
  }
  return { items, shortfalls };
}

export interface BuilderSettings {
  weeks: number[];
  topics: string[];
  types: string[];
  count: number;
  difficulty: number[];
}

export function build(pool: CQuestion[], s: BuilderSettings, seed: number): QuizItem[] {
  const rand = rng(seed);
  const cands = pool.filter(
    (q) =>
      (!s.weeks.length || s.weeks.includes(q.week)) &&
      (!s.topics.length || q.topics.some((t) => s.topics.includes(t))) &&
      (!s.types.length || s.types.includes(q.type)) &&
      (!s.difficulty.length || s.difficulty.includes(q.difficulty)),
  );
  return shuffle(cands, rand)
    .slice(0, s.count)
    .map((q) => ({ q, points: q.points }));
}

export const TYPE_LABELS: Record<string, string> = {
  mcq: "Multiple choice",
  multi: "Select all that apply",
  true_false: "True or false",
  numeric: "Number",
  short: "Short answer",
  matching: "Matching",
  blanks: "Fill in True/False",
  select_attributes: "Pick the attributes",
  order_steps: "Put in order",
  predict_table: "Predict the result",
  ra: "Write relational algebra",
  sql: "Write SQL",
};

export const letter = (i: number) => "abcdefghijklmnopqrstuvwxyz"[i] ?? String(i + 1);

/** Plain-text rendering of the correct answer, for the printable answer key. */
export function answerText(q: CQuestion): string {
  const strip = (h: string) => h.replace(/<[^>]+>/g, "");
  switch (q.type) {
    case "mcq":
      return `${letter(q.answer as number)}) ${strip(q.options![q.answer as number]!)}`;
    case "multi":
      return (q.answer as number[]).map((i) => `${letter(i)})`).join(", ");
    case "true_false":
      return q.answer ? "True" : "False";
    case "numeric":
      return String(q.answer);
    case "short":
      return q.answers![0]!;
    case "matching":
      return q.left!.map((l, i) => `${strip(l)} → ${strip(q.right![(q.answer as number[])[i]!]!)}`).join("\n");
    case "blanks":
      return q.parts!.map((p, i) => `${i + 1}. ${p.answer}`).join("   ");
    case "select_attributes":
      return (q.answer as string[]).join(", ");
    case "order_steps":
      return q.items!.map(strip).join(" → ");
    case "ra":
    case "sql":
      return q.reference!;
    case "predict_table": {
      const e = Object.values(q.expected ?? {})[0];
      return e ? [e.cols.join(" | "), ...e.rows.map((r) => r.map((v) => (v === null ? "null" : v)).join(" | "))].join("\n") : "";
    }
  }
  return "";
}
