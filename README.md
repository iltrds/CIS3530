# CIS3530 Study

A study site for CIS*3530 Database Systems & Concepts (Fall 2026): notes, flash cards with spaced repetition, worked examples, quizzes (including a simulator of the in-class quiz format), practice exams, and a playground that runs relational algebra and real PostgreSQL in the browser.

Built with **Bun + TypeScript + React**. The output is a static site: no server, no accounts. Progress is stored in your browser and can be exported from the Progress page.

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

After each in-class quiz, add the result to `results` in `content/course.yaml`, and upcoming dates to `events`, so the home page shows the next quiz.

## Deploy

The site is plain files in `dist/`, so any static host works.

**Cloudflare Pages (set up in `.github/workflows/deploy.yml`)**

1. Push this folder to a **private** GitHub repository.
2. In Cloudflare, create a Pages project named `cis3530-study` (Direct Upload).
3. Create an API token with the *Cloudflare Pages: Edit* permission.
4. In the GitHub repo, add secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Every push then runs typecheck, tests and build; pushes to `main` deploy to production and other branches get a preview URL. Until the secrets exist, CI still tests and builds.

**Netlify instead**: replace the last workflow step with `bunx netlify-cli deploy --dir=dist --prod` and add `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` secrets. Or drag `dist/` onto Netlify's deploy page.

Keep the site private (Cloudflare Access or Netlify password protection) unless the instructor is happy for it to be shared: it's built from course material.

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
  pages/            home, week, flash cards, quizzes, exams, playground, progress, search
scripts/            build, dev, validate, new-week; lib/compile.ts is the content compiler
tests/
```

- **Answer keys are executed, not typed.** The build runs each `ra`/`sql` reference answer on the lecture dataset and on a hidden second instance and stores both results. Grading compares the student's result with those.
- **PGlite loads on demand** from `dist/vendor/pglite/` (about 17 MB, cached by the browser), only when you first run SQL.
- **Datasets come from the slides**: the Week 3 Supplier–Parts rows are transcribed from the instructor's psql output and match its aggregate results (12 shipments, max 800, total 3700). The Week 1 instance differs and is kept separately.
