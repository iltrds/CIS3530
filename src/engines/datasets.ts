/** Turns a dataset definition into RA relations and Postgres DDL. Shared by build and browser. */
import type { Env, Value } from "./ra/ra.ts";

export interface DatasetLike {
  id: string;
  tables: {
    name: string;
    columns: { name: string; type: string; pk: boolean; notNull: boolean }[];
    foreignKeys: { columns: string[]; references: { table: string; columns: string[] } }[];
    unique: string[][];
    rows: Value[][];
  }[];
}

export function toEnv(ds: DatasetLike): Env {
  const env: Env = {};
  for (const t of ds.tables) {
    env[t.name] = { attrs: t.columns.map((c) => ({ name: c.name, rel: t.name, type: c.type })), rows: t.rows.map((r) => [...r]) };
  }
  return env;
}

/** Postgres schema name for a dataset id (movies-v1 -> ds_movies_v1). */
export const schemaName = (id: string) => "ds_" + id.replace(/-/g, "_");

const sqlType = (t: string) => (t === "int" ? "integer" : t === "numeric" ? "numeric(10,2)" : t === "date" ? "date" : "text");

function lit(v: Value): string {
  if (v === null) return "NULL";
  if (typeof v === "number") return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

/**
 * DDL + data for one dataset inside its own schema. Tables are created with
 * unquoted names, so queries can use any capitalisation, as in the labs.
 * Foreign keys are added after the data so circular references (dept ↔ prof) load.
 */
export function toSql(ds: DatasetLike, opts: { withForeignKeys?: boolean } = {}): string {
  const s = schemaName(ds.id);
  const out: string[] = [`DROP SCHEMA IF EXISTS ${s} CASCADE;`, `CREATE SCHEMA ${s};`, `SET search_path TO ${s};`];
  for (const t of ds.tables) {
    const cols = t.columns.map((c) => `  ${c.name} ${sqlType(c.type)}${c.notNull ? " NOT NULL" : ""}`);
    const pk = t.columns.filter((c) => c.pk).map((c) => c.name);
    if (pk.length) cols.push(`  PRIMARY KEY (${pk.join(", ")})`);
    for (const u of t.unique) cols.push(`  UNIQUE (${u.join(", ")})`);
    out.push(`CREATE TABLE ${t.name} (\n${cols.join(",\n")}\n);`);
    if (t.rows.length) {
      out.push(`INSERT INTO ${t.name} VALUES\n${t.rows.map((r) => "  (" + r.map(lit).join(", ") + ")").join(",\n")};`);
    }
  }
  if (opts.withForeignKeys !== false) {
    for (const t of ds.tables) {
      t.foreignKeys.forEach((fk, i) => {
        out.push(
          `ALTER TABLE ${t.name} ADD CONSTRAINT ${t.name}_fk${i + 1} FOREIGN KEY (${fk.columns.join(", ")}) REFERENCES ${fk.references.table} (${fk.references.columns.join(", ")});`,
        );
      });
    }
  }
  return out.join("\n");
}

/** RelaX-calculator dataset text, so any dataset can be pasted into the instructor's calculator. */
export function toRelax(ds: DatasetLike, title: string): string {
  const lines = [`group: ${title}`, ""];
  for (const t of ds.tables) {
    const header = t.columns.map((c) => `${c.name}:${c.type === "int" || c.type === "numeric" ? "number" : "string"}`).join(", ");
    lines.push(`${t.name} = {`, header);
    for (const r of t.rows) lines.push(r.map((v) => (v === null ? "null" : typeof v === "number" ? String(v) : `'${v}'`)).join(", "));
    lines.push("}", "");
  }
  return lines.join("\n");
}
