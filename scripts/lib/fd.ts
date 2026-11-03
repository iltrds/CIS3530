/**
 * Functional dependencies and normal forms, computed at build time so normalization
 * answer keys can't be wrong.
 *
 * Normal forms follow the course's definitions, which are stated relative to the
 * chosen primary key ("a non-prime-key attribute is one that is not part of the
 * primary key"):
 *  - 2NF: every attribute outside the primary key is fully dependent on it
 *    (no part of the key determines it);
 *  - 3NF: 2NF, and no attribute outside the primary key is transitively dependent
 *    on it (determined by something that isn't a superkey);
 *  - BCNF: every determinant is a candidate key (every non-trivial X → A has X a superkey).
 * With these, TEACH(Student, Course, Instructor) is in 3NF if the key is
 * (Student, Course) but not even 2NF if the key is (Student, Instructor), which is
 * the point the lecture makes.
 */

export type Attrs = string[];
export interface FD {
  lhs: Attrs;
  rhs: Attrs;
}

export interface Relation {
  name: string;
  attrs: Attrs;
}

/** "FIRST(S#, P#, STATUS)" → { name, attrs }. */
export function parseRelation(s: string): Relation {
  const m = s.trim().match(/^([^()\s]+)\s*\(([^)]*)\)$/);
  if (!m) throw new Error(`can't read relation "${s}"; write it as NAME(A, B, C)`);
  const attrs = m[2]!.split(",").map((a) => a.trim()).filter(Boolean);
  if (new Set(attrs).size !== attrs.length) throw new Error(`relation ${m[1]} lists an attribute twice`);
  return { name: m[1]!, attrs };
}

const splitAttrs = (s: string) =>
  s
    .replace(/^[\s({]+|[\s)}]+$/g, "")
    .split(/\s*,\s*|\s+/)
    .map((a) => a.trim())
    .filter(Boolean);

/** "S#, P# -> QTY" (or →) → { lhs: [S#, P#], rhs: [QTY] }. */
export function parseFD(s: string): FD {
  const parts = s.split(/->|→/);
  if (parts.length !== 2) throw new Error(`can't read FD "${s}"; write it as A, B -> C`);
  const lhs = splitAttrs(parts[0]!), rhs = splitAttrs(parts[1]!);
  if (!lhs.length || !rhs.length) throw new Error(`FD "${s}" needs attributes on both sides`);
  return { lhs, rhs };
}

export const fmtSet = (xs: Attrs) => (xs.length === 1 ? xs[0]! : `(${xs.join(", ")})`);
export const fmtFD = (f: FD) => `${fmtSet(f.lhs)} → ${f.rhs.join(", ")}`;

export class FDSet {
  constructor(
    readonly rel: Relation,
    readonly fds: FD[],
  ) {
    for (const f of fds) for (const a of [...f.lhs, ...f.rhs]) if (!rel.attrs.includes(a)) throw new Error(`FD ${fmtFD(f)} uses ${a}, which isn't in ${rel.name}`);
  }

  /** Keeps the relation's attribute order. */
  order(xs: Iterable<string>): Attrs {
    const s = new Set(xs);
    return this.rel.attrs.filter((a) => s.has(a));
  }

  closure(xs: Attrs): Attrs {
    const c = new Set(xs);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of this.fds)
        if (f.lhs.every((a) => c.has(a)))
          for (const b of f.rhs)
            if (!c.has(b)) {
              c.add(b);
              grew = true;
            }
    }
    return this.order(c);
  }

  implies(lhs: Attrs, rhs: Attrs): boolean {
    const c = new Set(this.closure(lhs));
    return rhs.every((a) => c.has(a));
  }

  isSuperkey(xs: Attrs): boolean {
    return this.closure(xs).length === this.rel.attrs.length;
  }

  /** Every subset of `xs` (as arrays in relation order), smallest first. */
  subsets(xs: Attrs, proper = false): Attrs[] {
    const out: Attrs[] = [];
    const n = xs.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      if (proper && mask === (1 << n) - 1) continue;
      out.push(xs.filter((_, i) => mask & (1 << i)));
    }
    return out.sort((a, b) => a.length - b.length);
  }

  isCandidateKey(xs: Attrs): boolean {
    return this.isSuperkey(xs) && this.subsets(xs, true).every((s) => !this.isSuperkey(s));
  }

  candidateKeys(): Attrs[] {
    const keys: Attrs[] = [];
    for (const s of this.subsets(this.rel.attrs)) {
      if (keys.some((k) => k.every((a) => s.includes(a)))) continue;
      if (this.isSuperkey(s)) keys.push(s);
    }
    return keys;
  }

  /** Smallest determinants: X → A holds, A ∉ X, and no proper subset of X determines A. */
  minimalDeterminants(): { lhs: Attrs; a: string }[] {
    const out: { lhs: Attrs; a: string }[] = [];
    for (const x of this.subsets(this.rel.attrs)) {
      if (x.length === this.rel.attrs.length) continue;
      for (const a of this.closure(x)) {
        if (x.includes(a)) continue;
        if (out.some((o) => o.a === a && o.lhs.every((b) => x.includes(b)))) continue;
        out.push({ lhs: x, a });
      }
    }
    return out;
  }

  /** The dependencies that break 2NF, 3NF and BCNF for primary key `pk` (minimal determinants only). */
  violations(pk: Attrs) {
    const inKey = new Set(pk);
    const partial: { lhs: Attrs; a: string }[] = [];
    const transitive: { lhs: Attrs; a: string }[] = [];
    const bcnf: { lhs: Attrs; a: string }[] = [];
    for (const d of this.minimalDeterminants()) {
      if (this.isSuperkey(d.lhs)) continue;
      bcnf.push(d);
      if (inKey.has(d.a)) continue; // a key attribute: only BCNF cares
      if (d.lhs.every((b) => inKey.has(b))) partial.push(d);
      else transitive.push(d);
    }
    return { partial, transitive, bcnf };
  }

  /** Highest of 1NF, 2NF, 3NF, BCNF (the relation is assumed to have atomic values). */
  normalForm(pk: Attrs): "1NF" | "2NF" | "3NF" | "BCNF" {
    const v = this.violations(pk);
    if (v.partial.length) return "1NF";
    if (v.transitive.length) return "2NF";
    if (v.bcnf.length) return "3NF";
    return "BCNF";
  }

  /** FDs of this set that hold within `sub` (X → A with X ⊆ sub, A ∈ sub), as minimal determinants. */
  project(sub: Attrs): FD[] {
    const inSub = new Set(sub);
    const out: FD[] = [];
    for (const x of this.subsets(this.order(sub))) {
      const rhs = this.closure(x).filter((a) => inSub.has(a) && !x.includes(a));
      const fresh = rhs.filter((a) => !out.some((f) => f.rhs.includes(a) && f.lhs.every((b) => x.includes(b))));
      if (fresh.length) out.push({ lhs: x, rhs: fresh });
    }
    return out;
  }
}

const ORDER = ["1NF", "2NF", "3NF", "BCNF"] as const;
export type NF = (typeof ORDER)[number];
export const atLeast = (have: NF, want: NF) => ORDER.indexOf(have) >= ORDER.indexOf(want);

/** Lossless test for a binary decomposition (the common attributes are a key of one side). */
export function lossless(F: FDSet, r1: Attrs, r2: Attrs): { ok: boolean; common: Attrs; why: string } {
  const common = F.order(r1.filter((a) => r2.includes(a)));
  if (!common.length) return { ok: false, common, why: "The two relations share no attributes, so joining them gives every combination." };
  const c = new Set(F.closure(common));
  const k1 = r1.every((a) => c.has(a)), k2 = r2.every((a) => c.has(a));
  const name = (xs: Attrs) => `(${xs.join(", ")})`;
  if (k1 || k2)
    return { ok: true, common, why: `The common attribute${common.length > 1 ? "s" : ""} ${fmtSet(common)} ${common.length > 1 ? "are" : "is"} a key of ${name(k1 ? r1 : r2)}, so the join restores the original rows.` };
  return { ok: false, common, why: `The common attribute${common.length > 1 ? "s" : ""} ${fmtSet(common)} ${common.length > 1 ? "are" : "is"} a key of neither side, so the join can create spurious rows.` };
}

/** Is every FD of F implied by the FDs that hold inside the parts? */
export function preserving(F: FDSet, parts: Attrs[]): { ok: boolean; lost: FD[] } {
  const projected = new FDSet(F.rel, parts.flatMap((p) => F.project(p)));
  const lost = F.fds.filter((f) => !projected.implies(f.lhs, f.rhs));
  return { ok: !lost.length, lost };
}

/** Rows (in relation attribute order) that break X → Y, if any. */
export function instanceBreaks(rel: Relation, rows: unknown[][], f: FD): [unknown[], unknown[]] | undefined {
  const idx = (a: string) => rel.attrs.indexOf(a);
  const seen = new Map<string, unknown[]>();
  for (const r of rows) {
    const k = JSON.stringify(f.lhs.map((a) => r[idx(a)]));
    const prev = seen.get(k);
    if (prev && f.rhs.some((a) => JSON.stringify(prev[idx(a)]) !== JSON.stringify(r[idx(a)]))) return [prev, r];
    if (!prev) seen.set(k, r);
  }
  return undefined;
}

// ---------------------------------------------------------------- claims (statements the build decides)

export interface Claim {
  holds?: string;
  trivial?: string;
  full?: string;
  partial?: string;
  transitive?: string;
  key?: Attrs;
  superkey?: Attrs;
  nf?: NF;
  exactNf?: NF;
  lossless?: [Attrs, Attrs];
  preserving?: Attrs[];
  good?: [Attrs, Attrs];
  satisfied?: string;
  insertAnomaly?: Attrs;
  text?: string;
  why?: string;
}

export const CLAIM_KINDS = ["holds", "trivial", "full", "partial", "transitive", "key", "superkey", "nf", "exactNf", "lossless", "preserving", "good", "satisfied", "insertAnomaly"] as const;

export interface Judged {
  value: boolean;
  text: string;
  reason: string;
}

const list = (xs: Attrs) => xs.join(", ");
const nfText: Record<NF, string> = { "1NF": "1NF", "2NF": "2NF", "3NF": "3NF", BCNF: "BCNF" };

export function describeNF(F: FDSet, pk: Attrs): string {
  const v = F.violations(pk);
  const nf = F.normalForm(pk);
  const dep = (d: { lhs: Attrs; a: string }) => `${fmtSet(d.lhs)} → ${d.a}`;
  const parts: string[] = [];
  if (v.partial.length) parts.push(`partial dependencies on the key: ${v.partial.map(dep).join("; ")} (so not 2NF)`);
  if (v.transitive.length) parts.push(`transitive dependencies: ${v.transitive.map(dep).join("; ")}, whose determinant isn't a key${v.partial.length ? "" : " (so not 3NF)"}`);
  const onlyBcnf = v.bcnf.filter((d) => !v.partial.includes(d) && !v.transitive.includes(d));
  if (onlyBcnf.length) parts.push(`${onlyBcnf.map(dep).join("; ")}: the determinant isn't a candidate key, though the dependant is part of the primary key${nf === "3NF" ? " (so 3NF but not BCNF)" : ""}`);
  const head = `With primary key ${fmtSet(pk)}, ${F.rel.name} is in **${nf}**${nf === "BCNF" ? "" : ` but not ${ORDER[ORDER.indexOf(nf) + 1]}`}.`;
  return parts.length ? `${head} It has ${parts.join("; and ")}.` : `${head} Every determinant is a candidate key.`;
}

export function judgeClaim(F: FDSet, pk: Attrs, c: Claim, rows?: unknown[][]): Judged {
  const kinds = CLAIM_KINDS.filter((k) => c[k] !== undefined);
  if (kinds.length !== 1) throw new Error(`a claim needs exactly one of ${CLAIM_KINDS.join(", ")} (got ${kinds.join(", ") || "none"})`);
  const kind = kinds[0]!;
  const closureText = (x: Attrs) => `${fmtSet(x)}⁺ = {${list(F.closure(x))}}`;
  const rel = F.rel.name;
  const out = (value: boolean, text: string, reason: string): Judged => ({ value, text: c.text ?? text, reason });

  switch (kind) {
    case "holds":
    case "trivial":
    case "full":
    case "partial":
    case "transitive":
    case "satisfied": {
      const f = parseFD(c[kind] as string);
      new FDSet(F.rel, [f]); // checks attribute names
      const holds = F.implies(f.lhs, f.rhs);
      const fdT = fmtFD(f);
      if (kind === "holds") return out(holds, `${fdT} holds in ${rel}.`, holds ? `${closureText(f.lhs)}, which contains ${list(f.rhs)}.` : `${closureText(f.lhs)}, which doesn't contain ${list(f.rhs.filter((a) => !F.closure(f.lhs).includes(a)))}.`);
      if (kind === "trivial") {
        const t = f.rhs.every((a) => f.lhs.includes(a));
        return out(t, `${fdT} is a trivial dependency.`, t ? "Its right side is part of its left side, so it can't fail." : "Its right side isn't contained in its left side.");
      }
      if (kind === "satisfied") {
        if (!rows) throw new Error("a satisfied claim needs an instance");
        const br = instanceBreaks(F.rel, rows, f);
        return out(
          !br,
          `The instance satisfies ${fdT}.`,
          br
            ? `Two rows agree on ${list(f.lhs)} (${f.lhs.map((a) => String(br[0][F.rel.attrs.indexOf(a)])).join(", ")}) but differ on ${list(f.rhs)}.`
            : `No two rows agree on ${list(f.lhs)} and differ on ${list(f.rhs)}. (An instance can only rule an FD out; whether it's a rule comes from the requirements.)`,
        );
      }
      if (f.rhs.length !== 1) throw new Error(`${kind} claims take one attribute on the right`);
      const a = f.rhs[0]!;
      const smaller = F.subsets(f.lhs, true).find((s) => F.implies(s, [a]));
      if (kind === "full") {
        const v = holds && !smaller;
        return out(v, `${a} is fully functionally dependent on ${fmtSet(f.lhs)}.`, !holds ? `${fdT} doesn't hold at all: ${closureText(f.lhs)}.` : smaller ? `${fmtSet(smaller)} alone already determines ${a}, so it isn't full.` : `No proper part of ${fmtSet(f.lhs)} determines ${a}.`);
      }
      if (kind === "partial") {
        const v = holds && !!smaller;
        return out(v, `${fdT} is a partial (non-full) dependency.`, !holds ? `${fdT} doesn't hold: ${closureText(f.lhs)}.` : smaller ? `${fmtSet(smaller)}, a proper part of ${fmtSet(f.lhs)}, already determines ${a}.` : `No proper part of ${fmtSet(f.lhs)} determines ${a}, so it's full.`);
      }
      // transitive: X → Y, Y → A, Y ↛ X, A ∉ X ∪ Y, Y ⊄ X
      const cx = F.closure(f.lhs).filter((b) => b !== a);
      const via = holds ? F.subsets(cx).find((y) => !y.every((b) => f.lhs.includes(b)) && F.implies(y, [a]) && !F.implies(y, f.lhs)) : undefined;
      return out(
        !!via,
        `${a} is transitively dependent on ${fmtSet(f.lhs)}.`,
        !holds ? `${fdT} doesn't hold: ${closureText(f.lhs)}.` : via ? `${fmtSet(f.lhs)} → ${list(via)} and ${fmtSet(via)} → ${a}, while ${fmtSet(via)} doesn't determine ${fmtSet(f.lhs)}.` : `Nothing that ${fmtSet(f.lhs)} determines (other than ${fmtSet(f.lhs)} itself) determines ${a}.`,
      );
    }
    case "key": {
      const x = F.order(c.key!);
      const sk = F.isSuperkey(x), ck = F.isCandidateKey(x);
      const smaller = F.subsets(x, true).find((s) => F.isSuperkey(s));
      return out(ck, `${fmtSet(x)} is a candidate key of ${rel}.`, !sk ? `${closureText(x)}, not every attribute.` : smaller ? `It's a superkey, but ${fmtSet(smaller)} alone is too, so it isn't minimal.` : `${closureText(x)} is every attribute, and no smaller part of it is a superkey.`);
    }
    case "superkey": {
      const x = F.order(c.superkey!);
      const sk = F.isSuperkey(x);
      return out(sk, `${fmtSet(x)} is a superkey of ${rel}.`, `${closureText(x)}${sk ? ": every attribute." : ", not every attribute."}`);
    }
    case "nf":
    case "exactNf": {
      const want = c[kind] as NF;
      const have = F.normalForm(pk);
      const v = kind === "nf" ? atLeast(have, want) : have === want;
      return out(v, kind === "nf" ? `${rel} is in ${nfText[want]}.` : `${rel}'s highest normal form is ${nfText[want]}.`, describeNF(F, pk).replace(/\*\*/g, ""));
    }
    case "lossless":
    case "preserving":
    case "good": {
      const parts = (c[kind] as Attrs[]).map((p) => F.order(p));
      for (const p of parts) for (const a of p) if (!F.rel.attrs.includes(a)) throw new Error(`decomposition uses ${a}, which isn't in ${rel}`);
      const covered = new Set(parts.flat());
      if (F.rel.attrs.some((a) => !covered.has(a))) throw new Error(`decomposition ${parts.map(fmtSet).join(" + ")} leaves out ${F.rel.attrs.filter((a) => !covered.has(a)).join(", ")}`);
      const name = parts.map((p) => `(${list(p)})`).join(" and ");
      const pres = preserving(F, parts);
      const presWhy = pres.ok ? "Every original FD can still be derived from the FDs inside the parts." : `${pres.lost.map(fmtFD).join("; ")} can no longer be derived from the FDs inside the parts.`;
      if (kind === "preserving") return out(pres.ok, `Decomposing ${rel} into ${name} preserves every dependency.`, presWhy);
      if (parts.length !== 2) throw new Error(`${kind} claims take exactly two relations`);
      const ll = lossless(F, parts[0]!, parts[1]!);
      if (kind === "lossless") return out(ll.ok, `Decomposing ${rel} into ${name} is non-loss (lossless).`, ll.why);
      return out(ll.ok && pres.ok, `Decomposing ${rel} into ${name} is a good decomposition (by Rissanen's rules).`, `${ll.why} ${presWhy}`);
    }
    case "insertAnomaly": {
      const known = F.order(c.insertAnomaly!);
      const missing = pk.filter((a) => !known.includes(a));
      return out(
        missing.length > 0,
        `Recording a fact about only ${list(known)} causes an insertion anomaly.`,
        missing.length
          ? `The primary key ${fmtSet(pk)} needs ${list(missing)}, which this fact doesn't have, and a key attribute can't be null.`
          : `The fact includes the whole primary key ${fmtSet(pk)}; the other attributes can be left null.`,
      );
    }
  }
}
