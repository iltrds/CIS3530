/**
 * Content compiler: reads every YAML/Markdown file under content/, validates it,
 * runs every RA/SQL answer key and example against its datasets, renders
 * Markdown, and returns JSON-ready objects. Used by build.ts, validate.ts and dev.ts.
 */
import { Glob } from "bun";
import { marked } from "marked";
import { z } from "zod";
import { PGlite } from "@electric-sql/pglite";
import * as S from "../../src/schema/content.ts";
import { toEnv, toRelax } from "../../src/engines/datasets.ts";
import { run as runRA, relationToTable } from "../../src/engines/ra/ra.ts";
import { SqlEngine } from "../../src/engines/sql/engine.ts";
import type { CQuestion, TableData } from "../../src/engines/grading.ts";
import { buildChoices, buildShape, choicesExplanation, codeBlock, judgeCandidate, shapeExplanation, type CandidateRun } from "./query-questions.ts";

export const ROOT = new URL("../../", import.meta.url).pathname;
const C = ROOT + "content/";

export interface Problem {
  file: string;
  where: string;
  message: string;
}

export interface Compiled {
  manifest: unknown;
  weeks: Record<number, unknown>;
  datasets: unknown[];
  search: { id: string; kind: string; week: number; title: string; text: string; href: string }[];
  stats: { weeks: number; flashcards: number; examples: number; questions: number; datasets: number };
}

const md = (s: string) => (marked.parse(s, { async: false, gfm: true }) as string).trim();
const mdi = (s: string) => (marked.parseInline(s, { async: false, gfm: true }) as string).trim();
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

async function readYamlRaw(path: string): Promise<unknown> {
  return Bun.YAML.parse(await Bun.file(path).text());
}

function files(pattern: string, cwd: string): string[] {
  return [...new Glob(pattern).scanSync({ cwd })].sort();
}

export async function compile(opts: { includeDrafts?: boolean; onlyWeek?: number } = {}): Promise<{ out?: Compiled; problems: Problem[] }> {
  const problems: Problem[] = [];
  const fail = (file: string, where: string, message: string) => problems.push({ file, where, message });

  const yamlErrors = new Set<string>();
  const readYaml = async (path: string): Promise<unknown> => {
    try {
      return await readYamlRaw(path);
    } catch (e) {
      const rel = path.replace(C, "");
      yamlErrors.add(rel);
      fail(rel, "(syntax)", `${(e as Error).message.replace(/^.*?: /, "")}. Check for an unquoted ": " or "#" in a value, or wrong indentation.`);
      return undefined;
    }
  };

  function parse<T>(schema: z.ZodType<T>, data: unknown, file: string): T | undefined {
    if (yamlErrors.has(file)) return undefined;
    const r = schema.safeParse(data);
    if (r.success) return r.data;
    for (const issue of r.error.issues) fail(file, issue.path.join(".") || "(root)", issue.message);
    return undefined;
  }

  // ---------------------------------------------------------------- datasets
  const datasets = new Map<string, S.Dataset>();
  for (const f of files("*.yaml", C + "datasets")) {
    const ds = parse(S.Dataset, await readYaml(C + "datasets/" + f), `datasets/${f}`);
    if (!ds) continue;
    if (datasets.has(ds.id)) fail(`datasets/${f}`, "id", `Duplicate dataset id ${ds.id}`);
    for (const t of ds.tables) {
      t.rows.forEach((r, i) => {
        if (r.length !== t.columns.length) fail(`datasets/${f}`, `${t.name} row ${i + 1}`, `has ${r.length} values but ${t.columns.length} columns`);
      });
    }
    datasets.set(ds.id, ds);
  }
  const alternatesOf = (id: string) => [...datasets.values()].filter((d) => d.alternateOf.includes(id)).map((d) => d.id);

  // one Postgres for everything; checks every dataset loads with its keys and FKs
  const pg = new PGlite();
  const engine = new SqlEngine(pg, (id) => datasets.get(id)!);
  for (const ds of datasets.values()) {
    try {
      await engine.ensure(ds.id);
    } catch (e) {
      fail(`datasets/${ds.id}.yaml`, "(load)", `Postgres rejected the data: ${(e as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- topics, course, blueprints
  const topics = parse(S.Topics, await readYaml(C + "topics.yaml"), "topics.yaml") ?? [];
  const topicIds = new Set(topics.map((t) => t.id));
  const course = parse(S.Course, await readYaml(C + "course.yaml"), "course.yaml");
  const blueprints: S.Blueprint[] = [];
  for (const dir of ["quizzes", "exams"]) {
    for (const f of files("*.yaml", C + dir)) {
      const b = parse(S.Blueprint, await readYaml(`${C}${dir}/${f}`), `${dir}/${f}`);
      if (b) blueprints.push(b);
    }
  }

  // ---------------------------------------------------------------- helpers for query evaluation
  async function evalRA(src: string, dsId: string): Promise<TableData> {
    return relationToTable(runRA(src, toEnv(datasets.get(dsId)!)).result);
  }
  async function evalSQL(src: string, dsId: string): Promise<TableData> {
    const r = await engine.run(dsId, src);
    return { cols: r.cols, rows: r.rows };
  }

  // ---------------------------------------------------------------- weeks
  const ids = new Set<string>();
  const weeksOut: Record<number, unknown> = {};
  const weekMeta: unknown[] = [];
  const search: Compiled["search"] = [];
  let nCards = 0, nEx = 0, nQ = 0;

  for (const dir of files("week-*/week.yaml", C + "weeks").map((p) => p.split("/")[0]!)) {
    const base = `${C}weeks/${dir}/`;
    const rel = (f: string) => `weeks/${dir}/${f}`;
    const week = parse(S.Week, await readYaml(base + "week.yaml"), rel("week.yaml"));
    if (!week) continue;
    if (opts.onlyWeek && week.number !== opts.onlyWeek) continue;
    if (week.status === "draft" && !opts.includeDrafts) continue;
    for (const t of week.topics) if (!topicIds.has(t)) fail(rel("week.yaml"), "topics", `Unknown topic ${t}. Add it to topics.yaml.`);

    const load = async <T>(name: string, schema: z.ZodType<T[]>): Promise<T[]> => {
      const f = Bun.file(base + name);
      if (!(await f.exists())) return [];
      return parse(schema, (await readYaml(base + name)) ?? [], rel(name)) ?? [];
    };
    const cards = await load("flashcards.yaml", S.Flashcards);
    const examples = await load("examples.yaml", S.Examples);
    const questions = await load("questions.yaml", S.Questions);
    const notesFile = Bun.file(base + "notes.md");
    const notesHtml = (await notesFile.exists()) ? md(await notesFile.text()) : "";

    const checkId = (id: string, file: string) => {
      if (ids.has(id)) fail(file, id, "Duplicate id (ids must be unique across all weeks)");
      ids.add(id);
    };
    const checkTopic = (t: string, file: string, id: string) => {
      if (!topicIds.has(t)) fail(file, id, `Unknown topic ${t}`);
    };
    const checkDataset = (d: string | undefined, file: string, id: string) => {
      if (d && !datasets.has(d)) fail(file, id, `Unknown dataset ${d}`);
    };

    // flash cards
    const cardsOut = cards.map((c) => {
      checkId(c.id, rel("flashcards.yaml"));
      checkTopic(c.topic, rel("flashcards.yaml"), c.id);
      search.push({ id: c.id, kind: "Flash card", week: week.number, title: text(mdi(c.front)), text: text(mdi(c.back)), href: `#/flashcards?week=${week.number}&card=${c.id}` });
      return { ...c, week: week.number, front: mdi(c.front), back: mdi(c.back) };
    });

    // examples (evaluate each step's RA/SQL)
    const examplesOut = [];
    for (const ex of examples) {
      const file = rel("examples.yaml");
      checkId(ex.id, file);
      ex.topics.forEach((t) => checkTopic(t, file, ex.id));
      checkDataset(ex.dataset, file, ex.id);
      const steps = [];
      for (const [i, st] of ex.steps.entries()) {
        let result: TableData | undefined;
        let error: string | undefined;
        if ((st.ra || st.sql) && !ex.dataset) fail(file, `${ex.id} step ${i + 1}`, "has a query but the example has no dataset");
        else if (st.ra || st.sql) {
          try {
            result = st.ra ? await evalRA(st.ra, ex.dataset!) : await evalSQL(st.sql!, ex.dataset!);
          } catch (e) {
            fail(file, `${ex.id} step ${i + 1}`, `Query failed: ${(e as Error).message}`);
          }
        }
        steps.push({ title: mdi(st.title), body: md(st.body), ra: st.ra?.trim(), sql: st.sql?.trim(), result: st.showResult ? result : undefined, error });
      }
      search.push({ id: ex.id, kind: "Example", week: week.number, title: ex.title, text: text(md(ex.question)), href: `#/week/${week.number}/examples#${ex.id}` });
      examplesOut.push({ ...ex, week: week.number, question: md(ex.question), steps, pitfalls: ex.pitfalls.map(mdi) });
    }

    // questions
    const questionsOut: CQuestion[] = [];
    for (const q of questions) {
      const file = rel("questions.yaml");
      const where = q.id;
      checkId(q.id, file);
      q.topics.forEach((t) => checkTopic(t, file, q.id));
      checkDataset(q.dataset, file, q.id);
      const ds = q.dataset ? datasets.get(q.dataset) : undefined;
      for (const t of q.show.tables) if (ds && !ds.tables.some((x) => x.name === t)) fail(file, where, `show.tables: ${q.dataset} has no table ${t}`);
      if ((q.show.diagram || q.show.tables.length) && !q.dataset) fail(file, where, "show needs a dataset");

      const out: CQuestion = {
        ...(q as unknown as CQuestion),
        week: week.number,
        prompt: md(q.prompt),
        explanation: md(q.explanation),
        hints: q.hints.map(mdi),
      };

      switch (q.type) {
        case "mcq":
          if (q.answer >= q.options.length) fail(file, where, "answer index is past the last option");
          out.options = q.options.map(mdi);
          break;
        case "multi":
          if (q.answer.some((a) => a >= q.options.length)) fail(file, where, "an answer index is past the last option");
          out.options = q.options.map(mdi);
          break;
        case "matching":
          if (q.answer.length !== q.left.length) fail(file, where, "answer needs one entry per left item");
          if (q.answer.some((a) => a >= q.right.length)) fail(file, where, "answer index past the last right item");
          out.left = q.left.map(mdi);
          out.right = q.right.map(mdi);
          break;
        case "blanks":
          out.parts = q.parts.map((p) => ({ ...p, text: mdi(p.text) }));
          break;
        case "select_attributes":
          if (q.answer.some((a) => !q.attributes.includes(a))) fail(file, where, "answer lists an attribute that isn't offered");
          break;
        case "order_steps":
          out.items = q.items.map(mdi);
          break;
        case "predict_table": {
          if (!q.dataset) fail(file, where, "predict_table needs a dataset");
          else if (!!q.ra === !!q.sql) fail(file, where, "predict_table needs exactly one of ra or sql");
          else {
            try {
              const r = q.ra ? await evalRA(q.ra, q.dataset) : await evalSQL(q.sql!, q.dataset);
              if (!r.rows.length) fail(file, where, "the expression returns no rows, which makes a confusing fill-in question");
              out.expected = { [q.dataset]: r };
            } catch (e) {
              fail(file, where, `Expression failed: ${(e as Error).message}`);
            }
          }
          break;
        }
        case "query_shape": {
          if (!q.dataset) {
            fail(file, where, "query_shape needs a dataset");
            break;
          }
          if (!!q.ra === !!q.sql) {
            fail(file, where, "query_shape needs exactly one of ra or sql");
            break;
          }
          try {
            const query = (q.sql ?? q.ra)!;
            const r = q.sql ? await evalSQL(q.sql, q.dataset) : await evalRA(q.ra!, q.dataset);
            const b = buildShape(q.id, r, q.distractors, q.answerIsNone);
            b.problems.forEach((m) => fail(file, where, m));
            out.type = "mcq";
            out.options = b.options;
            out.answer = b.answer;
            out.prompt = md(q.prompt) + codeBlock(query);
            out.explanation = shapeExplanation(r, q.answerIsNone) + md(q.explanation);
            out.tags = [...new Set([...q.tags, "query-shape", q.sql ? "query-shape-sql" : "query-shape-ra"])];
          } catch (e) {
            fail(file, where, `Query failed: ${(e as Error).message}`);
          }
          break;
        }
        case "query_choices": {
          if (!q.dataset) {
            fail(file, where, "query_choices needs a dataset");
            break;
          }
          const targets = [q.dataset, ...alternatesOf(q.dataset)];
          const run = (src: string, id: string) => (q.lang === "ra" ? evalRA(src, id) : evalSQL(src, id));
          const want: Record<string, TableData> = {};
          try {
            for (const id of targets) want[id] = await run(q.reference, id);
          } catch (e) {
            fail(file, where, `Reference query failed: ${(e as Error).message}`);
            break;
          }
          const mode = q.lang === "ra" ? "set" : q.compare;
          const judged = [];
          for (const c of q.candidates) {
            const cr: CandidateRun = { results: {} };
            for (const id of targets) {
              try {
                cr.results[id] = await run(c.query, id);
              } catch (e) {
                cr.results[id] = { error: (e as Error).message };
              }
            }
            judged.push({ ...c, verdict: judgeCandidate(cr, want, q.dataset, mode, q.lang) });
          }
          const b = buildChoices(q.id, judged, { multi: q.multi, noneOption: q.noneOption });
          b.problems.forEach((m) => fail(file, where, m));
          const nCorrect = Array.isArray(b.answer) ? b.answer.length : 1;
          out.type = q.multi ? "multi" : "mcq";
          out.options = b.options;
          out.answer = b.answer;
          out.prompt = md(q.prompt) + (q.multi ? `<p class="select-count">Select ${nCorrect} correct answer${nCorrect === 1 ? "" : "s"}</p>` : "");
          out.explanation = choicesExplanation(judged, b.order, b.noneIndex, want[q.dataset]!, mdi) + md(q.explanation);
          out.tags = [...new Set([...q.tags, "query-choices", `query-choices-${q.lang}`])];
          break;
        }
        case "ra":
        case "sql": {
          if (!q.dataset) {
            fail(file, where, `${q.type} questions need a dataset`);
            break;
          }
          const targets = [q.dataset, ...new Set([...alternatesOf(q.dataset), ...q.alsoCheck])];
          out.expected = {};
          for (const id of targets) {
            if (!datasets.has(id)) {
              fail(file, where, `alsoCheck: unknown dataset ${id}`);
              continue;
            }
            try {
              out.expected[id] = q.type === "ra" ? await evalRA(q.reference, id) : await evalSQL(q.reference, id);
            } catch (e) {
              fail(file, where, `Reference answer failed on ${id}: ${(e as Error).message}`);
            }
          }
          const main = out.expected[q.dataset];
          if (main && !main.rows.length) fail(file, where, "the reference answer returns no rows on the lecture dataset");
          break;
        }
      }
      search.push({ id: q.id, kind: "Question", week: week.number, title: text(out.prompt).slice(0, 140), text: text(out.explanation), href: `#/quiz?q=${q.id}` });
      questionsOut.push(out);
    }

    nCards += cardsOut.length;
    nEx += examplesOut.length;
    nQ += questionsOut.length;
    search.push({ id: `week-${week.number}`, kind: "Notes", week: week.number, title: `Week ${week.number}: ${week.title}`, text: text(notesHtml), href: `#/week/${week.number}` });

    const typeCounts: Record<string, number> = {};
    for (const q of questionsOut) typeCounts[q.type] = (typeCounts[q.type] ?? 0) + 1;
    weekMeta.push({
      ...week,
      counts: { flashcards: cardsOut.length, examples: examplesOut.length, questions: questionsOut.length, byType: typeCounts },
    });
    weeksOut[week.number] = { week, notes: notesHtml, flashcards: cardsOut, examples: examplesOut, questions: questionsOut };
  }

  // each week's quiz format must be a one-week quiz blueprint
  for (const w of weekMeta as { number: number; quizFormat: string }[]) {
    const bp = blueprints.find((b) => b.id === w.quizFormat);
    if (!bp) fail(`weeks/week-${String(w.number).padStart(2, "0")}/week.yaml`, "quizFormat", `No quiz blueprint called ${w.quizFormat} in content/quizzes/`);
    else if (bp.covers !== "one_week") fail(`weeks/week-${String(w.number).padStart(2, "0")}/week.yaml`, "quizFormat", `${w.quizFormat} isn't a one-week quiz format`);
  }

  // a week that teaches SQL must be quizzed with query-reading questions (degree/cardinality, valid/equivalent queries)
  for (const w of weekMeta as { number: number; quizFormat: string; topics: string[] }[]) {
    if (!w.topics.some((t) => t.startsWith("sql."))) continue;
    const bp = blueprints.find((b) => b.id === w.quizFormat);
    const tags = new Set(bp?.slots.flatMap((sl) => sl.requireTags) ?? []);
    const hasShape = [...tags].some((t) => t.startsWith("query-shape"));
    const hasChoices = [...tags].some((t) => t.startsWith("query-choices"));
    if (bp && (!hasShape || !hasChoices)) {
      fail(
        `weeks/week-${String(w.number).padStart(2, "0")}/week.yaml`,
        "quizFormat",
        `This week covers SQL, but its quiz format (${bp.id}) has no slots for degree/cardinality and valid/equivalent-query questions. Use in-class-sql, or a format with requireTags for query-shape and query-choices.`,
      );
    }
  }

  // blueprints reference real types
  const knownTypes = new Set(["mcq", "multi", "true_false", "numeric", "short", "matching", "blanks", "select_attributes", "order_steps", "predict_table", "ra", "sql"]);
  for (const b of blueprints) for (const s of b.slots) for (const t of s.types) if (!knownTypes.has(t)) fail(`blueprint ${b.id}`, "slots", `Unknown question type ${t}`);

  await pg.close();

  if (problems.length) return { problems };

  const datasetsOut = [...datasets.values()].map((d) => ({ ...d, relax: toRelax(d, d.title) }));
  const manifest = {
    generatedAt: new Date().toISOString(),
    course,
    topics,
    weeks: (weekMeta as { number: number }[]).sort((a, b) => a.number - b.number),
    datasets: datasetsOut.map((d) => ({ id: d.id, title: d.title, description: d.description, source: d.source, hidden: d.hidden, tables: d.tables.map((t) => t.name) })),
    blueprints,
  };
  return {
    problems,
    out: {
      manifest,
      weeks: weeksOut,
      datasets: datasetsOut,
      search,
      stats: { weeks: weekMeta.length, flashcards: nCards, examples: nEx, questions: nQ, datasets: datasets.size },
    },
  };
}

export function printProblems(problems: Problem[]) {
  const byFile = new Map<string, Problem[]>();
  for (const p of problems) byFile.set(p.file, [...(byFile.get(p.file) ?? []), p]);
  for (const [file, ps] of byFile) {
    console.error(`\n  ${file}`);
    for (const p of ps) console.error(`    ✗ ${p.where}: ${p.message}`);
  }
  console.error(`\n${problems.length} problem(s) found.\n`);
}

/** Write compiled content as JSON files into outDir/data. */
export async function writeData(out: Compiled, outDir: string) {
  const d = outDir + "/data/";
  await Bun.write(d + "manifest.json", JSON.stringify(out.manifest));
  await Bun.write(d + "datasets.json", JSON.stringify(out.datasets));
  await Bun.write(d + "search.json", JSON.stringify(out.search));
  for (const [n, w] of Object.entries(out.weeks)) await Bun.write(d + `week-${String(n).padStart(2, "0")}.json`, JSON.stringify(w));
}
