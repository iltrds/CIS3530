import { useMemo, useState } from "react";
import type { Ctx } from "../App.tsx";
import { TestRunner } from "../components/Runners.tsx";
import { Html } from "../components/Relations.tsx";
import { QuestionContext } from "../components/Question.tsx";
import { answerText, assemble, newSeed, TYPE_LABELS } from "../lib/quiz.ts";
import { href, navigate } from "../lib/router.ts";

export function ExamsPage({ ctx, path, query }: { ctx: Ctx; path: string[]; query: URLSearchParams }) {
  const exams = ctx.m.blueprints.filter((b) => b.kind === "exam");
  if (path[0] === "run" || path[0] === "print") {
    const bp = exams.find((b) => b.id === query.get("id"));
    if (!bp) return <p className="error">No exam called {query.get("id")}.</p>;
    return path[0] === "run" ? <ExamRun ctx={ctx} id={bp.id} seed={Number(query.get("seed")) || undefined} /> : <ExamPrint ctx={ctx} id={bp.id} seed={Number(query.get("seed")) || newSeed()} />;
  }
  const pool = ctx.weeks.flatMap((w) => w.questions);
  return (
    <div>
      <div className="page-head">
        <h1>Practice exams</h1>
        <p>
          Each attempt draws a fresh set of questions from every published week, so exams grow as weeks are added. Answers are marked when you submit. The printable version has an answer key on its last pages, for practising on paper like the real exam.
        </p>
      </div>
      {exams.map((bp) => {
        const planned = bp.slots.reduce((s, x) => s + x.count, 0);
        const avail = bp.slots.reduce((s, x) => s + Math.min(x.count, pool.filter((q) => x.types.includes(q.type)).length), 0);
        return (
          <section className="panel" key={bp.id} aria-labelledby={bp.id}>
            <h2 id={bp.id} style={{ marginTop: 0 }}>
              {bp.title}
            </h2>
            <p className="muted">{bp.description}</p>
            <ul className="small">
              {bp.slots.map((s, i) => (
                <li key={i}>
                  {s.name ?? s.types.map((t) => TYPE_LABELS[t]).join(", ")}: {s.count} question{s.count === 1 ? "" : "s"}
                </li>
              ))}
            </ul>
            <p className="small muted">
              {bp.timeLimitMin} minutes · {avail < planned ? `${avail} of ${planned} questions available so far` : `${planned} questions`}
            </p>
            <div className="row">
              <a className="btn primary" href={href("/exams/run", { id: bp.id })}>
                Start
              </a>
              <a className="btn" href={href("/exams/print", { id: bp.id })}>
                {window.__PREVIEW__ ? "Paper version with answer key" : "Printable version"}
              </a>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ExamRun({ ctx, id, seed: s }: { ctx: Ctx; id: string; seed?: number }) {
  const [seed] = useState(() => s ?? newSeed());
  const [runId] = useState(() => `exam-${Date.now()}`);
  const bp = ctx.m.blueprints.find((b) => b.id === id)!;
  const { items } = useMemo(() => assemble(bp, ctx.weeks.flatMap((w) => w.questions), seed), [bp, ctx.weeks, seed]);
  return (
    <TestRunner
      items={items}
      m={ctx.m}
      title={bp.title}
      timeLimitMin={bp.timeLimitMin}
      strict={bp.strictAnswers}
      runId={runId}
      blueprint={bp.id}
      weeks={ctx.m.weeks.map((w) => w.number)}
      mode="exam"
      onExit={() => navigate("#/exams")}
    />
  );
}

function ExamPrint({ ctx, id, seed }: { ctx: Ctx; id: string; seed: number }) {
  const bp = ctx.m.blueprints.find((b) => b.id === id)!;
  const { items } = useMemo(() => assemble(bp, ctx.weeks.flatMap((w) => w.questions), seed), [bp, ctx.weeks, seed]);
  const total = items.reduce((s, i) => s + i.points, 0);
  const letters = "abcdefghij";
  return (
    <div>
      <div className="row no-print" style={{ marginBottom: 16 }}>
        {!window.__PREVIEW__ && (
          <button className="btn primary" onClick={() => print()}>
            Print
          </button>
        )}
        <a className="btn" href={href("/exams/print", { id, seed: newSeed() })}>
          Different questions
        </a>
        <a className="btn ghost" href="#/exams">
          Back
        </a>
      </div>
      <h1>{bp.title}</h1>
      <p className="muted">
        {items.length} questions · {total} points · {bp.timeLimitMin} minutes · version {seed % 100000}
      </p>
      {items.map((it, k) => (
        <article className="q" key={it.q.id}>
          <div className="q-head">
            <div className="q-num">Question {k + 1}</div>
            <div className="q-meta">
              {TYPE_LABELS[it.q.type]} · {it.points} point{it.points === 1 ? "" : "s"}
            </div>
          </div>
          <Html className="q-prompt" html={it.q.prompt} />
          <QuestionContext q={it.q} />
          {(it.q.type === "mcq" || it.q.type === "multi") && (
            <ol type="a">
              {it.q.options!.map((o, i) => (
                <li key={i}>
                  <Html as="span" html={o} />
                </li>
              ))}
            </ol>
          )}
          {it.q.type === "true_false" && <p>True / False</p>}
          {it.q.type === "matching" && (
            <div className="match-grid">
              {it.q.left!.map((l, i) => (
                <div key={i} style={{ display: "contents" }}>
                  <Html as="span" html={`${i + 1}. ${l}`} />
                  <span>____</span>
                </div>
              ))}
              <div style={{ gridColumn: "1 / -1" }} className="small">
                Options:{" "}
                {it.q.right!.map((r, i) => (
                  <span key={i}>
                    ({letters[i]}) <Html as="span" html={r} />{" "}
                  </span>
                ))}
              </div>
            </div>
          )}
          {it.q.type === "blanks" &&
            it.q.parts!.map((p, i) => (
              <div className="blank-part" key={i}>
                <span>{i + 1}.</span>
                <Html as="span" html={p.text} />
                <span>________</span>
              </div>
            ))}
          {it.q.type === "select_attributes" && <p className="attr-pick">{it.q.attributes!.join(", ")}</p>}
          {it.q.type === "order_steps" && <p>{it.q.items!.map((x) => x.replace(/<[^>]+>/g, "")).join(", ")}</p>}
          {it.q.type === "predict_table" && <pre>{it.q.ra ?? it.q.sql}</pre>}
          {["ra", "sql", "predict_table", "short", "numeric"].includes(it.q.type) && <div className="answer-space print-only" />}
        </article>
      ))}
      <div className="page-break">
        <h2>Answer key</h2>
        {items.map((it, k) => (
          <div key={it.q.id} className="q" style={{ padding: "8px 0" }}>
            <strong>{k + 1}.</strong> <pre style={{ display: "inline-block", margin: "0 0 0 8px", verticalAlign: "top", whiteSpace: "pre-wrap" }}>{answerText(it.q)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
