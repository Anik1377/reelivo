"use client";

/* Reelivo opening intro — the branded site loader.
 *
 * Runs ONCE per browser session (sessionStorage flag set by app.tsx before
 * this component ever mounts) and never on playback deep-links. A cinematic
 * sequence — glowing play-mark, blurred-rise wordmark, hairline light — backed
 * by a fully SYNTHESISED WebAudio score (sub-bass swell → riser → impact →
 * braam → shimmer). Zero audio assets, so there is nothing to download and
 * nothing to 404.
 *
 * Hard rules baked in:
 *  - Skippable: click anywhere, the Skip button, or Escape — never a hostage.
 *  - Autoplay-safe: if the AudioContext is suspended (no user gesture yet),
 *    a "Tap for sound" pill appears; the first tap UNLOCKS the score instead
 *    of skipping. Skip stays available via the button / Escape.
 *  - Reduced motion: the whole choreography collapses to a short static fade.
 *  - Self-cleaning: timers, audio nodes and the context all close on unmount.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { usePrefersReducedMotion } from "../bits";
import { ReelivoMark, ReelivoWordmark } from "./logo";

const FULL_MS = 3400; // choreography length before the exit fade
const LEAVE_MS = 440; // exit fade length
const REDUCED_MS = 750; // reduced-motion total

/* ----------------------------- the score ------------------------------ */
/* Everything is scheduled relative to ctx.currentTime; exponential ramps
 * never target 0 (WebAudio forbids it) — 0.0001 is silent for practical use. */

type CueStop = () => void;

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function scheduleCue(ctx: AudioContext, full: boolean): CueStop {
  const t0 = ctx.currentTime + 0.04;
  const sources: AudioScheduledSourceNode[] = [];

  const master = ctx.createGain();
  master.gain.value = 0.85;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 5;
  master.connect(comp);
  comp.connect(ctx.destination);

  const start = (node: AudioScheduledSourceNode) => {
    sources.push(node);
    node.start(t0);
  };

  if (full) {
    /* 1 — sub-bass swell (tension rising out of silence) */
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(38, t0);
    sub.frequency.exponentialRampToValueAtTime(74, t0 + 1.5);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, t0);
    subGain.gain.linearRampToValueAtTime(0.5, t0 + 1.35);
    subGain.gain.setValueAtTime(0.5, t0 + 1.55);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
    sub.connect(subGain).connect(master);
    start(sub);
    sub.stop(t0 + 2.5);

    /* 2 — filtered-noise riser sweeping up into the impact */
    const riser = ctx.createBufferSource();
    riser.buffer = noiseBuffer(ctx, 1.8);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(260, t0 + 0.1);
    bp.frequency.exponentialRampToValueAtTime(3400, t0 + 1.45);
    const rGain = ctx.createGain();
    rGain.gain.setValueAtTime(0.0001, t0);
    rGain.gain.linearRampToValueAtTime(0.2, t0 + 1.42);
    rGain.gain.linearRampToValueAtTime(0.0001, t0 + 1.5);
    riser.connect(bp).connect(rGain).connect(master);
    start(riser);
    riser.stop(t0 + 1.6);
  }

  /* 3 — the impact at the reveal (sub thump + noise transient) */
  const t1 = t0 + (full ? 1.42 : 0.05);
  const thump = ctx.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(150, t1);
  thump.frequency.exponentialRampToValueAtTime(44, t1 + 0.45);
  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(0.85, t1);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.8);
  thump.connect(thumpGain).connect(master);
  thump.start(t1);
  sources.push(thump);
  thump.stop(t1 + 0.9);

  const burst = ctx.createBufferSource();
  burst.buffer = noiseBuffer(ctx, 0.6);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 700;
  const bGain = ctx.createGain();
  bGain.gain.setValueAtTime(0.5, t1);
  bGain.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.55);
  burst.connect(lp).connect(bGain).connect(master);
  burst.start(t1);
  sources.push(burst);
  burst.stop(t1 + 0.65);

  /* 4 — the braam: a detuned low saw dyad that blooms after the hit */
  const braamGain = ctx.createGain();
  braamGain.gain.setValueAtTime(0.0001, t1);
  braamGain.gain.linearRampToValueAtTime(0.3, t1 + 0.08);
  braamGain.gain.exponentialRampToValueAtTime(0.0001, t1 + 2.1);
  const braamLp = ctx.createBiquadFilter();
  braamLp.type = "lowpass";
  braamLp.frequency.value = 470;
  braamGain.connect(braamLp).connect(master);
  for (const f of [55, 110.7]) {
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = f;
    saw.connect(braamGain);
    saw.start(t1);
    sources.push(saw);
    saw.stop(t1 + 2.2);
  }

  /* 5 — shimmer: two airy triangles into a feedback delay (the "premium" tail) */
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.27;
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  const fbLp = ctx.createBiquadFilter();
  fbLp.type = "lowpass";
  fbLp.frequency.value = 3200;
  delay.connect(fb).connect(fbLp).connect(delay);
  delay.connect(master);
  const tShimmer = full ? t0 + 1.75 : t1 + 0.25;
  [
    { f: 659.25, g: 0.06, at: tShimmer },
    { f: 987.77, g: 0.045, at: tShimmer + 0.22 },
  ].forEach(({ f, g, at }) => {
    const tri = ctx.createOscillator();
    tri.type = "triangle";
    tri.frequency.value = f;
    const gNode = ctx.createGain();
    gNode.gain.setValueAtTime(0.0001, at);
    gNode.gain.linearRampToValueAtTime(g, at + 0.4);
    gNode.gain.exponentialRampToValueAtTime(0.0001, at + 2.2);
    tri.connect(gNode);
    gNode.connect(master);
    gNode.connect(delay);
    tri.start(at);
    sources.push(tri);
    tri.stop(at + 2.3);
  });

  /* 6 — polite master fade-out */
  const fadeAt = t0 + (full ? 3.2 : 1.4);
  master.gain.setValueAtTime(0.85, fadeAt);
  master.gain.linearRampToValueAtTime(0, fadeAt + 0.55);

  return () => {
    try {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0, now, 0.05);
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
    } catch {
      /* context already closed */
    }
  };
}

/* ---------------------------- the component ---------------------------- */
export function IntroLoader({ onDone }: { onDone: () => void }) {
  const reduced = usePrefersReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopCueRef = useRef<CueStop | null>(null);
  const startedRef = useRef(false);
  const doneRef = useRef(false);
  const t0Ref = useRef(0);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  const skip = useCallback(() => {
    stopCueRef.current?.();
    setLeaving(true);
    window.setTimeout(finish, LEAVE_MS * 0.8);
  }, [finish]);

  const unlockSound = useCallback((full: boolean) => {
    const ctx = audioCtxRef.current;
    if (!ctx || startedRef.current) return;
    startedRef.current = true;
    setSoundBlocked(false);
    ctx
      .resume()
      .then(() => {
        stopCueRef.current = scheduleCue(ctx, full);
      })
      .catch(() => {
        /* audio stays silent — visuals carry the intro */
      });
  }, []);

  /* audio context + score (skipped entirely when WebAudio is unavailable) */
  useEffect(() => {
    t0Ref.current = performance.now();
    let ctx: AudioContext | null = null;
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) ctx = new AC();
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    audioCtxRef.current = ctx;
    let raf = 0;
    if (ctx.state === "running") {
      startedRef.current = true;
      stopCueRef.current = scheduleCue(ctx, true);
    } else {
      /* autoplay policy — wait for the first gesture. The flag flips on the
       * next frame (setState is not allowed synchronously inside effects). */
      raf = requestAnimationFrame(() => setSoundBlocked(true));
    }
    return () => {
      cancelAnimationFrame(raf);
      stopCueRef.current?.();
      ctx?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  /* auto timeline */
  useEffect(() => {
    const total = reduced ? REDUCED_MS : FULL_MS;
    const t1 = window.setTimeout(() => setLeaving(true), total);
    const t2 = window.setTimeout(finish, total + LEAVE_MS + 60);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [reduced, finish]);

  /* Escape = skip; any other key unlocks sound when blocked */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        skip();
      } else if (!startedRef.current && audioCtxRef.current) {
        unlockSound(!reduced);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skip, unlockSound, reduced]);

  /* scroll lock while the curtain is up */
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  }, []);

  const handlePointerDown = () => {
    if (!startedRef.current && audioCtxRef.current) {
      /* first tap unlocks the score instead of skipping — the Skip button
       * and Escape remain the explicit ways out */
      unlockSound(!reduced);
      return;
    }
    skip();
  };

  return (
    <div
      className={`fixed inset-0 z-[90] grid place-items-center overflow-hidden bg-black ${
        leaving ? "intro-out" : ""
      }`}
      onPointerDown={handlePointerDown}
      data-testid="intro-loader"
    >
      {/* vignette + stage glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,168,225,0.12),transparent_58%)]"
      />

      <div className="relative flex flex-col items-center px-6">
        <div
          aria-hidden
          className="absolute -top-8 size-64 rounded-full bg-primary/25 blur-3xl motion-safe:animate-[re-glow_2.6s_ease-in-out_infinite]"
        />
        <div
          className={
            reduced ? "" : "motion-safe:animate-[re-pop_0.9s_cubic-bezier(0.2,0.9,0.3,1.2)_both]"
          }
        >
          <ReelivoMark className="size-20 drop-shadow-[0_10px_44px_rgba(0,168,225,0.5)] md:size-24" />
        </div>
        <div
          className={`mt-6 ${
            reduced ? "" : "motion-safe:animate-[re-rise_0.8s_cubic-bezier(0.2,0.7,0.2,1)_0.55s_both]"
          }`}
        >
          <ReelivoWordmark className="text-4xl text-white md:text-5xl" />
        </div>
        <p
          className={`mt-3 text-sm tracking-wide text-ink-dim ${
            reduced ? "" : "motion-safe:animate-[re-rise_0.8s_ease-out_0.8s_both]"
          }`}
        >
          Where to watch, tonight.
        </p>
        <div
          aria-hidden
          className={`mt-7 h-px w-44 origin-center bg-gradient-to-r from-transparent via-primary to-transparent ${
            reduced ? "" : "motion-safe:animate-[re-hairline_1.4s_cubic-bezier(0.2,0.7,0.2,1)_0.7s_both]"
          }`}
        />
      </div>

      {/* explicit way out — always available */}
      <button
        type="button"
        onClick={skip}
        className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 inline-flex h-11 items-center rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm font-medium text-ink-dim backdrop-blur transition-colors duration-150 hover:border-white/25 hover:text-foreground"
      >
        Skip intro
      </button>

      {/* autoplay policy hint — tapping unlocks the score */}
      {soundBlocked && !leaving && (
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            unlockSound(!reduced);
          }}
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 inline-flex h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 text-sm font-medium text-primary backdrop-blur"
        >
          <Volume2 className="size-4" aria-hidden />
          Tap for sound
        </button>
      )}
    </div>
  );
}
