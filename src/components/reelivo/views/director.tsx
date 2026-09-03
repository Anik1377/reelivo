"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Clapperboard, MapPin, Play } from "lucide-react";
import {
  hrefFor,
  navigate,
  useDetailStaleTime,
  usePrefetchDetail,
  useTmdb,
} from "@/lib/hooks";
import { DIRECTOR_FLOOR } from "@/lib/curated";
import {
  airLabel,
  dek,
  profile as profileUrl,
  score,
  titleOf,
  yearOf,
} from "@/lib/format";
import type {
  CombinedCredits,
  MediaItem,
  PersonCredit,
  PersonDetail,
} from "@/lib/tmdb-types";
import { ErrorNote, Img, LostLink, StillSkeleton } from "../bits";
import { StillCard } from "../media";

/* A director's collection — an editorial career page rather than a bare grid:
 * signature-work panel, career stat strip, Film/Series lens chips over the
 * ranked board, and an honest "every credited direction" long tail. The board
 * stays truthful: TMDB rating with a vote floor, so one 10/10 with 12 votes
 * can't top it; the long tail is sorted by how much the record knows, not how
 * much it likes a title. */

type Lens = "all" | "movie" | "tv";

/** All credited direction, one entry per title (keeps the best-voted credit). */
function directionCredits(credits: CombinedCredits | undefined): PersonCredit[] {
  const seen = new Map<number, PersonCredit>();
  for (const c of credits?.crew ?? []) {
    if (c.job !== "Director") continue;
    const prev = seen.get(c.id);
    if (!prev || (c.vote_count ?? 0) > (prev.vote_count ?? 0)) seen.set(c.id, c);
  }
  return [...seen.values()];
}

const byRating = (a: PersonCredit, b: PersonCredit) =>
  (b.vote_average ?? 0) - (a.vote_average ?? 0);
const byKnown = (a: PersonCredit, b: PersonCredit) =>
  (b.vote_count ?? 0) - (a.vote_count ?? 0);

/** PersonCredit → MediaItem so StillCard (and its pop card) can render it. */
function creditToMedia(c: PersonCredit): MediaItem {
  return {
    id: c.id,
    media_type: c.media_type ?? "movie",
    title: c.title,
    name: c.name,
    poster_path: c.poster_path ?? null,
    backdrop_path: c.backdrop_path ?? null,
    vote_average: c.vote_average,
    vote_count: c.vote_count,
    release_date: c.release_date,
    first_air_date: c.first_air_date,
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-surface-2 px-4 py-3.5">
      <p className="tabular display text-xl leading-none text-white md:text-2xl">{value}</p>
      <p className="mt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-dim">
        {label}
      </p>
    </div>
  );
}

export function DirectorView({ id }: { id: number }) {
  const stale = useDetailStaleTime();
  const person = useTmdb<PersonDetail>(id ? `person/${id}` : null, {}, stale);
  const credits = useTmdb<CombinedCredits>(id ? `person/${id}/combined_credits` : null, {}, stale);
  const prefetch = usePrefetchDetail();

  const [lens, setLens] = useState<Lens>("all");
  const [showAll, setShowAll] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);

  const allDirection = useMemo(
    () => directionCredits(credits.data).sort(byKnown),
    [credits.data]
  );
  const board = useMemo(
    () =>
      allDirection
        .filter((c) => (c.vote_count ?? 0) >= DIRECTOR_FLOOR)
        .sort(byRating)
        .slice(0, 24),
    [allDirection]
  );

  const signature = board[0];
  const signatureType = (signature?.media_type as "movie" | "tv") ?? "movie";

  // warm the detail cache for the signature work before the first hover
  useEffect(() => {
    if (signature) prefetch(signatureType, signature.id);
  }, [signature, signatureType, prefetch]);

  useEffect(() => {
    if (person.data) {
      document.title = `${person.data.name} — the collection — Reelivo`;
    }
    return () => {
      document.title = "Reelivo — what to watch tonight";
    };
  }, [person.data]);

  /* Truncated/junk share links (e.g. "#/director/525?x") parse to id 0 —
   * show the designed dead-end instead of a dead fetch + useless retry.
   * Kept after every hook: queries above are already idle (path=null). */
  if (!id) return <LostLink />;

  if (person.isLoading || credits.isLoading) {
    return (
      <div aria-busy className="mx-auto max-w-[1400px] px-4 pt-28 md:px-8 2xl:max-w-[1660px]">
        <div className="flex items-center gap-6">
          <StillSkeleton className="h-[210px] w-[140px] rounded-2xl" />
          <div className="space-y-3">
            <StillSkeleton className="h-9 w-64" />
            <StillSkeleton className="h-4 w-40" />
            <StillSkeleton className="h-4 w-52" />
          </div>
        </div>
        <StillSkeleton className="mt-10 aspect-video w-full rounded-2xl" />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <StillSkeleton key={i} className="aspect-[2/3] w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (person.isError || !person.data) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-40">
        <ErrorNote onRetry={() => person.refetch()} />
      </div>
    );
  }

  const p = person.data;
  const bioFirst = dek((p.biography ?? "").split("\n\n")[0]);
  const bioRest = (p.biography ?? "").split("\n\n").slice(1).join("\n\n");

  const avg =
    board.length > 0
      ? board.reduce((acc, c) => acc + (c.vote_average ?? 0), 0) / board.length
      : 0;
  const years = allDirection
    .map((c) => (c.release_date ?? c.first_air_date ?? "").slice(0, 4))
    .filter((y) => /^\d{4}$/.test(y));
  const span =
    years.length > 0
      ? `${Math.min(...years.map(Number))}–${Math.max(...years.map(Number))}`
      : "—";

  const lensShown = lens === "all" ? board : board.filter((c) => (c.media_type ?? "movie") === lens);
  const tailShown =
    lens === "all" ? allDirection : allDirection.filter((c) => (c.media_type ?? "movie") === lens);
  const listing = showAll ? tailShown : lensShown;
  const filmCount = listing.filter((c) => (c.media_type ?? "movie") === "movie").length;
  const tvCount = listing.filter((c) => (c.media_type ?? "movie") === "tv").length;
  const allCount = listing.length;

  const born = p.birthday ? `Born ${airLabel(p.birthday)} ${p.birthday.slice(0, 4)}` : null;
  const died = p.deathday ? `Died ${airLabel(p.deathday)} ${p.deathday.slice(0, 4)}` : null;

  return (
    <article className="pb-16">
      {/* cinematic hero — the signature work's backdrop */}
      <div className="relative h-[36vh] min-h-[260px] w-full overflow-hidden">
        {signature?.backdrop_path && (
          <img
            src={`https://image.tmdb.org/t/p/w1280${signature.backdrop_path}`}
            alt=""
            aria-hidden
            className="h-full w-full object-cover object-top opacity-40"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/25" />
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,transparent_40%,rgba(0,0,0,0.5)_100%)]" />
      </div>

      <div className="relative z-10 mx-auto -mt-28 max-w-[1400px] px-4 md:px-8 2xl:max-w-[1660px]">
        <button
          type="button"
          onClick={() => navigate("#/")}
          className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-dim transition-colors hover:text-white"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back home
        </button>

        {/* identity */}
        <div className="flex flex-wrap items-end gap-6">
          <Img
            src={profileUrl(p.profile_path, "w342")}
            alt={`${p.name} portrait`}
            fallbackTitle={p.name}
            className="h-[210px] w-[140px] rounded-2xl object-cover ring-1 ring-white/15 shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
          />
          <div className="min-w-0 flex-1 pb-1">
            <p className="kicker text-primary">Director spotlight</p>
            <h1 className="display mt-1.5 text-[clamp(26px,4vw,46px)] leading-[1.05] text-white">
              {p.name}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] text-white/60">
              {born && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                  <CalendarDays className="size-3.5 text-primary/80" aria-hidden />
                  {born}
                  {died && <span className="text-white/40">· {died}</span>}
                </span>
              )}
              {p.place_of_birth && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                  <MapPin className="size-3.5 text-primary/80" aria-hidden />
                  <span className="max-w-[240px] truncate">{p.place_of_birth}</span>
                </span>
              )}
              <a
                href={hrefFor({ name: "person", id })}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                Full filmography
                <ArrowLeft className="size-3 -rotate-180" aria-hidden />
              </a>
            </div>
            {bioFirst && (
              <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-white/60">
                {bioFirst}
                {bioOpen && bioRest && (
                  <span className="text-white/55"> {bioRest}</span>
                )}
                {bioRest && (
                  <button
                    type="button"
                    onClick={() => setBioOpen((v) => !v)}
                    className="ml-2 whitespace-nowrap font-semibold text-primary hover:text-primary/80"
                    aria-expanded={bioOpen}
                  >
                    {bioOpen ? "Show less" : "Read full biography"}
                  </button>
                )}
              </p>
            )}
          </div>
        </div>

        {/* career stat strip — hairline grid: real dividers between every cell,
         * no stray edge lines on the mobile 2×2, uniform padding */}
        <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06] sm:grid-cols-4">
          <Stat label="Directing credits" value={String(allDirection.length)} />
          <Stat label="Ranked titles" value={String(board.length)} />
          <Stat label="Board average" value={avg > 0 ? score(avg) : "—"} />
          <Stat label="Directing span" value={span} />
        </div>

        {/* signature work */}
        {signature && (
          <section aria-label="Signature work" className="mt-10">
            <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-surface">
              {signature.backdrop_path || signature.poster_path ? (
                <img
                  src={`https://image.tmdb.org/t/p/w1280${signature.backdrop_path ?? signature.poster_path}`}
                  alt=""
                  aria-hidden
                  className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                />
              ) : (
                <div className="aspect-video w-full bg-surface-2" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />
              <span
                aria-hidden
                className="tabular display absolute right-5 top-4 text-5xl leading-none text-white/15 md:text-6xl"
              >
                01
              </span>
              <div className="absolute inset-x-0 bottom-0 p-5 md:p-7">
                <p className="kicker text-primary">Signature work</p>
                <h2 className="display mt-1 text-[clamp(20px,3vw,34px)] leading-tight text-white">
                  {titleOf(signature)}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-white/65">
                  <span className="tabular font-semibold text-primary">
                    ★ {score(signature.vote_average)}
                  </span>
                  <span className="tabular">{yearOf(signature)}</span>
                  <span className="rounded border border-white/15 px-1.5 py-px text-[10px] font-bold tracking-wider text-white/70">
                    {signatureType === "movie" ? "FILM" : "SERIES"}
                  </span>
                  <span className="tabular text-white/45">
                    {(signature.vote_count ?? 0).toLocaleString()} votes
                  </span>
                </div>
                {signature.overview && (
                  <p className="mt-2.5 hidden max-w-2xl text-[13px] leading-relaxed text-white/60 md:line-clamp-2 md:block">
                    {dek(signature.overview)}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        hrefFor({
                          name: "play",
                          type: signatureType,
                          id: signature.id,
                        })
                      )
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-[13px] font-bold text-black transition-all duration-150 hover:-translate-y-px hover:shadow-[0_10px_28px_rgba(0,168,225,0.35)] active:translate-y-0"
                  >
                    <Play className="size-4 fill-current" aria-hidden />
                    Watch free
                  </button>
                  <a
                    href={hrefFor({ name: "detail", type: signatureType, id: signature.id })}
                    className="inline-flex h-10 items-center rounded-lg border border-white/20 bg-white/[0.06] px-5 text-[13px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/[0.12]"
                  >
                    Details
                  </a>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* the board */}
        <section aria-label={`Works directed by ${p.name}`} className="mt-10">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="display text-xl tracking-tight text-white">
              {showAll
                ? lens === "movie"
                  ? "Every credited film"
                  : lens === "tv"
                    ? "Every credited series"
                    : "Every credited direction"
                : "The ranked board"}
            </h2>
            <div className="flex gap-2" role="group" aria-label="Filter by type">
                {(
                  [
                    ["all", `All ${allCount}`],
                    ["movie", `Films ${filmCount}`],
                    ["tv", `Series ${tvCount}`],
                  ] as [Lens, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLens(key)}
                    aria-pressed={lens === key}
                    className={`h-8 rounded-full border px-3.5 text-[12px] font-semibold transition-colors ${
                      lens === key
                        ? "border-primary/70 bg-primary/10 text-white"
                        : "border-white/[0.08] bg-white/[0.03] text-ink-dim hover:border-white/25 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
          </div>

          {credits.isError ? (
            <ErrorNote onRetry={() => credits.refetch()} />
          ) : listing.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-surface-2 px-4 py-6 text-sm text-ink-dim">
              <Clapperboard className="size-4 shrink-0" aria-hidden />
              {showAll
                ? `No ${lens === "tv" ? "series" : "film"} directing credits on record.`
                : "No directing credits with enough votes to rank yet — try the full record below."}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                {listing.map((c, i) => {
                  const m = creditToMedia(c);
                  const type = (c.media_type as "movie" | "tv") ?? "movie";
                  return (
                    <div
                      key={`${c.id}-${i}`}
                      className="group relative"
                      onMouseEnter={() => prefetch(type, c.id)}
                    >
                      <span
                        aria-hidden
                        className="tabular absolute -left-1.5 -top-2 z-10 grid h-7 min-w-7 place-items-center rounded-lg border border-white/15 bg-black/75 px-1.5 text-[12.5px] font-bold leading-none text-white/90 shadow-[0_4px_14px_rgba(0,0,0,0.55)] backdrop-blur-sm transition-colors duration-200 group-hover:border-primary/70 group-hover:text-primary"
                      >
                        {i + 1}
                      </span>
                      <StillCard
                        item={m}
                        type={type}
                        preview
                        fluid
                        sub={
                          showAll
                            ? `${yearOf(m)} · Directed`
                            : `${yearOf(m)} · ★ ${score(c.vote_average)}`
                        }
                        showScore={false}
                      />
                    </div>
                  );
                })}
              </div>

              {tailShown.length > lensShown.length && (
                <div className="mt-8 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="inline-flex h-11 items-center gap-2 rounded-lg bg-white/10 px-6 text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/20"
                    aria-expanded={showAll}
                  >
                    {showAll
                      ? "Back to the ranked board"
                      : `Show every credited direction (${allDirection.length})`}
                  </button>
                </div>
              )}
            </>
          )}

          <p className="mt-8 text-[11.5px] tracking-wide text-ink-dim/70">
            {showAll
              ? "Every credited direction, best-known first — including low-vote titles. The ranked board keeps the honest floor."
              : `Ranked by TMDB rating, ${DIRECTOR_FLOOR}+ votes. Only credited direction counts.`}
          </p>
        </section>
      </div>
    </article>
  );
}
