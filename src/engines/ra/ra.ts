/**
 * Relational algebra: lexer, parser and evaluator.
 *
 * Set semantics throughout (every result is de-duplicated), as in the course.
 * Accepts the course's notation (σ π ρ × ⋈ ⟕ ⟖ ⟗ ÷ ∪ ∩ − :=) and ASCII aliases
 * (sigma, pi, rho, x, join, ljoin, rjoin, fjoin, divide, union, intersect,
 * minus) so it can be typed on any keyboard.
 */

export type Value = string | number | null;
export interface Attr {
  name: string;
  rel?: string;
  /** Domain, when known from the dataset: "text" | "int" | "numeric" | "date". */
  type?: string;
}
export interface Relation {
  attrs: Attr[];
  rows: Value[][];
}
export type Env = Record<string, Relation>;

export class RAError extends Error {
  constructor(
    message: string,
    public pos?: number,
  ) {
    super(message);
  }
}

// ------------------------------------------------------------------ lexer

type TokKind = "ident" | "num" | "str" | "op" | "eof";
interface Tok {
  kind: TokKind;
  v: string;
  pos: number;
}

const OPS = [
  ":=", "<-", "←", "<>", "!=", "≠", "<=", ">=", "≤", "≥", "=", "<", ">",
  "σ", "π", "ρ", "×", "⋈", "⨝", "⟕", "⟖", "⟗", "÷", "∪", "∩", "−", "-", "/",
  "∧", "∨", "¬", "(", ")", "[", "]", "{", "}", ",", ".", ";", "_",
];

const QUOTES: Record<string, string> = { "'": "'", '"': '"', "‘": "’", "’": "’", "“": "”", "”": "”", "′": "′" };

export function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // comments: -- to end of line
    if (c === "-" && src[i + 1] === "-") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (QUOTES[c]) {
      const close = QUOTES[c]!;
      const start = i;
      i++;
      let s = "";
      while (i < src.length && src[i] !== close && !(close === "’" && src[i] === "'") && !(close === "”" && src[i] === '"')) {
        s += src[i];
        i++;
      }
      if (i >= src.length) throw new RAError("Unclosed string literal", start);
      i++;
      toks.push({ kind: "str", v: s, pos: start });
      continue;
    }
    if (/[0-9]/.test(c)) {
      const start = i;
      while (i < src.length && /[0-9.]/.test(src[i]!)) i++;
      toks.push({ kind: "num", v: src.slice(start, i), pos: start });
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      const start = i;
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i]!)) i++;
      toks.push({ kind: "ident", v: src.slice(start, i), pos: start });
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) {
      toks.push({ kind: "op", v: op, pos: i });
      i += op.length;
      continue;
    }
    throw new RAError(`Unexpected character "${c}"`, i);
  }
  toks.push({ kind: "eof", v: "", pos: src.length });
  return toks;
}

// ------------------------------------------------------------------ AST

export type Cond =
  | { k: "cmp"; op: string; l: Term; r: Term }
  | { k: "and" | "or"; l: Cond; r: Cond }
  | { k: "not"; c: Cond };
export type Term = { k: "attr"; rel?: string; name: string } | { k: "lit"; v: Value };

export type Expr =
  | { k: "rel"; name: string; pos: number }
  | { k: "select"; cond: Cond; e: Expr }
  | { k: "project"; attrs: { rel?: string; name: string }[]; e: Expr }
  | { k: "rename"; relName?: string; attrNames?: string[]; attrMap?: [string, string][]; e: Expr }
  | { k: "binop"; op: BinOp; cond?: Cond; l: Expr; r: Expr };

export type BinOp = "product" | "natjoin" | "theta" | "left" | "right" | "full" | "divide" | "union" | "intersect" | "minus";

export interface Stmt {
  target?: string;
  targetAttrs?: string[];
  e: Expr;
  text: string;
}

// ------------------------------------------------------------------ parser

const KW: Record<string, string> = {
  sigma: "σ", select: "σ", pi: "π", project: "π", rho: "ρ", rename: "ρ",
  join: "⋈", natjoin: "⋈", cross: "×", times: "×",
  ljoin: "⟕", leftjoin: "⟕", rjoin: "⟖", rightjoin: "⟖", fjoin: "⟗", fulljoin: "⟗",
  divide: "÷", union: "∪", intersect: "∩", minus: "−", except: "−",
  and: "∧", or: "∨", not: "¬",
};

class Parser {
  i = 0;
  constructor(
    private t: Tok[],
    private src: string,
  ) {}

  peek(o = 0): Tok {
    return this.t[Math.min(this.i + o, this.t.length - 1)]!;
  }
  /** Canonical symbol for a token (maps ASCII keywords to their symbols). */
  sym(o = 0): string {
    const tk = this.peek(o);
    if (tk.kind === "op") {
      if (tk.v === "⨝") return "⋈";
      if (tk.v === "-") return "−";
      if (tk.v === "/") return "÷";
      if (tk.v === "<-") return "←";
      return tk.v;
    }
    if (tk.kind === "ident") {
      const k = KW[tk.v.toLowerCase()];
      if (k) return k;
    }
    return "";
  }
  next(): Tok {
    return this.t[this.i++]!;
  }
  expectSym(s: string, what?: string): Tok {
    if (this.sym() !== s) this.fail(`Expected ${what ?? `"${s}"`}`);
    return this.next();
  }
  fail(msg: string): never {
    const tk = this.peek();
    const near = tk.kind === "eof" ? "end of input" : `"${tk.v}"`;
    throw new RAError(`${msg} near ${near}`, tk.pos);
  }

  program(): Stmt[] {
    const out: Stmt[] = [];
    while (this.peek().kind !== "eof") {
      if (this.sym() === ";") {
        this.next();
        continue;
      }
      const start = this.peek().pos;
      const assign = this.tryAssignHead();
      const e = this.expr();
      const end = this.peek().pos;
      out.push({ ...assign, e, text: this.src.slice(start, end).trim() });
    }
    if (!out.length) throw new RAError("Enter an expression", 0);
    return out;
  }

  /** IDENT [ (a, b) ] := */
  tryAssignHead(): { target?: string; targetAttrs?: string[] } {
    const save = this.i;
    if (this.peek().kind === "ident" && !KW[this.peek().v.toLowerCase()]) {
      const name = this.next().v;
      let attrs: string[] | undefined;
      if (this.sym() === "(") {
        const s2 = this.i;
        this.next();
        const list: string[] = [];
        while (this.peek().kind === "ident") {
          list.push(this.next().v);
          if (this.sym() === ",") this.next();
          else break;
        }
        if (this.sym() === ")" && list.length) {
          this.next();
          attrs = list;
        } else this.i = s2;
      }
      if (this.sym() === ":=" || this.sym() === "←") {
        this.next();
        return { target: name, targetAttrs: attrs };
      }
    }
    this.i = save;
    return {};
  }

  /** True if the upcoming tokens begin a new assignment statement. */
  atAssignStart(): boolean {
    const save = this.i;
    const h = this.tryAssignHead();
    this.i = save;
    return h.target !== undefined;
  }

  expr(): Expr {
    let l = this.inter();
    for (;;) {
      const s = this.sym();
      if (s === "∪" || s === "−") {
        this.next();
        const r = this.inter();
        l = { k: "binop", op: s === "∪" ? "union" : "minus", l, r };
      } else return l;
    }
  }

  inter(): Expr {
    let l = this.join();
    while (this.sym() === "∩") {
      this.next();
      l = { k: "binop", op: "intersect", l, r: this.join() };
    }
    return l;
  }

  isProductX(): boolean {
    const tk = this.peek();
    if (tk.kind !== "ident" || (tk.v !== "x" && tk.v !== "X")) return false;
    const nx = this.peek(1);
    return !(nx.kind === "op" && (nx.v === ":=" || nx.v === "←" || nx.v === "<-" || nx.v === "."));
  }

  join(): Expr {
    let l = this.unary();
    for (;;) {
      const s = this.sym();
      if (s === "×" || this.isProductX()) {
        this.next();
        l = { k: "binop", op: "product", l, r: this.unary() };
      } else if (s === "÷") {
        this.next();
        l = { k: "binop", op: "divide", l, r: this.unary() };
      } else if (s === "⋈" || s === "⟕" || s === "⟖" || s === "⟗") {
        this.next();
        let op: BinOp = s === "⟕" ? "left" : s === "⟖" ? "right" : s === "⟗" ? "full" : "natjoin";
        // "⋈ left", "⋈_left", "⋈left" (slides write the variant as a subscript)
        if (op === "natjoin") {
          if (this.sym() === "_") this.next();
          const w = this.peek();
          if (w.kind === "ident" && ["left", "right", "full"].includes(w.v.toLowerCase()) && this.peek(1).kind !== "op") {
            op = w.v.toLowerCase() as BinOp;
            this.next();
          } else if (w.kind === "ident" && ["left", "right", "full"].includes(w.v.toLowerCase()) && (this.peek(1).v === "(")) {
            op = w.v.toLowerCase() as BinOp;
            this.next();
          }
        }
        const cond = this.optionalJoinCond();
        if (cond && op === "natjoin") op = "theta";
        const r = this.unary();
        l = { k: "binop", op, cond, l, r };
      } else return l;
    }
  }

  /** Optional theta condition after a join symbol: [c], {c}, _{c}, or a bare comparison. */
  optionalJoinCond(): Cond | undefined {
    const b = this.bracketed(() => this.cond());
    if (b) return b;
    // bare: IDENT[.IDENT] cmpop ...
    let j = 0;
    if (this.peek(j).kind === "ident") {
      j++;
      if (this.peek(j).v === "." && this.peek(j + 1).kind === "ident") j += 2;
      const op = this.peek(j);
      if (op.kind === "op" && ["=", "<>", "!=", "≠", "<", "<=", ">", ">=", "≤", "≥"].includes(op.v)) {
        return this.cond();
      }
    }
    return undefined;
  }

  /** Parses [x], {x}, _{x}, _[x] if present. */
  bracketed<T>(f: () => T): T | undefined {
    let s = this.sym();
    if (s === "_" && (this.sym(1) === "{" || this.sym(1) === "[")) {
      this.next();
      s = this.sym();
    }
    if (s === "[" || s === "{") {
      this.next();
      const v = f();
      this.expectSym(s === "[" ? "]" : "}");
      return v;
    }
    return undefined;
  }

  unary(): Expr {
    const s = this.sym();
    if (s === "σ") {
      this.next();
      const cond = this.bracketed(() => this.cond()) ?? this.cond();
      return { k: "select", cond, e: this.unary() };
    }
    if (s === "π") {
      this.next();
      const attrs = this.bracketed(() => this.attrList()) ?? this.attrList();
      return { k: "project", attrs, e: this.unary() };
    }
    if (s === "ρ") {
      this.next();
      const spec = this.bracketed(() => this.renameSpec(true)) ?? this.renameSpec(false);
      return { k: "rename", ...spec, e: this.unary() };
    }
    return this.primary();
  }

  renameSpec(inBrackets: boolean): { relName?: string; attrNames?: string[]; attrMap?: [string, string][] } {
    const first = this.peek();
    if (first.kind !== "ident") this.fail("Expected a name after ρ");
    // new←old, ...
    if (this.sym(1) === "←") {
      const map: [string, string][] = [];
      for (;;) {
        const nw = this.next().v;
        this.expectSym("←");
        const old = this.next();
        if (old.kind !== "ident") this.fail("Expected attribute name");
        map.push([nw, old.v]);
        if (this.sym() === ",") this.next();
        else break;
      }
      return { attrMap: map };
    }
    const relName = this.next().v;
    if (this.sym() === "(") {
      const save = this.i;
      this.next();
      const list: string[] = [];
      while (this.peek().kind === "ident") {
        list.push(this.next().v);
        if (this.sym() === ",") this.next();
        else break;
      }
      if (this.sym() === ")" && list.length) {
        this.next();
        const nx = this.sym();
        const tk = this.peek();
        const operandStarts = inBrackets || nx === "(" || nx === "σ" || nx === "π" || nx === "ρ" || (tk.kind === "ident" && !KW[tk.v.toLowerCase()]);
        if (operandStarts) return { relName, attrNames: list };
      }
      this.i = save;
    }
    return { relName };
  }

  attrList(): { rel?: string; name: string }[] {
    const out: { rel?: string; name: string }[] = [];
    for (;;) {
      const a = this.attrRef();
      out.push(a);
      if (this.sym() === ",") this.next();
      else return out;
    }
  }

  attrRef(): { rel?: string; name: string } {
    const tk = this.peek();
    if (tk.kind !== "ident") this.fail("Expected an attribute name");
    this.next();
    if (this.sym() === "." && this.peek(1).kind === "ident") {
      this.next();
      return { rel: tk.v, name: this.next().v };
    }
    return { name: tk.v };
  }

  primary(): Expr {
    const tk = this.peek();
    if (this.sym() === "(") {
      this.next();
      const e = this.expr();
      this.expectSym(")", 'a closing ")"');
      return e;
    }
    if (tk.kind === "ident" && !KW[tk.v.toLowerCase()]) {
      this.next();
      return { k: "rel", name: tk.v, pos: tk.pos };
    }
    this.fail("Expected a relation name or (");
  }

  // conditions
  cond(): Cond {
    let l = this.condAnd();
    while (this.sym() === "∨") {
      this.next();
      l = { k: "or", l, r: this.condAnd() };
    }
    return l;
  }
  condAnd(): Cond {
    let l = this.condNot();
    while (this.sym() === "∧") {
      this.next();
      l = { k: "and", l, r: this.condNot() };
    }
    return l;
  }
  condNot(): Cond {
    if (this.sym() === "¬") {
      this.next();
      return { k: "not", c: this.condNot() };
    }
    if (this.sym() === "(") {
      this.next();
      const c = this.cond();
      this.expectSym(")", 'a closing ")"');
      return c;
    }
    const l = this.term();
    const op = this.peek();
    if (op.kind !== "op" || !["=", "<>", "!=", "≠", "<", "<=", ">", ">=", "≤", "≥"].includes(op.v)) {
      this.fail("Expected a comparison (=, <>, <, <=, >, >=)");
    }
    this.next();
    const r = this.term();
    const norm: Record<string, string> = { "!=": "<>", "≠": "<>", "≤": "<=", "≥": ">=" };
    return { k: "cmp", op: norm[op.v] ?? op.v, l, r };
  }
  term(): Term {
    const tk = this.peek();
    if (tk.kind === "num") {
      this.next();
      return { k: "lit", v: Number(tk.v) };
    }
    if (tk.kind === "str") {
      this.next();
      return { k: "lit", v: tk.v };
    }
    if (tk.kind === "ident" && tk.v.toLowerCase() === "null") {
      this.next();
      return { k: "lit", v: null };
    }
    if (tk.kind === "op" && (tk.v === "-" || tk.v === "−") && this.peek(1).kind === "num") {
      this.next();
      return { k: "lit", v: -Number(this.next().v) };
    }
    if (tk.kind === "ident") {
      const a = this.attrRef();
      return { k: "attr", ...a };
    }
    this.fail("Expected an attribute or a value");
  }
}

export function parse(src: string): Stmt[] {
  const p = new Parser(lex(src), src);
  return p.program();
}

// ------------------------------------------------------------------ evaluator

const eqName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function lookup(env: Env, name: string): Relation {
  const key = Object.keys(env).find((k) => eqName(k, name));
  if (!key) {
    const names = Object.keys(env).join(", ");
    throw new RAError(`Unknown relation "${name}". Available: ${names || "none"}`);
  }
  const r = env[key]!;
  return { attrs: r.attrs.map((a) => ({ ...a, rel: a.rel ?? key })), rows: r.rows };
}

export function attrLabel(a: Attr, all: Attr[]): string {
  const dup = all.filter((b) => eqName(b.name, a.name)).length > 1;
  return dup && a.rel ? `${a.rel}.${a.name}` : a.name;
}

function resolve(attrs: Attr[], ref: { rel?: string; name: string }): number {
  const hits: number[] = [];
  attrs.forEach((a, i) => {
    if (eqName(a.name, ref.name) && (!ref.rel || (a.rel && eqName(a.rel, ref.rel)))) hits.push(i);
  });
  const shown = ref.rel ? `${ref.rel}.${ref.name}` : ref.name;
  if (hits.length === 0) {
    const avail = attrs.map((a) => attrLabel(a, attrs)).join(", ");
    throw new RAError(`Unknown attribute "${shown}". This relation has: ${avail}`);
  }
  if (hits.length > 1) {
    const opts = hits.map((i) => `${attrs[i]!.rel}.${attrs[i]!.name}`).join(" or ");
    throw new RAError(`"${shown}" is ambiguous here: write ${opts}. If both sides are the same relation, rename one with ρ first.`);
  }
  return hits[0]!;
}

function dedupe(rows: Value[][]): Value[][] {
  const seen = new Set<string>();
  const out: Value[][] = [];
  for (const r of rows) {
    const k = JSON.stringify(r);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(r);
    }
  }
  return out;
}

function asNum(v: Value): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return null;
}

function compare(op: string, a: Value, b: Value): boolean {
  if (a === null || b === null) return false; // comparisons with null are never true
  const na = asNum(a);
  const nb = asNum(b);
  let c: number;
  if (na !== null && nb !== null) c = na - nb;
  else c = String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  switch (op) {
    case "=": return c === 0;
    case "<>": return c !== 0;
    case "<": return c < 0;
    case "<=": return c <= 0;
    case ">": return c > 0;
    case ">=": return c >= 0;
  }
  return false;
}

function compileCond(cond: Cond, attrs: Attr[]): (row: Value[]) => boolean {
  switch (cond.k) {
    case "and": {
      const l = compileCond(cond.l, attrs), r = compileCond(cond.r, attrs);
      return (row) => l(row) && r(row);
    }
    case "or": {
      const l = compileCond(cond.l, attrs), r = compileCond(cond.r, attrs);
      return (row) => l(row) || r(row);
    }
    case "not": {
      const c = compileCond(cond.c, attrs);
      return (row) => !c(row);
    }
    case "cmp": {
      const get = (t: Term): ((row: Value[]) => Value) => {
        if (t.k === "lit") return () => t.v;
        const idx = resolve(attrs, t);
        return (row) => row[idx]!;
      };
      const l = get(cond.l), r = get(cond.r);
      return (row) => compare(cond.op, l(row), r(row));
    }
  }
}

function product(a: Relation, b: Relation): Relation {
  const rows: Value[][] = [];
  for (const x of a.rows) for (const y of b.rows) rows.push([...x, ...y]);
  return { attrs: [...a.attrs, ...b.attrs], rows };
}

function commonAttrs(a: Relation, b: Relation): [number, number][] {
  const pairs: [number, number][] = [];
  a.attrs.forEach((x, i) => {
    const js = b.attrs.map((y, j) => (eqName(x.name, y.name) ? j : -1)).filter((j) => j >= 0);
    if (js.length > 1) throw new RAError(`Natural join is ambiguous: the right side has more than one "${x.name}"`);
    if (js.length === 1) pairs.push([i, js[0]!]);
  });
  const leftNames = pairs.map(([i]) => a.attrs[i]!.name.toLowerCase());
  if (new Set(leftNames).size !== leftNames.length) throw new RAError("Natural join is ambiguous: the left side repeats an attribute name. Rename with ρ first.");
  return pairs;
}

function naturalish(a: Relation, b: Relation, mode: "inner" | "left" | "right" | "full"): Relation {
  const pairs = commonAttrs(a, b);
  const keepB = b.attrs.map((_, j) => j).filter((j) => !pairs.some(([, pj]) => pj === j));
  const attrs = [...a.attrs, ...keepB.map((j) => b.attrs[j]!)];
  const rows: Value[][] = [];
  const matchedB = new Set<number>();
  for (const x of a.rows) {
    let matched = false;
    b.rows.forEach((y, yi) => {
      if (pairs.every(([i, j]) => x[i] !== null && y[j] !== null && compare("=", x[i]!, y[j]!))) {
        matched = true;
        matchedB.add(yi);
        rows.push([...x, ...keepB.map((j) => y[j]!)]);
      }
    });
    if (!matched && (mode === "left" || mode === "full")) rows.push([...x, ...keepB.map(() => null)]);
  }
  if (mode === "right" || mode === "full") {
    b.rows.forEach((y, yi) => {
      if (matchedB.has(yi)) return;
      const left: Value[] = a.attrs.map((_, i) => {
        const p = pairs.find(([pi]) => pi === i);
        return p ? y[p[1]]! : null;
      });
      rows.push([...left, ...keepB.map((j) => y[j]!)]);
    });
  }
  return { attrs, rows: dedupe(rows) };
}

function thetaOuter(a: Relation, b: Relation, cond: Cond, mode: "left" | "right" | "full"): Relation {
  const attrs = [...a.attrs, ...b.attrs];
  const test = compileCond(cond, attrs);
  const rows: Value[][] = [];
  const matchedB = new Set<number>();
  for (const x of a.rows) {
    let m = false;
    b.rows.forEach((y, yi) => {
      const r = [...x, ...y];
      if (test(r)) {
        m = true;
        matchedB.add(yi);
        rows.push(r);
      }
    });
    if (!m && mode !== "right") rows.push([...x, ...b.attrs.map(() => null)]);
  }
  if (mode !== "left") b.rows.forEach((y, yi) => !matchedB.has(yi) && rows.push([...a.attrs.map(() => null), ...y]));
  return { attrs, rows: dedupe(rows) };
}

function unionCompatible(a: Relation, b: Relation, op: string) {
  if (a.attrs.length !== b.attrs.length) {
    throw new RAError(
      `${op} needs union-compatible relations, but the left side has ${a.attrs.length} attribute(s) and the right side has ${b.attrs.length}. Project (π) both sides onto matching attributes first.`,
    );
  }
  const dom = (t?: string) => (t === "int" || t === "numeric" ? "number" : t);
  a.attrs.forEach((x, i) => {
    const y = b.attrs[i]!;
    if (x.type && y.type && dom(x.type) !== dom(y.type)) {
      throw new RAError(
        `${op} needs union-compatible relations: attribute ${i + 1} is ${x.name} (${dom(x.type)}) on the left but ${y.name} (${dom(y.type)}) on the right. The domains must match position by position.`,
      );
    }
  });
}

function divide(a: Relation, b: Relation): Relation {
  const bIdx = b.attrs.map((y) => {
    const hits = a.attrs.map((x, i) => (eqName(x.name, y.name) ? i : -1)).filter((i) => i >= 0);
    if (hits.length !== 1) throw new RAError(`For R ÷ S every attribute of S must be an attribute of R, but "${y.name}" is ${hits.length ? "ambiguous" : "missing"} in R`);
    return hits[0]!;
  });
  const keep = a.attrs.map((_, i) => i).filter((i) => !bIdx.includes(i));
  if (!keep.length) throw new RAError("R ÷ S would have no attributes: R must have attributes that S does not");
  const rset = new Set(a.rows.map((r) => JSON.stringify(r)));
  const cands = dedupe(a.rows.map((r) => keep.map((i) => r[i]!)));
  const rows = cands.filter((c) =>
    b.rows.every((s) => {
      // rebuild an R tuple from candidate + divisor tuple
      const full: Value[] = new Array(a.attrs.length);
      keep.forEach((i, k) => (full[i] = c[k]!));
      bIdx.forEach((i, k) => (full[i] = s[k]!));
      return rset.has(JSON.stringify(full)) || a.rows.some((r) => full.every((v, i) => compare("=", r[i]!, v) || (r[i] === null && v === null)));
    }),
  );
  return { attrs: keep.map((i) => a.attrs[i]!), rows };
}

export function evalExpr(e: Expr, env: Env): Relation {
  switch (e.k) {
    case "rel":
      return lookup(env, e.name);
    case "select": {
      const r = evalExpr(e.e, env);
      const f = compileCond(e.cond, r.attrs);
      return { attrs: r.attrs, rows: r.rows.filter(f) };
    }
    case "project": {
      const r = evalExpr(e.e, env);
      const idx = e.attrs.map((a) => resolve(r.attrs, a));
      return { attrs: idx.map((i) => r.attrs[i]!), rows: dedupe(r.rows.map((row) => idx.map((i) => row[i]!))) };
    }
    case "rename": {
      const r = evalExpr(e.e, env);
      let attrs = r.attrs.map((a) => ({ ...a }));
      if (e.attrMap) {
        for (const [nw, old] of e.attrMap) {
          const i = resolve(attrs, { name: old });
          attrs[i] = { ...attrs[i]!, name: nw };
        }
      }
      if (e.attrNames) {
        if (e.attrNames.length !== attrs.length) throw new RAError(`ρ lists ${e.attrNames.length} attribute names but the relation has ${attrs.length}`);
        attrs = attrs.map((a, i) => ({ name: e.attrNames![i]!, rel: a.rel, type: a.type }));
      }
      if (e.relName) attrs = attrs.map((a) => ({ ...a, rel: e.relName }));
      return { attrs, rows: r.rows };
    }
    case "binop": {
      const a = evalExpr(e.l, env);
      const b = evalExpr(e.r, env);
      switch (e.op) {
        case "product": {
          const p = product(a, b);
          return { attrs: p.attrs, rows: dedupe(p.rows) };
        }
        case "theta": {
          const p = product(a, b);
          const f = compileCond(e.cond!, p.attrs);
          return { attrs: p.attrs, rows: dedupe(p.rows.filter(f)) };
        }
        case "natjoin":
          return naturalish(a, b, "inner");
        case "left":
        case "right":
        case "full":
          return e.cond ? thetaOuter(a, b, e.cond, e.op) : naturalish(a, b, e.op);
        case "divide":
          return divide(a, b);
        case "union":
          unionCompatible(a, b, "∪");
          return { attrs: a.attrs, rows: dedupe([...a.rows, ...b.rows]) };
        case "intersect": {
          unionCompatible(a, b, "∩");
          const bs = new Set(b.rows.map((r) => JSON.stringify(r)));
          return { attrs: a.attrs, rows: dedupe(a.rows.filter((r) => bs.has(JSON.stringify(r)))) };
        }
        case "minus": {
          unionCompatible(a, b, "−");
          const bs = new Set(b.rows.map((r) => JSON.stringify(r)));
          return { attrs: a.attrs, rows: dedupe(a.rows.filter((r) => !bs.has(JSON.stringify(r)))) };
        }
      }
    }
  }
}

export interface RunResult {
  result: Relation;
  steps: { name?: string; text: string; relation: Relation }[];
}

/** Parse and run a program of assignments; the last statement is the answer. */
export function run(src: string, base: Env): RunResult {
  const stmts = parse(src);
  const env: Env = { ...base };
  const steps: RunResult["steps"] = [];
  let last: Relation | undefined;
  for (const s of stmts) {
    let rel = evalExpr(s.e, env);
    if (s.targetAttrs) {
      if (s.targetAttrs.length !== rel.attrs.length) throw new RAError(`${s.target}(${s.targetAttrs.join(", ")}) names ${s.targetAttrs.length} attributes but the expression has ${rel.attrs.length}`);
      rel = { attrs: s.targetAttrs.map((n, i) => ({ name: n, type: rel.attrs[i]!.type })), rows: rel.rows };
    }
    rel = { attrs: rel.attrs, rows: dedupe(rel.rows) };
    if (s.target) {
      const isBase = Object.keys(base).some((k) => eqName(k, s.target!));
      if (isBase) throw new RAError(`"${s.target}" is a relation in the schema; assign to a new temporary name instead`);
      env[s.target] = { attrs: rel.attrs.map((a) => ({ name: a.name, type: a.type })), rows: rel.rows };
    }
    steps.push({ name: s.target, text: s.text, relation: rel });
    last = rel;
  }
  return { result: last!, steps };
}

// ------------------------------------------------------------------ comparison (for grading)

export function normValue(v: Value): string {
  if (v === null) return "∅null";
  const n = asNum(v);
  if (n !== null) return String(n);
  return String(v).trim();
}

/**
 * Compares two results as sets. Columns are aligned by name when both sides use
 * the same names; otherwise positionally.
 */
export function sameRelation(
  got: { cols: string[]; rows: Value[][] },
  want: { cols: string[]; rows: Value[][] },
  mode: "set" | "bag" | "ordered" = "set",
): { ok: boolean; reason?: string } {
  if (got.cols.length !== want.cols.length) {
    return { ok: false, reason: `Your result has ${got.cols.length} column(s); the expected result has ${want.cols.length}.` };
  }
  const lc = (s: string) => s.toLowerCase().replace(/^.*\./, "");
  let order = got.cols.map((_, i) => i);
  const gNames = got.cols.map(lc), wNames = want.cols.map(lc);
  if ([...gNames].sort().join() === [...wNames].sort().join() && new Set(wNames).size === wNames.length) {
    order = wNames.map((n) => gNames.indexOf(n));
  }
  const key = (r: Value[]) => JSON.stringify(r.map(normValue));
  const g = got.rows.map((r) => key(order.map((i) => r[i]!)));
  const w = want.rows.map(key);
  if (mode === "ordered") {
    const ok = g.length === w.length && g.every((x, i) => x === w[i]);
    if (ok) return { ok };
    const sameSet = [...g].sort().join("|") === [...w].sort().join("|");
    return { ok, reason: sameSet ? "Right rows, wrong order. Check your ORDER BY." : rowReason(g, w) };
  }
  if (mode === "bag") {
    const ok = g.length === w.length && [...g].sort().join("|") === [...w].sort().join("|");
    if (ok) return { ok };
    const gs = new Set(g), ws = new Set(w);
    if (gs.size === ws.size && [...gs].every((x) => ws.has(x))) {
      return { ok, reason: g.length > w.length ? "Right values, but your result has duplicate rows. Do you need DISTINCT?" : "Right values, but the expected result keeps duplicates that yours removes." };
    }
    return { ok, reason: rowReason(g, w) };
  }
  const gs = new Set(g), ws = new Set(w);
  const ok = gs.size === ws.size && [...gs].every((x) => ws.has(x));
  return ok ? { ok } : { ok, reason: rowReason([...gs], [...ws]) };
}

function rowReason(g: string[], w: string[]): string {
  const ws = new Set(w), gs = new Set(g);
  const extra = [...gs].filter((x) => !ws.has(x)).length;
  const missing = [...ws].filter((x) => !gs.has(x)).length;
  const parts: string[] = [];
  if (missing) parts.push(`${missing} expected row(s) missing`);
  if (extra) parts.push(`${extra} row(s) that shouldn't be there`);
  return `Your result has ${g.length} row(s), expected ${w.length}: ${parts.join(" and ")}.`;
}

export function relationToTable(r: Relation): { cols: string[]; rows: Value[][] } {
  return { cols: r.attrs.map((a) => attrLabel(a, r.attrs)), rows: r.rows };
}
