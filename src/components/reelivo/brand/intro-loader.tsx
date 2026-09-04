"use client";

/* Reelivo opening intro — v4, "The Title Card" (nostalgic logo reveal).
 *
 * Direction from the user: the intro is a LOGO REVEAL and the music should
 * feel NOSTALGIC / emotional. The logo is only "reelivo." with the stop in
 * the brand cyan — so the reveal treats it like a film title card:
 *
 *   0.45s  the finished logo fades up out of blur into focus, as ONE piece
 *          (re-title) — the way an old film title resolves on screen
 *   1.50s  a soft light bar sheens across the letterforms (re-sheen on a
 *          background-clip:text copy) — right as it passes the stop, the
 *          dot keeps the light…
 *   2.05s  IGNITE — the cyan stop glows (re-ignite) with a warm bloom
 *          (re-flash) and a gentle ring ripple (re-ring) on the score's
 *          heartbeat thump
 *   2.65s  tagline + hairline follow
 *   3.75s  the curtain scales away, revealing the app
 *
 * THE SCORE — nostalgic, warm, emotional (fully synthesised WebAudio, zero
 * assets): vinyl crackle + tape hiss bed, an Amaj9 felt-pad with tape
 * warble, a soft felt-piano motif (A4 → E5 → C#5), a breathing sub swell,
 * and when the dot ignites a soft heartbeat thump into a major bloom chord
 * and one lone suspended 9th under the tagline. No braam, no hard impact —
 * sentiment instead of spectacle.
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

const FULL_MS = 3750; // choreography length before the curtain exit
const LEAVE_MS = 500; // curtain length
const REDUCED_MS = 750; // reduced-motion total

/* beat map (ms) — keep in sync with scheduleCue() */
const LOGO = { at: 450, dur: 950 };
const SWEEP = { at: 1500, dur: 1000 };
const IGNITE = 2050; // dot glow + bloom, on the score's heartbeat
const RING = 2250;
const TAGLINE = { at: 2650, dur: 700 };
const HAIRLINE = { at: 2800, dur: 1200 };

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

/* a soft "felt piano" pluck: sine carrier FM'd by its own octave, fast
 * attack, long felt-soft decay; dries to the master and sends to the delay */
function feltPiano(
  ctx: AudioContext,
  out: GainNode,
  delaySend: GainNode,
  freq: number,
  at: number,
  peak: number,
  decay = 1.7,
): AudioScheduledSourceNode[] {
  const carrier = ctx.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = freq;

  const mod = ctx.createOscillator();
  mod.type = "sine";
  mod.frequency.value = freq * 2;
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(freq * 1.3, at);
  modGain.gain.exponentialRampToValueAtTime(1, at + 0.14);
  mod.connect(modGain).connect(carrier.frequency);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(peak, at + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, at + decay);

  const dry = ctx.createGain();
  dry.gain.value = 0.8;
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  carrier.connect(env);
  env.connect(dry).connect(out);
  env.connect(wet).connect(delaySend);

  carrier.start(at);
  mod.start(at);
  carrier.stop(at + decay + 0.1);
  mod.stop(at + 0.3);
  return [carrier, mod];
}

function scheduleCue(ctx: AudioContext, full: boolean): CueStop {
  const t0 = ctx.currentTime + 0.04;
  const sources: AudioScheduledSourceNode[] = [];

  /* warm master: gentle lowpass for tape softness → polite compression */
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const warm = ctx.createBiquadFilter();
  warm.type = "lowpass";
  warm.frequency.value = 5400;
  warm.Q.value = 0.4;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 4;
  master.connect(warm);
  warm.connect(comp);
  comp.connect(ctx.destination);

  const start = (node: AudioScheduledSourceNode, at?: number) => {
    sources.push(node);
    node.start(at ?? t0);
  };

  /* feedback delay — the nostalgic echo everything soft falls into */
  const delaySend = ctx.createGain();
  delaySend.gain.value = 1;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.34;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const fbLp = ctx.createBiquadFilter();
  fbLp.type = "lowpass";
  fbLp.frequency.value = 2400;
  const delayOut = ctx.createGain();
  delayOut.gain.value = 0.5;
  delaySend.connect(delay);
  delay.connect(fb).connect(fbLp).connect(delay);
  delay.connect(delayOut).connect(master);

  if (full) {
    /* 1 — vinyl crackle + tape hiss bed under everything */
    const bed = 3.8;
    const hiss = ctx.createBufferSource();
    hiss.buffer = noiseBuffer(ctx, bed);
    const hissLp = ctx.createBiquadFilter();
    hissLp.type = "lowpass";
    hissLp.frequency.value = 6000;
    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(0.0001, t0);
    hissGain.gain.linearRampToValueAtTime(0.012, t0 + 0.5);
    hissGain.gain.linearRampToValueAtTime(0.0001, t0 + bed);
    hiss.connect(hissLp).connect(hissGain).connect(master);
    start(hiss);
    hiss.stop(t0 + bed);

    for (let i = 0; i < 9; i++) {
      const at = t0 + 0.15 + Math.random() * 3.2;
      const pop = ctx.createBufferSource();
      pop.buffer = noiseBuffer(ctx, 0.03);
      const popBp = ctx.createBiquadFilter();
      popBp.type = "bandpass";
      popBp.frequency.value = 1100 + Math.random() * 1500;
      popBp.Q.value = 2.2;
      const popGain = ctx.createGain();
      const g = 0.02 + Math.random() * 0.03;
      popGain.gain.setValueAtTime(g, at);
      popGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.025);
      pop.connect(popBp).connect(popGain).connect(master);
      start(pop, at);
      pop.stop(at + 0.04);
    }

    /* 2 — Amaj9 felt pad with tape warble (the emotional bed) */
    const padBus = ctx.createGain();
    padBus.gain.setValueAtTime(0.0001, t0 + 0.35);
    padBus.gain.linearRampToValueAtTime(0.9, t0 + 1.9);
    padBus.gain.setValueAtTime(0.9, t0 + 3.2);
    padBus.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.85);
    const padLp = ctx.createBiquadFilter();
    padLp.type = "lowpass";
    padLp.frequency.setValueAtTime(750, t0 + 0.35);
    padLp.frequency.linearRampToValueAtTime(1500, t0 + 2.9);
    padBus.connect(padLp).connect(master);

    const wobble = ctx.createOscillator();
    wobble.type = "sine";
    wobble.frequency.value = 0.55;
    const wobbleDepth = ctx.createGain();
    wobbleDepth.gain.value = 3.5; // cents — gentle tape pitch drift
    wobble.connect(wobbleDepth);
    start(wobble);
    wobble.stop(t0 + 4);

    /* Amaj9 voicing: A3 · B3 · C#4 · E4 (+ A2 root), two detuned voices each */
    const padNotes: Array<[number, number]> = [
      [110.0, 0.07],
      [220.0, 0.05],
      [246.94, 0.045],
      [277.18, 0.045],
      [329.63, 0.045],
    ];
    for (const [f, g] of padNotes) {
      for (const cents of [-4, 4]) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = f;
        osc.detune.value = cents;
        wobbleDepth.connect(osc.detune);
        const og = ctx.createGain();
        og.gain.value = g;
        osc.connect(og).connect(padBus);
        osc.start(t0 + 0.35);
        sources.push(osc);
        osc.stop(t0 + 4);
      }
    }

    /* 3 — felt-piano motif under the reveal: A4 → E5 → C#5 */
    feltPiano(ctx, master, delaySend, 440.0, t0 + 0.6, 0.16).forEach((s) => sources.push(s));
    feltPiano(ctx, master, delaySend, 659.25, t0 + 1.05, 0.13).forEach((s) => sources.push(s));
    feltPiano(ctx, master, delaySend, 554.37, t0 + 1.5, 0.13).forEach((s) => sources.push(s));

    /* 4 — soft airy swell under the sheen sweep (a breath, not a riser) */
    const whoosh = ctx.createBufferSource();
    whoosh.buffer = noiseBuffer(ctx, 0.9);
    const whooshBp = ctx.createBiquadFilter();
    whooshBp.type = "bandpass";
    whooshBp.Q.value = 0.9;
    whooshBp.frequency.setValueAtTime(700, t0 + 1.45);
    whooshBp.frequency.linearRampToValueAtTime(2200, t0 + 2.05);
    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0.0001, t0 + 1.45);
    whooshGain.gain.linearRampToValueAtTime(0.07, t0 + 1.9);
    whooshGain.gain.linearRampToValueAtTime(0.0001, t0 + 2.1);
    whoosh.connect(whooshBp).connect(whooshGain).connect(master);
    start(whoosh, t0 + 1.45);
    whoosh.stop(t0 + 2.15);

    /* 5 — sub swell breathing up to the ignition */
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(40, t0 + 0.5);
    sub.frequency.exponentialRampToValueAtTime(64, t0 + 2.0);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, t0 + 0.5);
    subGain.gain.linearRampToValueAtTime(0.2, t0 + 1.95);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
    sub.connect(subGain).connect(master);
    start(sub);
    sub.stop(t0 + 2.5);
  }

  /* 6 — THE IGNITION: a soft heartbeat thump under the dot's glow —
   * sentiment, not spectacle */
  const t1 = t0 + (full ? 2.01 : 0.05);
  const heart = ctx.createOscillator();
  heart.type = "sine";
  heart.frequency.setValueAtTime(92, t1);
  heart.frequency.exponentialRampToValueAtTime(46, t1 + 0.5);
  const heartGain = ctx.createGain();
  heartGain.gain.setValueAtTime(0.55, t1);
  heartGain.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.9);
  heart.connect(heartGain).connect(master);
  heart.start(t1);
  sources.push(heart);
  heart.stop(t1 + 1.0);

  const breath = ctx.createBufferSource();
  breath.buffer = noiseBuffer(ctx, 0.5);
  const breathLp = ctx.createBiquadFilter();
  breathLp.type = "lowpass";
  breathLp.frequency.value = 380;
  const breathGain = ctx.createGain();
  breathGain.gain.setValueAtTime(0.14, t1);
  breathGain.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.4);
  breath.connect(breathLp).connect(breathGain).connect(master);
  breath.start(t1);
  sources.push(breath);
  breath.stop(t1 + 0.5);

  /* 7 — major bloom chord as the glow settles (Amaj: A4 · C#5 · E5) */
  const bloomAt = t1 + (full ? 0.14 : 0.15);
  [
    [440.0, 0.0, 0.09],
    [554.37, 0.018, 0.08],
    [659.25, 0.036, 0.085],
  ].forEach(([f, dt, g]) => {
    feltPiano(ctx, master, delaySend, f, bloomAt + dt, g, 2.0).forEach((s) => sources.push(s));
  });

  /* 8 — one lone suspended 9th under the tagline, left hanging in the echo */
  const tailAt = full ? t0 + 2.7 : t1 + 0.7;
  feltPiano(ctx, master, delaySend, 493.88, tailAt, 0.085, 2.3).forEach((s) => sources.push(s));

  /* 9 — polite master fade-out */
  const fadeAt = t0 + (full ? 3.5 : 1.5);
  master.gain.setValueAtTime(0.8, fadeAt);
  master.gain.linearRampToValueAtTime(0, fadeAt + 0.6);

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

/* ------------------- the logo, revealed as one piece ------------------- */

const WORDMARK = "reelivo";

function IntroWordmark({ reduced }: { reduced: boolean }) {
  return (
    <div
      role="img"
      aria-label="Reelivo"
      data-testid="intro-wordmark"
      className="display relative inline-flex items-baseline text-[19vw] font-extrabold leading-none tracking-tight text-white sm:text-[88px] md:text-[112px]"
    >
      {/* film-title fade into focus — the whole logo at once. Letters rest
       * slightly muted so the sheen band has contrast, then settle to white */}
      <span
        className={
          reduced
            ? "leading-none"
            : "leading-none motion-safe:animate-[re-title_0.95s_cubic-bezier(0.2,0.7,0.2,1)_both,re-base_0.9s_ease-out_both]"
        }
        style={
          reduced
            ? undefined
            : {
                animationDelay: `${LOGO.at}ms, 1900ms`,
                animationDuration: `${LOGO.dur}ms, 900ms`,
              }
        }
      >
        {WORDMARK}
        {/* the stop — brand cyan, ignites after the sheen passes it */}
        <span className="relative leading-none text-primary">
          {!reduced && (
            <>
              {/* warm bloom at the dot — negative half-size margins centre it
               * on the glyph's INK centre (canvas-measured for Manrope 800:
               * ink centre = left 0.16em, bottom 0.37em measured from the INLINE CONTENT AREA (font ascent+descent = 153px box, not the 112px line box — inline abs children position against it); margins survive
               * transform animations) */}
              <span aria-hidden="true" className="pointer-events-none absolute bottom-[0.37em] left-[0.16em] size-0">
                <span className="absolute left-0 top-0">
                  <span
                    className="-ml-[0.5em] -mt-[0.5em] block size-[1em] rounded-full bg-[radial-gradient(circle,rgba(0,168,225,0.5),rgba(0,168,225,0.16)_45%,transparent_70%)] motion-safe:animate-[re-flash_0.9s_ease-out_both]"
                    style={{ animationDelay: `${IGNITE}ms`, animationDuration: "900ms" }}
                  />
                </span>
              </span>
              {/* gentle ring ripple */}
              <span aria-hidden="true" className="pointer-events-none absolute bottom-[0.37em] left-[0.16em] size-0">
                <span className="absolute left-0 top-0">
                  <span
                    className="-ml-[0.25em] -mt-[0.25em] block size-[0.5em] rounded-full border-[0.024em] border-primary/80 motion-safe:animate-[re-ring_1.1s_cubic-bezier(0.2,0.6,0.3,1)_both]"
                    style={{ animationDelay: `${RING}ms`, animationDuration: "1100ms" }}
                  />
                </span>
              </span>
            </>
          )}
          <span
            className={
              reduced
                ? "inline-block"
                : "inline-block motion-safe:animate-[re-ignite_1s_ease-out_both]"
            }
            style={reduced ? undefined : { animationDelay: `${IGNITE}ms`, animationDuration: "1000ms" }}
          >
            .
          </span>
        </span>
      </span>

      {/* light bar sheening across the letterforms — a transparent-text copy
       * of the logo with background-clip:text; the gradient's position is
       * animated so the highlight travels L→R through the glyphs */}
      {!reduced && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_44%,rgba(255,255,255,0.95)_50%,transparent_56%)] bg-[length:260%_100%] bg-clip-text leading-none text-transparent motion-safe:animate-[re-sheen_1s_ease-in-out_both]"
          style={{ animationDelay: `${SWEEP.at}ms`, animationDuration: `${SWEEP.dur}ms` }}
        >
          {WORDMARK}.
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
      {/* vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,168,225,0.07),transparent_60%)]"
      />
      {/* 35mm film grain — cinema texture, near-invisible */}
      <div aria-hidden className="re-grain pointer-events-none absolute inset-0 opacity-[0.045] mix-blend-screen" />

      <div className="relative flex flex-col items-center px-6">
        {/* breathing halo behind the logo (parent centres, child scales) */}
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
