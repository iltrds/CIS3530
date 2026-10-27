/**
 * Relationship-instance questions ("which of these instances are possible for R and S?").
 *
 * Each candidate lists relationship instances as entity pairs. The build checks every
 * candidate against the ER diagram's structural constraints, so the answer is computed:
 *  - a "1" written next to entity type E on relationship R means each entity on the
 *    other side is related to at most one E through R;
 *  - a double line (total participation) for E means every E entity takes part in R.
 * Candidates are drawn the way the lecture and quizzes draw instance diagrams: an oval
 * per entity set and relationship set, with a line through each relationship instance.
 */
import type { ErDiagram } from "../../src/schema/content.ts";
import { esc } from "./query-questions.ts";

export type Pairs = Record<string, [string, string][]>;

interface RelInfo {
  name: string;
  ends: { entity: string; card?: string; total: boolean }[];
}

export interface InstanceVerdict {
  possible: boolean;
  /** One sentence per broken constraint, or the constraints that hold. */
  reasons: string[];
}

export interface Chain {
  /** Alternating columns: entity, relationship, entity, relationship, entity… */
  columns: { kind: "entity" | "rel"; name: string }[];
}

/** Orders the chosen relationships into a left-to-right chain A–R–B–S–C (the layout instance diagrams use). */
export function chainOf(d: ErDiagram, relNames: string[]): { chain?: Chain; problem?: string } {
  const rels = relNames.map((n) => d.relationships.find((r) => r.name === n));
  if (rels.some((r) => !r)) return { problem: `relationships ${relNames.join(", ")}: not all are in diagram ${d.id}` };
  for (const r of rels) {
    if (r!.ends.length !== 2) return { problem: `${r!.name} isn't binary` };
    if (r!.ends[0]!.entity === r!.ends[1]!.entity) return { problem: `${r!.name} is recursive; instance questions support only relationships between two different entity types` };
  }
  const degree = new Map<string, number>();
  for (const r of rels) for (const e of r!.ends) degree.set(e.entity, (degree.get(e.entity) ?? 0) + 1);
  if ([...degree.values()].some((n) => n > 2)) return { problem: "the relationships must form a chain (no entity type in more than two of them)" };
  const start = [...degree.entries()].find(([, n]) => n === 1)?.[0];
  if (!start) return { problem: "the relationships must form a chain, not a cycle" };
  const columns: Chain["columns"] = [{ kind: "entity", name: start }];
  const left = new Set(relNames);
  let cur = start;
  while (left.size) {
    const r = rels.find((x) => left.has(x!.name) && x!.ends.some((e) => e.entity === cur));
    if (!r) return { problem: "the relationships must be connected" };
    left.delete(r.name);
    const next = r.ends.find((e) => e.entity !== cur)!.entity;
    columns.push({ kind: "rel", name: r.name }, { kind: "entity", name: next });
    cur = next;
  }
  return { chain: { columns } };
}

/** Checks one candidate against the diagram. Authoring mistakes go to `problems`. */
export function judgeInstance(d: ErDiagram, relNames: string[], sets: Record<string, string[]>, pairs: Pairs, problems: string[]): InstanceVerdict {
  const broken: string[] = [];
  const holds: string[] = [];
  for (const name of Object.keys(pairs)) if (!relNames.includes(name)) problems.push(`instances for ${name}, which isn't one of the question's relationships`);
  for (const rn of relNames) {
    const r = d.relationships.find((x) => x.name === rn)! as RelInfo;
    const list = pairs[rn] ?? [];
    const [e0, e1] = r.ends as [RelInfo["ends"][0], RelInfo["ends"][0]];
    const seen = new Set<string>();
    for (const [x, y] of list) {
      if (!sets[e0.entity]?.includes(x)) problems.push(`${rn} instance (${x}, ${y}): ${x} isn't in the set for ${e0.entity}`);
      if (!sets[e1.entity]?.includes(y)) problems.push(`${rn} instance (${x}, ${y}): ${y} isn't in the set for ${e1.entity}`);
      const k = `${x}|${y}`;
      if (seen.has(k)) problems.push(`${rn} lists (${x}, ${y}) twice`);
      seen.add(k);
    }
    for (const [k, end] of [r.ends[0]!, r.ends[1]!].entries()) {
      const other = r.ends[1 - k]!;
      if (end.card === "1") {
        let ok = true;
        for (const y of sets[other.entity] ?? []) {
          const xs = [...new Set(list.filter((p) => p[1 - k] === y).map((p) => p[k]))];
          if (xs.length > 1) {
            ok = false;
            broken.push(`${y} is related to ${xs.join(" and ")} through ${rn}, but the 1 next to ${end.entity} allows each ${other.entity} at most one ${end.entity}.`);
          }
        }
        if (ok) holds.push(`each ${other.entity} has at most one ${end.entity} in ${rn}`);
      }
      if (end.total) {
        const missing = (sets[end.entity] ?? []).filter((x) => !list.some((p) => p[k] === x));
        if (missing.length) broken.push(`${missing.join(" and ")} ${missing.length > 1 ? "take" : "takes"} part in no ${rn} instance, but ${end.entity}'s participation in ${rn} is total (double line).`);
        else holds.push(`every ${end.entity} takes part in ${rn}`);
      }
    }
  }
  if (broken.length) return { possible: false, reasons: broken };
  return { possible: true, reasons: [holds.length ? `Possible: ${holds.join("; ")}. Nothing else is restricted.` : "Possible: the diagram puts no restriction on these relationships."] };
}

const COL = 118;
const ROW = 36;

/** Draws one candidate as an instance diagram (static SVG). */
export function instanceSvg(d: ErDiagram, chain: Chain, sets: Record<string, string[]>, pairs: Pairs, label: string): string {
  const cols = chain.columns.map((c) => {
    if (c.kind === "entity") return { ...c, items: sets[c.name] ?? [] };
    const prefix = c.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 2) || "r";
    return { ...c, items: (pairs[c.name] ?? []).map((_, i) => `${prefix}${i + 1}`) };
  });
  const rows = Math.max(2, ...cols.map((c) => c.items.length));
  const top = 30;
  const h = top + rows * ROW + 24;
  const w = 40 + (cols.length - 1) * COL + 40;
  const cx = (i: number) => 40 + i * COL;
  const cy = top + (rows * ROW) / 2 + 6;
  const yOf = (i: number, j: number) => cy - ((cols[i]!.items.length - 1) * ROW) / 2 + j * ROW;
  const out: string[] = [];
  cols.forEach((c, i) => {
    out.push(`<ellipse class="inst-set" cx="${cx(i)}" cy="${cy}" rx="34" ry="${(rows * ROW) / 2 + 8}"/>`);
    out.push(`<text class="inst-head" x="${cx(i)}" y="16" text-anchor="middle">${esc(c.name)}</text>`);
  });
  // lines first, labels on top (with a background so the line stops short of the text)
  const lines: string[] = [];
  cols.forEach((c, i) => {
    if (c.kind !== "rel") return;
    const r = d.relationships.find((x) => x.name === c.name)!;
    const leftCol = cols[i - 1]!, rightCol = cols[i + 1]!;
    (pairs[c.name] ?? []).forEach((p, j) => {
      const byEntity: Record<string, string> = { [r.ends[0]!.entity]: p[0], [r.ends[1]!.entity]: p[1] };
      const l = leftCol.items.indexOf(byEntity[leftCol.name]!);
      const rr = rightCol.items.indexOf(byEntity[rightCol.name]!);
      const ry = yOf(i, j);
      if (l >= 0) lines.push(`<line class="inst-line" x1="${cx(i - 1) + 14}" y1="${yOf(i - 1, l)}" x2="${cx(i) - 12}" y2="${ry}"/>`);
      if (rr >= 0) lines.push(`<line class="inst-line" x1="${cx(i) + 12}" y1="${ry}" x2="${cx(i + 1) - 14}" y2="${yOf(i + 1, rr)}"/>`);
    });
  });
  out.push(...lines);
  cols.forEach((c, i) =>
    c.items.forEach((it, j) => out.push(`<text class="inst-item" x="${cx(i)}" y="${yOf(i, j)}" dy="0.35em" text-anchor="middle">${esc(it)}</text>`)),
  );
  const desc = cols
    .filter((c) => c.kind === "rel")
    .map((c) => {
      const r = d.relationships.find((x) => x.name === c.name)!;
      const ps = pairs[c.name] ?? [];
      return `${c.name}: ${ps.length ? ps.map((p) => `${p[0]} with ${p[1]}`).join(", ") : `no instances`} (${r.ends[0]!.entity}, ${r.ends[1]!.entity})`;
    })
    .join("; ");
  const sizes = cols.filter((c) => c.kind === "entity").map((c) => `${c.name}: ${c.items.join(", ") || "none"}`).join("; ");
  return (
    `<span class="inst-choice">` +
    `<svg class="inst-svg" viewBox="0 0 ${w} ${h}" width="${w}" role="img" aria-label="${esc(`${label}. Entities ${sizes}. ${desc}.`)}" xmlns="http://www.w3.org/2000/svg">${out.join("")}</svg></span>`
  );
}
