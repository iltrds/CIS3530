import { useEffect, useState } from "react";
import type { Ctx } from "../App.tsx";
import { Html, DataTable, SchemaDiagram, DatasetTable } from "../components/Relations.tsx";
import { href } from "../lib/router.ts";
import { loadDatasets, topicLabel, useAsync, type Example } from "../lib/data.ts";

export function WeekPage({ ctx, n, tab }: { ctx: Ctx; n: number; tab: string }) {
  const w = ctx.weeks.find((x) => x.week.number === n);
  if (!w) return <p>There's no Week {n} yet.</p>;
  const tabs: [string, string][] = [
    ["notes", "Notes"],
    ["examples", `Worked examples (${w.examples.length})`],
    ["data", "Datasets"],
  ];
  return (
    <div>
      <div className="page-head">
        <div className="muted">Week {n}</div>
        <h1>{w.week.title}</h1>
        <p>{w.week.summary}</p>
        <div className="row">
          <a className="btn primary" href={href("/flashcards", { week: n })}>
            Flash cards ({w.flashcards.length})
          </a>
          <a className="btn" href={href("/quiz/run", { mode: "practice", weeks: n, count: 10 })}>
            Practise 10 questions
          </a>
          <a className="btn" href={href("/quiz/run", { bp: "in-class", week: n })}>
            Quiz simulator
          </a>
        </div>
      </div>
      <nav className="tabs" aria-label="Week sections">
        {tabs.map(([id, label]) => (
          <a key={id} href={`#/week/${n}/${id}`} aria-current={tab === id ? "page" : undefined}>
            {label}
          </a>
        ))}
      </nav>
      {tab === "notes" && (
        <div>
          <Html className="prose" html={w.notes} />
          {w.week.readings.length > 0 && (
            <p className="muted small" style={{ marginTop: 24 }}>
              Readings: {w.week.readings.join("; ")}
            </p>
          )}
          <div className="chips" style={{ marginTop: 16 }}>
            {w.week.topics.map((t) => (
              <a key={t} className="chip" href={href("/quiz/run", { mode: "practice", topics: t, count: 8 })} title="Practise this topic">
                {topicLabel(ctx.m, t)}
              </a>
            ))}
          </div>
        </div>
      )}
      {tab === "examples" && (
        <div>
          {w.examples.map((ex) => (
            <ExampleView key={ex.id} ex={ex} ctx={ctx} />
          ))}
        </div>
      )}
      {tab === "data" && <WeekDatasets ctx={ctx} n={n} />}
    </div>
  );
}

function ExampleView({ ex, ctx }: { ex: Example; ctx: Ctx }) {
  const [shown, setShown] = useState(1);
  useEffect(() => {
    if (location.hash.endsWith("#" + ex.id)) {
      setShown(ex.steps.length);
      document.getElementById(ex.id)?.scrollIntoView();
    }
  }, [ex.id, ex.steps.length]);
  const all = shown >= ex.steps.length;
  return (
    <article className="example" id={ex.id} aria-labelledby={ex.id + "-t"}>
      <h2 id={ex.id + "-t"} style={{ marginTop: 0 }}>
        {ex.title}
      </h2>
      <div className="small muted" style={{ marginBottom: 8 }}>
        {ex.topics.map((t) => topicLabel(ctx.m, t)).join(", ")}
        {ex.dataset && <> · dataset: {ex.dataset}</>}
      </div>
      <Html className="prose" html={ex.question} />
      <ol className="steps">
        {ex.steps.slice(0, shown).map((st, i) => (
          <li key={i}>
            <Html className="step-title" html={st.title} />
            {st.body && <Html className="prose" html={st.body} />}
            {(st.ra || st.sql) && <pre aria-label={st.ra ? "Relational algebra" : "SQL"}>{st.ra ?? st.sql}</pre>}
            {st.result && <DataTable data={st.result} />}
            {(st.ra || st.sql) && ex.dataset && (
              <div style={{ marginTop: 6 }}>
                <a className="small" href={href("/playground", { ds: ex.dataset, lang: st.ra ? "ra" : "sql", q: st.ra ?? st.sql })}>
                  Try it in the playground
                </a>
              </div>
            )}
          </li>
        ))}
      </ol>
      {!all ? (
        <div className="row">
          <button className="btn" onClick={() => setShown(shown + 1)}>
            Next step
          </button>
          <button className="btn ghost" onClick={() => setShown(ex.steps.length)}>
            Show all steps
          </button>
        </div>
      ) : (
        ex.pitfalls.length > 0 && (
          <div className="note warn pitfalls">
            <strong>Watch out</strong>
            {ex.pitfalls.map((p, i) => (
              <Html key={i} html={p} />
            ))}
          </div>
        )
      )}
    </article>
  );
}

function WeekDatasets({ ctx, n }: { ctx: Ctx; n: number }) {
  const w = ctx.weeks.find((x) => x.week.number === n)!;
  const ids = [...new Set([...w.examples.map((e) => e.dataset), ...w.questions.map((q) => q.dataset)].filter(Boolean))] as string[];
  const { data } = useAsync(loadDatasets, []);
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div>
      {ids
        .map((id) => data.find((d) => d.id === id))
        .filter((d) => d && !d.hidden)
        .map((d) => (
          <section key={d!.id} className="example">
            <h2 style={{ marginTop: 0 }}>{d!.title}</h2>
            <p className="muted">{d!.description}</p>
            {d!.source && <p className="small muted">Source: {d!.source}</p>}
            <SchemaDiagram ds={d!} />
            <div className="tables" style={{ marginTop: 16 }}>
              {d!.tables.map((t) => (
                <DatasetTable key={t.name} ds={d!} table={t.name} />
              ))}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <a className="btn small" href={href("/playground", { ds: d!.id })}>
                Query it in the playground
              </a>
            </div>
          </section>
        ))}
    </div>
  );
}
