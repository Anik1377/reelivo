"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, CalendarDays, X } from "lucide-react";
import { toast } from "sonner";
import { hrefFor, navigate } from "@/lib/hooks";
import { airLabel, dayIso, relativeDue } from "@/lib/format";
import { useReelivo, type ReminderItem } from "@/lib/store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Img, useMounted } from "./bits";

/* Release-reminder center — the global face of the calendar's "Remind me"
 * bells. The store already persists reminders per profile (dueDate = ISO
 * YYYY-MM-DD); until now they were only visible on #/calendar itself. This
 * bell surfaces them app-wide: badge with the upcoming count, a grouped
 * panel (Today / This week / Later / Released), inline removal, and a
 * once-per-session toast when something releases today.
 *
 * Hydration discipline (Task-29 family): the badge is `mounted`-gated like
 * the watchlist badge, and the toast effect waits for a non-empty
 * reminders array — the store uses skipHydration, so the first client
 * render always sees [] and any real data arrives after rehydrate. */

const TODAY_TOAST_KEY = "reelivo:rem-toast";

type Group = { key: string; label: string; items: ReminderItem[] };

const GROUP_LABEL: Record<string, string> = {
  today: "Today",
  week: "This week",
  later: "Later",
  past: "Released",
};

function ReminderRow({
  r,
  today,
  index,
  onGo,
  onRemove,
}: {
  r: ReminderItem;
  today: string;
  index: number;
  onGo: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="row-in group/row relative flex items-center gap-2.5 rounded-lg p-1.5 transition-colors duration-150 hover:bg-white/[0.06] focus-within:bg-white/[0.06]"
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
    >
      <button
        type="button"
        onClick={onGo}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left"
        aria-label={`${r.title} — ${airLabel(r.dueDate)}`}
      >
        <Img
          src={poster(r.poster)}
          alt=""
          fallbackTitle={r.title}
          className="h-12 w-8 shrink-0 rounded object-cover"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-foreground">
            {r.title}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-dim">
            <span className="shrink-0">{r.type === "movie" ? "Film" : "Series"}</span>
            <span aria-hidden className="text-ink-dim/50">·</span>
            <span className="shrink-0">{airLabel(r.dueDate)}</span>
            {r.dueDate !== today && (
              <span className="hidden truncate sm:inline">{relativeDue(r.dueDate)}</span>
            )}
          </span>
        </span>
        {r.dueDate === today && (
          <span className="mr-1 shrink-0 rounded-full border border-primary/40 bg-primary/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-primary">
            Today
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove reminder for ${r.title}`}
        className="grid size-8 shrink-0 place-items-center rounded-full text-ink-dim/70 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** w185 poster URL from a TMDB path; null-safe (tile fallback kicks in). */
function poster(p: string | null): string | null {
  if (!p) return null;
  return `https://image.tmdb.org/t/p/w185${p}`;
}

export function ReminderCenter() {
  const mounted = useMounted();
  const reminders = useReelivo((s) => s.reminders);
  const removeReminder = useReelivo((s) => s.removeReminder);
  const [open, setOpen] = useState(false);

  /* Freeze the UTC "today"/"+7d" markers per mount so group membership
   * doesn't flicker at midnight while the panel is open. Pure UTC math —
   * identical on server and client (Task-29 discipline). */
  const { today, weekEnd } = useMemo(() => {
    const d = new Date();
    const t = dayIso(d);
    d.setUTCDate(d.getUTCDate() + 7);
    return { today: t, weekEnd: dayIso(d) };
  }, []);

  const groups = useMemo<Group[]>(() => {
    const buckets: Record<string, ReminderItem[]> = {
      today: [],
      week: [],
      later: [],
      past: [],
    };
    for (const r of reminders) {
      const due = r.dueDate;
      if (!due) continue;
      if (due === today) buckets.today.push(r);
      else if (due > today && due <= weekEnd) buckets.week.push(r);
      else if (due > weekEnd) buckets.later.push(r);
      else buckets.past.push(r);
    }
    const asc = (a: ReminderItem, b: ReminderItem) =>
      a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title);
    buckets.today.sort(asc);
    buckets.week.sort(asc);
    buckets.later.sort(asc);
    buckets.past.sort((a, b) => b.dueDate.localeCompare(a.dueDate));
    return (["today", "week", "later", "past"] as const)
      .map((key) => ({ key, label: GROUP_LABEL[key], items: buckets[key] }))
      .filter((g) => g.items.length > 0);
  }, [reminders, today, weekEnd]);

  const upcoming =
    groups
      .filter((g) => g.key !== "past")
      .reduce((n, g) => n + g.items.length, 0);

  /* "Releases today" toast — once per browser session. Waits for real data
   * (skipHydration means the first render sees []) so a rehydrate race can
   * never swallow or duplicate it. */
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current || reminders.length === 0) return;
    firedRef.current = true;
    try {
      if (sessionStorage.getItem(TODAY_TOAST_KEY)) return;
      const todays = reminders.filter((r) => r.dueDate === today);
      if (todays.length === 0) return;
      sessionStorage.setItem(TODAY_TOAST_KEY, "1");
      const first = todays[0];
      const more = todays.length - 1;
      toast.success(
        more > 0
          ? `Releasing today — ${first.title} +${more} more`
          : `Releasing today — ${first.title}`,
        { description: "You set a reminder for this in the calendar." }
      );
    } catch {
      /* sessionStorage unavailable (private mode) — skip silently */
    }
  }, [reminders, today]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={`Release reminders${mounted && upcoming ? `, ${upcoming} upcoming` : ""}`}
        className="tap-sm relative grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 transition-all duration-150 hover:border-white/25 hover:text-white active:scale-90"
      >
        <Bell className="size-4" aria-hidden />
        {mounted && upcoming > 0 && (
          <span
            className="tabular absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[9.5px] font-bold text-primary-foreground"
            aria-hidden
          >
            {upcoming}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden border-white/10 bg-popover/95 p-0 backdrop-blur-md"
      >
        <div className="border-b border-white/[0.06] px-3.5 pb-2.5 pt-3">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-dim">
            Release reminders
          </p>
          <p className="mt-0.5 text-[12px] text-ink-dim/80">
            {reminders.length === 0
              ? "From the release calendar"
              : upcoming === 0
                ? "All caught up — nothing upcoming"
                : `${upcoming} upcoming ${upcoming === 1 ? "title" : "titles"}`}
          </p>
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-7 text-center">
            <span className="grid size-11 place-items-center rounded-full border border-white/[0.08] bg-white/[0.04]">
              <BellOff className="size-5 text-ink-dim" aria-hidden />
            </span>
            <p className="text-[12.5px] leading-relaxed text-ink-dim">
              No reminders yet — tap the bell on any release in the calendar
              and it lands here.
            </p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(hrefFor({ name: "calendar" }));
              }}
              className="mt-1 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[12px] font-semibold text-foreground transition-colors duration-150 hover:border-white/25"
            >
              <CalendarDays className="size-3.5 text-primary" aria-hidden />
              Open the calendar
            </button>
          </div>
        ) : (
          <div className="styled-scrollbar max-h-96 overflow-y-auto p-1.5">
            {groups.map((g) => (
              <div key={g.key} className="mb-1 last:mb-0">
                <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-dim/70">
                  {g.label}
                  <span className="ml-1.5 font-semibold text-ink-dim/50">
                    {g.items.length}
                  </span>
                </p>
                {g.items.map((r, i) => (
                  <ReminderRow
                    key={`${r.type}-${r.id}`}
                    r={r}
                    today={today}
                    index={i + (g.key === "week" ? 1 : 0)}
                    onGo={() => {
                      /* plain buttons don't auto-close the Radix menu —
                       * close first so navigation isn't overlaid */
                      setOpen(false);
                      navigate(hrefFor({ name: "detail", type: r.type, id: r.id }));
                    }}
                    onRemove={() => {
                      removeReminder(r.id, r.type);
                      toast.message(`Reminder removed — ${r.title}`);
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {reminders.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate(hrefFor({ name: "calendar" }));
            }}
            className="block w-full border-t border-white/[0.06] px-3.5 py-2.5 text-left text-[12px] font-semibold text-ink-dim transition-colors duration-150 hover:bg-white/[0.04] hover:text-primary"
          >
            Open the release calendar
          </button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
