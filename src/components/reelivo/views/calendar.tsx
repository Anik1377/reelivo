"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, BellOff, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { hrefFor, navigate, tmdbFetch } from "@/lib/hooks";
import {
  airLabel,
  dayIso,
  isoParts,
  monthMatrix,
  poster,
  prettyMonth,
  relativeDue,
  titleOf,
  yearOf,
} from "@/lib/format";
import { useReelivo, type ReminderItem } from "@/lib/store";
import type { MediaItem, Paged, UpcomingResults } from "@/lib/tmdb-types";
import { EmptyNote, ErrorNote, Img, StillSkeleton, useMounted } from "../bits";

const HOUR = 60 * 60 * 1000;
const DEFAULT_TITLE = "Reelivo — what to watch tonight";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MIN_OFFSET = -1; // one month back…
const MAX_OFFSET = 12; // …a year ahead
const CELL_MAX = 3; // entries per desktop cell before a "+N" count

interface CalEntry {
  key: string;
  item: MediaItem;
  type: "movie" | "tv";
  /** UTC calendar date (YYYY-MM-DD) the entry lands on. */
  date: string;
}

/** First/last UTC calendar date of a 0-indexed month — pure UTC (Task-29). */
function monthBounds(year: number, month0: number): { gte: string; lte: string } {
  return {
    gte: dayIso(new Date(Date.UTC(year, month0, 1))),
    lte: dayIso(new Date(Date.UTC(year, month0 + 1, 0))),
  };
}

/* --------------------------------- bell ------------------------------------ */

/** Per-entry reminder toggle — filled-cyan bell = reminded. Prefills display
 * fields from the watchlist copy when the title is already saved there, so the
 * reminder row shows the same art the list does. */
function ReminderBell({ entry }: { entry: CalEntry }) {
  const on = useReelivo((s) =>
    s.reminders.some((r) => r.id === entry.item.id && r.type === entry.type)
  );
  const saved = useReelivo((s) =>
    s.watchlist.find((w) => w.id === entry.item.id && w.type === entry.type)
  );
  const addReminder = useReelivo((s) => s.addReminder);
  const removeReminder = useReelivo((s) => s.removeReminder);
  const title = titleOf(entry.item);

  const toggle = () => {
    if (on) {
      removeReminder(entry.item.id, entry.type);
      toast.message(`Reminder removed — ${title}`);
      return;
    }
    const row: ReminderItem = {
      id: entry.item.id,
      type: entry.type,
      title: saved?.title ?? title,
      poster: saved?.poster ?? entry.item.poster_path ?? null,
      backdrop: saved?.backdrop ?? entry.item.backdrop_path ?? null,
      year: saved?.year ?? yearOf(entry.item),
      rating: saved?.rating ?? entry.item.vote_average ?? 0,
      addedAt: Date.now(),
      dueDate: entry.date,
    };
    addReminder(row);
    toast.success(`Reminder set — ${title} · ${airLabel(entry.date)}`);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? `Remove reminder for ${title}` : `Remind me when ${title} is out`}
      className="grid size-10 shrink-0 place-items-center rounded-full text-ink-dim transition-colors duration-150 hover:bg-white/[0.07] hover:text-white"
    >
      <Bell className={`size-4 ${on ? "fill-primary text-primary" : ""}`} aria-hidden />
    </button>
  );
}

/* ------------------------------ entry row ---------------------------------- */

/** One release — art + title + FILM/SERIES chip + bell. `list` is the larger
 * mobile-list variant; default is the compact desktop grid-cell row. */
function ReleaseEntry({ entry, list = false }: { entry: CalEntry; list?: boolean }) {
  const title = titleOf(entry.item);
  return (
    <div className="flex items-center gap-1 rounded-lg transition-colors duration-150 hover:bg-white/[0.04]">
      <button
        type="button"
        onClick={() => navigate(hrefFor({ name: "detail", type: entry.type, id: entry.item.id }))}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left"
      >
        <Img
          src={poster(entry.item.poster_path, "w185")}
          alt=""
          fallbackTitle={title}
          className={
            list
              ? "h-[52px] w-9 shrink-0 rounded-md object-cover"
              : "h-10 w-[27px] shrink-0 rounded object-cover"
          }
        />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate font-semibold text-foreground ${
              list ? "text-[13.5px]" : "text-[12.5px]"
            }`}
          >
            {title}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <span className="rounded bg-white/[0.07] px-1 py-px text-[8.5px] font-bold uppercase tracking-[0.14em] text-ink-dim">
              {entry.type === "movie" ? "Film" : "Series"}
            </span>
            {list && (
              <span className="text-[11px] text-ink-dim">{yearOf(entry.item)}</span>
            )}
          </span>
        </span>
      </button>
      <ReminderBell entry={entry} />
    </div>
  );
}

/* ---------------------------- reminders panel ------------------------------ */

function RemindersPanel() {
  const reminders = useReelivo((s) => s.reminders);
  const removeReminder = useReelivo((s) => s.removeReminder);
  const mounted = useMounted();

  const sorted = useMemo(
    () =>
      [...reminders].sort(
        (a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title)
      ),
    [reminders]
  );

  return (
    <section aria-label="Your reminders" className="mt-12">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="kicker text-primary">Never miss a premiere</p>
          <h2 className="display mt-1 text-[20px] leading-tight text-foreground md:text-[22px]">
            Your reminders
          </h2>
        </div>
        {sorted.length > 0 && (
          <span className="text-xs text-ink-dim">
            {sorted.length} {sorted.length === 1 ? "title" : "titles"}
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-white/[0.06] bg-surface px-6 py-8 text-center text-sm leading-relaxed text-ink-dim">
          No reminders yet — tap the bell on any release above and it lands here.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-surface">
          {sorted.map((r) => (
            <li
              key={`${r.type}-${r.id}`}
              className="flex items-center gap-3 px-3 py-2.5 md:px-4"
            >
              <Img
                src={poster(r.poster, "w185")}
                alt=""
                fallbackTitle={r.title}
                className="h-14 w-10 shrink-0 rounded-md object-cover"
              />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() =>
                    navigate(hrefFor({ name: "detail", type: r.type, id: r.id }))
                  }
                  className="block max-w-full truncate text-left text-[14px] font-semibold text-foreground transition-colors duration-150 hover:text-primary"
                >
                  {r.title}
                </button>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-dim">
                  <span>{airLabel(r.dueDate)}</span>
                  {/* relativeDue reads the clock — post-mount only (Task-29) */}
                  {mounted && relativeDue(r.dueDate) && (
                    <span className="rounded bg-primary/10 px-1.5 py-px text-[10.5px] font-semibold text-primary">
                      {relativeDue(r.dueDate)}
                    </span>
                  )}
                </p>
              </div>
              <span className="hidden shrink-0 text-[11px] text-ink-dim/70 sm:block">
                {r.year} · {r.type === "movie" ? "Film" : "Series"}
              </span>
              <button
                type="button"
                onClick={() => {
                  removeReminder(r.id, r.type);
                  toast.message(`Reminder removed — ${r.title}`);
                }}
                aria-label={`Remove reminder for ${r.title}`}
                className="grid size-10 shrink-0 place-items-center rounded-full text-ink-dim transition-colors duration-150 hover:bg-white/[0.07] hover:text-white"
              >
                <BellOff className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------------------------- view ----------------------------------- */

export function CalendarView() {
  const [offset, setOffset] = useState(0);
  const mounted = useMounted();

  /* Anchor month from the UTC clock. This view mounts client-side only (the
   * hash syncs after hydration), so reading the clock at render is safe — and
   * every date comparison below is pure UTC (Task-29 discipline). */
  const now = new Date();
  const anchor = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const cursor = anchor + offset;
  const year = Math.floor(cursor / 12);
  const month0 = cursor - year * 12;
  const bounds = monthBounds(year, month0);
  const prefix = `${year}-${String(month0 + 1).padStart(2, "0")}-`;
  const todayIso = dayIso(now);

  const upcomingQ = useQuery<UpcomingResults>({
    queryKey: ["tmdb", "movie/upcoming", {}],
    queryFn: () => tmdbFetch<UpcomingResults>("movie/upcoming"),
    staleTime: HOUR,
  });

  const movieQ = useQuery<Paged<MediaItem>>({
    queryKey: [
      "tmdb",
      "discover/movie",
      {
        "primary_release_date.gte": bounds.gte,
        "primary_release_date.lte": bounds.lte,
        sort_by: "popularity.desc",
        "vote_count.gte": 50,
        include_adult: false,
      },
    ],
    queryFn: () =>
      tmdbFetch<Paged<MediaItem>>("discover/movie", {
        "primary_release_date.gte": bounds.gte,
        "primary_release_date.lte": bounds.lte,
        sort_by: "popularity.desc",
        "vote_count.gte": 50,
        include_adult: false,
      }),
    staleTime: HOUR,
  });

  const tvQ = useQuery<Paged<MediaItem>>({
    queryKey: [
      "tmdb",
      "discover/tv",
      {
        "first_air_date.gte": bounds.gte,
        "first_air_date.lte": bounds.lte,
        sort_by: "popularity.desc",
        "vote_count.gte": 50,
        include_adult: false,
      },
    ],
    queryFn: () =>
      tmdbFetch<Paged<MediaItem>>("discover/tv", {
        "first_air_date.gte": bounds.gte,
        "first_air_date.lte": bounds.lte,
        sort_by: "popularity.desc",
        "vote_count.gte": 50,
        include_adult: false,
      }),
    staleTime: HOUR,
  });

  useEffect(() => {
    document.title = `Release calendar — ${prettyMonth(year, month0)} — Reelivo`;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [year, month0]);

  /* Place every title by its (validated) date — in-month only, deduped across
   * the three sources (upcoming overlaps the current month's discover). */
  const byDate = useMemo(() => {
    const map = new Map<string, CalEntry[]>();
    const seen = new Set<string>();
    const place = (item: MediaItem, type: "movie" | "tv") => {
      const date = item.release_date || item.first_air_date;
      if (!date) return;
      if (!isoParts(date) || !date.startsWith(prefix)) return;
      const key = `${type}-${item.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      const list = map.get(date) ?? [];
      list.push({ key, item, type, date });
      map.set(date, list);
    };
    for (const i of movieQ.data?.results ?? []) place(i, "movie");
    for (const i of tvQ.data?.results ?? []) place(i, "tv");
    for (const i of upcomingQ.data?.results ?? []) place(i, "movie");
    for (const list of map.values()) {
      list.sort((a, b) => (b.item.popularity ?? 0) - (a.item.popularity ?? 0));
    }
    return map;
  }, [movieQ.data, tvQ.data, upcomingQ.data, prefix]);

  const weeks = useMemo(() => monthMatrix(year, month0), [year, month0]);
  const totalEntries = useMemo(
    () => [...byDate.values()].reduce((n, l) => n + l.length, 0),
    [byDate]
  );
  /* Mobile list: chronological in-month days that carry entries. */
  const listDays = useMemo(
    () =>
      weeks
        .flat()
        .filter((cell) => dayIso(cell).startsWith(prefix))
        .map((cell) => ({ cell, iso: dayIso(cell), entries: byDate.get(dayIso(cell)) ?? [] }))
        .filter((d) => d.entries.length > 0),
    [weeks, prefix, byDate]
  );

  const loading = upcomingQ.isPending || movieQ.isPending || tvQ.isPending;
  const failed = movieQ.isError || tvQ.isError || upcomingQ.isError;
  const fetching = upcomingQ.isFetching || movieQ.isFetching || tvQ.isFetching;
  const retryAll = () => {
    upcomingQ.refetch();
    movieQ.refetch();
    tvQ.refetch();
  };

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-16 pt-24 md:px-8 md:pt-32">
      {/* header */}
      <p className="kicker text-primary">Coming soon</p>
      <h1 className="display mt-1.5 text-3xl tracking-tight md:text-4xl">Release calendar</h1>
      <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink-dim">
        Films and series landing this month — tap the bell on anything you want
        to be nudged about.
      </p>

      {/* month nav */}
      <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Month">
        <button
          type="button"
          onClick={() => setOffset((o) => Math.max(MIN_OFFSET, o - 1))}
          disabled={offset <= MIN_OFFSET}
          aria-label="Previous month"
          className="grid size-11 place-items-center rounded-full border border-white/10 text-ink-dim transition-colors duration-150 hover:border-primary/60 hover:text-primary disabled:pointer-events-none disabled:opacity-35"
        >
          <ChevronLeft className="size-4.5" aria-hidden />
        </button>
        <p
          aria-live="polite"
          className="display min-w-[190px] text-center text-xl tracking-tight"
        >
          {prettyMonth(year, month0)}
          {fetching && (
            <Loader2
              className="ml-2 inline size-3.5 animate-spin align-baseline text-ink-dim"
              aria-hidden
            />
          )}
        </p>
        <button
          type="button"
          onClick={() => setOffset((o) => Math.min(MAX_OFFSET, o + 1))}
          disabled={offset >= MAX_OFFSET}
          aria-label="Next month"
          className="grid size-11 place-items-center rounded-full border border-white/10 text-ink-dim transition-colors duration-150 hover:border-primary/60 hover:text-primary disabled:pointer-events-none disabled:opacity-35"
        >
          <ChevronRight className="size-4.5" aria-hidden />
        </button>
        {offset !== 0 && (
          <button
            type="button"
            onClick={() => setOffset(0)}
            className="ml-1 inline-flex h-9 items-center rounded-full border border-white/10 px-3.5 text-xs font-semibold text-ink-dim transition-colors duration-150 hover:border-primary/60 hover:text-primary"
          >
            This month
          </button>
        )}
      </div>

      {/* body */}
      {loading && totalEntries === 0 ? (
        <div className="mt-8 space-y-2" aria-hidden>
          {Array.from({ length: 7 }).map((_, i) => (
            <StillSkeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : failed && totalEntries === 0 ? (
        <div className="mt-8">
          <ErrorNote onRetry={retryAll} />
        </div>
      ) : totalEntries === 0 ? (
        <div className="mt-8">
          <EmptyNote title={`Nothing on the calendar in ${prettyMonth(year, month0)}`}>
            No film or series premieres found for this month — step forward a
            month; the calendar keeps a year ahead.
          </EmptyNote>
        </div>
      ) : (
        <>
          {/* desktop — Monday-start 6×7 grid */}
          <div className="mt-7 hidden md:block">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.06]">
              {WEEKDAYS.map((w) => (
                <div key={w} className="bg-surface-2 px-2 py-2 text-center">
                  <span className="kicker text-[10px] text-ink-dim">{w}</span>
                </div>
              ))}
              {weeks.flat().map((cell) => {
                const iso = dayIso(cell);
                const inMonth = iso.startsWith(prefix);
                const entries = inMonth ? (byDate.get(iso) ?? []) : [];
                const isToday = mounted && iso === todayIso;
                return (
                  <div
                    key={iso}
                    className={`bg-background p-1.5 ${
                      isToday ? "ring-1 ring-inset ring-primary/70" : ""
                    } ${inMonth ? "" : "opacity-35"}`}
                  >
                    <div className="mb-1 flex items-center justify-between px-0.5">
                      <span
                        className={`tabular text-[11px] font-semibold ${
                          isToday ? "text-primary" : "text-ink-dim"
                        }`}
                      >
                        {cell.getUTCDate()}
                      </span>
                      {entries.length > CELL_MAX && (
                        <span className="text-[9.5px] text-ink-dim/70">
                          +{entries.length - CELL_MAX}
                        </span>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {entries.slice(0, CELL_MAX).map((e) => (
                        <ReleaseEntry key={e.key} entry={e} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* mobile — chronological list grouped by date (no horizontal scroll) */}
          <div className="mt-7 md:hidden">
            <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-surface">
              {listDays.map(({ cell, iso, entries }) => {
                const isToday = mounted && iso === todayIso;
                return (
                  <li key={iso} className="flex gap-3 p-3">
                    <div className="w-9 shrink-0 pt-0.5 text-center">
                      <p
                        className={`display text-lg leading-tight ${
                          isToday ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {cell.getUTCDate()}
                      </p>
                      <p
                        className={`text-[9.5px] font-semibold uppercase tracking-wider ${
                          isToday ? "text-primary" : "text-ink-dim"
                        }`}
                      >
                        {WEEKDAYS[(cell.getUTCDay() + 6) % 7]}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      {entries.map((e) => (
                        <ReleaseEntry key={e.key} entry={e} list />
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      <RemindersPanel />
    </div>
  );
}
