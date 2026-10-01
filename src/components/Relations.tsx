import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { TableData } from "../engines/grading.ts";
import type { Dataset } from "../lib/data.ts";

/** Renders build-time HTML (our own Markdown output, never user input). */
export function Html({ html, as: Tag = "div", className }: { html: string; as?: "div" | "span"; className?: string }) {
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

const isNum = (v: unknown) => typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v));

/** A relation in the psql style used in lectures. Primary key columns are underlined. */
export function DataTable({ data, name, pk = [], caption }: { data: TableData; name?: string; pk?: string[]; caption?: ReactNode }) {
  const pkSet = new Set(pk.map((x) => x.toLowerCase()));
  return (
    <div className="rel">
      {name && <div className="rel-name">{name}</div>}
      <table className="data">
        <thead>
          <tr>
            {data.cols.map((c, i) => (
              <th key={i} className={pkSet.has(c.toLowerCase()) ? "pk" : undefined} scope="col">
                <span>{c}</span>
                {pkSet.has(c.toLowerCase()) && <span className="sr-only"> (primary key)</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className={v === null ? "null" : isNum(v) ? "num" : undefined}>
                  {v === null ? "null" : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rel-count">
        ({data.rows.length} row{data.rows.length === 1 ? "" : "s"}){caption ? <> · {caption}</> : null}
      </div>
    </div>
  );
}

export function DatasetTable({ ds, table }: { ds: Dataset; table: string }) {
  const t = ds.tables.find((x) => x.name === table);
  if (!t) return null;
  return <DataTable name={t.name} pk={t.columns.filter((c) => c.pk).map((c) => c.name)} data={{ cols: t.columns.map((c) => c.name), rows: t.rows }} />;
}

/**
 * Schema diagram in the course's notation: one relation per line, primary
 * keys underlined, foreign keys drawn as arrows from the referencing
 * attribute to the referenced primary key.
 */
export function SchemaDiagram({ ds, tables }: { ds: Dataset; tables?: string[] }) {
  const shown = ds.tables.filter((t) => !tables || tables.includes(t.name));
  const fks = shown.flatMap((t) =>
    t.foreignKeys
      .filter((fk) => shown.some((s) => s.name === fk.references.table))
      .map((fk) => ({ from: t.name, cols: fk.columns, to: fk.references.table, toCols: fk.references.columns })),
  );
  const gutter = fks.length ? 16 + fks.length * 11 : 0;
  const box = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<{ d: string; head: string }[]>([]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const draw = () => {
      const origin = el.getBoundingClientRect();
      const pos = (table: string, col: string) => {
        const span = el.querySelector<HTMLElement>(`[data-t="${table}"][data-c="${col}"]`);
        if (!span) return undefined;
        const r = span.getBoundingClientRect();
        return { x: r.left - origin.left + el.scrollLeft + Math.min(r.width / 2, 14), y: r.bottom - origin.top + 4 };
      };
      const out: { d: string; head: string }[] = [];
      const ends = fks.map((fk) => ({ a: pos(fk.from, fk.cols[0]!), b: pos(fk.to, fk.toCols[0]!) }));
      // shorter links get the lanes nearest the text, so lines cross less
      const order = ends
        .map((e, i) => ({ i, span: e.a && e.b ? Math.abs(e.a.y - e.b.y) : 0 }))
        .sort((x, y) => x.span - y.span)
        .map((x) => x.i);
      // each horizontal leg runs in the gap under a row; stack legs that share a gap
      const used = new Map<number, number>();
      const legY = (y: number) => {
        const k = Math.round(y);
        const n = used.get(k) ?? 0;
        used.set(k, n + 1);
        return y + 6 + n * 4;
      };
      order.forEach((idx, rank) => {
        const { a, b } = ends[idx]!;
        if (!a || !b) return;
        const x = gutter - 10 - rank * 11;
        const ya = legY(a.y);
        const yb = legY(b.y);
        const r = 4;
        const dir = yb < ya ? -1 : 1;
        const d = [
          `M ${a.x} ${a.y}`,
          `L ${a.x} ${ya - r}`,
          `Q ${a.x} ${ya} ${a.x - r} ${ya}`,
          `L ${x + r} ${ya}`,
          `Q ${x} ${ya} ${x} ${ya + dir * r}`,
          `L ${x} ${yb - dir * r}`,
          `Q ${x} ${yb} ${x + r} ${yb}`,
          `L ${b.x - r} ${yb}`,
          `Q ${b.x} ${yb} ${b.x} ${yb - r}`,
          `L ${b.x} ${b.y + 6}`,
        ].join(" ");
        const head = `M ${b.x} ${b.y} L ${b.x - 4} ${b.y + 7} L ${b.x + 4} ${b.y + 7} Z`;
        out.push({ d, head });
      });
      setPaths(out);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    document.fonts?.ready.then(draw);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds.id, tables?.join()]);

  const fkCols = new Set(fks.flatMap((f) => f.cols.map((c) => `${f.from}.${c}`)));
  return (
    <figure style={{ margin: 0 }}>
      <div className="schema" ref={box} style={{ paddingLeft: gutter }} role="img" aria-label={describeSchema(shown)}>
        {shown.map((t) => (
          <div className="schema-row" key={t.name} aria-hidden="true">
            <span>
            <span className="rn">{t.name}</span>(
            {t.columns.map((c, i) => (
              <span key={c.name}>
                <span className={"attr" + (c.pk ? " pk" : "")} data-t={t.name} data-c={c.name} title={fkCols.has(`${t.name}.${c.name}`) ? "foreign key" : undefined}>
                  {c.name}
                </span>
                {i < t.columns.length - 1 ? ", " : ""}
              </span>
            ))}
            )
            </span>
          </div>
        ))}
        <svg aria-hidden="true">
          {paths.map((p, i) => (
            <g key={i}>
              <path d={p.d} />
              <path className="head" d={p.head} />
            </g>
          ))}
        </svg>
      </div>
      {fks.length > 0 && <figcaption className="schema-legend">Primary keys are underlined. Arrows go from a foreign key to the primary key it references.</figcaption>}
    </figure>
  );
}

function describeSchema(tables: Dataset["tables"]): string {
  return tables
    .map((t) => {
      const pk = t.columns.filter((c) => c.pk).map((c) => c.name);
      const fk = t.foreignKeys.map((f) => `${f.columns.join(", ")} references ${f.references.table}`);
      return `${t.name}(${t.columns.map((c) => c.name).join(", ")}), primary key ${pk.join(", ") || "none"}${fk.length ? "; " + fk.join("; ") : ""}`;
    })
    .join(". ");
}
