import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { ErDiagram } from "../src/schema/content.ts";
import { renderEr } from "../scripts/lib/er.ts";

const dir = new URL("../content/diagrams/", import.meta.url).pathname;
const files = [...new Glob("*.yaml").scanSync({ cwd: dir })].sort();

describe("ER diagrams", () => {
  for (const f of files) {
    test(`${f} renders inside its canvas`, async () => {
      const d = ErDiagram.parse(Bun.YAML.parse(await Bun.file(dir + f).text()));
      const r = renderEr(d);
      expect(r.problems).toEqual([]);
      const out: string[] = [];
      for (const m of r.svg.matchAll(/<ellipse[^>]*cx="([\d.-]+)" cy="([\d.-]+)" rx="([\d.-]+)" ry="([\d.-]+)"/g)) {
        const [cx, cy, rx, ry] = m.slice(1).map(Number) as [number, number, number, number];
        if (cx - rx < 0 || cy - ry < 0 || cx + rx > d.width || cy + ry > d.height) out.push(`oval at ${cx},${cy}`);
      }
      for (const m of r.svg.matchAll(/<rect class="er-entity[^"]*" x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/g)) {
        const [x, y, w, h] = m.slice(1).map(Number) as [number, number, number, number];
        if (x < 0 || y < 0 || x + w > d.width || y + h > d.height) out.push(`entity at ${x},${y}`);
      }
      for (const m of r.svg.matchAll(/<polygon class="er-rel" points="([^"]+)"/g)) {
        for (const p of m[1]!.split(" ")) {
          const [x, y] = p.split(",").map(Number) as [number, number];
          if (x < 0 || y < 0 || x > d.width || y > d.height) out.push(`diamond corner at ${x},${y}`);
        }
      }
      expect(out).toEqual([]);
    });
  }

  test("the text reading names every entity, relationship and cardinality", async () => {
    const d = ErDiagram.parse(Bun.YAML.parse(await Bun.file(dir + "w6-staff.yaml").text()));
    const { description } = renderEr(d);
    for (const e of d.entities) expect(description).toContain(`<b>${e.name}</b>`);
    expect(description).toContain("WORKS_FOR</b> relates DEPARTMENT [1, partial] and EMPLOYEE [N, total] — 1:N");
    expect(description).toContain("DEPENDENT</b> (weak entity)");
    expect(description).toContain("Has</b> (identifying relationship)");
    expect(description).toContain("EMPLOYEE as supervisor [1, partial]");
  });

  test("unknown entities are reported", () => {
    const d = ErDiagram.parse({
      id: "x",
      title: "x",
      width: 400,
      height: 200,
      entities: [{ name: "A", x: 100, y: 100 }],
      relationships: [{ name: "R", x: 200, y: 100, ends: [{ entity: "A" }, { entity: "B" }] }],
    });
    expect(renderEr(d).problems).toEqual(["relationship R links to unknown entity B"]);
  });
});

describe("relationship instances", () => {
  test("the Week 6 quiz's instance question: only the third choice is possible", async () => {
    const { judgeInstance } = await import("../scripts/lib/instances.ts");
    const d = ErDiagram.parse(Bun.YAML.parse(await Bun.file(dir + "w6-abc-1.yaml").text()));
    const sets = { A: ["a1", "a2"], B: ["b1", "b2"], C: ["c1", "c2"] };
    const choices: Record<string, [string, string][]>[] = [
      {},
      { R: [["a2", "b1"], ["a2", "b2"]], S: [["b1", "c1"], ["b2", "c2"]] },
      { R: [["a1", "b1"]], S: [["b1", "c1"], ["b2", "c2"]] },
      { R: [["a1", "b1"], ["a2", "b2"]], S: [["b1", "c1"], ["b1", "c2"]] },
    ];
    const problems: string[] = [];
    const verdicts = choices.map((c) => judgeInstance(d, ["R", "S"], sets, c, problems));
    expect(problems).toEqual([]);
    expect(verdicts.map((v) => v.possible)).toEqual([false, false, true, false]);
    expect(verdicts[0]!.reasons[0]).toContain("c1 and c2 take part in no S instance");
    expect(verdicts[1]!.reasons[0]).toContain("a2 is related to b1 and b2 through R");
    expect(verdicts[3]!.reasons[0]).toContain("b1 is related to c1 and c2 through S");
  });

  test("authoring mistakes are reported", async () => {
    const { judgeInstance } = await import("../scripts/lib/instances.ts");
    const d = ErDiagram.parse(Bun.YAML.parse(await Bun.file(dir + "w6-abc-1.yaml").text()));
    const problems: string[] = [];
    judgeInstance(d, ["R"], { A: ["a1"], B: ["b1"] }, { R: [["a1", "b9"], ["a1", "b9"]], T: [] }, problems);
    expect(problems).toContain("R instance (a1, b9): b9 isn't in the set for B");
    expect(problems).toContain("R lists (a1, b9) twice");
    expect(problems).toContain("instances for T, which isn't one of the question's relationships");
  });
});
