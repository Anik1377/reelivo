"use client";

/* Reelivo opening intro — "The Name Is the Logo" (v3, slick black).
 *
 * Direction from the user: the logo is ONLY "reelivo" with the dot in the
 * brand colour — no icons, no marks, no shapes. So the reveal is pure
 * typography on slick black:
 *
 *   0.35s  the letters of "reelivo" rise out of a baseline mask one by one
 *          (custom staggered lift, 90ms apart)
 *   1.65s  the cyan STOP drops from above and squashes onto the baseline
 *   2.08s  IMPACT — bloom flash + a ring ripple radiating from the dot,
 *          exactly on the score's thump
 *   2.35s  a light bar sweeps across the finished wordmark
 *   2.55s  tagline + hairline follow
 *   3.65s  the curtain scales away, revealing the app
 *
 * The score is fully SYNTHESISED WebAudio (zero audio assets) and beat-mapped
 * to the visuals: quiet hum under the letters → sub swell + riser → impact →
 * braam → shimmer under the shine sweep.
 *
 * Hard rules baked in:
 *  - Skippable: Skip button, Escape, or tap anywhere once audio is unlocked.
 *  - Autoplay-safe: if the AudioContext is suspended (no user gesture yet),
 *    a "Tap for sound" pill appears; the first tap UNLOCKS the score instead
 *    of skipping. Skip stays available via the button / Escape.
 *  - Reduced motion: the whole choreography collapses to a short static fade.
 *  - Self-cleaning: timers, audio nodes and the context all close on unmount.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { usePrefersReducedMotion } from "../bits";

const FULL_MS = 3650; // choreography length before the curtain exit
const LEAVE_MS = 500; // curtain length
const REDUCED_MS = 750; // reduced-motion total

/* beat map (ms) — keep in sync with scheduleCue() */
const LETTERS = { at: 350, step: 90, dur: 620 };
const DOT = { at: 1650, dur: 460 };
const IMPACT = 2080; // bloom + ring, on the score's thump
const TAGLINE = { at: 2550, dur: 700 };
const HAIRLINE = { at: 2700, dur: 1200 };

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

  const start = (node: AudioScheduledSourceNode, at?: number) => {
    sources.push(node);
    node.start(at ?? t0);
  };

  if (full) {
    /* 1 — quiet projector hum + air bed while the letters rise */
    const hum = ctx.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 46;
    const humGain = ctx.createGain();
    humGain.gain.setValueAtTime(0.0001, t0 + 0.1);
    humGain.gain.linearRampToValueAtTime(0.11, t0 + 0.6);
    humGain.gain.linearRampToValueAtTime(0.0001, t0 + 1.6);
    hum.connect(humGain).connect(master);
    start(hum);
    hum.stop(t0 + 1.7);

    const air = ctx.createBufferSource();
    air.buffer = noiseBuffer(ctx, 1.7);
    const airLp = ctx.createBiquadFilter();
    airLp.type = "lowpass";
    airLp.frequency.value = 520;
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.0001, t0 + 0.1);
    airGain.gain.linearRampToValueAtTime(0.03, t0 + 0.7);
    airGain.gain.linearRampToValueAtTime(0.0001, t0 + 1.6);
    air.connect(airLp).connect(airGain).connect(master);
    start(air);
    air.stop(t0 + 1.7);

    /* 2 — sub-bass swell as the wordmark completes (tension rising) */
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(38, t0 + 0.55);
    sub.frequency.exponentialRampToValueAtTime(74, t0 + 1.95);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, t0 + 0.55);
    subGain.gain.linearRampToValueAtTime(0.5, t0 + 1.9);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.25);
    sub.connect(subGain).connect(master);
    start(sub);
    sub.stop(t0 + 2.35);

    /* 3 — filtered-noise riser sweeping up into the impact */
    const riser = ctx.createBufferSource();
    riser.buffer = noiseBuffer(ctx, 1.4);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(260, t0 + 0.75);
    bp.frequency.exponentialRampToValueAtTime(3400, t0 + 1.98);
    const rGain = ctx.createGain();
    rGain.gain.setValueAtTime(0.0001, t0 + 0.75);
    rGain.gain.linearRampToValueAtTime(0.2, t0 + 1.96);
    rGain.gain.linearRampToValueAtTime(0.0001, t0 + 2.04);
    riser.connect(bp).connect(rGain).connect(master);
    start(riser);
    riser.stop(t0 + 2.1);
  }

  /* 4 — THE IMPACT (sub thump + noise transient) — beat-mapped to the cyan
   * stop squashing onto the baseline */
  const t1 = t0 + (full ? 2.04 : 0.05);
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

  /* 5 — the braam: a detuned low saw dyad that blooms after the hit */
  const braamGain = ctx.createGain();
  braamGain.gain.setValueAtTime(0.0001, t1);
  braamGain.gain.linearRampToValueAtTime(0.3, t1 + 0.08);
  braamGain.gain.exponentialRampToValueAtTime(0.0001, t1 + 2.0);
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
    saw.stop(t1 + 2.1);
  }

  /* 6 — shimmer: two airy triangles into a feedback delay (the "premium" tail)
   * timed with the wordmark shine sweep */
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.27;
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  const fbLp = ctx.createBiquadFilter();
  fbLp.type = "lowpass";
  fbLp.frequency.value = 3200;
  delay.connect(fb).connect(fbLp).connect(delay);
  delay.connect(master);
  const tShimmer = t1 + (full ? 0.45 : 0.25);
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

  /* 7 — polite master fade-out */
  const fadeAt = t0 + (full ? 3.45 : 1.4);
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

/* --------------------- the wordmark, letter by letter ------------------ */
/* Each letter rises out of its own overflow-hidden mask; the cyan stop then
 * drops, squashes onto the baseline, and radiates the impact ring. */

const WORDMARK = "reelivo";

function IntroWordmark({ reduced }: { reduced: boolean }) {
  return (
    <div
      role="img"
      aria-label="Reelivo"
      data-testid="intro-wordmark"
      className="display relative inline-flex items-baseline text-[19vw] font-extrabold leading-none tracking-tight text-white sm:text-[88px] md:text-[112px]"
    >
      {WORDMARK.split("").map((ch, i) => (
        <span key={`${ch}-${i}`} aria-hidden="true" className="inline-block overflow-hidden pb-[0.06em]">
          <span
            className={
              reduced
                ? "inline-block"
                : "inline-block motion-safe:animate-[re-lift_0.62s_cubic-bezier(0.16,0.84,0.28,1)_both]"
            }
            style={
              reduced
                ? undefined
                : { animationDelay: `${LETTERS.at + i * LETTERS.step}ms`, animationDuration: `${LETTERS.dur}ms` }
            }
          >
            {ch}
          </span>
        </span>
      ))}

      {/* THE STOP — brand cyan, drops and lands on the beat */}
      <span aria-hidden="true" className="relative inline-block text-primary">
        {/* ring ripple from the landing point: size-0 anchor at the glyph's
         * visual centre; the ripple centres itself with negative half-size
         * margins (margins survive transform animations untouched) */}
        {!reduced && (
          <span className="pointer-events-none absolute bottom-[0.2em] left-[0.12em] size-0">
            <span className="absolute left-0 top-0">
              <span
                className="-ml-[0.25em] -mt-[0.25em] block size-[0.5em] rounded-full border-[0.026em] border-primary motion-safe:animate-[re-ring_0.9s_cubic-bezier(0.2,0.6,0.3,1)_both]"
                style={{ animationDelay: `${IMPACT}ms`, animationDuration: "900ms" }}
              />
            </span>
          </span>
        )}
        {/* impact bloom — same anchor pattern */}
        {!reduced && (
          <span className="pointer-events-none absolute bottom-[0.2em] left-[0.12em] size-0">
            <span className="absolute left-0 top-0">
              <span
                className="-ml-[0.45em] -mt-[0.45em] block size-[0.9em] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.75),rgba(0,168,225,0.3)_45%,transparent_70%)] motion-safe:animate-[re-flash_0.7s_ease-out_both]"
                style={{ animationDelay: `${IMPACT}ms`, animationDuration: "700ms" }}
              />
            </span>
          </span>
        )}
        <span
          className={
            reduced
              ? "inline-block"
              : "inline-block drop-shadow-[0_0_0.22em_rgba(0,168,225,0.55)] motion-safe:animate-[re-dot_0.46s_cubic-bezier(0.3,0.6,0.3,1)_both]"
          }
          style={reduced ? undefined : { animationDelay: `${DOT.at}ms`, animationDuration: `${DOT.dur}ms` }}
        >
          .
        </span>
      </span>
    </div>
  );
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

  /* auto timeline. QA hook: ?introhold=1 suspends the auto-dismiss so phased
   * screenshots can be taken — Skip/Escape/click still end it normally. */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("introhold")) return;
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

  const anim = (delay: number, dur: number) =>
    reduced ? undefined : { animationDelay: `${delay}ms`, animationDuration: `${dur}ms` };

  return (
    <div
      className={`fixed inset-0 z-[90] grid place-items-center overflow-hidden bg-black ${
        leaving ? "intro-out" : ""
      }`}
      onPointerDown={handlePointerDown}
      data-testid="intro-loader"
    >
      {/* vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,168,225,0.07),transparent_60%)]"
      />
      {/* 35mm film grain — cinema texture, near-invisible */}
      <div aria-hidden className="re-grain pointer-events-none absolute inset-0 opacity-[0.045] mix-blend-screen" />

      <div className="relative flex flex-col items-center px-6">
        {/* breathing halo behind the wordmark (parent centres, child scales) */}
        <div aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="size-[min(130vw,560px)] rounded-full bg-primary/[0.07] blur-3xl motion-safe:animate-[re-glow_2.8s_ease-in-out_infinite]" />
        </div>

        <IntroWordmark reduced={reduced} />

        <p
          className={`mt-7 text-sm tracking-wide text-ink-dim md:text-base ${
            reduced ? "" : "motion-safe:animate-[re-rise_0.7s_ease-out_both]"
          }`}
          style={anim(TAGLINE.at, TAGLINE.dur)}
        >
          Where to watch, tonight.
        </p>
        <div
          aria-hidden
          className={`mt-7 h-px w-56 origin-center bg-gradient-to-r from-transparent via-primary to-transparent md:w-72 ${
            reduced ? "" : "motion-safe:animate-[re-hairline_1.2s_cubic-bezier(0.2,0.7,0.2,1)_both]"
          }`}
          style={anim(HAIRLINE.at, HAIRLINE.dur)}
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
