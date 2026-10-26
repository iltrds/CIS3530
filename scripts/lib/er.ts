/**
 * Renders an ER diagram (Chen notation, as used in CIS3530) to static SVG at build time.
 *
 * Entities are rectangles (double for weak entities), relationships are diamonds
 * (double for identifying relationships), attributes are ovals: key attributes
 * underlined, partial keys dashed-underlined, multivalued attributes double, derived
 * attributes dashed, composite attributes with their parts hanging off them.
 * Cardinalities are written on the links next to the entity they belong to, and a
 * double line marks total participation.
 *
 * Lines are drawn first and shapes on top (shapes are filled), so a line can simply
 * run centre to centre and the shape hides the part inside it.
 */
import type { ErAttribute, ErDiagram } from "../../src/schema/content.ts";

type Side = "top" | "bottom" | "left" | "right";
interface Pt {
  x: number;
  y: number;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Rough text width in px for the UI font (no font metrics at build time). */
export function textWidth(s: string, size = 13, bold = false): number {
  let w = 0;
  for (const ch of s) {
    if (/[A-Z]/.test(ch)) w += ch === "M" || ch === "W" ? 0.86 : ch === "I" ? 0.32 : 0.68;
    else if (/[mw]/.test(ch)) w += 0.84;
    else if (/[iljtf.,:;'|!]/.test(ch)) w += 0.3;
    else if (/[0-9]/.test(ch)) w += 0.58;
    else if (ch === " ") w += 0.28;
    else if (ch === "_" || ch === "#") w += 0.58;
    else w += 0.56;
  }
  return w * size * (bold ? 1.06 : 1);
}

const ENT_H = 42;
const ATTR_RY = 16;
const DIA_B = 30;

interface Box {
  kind: "entity" | "rel";
  name: string;
  c: Pt;
  hw: number; // half width (entity) or half diagonal a (diamond)
  hh: number; // half height (entity) or half diagonal b (diamond)
}

const entityBox = (name: string, x: number, y: number): Box => ({
  kind: "entity",
  name,
  c: { x, y },
  hw: Math.max(52, textWidth(name, 14, true) / 2 + 16),
  hh: ENT_H / 2,
});
const relBox = (name: string, x: number, y: number): Box => ({
  kind: "rel",
  name,
  c: { x, y },
  hw: Math.max(50, textWidth(name, 13, true) * 0.66 + 10),
  hh: DIA_B,
});
const attrRx = (name: string) => textWidth(name, 12.5) / 2 + 13;

/** Where the ray from the box centre towards `p` leaves the box. */
function clip(b: Box, p: Pt): Pt {
  const dx = p.x - b.c.x, dy = p.y - b.c.y;
  if (!dx && !dy) return b.c;
  const t = b.kind === "entity" ? Math.min(b.hw / Math.abs(dx || 1e-9), b.hh / Math.abs(dy || 1e-9)) : 1 / (Math.abs(dx) / b.hw + Math.abs(dy) / b.hh);
  return { x: b.c.x + dx * t, y: b.c.y + dy * t };
}

function corner(b: Box, s: Side): Pt {
  const { x, y } = b.c;
  return s === "top" ? { x, y: y - b.hh } : s === "bottom" ? { x, y: y + b.hh } : s === "left" ? { x: x - b.hw, y } : { x: x + b.hw, y };
}

function sidePoint(b: Box, s: Side, offset: number): Pt {
  const p = corner(b, s);
  return s === "top" || s === "bottom" ? { x: p.x + offset, y: p.y } : { x: p.x, y: p.y + offset };
}

interface PlacedAttr {
  a: ErAttribute;
  c: Pt;
  rx: number;
  owner: Pt;
  parts: { name: string; c: Pt; rx: number }[];
}

/** Lays out the attributes of one owner (entity or relationship). */
function placeAttrs(owner: Box, attrs: ErAttribute[], defSide: Side): PlacedAttr[] {
  const out: PlacedAttr[] = [];
  const bySide: Record<Side, ErAttribute[]> = { top: [], bottom: [], left: [], right: [] };
  for (const a of attrs) if (!a.at) bySide[a.side ?? defSide].push(a);
  const gap = 10;
  const dist = owner.kind === "entity" ? 50 : 44;

  for (const s of Object.keys(bySide) as Side[]) {
    const list = bySide[s];
    if (!list.length) continue;
    if (s === "top" || s === "bottom") {
      const widths = list.map((a) => 2 * attrRx(a.name));
      const total = widths.reduce((p, w) => p + w, 0) + gap * (list.length - 1);
      let x = owner.c.x - total / 2;
      const y = owner.c.y + (s === "top" ? -1 : 1) * (owner.hh + dist);
      list.forEach((a, i) => {
        out.push({ a, c: { x: x + widths[i]! / 2, y }, rx: widths[i]! / 2, owner: owner.c, parts: [] });
        x += widths[i]! + gap;
      });
    } else {
      const step = 2 * ATTR_RY + 8;
      let y = owner.c.y - ((list.length - 1) * step) / 2;
      for (const a of list) {
        const rx = attrRx(a.name);
        const x = owner.c.x + (s === "left" ? -1 : 1) * (owner.hw + 26 + rx);
        out.push({ a, c: { x, y }, rx, owner: owner.c, parts: [] });
        y += step;
      }
    }
  }
  for (const a of attrs) if (a.at) out.push({ a, c: { x: a.at[0], y: a.at[1] }, rx: attrRx(a.name), owner: owner.c, parts: [] });

  // composite parts: one row further out, in the direction the attribute sits from its owner
  for (const p of out) {
    if (!p.a.parts.length) continue;
    const dx = p.c.x - owner.c.x, dy = p.c.y - owner.c.y;
    const vertical = Math.abs(dy) >= Math.abs(dx) * 0.6;
    if (vertical) {
      const widths = p.a.parts.map((n) => 2 * attrRx(n));
      const total = widths.reduce((s, w) => s + w, 0) + 8 * (widths.length - 1);
      let x = p.c.x - total / 2;
      const y = p.c.y + Math.sign(dy || -1) * 48;
      p.a.parts.forEach((n, i) => {
        p.parts.push({ name: n, c: { x: x + widths[i]! / 2, y }, rx: widths[i]! / 2 });
        x += widths[i]! + 8;
      });
    } else {
      const step = 2 * ATTR_RY + 6;
      let y = p.c.y - ((p.a.parts.length - 1) * step) / 2;
      for (const n of p.a.parts) {
        const rx = attrRx(n);
        p.parts.push({ name: n, c: { x: p.c.x + Math.sign(dx) * (p.rx + 24 + rx), y }, rx });
        y += step;
      }
    }
  }
  return out;
}

function attrSvg(name: string, c: Pt, rx: number, a?: ErAttribute): string {
  const cls = ["er-attr", a?.derived ? "er-derived" : ""].filter(Boolean).join(" ");
  let s = `<ellipse class="${cls}" cx="${r1(c.x)}" cy="${r1(c.y)}" rx="${r1(rx)}" ry="${ATTR_RY}"/>`;
  if (a?.multi) s += `<ellipse class="er-attr er-inner" cx="${r1(c.x)}" cy="${r1(c.y)}" rx="${r1(rx - 4)}" ry="${ATTR_RY - 4}"/>`;
  s += `<text class="er-attr-text" x="${r1(c.x)}" y="${r1(c.y)}" dy="0.35em" text-anchor="middle">${esc(name)}</text>`;
  if (a?.key || a?.partial) {
    const tw = textWidth(name, 12.5);
    s += `<line class="er-key${a.partial ? " er-partial" : ""}" x1="${r1(c.x - tw / 2)}" x2="${r1(c.x + tw / 2)}" y1="${r1(c.y + 8)}" y2="${r1(c.y + 8)}"/>`;
  }
  return s;
}

function pathD(pts: Pt[]): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${r1(p.x)} ${r1(p.y)}`).join(" ");
}

/** A label beside the point `at` on a segment going in direction `dir`, pushed off the line along its normal. */
function sideLabel(at: Pt, dir: Pt, flip: boolean, text: string, cls: string): string {
  let nx = -dir.y, ny = dir.x; // left-hand normal
  if (flip) (nx = -nx), (ny = -ny);
  const x = at.x + nx * 9, y = at.y + ny * 11;
  const anchor = nx > 0.35 ? "start" : nx < -0.35 ? "end" : "middle";
  return `<text class="${cls}" x="${r1(x)}" y="${r1(y)}" dy="0.35em" text-anchor="${anchor}">${esc(text)}</text>`;
}

const unit = (a: Pt, b: Pt): Pt => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
};

export interface RenderedDiagram {
  svg: string;
  /** Plain-language reading of the diagram (HTML list), for screen readers and for checking. */
  description: string;
  problems: string[];
}

export function renderEr(d: ErDiagram): RenderedDiagram {
  const problems: string[] = [];
  const boxes = new Map<string, Box>();
  for (const e of d.entities) {
    if (boxes.has(e.name)) problems.push(`entity ${e.name} appears twice`);
    boxes.set(e.name, entityBox(e.name, e.x, e.y));
  }

  const lines: string[] = []; // drawn first
  const shapes: string[] = []; // drawn on top
  const labels: string[] = []; // drawn last

  const drawAttrs = (owner: Box, attrs: ErAttribute[], side: Side) => {
    for (const p of placeAttrs(owner, attrs, side)) {
      lines.push(`<path class="er-line" d="${pathD([owner.c, p.c])}"/>`);
      for (const part of p.parts) {
        lines.push(`<path class="er-line" d="${pathD([p.c, part.c])}"/>`);
        shapes.push(attrSvg(part.name, part.c, part.rx));
      }
      shapes.push(attrSvg(p.a.name, p.c, p.rx, p.a));
    }
  };

  for (const r of d.relationships) {
    const rb = relBox(r.name, r.x, r.y);
    for (const end of r.ends) {
      const eb = boxes.get(end.entity);
      if (!eb) {
        problems.push(`relationship ${r.name} links to unknown entity ${end.entity}`);
        continue;
      }
      let pts: Pt[];
      if (end.via.length) {
        const first = { x: end.via[0]![0], y: end.via[0]![1] }, lastV = { x: end.via.at(-1)![0], y: end.via.at(-1)![1] };
        const start = end.from ? corner(rb, end.from) : clip(rb, first);
        const stop = end.to ? sidePoint(eb, end.to, end.offset) : clip(eb, lastV);
        pts = [start, ...end.via.map(([x, y]) => ({ x, y })), stop];
      } else if (end.from || end.to) {
        const start = end.from ? corner(rb, end.from) : rb.c;
        const stop = end.to ? sidePoint(eb, end.to, end.offset) : eb.c;
        const startVertical = end.from ? end.from === "top" || end.from === "bottom" : !(end.to === "top" || end.to === "bottom");
        const elbow = startVertical ? { x: start.x, y: stop.y } : { x: stop.x, y: start.y };
        const straight = Math.abs(start.x - stop.x) < 0.5 || Math.abs(start.y - stop.y) < 0.5;
        pts = straight || !end.bend ? [start, stop] : [start, elbow, stop];
      } else {
        pts = [rb.c, clip(eb, rb.c)];
        pts[0] = clip(rb, eb.c);
      }
      const d0 = pathD(pts);
      if (end.total) lines.push(`<path class="er-line er-total" d="${d0}"/><path class="er-total-gap" d="${d0}"/>`);
      else lines.push(`<path class="er-line" d="${d0}"/>`);

      // labels: cardinality near the entity, role near the diamond
      const last = pts[pts.length - 1]!, prev = pts[pts.length - 2]!;
      const inward = unit(last, prev); // from the entity back towards the diamond
      if (end.card) {
        // next to where the line meets the entity, on the side of the line away from the entity's middle
        const onLR = Math.abs(Math.abs(last.x - eb.c.x) - eb.hw) < 1 && Math.abs(last.y - eb.c.y) < eb.hh;
        if (onLR) {
          const out = Math.sign(last.x - eb.c.x);
          let sy = last.y > eb.c.y + 1 ? 1 : -1;
          if (end.flip) sy = -sy;
          const rise = Math.abs(inward.x) > 0.01 ? (inward.y / Math.abs(inward.x)) * 13 : 0;
          labels.push(`<text class="er-card" x="${r1(last.x + out * 13)}" y="${r1(last.y + rise + sy * 12)}" dy="0.35em" text-anchor="middle">${esc(end.card)}</text>`);
        } else {
          const out = Math.sign(last.y - eb.c.y) || -1;
          let sx = last.x < eb.c.x - 1 ? -1 : 1;
          if (end.flip) sx = -sx;
          const slope = Math.abs(inward.y) > 0.01 ? inward.x / Math.abs(inward.y) : 0;
          const lx = last.x + slope * 16 + sx * 9;
          labels.push(`<text class="er-card" x="${r1(lx)}" y="${r1(last.y + out * 16)}" dy="0.35em" text-anchor="${sx > 0 ? "start" : "end"}">${esc(end.card)}</text>`);
        }
      }
      if (end.role) {
        // near the diamond, on the side of the line away from the diamond's middle (flip overrides)
        const first = pts[0]!, second = pts[1]!;
        const out = unit(first, second);
        const len = Math.hypot(second.x - first.x, second.y - first.y);
        const t = Math.min(28, len / 2);
        const at = { x: first.x + out.x * t, y: first.y + out.y * t };
        const n = { x: -out.y, y: out.x };
        const leftAway = (at.x + n.x - rb.c.x) ** 2 + (at.y + n.y - rb.c.y) ** 2 >= (at.x - n.x - rb.c.x) ** 2 + (at.y - n.y - rb.c.y) ** 2;
        labels.push(sideLabel(at, out, !leftAway, end.role, "er-role"));
      }

    }
    drawAttrs(rb, r.attrs, r.attrSide);
    const { x, y } = rb.c, a = rb.hw, b = rb.hh;
    const poly = (k: number) => `${r1(x)},${r1(y - b + k)} ${r1(x + a - k * (a / b))},${r1(y)} ${r1(x)},${r1(y + b - k)} ${r1(x - a + k * (a / b))},${r1(y)}`;
    shapes.push(`<polygon class="er-rel" points="${poly(0)}"/>`);
    if (r.identifying) shapes.push(`<polygon class="er-rel er-inner" points="${poly(5)}"/>`);
    shapes.push(`<text class="er-rel-text" x="${r1(x)}" y="${r1(y)}" dy="0.35em" text-anchor="middle">${esc(r.name)}</text>`);
  }

  for (const e of d.entities) {
    const b = boxes.get(e.name)!;
    drawAttrs(b, e.attrs, e.attrSide);
    const rect = (k: number) => `x="${r1(b.c.x - b.hw + k)}" y="${r1(b.c.y - b.hh + k)}" width="${r1(2 * (b.hw - k))}" height="${r1(2 * (b.hh - k))}"`;
    shapes.push(`<rect class="er-entity" ${rect(0)}/>`);
    if (e.weak) shapes.push(`<rect class="er-entity er-inner" ${rect(4)}/>`);
    shapes.push(`<text class="er-entity-text" x="${r1(b.c.x)}" y="${r1(b.c.y)}" dy="0.35em" text-anchor="middle">${esc(e.name)}</text>`);
  }

  const description = describe(d);
  const aria = `${d.title}. ${description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`;
  const svg =
    `<svg class="er-svg" viewBox="0 0 ${d.width} ${d.height}" width="${d.width}" style="min-width:${Math.min(d.width, 560)}px" role="img" aria-label="${esc(aria)}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect class="er-bg" width="${d.width}" height="${d.height}"/>` +
    lines.join("") +
    shapes.join("") +
    labels.join("") +
    `</svg>`;
  return { svg, description, problems };
}

function attrPhrase(a: ErAttribute): string {
  const kinds: string[] = [];
  if (a.key) kinds.push("key");
  if (a.partial) kinds.push("partial key");
  if (a.multi) kinds.push("multivalued");
  if (a.derived) kinds.push("derived");
  if (a.parts.length) kinds.push(`composite of ${a.parts.join(", ")}`);
  return kinds.length ? `${esc(a.name)} (${kinds.join("; ")})` : esc(a.name);
}

function describe(d: ErDiagram): string {
  const items: string[] = [];
  for (const e of d.entities) {
    const attrs = e.attrs.length ? `: ${e.attrs.map(attrPhrase).join(", ")}` : "";
    items.push(`<li><b>${esc(e.name)}</b>${e.weak ? " (weak entity)" : ""}${attrs}</li>`);
  }
  for (const r of d.relationships) {
    const ends = r.ends.map((x) => `${esc(x.entity)}${x.role ? ` as ${esc(x.role)}` : ""} [${x.card ?? "?"}, ${x.total ? "total" : "partial"}]`);
    const ratio = r.ends.length === 2 && r.ends.every((x) => x.card) ? ` — ${r.ends.map((x) => x.card).join(":")}` : "";
    const attrs = r.attrs.length ? `; attributes: ${r.attrs.map(attrPhrase).join(", ")}` : "";
    items.push(`<li><b>${esc(r.name)}</b>${r.identifying ? " (identifying relationship)" : ""} relates ${ends.join(" and ")}${ratio}${attrs}</li>`);
  }
  return `<ul>${items.join("")}</ul>`;
}

/** The HTML that replaces a {{er:id}} placeholder. */
export function figureHtml(d: ErDiagram, r: RenderedDiagram, captionHtml: string): string {
  return (
    `<figure class="er-figure" data-er="${d.id}" style="--er-w:${d.width}px">` +
    `<div class="er-scroll">${r.svg}</div>` +
    `<figcaption><span class="er-title">${esc(d.title)}</span>${captionHtml ? ` ${captionHtml}` : ""}</figcaption>` +
    `<details class="er-desc"><summary>Read the diagram as text</summary>${r.description}<p class="er-desc-note">In [c, p], c is the cardinality written next to that entity and p its participation.</p></details>` +
    `</figure>`
  );
}
