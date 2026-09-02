"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { navigate, useTmdb, type Route } from "@/lib/hooks";
import { poster, profile as profilePic, score, titleOf, typeOf, yearOf } from "@/lib/format";
import type { MediaItem, Paged, SearchResult } from "@/lib/tmdb-types";
import { useReelivo } from "@/lib/store";
import { Img, Kbd } from "./bits";
import { useMounted } from "./media";

/** Wrap the matched substring of a result title with a quiet highlight. */
function Match({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-primary/25 px-0.5 text-foreground">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function SearchDialog({
  open,
  onOpenChange,
  onShowShortcuts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onShowShortcuts?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevDebounced, setPrevDebounced] = useState(debounced);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const mounted = useMounted();
  const { searchHistory, pushSearch } = useReelivo();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // reset state when the dialog opens (render-adjust pattern)
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setDebounced("");
      setActive(0);
    }
  }

  // reset the cursor whenever the result list changes
  if (debounced !== prevDebounced) {
    setPrevDebounced(debounced);
    setActive(0);
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const searching = debounced.length >= 2;
  const results = useTmdb<Paged<SearchResult>>(
    searching ? "search/multi" : null,
    { query: debounced }
  );
  const trending = useTmdb<Paged<MediaItem>>("trending/all/week");

  const titles = useMemo(() => {
    const r = results.data?.results ?? [];
    const titlesOnly = r.filter(
      (x) => x.media_type === "movie" || x.media_type === "tv"
    );
    const people = r.filter((x) => x.media_type === "person");
    // titles first, then people — one keyboard-navigable list
    return [...titlesOnly.slice(0, 7), ...people.slice(0, 3)];
  }, [results.data]);

  const trendPicks = useMemo(
    () =>
      (trending.data?.results ?? [])
        .filter((x) => x.media_type === "movie" || x.media_type === "tv")
        .slice(0, 6),
    [trending.data]
  );

  const list: (MediaItem | SearchResult)[] = searching ? titles : trendPicks;

  const go = (item: MediaItem | SearchResult) => {
    if ("media_type" in item && item.media_type === "person") {
      if (searching) pushSearch(debounced);
      onOpenChange(false);
      navigate(`#/person/${item.id}`);
      return;
    }
    const type = typeOf(item);
    if (searching) pushSearch(debounced);
    onOpenChange(false);
    navigate(`#/${type}/${item.id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      const item = list[active];
      if (item) go(item);
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="top-[9vh] left-1/2 -translate-x-1/2 translate-y-0 gap-0 overflow-hidden rounded-2xl border-white/10 bg-popover p-0 shadow-[0_32px_80px_rgba(0,0,0,0.8)] sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search Reelivo</DialogTitle>
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4">
          <Search className="size-4 shrink-0 text-ink-dim" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Films, series…"
            aria-label="Search films and series"
            className="w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-ink-dim/60"
            autoComplete="off"
            spellCheck={false}
          />
          <Kbd>esc</Kbd>
        </div>

        <div ref={listRef} className="max-h-[56vh] overflow-y-auto overscroll-contain p-2">
          {searching && results.isFetching && (
            <p className="px-3 py-6 text-sm text-ink-dim">Searching…</p>
          )}

          {searching && !results.isFetching && list.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-ink-dim">
              Nothing by that name. Try fewer words.
            </p>
          )}

          {!searching && mounted && searchHistory.length > 0 && (
            <div className="px-3 pt-2 pb-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="kicker text-ink-dim">Recent</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchHistory.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setQuery(h)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-ink-dim transition-colors hover:border-white/25 hover:text-foreground"
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!searching && (
            <p className="kicker px-3 pt-2 pb-2 text-ink-dim">Trending this week</p>
          )}
          {searching && list.length > 0 && (
            <p className="kicker px-3 pt-2 pb-2 text-ink-dim">Top results</p>
          )}

          <ul role="listbox" aria-label="Search results">
            {list.map((item, i) => {
              const isPerson = "media_type" in item && item.media_type === "person";
              const person = isPerson ? (item as SearchResult) : null;
              const type = isPerson ? "movie" : typeOf(item);
              return (
                <li key={`${item.id}-${isPerson ? "person" : type}`} data-idx={i}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-100 ${
                      i === active ? "bg-surface-2" : ""
                    }`}
                  >
                    <Img
                      src={person ? profilePic(person.profile_path) : poster(item.poster_path, "w185")}
                      alt=""
                      fallbackTitle={person ? person.name : titleOf(item)}
                      className={
                        person
                          ? "size-9 shrink-0 rounded-full object-cover"
                          : "h-[54px] w-9 shrink-0 rounded-md object-cover"
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-foreground">
                        {person ? (
                          <Match text={person.name} query={searching ? debounced : ""} />
                        ) : (
                          <Match text={titleOf(item)} query={searching ? debounced : ""} />
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-dim">
                        {person
                          ? `${
                              person.known_for_department ?? "Acting"
                            } · ${person.known_for
                              ?.slice(0, 2)
                              .map((k) => k.title ?? k.name)
                              .join(", ")}`
                          : `${yearOf(item)} · ${type === "movie" ? "Film" : "Series"} · ${score(
                              item.vote_average
                            )}`}
                      </span>
                    </span>
                    {i === active && <Kbd>↵</Kbd>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.07] px-5 py-2.5 text-[11px] text-ink-dim">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to move
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> open
            {onShowShortcuts ? (
              <>
                <span aria-hidden className="text-white/20">·</span>
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    onShowShortcuts();
                  }}
                  className="underline decoration-white/20 underline-offset-2 transition-colors hover:text-primary"
                >
                  all shortcuts
                </button>
              </>
            ) : (
              <>
                <span aria-hidden className="text-white/20">·</span>
                <Kbd>/</Kbd> anywhere
              </>
            )}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
