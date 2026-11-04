import { describe, expect, test } from "bun:test";
import { FDSet, judgeClaim, lossless, parseFD, parseRelation, preserving } from "../scripts/lib/fd.ts";

const make = (rel: string, fds: string[]) => new FDSet(parseRelation(rel), fds.map(parseFD));

// The lecture's examples
const FIRST = make("FIRST(S#, STATUS, CITY, P#, QTY)", ["S#, P# -> QTY", "S# -> CITY", "CITY -> STATUS"]);
const TEACH = make("TEACH(Student, Course, Instructor)", ["Student, Course -> Instructor", "Instructor -> Course"]);

describe("functional dependencies", () => {
  test("closures and keys", () => {
    expect(FIRST.closure(["S#"])).toEqual(["S#", "STATUS", "CITY"]);
    expect(FIRST.candidateKeys()).toEqual([["S#", "P#"]]);
    expect(TEACH.candidateKeys()).toEqual([
      ["Student", "Course"],
      ["Student", "Instructor"],
    ]);
  });

  test("normal forms follow the course's primary-key definitions", () => {
    expect(FIRST.normalForm(["S#", "P#"])).toBe("1NF");
    const v = FIRST.violations(["S#", "P#"]);
    expect(v.partial.map((d) => `${d.lhs}->${d.a}`).sort()).toEqual(["S#->CITY", "S#->STATUS"]);
    expect(v.transitive.map((d) => `${d.lhs}->${d.a}`)).toEqual(["CITY->STATUS"]);
    const SECOND = make("SECOND(S#, CITY, STATUS)", ["S# -> CITY", "CITY -> STATUS"]);
    expect(SECOND.normalForm(["S#"])).toBe("2NF");
    expect(make("SC(S#, CITY)", ["S# -> CITY"]).normalForm(["S#"])).toBe("BCNF");
    // TEACH: 3NF with (Student, Course) as the key, not even 2NF with (Student, Instructor)
    expect(TEACH.normalForm(["Student", "Course"])).toBe("3NF");
    expect(TEACH.normalForm(["Student", "Instructor"])).toBe("1NF");
  });

  test("decompositions", () => {
    expect(lossless(FIRST, ["S#", "P#", "QTY"], ["S#", "CITY", "STATUS"]).ok).toBe(true);
    const SECOND = make("SECOND(S#, CITY, STATUS)", ["S# -> CITY", "CITY -> STATUS"]);
    // the lecture's three options for SECOND
    expect(lossless(SECOND, ["S#", "CITY"], ["CITY", "STATUS"]).ok && preserving(SECOND, [["S#", "CITY"], ["CITY", "STATUS"]]).ok).toBe(true);
    expect(lossless(SECOND, ["S#", "STATUS"], ["S#", "CITY"]).ok).toBe(true);
    expect(preserving(SECOND, [["S#", "STATUS"], ["S#", "CITY"]]).ok).toBe(false); // CITY -> STATUS is lost
    expect(lossless(SECOND, ["S#", "STATUS"], ["CITY", "STATUS"]).ok).toBe(false);
    // U(A, B, C) from the lecture: (A, B) + (A, C) is fine when A is a key; (A, B) + (B, C) is lossy
    const U = make("U(A, B, C)", ["A -> B", "A -> C"]);
    expect(lossless(U, ["A", "B"], ["A", "C"]).ok).toBe(true);
    expect(lossless(U, ["A", "B"], ["B", "C"]).ok).toBe(false);
    // TEACH into (Student, Instructor) and (Instructor, Course): lossless but loses (Student, Course) -> Instructor
    expect(lossless(TEACH, ["Student", "Instructor"], ["Instructor", "Course"]).ok).toBe(true);
    expect(preserving(TEACH, [["Student", "Instructor"], ["Instructor", "Course"]]).ok).toBe(false);
  });

  test("claims", () => {
    const pk = ["S#", "P#"];
    expect(judgeClaim(FIRST, pk, { partial: "S#, P# -> CITY" }).value).toBe(true);
    expect(judgeClaim(FIRST, pk, { full: "S#, P# -> QTY" }).value).toBe(true);
    expect(judgeClaim(FIRST, pk, { transitive: "S# -> STATUS" }).value).toBe(true);
    expect(judgeClaim(FIRST, pk, { transitive: "S# -> CITY" }).value).toBe(false);
    expect(judgeClaim(FIRST, pk, { trivial: "CITY, STATUS -> STATUS" }).value).toBe(true);
    expect(judgeClaim(FIRST, pk, { insertAnomaly: ["S#", "CITY", "STATUS"] }).value).toBe(true);
    expect(judgeClaim(FIRST, pk, { insertAnomaly: ["S#", "P#", "QTY"] }).value).toBe(false);
    expect(judgeClaim(FIRST, pk, { key: ["S#", "P#", "QTY"] }).value).toBe(false);
    expect(judgeClaim(FIRST, pk, { superkey: ["S#", "P#", "QTY"] }).value).toBe(true);
    expect(judgeClaim(FIRST, pk, { nf: "2NF" }).value).toBe(false);
    const rows = [
      ["S1", 20, "London", "P1", 300],
      ["S2", 10, "Paris", "P1", 300],
      ["S3", 30, "Paris", "P2", 200],
    ];
    expect(judgeClaim(FIRST, pk, { satisfied: "CITY -> STATUS" }, rows).value).toBe(false);
    expect(judgeClaim(FIRST, pk, { satisfied: "P# -> QTY" }, rows).value).toBe(true);
    expect(() => judgeClaim(FIRST, pk, { holds: "S# -> COLOUR" })).toThrow();
  });
});

describe("multivalued dependencies and 4NF", () => {
  test("the lecture's SCH, PERSON and STUINFO", async () => {
    const { parseMVD, instanceBreaksMVD } = await import("../scripts/lib/fd.ts");
    const rel = parseRelation("SCH(Student, Courses, Hobbies)");
    const SCH = new FDSet(rel, [], [parseMVD("Student ->> Courses | Hobbies")]);
    expect(SCH.candidateKeys()).toEqual([["Student", "Courses", "Hobbies"]]);
    expect(SCH.normalForm(["Student", "Courses", "Hobbies"])).toBe("BCNF");
    // decomposed: SC(Student, Courses) has only a trivial MVD
    const SC = new FDSet(parseRelation("SC(Student, Courses)"), [], [parseMVD("Student ->> Courses")]);
    expect(SC.normalForm(["Student", "Courses"])).toBe("4NF");
    // STUINFO: its MVDs are FDs on the key
    const ST = new FDSet(parseRelation("STUINFO(StudentNo, Height, ShoeSize)"), [parseFD("StudentNo -> Height, ShoeSize")], [parseMVD("StudentNo ->> Height | ShoeSize")]);
    expect(ST.normalForm(["StudentNo"])).toBe("4NF");
    // the flattened SCH instance from the lecture satisfies the MVD; drop one row and it doesn't
    const rows = [
      ["Jin", "DBMS", "Tennis"], ["Jin", "DBMS", "Cooking"], ["Jin", "OS", "Tennis"], ["Jin", "OS", "Cooking"],
      ["Habib", "C++", "Reading"], ["Habib", "C++", "Surfing"], ["Habib", "Networking", "Reading"], ["Habib", "Networking", "Surfing"], ["Habib", "CA", "Reading"], ["Habib", "CA", "Surfing"],
    ];
    const m = parseMVD("Student ->> Courses");
    expect(instanceBreaksMVD(rel, rows, m)).toBeUndefined();
    expect(instanceBreaksMVD(rel, rows.slice(1), m)).toBeDefined();
    expect(judgeClaim(SCH, ["Student", "Courses", "Hobbies"], { nf: "4NF" }).value).toBe(false);
  });
});

test("a decomposition along an MVD is lossless", async () => {
  const { parseMVD, lossless: ll } = await import("../scripts/lib/fd.ts");
  const P = new FDSet(parseRelation("PERSON(SIN, PhoneNo, KidSIN)"), [], [parseMVD("SIN ->> PhoneNo | KidSIN")]);
  expect(ll(P, ["SIN", "PhoneNo"], ["SIN", "KidSIN"]).ok).toBe(true);
  expect(ll(P, ["SIN", "PhoneNo"], ["PhoneNo", "KidSIN"]).ok).toBe(false);
  const noMvd = new FDSet(parseRelation("OFFER(Course, Teacher, Book)"), [], []);
  expect(ll(noMvd, ["Course", "Teacher"], ["Course", "Book"]).ok).toBe(false);
});
