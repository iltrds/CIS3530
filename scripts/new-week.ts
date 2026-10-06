/**
 * bun run new-week 4 ["Week title"]
 * Scaffolds content/weeks/week-04/ with every file a week needs, as a draft.
 */
import { ROOT } from "./lib/compile.ts";

const n = Number(process.argv[2]);
const title = process.argv[3] ?? "TITLE";
if (!Number.isInteger(n) || n < 1) {
  console.error("Usage: bun run new-week <number> [title]");
  process.exit(1);
}
const dir = `${ROOT}content/weeks/week-${String(n).padStart(2, "0")}/`;
if (await Bun.file(dir + "week.yaml").exists()) {
  console.error(`${dir} already exists.`);
  process.exit(1);
}
const p = `w${n}`;
const files: Record<string, string> = {
  "week.yaml": `number: ${n}
title: ${JSON.stringify(title)}
summary: One sentence on what this week covers.
status: draft   # change to published when it's reviewed
quizFormat: in-class-sql   # or in-class for a concepts quiz; see CONTENT_SPEC.md
topics: []      # ids from content/topics.yaml; add new ones there first
readings: []
sources: []     # the PDFs this week was built from
`,
  "notes.md": `## First topic

Summarise the lecture in your own words. Tables, lists and \`code\` all work.
`,
  "flashcards.yaml": `- id: ${p}-fc-example
  topic: TOPIC-ID
  front: Question side
  back: Answer side
`,
  "examples.yaml": `- id: ${p}-ex-example
  title: Example title
  topics: [TOPIC-ID]
  dataset: supplier-parts
  question: What the example answers.
  steps:
    - title: First step
      body: Explain the step.
      sql: SELECT * FROM S;
`,
  "questions.yaml": `# See CONTENT_SPEC.md for every question type.
- id: ${p}-q-example
  type: mcq
  topics: [TOPIC-ID]
  prompt: Which is true?
  options: [A, B, C, None of the given choices]
  answer: 0
  explanation: Why A is right.
`,
};
for (const [f, body] of Object.entries(files)) await Bun.write(dir + f, body);
console.log(`Created ${dir}
Next:
  1. Add the week's topic ids to content/topics.yaml
  2. Fill in the files (or ask Claude to, following CONTENT_SPEC.md)
  3. bun run validate --week ${n}
  4. bun run dev to preview, then set status: published`);
