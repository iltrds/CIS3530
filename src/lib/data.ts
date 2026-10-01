/** Loads the compiled JSON produced by the build (manifest, weeks, datasets, search). */
import { useEffect, useState } from "react";
import type { CQuestion, TableData } from "../engines/grading.ts";
import type { DatasetLike } from "../engines/datasets.ts";

export interface Topic {
  id: string;
  label: string;
  week: number;
}
export interface WeekMeta {
  number: number;
  title: string;
  summary: string;
  topics: string[];
  readings: string[];
  sources: string[];
  counts: { flashcards: number; examples: number; questions: number; byType: Record<string, number> };
}
export interface Slot {
  name?: string;
  types: string[];
  count: number;
  points?: number;
  preferTags: string[];
  topics: string[];
}
export interface Blueprint {
  id: string;
  title: string;
  description: string;
  kind: "quiz" | "exam";
  covers: "one_week" | "released";
  timeLimitMin: number;
  strictAnswers: boolean;
  feedback: "end" | "immediate";
  slots: Slot[];
}
export interface CourseEvent {
  date: string;
  kind: string;
  title: string;
  covers: number[];
  note: string;
}
export interface Manifest {
  generatedAt: string;
  course: {
    code: string;
    title: string;
    term: string;
    lecture: { weekday: number; time: string };
    weights: { item: string; percent: number }[];
    events: CourseEvent[];
    results: { title: string; date: string; score: number; outOf: number; missedTopics: string[] }[];
  };
  topics: Topic[];
  weeks: WeekMeta[];
  datasets: { id: string; title: string; description: string; source: string; hidden: boolean; tables: string[] }[];
  blueprints: Blueprint[];
}
export interface Flashcard {
  id: string;
  topic: string;
  front: string;
  back: string;
  tags: string[];
  week: number;
}
export interface ExampleStep {
  title: string;
  body: string;
  ra?: string;
  sql?: string;
  result?: TableData;
}
export interface Example {
  id: string;
  title: string;
  topics: string[];
  dataset?: string;
  question: string;
  steps: ExampleStep[];
  pitfalls: string[];
  week: number;
}
export interface WeekData {
  week: WeekMeta;
  notes: string;
  flashcards: Flashcard[];
  examples: Example[];
  questions: CQuestion[];
}
export type Dataset = DatasetLike & { title: string; description: string; source: string; hidden: boolean; relax: string };

const BASE = "./data/";
const cache = new Map<string, Promise<unknown>>();

declare global {
  interface Window {
    /** Set by the single-file preview build: compiled JSON inlined in the page. */
    __EMBEDDED_DATA__?: Record<string, unknown>;
    __PREVIEW__?: boolean;
  }
}

function get<T>(file: string): Promise<T> {
  const embedded = window.__EMBEDDED_DATA__?.[file];
  if (embedded) return Promise.resolve(embedded as T);
  let p = cache.get(file);
  if (!p) {
    p = fetch(BASE + file).then((r) => {
      if (!r.ok) throw new Error(`Couldn't load ${file} (${r.status})`);
      return r.json();
    });
    cache.set(file, p);
    p.catch(() => cache.delete(file));
  }
  return p as Promise<T>;
}

export const loadManifest = () => get<Manifest>("manifest.json");
export const loadWeek = (n: number) => get<WeekData>(`week-${String(n).padStart(2, "0")}.json`);
export const loadDatasets = () => get<Dataset[]>("datasets.json");
export const loadSearch = () => get<{ id: string; kind: string; week: number; title: string; text: string; href: string }[]>("search.json");

export async function loadDataset(id: string): Promise<Dataset> {
  const all = await loadDatasets();
  const d = all.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown dataset ${id}`);
  return d;
}

export async function loadAllWeeks(): Promise<WeekData[]> {
  const m = await loadManifest();
  return Promise.all(m.weeks.map((w) => loadWeek(w.number)));
}

/** Tiny async hook: re-runs when deps change, exposes data/error. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data?: T; error?: Error; loading: boolean } {
  const [state, set] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    set((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => live && set({ data, loading: false }),
      (error) => live && set({ error, loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export const topicLabel = (m: Manifest, id: string) => m.topics.find((t) => t.id === id)?.label ?? id;
