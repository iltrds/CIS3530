import { useEffect, useMemo, useState } from "react";
import type { Ctx } from "../App.tsx";
import { Html } from "../components/Relations.tsx";
import { dueQueue, NEW_PER_SESSION, previewIntervals, rateCard, Rating, useProgress } from "../lib/store.ts";
import { href, navigate } from "../lib/router.ts";
import { topicLabel, type Flashcard } from "../lib/data.ts";
import { rng, shuffle, newSeed } from "../lib/quiz.ts";

type Mode = "due" | "cram";

export function FlashcardsPage({ ctx, query }: { ctx: Ctx; query: URLSearchParams }) {
  const week = query.get("week") ? Number(query.get("week")) : undefined;
  const topic = query.get("topic") ?? undefined;
  const mode: Mode = query.get("mode") === "cram" ? "cram" : "due";
  const startCard = query.get("card") ?? undefined;
  const progress = useProgress();

  const deck = useMemo(
    () => ctx.weeks.flatMap((w) => w.flashcards).filter((c) => (!week || c.week === week) && (!topic || c.topic === topic)),
    [ctx.weeks, week, topic],
  );

  // the queue is fixed when the session starts, so rating a card doesn't reshuffle what's left
  const [session, setSession] = useState(0);
  const queue = useMemo(() => {
    if (startCard) {
      const c = deck.find((x) => x.id === startCard);
      if (c) return [c, ...deck.filter((x) => x.id !== startCard)];
    }
    if (mode === "cram") return shuffle(deck, rng(newSeed()));
    return dueQueue(deck);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, mode, session, startCard]);

  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [again, setAgain] = useState<Flashcard[]>([]);
  useEffect(() => {
    setI(0);
    setFlipped(false);
    setAgain([]);
  }, [queue]);

  const all = [...queue, ...again];
  const card = all[i];

  const rate = (r: number) => {
    if (!card) return;
    if (mode === "due") rateCard(card.id, r as 1);
    if (r === Rating.Again) setAgain((a) => [...a, card]);
    setFlipped(false);
    setI(i + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === " " || e.key === "Enter") {
        if (!flipped && card) {
          e.preventDefault();
          setFlipped(true);
        }
      } else if (flipped && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        rate(Number(e.key));
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const nextDue = useMemo(() => {
    const ds = deck.map((c) => progress.cards[c.id]?.due).filter(Boolean) as Date[];
    return ds.length ? new Date(Math.min(...ds.map((d) => d.getTime()))) : undefined;
  }, [deck, progress.cards]);

  const setQ = (patch: Record<string, string | number | undefined>) =>
    navigate(href("/flashcards", { week, topic, mode: mode === "cram" ? "cram" : undefined, ...patch, card: undefined }));
  const intervals = card && flipped && mode === "due" ? previewIntervals(card.id) : undefined;

  return (
    <div>
      <div className="page-head">
        <h1>Flash cards</h1>
        <p>
          Cards come back on a spaced-repetition schedule: the better you know one, the longer until you see it again. Each session adds up to {NEW_PER_SESSION} new cards, your Quiz 1 misses and common traps first. Cram mode shows every card in the deck without changing the schedule.
        </p>
      </div>
      <div className="stack no-print" style={{ marginBottom: 24 }}>
        <div className="chips" role="group" aria-label="Week">
          <button className="chip" aria-pressed={!week} onClick={() => setQ({ week: undefined, topic: undefined })}>
            All weeks
          </button>
          {ctx.m.weeks.map((w) => (
            <button key={w.number} className="chip" aria-pressed={week === w.number} onClick={() => setQ({ week: w.number, topic: undefined })}>
              Week {w.number}
            </button>
          ))}
        </div>
        <div className="row">
          <div className="chips" role="group" aria-label="Mode">
            <button className="chip" aria-pressed={mode === "due"} onClick={() => setQ({ mode: undefined })}>
              Due now
            </button>
            <button className="chip" aria-pressed={mode === "cram"} onClick={() => setQ({ mode: "cram" })}>
              Cram all
            </button>
          </div>
          {topic && (
            <span className="small">
              Topic: {topicLabel(ctx.m, topic)}{" "}
              <button className="btn small ghost" onClick={() => setQ({ topic: undefined })}>
                Clear
              </button>
            </span>
          )}
        </div>
      </div>

      {!card ? (
        <div className="card-stage">
          <div className="flashcard" style={{ justifyContent: "center" }}>
            {queue.length === 0 ? (
              <>
                <div className="fc-front">Nothing due in this deck.</div>
                <p className="muted">
                  {nextDue && nextDue > new Date() ? `The next card is due ${nextDue.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}. ` : ""}
                  Cram mode lets you go through the whole deck anyway.
                </p>
              </>
            ) : (
              <>
                <div className="fc-front">Done: {queue.length} card{queue.length === 1 ? "" : "s"} reviewed.</div>
                <p className="muted">{mode === "due" ? "They'll come back when they're due." : "Cram mode doesn't change the schedule."}</p>
              </>
            )}
            <div className="row">
              <button className="btn primary" onClick={() => setQ({ mode: "cram" })}>
                Cram this deck
              </button>
              <button className="btn" onClick={() => setSession(session + 1)}>
                Check for due cards
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card-stage">
          <div className="flashcard" aria-live="polite">
            <div className="fc-meta">
              <span>
                Week {card.week} · {topicLabel(ctx.m, card.topic)}
              </span>
              <span>
                {i + 1} of {all.length}
              </span>
            </div>
            <Html className="fc-front" html={card.front} />
            {flipped && <Html className="fc-back" html={card.back} />}
          </div>
          {!flipped ? (
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn primary" onClick={() => setFlipped(true)} autoFocus>
                Show answer
              </button>
              <span className="small muted">or press Space</span>
            </div>
          ) : mode === "due" ? (
            <div className="ratings" role="group" aria-label="How well did you know it?">
              {[
                [Rating.Again, "Again"],
                [Rating.Hard, "Hard"],
                [Rating.Good, "Good"],
                [Rating.Easy, "Easy"],
              ].map(([r, label]) => (
                <button key={r} className={"btn" + (r === Rating.Good ? " primary" : "")} onClick={() => rate(r as number)} autoFocus={r === Rating.Good}>
                  {label}
                  <small style={r === Rating.Good ? { color: "inherit", opacity: 0.8 } : undefined}>
                    {r as number} · {intervals?.[r as number]}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn" onClick={() => rate(Rating.Again)}>
                Again
              </button>
              <button className="btn primary" onClick={() => rate(Rating.Good)} autoFocus>
                Got it
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
