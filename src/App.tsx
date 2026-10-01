import { useEffect, useMemo, useState } from "react";
import { useRoute, href } from "./lib/router.ts";
import { loadManifest, loadAllWeeks, useAsync, type Manifest, type WeekData } from "./lib/data.ts";
import { dueQueue, seedMistakes, setTheme, useProgress, storageWorks } from "./lib/store.ts";
import { Home } from "./pages/Home.tsx";
import { WeekPage } from "./pages/Week.tsx";
import { FlashcardsPage } from "./pages/Flashcards.tsx";
import { QuizPage } from "./pages/Quiz.tsx";
import { ExamsPage } from "./pages/Exams.tsx";
import { Playground } from "./pages/Playground.tsx";
import { ProgressPage } from "./pages/Progress.tsx";
import { SearchPage } from "./pages/Search.tsx";

export interface Ctx {
  m: Manifest;
  weeks: WeekData[];
}

function useTheme() {
  const p = useProgress();
  useEffect(() => {
    const t = p.settings.theme;
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }, [p.settings.theme]);
  return p.settings.theme;
}

export function App() {
  const route = useRoute();
  const theme = useTheme();
  const { data, error } = useAsync(async () => {
    const [m, weeks] = await Promise.all([loadManifest(), loadAllWeeks()]);
    return { m, weeks };
  }, []);
  const [navOpen, setNavOpen] = useState(false);
  const progress = useProgress();

  useEffect(() => setNavOpen(false), [route.raw]);
  useEffect(() => {
    if (!data) return;
    const missed = data.weeks.flatMap((w) => w.questions.filter((q) => q.tags.includes("quiz-miss")).map((q) => q.id));
    seedMistakes(missed, "quiz-1");
  }, [data]);

  const due = useMemo(() => (data ? dueQueue(data.weeks.flatMap((w) => w.flashcards)).length : 0), [data, progress.cards]);
  const mistakes = Object.keys(progress.mistakes).length;

  if (error)
    return (
      <main id="main" tabIndex={-1}>
        <h1>The study data didn't load</h1>
        <p className="error">{error.message}</p>
        <p>If you opened index.html straight from disk, serve the folder instead: run <code>bun run dev</code>, or open the deployed site.</p>
      </main>
    );
  if (!data)
    return (
      <main id="main" tabIndex={-1}>
        <p className="muted">Loading…</p>
      </main>
    );

  const ctx: Ctx = data;
  const [section] = route.path;
  const current = (p: string) => (section === p || (p === "" && !section) ? "page" : undefined);
  const weekNum = section === "week" ? Number(route.path[1]) : undefined;

  let page;
  switch (section) {
    case undefined:
      page = <Home ctx={ctx} />;
      break;
    case "week":
      page = <WeekPage ctx={ctx} n={Number(route.path[1])} tab={route.path[2] ?? "notes"} />;
      break;
    case "flashcards":
      page = <FlashcardsPage ctx={ctx} query={route.query} />;
      break;
    case "quiz":
      page = <QuizPage ctx={ctx} path={route.path.slice(1)} query={route.query} />;
      break;
    case "exams":
      page = <ExamsPage ctx={ctx} path={route.path.slice(1)} query={route.query} />;
      break;
    case "playground":
      page = <Playground ctx={ctx} query={route.query} />;
      break;
    case "progress":
      page = <ProgressPage ctx={ctx} />;
      break;
    case "search":
      page = <SearchPage query={route.query} />;
      break;
    default:
      page = (
        <div>
          <h1>Page not found</h1>
          <p>
            <a href="#/">Go to the home page</a>
          </p>
        </div>
      );
  }

  return (
    <div className={"app" + (navOpen ? " nav-open" : "")}>
      <a href="#main" className="sr-only">
        Skip to content
      </a>
      <div className="topbar">
        <a className="brand" href="#/">
          <span className="brand-code">{ctx.m.course.code.replace("*", "")}</span>
        </a>
        <button className="btn small" aria-expanded={navOpen} aria-controls="sidebar" onClick={() => setNavOpen(!navOpen)}>
          Menu
        </button>
      </div>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <nav className="sidebar" id="sidebar" aria-label="Main">
        <a className="brand" href="#/">
          <div className="brand-code">{ctx.m.course.code.replace("*", "")}</div>
          <div className="brand-sig">
            Study(<u>week</u>, cards, quizzes)
          </div>
        </a>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const q = new FormData(e.currentTarget).get("q");
            location.hash = href("/search", { q: String(q ?? "") });
          }}
        >
          <input type="search" name="q" placeholder="Search notes, cards…" aria-label="Search" style={{ width: "100%" }} defaultValue={section === "search" ? route.query.get("q") ?? "" : ""} />
        </form>
        <div className="nav">
          <a href="#/" aria-current={current("")}>
            <span className="nav-label">Home</span>
          </a>
          <a href="#/flashcards" aria-current={current("flashcards")}>
            <span className="nav-label">Flash cards</span>
            {due > 0 && <span className="badge">{due} due</span>}
          </a>
          <a href="#/quiz" aria-current={current("quiz")}>
            <span className="nav-label">Quizzes</span>
            {mistakes > 0 && <span className="badge">{mistakes} to redo</span>}
          </a>
          <a href="#/exams" aria-current={current("exams")}>
            <span className="nav-label">Practice exams</span>
          </a>
          <a href="#/playground" aria-current={current("playground")}>
            <span className="nav-label">Query playground</span>
          </a>
          <a href="#/progress" aria-current={current("progress")}>
            <span className="nav-label">Progress</span>
          </a>
          <div className="nav-group">Weeks</div>
          {ctx.m.weeks.map((w) => (
            <a key={w.number} href={`#/week/${w.number}`} aria-current={weekNum === w.number ? "page" : undefined}>
              <span className="nav-label">
                {w.number}. {w.title}
              </span>
            </a>
          ))}
        </div>
        <div className="sidebar-foot">
          <label className="row" style={{ gap: 6 }}>
            <span>Theme</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value as "system")} aria-label="Theme">
              <option value="system">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          {!storageWorks() && <span>This browser is blocking storage, so progress lasts only until you close the tab.</span>}
          <span>
            {ctx.m.course.term} · updated {new Date(ctx.m.generatedAt).toLocaleDateString()}
          </span>
        </div>
      </nav>
      <main id="main" tabIndex={-1}>
        {page}
      </main>
    </div>
  );
}
