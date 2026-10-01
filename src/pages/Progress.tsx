import { useRef, useState } from "react";
import type { Ctx } from "../App.tsx";
import { exportProgress, importProgress, resetProgress, topicStats, useProgress } from "../lib/store.ts";
import { href } from "../lib/router.ts";

export function ProgressPage({ ctx }: { ctx: Ctx }) {
  const { m } = ctx;
  const p = useProgress();
  const stats = topicStats(p);
  const [msg, setMsg] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const cardsTotal = ctx.weeks.reduce((s, w) => s + w.flashcards.length, 0);
  const cardsSeen = Object.keys(p.cards).length;
  const answered = new Set(p.attempts.map((a) => a.qid)).size;
  const qTotal = ctx.weeks.reduce((s, w) => s + w.questions.length, 0);

  const download = async () => {
    if (window.__PREVIEW__) {
      try {
        await navigator.clipboard.writeText(exportProgress());
        setMsg("Progress copied. Paste it into a file to keep it.");
      } catch {
        setMsg("This browser didn't allow copying.");
      }
      return;
    }
    const blob = new Blob([exportProgress()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cis3530-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="page-head">
        <h1>Progress</h1>
        <p>Everything here is stored in this browser only. Export it now and then so clearing your browser data doesn't wipe it.</p>
      </div>
      <div className="stats">
        <div>
          <div className="stat-label">Flash cards seen</div>
          <div className="stat-num">
            {cardsSeen}/{cardsTotal}
          </div>
        </div>
        <div>
          <div className="stat-label">Questions attempted</div>
          <div className="stat-num">
            {answered}/{qTotal}
          </div>
        </div>
        <div>
          <div className="stat-label">Quizzes and exams taken</div>
          <div className="stat-num">{p.runs.length}</div>
        </div>
      </div>

      <h2>By topic</h2>
      {m.weeks.map((w) => (
        <section key={w.number}>
          <h3 style={{ marginTop: 20 }}>
            Week {w.number}: {w.title}
          </h3>
          <div className="list-rule">
            {m.topics
              .filter((t) => t.week === w.number)
              .map((t) => {
                const s = stats[t.id];
                return (
                  <div key={t.id} className="row" style={{ justifyContent: "space-between", padding: "8px 0", flexWrap: "nowrap" }}>
                    <a href={href("/quiz/run", { mode: "practice", topics: t.id, count: 8 })}>{t.label}</a>
                    <span className="row" style={{ flexWrap: "nowrap" }}>
                      {s ? (
                        <>
                          <span className={"bar" + (s.accuracy < 0.6 ? " low" : "")} style={{ width: 100 }}>
                            <span style={{ width: `${s.accuracy * 100}%` }} />
                          </span>
                          <span className="small muted" style={{ width: 110, textAlign: "right" }}>
                            {Math.round(s.accuracy * 100)}% of {s.attempts}
                          </span>
                        </>
                      ) : (
                        <span className="small muted">not tried yet</span>
                      )}
                    </span>
                  </div>
                );
              })}
          </div>
        </section>
      ))}

      {m.course.results.length > 0 && (
        <>
          <h2>In-class results</h2>
          <div className="list-rule">
            {m.course.results.map((r) => (
              <div key={r.title} className="row" style={{ justifyContent: "space-between", padding: "8px 0" }}>
                <span>
                  {r.title} <span className="small muted">({r.date})</span>
                </span>
                <span>
                  {r.score}/{r.outOf}
                  {r.missedTopics.length > 0 && <span className="small muted"> · missed: {r.missedTopics.map((t) => m.topics.find((x) => x.id === t)?.label ?? t).join(", ")}</span>}
                </span>
              </div>
            ))}
          </div>
          <p className="small muted">Add results to content/course.yaml after each quiz.</p>
        </>
      )}

      <h2>Your data</h2>
      <div className="row">
        <button className="btn" onClick={download}>
          {window.__PREVIEW__ ? "Copy progress" : "Export progress"}
        </button>
        <button className="btn" onClick={() => file.current?.click()}>
          Import progress
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              importProgress(await f.text());
              setMsg("Progress imported.");
            } catch (err) {
              setMsg((err as Error).message);
            }
            e.target.value = "";
          }}
        />
        {!confirming && (
          <button className="btn ghost" onClick={() => setConfirming(true)}>
            Erase progress
          </button>
        )}
      </div>
      {confirming && (
        <div className="note warn row" role="alert" style={{ marginTop: 12 }}>
          <span>Erase all flash card history, attempts and quiz results in this browser? Export first if you might want them back.</span>
          <button
            className="btn small"
            onClick={() => {
              resetProgress();
              setConfirming(false);
              setMsg("Progress erased.");
            }}
          >
            Erase everything
          </button>
          <button className="btn small ghost" onClick={() => setConfirming(false)} autoFocus>
            Keep it
          </button>
        </div>
      )}
      {msg && (
        <p className="note" role="status" style={{ marginTop: 12 }}>
          {msg}
        </p>
      )}
    </div>
  );
}
