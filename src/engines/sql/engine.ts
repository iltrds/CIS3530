/**
 * Postgres (PGlite) wrapper shared by the browser and the Bun validator.
 * Every dataset lives in its own schema; student queries run inside a
 * transaction that is always rolled back, so nothing can damage the data.
 */
import type { PGlite } from "@electric-sql/pglite";
import { schemaName, toSql, type DatasetLike } from "../datasets.ts";
import type { Value } from "../ra/ra.ts";

export interface SqlResult {
  cols: string[];
  rows: Value[][];
  /** Message for statements that return no rows (e.g. UPDATE 2). */
  command?: string;
}

export class SqlEngine {
  private loaded = new Map<string, Promise<void>>();
  constructor(
    private db: PGlite,
    private getDataset: (id: string) => DatasetLike | Promise<DatasetLike>,
  ) {}

  ensure(id: string): Promise<void> {
    let p = this.loaded.get(id);
    if (!p) {
      p = (async () => {
        const ds = await this.getDataset(id);
        await this.db.exec(toSql(ds));
      })();
      this.loaded.set(id, p);
      p.catch(() => this.loaded.delete(id));
    }
    return p;
  }

  /** Reload a dataset from scratch (used by the playground's reset button). */
  async reset(id: string) {
    this.loaded.delete(id);
    await this.ensure(id);
  }

  /**
   * Runs SQL against a dataset. With `keep: false` (the default) the work is
   * rolled back afterwards; the playground passes `keep: true` so INSERT/UPDATE
   * practice sticks until reset.
   */
  async run(id: string, sql: string, opts: { keep?: boolean } = {}): Promise<SqlResult> {
    await this.ensure(id);
    const schema = schemaName(id);
    const exec = async (tx: Pick<PGlite, "exec">) => {
      await tx.exec(`SET LOCAL search_path TO ${schema}`);
      const results = await tx.exec(sql, { rowMode: "array" });
      const withRows = [...results].reverse().find((r) => r.fields.length > 0);
      if (withRows) return toResult(withRows);
      const last = results[results.length - 1];
      return { cols: [], rows: [], command: last ? `${last.affectedRows ?? 0} row(s) affected` : "Done" };
    };
    let out: SqlResult | undefined;
    await this.db.transaction(async (tx) => {
      out = await exec(tx);
      if (!opts.keep) await tx.rollback();
    });
    return out!;
  }
}

function toResult(r: { fields: { name: string }[]; rows: unknown[] }): SqlResult {
  const cols = r.fields.map((f) => f.name);
  // array row mode keeps duplicate column names (SELECT * FROM S, SP has two sno columns)
  const rows = r.rows.map((row) => (row as unknown[]).map(normalize));
  return { cols, rows };
}

function normalize(v: unknown): Value {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

/** Postgres error text, trimmed of noise, for showing to a student. */
export function sqlErrorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^error:\s*/i, "");
}
