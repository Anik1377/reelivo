"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowUp, Clapperboard, RotateCcw, Star } from "lucide-react";

/* Thin reading-progress line pinned to the very top of the viewport.
 * Transform-only (RAF-throttled) so it rides scroll without layout cost. */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      el.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top,0px)] z-[60] h-[2.5px]">
      <div
        ref={ref}
        style={{ transform: "scaleX(0)" }}
        className="h-full w-full origin-left bg-gradient-to-r from-primary via-[#7ad9ff] to-primary shadow-[0_0_12px_rgba(0,168,225,0.55)]"
      />
    </div>
  );
}

/* Image with a quiet arrival and a typographic fallback. */
export function Img({
  src,
  alt,
  className = "",
  fallbackTitle,
  sizesHint,
}: {
  src: string | null;
  alt: string;
  className?: string;
  fallbackTitle?: string;
  sizesHint?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);

  // adjust state during render when src changes (React-sanctioned pattern)
  if (prevSrc !== src) {
    setPrevSrc(src);
    setLoaded(false);
    setFailed(false);
  }

  if (!src || failed) {
    return (
      <div
        aria-label={alt}
        role="img"
        className={`flex items-center justify-center bg-surface-2 ${className}`}
      >
        <span className="display px-3 text-center text-sm text-ink-dim/70 line-clamp-2 leading-snug">
          {fallbackTitle ?? alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      sizes={sizesHint}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={`img-arrive ${loaded ? "is-loaded" : ""} ${className}`}
    />
  );
}

/** TMDB score — cyan value, tiny label. */
export function Score({ value, className = "" }: { value?: number; className?: string }) {
  if (typeof value !== "number" || value <= 0) return null;
  return (
    <span className={`tabular inline-flex items-center gap-1 ${className}`}>
      <Star className="size-3 fill-primary text-primary" aria-hidden />
      <span className="font-semibold text-foreground">{value.toFixed(1)}</span>
    </span>
  );
}

export function Kicker({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`kicker text-primary ${className}`}>{children}</p>;
}

export function SectionHead({
  kicker,
  title,
  aside,
  id,
}: {
  kicker?: string;
  title: string;
  aside?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        {kicker && <Kicker>{kicker}</Kicker>}
        <h2 id={id} className="display mt-1 text-[20px] leading-tight text-foreground md:text-[22px]">
          {title}
        </h2>
      </div>
      {aside && <div className="shrink-0 pb-0.5">{aside}</div>}
    </div>
  );
}

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150 ${
        selected
          ? "border-primary bg-primary text-primary-foreground font-semibold"
          : "border-white/10 bg-white/[0.04] text-ink-dim hover:border-white/25 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-ink-dim">
      {children}
    </kbd>
  );
}

export function StillSkeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} aria-hidden />;
}

export function RailSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="w-[240px] shrink-0 md:w-[300px] 2xl:w-[340px]">
          <StillSkeleton className="aspect-video w-full" />
          <StillSkeleton className="mt-2.5 h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function EmptyNote({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface px-6 py-14 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-surface-2 ring-1 ring-white/[0.08]" aria-hidden>
        <Clapperboard className="size-6 text-primary/70" />
      </span>
      <p className="display mt-4 text-xl text-foreground">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-dim">{children}</p>}
    </div>
  );
}

export function ErrorNote({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface px-6 py-10 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-surface-2 ring-1 ring-white/[0.08]" aria-hidden>
        <RotateCcw className="size-5 text-ink-dim" />
      </span>
      <p className="mt-3 text-sm text-ink-dim">
        This section failed to load — the reel snapped.
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function useMounted() {
  /* Effect-based mount flag: guaranteed false through SSR, the hydration
   * render AND the first paint, flipping only after commit. The earlier
   * useSyncExternalStore variant (getSnapshot: () => true) flips DURING
   * React 19's hydration pass — any SSR'd structure gated on it rendered a
   * different tree on the client, shifting every downstream useId (Radix
   * ids) and logging hydration mismatches. The rAF indirection also keeps
   * react-hooks/set-state-in-effect happy (no sync setState in the effect).
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return mounted;
}

/* True when the user prefers reduced motion — carousels must not auto-advance. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

/* --------------------------------- back to top ----------------------------- */

const THRESHOLD = 640;

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

function scrollSnapshot() {
  return typeof window !== "undefined" && window.scrollY > THRESHOLD;
}

const scrollServer = () => false;

export function BackToTop() {
  const visible = useSyncExternalStore(subscribeScroll, scrollSnapshot, scrollServer);

  if (!visible) return null;
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => {
        const reduce =
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      }}
      className="fixed bottom-[76px] right-4 z-40 grid size-11 place-items-center rounded-full border border-white/10 bg-surface/90 text-ink-dim shadow-[0_8px_28px_rgba(0,0,0,0.55)] backdrop-blur transition-all duration-150 animate-in hover:border-primary/60 hover:text-primary md:bottom-6 md:right-6 fade-in slide-in-from-bottom-2"
    >
      <ArrowUp className="size-4.5" aria-hidden />
    </button>
  );
}

/* Designed dead-end for routes whose id parsed to nothing (#/director/ with a
 * truncated or junk suffix in a shared link). Paired with id-conditional query
 * paths in the views, so nothing 404s behind the scenes — the page just says
 * honestly that the link is incomplete and offers the way back in. */
export function LostLink() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-32">
      <EmptyNote title="This link lost its reel">
        The address is missing a title or person id — it may have been cut off
        when it was shared. The whole catalogue is one tap away.
      </EmptyNote>
      <div className="mt-6 text-center">
        <a
          href="#/"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-[13px] font-bold text-black transition-all duration-150 hover:-translate-y-px hover:shadow-[0_10px_28px_rgba(0,168,225,0.35)] active:translate-y-0"
        >
          <Clapperboard className="size-4" aria-hidden />
          Back to browse
        </a>
      </div>
    </div>
  );
}
