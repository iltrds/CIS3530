/** Hash router: #/path/segments?query. Works on any static host with no rewrite rules. */
import { useSyncExternalStore } from "react";

export interface Route {
  path: string[];
  query: URLSearchParams;
  /** In-page anchor after a second #, e.g. #/week/2/examples#w2-ex-british */
  anchor: string;
  raw: string;
}

function parse(): Route {
  const h = location.hash.replace(/^#/, "") || "/";
  const [beforeAnchor = "/", anchor = ""] = h.split("#");
  const [p = "/", q = ""] = beforeAnchor.split("?");
  return { path: p.split("/").filter(Boolean), query: new URLSearchParams(q), anchor, raw: h };
}

let current = parse();
const subs = new Set<() => void>();
addEventListener("hashchange", () => {
  current = parse();
  subs.forEach((f) => f());
  // move focus to the main region so keyboard and screen-reader users land on the new page
  requestAnimationFrame(() => document.getElementById("main")?.focus({ preventScroll: true }));
  scrollTo(0, 0);
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current,
  );
}

export function navigate(to: string) {
  location.hash = to.startsWith("#") ? to : "#" + to;
}

export function href(path: string, query?: Record<string, string | number | undefined>): string {
  const q = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return "#" + path + (q ? "?" + q : "");
}
