"use client";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ArrowUpRight, Play, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { hrefFor, navigate, tmdbFetch } from "@/lib/hooks";
import { dayIso, poster, still } from "@/lib/format";
import { useReelivo, type HistoryEntry } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { DnaDetail, DnaPanel, TitleRef, uniqueTitles } from "../dna-panel";
import { EmptyNote, Img } from "../bits";

/* ------------------------------- formatting -------------------------------- */

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

const FINISHED = 0.95;

function statusOf(e: HistoryEntry): string {
  if (e.pct >= FINISHED) return "Finished";
  if (e.pct > 0) return `${Math.round(e.pct * 100)}% watched`;
  return "Started";
}

/* ------------------------------- stats strip ------------------------------- */

/* Pure-UTC date maths (Task-29 rule) — dayIso() buckets, streak walks the UTC
 * calendar. The strip only renders once history exists, i.e. post-rehydrate
 * on the client, so clock reads here follow the same discipline as timeAgo. */

const DAY_MS = 86_400_000;
const FILM_MIN_ESTIMATE = 45;
const EPISODE_MIN_ESTIMATE = 42;

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

function computeStats(
  history: HistoryEntry[],
  runtimeTitles: TitleRef[],
  runtimes: { data?: DnaDetail }[]
) {
  /* known runtimes, from the same cache the DNA panel / detail pages fill */
  const runtimeOf = new Map<string, number>();
  runtimeTitles.forEach((t, i) => {
    const d = runtimes[i]?.data;
    if (!d) return;
    const mins =
      d.runtime && d.runtime > 0 ? d.runtime : (d.episode_run_time ?? []).find((r) => r > 0);
    if (mins) runtimeOf.set(`${t.type}-${t.id}`, mins);
  });

  const days = new Set<string>();
  let minutes = 0;
  for (const e of history) {
    days.add(dayIso(new Date(e.watchedAt)));
    const frac = e.pct >= FINISHED ? 1 : Math.min(1, Math.max(0, e.pct));
    const base =
      runtimeOf.get(`${e.type}-${e.id}`) ??
      (e.type === "tv" ? EPISODE_MIN_ESTIMATE : FILM_MIN_ESTIMATE);
    minutes += base * frac;
  }

  /* consecutive UTC days ending today — or yesterday, if today hasn't happened */
  const now = new Date();
  let cursor = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (!days.has(dayIso(new Date(cursor)))) cursor -= DAY_MS;
  let streak = 0;
  while (days.has(dayIso(new Date(cursor)))) {
    streak += 1;
    cursor -= DAY_MS;
  }

  const hours = minutes / 60;
  const hoursLabel =
    hours <= 0 ? "0h" : `≈ ${hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10}h`;

  return {
    titles: uniqueTitles(history).length,
    hoursLabel,
    activeDays: days.size,
    streak,
  };
}

function StatsStrip({ history }: { history: HistoryEntry[] }) {
  /* Cache-only detail reads: enabled:false never fetches — the DNA panel's
   * queries (and any detail page) populate these exact keys, and this strip
   * refines its hours estimate as they land. Capped at the DNA window. */
  const runtimeTitles = useMemo(() => uniqueTitles(history).slice(0, 24), [history]);
  const runtimeQ = useQueries({
    queries: runtimeTitles.map((t) => ({
      queryKey: ["tmdb", `${t.type}/${t.id}`, {}] as const,
      queryFn: () => tmdbFetch<DnaDetail>(`${t.type}/${t.id}`),
      enabled: false,
    })),
  });

  const stats = computeStats(history, runtimeTitles, runtimeQ);

  /* the director page's hairline grid: real dividers at any column count */
  return (
    <section aria-label="Watching stats" className="mt-8">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06] sm:grid-cols-4">
        <Stat label="Titles watched" value={String(stats.titles)} />
        <Stat label="Hours watched" value={stats.hoursLabel} />
        <Stat label="Active days" value={String(stats.activeDays)} />
        <Stat
          label="Current streak"
          value={stats.streak === 1 ? "1 day" : `${stats.streak} days`}
        />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-white/30">
        Hours are estimated — real runtimes where analysed, ≈45-min films and
        ≈42-min episodes otherwise. Days and streaks follow the UTC calendar.
      </p>
    </section>
  );
}

function playHrefOf(e: HistoryEntry): string {
  return e.type === "tv"
    ? hrefFor({ name: "play", type: "tv", id: e.id, season: e.season ?? 1, episode: e.episode ?? 1 })
    : hrefFor({ name: "play", type: "movie", id: e.id });
}

/* ---------------------------------- rows ----------------------------------- */

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const removeHistory = useReelivo((s) => s.removeHistory);
  const finished = entry.pct >= FINISHED;

  const remove = () => {
    removeHistory(entry.key);
    toast(`Removed “${entry.title}” from history`);
  };

  return (
    <li className="flex items-center gap-3.5 py-3">
      <a
        href={hrefFor({ name: "detail", type: entry.type, id: entry.id })}
        className="relative block w-11 shrink-0 overflow-hidden rounded-md bg-surface-2 ring-1 ring-white/[0.08] transition-all duration-150 hover:ring-white/30"
        aria-label={`${entry.title} — details`}
      >
        <Img
          src={poster(entry.poster, "w185") ?? still(entry.backdrop, "w300")}
          alt=""
          fallbackTitle={entry.title}
          className="aspect-[2/3] w-full object-cover"
        />
      </a>

      <div className="min-w-0 flex-1">
        <a
          href={hrefFor({ name: "detail", type: entry.type, id: entry.id })}
          className="block truncate text-[13.5px] font-semibold text-white transition-colors hover:text-primary"
        >
          {entry.title}
        </a>
        <p className="mt-0.5 truncate text-[11.5px] text-ink-dim">
          {entry.year ? `${entry.year} · ` : ""}
          {entry.type === "tv" ? "Series" : "Film"}
          {entry.type === "tv" && entry.season ? ` · S${entry.season} E${entry.episode ?? 1}` : ""}
          {` · ${timeAgo(entry.watchedAt)}`}
        </p>
        {entry.pct > 0 && (
          <div
            className="mt-1.5 h-1 max-w-40 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuenow={Math.round(entry.pct * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${statusOf(entry)}`}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, Math.max(2, entry.pct * 100))}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={`hidden text-right text-[11px] font-semibold tabular sm:block ${
            finished ? "text-emerald-400/90" : "text-ink-dim"
          }`}
        >
          {statusOf(entry)}
        </span>
        <a
          href={playHrefOf(entry)}
          className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/[0.07] px-3 text-[11.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary hover:text-primary-foreground"
        >
          {finished ? (
            <>
              <RotateCcw className="size-3" aria-hidden />
              Again
            </>
          ) : (
            <>
              <Play className="size-3 fill-current" aria-hidden />
              Resume
            </>
          )}
        </a>
        <button
          type="button"
          onClick={remove}
          aria-label={`Remove ${entry.title} from history`}
          className="grid size-9 place-items-center rounded-full text-ink-dim transition-all duration-150 hover:bg-red-500/10 hover:text-red-300 active:scale-90"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}

/* ---------------------------------- view ----------------------------------- */

export function HistoryView() {
  const history = useReelivo((s) => s.history);
  const clearHistory = useReelivo((s) => s.clearHistory);
  const [confirming, setConfirming] = useState(false);

  /* consecutive rows share a day header — history arrives newest-first */
  const groups = useMemo(() => {
    const out: { label: string; items: HistoryEntry[] }[] = [];
    for (const e of history) {
      const label = dayLabel(e.watchedAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [history]);

  const plays = history.length;

  return (
    <div className="mx-auto max-w-[900px] px-4 pb-16 pt-24 md:px-8 md:pt-32 2xl:max-w-[1060px]">
      <div className="mb-1 flex items-end justify-between gap-4">
        <div>
          <p className="kicker text-primary">This profile</p>
          <h1 className="display mt-1.5 text-3xl tracking-tight md:text-4xl">Viewing history</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">
            {plays === 0
              ? "Everything you press play on lands here."
              : `${plays} ${plays === 1 ? "play" : "plays"} — saved to this profile on this device.`}
          </p>
        </div>
        {plays > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 px-3 text-xs text-ink-dim hover:text-red-300"
            onClick={() => {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              clearHistory();
              setConfirming(false);
              toast("Viewing history cleared");
            }}
            onBlur={() => setConfirming(false)}
          >
            <Trash2 className="size-3.5" aria-hidden />
            {confirming ? "Really clear all?" : "Clear all"}
          </Button>
        )}
      </div>

      {plays === 0 ? (
        <div className="mt-8">
          <EmptyNote title="Nothing watched yet.">
            Press play on anything and it lands here — your profile's own ledger, stored on this
            device.
          </EmptyNote>
          <div className="mt-4 flex justify-center gap-2.5">
            <Button
              type="button"
              size="sm"
              className="h-9 rounded-full px-5 text-xs"
              onClick={() => navigate(hrefFor({ name: "films" }))}
            >
              Browse films
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-full px-5 text-xs"
              onClick={() => navigate(hrefFor({ name: "series" }))}
            >
              Browse series
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <StatsStrip history={history} />
          <DnaPanel history={history} />

          <div className="mt-8">
            {groups.map((g) => (
              <section key={g.label} aria-label={g.label} className="mt-7 first:mt-0">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-dim">
                  {g.label}
                </h2>
                <ul className="mt-1 divide-y divide-white/[0.05]">
                  {g.items.map((e) => (
                    <HistoryRow key={e.key} entry={e} />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <p className="mt-8 text-[11.5px] leading-relaxed text-white/30">
            History keeps the latest 100 plays. Clearing it never touches your list or resume
            queue.
          </p>
        </>
      )}
    </div>
  );
}
