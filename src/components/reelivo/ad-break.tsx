"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ExternalLink,
  Loader2,
  Play,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { adTestMode, markAdBreakShown, shouldShowAdBreak } from "@/lib/ads";
import { fireBeacon, parseVast, pickAd, pickMediaFile, type VastLinearAd } from "@/lib/vast";

/* Pre-roll VIDEO ad — a real VAST linear ad played in the frame before the
 * stream takes over (lib/vast.ts parses the HilltopAds zone tag, fetched via
 * our /api/ads/vast proxy).
 *
 * Behaviour is the honest-streaming version of a pre-roll:
 *  - starts MUTED (our rubric promises "no surprise audio"; one tap unmutes)
 *  - a Skip pill counts down to the zone's skipoffset, then skips instantly
 *  - impression / start / quartile / progress beacons fire as the ad runs
 *  - tapping the ad opens the advertiser in a new tab (VAST ClickThrough)
 *  - no fill / fetch failure / broken media → the stream starts immediately
 *  - requested on EVERY stream start (no frequency cap — see lib/ads.ts);
 *    a no-fill reply from the zone means the stream starts instantly
 *  - kids profiles never see it
 */

type Phase = "loading" | "playing" | "gesture";

/* One ad decision per play target — remounts whenever the keyed target
 * changes, so every play (any title / season / episode) earns its own
 * pre-roll request. */
export function AdBreakGate({ onExit }: { onExit?: () => void }) {
  const [active] = useState(() => shouldShowAdBreak() || adTestMode());
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (active) markAdBreakShown(); // bookkeeping stamp (cadence is currently uncapped)
  }, [active]);

  if (!active || done) return null;
  return <VastAdBreak onDone={() => setDone(true)} onExit={onExit} />;
}

function VastAdBreak({ onDone, onExit }: { onDone: () => void; onExit?: () => void }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [ad, setAd] = useState<VastLinearAd | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [now, setNow] = useState(0);
  const [length, setLength] = useState(0);
  const [skip, setSkip] = useState<{ ready: boolean; inSec: number }>({ ready: false, inSec: 0 });
  const [fading, setFading] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const skipBtnRef = useRef<HTMLButtonElement | null>(null);
  const doneRef = useRef(onDone);
  const adRef = useRef<VastLinearAd | null>(null);
  const finishedRef = useRef(false);
  const playedRef = useRef(false);
  const firedRef = useRef(new Set<string>());
  const skipFocusedRef = useRef(false);

  // latest-callback refs, kept in an effect (never written during render)
  useEffect(() => {
    doneRef.current = onDone;
  });

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFading(true);
    setTimeout(() => doneRef.current(), 420); // let the fade-out land first
  }, []);

  const fireOnce = useCallback((key: string, url: string, errorCode?: number) => {
    if (firedRef.current.has(key)) return;
    firedRef.current.add(key);
    fireBeacon(url, errorCode);
  }, []);

  const fail = useCallback(
    (code: number) => {
      // VAST error beacons — 405 = media file problem, 303 = parse, 301 = timeout
      const a = adRef.current;
      if (a) a.errors.slice(0, 2).forEach((url, i) => fireOnce(`err${code}-${i}`, url, code));
      finish();
    },
    [fireOnce, finish]
  );

  /* load the zone tag once and pick one ad from the pod */
  useEffect(() => {
    let dead = false;
    const ctrl = new AbortController();
    const bail = setTimeout(() => ctrl.abort(), 8000);
    (async () => {
      try {
        const res = await fetch(adTestMode() ? "/api/ads/vast?mock=1" : "/api/ads/vast", {
          signal: ctrl.signal,
        });
        const xml = await res.text();
        const chosen = pickAd(parseVast(xml));
        const media = chosen ? pickMediaFile(chosen) : null;
        if (dead) return;
        if (!chosen || !media) {
          finish(); // no fill → straight to the stream, no fake wait
          return;
        }
        adRef.current = chosen;
        setAd(chosen);
        setMediaUrl(media.url);
      } catch {
        if (!dead) finish(); // zone unreachable → never block playback
      }
    })();
    return () => {
      dead = true;
      clearTimeout(bail);
      ctrl.abort();
    };
  }, [finish]);

  /* start MUTED (browsers refuse sound before a gesture, and our rubric
   * promises "no surprise audio") — the pill below unmutes in one tap */
  useEffect(() => {
    const v = videoRef.current;
    if (!mediaUrl || !v) return;
    v.muted = true;
    v.play()?.catch(() => setPhase("gesture")); // even muted autoplay refused
  }, [mediaUrl]);

  /* watchdog — a broken/hung media file never holds the stream hostage.
   * Two independent tripwires: (1) a 20s deadline for playback to START, so
   * a stalled load can't spin forever (slow connections get full headroom —
   * buffering is NOT a stall); (2) 10s of zero progress while actually
   * PLAYING, which catches the rare codec/hardware hang. */
  useEffect(() => {
    if (!mediaUrl) return;
    const startedAt = Date.now();
    let last = -1;
    let stagnant = 0;
    const t = setInterval(() => {
      const v = videoRef.current;
      if (!v || finishedRef.current) return;
      if (!playedRef.current) {
        if (Date.now() - startedAt > 20_000) fail(405);
        return;
      }
      if (v.paused) {
        stagnant = 0; // paused is never a stall (there is no pause UI anyway)
        return;
      }
      if (Math.abs(v.currentTime - last) < 0.2) {
        stagnant += 1;
        if (stagnant >= 10) fail(405);
      } else {
        stagnant = 0;
        last = v.currentTime;
      }
    }, 1000);
    return () => clearInterval(t);
  }, [mediaUrl, fail]);

  const handleTime = () => {
    const v = videoRef.current;
    const a = ad;
    if (!v || !a) return;
    setNow(v.currentTime);
    const dur = v.duration || a.durationSec || 0;
    if (dur > 0) {
      const q = v.currentTime / dur;
      const marks: Array<[string, number]> = [
        ["firstQuartile", 0.25],
        ["midpoint", 0.5],
        ["thirdQuartile", 0.75],
      ];
      for (const [name, at] of marks) {
        const urls = a.tracking[name] ?? [];
        urls.forEach((url, i) => {
          if (q >= at) fireOnce(`${name}-${i}`, url);
        });
      }
      for (const p of a.progress) {
        if (v.currentTime >= p.atSec) fireOnce(`progress-${p.atSec}`, p.url);
      }
    }
    const off = a.skipOffsetSec;
    if (off == null) return;
    if (v.currentTime >= off) {
      setSkip((s) => (s.ready ? s : { ready: true, inSec: 0 }));
      if (!skipFocusedRef.current) {
        skipFocusedRef.current = true;
        skipBtnRef.current?.focus();
      }
    } else {
      setSkip({ ready: false, inSec: Math.ceil(off - v.currentTime) });
    }
  };

  const handlePlay = () => {
    playedRef.current = true;
    setPhase("playing");
    const a = ad;
    if (!a) return;
    a.impressions.forEach((url, i) => fireOnce(`imp-${i}`, url));
    (a.tracking.start ?? []).forEach((url, i) => fireOnce(`start-${i}`, url));
  };

  const handleEnded = () => {
    const a = ad;
    if (a) (a.tracking.complete ?? []).forEach((url, i) => fireOnce(`complete-${i}`, url));
    finish();
  };

  const openClickThrough = () => {
    if (ad?.clickThrough) window.open(ad.clickThrough, "_blank", "noopener,noreferrer");
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (v.paused) v.play()?.catch(() => setPhase("gesture"));
  };

  const remaining = Math.max(0, Math.ceil((length || ad?.durationSec || 0) - now));
  const pct = length > 0 ? Math.min(100, (now / length) * 100) : 0;
  const hasCountdown = length > 0 || (ad?.durationSec ?? 0) > 0;

  return (
    <div
      role="dialog"
      aria-label="Advertisement — your stream starts after the ad"
      className={`fixed inset-0 z-50 overflow-hidden bg-black transition-opacity duration-500 md:absolute md:z-10 ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* faint brand vignette so the wait feels produced, not broken */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,168,225,0.07),transparent_55%)]"
      />
      <span
        aria-hidden
        className="display pointer-events-none absolute bottom-3 right-4 z-10 text-sm text-white/[0.06]"
      >
        reelivo<span className="text-primary/30">.</span>
      </span>

      {phase === "loading" && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="inline-flex items-center gap-2 text-sm text-white/60">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Getting your stream ready…
          </span>
        </div>
      )}

      {phase === "gesture" && (
        <div className="absolute inset-0 z-10 grid place-items-center">
          <button
            type="button"
            onClick={() => {
              videoRef.current?.play()?.catch(() => setPhase("gesture"));
              setPhase("playing");
            }}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[0_6px_24px_rgba(0,168,225,0.35)] transition-all duration-150 hover:scale-[1.03] active:scale-95"
          >
            <Play className="size-4" aria-hidden />
            Play ad
          </button>
        </div>
      )}

      {/* the ad itself + its chrome */}
      <div className={`absolute inset-0 ${phase === "loading" ? "opacity-0" : "opacity-100"}`}>
        <video
          ref={videoRef}
          src={mediaUrl ?? undefined}
          playsInline
          preload="auto"
          className="h-full w-full cursor-pointer object-contain"
          aria-label="Advertisement video — tap to visit the advertiser"
          onLoadedMetadata={(ev) => {
            const d = ev.currentTarget.duration;
            if (Number.isFinite(d)) setLength(d);
          }}
          onPlay={handlePlay}
          onTimeUpdate={handleTime}
          onEnded={handleEnded}
          onError={() => fail(405)}
          onClick={openClickThrough}
        />

        {/* top chrome — AD badge, mobile back, stream countdown (kept inside
         * the Dynamic Island safe space on standalone iOS) */}
        <div className="absolute inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top,0px))] flex items-center justify-between gap-2 md:inset-x-4 md:top-4">
          <div className="flex min-w-0 items-center gap-2">
            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-white/10 px-3.5 text-sm text-white transition-all duration-150 hover:bg-white/20 active:scale-95 md:hidden"
                aria-label="Back to title page"
              >
                <ChevronLeft className="size-4" aria-hidden />
                <span className="display text-[15px] tracking-tight">
                  reelivo<span className="text-primary">.</span>
                </span>
              </button>
            )}
            <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.22em] text-primary-foreground shadow-[0_2px_14px_rgba(0,168,225,0.45)]">
              Ad
              <span className="ml-1.5 hidden font-semibold normal-case tracking-normal sm:inline">
                Advertisement
              </span>
            </span>
          </div>
          <span className="tabular rounded-full border border-white/15 bg-black/50 px-3 py-1 text-xs font-medium text-white/85 backdrop-blur-sm">
            {hasCountdown
              ? remaining > 0
                ? `Your stream starts in 0:${String(remaining).padStart(2, "0")}`
                : "Starting…"
              : "Your stream starts shortly"}
          </span>
        </div>

        {/* bottom chrome — sound, advertiser, skip */}
        <div className="absolute inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] flex items-end justify-between gap-3 md:inset-x-4 md:bottom-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleMute();
              }}
              aria-label={muted ? "Unmute ad" : "Mute ad"}
              className={
                muted
                  ? "inline-flex h-9 items-center gap-1.5 rounded-full bg-primary/15 px-3 text-xs font-semibold text-primary ring-1 ring-primary/40 backdrop-blur-sm transition-all duration-150 hover:bg-primary/25 active:scale-95"
                  : "inline-grid size-9 place-items-center rounded-full bg-black/50 text-white ring-1 ring-white/15 backdrop-blur-sm transition-all duration-150 hover:bg-black/70 active:scale-95"
              }
            >
              {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
              {muted && <span>Tap for sound</span>}
            </button>
            {ad?.clickThrough && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openClickThrough();
                }}
                aria-label="Visit advertiser — opens in a new tab"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-black/50 px-3 text-xs font-medium text-white/85 ring-1 ring-white/15 backdrop-blur-sm transition-all duration-150 hover:bg-black/70 active:scale-95"
              >
                <ExternalLink className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">Visit advertiser</span>
              </button>
            )}
          </div>
          {ad?.skipOffsetSec != null && (
            <button
              ref={skipBtnRef}
              type="button"
              disabled={!skip.ready}
              onClick={(e) => {
                e.stopPropagation();
                finish();
              }}
              aria-label={skip.ready ? "Skip ad" : `Skip becomes available in ${skip.inSec} seconds`}
              className={
                skip.ready
                  ? "inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-bold uppercase tracking-wide text-black shadow-lg transition-all duration-150 hover:bg-white/90 active:scale-95"
                  : "tabular inline-flex h-9 items-center rounded-full border border-white/15 bg-black/50 px-4 text-xs font-medium text-white/60 backdrop-blur-sm"
              }
            >
              {skip.ready ? (
                <>
                  Skip ad <SkipForward className="size-3.5" aria-hidden />
                </>
              ) : (
                `Skip in ${skip.inSec}s`
              )}
            </button>
          )}
        </div>

        {/* ad progress along the bottom edge */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
          <div
            className="h-full bg-primary shadow-[0_0_10px_rgba(0,168,225,0.6)]"
            style={{ width: `${pct}%`, transition: "width 250ms linear" }}
          />
        </div>
      </div>
    </div>
  );
}
