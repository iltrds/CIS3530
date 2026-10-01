# CIS3530 Study

A study site for CIS*3530 Database Systems & Concepts (Fall 2026): notes, flash cards with spaced repetition, worked examples, quizzes (including a simulator of the in-class quiz format), practice exams, and a playground that runs relational algebra and real PostgreSQL in the browser.

Built with **Bun + TypeScript + React**. The output is a static site: no server, no accounts. Each visitor's flash card schedule, mistakes queue and recent quizzes are stored in their own browser.

## Run it

```sh
bun install
bun run dev          # http://localhost:3000, reloads when content/ changes
```

| Command | What it does |
|---|---|
| `bun run dev` | Dev server with hot reload; recompiles content on save (drafts included) |
| `bun run validate` | Checks every content file and runs every RA/SQL answer key (`--week 4`, `--drafts`) |
| `bun test` | RA engine, grading and content tests |
| `bun run typecheck` | TypeScript check |
| `bun run build` | Static site in `dist/` |
| `bun run new-week 4 "Title"` | Scaffolds `content/weeks/week-04/` as a draft |

## Add a week

See [CONTENT_SPEC.md](CONTENT_SPEC.md). In short: scaffold, fill in (it includes a prompt for Claude), `bun run validate --week N`, preview, set `status: published`, push.

Add upcoming quiz and lab dates to `events` in `content/course.yaml` so the home page shows the next quiz.

## Deploy (GitHub Pages)

The site is plain files in `dist/`, and `.github/workflows/deploy.yml` publishes them to GitHub Pages.

1. Push this folder to a GitHub repository with the default branch `main`.
2. In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main` (or re-run the workflow). It typechecks, runs the tests, builds, and deploys to `https://<username>.github.io/<repo>/`.

Other branches and pull requests are tested and built but not published, so a new week can be checked in a branch before it goes live.

All asset paths are relative and routing uses the URL hash, so the site works under the `/<repo>/` subpath with no configuration.

**Visibility.** On a free GitHub plan, Pages needs a public repository, and a Pages site is public either way. The notes and questions are written in our own words and don't include worksheet or quiz answers, but the site is built from course material, so check with the instructor before sharing the link widely.

## How it's put together

```
content/            course material as data (see CONTENT_SPEC.md)
src/
  schema/           Zod schemas for every content file
  engines/
    ra/ra.ts        relational algebra parser + evaluator (set semantics)
    sql/engine.ts   PGlite wrapper; student queries run in a rolled-back transaction
    grading.ts      graders for every question type
    datasets.ts     dataset → RA relations, Postgres DDL, RelaX text
  lib/              data loading, hash router, progress store (FSRS), quiz assembly
  components/       tables, schema diagram, query editor, question inputs, quiz runners
  pages/            home, week, flash cards, quizzes, exams, playground, search
scripts/            build, dev, validate, new-week; lib/compile.ts is the content compiler
tests/
```

- **Answer keys are executed, not typed.** The build runs each `ra`/`sql` reference answer on the lecture dataset and on a hidden second instance and stores both results. Grading compares the student's result with those.
- **PGlite loads on demand** from `dist/vendor/pglite/` (about 17 MB, cached by the browser), only when you first run SQL.
- **Datasets come from the slides**: the Week 3 Supplier–Parts rows are transcribed from the instructor's psql output and match its aggregate results (12 shipments, max 800, total 3700). The Week 1 instance differs and is kept separately.
