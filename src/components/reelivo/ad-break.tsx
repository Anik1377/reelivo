"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ExternalLink } from "lucide-react";
import {
  AD_BREAK_SECONDS,
  markAdBreakShown,
  shouldShowAdBreak,
  sponsorLinkProps,
} from "@/lib/ads";

/* Pre-roll "ad break" — a short, honest sponsored moment before the stream
 * takes over. The countdown runs itself down; visiting the sponsor skips most
 * of the wait (a thank-you, not a paywall — the stream starts either way).
 * No skip button: 5 seconds, capped to once per window by lib/ads.ts, and
 * never shown on kids profiles. */

/* One ad decision per play target — remounts (fresh cap check) whenever the
 * keyed target changes, so a later play after the cap window earns a break
 * even if the player never unmounted. */
export function AdBreakGate({ onExit }: { onExit?: () => void }) {
  const [active] = useState(() => shouldShowAdBreak());
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (active) markAdBreakShown(); // stamp at start so a reload can't farm a fresh window
  }, [active]);

  if (!active || done) return null;
  return <AdBreak onDone={() => setDone(true)} onExit={onExit} />;
}

export function AdBreak({ onDone, onExit }: { onDone: () => void; onExit?: () => void }) {
  const [remaining, setRemaining] = useState(AD_BREAK_SECONDS);
  const [thanked, setThanked] = useState(false);
  // latest-callback ref, kept in an effect (never written during render)
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  // 1-second tick down to zero
  useEffect(() => {
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // fade out as the countdown lands, then hand the frame back to the stream
  const fading = remaining === 0;
  useEffect(() => {
    if (remaining > 0) return;
    const t = setTimeout(() => doneRef.current(), 520);
    return () => clearTimeout(t);
  }, [remaining]);

  const total = Math.max(AD_BREAK_SECONDS, 1);
  const shown = Math.max(remaining, 0);
  const pct = ((total - shown) / total) * 100;

  /* countdown ring */
  const R = 30;
  const CIRC = 2 * Math.PI * R;
  const offset = CIRC * (shown / total);

  return (
    <div
      role="dialog"
      aria-label="Sponsored ad break — your stream starts automatically"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 overflow-hidden bg-[#05070a]/[0.975] px-6 text-center backdrop-blur-[2px] transition-opacity duration-500 md:absolute md:z-10 md:gap-5 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* mobile: the 16:9 frame is too shallow for the break, so it takes the
        * whole screen there — and carries its own way back to the title */}
      {onExit && (
        <button
          type="button"
          onClick={onExit}
          className="absolute left-4 top-4 inline-flex h-10 items-center gap-1.5 rounded-lg bg-white/10 px-3.5 text-sm text-white transition-all duration-150 hover:bg-white/20 active:scale-95 md:hidden"
          aria-label="Back to title page"
        >
          <ChevronLeft className="size-4" aria-hidden />
          <span className="display text-[15px] tracking-tight">
            reelivo<span className="text-primary">.</span>
          </span>
        </button>
      )}
      {/* faint brand vignette so the wait feels produced, not broken */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,168,225,0.08),transparent_55%)]"
      />
      <span
        aria-hidden
        className="display pointer-events-none absolute bottom-3 right-4 text-sm text-white/[0.06]"
      >
        reelivo<span className="text-primary/30">.</span>
      </span>

      <span className="rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-dim">
        Sponsored
      </span>

      <div className="relative grid place-items-center" aria-hidden>
        <svg viewBox="0 0 72 72" className="size-20 -rotate-90 md:size-24">
          <circle cx="36" cy="36" r={R} fill="none" strokeWidth="5" className="stroke-white/10" />
          <circle
            cx="36"
            cy="36"
            r={R}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            className="stroke-primary"
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <span className="tabular absolute text-2xl font-bold text-white md:text-3xl">
          {shown > 0 ? shown : ""}
        </span>
      </div>

      <div className="relative">
        <p className="display text-lg leading-tight text-white md:text-2xl">
          {thanked ? "Thanks for the support" : "Ad break — your stream starts shortly"}
        </p>
        <p className="mt-1 text-[13px] text-ink-dim">
          reelivo is 100% free. Visiting our sponsor keeps the reels rolling.
        </p>
      </div>

      <a
        {...sponsorLinkProps}
        onClick={() => {
          if (!thanked) {
            setThanked(true);
            setRemaining(1); // small thank-you: almost straight to the stream
          }
        }}
        className={`group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-150 active:scale-95 ${
          thanked
            ? "bg-primary/15 text-primary ring-1 ring-primary/40"
            : "bg-primary text-primary-foreground shadow-[0_6px_24px_rgba(0,168,225,0.35)] hover:scale-[1.03] hover:shadow-[0_8px_32px_rgba(0,168,225,0.5)]"
        }`}
      >
        <ExternalLink className="size-4" aria-hidden />
        {thanked ? "Skipping ahead…" : "Visit our sponsor"}
      </a>

      {/* linear progress along the bottom edge */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
        <div
          className="h-full bg-primary shadow-[0_0_10px_rgba(0,168,225,0.6)] transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
