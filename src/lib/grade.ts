import { gradeLocal, gradeQuery, isQueryType, type CQuestion, type Grade } from "../engines/grading.ts";
import { loadDataset } from "./data.ts";
import { getSql } from "./sql.ts";

/** Grade any question. strict=true applies CourseLink's exact-spelling rule to True/False blanks. */
export async function grade(q: CQuestion, answer: unknown, strict?: boolean): Promise<Grade> {
  if (isQueryType(q.type)) {
    const src = String(answer ?? "").trim();
    if (!src) return { score: 0, correct: false, feedback: "No answer given." };
    return gradeQuery(q, src, { dataset: loadDataset, sql: getSql });
  }
  return gradeLocal(q, answer, { strict });
}
