/* ------------------------------- sponsorship ------------------------------- */
/* HilltopAds monetization (Account 401595 · Website 915848 · VAST zone 7379317).
 *
 * The windy-imagination.com zone URL is a VAST 3.0 ad TAG (video): it returns
 * an XML document describing linear video ads — media files, when the ad may
 * be skipped (skipoffset), impression/tracking beacons and the advertiser
 * ClickThrough. The pre-roll player (components/reelivo/ad-break.tsx) fetches
 * the tag DIRECTLY FROM THE VISITOR'S BROWSER, parses it (lib/vast.ts) and
 * plays ONE ad before the stream.
 *
 * WHY DIRECT: HilltopAds only counts traffic from real end-user clients —
 * the request must carry the visitor's own IP, the site's referer and their
 * client-hint fingerprint (the zone explicitly asks for Sec-CH-UA* hints).
 * Server-fetched copies (datacenter IP + forged referer) are discarded by
 * their anti-fraud filters — that is exactly why the zone used to show zero
 * traffic. The zone answers with access-control-allow-origin:*, so the
 * browser can read the tag cross-origin; the same-origin proxy
 * (/api/ads/vast) survives only as a fallback for browsers where that read
 * fails. Rotate the zone via NEXT_PUBLIC_HILLTOPADS_VAST_URL in .env — no
 * code edit needed.
 *
 * Direct Link zones are a DIFFERENT HilltopAds product (the URL itself
 * redirects to an advertiser). If one is ever configured, setting
 * NEXT_PUBLIC_HILLTOP_DIRECT_LINK re-enables the footer sponsor card
 * automatically; empty = that placement stays hidden.
 */

import type { AnchorHTMLAttributes } from "react";

/** Master switch — flip to false to strip every sponsored placement at once. */
export const ADS_ENABLED = true;

/** HilltopAds VAST video zone tag. Client-visible ON PURPOSE: the visitor's
 * browser must request this URL itself for the traffic to count (see file
 * header). Override via NEXT_PUBLIC_HILLTOPADS_VAST_URL in .env. */
export const HILLTOP_VAST_ZONE =
  process.env.NEXT_PUBLIC_HILLTOPADS_VAST_URL ??
  "https://windy-imagination.com/d/mVFHzud.GzNsvSZCGkUI/zezmX9PulZAUPlqkzPnTnclziNyzdkOzOM/TpcNtBNgzFMj3TOzTwMLy/M/QP";

/** Optional Direct Link zone (drives the footer sponsor card). Empty = none. */
export const HILLTOP_DIRECT_LINK = process.env.NEXT_PUBLIC_HILLTOP_DIRECT_LINK ?? "";

/** Null when no Direct Link zone is configured — callers hide the placement. */
export const sponsorLinkProps: AnchorHTMLAttributes<HTMLAnchorElement> | null =
  HILLTOP_DIRECT_LINK
    ? { href: HILLTOP_DIRECT_LINK, target: "_blank", rel: "sponsored noopener noreferrer" }
    : null;

/* --------------------------- ad cadence policy --------------------------- */
/* Pre-rolls are UNCONDITIONAL: every playback start (any title/season/episode)
 * requests the zone tag and plays one ad when there is fill. User directive
 * 2025: "the ad should always play at the beginning" — the old per-device
 * 10-minute pre-roll cap (localStorage reelivo-adbreak-at) was REMOVED; it is
 * exactly why the player used to skip the ad on most plays.
 *
 * Mid-rolls cover the other half: while the viewer keeps watching, an ad
 * break interrupts the stream every AD_BREAK_EVERY_MS of accumulated,
 * tab-visible playback time (the scheduler lives in views/player.tsx; here
 * we only own the interval). Whether an ad actually PLAYS is still up to
 * HilltopAds inventory — a no-fill reply = the break ends instantly. */
export const AD_BREAK_EVERY_MS = 10 * 60 * 1000;

/** Mid-roll interval, with a QA override: `?adtest=1&adinterval=20` compresses
 * breaks to every 20 s so the scheduler can be watched end-to-end without a
 * ten-minute wait. Only honored while ?adtest is present — regular traffic
 * always gets the production cadence. Floor of 5 s keeps absurd values out. */
export function midRollIntervalMs(): number {
  if (typeof window === "undefined") return AD_BREAK_EVERY_MS;
  if (adTestMode()) {
    try {
      const sec = Number(new URLSearchParams(window.location.search).get("adinterval"));
      if (Number.isFinite(sec) && sec >= 5) return sec * 1000;
    } catch {
      /* malformed query — production cadence */
    }
  }
  return AD_BREAK_EVERY_MS;
}

/** QA hook: add ?adtest=1 to any URL to force the ad break with a bundled
 * mock VAST — exercises the full ad flow even when the live zone has no fill.
 * ?adtest=live forces the REAL zone instead — a one-URL way to watch the
 * browser hit windy-imagination.com in the network panel and confirm
 * HilltopAds is receiving requests. Pairs with &adinterval=<sec> to compress
 * mid-roll cadence. No-op outside the browser. */
export function adTestMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).has("adtest");
  } catch {
    return false;
  }
}

/** Which tag ?adtest should load — "mock" (bundled sample) or "live" (the
 * real HilltopAds zone). Plain ?adtest / ?adtest=1 mean mock. */
export function adTestFlavor(): "mock" | "live" {
  if (typeof window === "undefined") return "mock";
  try {
    return new URLSearchParams(window.location.search).get("adtest") === "live"
      ? "live"
      : "mock";
  } catch {
    return "mock";
  }
}
