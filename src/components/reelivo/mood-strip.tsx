"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MOODS, type AiTitle, type MoodResponse } from "@/lib/ai-types";
import type { MediaItem } from "@/lib/tmdb-types";
import { ErrorNote, RailSkeleton, SectionHead } from "./bits";
import { Rail, StillCard } from "./media";

/* Task 32 / wave 2-a — mood strip: a scrollable row of mood chips (glass,
 * cyan when active, real <button aria-pressed>) driving a TanStack query
 * against GET /api/ai/mood. The rail below reuses the home card language.
 * Clicking the active chip again collapses the rail. Kids profiles never
 * mount this (home.tsx guards it). Hydration-safe: the rail renders only
 * after user interaction, chips are static content on first paint. */

const MOOD_STALE = 10 * 60 * 1000; // the server caches each mood for 1h

/** AiTitle → the MediaItem shape StillCard already speaks. */
function toMediaItem(t: AiTitle): MediaItem {
  return {
    id: t.id,
    media_type: t.media_type,
    title: t.title,
    poster_path: t.poster_path,
    backdrop_path: t.backdrop_path,
    release_date: /^\d{4}$/.test(t.year) ? `${t.year}-01-01` : undefined,
    vote_average: t.rating,
  };
}

async function fetchMood(key: string): Promise<MoodResponse> {
  const res = await fetch(`/api/ai/mood?mood=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`mood ${res.status}`);
  return (await res.json()) as MoodResponse;
}

export function MoodStrip() {
  const [active, setActive] = useState<string | null>(null);

  const q = useQuery<MoodResponse>({
    queryKey: ["mood", active],
    queryFn: () => fetchMood(active as string),
    enabled: !!active,
    staleTime: MOOD_STALE,
    retry: 1,
  });

  return (
    <section aria-label="Mood picks">
      <SectionHead
        kicker="Mood"
        title="What's your vibe?"
        aside={<span className="text-xs text-ink-dim">One tap, a shelf of picks</span>}
      />
      <div
        role="group"
        aria-label="Pick a mood"
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
      >
        {MOODS.map((m) => {
          const on = m.key === active;
          return (
            <button
              key={m.key}
              type="button"
              aria-pressed={on}
              onClick={() => setActive(on ? null : m.key)}
              className={`inline-flex h-11 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold transition-all duration-150 ${
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-white/10 bg-white/[0.04] text-ink-dim hover:border-white/25 hover:text-foreground"
              }`}
            >
              <span aria-hidden>{m.emoji}</span>
              {m.label}
            </button>
          );
        })}
      </div>

      {active &&
        (q.isPending ? (
          <div className="mt-6" aria-hidden>
            <RailSkeleton />
          </div>
        ) : q.isError ? (
          <div className="mt-6">
            <ErrorNote onRetry={() => q.refetch()} />
          </div>
        ) : q.data ? (
          q.data.results.length === 0 ? (
            <p className="mt-6 rounded-xl border border-white/[0.06] bg-surface px-6 py-10 text-center text-sm text-ink-dim">
              Nothing surfaced for {q.data.label.toLowerCase()} right now — try
              another vibe.
            </p>
          ) : (
            <div className="mt-9">
              <SectionHead title={`${q.data.emoji} ${q.data.label}`} />
              <p className="-mt-2 mb-4 text-[13.5px] text-ink-dim">
                {q.data.blurb}
              </p>
              <Rail
                label={`mood ${q.data.label}`}
                ariaLabel={`${q.data.label} picks`}
              >
                {q.data.results.map((t) => (
                  <StillCard
                    key={`${t.media_type}-${t.id}`}
                    item={toMediaItem(t)}
                    type={t.media_type}
                    preview
                    sub={`${t.year || "—"} · ${t.media_type === "movie" ? "Film" : "Series"}`}
                  />
                ))}
              </Rail>
              <p className="mt-2 text-[11px] text-ink-dim">
                AI-curated for this mood · titles via TMDB
              </p>
            </div>
          )
        ) : null)}
    </section>
  );
}
