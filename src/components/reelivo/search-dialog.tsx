"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Loader2, Mic, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { navigate, useTmdb, type Route } from "@/lib/hooks";
import { poster, profile as profilePic, score, titleOf, typeOf, yearOf } from "@/lib/format";
import type { MediaItem, Paged, SearchResult } from "@/lib/tmdb-types";
import { useReelivo } from "@/lib/store";
import { Chip, Img, Kbd } from "./bits";
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

/* ------------------------------- voice search ------------------------------ */

type MicPhase = "idle" | "requesting" | "recording" | "transcribing";

/** Hard cap on a voice query — search terms are short; nobody dictates an essay. */
const VOICE_MAX_MS = 10_000;

/** First MediaRecorder mime the browser actually supports: opus webm → plain webm → browser default. */
function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const mime of ["audio/webm;codecs=opus", "audio/webm"]) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // exotic builds can throw on isTypeSupported — try the next candidate
    }
  }
  return undefined;
}

/* Browser media APIs never appear/disappear at runtime, so a never-firing
 * subscribe is enough for useSyncExternalStore to read them safely. */
const subscribeNever = () => () => {};

function mediaApisAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder === "function"
  );
}

/* ------------------------------ search filters ----------------------------- */

type TypeFilter = "all" | "movie" | "tv" | "person";
type YearFilter = "any" | "2020s" | "2010s" | "2000s" | "90s" | "classic";
type RatingFilter = "any" | "7" | "8";

const YEAR_OPTIONS: { value: YearFilter; label: string }[] = [
  { value: "any", label: "Any year" },
  { value: "2020s", label: "2020s" },
  { value: "2010s", label: "2010s" },
  { value: "2000s", label: "2000s" },
  { value: "90s", label: "90s" },
  { value: "classic", label: "Classic (≤1989)" },
];

/** Client-side decade bucket on release_date / first_air_date. Undated titles
 * only surface under "Any year" — we never guess a film's decade. */
function inYearBucket(item: Pick<MediaItem, "release_date" | "first_air_date">, filter: YearFilter): boolean {
  const d = item.release_date || item.first_air_date;
  const y = d ? Number(d.slice(0, 4)) : NaN;
  if (!Number.isFinite(y)) return false;
  if (filter === "2020s") return y >= 2020;
  if (filter === "2010s") return y >= 2010 && y < 2020;
  if (filter === "2000s") return y >= 2000 && y < 2010;
  if (filter === "90s") return y >= 1990 && y < 2000;
  if (filter === "classic") return y <= 1989;
  return true;
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

  /* filters — sticky for the whole dialog session, reset only on close */
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [yearFilter, setYearFilter] = useState<YearFilter>("any");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("any");
  const filterKey = `${typeFilter}|${yearFilter}|${ratingFilter}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);

  /* voice search — capability check via the house useMounted idiom: server /
   * hydration snapshot says false (button hidden), client snapshot re-evaluates
   * the real APIs and reveals the mic only when they exist */
  const micSupported = useSyncExternalStore(
    subscribeNever,
    mediaApisAvailable,
    () => false
  );
  const [micPhase, setMicPhase] = useState<MicPhase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const micPhaseRef = useRef<MicPhase>("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const discardRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  /* live "is the dialog open" flag for async continuations (a pending
   * getUserMedia prompt, an in-flight ASR request) that can outlive a close —
   * kept in a ref so those continuations can read it without re-subscribing */
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // reset state when the dialog opens (render-adjust pattern); filters reset on close only
  if (open !== prevOpen) {
    setPrevOpen(open);
    openRef.current = open;
    if (open) {
      setQuery("");
      setDebounced("");
      setActive(0);
    } else {
      setTypeFilter("all");
      setYearFilter("any");
      setRatingFilter("any");
      setMicPhase("idle");
      setElapsed(0);
    }
  }

  // reset the cursor whenever the result list changes
  if (debounced !== prevDebounced) {
    setPrevDebounced(debounced);
    setActive(0);
  }

  // reset the cursor when the filter combination changes so keyboard nav
  // always addresses the *filtered* array from its top
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setActive(0);
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /* ------------------------------ voice pipeline ----------------------------- */

  const setPhase = (p: MicPhase) => {
    micPhaseRef.current = p;
    setMicPhase(p);
  };

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const clearMicTimers = () => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (autoStopRef.current !== null) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  };

  const failVoice = () => {
    setPhase("idle");
    setElapsed(0);
    // a dialog that's already gone never toasts — the failure was abandoned, not experienced
    if (!openRef.current) return;
    toast.error("Couldn't hear that — try again or type instead");
  };

  /** blob → base64 (data: prefix stripped) → POST /api/asr → query. */
  const transcribeBlob = (blob: Blob) => {
    setPhase("transcribing");
    const reader = new FileReader();
    reader.onerror = () => failVoice();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1); // strip "data:…;base64,"
      if (!b64) return failVoice();
      if (!openRef.current) return; // dialog closed mid-capture — drop the stale clip
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/asr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_base64: b64 }),
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => null)) as { text?: unknown } | null;
        const text = typeof json?.text === "string" ? json.text.trim() : "";
        if (!openRef.current) return; // closed while the request was in flight
        if (!res.ok || !text) return failVoice();
        setPhase("idle");
        setElapsed(0);
        setQuery(text); // the debounced search flow picks this up
        inputRef.current?.focus();
      } catch (err) {
        // an abort means the dialog closed mid-flight — that failure is silent
        if (!(err instanceof DOMException && err.name === "AbortError")) failVoice();
      } finally {
        abortRef.current = null;
      }
    };
    reader.readAsDataURL(blob);
  };

  const stopVoice = () => {
    clearMicTimers();
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") {
      setPhase("transcribing"); // spinner until onstop → ASR → results
      try {
        rec.stop();
      } catch {
        failVoice();
      }
    }
  };

  const cancelVoice = () => {
    clearMicTimers();
    discardRef.current = true;
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        releaseMic();
      }
    } else {
      releaseMic();
    }
    recRef.current = null;
    setPhase("idle");
    setElapsed(0);
  };

  const startVoice = async () => {
    if (micPhaseRef.current !== "idle" || !micSupported) return;
    setPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!openRef.current) {
        // the dialog closed while the permission prompt was up — hand the mic
        // straight back and start nothing (no orphan recorder, no 10s ghost)
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = pickRecorderMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recRef.current = rec;
      chunksRef.current = [];
      discardRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        releaseMic(); // always give the mic back the moment capture ends
        clearMicTimers();
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || mimeType || "audio/webm",
        });
        chunksRef.current = [];
        recRef.current = null;
        if (discardRef.current) {
          setPhase("idle");
          setElapsed(0);
          return;
        }
        if (blob.size === 0) return failVoice();
        transcribeBlob(blob);
      };
      rec.onerror = () => {
        clearMicTimers();
        discardRef.current = true;
        releaseMic();
        failVoice();
      };
      rec.start();
      setPhase("recording");
      setElapsed(0);
      const startedAt = Date.now();
      tickRef.current = window.setInterval(() => {
        setElapsed(Math.min(10, Math.floor((Date.now() - startedAt) / 1000)));
      }, 250);
      autoStopRef.current = window.setTimeout(stopVoice, VOICE_MAX_MS);
    } catch (err) {
      releaseMic();
      clearMicTimers();
      setPhase("idle");
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        toast.error("Microphone access is blocked — allow it in your browser settings or type instead.");
      } else if (name === "NotFoundError" || name === "NotReadableError" || name === "OverconstrainedError") {
        toast.error("No usable microphone was found — type your search instead.");
      } else {
        toast.error("Voice search is unavailable right now — try again or type instead.");
      }
    }
  };

  // dialog closed or unmounted mid-capture → stop timers + recorder, release the mic
  useEffect(() => {
    if (!open) return;
    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      if (autoStopRef.current !== null) {
        window.clearTimeout(autoStopRef.current);
        autoStopRef.current = null;
      }
      discardRef.current = true;
      abortRef.current?.abort(); // a dialog that closed never needs the transcript
      try {
        recRef.current?.stop();
      } catch {
        // already inactive
      }
      recRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      chunksRef.current = [];
      micPhaseRef.current = "idle";
      openRef.current = false; // covers unmount-while-open: pending continuations must bail
    };
  }, [open]);

  /* --------------------------------- results -------------------------------- */

  const searching = debounced.length >= 2;
  const results = useTmdb<Paged<SearchResult>>(
    searching ? "search/multi" : null,
    { query: debounced }
  );
  const trending = useTmdb<Paged<MediaItem>>("trending/all/week");

  // unfiltered pool: every title + person the multi search returned
  const pool = useMemo(() => {
    const r = results.data?.results ?? [];
    const titlesOnly = r.filter((x) => x.media_type === "movie" || x.media_type === "tv");
    const people = r.filter((x) => x.media_type === "person");
    return [...titlesOnly, ...people];
  }, [results.data]);

  // client-side filter of the pool. People are only filtered by the type chip —
  // year/rating are meaningless for them, so they pass those untouched.
  const filtered = useMemo(() => {
    return pool.filter((x) => {
      const person = x.media_type === "person";
      if (person) return typeFilter === "all" || typeFilter === "person";
      if (typeFilter === "person") return false;
      if (typeFilter !== "all" && typeOf(x) !== typeFilter) return false;
      if (yearFilter !== "any" && !inYearBucket(x, yearFilter)) return false;
      if (ratingFilter !== "any" && !((x.vote_average ?? 0) >= Number(ratingFilter))) return false;
      return true;
    });
  }, [pool, typeFilter, yearFilter, ratingFilter]);

  const filtersActive = typeFilter !== "all" || yearFilter !== "any" || ratingFilter !== "any";

  // live counts over the filtered list, e.g. "12 films · 3 series"
  const countsText = useMemo(() => {
    if (!filtersActive) return "";
    let films = 0;
    let series = 0;
    let people = 0;
    for (const x of filtered) {
      if (x.media_type === "person") people += 1;
      else if (typeOf(x) === "movie") films += 1;
      else series += 1;
    }
    const parts: string[] = [];
    if (films > 0) parts.push(`${films} film${films === 1 ? "" : "s"}`);
    if (series > 0) parts.push(`${series} series`);
    if (people > 0) parts.push(`${people} ${people === 1 ? "person" : "people"}`);
    return parts.join(" · ");
  }, [filtered, filtersActive]);

  const trendPicks = useMemo(
    () =>
      (trending.data?.results ?? [])
        .filter((x) => x.media_type === "movie" || x.media_type === "tv")
        .slice(0, 6),
    [trending.data]
  );

  const list: (MediaItem | SearchResult)[] = useMemo(() => {
    if (!searching) return trendPicks;
    if (!filtersActive) {
      // default shape: 7 titles, then people — one keyboard-navigable list
      const titlesOnly = filtered.filter((x) => x.media_type !== "person").slice(0, 7);
      const people = filtered.filter((x) => x.media_type === "person").slice(0, 3);
      return [...titlesOnly, ...people];
    }
    return filtered; // filtered view: show everything that survived the chips
  }, [searching, filtersActive, filtered, trendPicks]);

  const clearFilters = () => {
    setTypeFilter("all");
    setYearFilter("any");
    setRatingFilter("any");
    inputRef.current?.focus(); // the Clear-filters button lives in the list — give the keys back
  };

  const emptyFilterLabel =
    typeFilter === "movie" ? "films" : typeFilter === "tv" ? "series" : typeFilter === "person" ? "people" : "results";

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
      // Math.max guards the zero-rows filtered state (length - 1 === -1)
      setActive((a) => Math.min(a + 1, Math.max(0, list.length - 1)));
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

  const recording = micPhase === "recording";

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
            placeholder={recording ? "Listening…" : "Films, series…"}
            aria-label="Search films and series"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-ink-dim/60"
            autoComplete="off"
            spellCheck={false}
          />
          {recording && (
            <>
              <span className="tabular shrink-0 text-xs font-bold text-primary" aria-hidden>
                {elapsed}s
              </span>
              <button
                type="button"
                onClick={cancelVoice}
                aria-label="Cancel voice search"
                className="grid size-11 shrink-0 place-items-center rounded-full text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-foreground"
              >
                <X className="size-4.5" aria-hidden />
              </button>
            </>
          )}
          {!recording && (
            <span className="hidden shrink-0 sm:inline">
              <Kbd>esc</Kbd>
            </span>
          )}
          {micSupported && (
            <>
              {micPhase === "idle" && (
                <button
                  type="button"
                  onClick={startVoice}
                  aria-label="Search by voice"
                  className="grid size-11 shrink-0 place-items-center rounded-full text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-primary"
                >
                  <Mic className="size-[18px]" aria-hidden />
                </button>
              )}
              {(micPhase === "requesting" || micPhase === "transcribing") && (
                <button
                  type="button"
                  disabled
                  aria-label={
                    micPhase === "requesting" ? "Waiting for microphone access" : "Transcribing voice search"
                  }
                  className="grid size-11 shrink-0 place-items-center rounded-full text-primary"
                >
                  <Loader2 className="size-[18px] animate-spin" aria-hidden />
                </button>
              )}
              {recording && (
                <button
                  type="button"
                  onClick={stopVoice}
                  aria-label={`Stop voice recording — ${elapsed} seconds elapsed`}
                  className="relative grid size-11 shrink-0 place-items-center rounded-full border border-primary/60 bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                >
                  <span
                    className="absolute size-2.5 rounded-full bg-primary opacity-60 motion-safe:animate-ping"
                    aria-hidden
                  />
                  <span className="relative size-2.5 rounded-full bg-primary" aria-hidden />
                </button>
              )}
            </>
          )}
        </div>

        {searching && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.07] px-4 py-2">
            {/* every control hands focus back to the query box, so ↑↓/Enter keep
              * driving the filtered list right after a mouse click on a chip */}
            <Chip
              selected={typeFilter === "all"}
              onClick={() => {
                setTypeFilter("all");
                inputRef.current?.focus();
              }}
            >
              All
            </Chip>
            <Chip
              selected={typeFilter === "movie"}
              onClick={() => {
                setTypeFilter("movie");
                inputRef.current?.focus();
              }}
            >
              Films
            </Chip>
            <Chip
              selected={typeFilter === "tv"}
              onClick={() => {
                setTypeFilter("tv");
                inputRef.current?.focus();
              }}
            >
              Series
            </Chip>
            <Chip
              selected={typeFilter === "person"}
              onClick={() => {
                setTypeFilter("person");
                inputRef.current?.focus();
              }}
            >
              People
            </Chip>
            <div className="relative shrink-0">
              <select
                value={yearFilter}
                onChange={(e) => {
                  setYearFilter(e.target.value as YearFilter);
                  inputRef.current?.focus();
                }}
                aria-label="Filter results by year"
                className={`appearance-none rounded-full border py-1.5 pl-3 pr-7 text-[13px] font-medium outline-none transition-colors ${
                  yearFilter !== "any"
                    ? "border-primary bg-primary font-semibold text-primary-foreground"
                    : "border-white/10 bg-white/[0.04] text-ink-dim hover:border-white/25 hover:text-foreground"
                }`}
              >
                {YEAR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-popover text-foreground">
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 opacity-70"
                aria-hidden
              />
            </div>
            <Chip
              selected={ratingFilter === "any"}
              onClick={() => {
                setRatingFilter("any");
                inputRef.current?.focus();
              }}
            >
              Any
            </Chip>
            <Chip
              selected={ratingFilter === "7"}
              onClick={() => {
                setRatingFilter("7");
                inputRef.current?.focus();
              }}
            >
              7+
            </Chip>
            <Chip
              selected={ratingFilter === "8"}
              onClick={() => {
                setRatingFilter("8");
                inputRef.current?.focus();
              }}
            >
              8+
            </Chip>
            {countsText && (
              <p role="status" className="tabular ml-auto whitespace-nowrap text-[11px] text-ink-dim">
                {countsText}
              </p>
            )}
          </div>
        )}

        <div ref={listRef} className="max-h-[56vh] overflow-y-auto overscroll-contain p-2">
          {searching && results.isFetching && (
            <p className="px-3 py-6 text-sm text-ink-dim">Searching…</p>
          )}

          {searching && !results.isFetching && pool.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-ink-dim">
              Nothing by that name. Try fewer words.
            </p>
          )}

          {searching && !results.isFetching && pool.length > 0 && list.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-ink-dim">
              No {emptyFilterLabel} match these filters.{" "}
              <button
                type="button"
                onClick={clearFilters}
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                Clear filters
              </button>
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
                          <Match text={titleOf(person)} query={searching ? debounced : ""} />
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
