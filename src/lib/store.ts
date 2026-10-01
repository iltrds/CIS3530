/**
 * Progress lives in localStorage (per browser). Everything is exportable as
 * JSON from the Progress page so a cleared browser doesn't lose history.
 */
import { useSyncExternalStore } from "react";
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade as FsrsGrade } from "ts-fsrs";

export interface Attempt {
  qid: string;
  week: number;
  topics: string[];
  score: number;
  at: string;
  mode: "practice" | "quiz" | "exam";
}
export interface Run {
  id: string;
  blueprint: string;
  title: string;
  at: string;
  score: number;
  outOf: number;
  weeks: number[];
  perTopic: Record<string, { score: number; outOf: number }>;
}
export interface Progress {
  v: 1;
  cards: Record<string, Card>;
  attempts: Attempt[];
  mistakes: Record<string, { since: string; streak: number }>;
  runs: Run[];
  settings: { theme: "system" | "light" | "dark" };
  seeded: string[];
}

const KEY = "cis3530-study.v1";
const empty = (): Progress => ({ v: 1, cards: {}, attempts: [], mistakes: {}, runs: [], settings: { theme: "system" }, seeded: [] });

function read(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw) as Progress;
    for (const c of Object.values(p.cards)) {
      c.due = new Date(c.due);
      if (c.last_review) c.last_review = new Date(c.last_review);
    }
    return { ...empty(), ...p };
  } catch {
    return empty();
  }
}

let state = read();
let storageOk = true;
const subs = new Set<() => void>();

function save(next: Progress) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    storageOk = true;
  } catch {
    storageOk = false; // private mode or storage blocked: keep working in memory
  }
  subs.forEach((f) => f());
}

export function update(fn: (p: Progress) => Progress) {
  save(fn(state));
}

export function useProgress(): Progress {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );
}
export const getProgress = () => state;
export const storageWorks = () => storageOk;

// ---------------------------------------------------------------- flash cards (FSRS)

const scheduler = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9 }));

export function cardState(id: string): Card {
  return state.cards[id] ?? createEmptyCard(new Date());
}

export function isDue(id: string, now = new Date()): boolean {
  const c = state.cards[id];
  return !c || c.due <= now;
}

export function isNew(id: string): boolean {
  const c = state.cards[id];
  return !c || c.state === State.New;
}

/** New cards introduced per session, on top of any reviews that are due. */
export const NEW_PER_SESSION = 20;

/** Cards to study now: every due review, plus up to NEW_PER_SESSION new cards (priority ones first). */
export function dueQueue<T extends { id: string; tags: string[] }>(cards: T[], now = new Date()): T[] {
  const reviews = cards.filter((c) => !isNew(c.id) && isDue(c.id, now)).sort((a, b) => cardState(a.id).due.getTime() - cardState(b.id).due.getTime());
  const fresh = cards.filter((c) => isNew(c.id));
  const prio = (c: T) => (c.tags.includes("quiz-miss") ? 0 : c.tags.includes("trap") ? 1 : 2);
  const newOnes = [...fresh].sort((a, b) => prio(a) - prio(b)).slice(0, NEW_PER_SESSION);
  return [...newOnes.filter((c) => prio(c) === 0), ...reviews, ...newOnes.filter((c) => prio(c) !== 0)];
}

export function rateCard(id: string, rating: FsrsGrade) {
  const now = new Date();
  const { card } = scheduler.next(cardState(id), now, rating);
  update((p) => ({ ...p, cards: { ...p.cards, [id]: card } }));
}

/** Preview the interval each rating would give, for button labels. */
export function previewIntervals(id: string): Record<number, string> {
  const now = new Date();
  const rec = scheduler.repeat(cardState(id), now);
  const out: Record<number, string> = {};
  for (const r of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
    const due = (rec as unknown as Record<number, { card: Card }>)[r]!.card.due;
    out[r] = humanInterval(due.getTime() - now.getTime());
  }
  return out;
}

function humanInterval(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} d`;
  return `${Math.round(d / 30)} mo`;
}

export { Rating };

// ---------------------------------------------------------------- attempts & mistakes

export function recordAttempt(a: Omit<Attempt, "at">) {
  update((p) => {
    const mistakes = { ...p.mistakes };
    const m = mistakes[a.qid];
    if (a.score < 1) mistakes[a.qid] = { since: m?.since ?? new Date().toISOString(), streak: 0 };
    else if (m) {
      // a mistake leaves the queue after two correct answers in a row
      if (m.streak + 1 >= 2) delete mistakes[a.qid];
      else mistakes[a.qid] = { ...m, streak: m.streak + 1 };
    }
    const attempts = [...p.attempts, { ...a, at: new Date().toISOString() }].slice(-3000);
    return { ...p, attempts, mistakes };
  });
}

export function recordRun(r: Omit<Run, "at">) {
  update((p) => ({ ...p, runs: [...p.runs, { ...r, at: new Date().toISOString() }].slice(-200) }));
}

/** Accuracy per topic from recent attempts (latest 20 per topic). */
export function topicStats(p: Progress): Record<string, { attempts: number; accuracy: number }> {
  const by: Record<string, number[]> = {};
  for (const a of p.attempts) for (const t of a.topics) (by[t] ??= []).push(a.score);
  const out: Record<string, { attempts: number; accuracy: number }> = {};
  for (const [t, xs] of Object.entries(by)) {
    const recent = xs.slice(-20);
    out[t] = { attempts: xs.length, accuracy: recent.reduce((s, x) => s + x, 0) / recent.length };
  }
  return out;
}

/** One-time seeding: questions tagged quiz-miss start in the mistakes queue. */
export function seedMistakes(ids: string[], tag: string) {
  if (state.seeded.includes(tag)) return;
  update((p) => {
    const mistakes = { ...p.mistakes };
    for (const id of ids) mistakes[id] ??= { since: new Date().toISOString(), streak: 0 };
    return { ...p, mistakes, seeded: [...p.seeded, tag] };
  });
}

export function exportProgress(): string {
  return JSON.stringify(state, null, 2);
}

export function importProgress(json: string) {
  const p = JSON.parse(json) as Progress;
  if (p.v !== 1 || typeof p.cards !== "object") throw new Error("That file isn't a progress export from this site.");
  for (const c of Object.values(p.cards)) {
    c.due = new Date(c.due);
    if (c.last_review) c.last_review = new Date(c.last_review);
  }
  save({ ...empty(), ...p });
}

export function resetProgress() {
  save(empty());
}

export function setTheme(theme: Progress["settings"]["theme"]) {
  update((p) => ({ ...p, settings: { ...p.settings, theme } }));
}
