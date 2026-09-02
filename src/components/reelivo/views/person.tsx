"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, MapPin, Play, Star, TrendingUp } from "lucide-react";
import { hrefFor, navigate, useDetailStaleTime, usePrefetchDetail, useTmdb } from "@/lib/hooks";
import { dateOf, poster, profile, yearOf } from "@/lib/format";
import type {
  CombinedCredits,
  PersonCredit,
  PersonDetail,
} from "@/lib/tmdb-types";
import { ErrorNote, Img, SectionHead, StillSkeleton } from "../bits";
import { Rail } from "../media";

/* ------------------------------- known for -------------------------------- */

function KnownForCard({ credit }: { credit: PersonCredit }) {
  const type = credit.media_type ?? "movie";
  const title = credit.title ?? credit.name ?? "Untitled";
  const prefetch = usePrefetchDetail();

  return (
    <article className="group w-[132px] shrink-0 snap-start md:w-[152px]">
      <div
        role="link"
        tabIndex={0}
        aria-label={`${title} — open details`}
        onClick={() => navigate(hrefFor({ name: "detail", type, id: credit.id }))}
        onKeyDown={(e) => {
          if (e.key === "Enter") navigate(hrefFor({ name: "detail", type, id: credit.id }));
        }}
        onMouseEnter={() => prefetch(type, credit.id)}
        onFocus={() => prefetch(type, credit.id)}
        className="relative aspect-[2/3] w-full cursor-pointer overflow-hidden rounded-lg bg-surface-2 ring-1 ring-white/[0.06] transition-all duration-200 group-hover:ring-white/30"
      >
        <Img
          src={poster(credit.poster_path, "w185")}
          alt={title}
          fallbackTitle={title}
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.05]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            aria-label={`Play ${title} free`}
            onClick={(e) => {
              e.stopPropagation();
              navigate(hrefFor({ name: "play", type, id: credit.id }));
            }}
            className="grid size-10 place-items-center rounded-full bg-white text-black shadow-[0_8px_28px_rgba(0,0,0,0.55)] transition-transform duration-150 hover:scale-105"
          >
            <Play className="ml-0.5 size-4.5 fill-current" aria-hidden />
          </button>
        </div>
      </div>
      <p className="mt-2 truncate text-[12.5px] font-semibold text-foreground">{title}</p>
      <p className="truncate text-[11px] text-ink-dim">
        {yearOf({ release_date: credit.release_date, first_air_date: credit.first_air_date })}
        {credit.character ? ` · ${credit.character}` : ""}
      </p>
    </article>
  );
}

/* ------------------------------ credits list ------------------------------ */

function creditYear(c: PersonCredit): string {
  const d = c.release_date || c.first_air_date;
  return d ? d.slice(0, 4) : "—";
}

function creditTitle(c: PersonCredit): string {
  return c.title ?? c.name ?? "Untitled";
}

function creditNote(c: PersonCredit): string {
  if (c.character) return c.character;
  if (c.job) return c.job;
  if (c.episode_count) return `${c.episode_count} episodes`;
  return "";
}

function CreditsList({ credits }: { credits: PersonCredit[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? credits : credits.slice(0, 10);

  return (
    <div>
      <ul className="divide-y divide-white/[0.05]">
        {shown.map((c, i) => {
          const type = c.media_type ?? "movie";
          return (
            <li key={`${c.id}-${c.character ?? c.job ?? i}`}>
              <button
                type="button"
                onClick={() => navigate(hrefFor({ name: "detail", type, id: c.id }))}
                className="group flex w-full items-baseline gap-3 rounded-md px-2 py-2.5 text-left transition-colors duration-100 hover:bg-white/[0.04]"
              >
                <span className="tabular w-10 shrink-0 text-[13px] text-ink-dim">
                  {creditYear(c)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground transition-colors group-hover:text-primary">
                  {creditTitle(c)}
                </span>
                <span className="hidden max-w-[45%] truncate text-[12.5px] text-ink-dim sm:block">
                  {creditNote(c)}
                </span>
                <span className="hidden shrink-0 rounded border border-white/10 px-1 py-px text-[9px] font-bold tracking-wide text-ink-dim uppercase sm:block">
                  {type === "tv" ? "TV" : "Film"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {credits.length > 10 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 inline-flex items-center gap-1 px-2 text-[13px] font-semibold text-primary transition-colors hover:text-white"
        >
          {expanded ? "Show fewer" : `Show all ${credits.length} credits`}
          <ChevronDown
            className={`size-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      )}
    </div>
  );
}

/* -------------------------------- the view -------------------------------- */

const DEPARTMENT_LABELS: Record<string, string> = {
  Acting: "Acting",
  Directing: "Director",
  Writing: "Writer",
  Production: "Producer",
  Camera: "Cinematographer",
  "Art": "Art department",
  Sound: "Sound",
  Editing: "Editor",
  Crew: "Crew",
};

export function PersonView({ id, rank }: { id: number; rank?: number }) {
  const stale = useDetailStaleTime();
  const person = useTmdb<PersonDetail>(`person/${id}`, {}, stale);
  const credits = useTmdb<CombinedCredits>(`person/${id}/combined_credits`, {}, stale);

  useEffect(() => {
    if (person.data) document.title = `${person.data.name} — Reelivo`;
    return () => {
      document.title = "Reelivo — what to watch tonight";
    };
  }, [person.data]);

  // known-for: the works people actually know — highest vote counts first,
  // with cast/crew entries merged per title so a "Self" cameo doesn't hide
  // the "Director" credit.
  const knownFor = useMemo(() => {
    const merged = new Map<
      number,
      { credit: PersonCredit; note: string | undefined }
    >();
    const consider = (c: PersonCredit) => {
      if (c.media_type !== "movie" && c.media_type !== "tv") return;
      const selfish =
        !c.character || /^(self|herself|himself|themselves)/i.test(c.character);
      const note = selfish ? (c.job ?? c.character) : c.character;
      const prev = merged.get(c.id);
      if (!prev) {
        merged.set(c.id, { credit: c, note });
      } else {
        // prefer the more telling note (a job over a "Self" cameo)
        const betterNote =
          prev.note && !/^(self|herself|himself)/i.test(prev.note)
            ? prev.note
            : (note ?? prev.note);
        merged.set(c.id, {
          credit: {
            ...prev.credit,
            popularity: Math.max(prev.credit.popularity ?? 0, c.popularity ?? 0),
          },
          note: betterNote,
        });
      }
    };
    for (const c of credits.data?.cast ?? []) consider(c);
    for (const c of credits.data?.crew ?? []) consider(c);

    const all = [...merged.values()].map(({ credit, note }) => ({
      ...credit,
      character: note,
    }));
    const withPosters = all.filter((c) => c.poster_path);
    const pool = withPosters.length >= 4 ? withPosters : all;
    return pool
      .sort(
        (a, b) =>
          (b.vote_count ?? 0) * (b.vote_average ?? 0) -
          (a.vote_count ?? 0) * (a.vote_average ?? 0)
      )
      .slice(0, 14);
  }, [credits.data]);

  // credits grouped by department, acting first
  const groups = useMemo(() => {
    const byDept = new Map<string, PersonCredit[]>();
    const push = (dept: string, c: PersonCredit) => {
      const list = byDept.get(dept) ?? [];
      list.push(c);
      byDept.set(dept, list);
    };
    for (const c of credits.data?.cast ?? []) push("Acting", c);
    for (const c of credits.data?.crew ?? []) push(c.department ?? "Crew", c);
    return [...byDept.entries()]
      .map(([dept, list]) => ({
        dept,
        label: DEPARTMENT_LABELS[dept] ?? dept,
        credits: list.sort(
          (a, b) =>
            (b.release_date ?? b.first_air_date ?? "").localeCompare(
              a.release_date ?? a.first_air_date ?? ""
            )
        ),
      }))
      .sort((a, b) => b.credits.length - a.credits.length);
  }, [credits.data]);

  if (person.isPending) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 pt-28 pb-16 md:px-8 md:pt-32" aria-busy>
        <div className="flex flex-col gap-8 md:flex-row">
          <StillSkeleton className="aspect-[2/3] w-48 rounded-xl md:w-64" />
          <div className="flex-1 space-y-4 pt-2">
            <StillSkeleton className="h-10 w-2/3" />
            <StillSkeleton className="h-4 w-1/3" />
            <StillSkeleton className="h-28 w-full" />
          </div>
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
  const bio = p.biography?.trim() ?? "";

  return (
    <article className="pb-16">
      {/* soft top glow to seat the headshot — legibility, not decoration */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-surface-2/70 to-transparent"
        />
        <div className="relative mx-auto max-w-[1100px] px-4 pt-28 md:px-8 md:pt-36">
          <div className="flex flex-col gap-8 md:flex-row md:items-start">
            <div className="w-40 shrink-0 md:w-64">
              <Img
                src={profile(p.profile_path, "w185")}
                alt={p.name}
                fallbackTitle={p.name}
                className="aspect-[2/3] w-full rounded-xl object-cover shadow-[0_20px_60px_rgba(0,0,0,0.65)] ring-1 ring-white/10"
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="kicker text-primary">
                {p.known_for_department ?? "Cast & crew"}
              </p>
              <h1 className="display mt-2 text-[clamp(28px,4.5vw,46px)] leading-[1.04] text-white">
                {p.name}
              </h1>

              <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-white/70">
                {rank != null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-primary uppercase">
                    <TrendingUp className="size-3" aria-hidden />
                    № {rank} · Trending this week
                  </span>
                )}
                {p.birthday && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3.5 text-ink-dim" aria-hidden />
                    {p.deathday ? (
                      <span className="tabular">
                        {p.birthday.slice(0, 4)}–{p.deathday.slice(0, 4)}
                      </span>
                    ) : (
                      <span className="tabular">Born {dateOf({ release_date: p.birthday, first_air_date: "" })}</span>
                    )}
                  </span>
                )}
                {p.place_of_birth && (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <MapPin className="size-3.5 shrink-0 text-ink-dim" aria-hidden />
                    <span className="truncate">{p.place_of_birth.split(",").slice(-2).join(",").trim()}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Star className="size-3.5 text-ink-dim" aria-hidden />
                  <span className="tabular">{groups.reduce((n, g) => n + g.credits.length, 0)} credits</span>
                </span>
              </div>

              {p.also_known_as && p.also_known_as.length > 0 && (
                <p className="mt-2.5 text-xs text-ink-dim">
                  Also known as{" "}
                  <span className="text-foreground/80">{p.also_known_as.slice(0, 3).join(" · ")}</span>
                </p>
              )}

              {bio ? <Bio text={bio} /> : (
                <p className="mt-5 max-w-2xl text-sm text-ink-dim">No biography on file yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] space-y-12 px-4 pt-12 md:px-8">
        {knownFor.length > 0 && (
          <section aria-label="Known for">
            <SectionHead title="Known for" />
            <Rail label="known for" ariaLabel="Most popular titles featuring this person">
              {knownFor.map((c) => (
                <KnownForCard key={`${c.id}-${c.character ?? c.job ?? "kf"}`} credit={c} />
              ))}
            </Rail>
          </section>
        )}

        {groups.map((g) => (
          <section key={g.dept} aria-label={g.label}>
            <SectionHead
              title={g.label}
              aside={<span className="tabular text-xs text-ink-dim">{g.credits.length} credits</span>}
            />
            <CreditsList credits={g.credits} />
          </section>
        ))}

        {groups.length === 0 && credits.isPending && (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <StillSkeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/* ----------------------------- bio with toggle ----------------------------- */

function Bio({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const paragraphs = useMemo(() => text.split(/\n{2,}/).filter(Boolean), [text]);
  return (
    <div className="mt-5 max-w-2xl">
      <div className={`space-y-3 text-[14px] leading-relaxed text-foreground/85 ${expanded ? "" : "line-clamp-4"}`}>
        {paragraphs.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      {text.length > 320 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 text-[13px] font-semibold text-primary transition-colors hover:text-white"
        >
          {expanded ? "Show less" : "Read full biography"}
        </button>
      )}
    </div>
  );
}
