import { useEffect, useState } from "react";
import type { Ctx } from "../App.tsx";
import { QueryEditor } from "../components/QueryEditor.tsx";
import { DataTable, SchemaDiagram, DatasetTable } from "../components/Relations.tsx";
import { loadDatasets, useAsync } from "../lib/data.ts";
import { run as runRA, relationToTable, RAError } from "../engines/ra/ra.ts";
import { toEnv } from "../engines/datasets.ts";
import { getSql, onSqlStatus, sqlStatus } from "../lib/sql.ts";
import { sqlErrorMessage } from "../engines/sql/engine.ts";
import type { TableData } from "../engines/grading.ts";
import { href, navigate } from "../lib/router.ts";

type Out = { steps?: { name?: string; text: string; table: TableData }[]; table?: TableData; message?: string; error?: string };

export function Playground({ ctx, query }: { ctx: Ctx; query: URLSearchParams }) {
  const { data: all } = useAsync(loadDatasets, []);
  const visible = (all ?? []).filter((d) => !d.hidden);
  const dsId = query.get("ds") ?? "movies-v1";
  const lang = query.get("lang") === "sql" ? "sql" : "ra";
  const [src, setSrc] = useState(query.get("q") ?? "");
  const [out, setOut] = useState<Out>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(sqlStatus());
  const [copied, setCopied] = useState(false);
  useEffect(() => onSqlStatus(setStatus), []);
  useEffect(() => {
    setSrc(query.get("q") ?? "");
    setOut(undefined);
  }, [query.get("q"), dsId, lang]);

  const ds = visible.find((d) => d.id === dsId);
  const set = (patch: Record<string, string | undefined>) => navigate(href("/playground", { ds: dsId, lang, ...patch }));

  const run = async () => {
    if (!ds || !src.trim()) return;
    setBusy(true);
    try {
      if (lang === "ra") {
        const r = runRA(src, toEnv(ds));
        setOut({
          steps: r.steps.length > 1 ? r.steps.map((s) => ({ name: s.name, text: s.text, table: relationToTable(s.relation) })) : undefined,
          table: relationToTable(r.result),
        });
      } else {
        const eng = await getSql();
        const r = await eng.run(ds.id, src, { keep: true });
        setOut(r.cols.length ? { table: r } : { message: r.command });
      }
    } catch (e) {
      setOut({ error: e instanceof RAError ? e.message : sqlErrorMessage(e) });
    }
    setBusy(false);
  };

  const reset = async () => {
    const eng = await getSql();
    await eng.reset(dsId);
    setOut({ message: "Dataset restored to its original rows." });
  };

  return (
    <div>
      <div className="page-head">
        <h1>Query playground</h1>
        <p>Run relational algebra or SQL (real PostgreSQL, running in your browser) against any course dataset. Nothing you do here is graded.</p>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        <label className="row" style={{ gap: 6 }}>
          <span className="small muted">Dataset</span>
          <select value={dsId} onChange={(e) => set({ ds: e.target.value })}>
            {visible.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
        <div className="tabs" role="tablist" style={{ margin: 0, border: 0 }}>
          <button role="tab" aria-selected={lang === "ra"} onClick={() => set({ lang: "ra" })}>
            Relational algebra
          </button>
          <button role="tab" aria-selected={lang === "sql"} onClick={() => set({ lang: "sql" })}>
            SQL
          </button>
        </div>
      </div>
      {lang === "sql" && window.__SQL_UNAVAILABLE__ && <p className="note warn">{window.__SQL_UNAVAILABLE__}</p>}
      <div className="stack">
        <QueryEditor lang={lang} value={src} onChange={setSrc} onRun={run} rows={5} label={lang === "ra" ? "Relational algebra" : "SQL"} />
        <div className="row">
          <button className="btn primary" onClick={run} disabled={busy || !src.trim()}>
            {busy ? (status === "loading" ? "Starting Postgres…" : "Running…") : "Run"}
          </button>
          {lang === "sql" && status === "ready" && (
            <button className="btn ghost" onClick={reset}>
              Reset this dataset
            </button>
          )}
          {lang === "sql" && <span className="small muted">INSERT, UPDATE and DELETE stick until you reset.</span>}
          {lang === "ra" && <span className="small muted">Use := to build intermediate relations; each one is shown.</span>}
        </div>
        {out?.error && (
          <div className="feedback wrong" role="alert">
            <div className="feedback-title">Error</div>
            {out.error}
          </div>
        )}
        {out?.message && <div className="note">{out.message}</div>}
        {out?.steps?.map((s, i) => (
          <div key={i}>
            <div className="small muted">{s.name ? `${s.name} :=` : "Result"}</div>
            <DataTable data={s.table} />
          </div>
        ))}
        {out?.table && !out.steps && <DataTable data={out.table} />}
      </div>
      {ds && (
        <section style={{ marginTop: 32 }}>
          <h2>{ds.title}</h2>
          <p className="muted">{ds.description}</p>
          <SchemaDiagram ds={ds} />
          <div className="tables" style={{ marginTop: 16 }}>
            {ds.tables.map((t) => (
              <DatasetTable key={t.name} ds={ds} table={t.name} />
            ))}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button
              className="btn small"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(ds.relax);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy dataset for RelaX"}
            </button>
            <a className="small" href="https://dbis-uibk.github.io/relax/" target="_blank" rel="noreferrer">
              Open the RelaX calculator
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
