import { describe, expect, test } from "bun:test";
import { Dataset } from "../src/schema/content.ts";
import { toEnv } from "../src/engines/datasets.ts";
import { run, parse, sameRelation, relationToTable, RAError } from "../src/engines/ra/ra.ts";

const load = async (id: string) => Dataset.parse((await import(`../content/datasets/${id}.yaml`)).default);
const env = async (id: string) => toEnv(await load(id));
const vals = (src: string, e: Awaited<ReturnType<typeof env>>) => run(src, e).result.rows;

describe("parser", () => {
  test("accepts symbols and ASCII aliases alike", () => {
    expect(() => parse("π aName (σ nationality = 'British' (Artists))")).not.toThrow();
    expect(() => parse("pi aName (sigma nationality = 'British' (Artists))")).not.toThrow();
    expect(() => parse("pi[aName](sigma[nationality='British'](Artists))")).not.toThrow();
  });
  test("reports position of errors", () => {
    try {
      parse("π aName (σ nationality = (Artists)");
      throw new Error("should fail");
    } catch (e) {
      expect(e).toBeInstanceOf(RAError);
    }
  });
});

describe("Week 2 queries on movies-v1", async () => {
  const e = await env("movies-v1");
  test("British actors", () => {
    expect(vals("π aName (σ nationality = 'British' (Artists))", e)).toEqual([["Stone"]]);
  });
  test("curly quotes from the slides work", () => {
    expect(vals("π aName (σ nationality = ‘British’ (Artists))", e)).toEqual([["Stone"]]);
    expect(vals("π title (σ director = ”Kubrick” (Movies))", e).length).toBe(2);
  });
  test("directors of 1970s movies", () => {
    const r = vals("π director (σ year >= 1970 ∧ year <= 1979 (Movies))", e).flat().sort();
    expect(r).toEqual(["Lucas", "Polaski"]);
  });
  test("characters in 1970s movies, three equivalent ways", () => {
    const a = run("π character (σ Roles.mID = Movies.mID ∧ year >= 1970 ∧ year <= 1979 (Roles × Movies))", e).result;
    const b = run("π character (σ year >= 1970 ∧ year <= 1979 (Movies) ⋈ Roles)", e).result;
    const c = run("R1 := σ year >= 1970 ∧ year < 1980 (Movies)\nR2 := σ Roles.mID = R1.mID (Roles X R1)\nAns := π character (R2)", e).result;
    for (const r of [a, b, c]) expect(r.rows.flat().sort()).toEqual(["Bob Falfa", "Han Solo", "Jake 'J.J.' Gittes", "Princess Leia Organa"]);
  });
  test("cardinality rules", () => {
    expect(run("Artists × Roles", e).result.rows.length).toBe(24);
    expect(run("Artists × Roles", e).result.attrs.length).toBe(6);
    expect(run("Artists ⋈ Roles", e).result.rows.length).toBe(6);
    expect(run("Artists ⋈ Roles", e).result.attrs.length).toBe(5);
  });
  test("Kubrick question from the slides: both orders give the same actors", () => {
    const a = vals("πaName(σdirector='Kubrick' (Artists ⋈ Roles ⋈ Movies))", e).flat().sort();
    const b = vals("πaName ((σdirector='Kubrick' Movies) ⋈ Roles ⋈ Artists)", e).flat().sort();
    expect(a).toEqual(["Nicholson", "Stone"]);
    expect(b).toEqual(a);
  });
  test("American actors in a Kubrick movie (Worksheet 2 style)", () => {
    expect(vals("π aName, title (σ nationality='American' ∧ director='Kubrick' (Artists ⋈ Roles ⋈ Movies))", e)).toEqual([["Nicholson", "Shining"]]);
  });
  test("pairs of movies with the same director via ρ", () => {
    const r = run("π M1.title, M2.title (σ M1.director = M2.director ∧ M1.mID < M2.mID (ρ M1 (Movies) × ρ M2 (Movies)))", e).result;
    expect(r.rows.length).toBe(3);
  });
  test("self-product without rename is ambiguous", () => {
    expect(() => run("σ director = director (Movies × Movies)", e)).toThrow(/ambiguous/);
  });
  test("projection removes duplicates", () => {
    expect(vals("π nationality (Artists)", e).length).toBe(2);
  });
  test("set difference: actors not in movie 1", () => {
    const r = vals("π aName ((π aID (Artists) − π aID (σ mID = 1 (Roles))) ⋈ Artists)", e).flat().sort();
    expect(r).toEqual(["Fisher", "Ford"]);
  });
  test("union compatibility is enforced", () => {
    expect(() => run("Artists ∪ Roles", e)).toThrow(/domains/); // same degree, different domains
    expect(() => run("π aName (Artists) ∪ π character (Roles)", e)).not.toThrow();
    expect(() => run("Artists ∪ Movies", e)).toThrow(/union-compatible/);
  });
});

describe("outer joins and division", async () => {
  const o = await env("movies-outer");
  const d = await env("movies-v2");
  test("left outer join keeps Bachchan", () => {
    const r = run("Artists ⟕ Roles", o).result;
    expect(r.rows.length).toBe(7);
    expect(r.rows.find((x) => x[1] === "Bachchan")![3]).toBeNull();
    expect(run("Artists ⋈ left Roles", o).result.rows.length).toBe(7);
    expect(run("Artists ljoin Roles", o).result.rows.length).toBe(7);
  });
  test("division: actors in every movie", () => {
    expect(vals("π aName ((π mID, aID (Roles) ÷ π mID (Movies)) ⋈ Artists)", d)).toEqual([["Nicholson"]]);
  });
  const t = async () => env("toy");
  test("slide division example", async () => {
    expect(vals("D1 ÷ D2", await t()).flat().sort()).toEqual(["A", "B"]);
  });
  test("slide outer join examples", async () => {
    const e = await t();
    expect(run("J1 ⋈ J2", e).result.rows.length).toBe(2);
    expect(run("J1 ⟕ J2", e).result.rows.length).toBe(3);
    expect(run("J1 ⟖ J2", e).result.rows.length).toBe(3);
    expect(run("J1 ⟗ J2", e).result.rows.length).toBe(4);
  });
});

describe("grading comparison", () => {
  test("column order by name and set semantics", () => {
    const got = { cols: ["b", "a"], rows: [[2, 1], [2, 1]] };
    const want = { cols: ["a", "b"], rows: [[1, 2]] };
    expect(sameRelation(got, want).ok).toBe(true);
    expect(sameRelation(got, want, "bag").ok).toBe(false);
  });
  test("explains row count mismatches", () => {
    const r = sameRelation({ cols: ["a"], rows: [[1]] }, { cols: ["a"], rows: [[1], [2]] });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("missing");
  });
  test("relationToTable qualifies duplicate names", async () => {
    const e = await env("movies-v1");
    expect(relationToTable(run("Movies × Roles", e).result).cols).toContain("Movies.mID");
  });
});
