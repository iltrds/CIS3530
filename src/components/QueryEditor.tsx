import { useRef, type KeyboardEvent } from "react";

const RA_SYMBOLS: [string, string][] = [
  ["σ", "select"],
  ["π", "project"],
  ["ρ", "rename"],
  ["×", "Cartesian product"],
  ["⋈", "natural join"],
  ["⟕", "left outer join"],
  ["⟖", "right outer join"],
  ["⟗", "full outer join"],
  ["÷", "divide"],
  ["∪", "union"],
  ["∩", "intersect"],
  ["−", "difference"],
  ["∧", "and"],
  ["∨", "or"],
  ["¬", "not"],
  [":=", "assign"],
];

/** Textarea for RA or SQL. Ctrl/Cmd+Enter runs. RA gets a symbol palette. */
export function QueryEditor({
  lang,
  value,
  onChange,
  onRun,
  disabled,
  rows = 4,
  label,
}: {
  lang: "ra" | "sql";
  value: string;
  onChange: (v: string) => void;
  onRun?: () => void;
  disabled?: boolean;
  rows?: number;
  label: string;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const insert = (s: string) => {
    const el = ta.current;
    if (!el) return onChange(value + s);
    const { selectionStart: a, selectionEnd: b } = el;
    const pad = s.length === 1 && /[σπρ]/.test(s) ? s + " " : ` ${s} `;
    const next = value.slice(0, a) + pad + value.slice(b);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = a + pad.length;
    });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && onRun) {
      e.preventDefault();
      onRun();
    }
  };
  return (
    <div className="editor">
      {lang === "ra" && !disabled && (
        <div className="symbols" role="toolbar" aria-label="Insert a relational algebra symbol">
          {RA_SYMBOLS.map(([s, name]) => (
            <button type="button" key={s} title={name} aria-label={`Insert ${name}`} onClick={() => insert(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={ta}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        rows={rows}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder={lang === "ra" ? "e.g. π aName (σ nationality = 'British' (Artists))" : "SELECT … FROM … WHERE …;"}
      />
      {!disabled && (
        <div className="editor-hint">
          {lang === "ra" ? "Symbols or words both work: sigma, pi, rho, x, join, ljoin, divide, union, intersect, minus, and, or. " : ""}
          Ctrl/⌘ + Enter to run.
        </div>
      )}
    </div>
  );
}
