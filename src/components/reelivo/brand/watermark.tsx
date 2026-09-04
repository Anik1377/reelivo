/* Player watermark — Reelivo's brand bug over the stream.
 *
 * Sits ABOVE the provider iframe (which is cross-origin, so the watermark
 * cannot live inside it) but BELOW the ad-break overlay and the watch-party
 * countdown:   iframe (auto) < watermark (z-[5]) < ad gate (md:z-10 / fixed
 * z-50) < countdown (z-[60]).
 *
 * pointer-events-none is load-bearing: taps pass straight through to the
 * provider's own controls underneath, so the watermark can never block
 * pause/seek/fullscreen. The faint scrim + drop shadow keep it legible over
 * bright scenes, and motion-safe breathing keeps it feeling alive without
 * ever distracting (or violating prefers-reduced-motion).
 *
 * The bug is the wordmark alone — "reelivo." with the cyan stop. No icons.
 */
import { ReelivoWordmark } from "./logo";

export function PlayerWatermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-2.5 top-2.5 z-[5] select-none md:right-3 md:top-3"
      data-testid="player-watermark"
    >
      <div className="flex items-center rounded-full bg-black/40 px-3 py-1.5 ring-1 ring-white/15 backdrop-blur-[2px] motion-safe:animate-[wm-breathe_7s_ease-in-out_infinite]">
        <ReelivoWordmark className="text-[12px] text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]" />
      </div>
    </div>
  );
}
