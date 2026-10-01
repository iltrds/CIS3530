import { useEffect, useState } from "react";
import type { CQuestion, Grade } from "../engines/grading.ts";
import { Html, DataTable, DatasetTable, SchemaDiagram } from "./Relations.tsx";
import { QueryEditor } from "./QueryEditor.tsx";
import { loadDataset, useAsync } from "../lib/data.ts";
import { rng, shuffle } from "../lib/quiz.ts";

export type Answer = unknown;

export function initialAnswer(q: CQuestion): Answer {
  switch (q.type) {
    case "multi":
    case "select_attributes":
      return [];
    case "matching":
      return q.left!.map(() => null);
    case "blanks":
      return q.parts!.map(() => "");
    case "order_steps": {
      const idx = q.items!.map((_, i) => i);
      let s = 1;
      for (const ch of q.id) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
      let out = shuffle(idx, rng(s));
      if (out.every((x, i) => x === i)) out = [...out.slice(1), out[0]!];
      return out;
    }
    case "predict_table": {
      const cols = Object.values(q.expected ?? {})[0]?.cols.length ?? 1;
      return [Array(cols).fill(""), Array(cols).fill("")];
    }
    case "numeric":
    case "short":
    case "ra":
    case "sql":
      return "";
  }
  return undefined;
}

/** Diagram and instance tables that a question refers to. */
export function QuestionContext({ q }: { q: CQuestion }) {
  const { data: ds } = useAsync(() => (q.dataset ? loadDataset(q.dataset) : Promise.resolve(undefined)), [q.dataset]);
  if (!ds || (!q.show.diagram && !q.show.tables.length)) return null;
  return (
    <div className="q-context">
      {q.show.diagram && <SchemaDiagram ds={ds} />}
      {q.show.tables.length > 0 && (
        <div className="tables">
          {q.show.tables.map((t) => (
            <DatasetTable key={t} ds={ds} table={t} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The answer control for every question type. `review` switches it to a
 * read-only view that marks right and wrong parts.
 */
export function QuestionInput({
  q,
  value,
  onChange,
  review,
  showAnswer,
  onRun,
}: {
  q: CQuestion;
  value: Answer;
  onChange: (v: Answer) => void;
  review?: Grade;
  showAnswer?: boolean;
  onRun?: () => void;
}) {
  const done = !!review;
  const name = `q-${q.id}`;

  switch (q.type) {
    case "mcq":
    case "true_false": {
      const opts = q.type === "mcq" ? q.options! : ["True", "False"];
      const correctIdx = q.type === "mcq" ? (q.answer as number) : q.answer ? 0 : 1;
      const cur = q.type === "mcq" ? (value as number | undefined) : value === undefined ? undefined : value ? 0 : 1;
      return (
        <div className="options" role="radiogroup" aria-label="Choices">
          {opts.map((o, i) => {
            const cls = done ? (i === correctIdx && (cur === i || showAnswer) ? "opt-right" : i === cur ? "opt-wrong" : "") : "";
            return (
              <label key={i} className={"check " + cls}>
                <input type="radio" name={name} checked={cur === i} disabled={done} onChange={() => onChange(q.type === "mcq" ? i : i === 0)} />
                <span>
                  {done && showAnswer && i === correctIdx && cur !== i && <span className="sr-only">Correct answer: </span>}
                  <Html as="span" html={o} />
                  {done && i === correctIdx && showAnswer && cur !== i && <span className="muted small"> ← correct answer</span>}
                </span>
              </label>
            );
          })}
        </div>
      );
    }
    case "multi": {
      const cur = new Set((value as number[]) ?? []);
      const want = new Set(q.answer as number[]);
      return (
        <div className="options">
          {q.options!.map((o, i) => {
            const cls = done ? (cur.has(i) ? (want.has(i) ? "opt-right" : "opt-wrong") : want.has(i) && showAnswer ? "opt-missed" : "") : "";
            return (
              <label key={i} className={"check " + cls}>
                <input
                  type="checkbox"
                  checked={cur.has(i)}
                  disabled={done}
                  onChange={(e) => {
                    const n = new Set(cur);
                    e.target.checked ? n.add(i) : n.delete(i);
                    onChange([...n].sort());
                  }}
                />
                <Html as="span" html={o} />
              </label>
            );
          })}
          {done && showAnswer && <div className="small muted">Dashed outline: a correct choice you didn't select.</div>}
        </div>
      );
    }
    case "numeric":
    case "short":
      return (
        <div className="row">
          <input
            type="text"
            inputMode={q.type === "numeric" ? "decimal" : undefined}
            aria-label="Your answer"
            value={value as string}
            disabled={done}
            onChange={(e) => onChange(e.target.value)}
            className={done ? (review!.correct ? "is-right" : "is-wrong") : undefined}
            style={{ width: q.type === "numeric" ? "8rem" : "18rem" }}
          />
          {done && !review!.correct && showAnswer && <span className="muted">Answer: {q.type === "numeric" ? String(q.answer) : q.answers![0]}</span>}
        </div>
      );
    case "matching": {
      const cur = (value as (number | null)[]) ?? [];
      const want = q.answer as number[];
      return (
        <div className="match-grid">
          {q.left!.map((l, i) => (
            <MatchRow
              key={i}
              left={l}
              right={q.right!}
              value={cur[i] ?? null}
              disabled={done}
              state={done ? (cur[i] === want[i] ? "right" : "wrong") : undefined}
              correct={done && showAnswer && cur[i] !== want[i] ? q.right![want[i]!] : undefined}
              onChange={(v) => {
                const n = [...cur];
                n[i] = v;
                onChange(n);
              }}
            />
          ))}
        </div>
      );
    }
    case "blanks": {
      const cur = (value as string[]) ?? [];
      return (
        <div>
          {q.parts!.map((p, i) => (
            <div className="blank-part" key={i}>
              <span className="muted">{i + 1}.</span>
              <Html as="span" html={p.text} />
              <span>
                <input
                  type="text"
                  aria-label={`Answer for statement ${i + 1}`}
                  value={cur[i] ?? ""}
                  disabled={done}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className={done ? (review!.parts?.[i] ? "is-right" : "is-wrong") : undefined}
                  onChange={(e) => {
                    const n = [...cur];
                    n[i] = e.target.value;
                    onChange(n);
                  }}
                />
                {done && !review!.parts?.[i] && showAnswer && <span className="small muted"> {p.answer}</span>}
              </span>
            </div>
          ))}
        </div>
      );
    }
    case "select_attributes": {
      const cur = new Set((value as string[]) ?? []);
      const want = new Set(q.answer as string[]);
      return (
        <div className="attr-pick" role="group" aria-label="Attributes">
          {q.attributes!.map((a) => {
            const on = cur.has(a);
            const style = done ? (on === want.has(a) ? undefined : { outline: `2px solid var(${on ? "--bad" : "--good"})` }) : undefined;
            return (
              <button
                type="button"
                key={a}
                className="chip"
                aria-pressed={on}
                disabled={done}
                style={style}
                onClick={() => {
                  const n = new Set(cur);
                  on ? n.delete(a) : n.add(a);
                  onChange([...n]);
                }}
              >
                {a}
              </button>
            );
          })}
          {done && showAnswer && !review!.correct && <span className="small muted">Answer: {(q.answer as string[]).join(", ")}</span>}
        </div>
      );
    }
    case "order_steps": {
      const cur = (value as number[]) ?? [];
      const move = (i: number, d: number) => {
        const j = i + d;
        if (j < 0 || j >= cur.length) return;
        const n = [...cur];
        [n[i], n[j]] = [n[j]!, n[i]!];
        onChange(n);
      };
      return (
        <ol className="order-list">
          {cur.map((itemIdx, i) => (
            <li key={itemIdx} className={done ? (itemIdx === i ? "is-right" : "is-wrong") : undefined}>
              <span className="muted">{i + 1}.</span>
              <Html as="span" className="grow" html={q.items![itemIdx]!} />
              {!done && (
                <>
                  <button type="button" className="btn small ghost" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                    ↑
                  </button>
                  <button type="button" className="btn small ghost" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === cur.length - 1}>
                    ↓
                  </button>
                </>
              )}
            </li>
          ))}
        </ol>
      );
    }
    case "predict_table": {
      const exp = Object.values(q.expected ?? {})[0];
      const cur = (value as string[][]) ?? [];
      return (
        <div className="stack">
          {q.ra && <pre>{q.ra}</pre>}
          {q.sql && <pre>{q.sql}</pre>}
          <table className="grid-input">
            <thead>
              <tr>{exp?.cols.map((c, i) => <th key={i}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {cur.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>
                      <input
                        type="text"
                        aria-label={`Row ${i + 1}, ${exp?.cols[j]}`}
                        value={c}
                        disabled={done}
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        onChange={(e) => {
                          const n = cur.map((x) => [...x]);
                          n[i]![j] = e.target.value;
                          onChange(n);
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!done && (
            <div className="row">
              <button type="button" className="btn small" onClick={() => onChange([...cur, Array(exp?.cols.length ?? 1).fill("")])}>
                Add row
              </button>
              {cur.length > 1 && (
                <button type="button" className="btn small ghost" onClick={() => onChange(cur.slice(0, -1))}>
                  Remove last row
                </button>
              )}
              <span className="small muted">Leave extra rows blank. Write null for a missing value.</span>
            </div>
          )}
          {done && showAnswer && exp && !review!.correct && <DataTable data={exp} caption="expected result" />}
        </div>
      );
    }
    case "ra":
    case "sql":
      return (
        <div className="stack">
          <QueryEditor lang={q.type} value={value as string} onChange={(v) => onChange(v)} disabled={done} label="Your query" onRun={onRun} />
          {review?.got && <DataTable data={review.got} caption="your result" />}
          {done && showAnswer && !review!.correct && (
            <div className="stack">
              <div>
                <div className="small muted">One correct answer:</div>
                <pre>{q.reference}</pre>
              </div>
              {q.dataset && q.expected?.[q.dataset] && <DataTable data={q.expected[q.dataset]!} caption="expected result" />}
            </div>
          )}
        </div>
      );
  }
  return null;
}

function MatchRow({
  left,
  right,
  value,
  onChange,
  disabled,
  state,
  correct,
}: {
  left: string;
  right: string[];
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
  state?: "right" | "wrong";
  correct?: string;
}) {
  const [id] = useState(() => "m" + Math.random().toString(36).slice(2));
  return (
    <>
      <label htmlFor={id}>
        <Html as="span" html={left} />
      </label>
      <div>
        <select
          id={id}
          value={value ?? ""}
          disabled={disabled}
          className={state === "right" ? "is-right" : state === "wrong" ? "is-wrong" : undefined}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          style={{ width: "100%" }}
        >
          <option value="">Choose…</option>
          {right.map((r, i) => (
            <option key={i} value={i}>
              {r.replace(/<[^>]+>/g, "")}
            </option>
          ))}
        </select>
        {correct && <div className="small muted">Answer: {correct.replace(/<[^>]+>/g, "")}</div>}
      </div>
    </>
  );
}

/** Feedback block after checking an answer. */
export function Feedback({ q, grade }: { q: CQuestion; grade: Grade }) {
  const cls = grade.correct ? "right" : grade.score > 0 ? "partial" : "wrong";
  const title = grade.correct ? "Correct" : grade.score > 0 ? `Partly right (${Math.round(grade.score * 100)}%)` : "Not quite";
  return (
    <div className={`feedback ${cls}`} role="status">
      <div className="feedback-title">{title}</div>
      {grade.feedback && <p>{grade.feedback}</p>}
      {q.explanation && <Html className="explanation" html={q.explanation} />}
    </div>
  );
}

/** Reveal hints one at a time. */
export function Hints({ hints, disabled }: { hints: string[]; disabled?: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => setN(0), [hints]);
  if (!hints.length) return null;
  return (
    <div className="stack" style={{ gap: 6 }}>
      {hints.slice(0, n).map((h, i) => (
        <div className="note" key={i}>
          <strong>Hint {i + 1}.</strong> <Html as="span" html={h} />
        </div>
      ))}
      {n < hints.length && !disabled && (
        <div>
          <button type="button" className="btn small ghost" onClick={() => setN(n + 1)}>
            {n === 0 ? "Show a hint" : "Show another hint"}
          </button>
        </div>
      )}
    </div>
  );
}
