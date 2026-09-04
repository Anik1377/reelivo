/* Reelivo brand system — the single source of truth for the logo.
 *
 * Three primitives, used everywhere the brand appears:
 *   <ReelivoMark />     — the icon: a gradient play-tile with film perforations
 *   <ReelivoWordmark /> — the name: "reelivo" with a cyan play-triangle terminal
 *   <ReelivoLockup />   — mark + wordmark composed (intro loader, empty states)
 *
 * Everything is inline SVG / text so it stays crisp at any size, inherits
 * layout via className, and costs zero network requests. The gradient id is
 * namespaced with useId so several marks can coexist on one page.
 */
import { useId, type ReactNode } from "react";

export function ReelivoMark({ className }: { className?: string }) {
  const id = useId();
  const gradId = `reelivo-mark-${id.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Reelivo">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2ec7f5" />
          <stop offset="1" stopColor="#0071a4" />
        </linearGradient>
      </defs>
      {/* tile */}
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${gradId})`} />
      <rect
        x="2.75"
        y="2.75"
        width="58.5"
        height="58.5"
        rx="15.25"
        fill="none"
        stroke="rgba(255,255,255,0.30)"
        strokeWidth="1.5"
      />
      {/* film perforations — the "reel" in Reelivo */}
      {[15, 28.5, 42].map((y) => (
        <rect key={y} x="11.5" y={y} width="4.5" height="7" rx="2" fill="rgba(0,20,30,0.42)" />
      ))}
      {/* play */}
      <path
        d="M27.5 21.5 L45 32 L27.5 42.5 Z"
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ReelivoWordmark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Reelivo"
      className={`display inline-flex items-center font-extrabold tracking-tight ${className ?? ""}`}
    >
      <span aria-hidden="true" className="leading-none">
        reelivo
      </span>
      {/* the terminal: a play triangle instead of the old full stop */}
      <svg
        viewBox="0 0 10 12"
        aria-hidden="true"
        className="ml-[0.14em] inline-block size-[0.44em] shrink-0 text-primary"
      >
        <path
          d="M1.4 1.6 L8.8 6 L1.4 10.4 Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function ReelivoLockup({
  markClassName = "size-14",
  wordClassName = "text-3xl",
  children,
}: {
  markClassName?: string;
  wordClassName?: string;
  /** optional tagline / extra lines under the wordmark */
  children?: ReactNode;
}) {
  return (
    <span className="inline-flex flex-col items-center gap-4">
      <ReelivoMark className={markClassName} />
      <span className="inline-flex flex-col items-center gap-2.5">
        <ReelivoWordmark className={wordClassName} />
        {children}
      </span>
    </span>
  );
}
