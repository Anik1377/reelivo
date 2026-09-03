/* ------------------------------- sponsorship ------------------------------- */
/* HilltopAds — Direct Link zone.
 *
 * A Direct Link zone has NO script tag and NO code snippet: the URL itself IS
 * the ad unit. The site earns by opening this URL from sponsored placements:
 *
 *   1. Pre-roll "ad break" before the stream loads (views/player.tsx)
 *   2. "Sponsored" card in the footer (footer.tsx)
 *
 * To rotate the link later (new zone / new network), change the env var in
 * .env — no code edit needed:
 *   NEXT_PUBLIC_HILLTOP_DIRECT_LINK=https://…
 */

export const HILLTOP_DIRECT_LINK =
  process.env.NEXT_PUBLIC_HILLTOP_DIRECT_LINK ??
  "https://windy-imagination.com/dLm.FKzzdbG/NVv/Z/G/Ub/kedmm9auQZwUfl-k/PoTtcNzqN/zDk/zQMYTtcyt/Naz/Mi3rOVTIMsyoMDQe";

/** Master switch — flip to false to strip every sponsored placement at once. */
export const ADS_ENABLED = true;

/* Pre-roll cadence: at most one ad break per device per window. First play of
 * a session shows it; plays within the window after that start instantly. */
export const AD_BREAK_EVERY_MS = 10 * 60 * 1000;
export const AD_BREAK_SECONDS = 5;

const CAP_KEY = "reelivo-adbreak-at";

export function shouldShowAdBreak(): boolean {
  if (!ADS_ENABLED || typeof window === "undefined") return false;
  try {
    const last = Number(localStorage.getItem(CAP_KEY) ?? 0);
    return !Number.isFinite(last) || Date.now() - last >= AD_BREAK_EVERY_MS;
  } catch {
    return true; // storage unavailable (private mode) — the break is only 5s
  }
}

/** Record that a break just played — call when the break STARTS, so a reload
 * mid-break can't farm a fresh window. */
export function markAdBreakShown() {
  try {
    localStorage.setItem(CAP_KEY, String(Date.now()));
  } catch {
    /* cap simply won't persist */
  }
}

/** Attributes every outbound sponsor link must carry — Google requires
 * rel="sponsored", and noopener keeps the ad tab from hijacking ours. */
export const sponsorLinkProps = {
  href: HILLTOP_DIRECT_LINK,
  target: "_blank",
  rel: "sponsored noopener noreferrer",
} as const;
