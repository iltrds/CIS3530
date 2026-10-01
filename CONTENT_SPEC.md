# Content spec

Everything the site shows comes from `content/`. The build validates every file against the schemas in `src/schema/content.ts` and **runs every RA and SQL answer** against its dataset (and against any hidden grading instance), so a wrong answer key fails the build instead of reaching you.

```
content/
  course.yaml          term info, grade weights, dates (quizzes, labs…)
  topics.yaml          every topic id, its label and the week it belongs to
  datasets/*.yaml      relations with their rows, keys and foreign keys
  weeks/week-NN/
    week.yaml          title, summary, topics, readings, status: draft | published
    notes.md           the week's notes, in your own words (Markdown)
    flashcards.yaml
    examples.yaml      worked examples; each step's RA/SQL is run at build time
    questions.yaml     the question bank
  quizzes/in-class.yaml   the quiz simulator's format
  exams/*.yaml            practice exam blueprints
```

Text fields accept Markdown: `**bold**`, `` `code` ``, `<sub>c</sub>`, `<u>key</u>`, fenced code blocks, tables.

## Adding a week

1. `bun run new-week 4 "SQL: grouping and aggregation"` creates `content/weeks/week-04/` as a **draft**.
2. Add any new topic ids to `content/topics.yaml` (with `week: 4`).
3. Fill in the files, by hand or with the prompt below.
4. `bun run validate --week 4` until it passes.
5. `bun run dev`, open http://localhost:3000 and read through it against the slides.
6. Set `status: published` in `week.yaml`, commit and push. CI tests, builds and deploys.

Targets per week: 25–35 flash cards, 6–10 worked examples, 30–50 questions. The quiz simulator needs at least **3 `mcq`, 1 `matching` and 1 `blanks`** question per week (a test enforces this).

### Prompt for generating a week with Claude

> Attached are the Week N slides (and worksheet, if any) for CIS3530. Following CONTENT_SPEC.md in this repo, write `content/weeks/week-0N/` (`week.yaml`, `notes.md`, `flashcards.yaml`, `examples.yaml`, `questions.yaml`) and any new topic ids for `topics.yaml`. Use existing datasets where the slides do (check `content/datasets/`); if the slides use a new table instance, add it as a new dataset copied exactly from the slides, and add a hidden grading instance with different rows. Write the notes and questions in your own words; don't copy slide text, worksheet questions or quiz questions verbatim. Make quiz-style variants of each worksheet question. Include at least 3 `mcq` (some with a **not true** stem and "All/None of the given choices" options), 1 `matching` (3 points) and 1 `blanks` (4 True/False parts), and tag them `quiz-style`. Tag wording traps `trap`. Then run `bun run validate --week N` and fix every problem.

## Datasets

```yaml
id: supplier-parts            # lowercase, dashes
title: Supplier–Parts (Week 3)
description: What it is and anything surprising (e.g. values are uppercase).
source: Where the rows came from.
tables:
  - name: SP
    columns:
      - { name: sno, pk: true }            # type defaults to text
      - { name: pno, pk: true }
      - { name: qty, type: int }           # text | int | numeric | date
    foreignKeys:
      - { columns: [sno], references: { table: S, columns: [sno] } }
    rows:
      - [S1, P1, 200]
```

Every dataset is loaded into Postgres with its keys and foreign keys, so the rows must satisfy them. A **hidden** dataset (`hidden: true`, `alternateOf: [supplier-parts]`) is a second instance with the same schema; RA and SQL answers are also checked against it, which catches answers that only work by coincidence (hard-coded values, `>` instead of `>=`).

## Flash cards

```yaml
- id: w4-fc-having        # unique across all weeks; prefix with the week
  topic: sql.grouping
  front: WHERE vs HAVING?
  back: WHERE filters rows before grouping; HAVING filters groups after.
  tags: [trap]            # optional: trap cards are introduced first
```

## Worked examples

```yaml
- id: w4-ex-group
  title: Total quantity per supplier
  topics: [sql.grouping]
  dataset: supplier-parts
  question: How much has each supplier shipped in total?
  steps:
    - title: Group the shipments
      body: One group per sno, then SUM within each.
      sql: SELECT sno, SUM(qty) FROM SP GROUP BY sno;
      # or ra: π sno (SP)
      # showResult: false   hides the result table for this step
  pitfalls:
    - Every non-aggregated column in SELECT must be in GROUP BY.
```

## Questions

Common fields: `id`, `type`, `topics`, `prompt`, optional `difficulty` (1–3), `points` (default 1), `explanation`, `hints`, `tags`, `dataset`, and `show: { diagram: true, tables: [S, SP] }` to display the schema diagram and instance tables next to the question.

| type | extra fields | grading |
|---|---|---|
| `mcq` | `options`, `answer` (index) | exact |
| `multi` | `options`, `answer` (indices) | right picks minus wrong picks |
| `true_false` | `answer: true/false` | exact |
| `numeric` | `answer`, `tolerance` | numeric |
| `short` | `answers` (accepted strings), `caseSensitive` | any accepted string |
| `matching` | `left`, `right`, `answer` (index into right for each left) | per pair |
| `blanks` | `parts: [{ text, answer, accept }]`, `strictCase` | per part; exact spelling in the quiz simulator |
| `select_attributes` | `attributes`, `answer` | exact set |
| `order_steps` | `items` (in the correct order; shown shuffled) | exact order |
| `predict_table` | `dataset` and one of `ra` / `sql` (the expression shown) | student fills a grid, compared as a set |
| `ra` | `dataset`, `reference` | result compared as a set, on every instance |
| `sql` | `dataset`, `reference`, `compare: set / bag / ordered` | result compared, on every instance |

Use `compare: bag` when duplicates matter (the question needs DISTINCT) and `compare: ordered` when ORDER BY matters. For pair questions, say which member comes first (e.g. "smaller aID first") so the answer is unambiguous.

### Relational algebra syntax

`σ π ρ × ⋈ ⟕ ⟖ ⟗ ÷ ∪ ∩ − ∧ ∨ ¬ :=`, or the words `sigma pi rho x join ljoin rjoin fjoin divide union intersect minus and or not`. Theta join: `R ⋈ [a = b] S` or `R ⋈ R.a = S.b S`. Rename: `ρ M1 (Movies)`, `ρ F(ID, b) (follows)`, `ρ newName←oldName (R)`. Assignment: one `Name := expression` per line; the last line is the answer.

## Quiz and exam blueprints

```yaml
id: in-class
kind: quiz               # quiz | exam
covers: one_week         # one_week (the simulator) | released (all published weeks)
timeLimitMin: 10
strictAnswers: true      # exact True/False spelling
slots:
  - { types: [mcq], count: 3, points: 1, preferTags: [quiz-style] }
  - { types: [matching], count: 1, points: 3 }
  - { types: [blanks], count: 1, points: 4 }
```

If a later quiz uses a different format (say, writing SQL), add a new blueprint instead of editing this one.
