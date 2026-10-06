import { useMemo, useState } from "react";
import type { Ctx } from "../App.tsx";
import { PracticeSession, TestRunner } from "../components/Runners.tsx";
import { assemble, build, newSeed, TYPE_LABELS, type QuizItem } from "../lib/quiz.ts";
import { href, navigate } from "../lib/router.ts";
import { useProgress } from "../lib/store.ts";
import { topicLabel } from "../lib/data.ts";

const list = (s: string | null) => (s ? s.split(",").filter(Boolean) : []);

export function QuizPage({ ctx, path, query }: { ctx: Ctx; path: string[]; query: URLSearchParams }) {
  if (path[0] === "run") return <QuizRun ctx={ctx} query={query} key={query.toString()} />;
  if (query.get("q")) return <QuizRun ctx={ctx} query={new URLSearchParams({ mode: "single", q: query.get("q")! })} key={query.get("q")} />;
  return <QuizHub ctx={ctx} />;
}

function QuizRun({ ctx, query }: { ctx: Ctx; query: URLSearchParams }) {
  const pool = useMemo(() => ctx.weeks.flatMap((w) => w.questions), [ctx.weeks]);
  const progress = useProgress();
  const [seed] = useState(() => Number(query.get("seed")) || newSeed());
  const [runId] = useState(() => `run-${Date.now()}`);
  const exit = () => navigate("#/quiz");

  // freeze the set of questions when the run starts
  const setup = useMemo(() => {
    const bpId = query.get("bp");
    if (bpId) {
      const bp = ctx.m.blueprints.find((b) => b.id === bpId);
      if (!bp) return { error: `No quiz called ${bpId}.` };
      const week = Number(query.get("week")) || ctx.m.weeks[ctx.m.weeks.length - 1]!.number;
      const { items, shortfalls } = assemble(bp, pool.filter((q) => q.week === week), seed);
      return { kind: "test" as const, items, shortfalls, title: `${bp.title}: Week ${week}`, bp, weeks: [week] };
    }
    const mode = query.get("mode") ?? "practice";
    if (mode === "single") {
      const q = pool.find((x) => x.id === query.get("q"));
      return q ? { kind: "practice" as const, items: [{ q, points: q.points }], title: "Practice question" } : { error: "That question no longer exists." };
    }
    if (mode === "mistakes") {
      const items: QuizItem[] = pool.filter((q) => progress.mistakes[q.id]).map((q) => ({ q, points: q.points }));
      return { kind: "practice" as const, items, title: "Redo your mistakes" };
    }
    const settings = {
      weeks: list(query.get("weeks")).map(Number),
      topics: list(query.get("topics")),
      types: list(query.get("types")),
      difficulty: list(query.get("difficulty")).map(Number),
      count: Number(query.get("count")) || 10,
    };
    const items = build(pool, settings, seed);
    const title = settings.topics.length === 1 ? topicLabel(ctx.m, settings.topics[0]!) : settings.weeks.length === 1 ? `Week ${settings.weeks[0]} practice` : "Practice";
    return { kind: mode === "test" ? ("test" as const) : ("practice" as const), items, title, timed: Number(query.get("time")) || undefined };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if ("error" in setup) return <p className="error">{setup.error}</p>;
  if (!setup.items.length)
    return (
      <div>
        <h1>No questions match</h1>
        <p>{query.get("mode") === "mistakes" ? "Your mistakes queue is empty. Nice." : "Try fewer filters."}</p>
        <a className="btn" href="#/quiz">
          Back to quizzes
        </a>
      </div>
    );

  if (setup.kind === "practice") return <PracticeSession items={setup.items} m={ctx.m} title={setup.title} onExit={exit} />;
  const bp = "bp" in setup ? setup.bp : undefined;
  return (
    <div>
      {"shortfalls" in setup && setup.shortfalls!.length > 0 && (
        <p className="note">This week doesn't have enough questions for every slot yet ({setup.shortfalls!.join("; ")}), so the quiz is shorter than usual.</p>
      )}
      {bp && (
        <p className="small muted no-print">{bp.description}</p>
      )}
      <TestRunner
        items={setup.items}
        m={ctx.m}
        title={setup.title}
        timeLimitMin={bp?.timeLimitMin ?? ("timed" in setup ? setup.timed : undefined)}
        strict={bp?.strictAnswers ?? false}
        runId={runId}
        blueprint={bp?.id ?? "custom"}
        weeks={"weeks" in setup ? setup.weeks! : [...new Set(setup.items.map((i) => i.q.week))]}
        mode="quiz"
        onExit={exit}
      />
    </div>
  );
}

function QuizHub({ ctx }: { ctx: Ctx }) {
  const { m } = ctx;
  const p = useProgress();
  const latest = m.weeks[m.weeks.length - 1]!.number;
  const [simWeek, setSimWeek] = useState(latest);
  const formats = m.blueprints.filter((b) => b.kind === "quiz" && b.covers === "one_week");
  const weekFormat = (n: number) => m.weeks.find((w) => w.number === n)?.quizFormat ?? "in-class";
  const [simFormat, setSimFormat] = useState(weekFormat(latest));
  const fmt = formats.find((b) => b.id === simFormat) ?? formats[0]!;
  const [weeks, setWeeks] = useState<number[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [mode, setMode] = useState<"practice" | "test">("practice");
  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  const pool = ctx.weeks.flatMap((w) => w.questions);
  const available = pool.filter(
    (q) => (!weeks.length || weeks.includes(q.week)) && (!topics.length || q.topics.some((t) => topics.includes(t))) && (!types.length || types.includes(q.type)),
  ).length;
  const mistakeIds = Object.keys(p.mistakes).filter((id) => pool.some((q) => q.id === id));
  const allTypes = [...new Set(pool.map((q) => q.type))];
  const shownTopics = m.topics.filter((t) => !weeks.length || weeks.includes(t.week));
  const runs = [...p.runs].reverse().slice(0, 8);

  return (
    <div>
      <div className="page-head">
        <h1>Quizzes</h1>
        <p>Practise one question at a time with instant feedback, or take a timed quiz that's marked at the end.</p>
      </div>

      <section className="panel" aria-labelledby="sim">
        <h2 id="sim" style={{ marginTop: 0 }}>
          In-class quiz simulator
        </h2>
        <p className="muted">
          A timed quiz on one week in the same format as the in-class quizzes. Each week opens in the format its own quiz used; you can switch.
        </p>
        <div className="stack">
          <div className="chips" role="group" aria-label="Week to quiz on">
            {m.weeks.map((w) => (
              <button
                key={w.number}
                className="chip"
                aria-pressed={simWeek === w.number}
                onClick={() => {
                  setSimWeek(w.number);
                  setSimFormat(weekFormat(w.number));
                }}
              >
                Week {w.number}
              </button>
            ))}
          </div>
          {formats.length > 1 && (
            <div className="chips" role="group" aria-label="Quiz format">
              {formats.map((b) => (
                <button key={b.id} className="chip" aria-pressed={fmt.id === b.id} onClick={() => setSimFormat(b.id)}>
                  {b.label ?? b.title}
                  {weekFormat(simWeek) === b.id ? " (this week's)" : ""}
                </button>
              ))}
            </div>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            {fmt.description}
          </p>
          <div>
            <a className="btn primary" href={href("/quiz/run", { bp: fmt.id, week: simWeek })}>
              Start Week {simWeek} quiz
            </a>
          </div>
        </div>
      </section>

      <section className="panel" aria-labelledby="redo">
        <h2 id="redo" style={{ marginTop: 0 }}>
          Mistakes to redo
        </h2>
        {mistakeIds.length ? (
          <>
            <p className="muted">
              {mistakeIds.length} question{mistakeIds.length === 1 ? "" : "s"} you got wrong. Each leaves the queue after you get it right twice in a row.
            </p>
            <a className="btn primary" href={href("/quiz/run", { mode: "mistakes" })}>
              Redo {mistakeIds.length} question{mistakeIds.length === 1 ? "" : "s"}
            </a>
          </>
        ) : (
          <p className="muted" style={{ marginBottom: 0 }}>
            Nothing to redo. Questions you get wrong anywhere on the site collect here.
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="build">
        <h2 id="build" style={{ marginTop: 0 }}>
          Build a quiz
        </h2>
        <div className="stack">
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small muted" style={{ marginBottom: 6 }}>
              Weeks (none selected = all)
            </legend>
            <div className="chips">
              {m.weeks.map((w) => (
                <button key={w.number} className="chip" aria-pressed={weeks.includes(w.number)} onClick={() => setWeeks(toggle(weeks, w.number))}>
                  Week {w.number}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small muted" style={{ marginBottom: 6 }}>
              Topics
            </legend>
            <div className="chips">
              {shownTopics.map((t) => (
                <button key={t.id} className="chip" aria-pressed={topics.includes(t.id)} onClick={() => setTopics(toggle(topics, t.id))}>
                  {t.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small muted" style={{ marginBottom: 6 }}>
              Question types
            </legend>
            <div className="chips">
              {allTypes.map((t) => (
                <button key={t} className="chip" aria-pressed={types.includes(t)} onClick={() => setTypes(toggle(types, t))}>
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="row">
            <label className="row" style={{ gap: 6 }}>
              <span className="small muted">Questions</span>
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[5, 10, 15, 20, 30].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <div className="chips" role="group" aria-label="Mode">
              <button className="chip" aria-pressed={mode === "practice"} onClick={() => setMode("practice")}>
                One at a time, instant feedback
              </button>
              <button className="chip" aria-pressed={mode === "test"} onClick={() => setMode("test")}>
                All at once, marked at the end
              </button>
            </div>
          </div>
          <div className="row">
            <a
              className={"btn primary" + (available ? "" : " disabled")}
              aria-disabled={!available}
              href={
                available
                  ? href("/quiz/run", {
                      mode,
                      weeks: weeks.join(","),
                      topics: topics.join(","),
                      types: types.join(","),
                      count,
                      time: mode === "test" ? Math.max(5, count * 2) : undefined,
                    })
                  : undefined
              }
            >
              Start
            </a>
            <span className="small muted">
              {available} matching question{available === 1 ? "" : "s"}
              {available < count && available > 0 ? ` (you'll get all ${available})` : ""}
            </span>
          </div>
        </div>
      </section>

      {runs.length > 0 && (
        <section aria-labelledby="recent">
          <h2 id="recent">Recent quizzes and exams</h2>
          <div className="list-rule">
            {runs.map((r) => (
              <div key={r.id} className="row" style={{ justifyContent: "space-between", padding: "10px 0" }}>
                <span>{r.title}</span>
                <span className="small muted">
                  {Math.round(r.score * 100) / 100} / {r.outOf} · {new Date(r.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
