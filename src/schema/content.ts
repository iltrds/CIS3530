/**
 * Content schemas. These are the single source of truth for the shape of every
 * YAML file under content/. The build and validator parse with them; the UI
 * imports the inferred types (after build-time compilation, see compiled.ts).
 */
import { z } from "zod";

// ---------------------------------------------------------------- datasets

export const Scalar = z.union([z.string(), z.number(), z.null()]);
export type Scalar = z.infer<typeof Scalar>;

export const ColumnType = z.enum(["text", "int", "numeric", "date"]);

export const Column = z.object({
  name: z.string(),
  type: ColumnType.default("text"),
  pk: z.boolean().default(false),
  notNull: z.boolean().default(false),
});

export const ForeignKey = z.object({
  columns: z.array(z.string()).min(1),
  references: z.object({ table: z.string(), columns: z.array(z.string()).min(1) }),
});

export const Table = z.object({
  name: z.string(),
  columns: z.array(Column).min(1),
  foreignKeys: z.array(ForeignKey).default([]),
  unique: z.array(z.array(z.string())).default([]),
  rows: z.array(z.array(Scalar)).default([]),
});

export const Dataset = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  description: z.string().default(""),
  source: z.string().default(""),
  /** Hidden datasets exist only to grade answers against a second instance. */
  hidden: z.boolean().default(false),
  /** For hidden datasets: which visible dataset this is an alternate of. */
  alternateOf: z.array(z.string()).default([]),
  tables: z.array(Table).min(1),
});
export type Dataset = z.infer<typeof Dataset>;
export type Table = z.infer<typeof Table>;

// ---------------------------------------------------------------- weeks

export const Week = z.object({
  number: z.number().int().min(1).max(14),
  title: z.string(),
  summary: z.string(),
  status: z.enum(["draft", "published"]).default("draft"),
  topics: z.array(z.string()).min(1),
  readings: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
});

export const Flashcard = z.object({
  id: z.string(),
  topic: z.string(),
  front: z.string(),
  back: z.string(),
  tags: z.array(z.string()).default([]),
});

const Step = z.object({
  title: z.string(),
  body: z.string().default(""),
  ra: z.string().optional(),
  sql: z.string().optional(),
  /** Show the evaluated result table under this step (computed at build time). */
  showResult: z.boolean().default(true),
});

export const Example = z.object({
  id: z.string(),
  title: z.string(),
  topics: z.array(z.string()).min(1),
  dataset: z.string().optional(),
  question: z.string(),
  steps: z.array(Step).min(1),
  pitfalls: z.array(z.string()).default([]),
});

// ---- questions: a discriminated union on `type`

const QBase = {
  id: z.string(),
  topics: z.array(z.string()).min(1),
  difficulty: z.number().int().min(1).max(3).default(2),
  points: z.number().positive().default(1),
  dataset: z.string().optional(),
  show: z
    .object({ diagram: z.boolean().default(false), tables: z.array(z.string()).default([]) })
    .default({ diagram: false, tables: [] }),
  prompt: z.string(),
  explanation: z.string().default(""),
  hints: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
};

export const Question = z.discriminatedUnion("type", [
  z.object({ ...QBase, type: z.literal("mcq"), options: z.array(z.string()).min(2), answer: z.number().int().min(0) }),
  z.object({ ...QBase, type: z.literal("multi"), options: z.array(z.string()).min(2), answer: z.array(z.number().int().min(0)).min(1) }),
  z.object({ ...QBase, type: z.literal("true_false"), answer: z.boolean() }),
  z.object({ ...QBase, type: z.literal("numeric"), answer: z.number(), tolerance: z.number().default(0) }),
  z.object({
    ...QBase,
    type: z.literal("short"),
    answers: z.array(z.string()).min(1),
    caseSensitive: z.boolean().default(false),
  }),
  z.object({
    ...QBase,
    type: z.literal("matching"),
    left: z.array(z.string()).min(2),
    right: z.array(z.string()).min(2),
    answer: z.array(z.number().int().min(0)),
  }),
  z.object({
    ...QBase,
    type: z.literal("blanks"),
    strictCase: z.boolean().default(true),
    parts: z.array(z.object({ text: z.string(), answer: z.string(), accept: z.array(z.string()).default([]) })).min(1),
  }),
  z.object({
    ...QBase,
    type: z.literal("select_attributes"),
    attributes: z.array(z.string()).min(2),
    answer: z.array(z.string()).min(1),
  }),
  z.object({ ...QBase, type: z.literal("order_steps"), items: z.array(z.string()).min(2) }),
  z.object({
    ...QBase,
    type: z.literal("predict_table"),
    /** The expression shown to the student (RA or SQL). */
    ra: z.string().optional(),
    sql: z.string().optional(),
  }),
  z.object({
    ...QBase,
    type: z.literal("ra"),
    reference: z.string(),
    alsoCheck: z.array(z.string()).default([]),
  }),
  z.object({
    ...QBase,
    type: z.literal("sql"),
    reference: z.string(),
    compare: z.enum(["set", "bag", "ordered"]).default("set"),
    alsoCheck: z.array(z.string()).default([]),
  }),
]);
export type Question = z.infer<typeof Question>;
export type QuestionType = Question["type"];

export const Flashcards = z.array(Flashcard);
export const Examples = z.array(Example);
export const Questions = z.array(Question);

// ---------------------------------------------------------------- topics / course

export const Topics = z.array(
  z.object({ id: z.string(), label: z.string(), week: z.number().int() }),
);

export const CourseEvent = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["quiz", "worksheet", "lab", "assignment", "exam", "other"]),
  title: z.string(),
  covers: z.array(z.number().int()).default([]),
  note: z.string().default(""),
});

export const Course = z.object({
  code: z.string(),
  title: z.string(),
  term: z.string(),
  lecture: z.object({ weekday: z.number().int().min(0).max(6), time: z.string() }),
  weights: z.array(z.object({ item: z.string(), percent: z.number() })),
  events: z.array(CourseEvent).default([]),
});

// ---------------------------------------------------------------- quiz & exam blueprints

export const Slot = z.object({
  name: z.string().optional(),
  types: z.array(z.string()).min(1),
  count: z.number().int().min(1),
  points: z.number().positive().optional(),
  preferTags: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
});

export const Blueprint = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(""),
  kind: z.enum(["quiz", "exam"]),
  /** "previous" = one chosen week (quiz simulator); "released" = all published weeks. */
  covers: z.enum(["one_week", "released"]),
  timeLimitMin: z.number().positive(),
  strictAnswers: z.boolean().default(false),
  feedback: z.enum(["end", "immediate"]).default("end"),
  slots: z.array(Slot).min(1),
});
export type Blueprint = z.infer<typeof Blueprint>;
