import { useMemo } from "react";
import MiniSearch from "minisearch";
import { loadSearch, useAsync } from "../lib/data.ts";

export function SearchPage({ query }: { query: URLSearchParams }) {
  const q = query.get("q") ?? "";
  const { data } = useAsync(loadSearch, []);
  const index = useMemo(() => {
    if (!data) return undefined;
    const ms = new MiniSearch({ fields: ["title", "text"], storeFields: ["kind", "week", "title", "href"], searchOptions: { boost: { title: 2 }, prefix: true, fuzzy: 0.2 } });
    ms.addAll(data);
    return ms;
  }, [data]);
  const results = index && q.trim() ? index.search(q).slice(0, 40) : [];
  return (
    <div>
      <div className="page-head">
        <h1>Search</h1>
        <p>{q ? `Results for "${q}"` : "Type in the search box to find notes, flash cards, examples and questions."}</p>
      </div>
      {q && index && results.length === 0 && <p className="muted">Nothing matches. Try a shorter word, like "division" or "null".</p>}
      <div className="search-results list-rule">
        {results.map((r) => (
          <a key={r.id} href={r.href as string}>
            <div className="sr-kind">
              {r.kind as string} · Week {r.week as number}
            </div>
            <div className="sr-title">{r.title as string}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
