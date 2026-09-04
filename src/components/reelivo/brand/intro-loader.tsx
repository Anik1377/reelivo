"use client";

/* Reelivo opening intro — "The Premiere" (v2, cinematic logo reveal).
 *
 * The full brand logo performs a choreographed reveal — no abstract shapes:
 *
 *   0.0s  projector ignites — a cyan hairline beam draws out from centre
 *   0.5s  the play-tile mark ASSEMBLES on the beam: outline drawn like a pen,
 *         gradient fill wiping across, film perforations threading in one by
 *         one, and the play triangle gliding home with a spring overshoot
 *   1.45s a lens glint sweeps across the finished tile
 *   1.85s IMPACT — white bloom + the score's thump lands exactly as the
 *         triangle seats into the tile
 *   1.95s the wordmark premieres: "reelivo" cascades in letter by letter
 *         (blur-rise), the cyan play-triangle terminal pops on the beat
 *   2.55s a light bar sweeps across the wordmark, tagline + hairline follow
 *   3.9s  the curtain scales away, revealing the app
 *
 * The score is fully SYNTHESISED WebAudio (zero audio assets) and beat-mapped
 * to the visuals: hum → sub swell + riser → impact → braam → shimmer.
 *
 * Hard rules baked in:
 *  - Skippable: Skip button, Escape, or tap anywhere once audio is unlocked.
 *  - Autoplay-safe: if the AudioContext is suspended (no user gesture yet),
 *    a "Tap for sound" pill appears; the first tap UNLOCKS the score instead
 *    of skipping. Skip stays available via the button / Escape.
 *  - Reduced motion: the whole choreography collapses to a short static fade.
 *  - Self-cleaning: timers, audio nodes and the context all close on unmount.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { usePrefersReducedMotion } from "../bits";

const FULL_MS = 3900; // choreography length before the curtain exit
const LEAVE_MS = 500; // curtain length
const REDUCED_MS = 750; // reduced-motion total

/* beat map (ms) — keep in sync with scheduleCue() */
const BEAM = { at: 100, dur: 1600 };
const OUTLINE = { at: 500, dur: 600 };
const FILL = { at: 650, dur: 650 };
const PERF = { at: 950, step: 110, dur: 380 };
const TRIANGLE = { at: 1300, dur: 520 };
const GLINT = { at: 1450, dur: 750 };
const IMPACT = 1850;
const WORD = { at: 1950, step: 60, dur: 520 };
const TERMINAL = { at: 2420, dur: 420 };
const SHINE = { at: 2550, dur: 950 };
const TAGLINE = { at: 2700, dur: 700 };
const HAIRLINE = { at: 2850, dur: 1200 };

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
    /* 1 — projector hum: a quiet low tone + airy noise bed while the beam draws */
    const hum = ctx.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 46;
    const humGain = ctx.createGain();
    humGain.gain.setValueAtTime(0.0001, t0 + 0.1);
    humGain.gain.linearRampToValueAtTime(0.14, t0 + 0.7);
    humGain.gain.linearRampToValueAtTime(0.0001, t0 + 1.9);
    hum.connect(humGain).connect(master);
    start(hum);
    hum.stop(t0 + 2.0);

    const air = ctx.createBufferSource();
    air.buffer = noiseBuffer(ctx, 2.0);
    const airLp = ctx.createBiquadFilter();
    airLp.type = "lowpass";
    airLp.frequency.value = 520;
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.0001, t0 + 0.1);
    airGain.gain.linearRampToValueAtTime(0.035, t0 + 0.8);
    airGain.gain.linearRampToValueAtTime(0.0001, t0 + 1.9);
    air.connect(airLp).connect(airGain).connect(master);
    start(air);
    air.stop(t0 + 2.0);

    /* 2 — sub-bass swell while the mark assembles (tension rising) */
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(38, t0 + 0.45);
    sub.frequency.exponentialRampToValueAtTime(74, t0 + 1.75);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, t0 + 0.45);
    subGain.gain.linearRampToValueAtTime(0.5, t0 + 1.7);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.1);
    sub.connect(subGain).connect(master);
    start(sub);
    sub.stop(t0 + 2.2);

    /* 3 — filtered-noise riser sweeping up into the impact */
    const riser = ctx.createBufferSource();
    riser.buffer = noiseBuffer(ctx, 1.5);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(260, t0 + 0.6);
    bp.frequency.exponentialRampToValueAtTime(3400, t0 + 1.78);
    const rGain = ctx.createGain();
    rGain.gain.setValueAtTime(0.0001, t0 + 0.6);
    rGain.gain.linearRampToValueAtTime(0.2, t0 + 1.76);
    rGain.gain.linearRampToValueAtTime(0.0001, t0 + 1.84);
    riser.connect(bp).connect(rGain).connect(master);
    start(riser);
    riser.stop(t0 + 1.9);
  }

  /* 4 — THE IMPACT (sub thump + noise transient) — beat-mapped to the
   * triangle seating into the tile / the bloom flash */
  const t1 = t0 + (full ? 1.81 : 0.05);
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
  const tShimmer = t1 + (full ? 0.55 : 0.25);
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
  const fadeAt = t0 + (full ? 3.75 : 1.4);
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

/* --------------------- the animated brand mark ------------------------ */
/* Same geometry/colours as <ReelivoMark/> (the favicon artwork) but every
 * part is a separately animated layer so the logo can assemble on screen. */

function IntroMark({ reduced }: { reduced: boolean }) {
  const id = useId();
  const ns = id.replace(/[^a-zA-Z0-9]/g, "");
  const gradId = `reelivo-mark-${ns}`;
  const clipId = `reelivo-tile-${ns}`;
  const glintId = `reelivo-glint-${ns}`;

  return (
    <svg
      viewBox="0 0 64 64"
      className="size-20 drop-shadow-[0_10px_44px_rgba(0,168,225,0.5)] md:size-24"
      role="img"
      aria-label="Reelivo"
      data-testid="intro-mark"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2ec7f5" />
          <stop offset="1" stopColor="#0071a4" />
        </linearGradient>
        <linearGradient id={glintId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x="2" y="2" width="60" height="60" rx="16" />
        </clipPath>
      </defs>

      {/* tile fill — a gradient wipe sweeping left → right */}
      <g clipPath={`url(#${clipId})`}>
        <rect
          x="2"
          y="2"
          width="60"
          height="60"
          rx="16"
          fill={`url(#${gradId})`}
          className={
            reduced
              ? ""
              : "motion-safe:animate-[re-wipe_0.65s_cubic-bezier(0.3,0.6,0.2,1)_both]"
          }
          style={reduced ? undefined : { animationDelay: `${FILL.at}ms`, animationDuration: `${FILL.dur}ms` }}
        />
        {/* lens glint crossing the finished tile */}
        {!reduced && (
          <rect
            x="-8"
            y="-14"
            width="14"
            height="92"
            fill={`url(#${glintId})`}
            className="re-svg-part motion-safe:animate-[re-glint_0.75s_cubic-bezier(0.3,0,0.3,1)_both]"
            style={{ animationDelay: `${GLINT.at}ms`, animationDuration: `${GLINT.dur}ms` }}
          />
        )}
      </g>

      {/* tile outline — drawn like a pen stroke (pathLength normalised to 100) */}
      <rect
        x="2.75"
        y="2.75"
        width="58.5"
        height="58.5"
        rx="15.25"
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1.5"
        pathLength={100}
        strokeDasharray={100}
        strokeDashoffset={reduced ? 0 : 100}
        className={reduced ? "" : "motion-safe:animate-[re-draw_0.6s_ease-out_both]"}
        style={reduced ? undefined : { animationDelay: `${OUTLINE.at}ms`, animationDuration: `${OUTLINE.dur}ms` }}
      />

      {/* film perforations — the "reel" in Reelivo, threading in one by one */}
      {[15, 28.5, 42].map((y, i) => (
        <rect
          key={y}
          x="11.5"
          y={y}
          width="4.5"
          height="7"
          rx="2"
          fill="rgba(0,20,30,0.42)"
          className={
            reduced
              ? ""
              : "re-svg-part motion-safe:animate-[re-perf_0.38s_cubic-bezier(0.2,0.7,0.2,1)_both]"
          }
          style={
            reduced
              ? undefined
              : { animationDelay: `${PERF.at + i * PERF.step}ms`, animationDuration: `${PERF.dur}ms` }
          }
        />
      ))}

      {/* the play triangle glides home with a spring overshoot */}
      <path
        d="M27.5 21.5 L45 32 L27.5 42.5 Z"
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth="3.5"
        strokeLinejoin="round"
        className={
          reduced ? "" : "re-svg-part motion-safe:animate-[re-tri_0.52s_cubic-bezier(0.2,0.8,0.3,1)_both]"
        }
        style={reduced ? undefined : { animationDelay: `${TRIANGLE.at}ms`, animationDuration: `${TRIANGLE.dur}ms` }}
      />
    </svg>
  );
}

/* --------------------- the wordmark, letter by letter ------------------ */

const WORDMARK = "reelivo";

function IntroWordmark({ reduced }: { reduced: boolean }) {
  return (
    <div
      role="img"
      aria-label="Reelivo"
      data-testid="intro-wordmark"
      className="display relative inline-flex items-center text-5xl font-extrabold tracking-tight text-white md:text-7xl"
    >
      {WORDMARK.split("").map((ch, i) => (
        <span
          key={`${ch}-${i}`}
          aria-hidden="true"
          className={
            reduced
              ? "inline-block"
              : "inline-block motion-safe:animate-[re-letter_0.52s_cubic-bezier(0.2,0.7,0.2,1)_both]"
          }
          style={reduced ? undefined : { animationDelay: `${WORD.at + i * WORD.step}ms`, animationDuration: `${WORD.dur}ms` }}
        >
          {ch}
        </span>
      ))}
      {/* the terminal: a play triangle that pops on the beat */}
      <svg
        viewBox="0 0 10 12"
        aria-hidden="true"
        className={`ml-[0.14em] inline-block size-[0.44em] shrink-0 text-primary ${
          reduced ? "" : "motion-safe:animate-[re-term_0.42s_cubic-bezier(0.2,0.8,0.3,1.4)_both]"
        }`}
        style={reduced ? undefined : { animationDelay: `${TERMINAL.at}ms`, animationDuration: `${TERMINAL.dur}ms` }}
      >
        <path
          d="M1.4 1.6 L8.8 6 L1.4 10.4 Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
      {/* light bar sweeping across the wordmark (clipped to this block) */}
      {!reduced && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-sm">
          <span
            className="absolute inset-y-0 left-0 block w-1/3 bg-gradient-to-r from-transparent via-white/75 to-transparent motion-safe:animate-[re-shine_0.95s_cubic-bezier(0.3,0,0.3,1)_both]"
            style={{ animationDelay: `${SHINE.at}ms`, animationDuration: `${SHINE.dur}ms` }}
          />
        </span>
      )}
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
      {/* vignette + stage glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,168,225,0.12),transparent_58%)]"
      />
      {/* 35mm film grain — cinema texture, near-invisible */}
      <div aria-hidden className="re-grain pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-screen" />

      <div className="relative flex flex-col items-center px-6">
        {/* breathing halo behind the lockup */}
        <div
          aria-hidden
          className="absolute -top-10 size-72 rounded-full bg-primary/25 blur-3xl motion-safe:animate-[re-glow_2.6s_ease-in-out_infinite]"
        />

        {/* projector beam — ignites from the centre, hands off to the tile */}
        {!reduced && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-10 h-px w-[min(72vw,540px)] -translate-x-1/2 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_18px_2px_rgba(0,168,225,0.55)] motion-safe:animate-[re-beam_1.6s_cubic-bezier(0.3,0,0.3,1)_both] md:top-12"
            style={anim(BEAM.at, BEAM.dur)}
          />
        )}

        {/* impact bloom when the triangle seats (parent centres, child scales) */}
        {!reduced && (
          <div aria-hidden className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2">
            <div className="size-52 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.8),rgba(0,168,225,0.32)_42%,transparent_70%)] motion-safe:animate-[re-flash_0.7s_ease-out_both]" style={anim(IMPACT, 700)} />
          </div>
        )}

        {/* the logo itself — assembled piece by piece */}
        <div className="relative">
          <IntroMark reduced={reduced} />
        </div>

        {/* the wordmark premieres letter by letter */}
        <div className="mt-7 md:mt-9">
          <IntroWordmark reduced={reduced} />
        </div>

        <p
          className={`mt-4 text-sm tracking-wide text-ink-dim md:text-base ${
            reduced ? "" : "motion-safe:animate-[re-rise_0.7s_ease-out_both]"
          }`}
          style={anim(TAGLINE.at, TAGLINE.dur)}
        >
          Where to watch, tonight.
        </p>
        <div
          aria-hidden
          className={`mt-7 h-px w-52 origin-center bg-gradient-to-r from-transparent via-primary to-transparent md:w-64 ${
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
