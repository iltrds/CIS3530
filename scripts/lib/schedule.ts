// Transaction schedules: run an interleaving of Read/Write/assignment steps the way the course does
// (no concurrency control, every read sees the latest write), and spot the classic problems.

export type Op =
  | { k: "read" | "write" | "delete" | "insert"; x: string }
  | { k: "assign"; v: string; expr: Expr; src: string }
  | { k: "begin" | "commit" | "end" }
  | { k: "abort"; label: string };

export interface Step {
  /** row in the displayed schedule (several steps can share a row, e.g. "t4") */
  row: number;
  tx: string;
  op: Op;
  text: string;
}

type Expr = { n: number } | { v: string } | { op: string; a: Expr; b: Expr } | { neg: Expr };

// ---------------------------------------------------------------- parsing

function parseExpr(src: string): Expr {
  const toks = src.match(/\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[-+*/()]/g) ?? [];
  if (toks.join("") !== src.replace(/\s+/g, "")) throw new Error(`can't read the expression "${src}"`);
  let i = 0;
  const peek = () => toks[i];
  const atom = (): Expr => {
    const t = toks[i++];
    if (t === undefined) throw new Error(`"${src}" ends too early`);
    if (t === "(") {
      const e = sum();
      if (toks[i++] !== ")") throw new Error(`missing ) in "${src}"`);
      return e;
    }
    if (t === "-") return { neg: atom() };
    if (/^\d/.test(t)) return { n: Number(t) };
    if (/^[A-Za-z_]/.test(t)) return { v: t };
    throw new Error(`unexpected "${t}" in "${src}"`);
  };
  const prod = (): Expr => {
    let e = atom();
    while (peek() === "*" || peek() === "/") e = { op: toks[i++]!, a: e, b: atom() };
    return e;
  };
  const sum = (): Expr => {
    let e = prod();
    while (peek() === "+" || peek() === "-") e = { op: toks[i++]!, a: e, b: prod() };
    return e;
  };
  const e = sum();
  if (i !== toks.length) throw new Error(`unexpected "${toks[i]}" in "${src}"`);
  return e;
}

export function evalExpr(e: Expr, env: (v: string) => number | undefined): number {
  if ("n" in e) return e.n;
  if ("neg" in e) return -evalExpr(e.neg, env);
  if ("v" in e) {
    const x = env(e.v);
    if (x === undefined) throw new Error(`${e.v} has no value here`);
    return x;
  }
  const a = evalExpr(e.a, env);
  const b = evalExpr(e.b, env);
  const r = e.op === "+" ? a + b : e.op === "-" ? a - b : e.op === "*" ? a * b : a / b;
  return Math.round(r * 1e9) / 1e9;
}

export function parseOp(src: string): Op {
  const s = src.trim();
  let m = /^(read|write|delete|insert)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)$/i.exec(s);
  if (m) return { k: m[1]!.toLowerCase() as "read", x: m[2]! };
  if (/^begin;?$/i.test(s)) return { k: "begin" };
  if (/^(commit|end);?$/i.test(s)) return { k: s.toLowerCase().startsWith("end") ? "end" : "commit" };
  if (/^(rollback|failure|abort);?$/i.test(s)) return { k: "abort", label: s.replace(/;$/, "") };
  m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:?=\s*(.+)$/.exec(s);
  if (m) return { k: "assign", v: m[1]!, expr: parseExpr(m[2]!), src: m[2]!.trim() };
  throw new Error(`can't read the step "${s}" (use Read(X), Write(X), Delete(X), Insert(X), X = expression, Begin, Commit, Rollback or Failure)`);
}

/** Rows look like "T1: Read(A)" or "T1: Begin | T2: Write(X)" (two steps in one time slot). */
export function parseSchedule(rows: string[]): Step[] {
  const steps: Step[] = [];
  rows.forEach((row, r) => {
    for (const part of row.split("|")) {
      const m = /^\s*([A-Za-z][A-Za-z0-9]*)\s*:\s*(.+)$/.exec(part);
      if (!m) throw new Error(`schedule row ${r + 1} ("${part.trim()}") should look like "T1: Read(A)"`);
      steps.push({ row: r, tx: m[1]!, op: parseOp(m[2]!), text: m[2]!.trim() });
    }
  });
  return steps;
}

export function serialSchedule(txns: Record<string, string[]>, order: string[]): Step[] {
  const steps: Step[] = [];
  for (const t of order) {
    if (!txns[t]) throw new Error(`serial order names ${t}, which isn't defined`);
    for (const s of txns[t]!) steps.push({ row: steps.length, tx: t, op: parseOp(s), text: s.trim() });
  }
  return steps;
}

// ---------------------------------------------------------------- running

export type DB = Map<string, number | undefined>;

export interface TraceRow {
  step: Step;
  note: string;
  db: DB;
}

export interface Run {
  final: DB;
  trace: TraceRow[];
  txs: string[];
  status: Map<string, "active" | "committed" | "aborted">;
}

export const fmtNum = (n: number | undefined) => (n === undefined ? "(gone)" : String(Math.round(n * 100) / 100));

export function runSchedule(initial: Record<string, number>, steps: Step[]): Run {
  const db: DB = new Map(Object.entries(initial));
  const local = new Map<string, Map<string, number | undefined>>();
  const status = new Map<string, "active" | "committed" | "aborted">();
  const before = new Map<string, Map<string, number | undefined>>();
  const txs: string[] = [];
  const trace: TraceRow[] = [];
  for (const st of steps) {
    if (!status.has(st.tx)) {
      status.set(st.tx, "active");
      local.set(st.tx, new Map());
      before.set(st.tx, new Map());
      txs.push(st.tx);
    }
    if (status.get(st.tx) !== "active") throw new Error(`${st.tx} has already finished, so it can't ${st.text}`);
    const L = local.get(st.tx)!;
    const B = before.get(st.tx)!;
    const remember = (x: string) => {
      if (!B.has(x)) B.set(x, db.get(x));
    };
    let note = "";
    const op = st.op;
    switch (op.k) {
      case "read":
        if (!db.has(op.x) || db.get(op.x) === undefined) {
          L.set(op.x, undefined);
          note = `${st.tx} looks for ${op.x}: it isn't there`;
        } else {
          L.set(op.x, db.get(op.x));
          note = `${st.tx} reads ${op.x} = ${fmtNum(db.get(op.x))}`;
        }
        break;
      case "write":
      case "insert": {
        const v = L.get(op.x);
        if (v === undefined) throw new Error(`${st.tx} writes ${op.x} without having a value for it (read it or set it first)`);
        remember(op.x);
        db.set(op.x, v);
        note = `${st.tx} ${op.k === "insert" ? "inserts" : "writes"} ${op.x} = ${fmtNum(v)}`;
        break;
      }
      case "delete":
        remember(op.x);
        db.set(op.x, undefined);
        note = `${st.tx} deletes ${op.x}`;
        break;
      case "assign": {
        const v = evalExpr(op.expr, (n) => (L.has(n) ? L.get(n) : undefined));
        L.set(op.v, v);
        note = `in ${st.tx}'s memory, ${op.v} = ${fmtNum(v)}`;
        break;
      }
      case "begin":
        note = `${st.tx} starts`;
        break;
      case "commit":
      case "end":
        status.set(st.tx, "committed");
        note = `${st.tx} commits: its writes are permanent`;
        break;
      case "abort": {
        const undone = [...B.entries()];
        for (const [x, v] of undone) db.set(x, v);
        status.set(st.tx, "aborted");
        note = undone.length
          ? `${st.tx} ${op.label.toLowerCase() === "failure" ? "fails and is rolled back" : "rolls back"}: ${undone.map(([x, v]) => `${x} goes back to ${fmtNum(v)}`).join(", ")}`
          : `${st.tx} ${op.label.toLowerCase() === "failure" ? "fails" : "rolls back"}; it hadn't written anything`;
        break;
      }
    }
    trace.push({ step: st, note, db: new Map(db) });
  }
  return { final: db, trace, txs, status };
}

export function valueOf(expr: string, db: DB): number {
  return evalExpr(parseExpr(expr), (n) => (db.has(n) ? db.get(n) : undefined));
}

// ---------------------------------------------------------------- problems

export type Problem = "dirty" | "unrepeatable" | "phantom" | "lost";

export const problemLabel: Record<Problem, string> = {
  dirty: "Dirty read",
  unrepeatable: "Unrepeatable read",
  phantom: "Phantom read",
  lost: "Lost update (write–write conflict)",
};

export interface Finding {
  kind: Problem;
  text: string;
}

export function findProblems(steps: Step[]): Finding[] {
  const out: Finding[] = [];
  const at = (i: number) => `step ${i + 1}`;
  const abortAt = new Map<string, number>();
  const commitAt = new Map<string, number>();
  steps.forEach((s, i) => {
    if (s.op.k === "abort") abortAt.set(s.tx, i);
    if (s.op.k === "commit" || s.op.k === "end") commitAt.set(s.tx, i);
  });
  const isWrite = (s: Step) => s.op.k === "write";
  const isRowChange = (s: Step) => s.op.k === "delete" || s.op.k === "insert";
  const item = (s: Step) => ("x" in s.op ? s.op.x : undefined);

  steps.forEach((r, i) => {
    if (r.op.k !== "read") return;
    const x = r.op.x;
    // dirty read: the value read was written by another transaction that hadn't committed and later rolls back
    for (let j = i - 1; j >= 0; j--) {
      const w = steps[j]!;
      if (w.op.k === "abort" && steps.slice(0, j).some((p) => p.tx === w.tx && (isWrite(p) || isRowChange(p)) && item(p) === x)) break; // already undone
      if ((isWrite(w) || isRowChange(w)) && item(w) === x) {
        const ab = abortAt.get(w.tx);
        const cm = commitAt.get(w.tx);
        if (w.tx !== r.tx && ab !== undefined && ab > i && (cm === undefined || cm > i))
          out.push({ kind: "dirty", text: `${r.tx} reads ${x} at ${at(i)}, a value ${w.tx} wrote at ${at(j)} but never committed (${w.tx} ${steps[ab]!.op.k === "abort" ? (steps[ab]!.op as { label: string }).label.toLowerCase() : "aborts"} at ${at(ab)}).` });
        break;
      }
    }
    // second read of the same item by the same transaction
    for (let j = i - 1; j >= 0; j--) {
      const p = steps[j]!;
      if (p.tx === r.tx && item(p) === x && (isWrite(p) || isRowChange(p))) break; // it changed X itself
      if (p.tx === r.tx && p.op.k === "read" && p.op.x === x) {
        const between = steps.slice(j + 1, i).map((s, k) => ({ s, k: j + 1 + k })).filter(({ s }) => s.tx !== r.tx && item(s) === x);
        const rows = between.filter(({ s }) => isRowChange(s));
        const writes = between.filter(({ s }) => isWrite(s));
        if (rows.length) out.push({ kind: "phantom", text: `${r.tx} reads ${x} at ${at(j)} and again at ${at(i)}, but ${rows[0]!.s.tx} ${rows[0]!.s.op.k === "delete" ? "deleted" : "inserted"} it at ${at(rows[0]!.k)} in between.` });
        else if (writes.length) out.push({ kind: "unrepeatable", text: `${r.tx} reads ${x} at ${at(j)} and again at ${at(i)}, but ${writes[0]!.s.tx} wrote ${x} at ${at(writes[0]!.k)} in between, so the two reads can differ.` });
        break;
      }
    }
  });
  // lost update: Ti read X, then Tj wrote X, then Ti wrote X from its old read
  steps.forEach((w, i) => {
    if (!isWrite(w)) return;
    const x = item(w)!;
    let lastRead = -1;
    for (let j = i - 1; j >= 0; j--) {
      const p = steps[j]!;
      if (p.tx === w.tx && p.op.k === "read" && p.op.x === x) {
        lastRead = j;
        break;
      }
    }
    if (lastRead < 0) return;
    const lost = steps.slice(lastRead + 1, i).map((s, k) => ({ s, k: lastRead + 1 + k })).filter(({ s }) => s.tx !== w.tx && isWrite(s) && item(s) === x);
    const victim = lost.find(({ s }) => {
      const ab = abortAt.get(s.tx);
      return ab === undefined || ab > i;
    });
    if (victim) out.push({ kind: "lost", text: `${victim.s.tx} writes ${x} at ${at(victim.k)}, but ${w.tx} read ${x} before that (${at(lastRead)}) and overwrites it at ${at(i)}: ${victim.s.tx}'s update is lost.` });
  });
  return out;
}

/** Final values for every serial order of the transactions in the schedule. */
export function serialResults(initial: Record<string, number>, steps: Step[]): { order: string[]; final: DB }[] {
  const txs = [...new Set(steps.map((s) => s.tx))];
  const perms = (a: string[]): string[][] => (a.length <= 1 ? [a] : a.flatMap((t, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [t, ...p])));
  return perms(txs).map((order) => {
    const ser = order.flatMap((t) => steps.filter((s) => s.tx === t));
    return { order, final: runSchedule(initial, ser).final };
  });
}

export const sameDb = (a: DB, b: DB) => [...new Set([...a.keys(), ...b.keys()])].every((k) => a.get(k) === b.get(k));
