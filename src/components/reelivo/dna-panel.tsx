"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useQueries } from "@tanstack/react-query";
import { ChevronDown, Dna } from "lucide-react";
import { hrefFor, tmdbFetch } from "@/lib/hooks";
import { profile } from "@/lib/format";
import type { HistoryEntry } from "@/lib/store";
import { Img, StillSkeleton, usePrefersReducedMotion } from "./bits";

/* Your Cinema DNA — a collapsible editorial read-out of the active profile's
 * viewing history. Pure client-side aggregation: TanStack queries fetch
 * details (genres/runtimes) for the latest ≤24 unique titles and credits
 * (directors) for the latest ≤12, sharing the app-wide ["tmdb", path, {}]
 * cache with detail pages; the one-line summary is deterministic template
 * logic over the aggregates — no LLM, nothing leaves this device. */

const ANALYSE_CAP = 24;
const CREDITS_CAP = 12;
const DNA_STALE_TIME = 24 * 60 * 60 * 1000;

/** The slice of the movie/tv detail payload the DNA maths reads. */
export interface DnaDetail {
  id?: number;
  runtime?: number | null;
  episode_run_time?: number[];
  genres?: { id: number; name: string }[];
}

interface DnaCrewMember {
  id: number;
  name: string;
  job: string;
  department?: string;
  profile_path?: string | null;
}

interface DnaCredits {
  id?: number;
  crew?: DnaCrewMember[];
}

export interface TitleRef {
  id: number;
  type: "movie" | "tv";
  /** Display year of the first history row seen for this title ("2008"). */
  year: string;
}

/** Latest-plays title list, deduped by id+type (episodes of one series are
 * one title for profiling purposes), newest first — history is newest first. */
export function uniqueTitles(entries: HistoryEntry[]): TitleRef[] {
  const seen = new Set<string>();
  const out: TitleRef[] = [];
  for (const e of entries) {
    const key = `${e.type}-${e.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ id: e.id, type: e.type, year: e.year });
    }
  }
  return out;
}

/* ------------------------------ aggregation -------------------------------- */

function dnaSummary(a: {
  genre: string | null;
  decade: string | null;
  director: string | null;
  films: number;
  series: number;
  total: number;
}): string {
  const mix =
    a.films > 0 && a.series > 0
      ? `${a.films} films to ${a.series} series`
      : a.series > 0
        ? "all series"
        : a.films > 0
          ? "all films"
          : "";
  if (a.genre && a.decade && a.director)
    return `You lean into ${a.decade} ${a.genre.toLowerCase()} — ${a.director} owns your top spot.`;
  if (a.genre && a.decade)
    return `Mostly ${a.decade} ${a.genre.toLowerCase()}${mix ? ` — ${mix}` : ""}.`;
  if (a.genre && a.director)
    return `A steady ${a.genre.toLowerCase()} diet — ${a.director} owns your top spot.`;
  if (a.decade) return `Your reel skews ${a.decade}${mix ? ` — ${mix}` : ""}.`;
  if (a.genre)
    return `A steady ${a.genre.toLowerCase()} diet${mix ? ` — ${mix}` : ""}.`;
  return `${a.total} titles on record — keep watching and your DNA sharpens.`;
}

/** Genre counts over the analysed titles that have a loaded detail payload —
 * share = titles carrying the genre / titles analysed-with-data. */
function aggregateGenres(details: { data?: DnaDetail }[]) {
  let withData = 0;
  const counts = new Map<string, number>();
  details.forEach((q) => {
    const d = q.data;
    if (!d?.genres?.length) return;
    withData += 1;
    const seen = new Set<string>();
    for (const g of d.genres) {
      if (seen.has(g.name)) continue;
      seen.add(g.name);
      counts.set(g.name, (counts.get(g.name) ?? 0) + 1);
    }
  });
  const top = [...counts.entries()]
    .map(([name, count]) => ({ name, count, share: withData > 0 ? count / withData : 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 6);
  return { top, withData };
}

/** "2010s" style buckets straight off the history rows' display years. */
function aggregateDecades(titles: TitleRef[]) {
  const counts = new Map<string, number>();
  for (const t of titles) {
    if (!/^\d{4}$/.test(t.year)) continue;
    const label = `${t.year.slice(0, 3)}0s`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || b.label.localeCompare(a.label));
}

/** Top directors across the credits payloads — one title counted once per
 * person even if the crew list repeats them (co-credits, edits). */
function aggregateDirectors(credits: { data?: DnaCredits }[]) {
  const counts = new Map<number, { id: number; name: string; path: string | null; titles: number }>();
  credits.forEach((q) => {
    const crew = q.data?.crew;
    if (!crew?.length) return;
    const seen = new Set<number>();
    for (const c of crew) {
      if (c.department !== "Directing" || c.job !== "Director") continue;
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const cur = counts.get(c.id);
      if (cur) cur.titles += 1;
      else counts.set(c.id, { id: c.id, name: c.name, path: c.profile_path ?? null, titles: 1 });
    }
  });
  return [...counts.values()]
    .sort((a, b) => b.titles - a.titles || a.name.localeCompare(b.name))
    .slice(0, 3);
}

/* ------------------------------- the panel --------------------------------- */

const UNLOCK_AT = 3;

export function DnaPanel({ history }: { history: HistoryEntry[] }) {
  const [open, setOpen] = useState(false);
  const enough = history.length >= UNLOCK_AT;

  return (
    <section aria-label="Your cinema DNA" className="mt-8">
      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-surface">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="dna-body"
          className="flex w-full items-center gap-4 px-5 py-5 text-left transition-colors duration-150 hover:bg-white/[0.03] md:px-7"
        >
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 ring-1 ring-primary/25"
          >
            <Dna className="size-5 text-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="kicker block text-primary">Pattern recognition</span>
            <span className="display mt-0.5 block text-[19px] leading-tight text-white md:text-[21px]">
              Your cinema DNA
            </span>
            <span className="mt-1 block text-[12.5px] leading-snug text-ink-dim">
              Genres, decades and directors — read from your recent plays, on
              this device.
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={`size-5 shrink-0 text-ink-dim transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        {open && (
          <div id="dna-body" className="border-t border-white/[0.06] px-5 pb-7 pt-5 md:px-7">
            {enough ? (
              <DnaBody history={history} />
            ) : (
              <p className="rounded-xl border border-white/[0.06] bg-surface-2 px-4 py-6 text-center text-[13px] leading-relaxed text-ink-dim">
                Watch a few more titles to unlock your DNA — your last plays
                build the picture.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------- the body --------------------------------- */

function DnaBody({ history }: { history: HistoryEntry[] }) {
  const reducedMotion = usePrefersReducedMotion();

  const analysed = useMemo(() => uniqueTitles(history).slice(0, ANALYSE_CAP), [history]);
  const creditTargets = useMemo(() => analysed.slice(0, CREDITS_CAP), [analysed]);

  /* Same keys as the detail views (["tmdb", "<type>/<id>", {}]) — anything a
   * detail page already fetched is reused, and everything fetched here feeds
   * the stats strip's runtime reads above. */
  const detailQ = useQueries({
    queries: analysed.map((t) => ({
      queryKey: ["tmdb", `${t.type}/${t.id}`, {}] as const,
      queryFn: () => tmdbFetch<DnaDetail>(`${t.type}/${t.id}`),
      staleTime: DNA_STALE_TIME,
      retry: 1,
      placeholderData: keepPreviousData,
    })),
  });
  const creditQ = useQueries({
    queries: creditTargets.map((t) => ({
      queryKey: ["tmdb", `${t.type}/${t.id}/credits`, {}] as const,
      queryFn: () => tmdbFetch<DnaCredits>(`${t.type}/${t.id}/credits`),
      staleTime: DNA_STALE_TIME,
      retry: 1,
      placeholderData: keepPreviousData,
    })),
  });

  const totalQ = detailQ.length + creditQ.length;
  const doneQ = [...detailQ, ...creditQ].filter((q) => q.isSuccess || q.isError).length;
  const pending = totalQ - doneQ;
  const detailsSettled = detailQ.every((q) => q.isSuccess || q.isError);

  /* plain pure-function aggregation — the React compiler memoizes these off
   * the query results they actually read; manual useMemo deps would disagree
   * with the inferred ones (lint: preserve-manual-memoization). */
  const genres = aggregateGenres(detailQ);
  const decades = aggregateDecades(analysed);
  const directors = aggregateDirectors(creditQ);

  const summary = dnaSummary({
    genre: genres.top[0]?.name ?? null,
    decade: decades[0]?.label ?? null,
    director: directors[0]?.name ?? null,
    films: analysed.filter((t) => t.type === "movie").length,
    series: analysed.filter((t) => t.type === "tv").length,
    total: analysed.length,
  });

  const nothingYet = genres.withData === 0 && directors.length === 0;

  return (
    <div>
      {pending > 0 && (
        <p role="status" className="mb-4 text-[11.5px] font-medium text-ink-dim">
          Analysing {doneQ} of {totalQ}…
        </p>
      )}

      {nothingYet && pending > 0 ? (
        /* loading — skeletons within the panel only */
        <div aria-hidden className="space-y-7">
          <StillSkeleton className="h-5 w-2/3" />
          <div className="space-y-2.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <StillSkeleton className="h-2.5 flex-1" />
                <StillSkeleton className="h-2.5 w-8" />
              </div>
            ))}
          </div>
          <div className="flex gap-4">
            {[0, 1, 2].map((i) => (
              <StillSkeleton key={i} className="size-12 rounded-full" />
            ))}
          </div>
        </div>
      ) : nothingYet ? (
        <p className="rounded-xl border border-white/[0.06] bg-surface-2 px-4 py-6 text-center text-[13px] leading-relaxed text-ink-dim">
          Your DNA reads live title data and the reel snapped mid-analysis — try
          again in a moment.
        </p>
      ) : (
        <>
          {/* the editorial one-liner — deterministic template, no AI */}
          {detailsSettled && (
            <p className="display text-[15.5px] leading-snug text-white/90 md:text-[17px]">
              {summary}
            </p>
          )}

          <div className="mt-6 grid gap-8 md:grid-cols-2 md:gap-10">
            {/* genre profile — share of analysed titles */}
            <section aria-label="Genre profile">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-dim">
                Genre profile
              </h3>
              <div className="mt-3.5 space-y-2.5">
                {genres.top.map((g) => (
                  <div key={g.name} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-right text-[12px] text-ink-dim sm:w-28">
                      {g.name}
                    </span>
                    <div
                      className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]"
                      role="img"
                      aria-label={`${g.name}: ${Math.round(g.share * 100)}% of ${genres.withData} analysed titles`}
                    >
                      <div
                        className={`h-full rounded-full bg-primary ${
                          reducedMotion ? "" : "transition-[width] duration-700 ease-out"
                        }`}
                        style={{ width: `${Math.max(3, Math.round(g.share * 100))}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-[11px] tabular text-ink-dim">
                      {Math.round(g.share * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <div className="space-y-8">
              {/* decades mix */}
              <section aria-label="Decades mix">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-dim">
                  Decades mix
                </h3>
                <div className="mt-3.5 flex flex-wrap gap-2">
                  {decades.map((d) => (
                    <span
                      key={d.label}
                      className="tabular rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/80"
                    >
                      {d.label} · {d.count}
                    </span>
                  ))}
                </div>
              </section>

              {/* directors spotlight */}
              <section aria-label="Directors spotlight">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-dim">
                  Directors spotlight
                </h3>
                {directors.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
                    {directors.map((d) => (
                      <a
                        key={d.id}
                        href={hrefFor({ name: "person", id: d.id })}
                        aria-label={`${d.name} — profile and filmography`}
                        className="group flex items-center gap-3 rounded-xl p-1.5 -m-1.5 transition-colors duration-150 hover:bg-white/[0.04]"
                      >
                        <Img
                          src={profile(d.path, "w185")}
                          alt=""
                          fallbackTitle={d.name}
                          className="size-12 shrink-0 rounded-full object-cover ring-1 ring-white/10 transition-shadow duration-200 group-hover:ring-primary/60"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-white transition-colors group-hover:text-primary">
                            {d.name}
                          </span>
                          <span className="block text-[11.5px] text-ink-dim">
                            {d.titles} {d.titles === 1 ? "title" : "titles"}
                          </span>
                        </span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[12.5px] text-ink-dim">
                    No directing credits in this window yet.
                  </p>
                )}
              </section>
            </div>
          </div>

          <p className="mt-7 text-[11px] leading-relaxed text-white/30">
            Built from your latest {analysed.length} titles
            {creditTargets.length < analysed.length
              ? ` (credits for the ${creditTargets.length} most recent)`
              : ""}{" "}
            — computed on this device, nothing sent anywhere.
          </p>
        </>
      )}
    </div>
  );
}
