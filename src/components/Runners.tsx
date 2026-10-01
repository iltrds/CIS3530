import { useEffect, useMemo, useRef, useState } from "react";
import type { CQuestion, Grade } from "../engines/grading.ts";
import { isAnswered } from "../engines/grading.ts";
import { Html } from "./Relations.tsx";
import { Feedback, Hints, initialAnswer, QuestionContext, QuestionInput, type Answer } from "./Question.tsx";
import { grade } from "../lib/grade.ts";
import { recordAttempt, recordRun } from "../lib/store.ts";
import { TYPE_LABELS, type QuizItem } from "../lib/quiz.ts";
import { onSqlStatus, sqlStatus, sqlErrorReason } from "../lib/sql.ts";
import type { Manifest } from "../lib/data.ts";
import { topicLabel } from "../lib/data.ts";

function SqlLoading() {
  const [s, set] = useState(sqlStatus());
  useEffect(() => onSqlStatus(set), []);
  if (s === "loading") return <p className="small muted">Starting Postgres in your browser (first time only, a few seconds)…</p>;
  if (s === "error" || window.__SQL_UNAVAILABLE__) return <p className="small note warn">{window.__SQL_UNAVAILABLE__ ?? sqlErrorReason()}</p>;
  return null;
}

function QHead({ n, item, m }: { n?: number; item: QuizItem; m?: Manifest }) {
  const q = item.q;
  return (
    <div className="q-head">
      <div className="q-num">{n !== undefined ? `Question ${n}` : TYPE_LABELS[q.type]}</div>
      <div className="q-meta">
        {n !== undefined && <>{TYPE_LABELS[q.type]} · </>}
        Week {q.week}
        {m && <> · {q.topics.map((t) => topicLabel(m, t)).join(", ")}</>} · {item.points} point{item.points === 1 ? "" : "s"}
      </div>
    </div>
  );
}

/** One question at a time with instant checking: the practice mode. */
export function PracticeSession({ items, m, onExit, title }: { items: QuizItem[]; m: Manifest; onExit: () => void; title: string }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>(() => items.map((it) => initialAnswer(it.q)));
  const [grades, setGrades] = useState<(Grade | undefined)[]>(() => items.map(() => undefined));
  const [busy, setBusy] = useState(false);
  const item = items[i];
  const done = grades.filter(Boolean).length;
  const score = grades.reduce((s, g) => s + (g?.score ?? 0), 0);

  if (!item) return null;
  const q = item.q;
  const g = grades[i];

  const check = async () => {
    setBusy(true);
    const r = await grade(q, answers[i], false);
    setBusy(false);
    // a query that errors isn't recorded as an attempt: let the student fix syntax first
    if (!r.correct && (q.type === "ra" || q.type === "sql") && !r.got && !r.failedOn) {
      setGrades((gs) => gs.map((x, k) => (k === i ? { ...r, score: 0 } : x)));
      return;
    }
    setGrades((gs) => gs.map((x, k) => (k === i ? r : x)));
    recordAttempt({ qid: q.id, week: q.week, topics: q.topics, score: r.score, mode: "practice" });
  };
  const queryError = g && !g.correct && (q.type === "ra" || q.type === "sql") && !g.got && !g.failedOn;
  const locked = !!g && !queryError;

  return (
    <div>
      <div className="quiz-bar">
        <div>
          <strong>{title}</strong>
          <div className="small muted">
            {i + 1} of {items.length} · {done} checked · {Math.round(score * 10) / 10} right
          </div>
        </div>
        <button className="btn small" onClick={onExit}>
          End practice
        </button>
      </div>
      <article className="q" aria-labelledby="qp">
        <QHead item={item} m={m} />
        <div id="qp">
          <Html className="q-prompt" html={q.prompt} />
        </div>
        <QuestionContext q={q} />
        <QuestionInput
          q={q}
          value={answers[i]}
          onChange={(v) => {
            setAnswers((as) => as.map((x, k) => (k === i ? v : x)));
            if (queryError) setGrades((gs) => gs.map((x, k) => (k === i ? undefined : x)));
          }}
          review={locked ? g : undefined}
          showAnswer
          onRun={check}
        />
        {(q.type === "sql" || q.type === "ra") && <SqlLoading />}
        {queryError && <div className="feedback wrong" role="alert"><div className="feedback-title">That didn't run</div><p>{g!.feedback}</p></div>}
        {!locked && <Hints hints={q.hints} />}
        {locked && <Feedback q={q} grade={g!} />}
        <div className="row" style={{ marginTop: 16 }}>
          {!locked && (
            <button className="btn primary" onClick={check} disabled={busy || !isAnswered(q, answers[i])}>
              {busy ? "Checking…" : "Check answer"}
            </button>
          )}
          {locked && i < items.length - 1 && (
            <button className="btn primary" onClick={() => setI(i + 1)} autoFocus>
              Next question
            </button>
          )}
          {locked && i === items.length - 1 && (
            <button className="btn primary" onClick={onExit}>
              Finish ({Math.round(score * 10) / 10} of {items.length} right)
            </button>
          )}
          {!locked && i < items.length - 1 && (
            <button className="btn ghost" onClick={() => setI(i + 1)}>
              Skip
            </button>
          )}
          {i > 0 && (
            <button className="btn ghost" onClick={() => setI(i - 1)}>
              Previous
            </button>
          )}
        </div>
      </article>
    </div>
  );
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * All questions on one page with a timer and a single submit, like CourseLink.
 * Results show per-question points, marks and explanations.
 */
export function TestRunner({
  items,
  m,
  title,
  timeLimitMin,
  strict,
  runId,
  blueprint,
  weeks,
  mode,
  onExit,
}: {
  mode: "quiz" | "exam";
  items: QuizItem[];
  m: Manifest;
  title: string;
  timeLimitMin?: number;
  strict: boolean;
  runId: string;
  blueprint: string;
  weeks: number[];
  onExit: () => void;
}) {
  const [answers, setAnswers] = useState<Answer[]>(() => items.map((it) => initialAnswer(it.q)));
  const [grades, setGrades] = useState<Grade[] | null>(null);
  const [grading, setGrading] = useState(false);
  const [left, setLeft] = useState(timeLimitMin ? timeLimitMin * 60 : 0);
  const [untimed, setUntimed] = useState(!timeLimitMin);
  const submitted = useRef(false);
  const total = items.reduce((s, it) => s + it.points, 0);
  const hasQuery = items.some((it) => it.q.type === "sql" || it.q.type === "ra");

  const submit = async () => {
    if (submitted.current) return;
    submitted.current = true;
    setGrading(true);
    const gs: Grade[] = [];
    for (const [k, it] of items.entries()) {
      try {
        gs.push(await grade(it.q, answers[k], strict));
      } catch (e) {
        gs.push({ score: 0, correct: false, feedback: (e as Error).message });
      }
    }
    const perTopic: Record<string, { score: number; outOf: number }> = {};
    items.forEach((it, k) => {
      recordAttempt({ qid: it.q.id, week: it.q.week, topics: it.q.topics, score: gs[k]!.score, mode });
      for (const t of it.q.topics) {
        const p = (perTopic[t] ??= { score: 0, outOf: 0 });
        p.score += gs[k]!.score * it.points;
        p.outOf += it.points;
      }
    });
    const score = items.reduce((s, it, k) => s + gs[k]!.score * it.points, 0);
    recordRun({ id: runId, blueprint, title, score, outOf: total, weeks, perTopic });
    setGrades(gs);
    setGrading(false);
    scrollTo(0, 0);
  };

  useEffect(() => {
    if (untimed || grades) return;
    const t = setInterval(() => setLeft((x) => x - 1), 1000);
    return () => clearInterval(t);
  }, [untimed, grades]);
  useEffect(() => {
    if (!untimed && left <= 0 && !submitted.current) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, untimed]);

  const answered = items.filter((it, k) => isAnswered(it.q, answers[k])).length;
  const score = grades ? items.reduce((s, it, k) => s + grades[k]!.score * it.points, 0) : 0;
  const rounded = (x: number) => Math.round(x * 100) / 100;

  // per-topic summary for results
  const topicRows = useMemo(() => {
    if (!grades) return [];
    const agg: Record<string, { s: number; o: number }> = {};
    items.forEach((it, k) => {
      for (const t of it.q.topics) {
        const a = (agg[t] ??= { s: 0, o: 0 });
        a.s += grades[k]!.score * it.points;
        a.o += it.points;
      }
    });
    return Object.entries(agg).sort((a, b) => a[1].s / a[1].o - b[1].s / b[1].o);
  }, [grades, items]);

  let lastSection: string | undefined;
  return (
    <div>
      <div className="quiz-bar">
        <div>
          <strong>{title}</strong>
          <div className="small muted">
            {grades ? "Submitted" : `${answered} of ${items.length} answered · ${rounded(total)} points`}
          </div>
        </div>
        <div className="row">
          {!grades && !untimed && (
            <span className={"timer" + (left < 60 ? " low" : "")} role="timer" aria-label="Time left">
              {fmt(Math.max(0, left))}
            </span>
          )}
          {!grades && timeLimitMin && (
            <button className="btn small ghost" onClick={() => setUntimed(!untimed)}>
              {untimed ? "Use timer" : "Turn off timer"}
            </button>
          )}
          {!grades && (
            <button className="btn primary" onClick={submit} disabled={grading}>
              {grading ? "Marking…" : "Submit"}
            </button>
          )}
          {grades && (
            <button className="btn" onClick={onExit}>
              Done
            </button>
          )}
        </div>
      </div>

      {grades && (
        <section className="panel" aria-labelledby="res" style={{ marginBottom: 24 }}>
          <h2 id="res" style={{ marginTop: 0 }} className="sr-only">
            Results
          </h2>
          <div className="row" style={{ alignItems: "flex-end", gap: 24 }}>
            <div>
              <div className="score-big">
                {rounded(score)} / {rounded(total)}
              </div>
              <div className="muted">{Math.round((score / total) * 100)}%</div>
            </div>
            <div className="stack" style={{ flex: 1, minWidth: 240, gap: 6 }}>
              {topicRows.map(([t, a]) => (
                <div key={t} className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                  <span className="small">{topicLabel(m, t)}</span>
                  <span className="row" style={{ flexWrap: "nowrap" }}>
                    <span className={"bar" + (a.s / a.o < 0.6 ? " low" : "")} style={{ width: 90 }}>
                      <span style={{ width: `${(a.s / a.o) * 100}%` }} />
                    </span>
                    <span className="small muted" style={{ width: 70, textAlign: "right" }}>
                      {rounded(a.s)}/{rounded(a.o)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 16, marginBottom: 0 }}>
            Questions you got wrong are now in your mistakes queue on the Quizzes page.
          </p>
        </section>
      )}

      {!grades && hasQuery && <SqlLoading />}
      {items.map((it, k) => {
        const g = grades?.[k];
        const header = it.section && it.section !== lastSection ? it.section : undefined;
        lastSection = it.section;
        return (
          <div key={it.q.id}>
            {header && items.some((x) => x.section !== items[0]!.section) && <h2>{header}</h2>}
            <article className="q" aria-labelledby={`q${k}`}>
              <div className="q-head">
                <div className="q-num" id={`q${k}`}>
                  Question {k + 1}
                </div>
                <div className="q-meta">
                  {g ? (
                    <span className={"result-mark " + (g.correct ? "right" : "wrong")}>
                      {rounded(g.score * it.points)} / {it.points} point{it.points === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <>
                      {it.points} point{it.points === 1 ? "" : "s"}
                    </>
                  )}
                </div>
              </div>
              <Html className="q-prompt" html={it.q.prompt} />
              <QuestionContext q={it.q} />
              <QuestionInput q={it.q} value={answers[k]} onChange={(v) => setAnswers((as) => as.map((x, j) => (j === k ? v : x)))} review={g} showAnswer />
              {g && <Feedback q={it.q} grade={g} />}
            </article>
          </div>
        );
      })}
      {!grades && (
        <div className="row" style={{ padding: "24px 0" }}>
          <button className="btn primary" onClick={submit} disabled={grading}>
            {grading ? "Marking…" : `Submit ${answered < items.length ? `(${items.length - answered} unanswered)` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
