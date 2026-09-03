"use client";

import { useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import { hrefFor, navigate } from "@/lib/hooks";
import { useReelivo } from "@/lib/store";
import { Img, usePrefersReducedMotion } from "./bits";

/**
 * Continue-anywhere card (Task 32 / wave 3-a).
 *
 * Reads the GLOBAL, device-level `miniStream` (store.ts, NOT persisted — the
 * card is hydration-safe by construction: server render and first client
 * render both see `null`, so it can never mismatch). Wave 3-b's player parks
 * a stream here via `setMiniStream({ type, id, season?, episode?, title,
 * still, pct, updatedAt })` when you navigate away mid-playback and refreshes
 * `pct` (0..1) on progress postMessages; this component is read-only apart
 * from `clearMiniStream()` on dismiss.
 *
 * Mount policy lives in app.tsx: only when miniStream != null, only outside
 * the immersive play route, and only with the profile gate "off".
 *
 * Positioning composes with the existing fixed chrome: on md+ it stacks ABOVE
 * the BackToTop slot (bottom-6 + size-11 → 68px, card starts at 88px); on
 * mobile it is a full-width card above the tab bar AND the BackToTop slot
 * (56px nav + 76–120px back-to-top → card at 132px), both honouring
 * env(safe-area-inset-bottom) like the rest of the fixed chrome.
 */
export function MiniPlayer() {
  const mini = useReelivo((s) => s.miniStream);
  const clearMiniStream = useReelivo((s) => s.clearMiniStream);
  const reduce = usePrefersReducedMotion();
  const [shown, setShown] = useState(false);
  const [closing, setClosing] = useState(false);
  const clearOnExit = useRef(false);

  /* Mount → settle: flip one double-frame after commit so the browser has the
   * hidden transform painted first and the translate+fade transition runs.
   * motion-reduce:transition-none below flattens it for reduced motion. */
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  const dismiss = () => {
    if (closing) return;
    setClosing(true);
    clearOnExit.current = true;
    window.setTimeout(() => clearMiniStream(), reduce ? 0 : 190);
  };

  /* A dismiss racing an unmount (navigating away inside the settle window)
   * still clears the store — the card must never resurrect on the next view. */
  useEffect(
    () => () => {
      if (clearOnExit.current) clearMiniStream();
    },
    [clearMiniStream]
  );

  if (!mini) return null;

  const visible = shown && !closing;
  const pct = Math.round(Math.min(1, Math.max(0, mini.pct)) * 100);
  const epChip =
    mini.type === "tv" && (mini.season !== undefined || mini.episode !== undefined)
      ? `S${mini.season ?? 1} · E${mini.episode ?? 1}`
      : null;

  return (
    <aside
      aria-label="Continue watching"
      className={`fixed inset-x-3 bottom-[calc(8.25rem+env(safe-area-inset-bottom,0px))] z-40 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none md:inset-x-auto md:right-6 md:bottom-[5.5rem] md:w-[300px] ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <div className="overflow-hidden rounded-xl bg-surface-2 shadow-xl ring-1 ring-white/10">
        <div className="relative aspect-video w-full bg-surface">
          <Img
            src={mini.still}
            alt=""
            fallbackTitle={mini.title}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="px-3 pb-2.5 pt-2.5">
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate text-[13.5px] font-semibold text-foreground">
              {mini.title}
            </p>
            {epChip && (
              <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-primary">
                {epChip}
              </span>
            )}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                navigate(
                  hrefFor({
                    name: "play",
                    type: mini.type,
                    id: mini.id,
                    season: mini.season,
                    episode: mini.episode,
                  })
                )
              }
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-bold text-primary-foreground transition-all duration-150 hover:bg-primary/90 active:scale-[0.98]"
            >
              <Play className="size-3.5 fill-current" aria-hidden />
              Resume
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss continue watching"
              className="grid size-11 shrink-0 place-items-center rounded-lg border border-white/10 text-ink-dim transition-colors duration-150 hover:border-white/25 hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label={`${mini.title} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-1 w-full bg-white/10"
        >
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </aside>
  );
}
