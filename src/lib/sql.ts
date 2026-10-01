/**
 * Loads PGlite on first use. The deployed site serves it from ./vendor/pglite/;
 * a build can point elsewhere by setting window.__PGLITE_URL__ in index.html.
 */
import { SqlEngine } from "../engines/sql/engine.ts";
import { loadDataset } from "./data.ts";

declare global {
  interface Window {
    __PGLITE_URL__?: string;
    /** When set, SQL is unavailable and this explains why (the single-file preview). */
    __SQL_UNAVAILABLE__?: string;
  }
}

let reason = "Postgres couldn't start in this browser. Try reloading the page.";
export const sqlErrorReason = () => reason;

let engine: Promise<SqlEngine> | undefined;
const listeners = new Set<(s: SqlStatus) => void>();
export type SqlStatus = "idle" | "loading" | "ready" | "error";
let status: SqlStatus = "idle";

function setStatus(s: SqlStatus) {
  status = s;
  listeners.forEach((f) => f(s));
}
export const sqlStatus = () => status;
export function onSqlStatus(f: (s: SqlStatus) => void): () => void {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

export function getSql(): Promise<SqlEngine> {
  if (!engine) {
    setStatus("loading");
    engine = (async () => {
      if (window.__SQL_UNAVAILABLE__) {
        reason = window.__SQL_UNAVAILABLE__;
        throw new Error(reason);
      }
      const url = window.__PGLITE_URL__ ?? new URL("./vendor/pglite/index.js", location.href).href;
      const mod = (await import(/* @vite-ignore */ url)) as typeof import("@electric-sql/pglite");
      const db = await mod.PGlite.create();
      const e = new SqlEngine(db, loadDataset);
      setStatus("ready");
      return e;
    })();
    engine.catch(() => {
      engine = undefined;
      setStatus("error");
    });
  }
  return engine;
}
