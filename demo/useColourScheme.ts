import { useEffect, useState } from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function darkQuery(): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;
}

/** The reader's colour scheme; the library never reads it itself, the demo chooses the theme from it. */
export function useColourScheme(): "light" | "dark" {
  const [dark, setDark] = useState(() => darkQuery()?.matches ?? false);
  useEffect(() => {
    const query = darkQuery();
    if (!query) return;
    const listener = (event: MediaQueryListEvent) => setDark(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return dark ? "dark" : "light";
}
