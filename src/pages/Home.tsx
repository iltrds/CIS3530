import type { Ctx } from "../App.tsx";
import { dueQueue, topicStats, useProgress } from "../lib/store.ts";
import { href } from "../lib/router.ts";
import { topicLabel } from "../lib/data.ts";

const DAY = 86400000;

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function relDays(d: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const n = Math.round((d.getTime() - today.getTime()) / DAY);
  return n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
}

export function Home({ ctx }: { ctx: Ctx }) {
  const { m, weeks } = ctx;
  const p = useProgress();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = m.course.events
    .map((e) => ({ ...e, d: new Date(e.date + "T00:00:00") }))
    .filter((e) => e.d >= today)
    .sort((a, b) => a.d.getTime() - b.d.getTime());
  const nextQuiz = upcoming.find((e) => e.kind === "quiz");
  const latest = m.weeks[m.weeks.length - 1]!;
  const quizWeek = nextQuiz?.covers[0] ?? latest.number;
  const quizWeekMeta = m.weeks.find((w) => w.number === quizWeek) ?? latest;
  const quizFormat = quizWeekMeta.quizFormat;

  const allCards = weeks.flatMap((w) => w.flashcards);
  const due = dueQueue(allCards).length;
  const mistakes = Object.keys(p.mistakes).length;
  const stats = topicStats(p);
  const weakest = Object.entries(stats)
    .filter(([, s]) => s.attempts >= 2)
    .sort((a, b) => a[1].accuracy - b[1].accuracy)
    .slice(0, 4);
  const lastRun = [...p.runs].pop();

  return (
    <div>
      <section className="hero" aria-labelledby="next">
        {nextQuiz ? (
          <>
            <div className="hero-kicker">
              Next in-class quiz, {fmtDate(nextQuiz.d)} ({relDays(nextQuiz.d)})
            </div>
            <h1 className="hero-title" id="next">
              Covers <span className="key">Week {quizWeek}</span>: {quizWeekMeta.title}
            </h1>
          </>
        ) : (
          <>
            <div className="hero-kicker">Latest week</div>
            <h1 className="hero-title" id="next">
              <span className="key">Week {quizWeek}</span>: {quizWeekMeta.title}
            </h1>
          </>
        )}
        {nextQuiz?.note && <p className="muted">{nextQuiz.note}</p>}
        <div className="row" style={{ marginTop: 16 }}>
          <a className="btn primary" href={href("/quiz/run", { bp: quizFormat, week: quizWeek })}>
            Take a practice quiz
          </a>
          <a className="btn" href={href("/flashcards", { week: quizWeek })}>
            Review Week {quizWeek} cards
          </a>
          <a className="btn ghost" href={`#/week/${quizWeek}`}>
            Read the notes
          </a>
        </div>
      </section>

      <div className="stats">
        <div>
          <div className="stat-label">Flash cards due</div>
          <div className="stat-num">{due}</div>
          <a href="#/flashcards">{due ? "Review now" : "Browse all cards"}</a>
        </div>
        <div>
          <div className="stat-label">Questions to redo</div>
          <div className="stat-num">{mistakes}</div>
          {mistakes ? <a href={href("/quiz/run", { mode: "mistakes" })}>Redo them</a> : <span className="small muted">Wrong answers land here.</span>}
        </div>
        <div>
          <div className="stat-label">Last practice quiz</div>
          <div className="stat-num">{lastRun ? `${Math.round((lastRun.score / lastRun.outOf) * 100)}%` : "–"}</div>
          {lastRun ? <a href="#/quiz">See recent quizzes</a> : <a href={href("/quiz/run", { bp: quizFormat, week: quizWeek })}>Take one</a>}
        </div>
      </div>

      {weakest.length > 0 && (
        <section aria-labelledby="weak">
          <h2 id="weak">Weakest topics</h2>
          <div className="list-rule">
            {weakest.map(([t, s]) => (
              <div key={t} className="row" style={{ justifyContent: "space-between", padding: "10px 0" }}>
                <span>{topicLabel(m, t)}</span>
                <span className="row">
                  <span className="small muted">{Math.round(s.accuracy * 100)}%</span>
                  <a className="btn small" href={href("/quiz/run", { mode: "practice", topics: t, count: 8 })}>
                    Practise
                  </a>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="weeks">
        <h2 id="weeks">Weeks</h2>
        <div className="week-list list-rule">
          {m.weeks.map((w) => (
            <a key={w.number} href={`#/week/${w.number}`}>
              <span className="wl-num">Week {w.number}</span>
              <span>
                <span className="wl-title">{w.title}</span>
                <span className="muted small" style={{ display: "block" }}>
                  {w.summary}
                </span>
              </span>
              <span className="wl-meta">
                {w.counts.flashcards} cards · {w.counts.examples} examples · {w.counts.questions} questions
              </span>
            </a>
          ))}
        </div>
      </section>

      {upcoming.length > 0 && (
        <section aria-labelledby="cal">
          <h2 id="cal">Coming up</h2>
          <div className="list-rule">
            {upcoming.slice(0, 5).map((e) => (
              <div key={e.date + e.title} className="row" style={{ justifyContent: "space-between", padding: "10px 0" }}>
                <span>{e.title}</span>
                <span className="muted small">
                  {fmtDate(e.d)} ({relDays(e.d)})
                </span>
              </div>
            ))}
          </div>
          <p className="small muted">Add dates in content/course.yaml as they're announced.</p>
        </section>
      )}
    </div>
  );
}
