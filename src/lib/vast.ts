/* VAST 3.0 (Video Ad Serving Template) parsing for the HilltopAds video zone.
 *
 * The windy-imagination.com zone URL returns a VAST XML document — NOT a
 * script tag and NOT a direct link. Each <Ad><InLine> carries a Linear
 * creative: the ad video (MediaFiles), when it may be skipped (skipoffset),
 * impression/progress beacons and the advertiser ClickThrough URL. The
 * pre-roll player (components/reelivo/ad-break.tsx) plays one Linear ad
 * before the stream and fires the beacons so HilltopAds counts the run.
 *
 * HilltopAds serves an EMPTY <VAST/> (or a 404) when a request has no fill —
 * an empty parse result is normal and simply means "skip the ad, play the
 * stream". Wrapper (<Ad><Wrapper>) ads would need a second fetch; the zone
 * serves InLine only, and wrappers are skipped defensively.
 */

export type VastMediaFile = {
  url: string;
  type: string; // "video/mp4" | "video/webm" | …
  bitrate: number; // kbps
  width: number;
  height: number;
};

export type VastLinearAd = {
  id: string;
  title: string;
  durationSec: number; // creative duration, 0 when undeclared
  skipOffsetSec: number | null; // null = the zone says this ad is not skippable
  mediaFiles: VastMediaFile[];
  impressions: string[];
  clickThrough: string | null;
  /** Beacon URLs by VAST event name ("start", "firstQuartile", "complete", …) */
  tracking: Record<string, string[]>;
  /** progress beacons with a fixed offset ("00:00:10" / "40%") */
  progress: { atSec: number; url: string }[];
  /** VAST <Error> beacons (per-ad, then root) — [ERRORCODE] gets substituted */
  errors: string[];
};

/** "00:00:35(.5)" → seconds */
function parseClock(value: string | null | undefined): number {
  if (!value) return 0;
  const m = /^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/.exec(value.trim());
  if (!m) return 0;
  const frac = m[4] ? Number(`0.${m[4]}`) : 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + frac;
}

/** VAST offset ("00:00:15" or "50%") → seconds, relative to the duration */
function offsetToSec(value: string, durationSec: number): number | null {
  const t = value.trim();
  if (t.endsWith("%")) {
    const pct = Number(t.slice(0, -1));
    return Number.isFinite(pct) ? (pct / 100) * durationSec : null;
  }
  return parseClock(t);
}

function beaconUrls(list: ArrayLike<Element>): string[] {
  const out: string[] = [];
  for (const el of Array.from(list)) {
    const url = (el.textContent ?? "").trim();
    if (/^https?:\/\//i.test(url)) out.push(url);
  }
  return out;
}

/** Parse a VAST document into its playable Linear ads (never throws). */
export function parseVast(xml: string): VastLinearAd[] {
  if (typeof DOMParser === "undefined") return [];
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "text/xml");
  } catch {
    return [];
  }
  if (doc.querySelector("parsererror")) return [];

  const rootErrors = beaconUrls(doc.querySelectorAll("VAST > Error"));
  const ads: VastLinearAd[] = [];

  for (const adEl of Array.from(doc.querySelectorAll("Ad"))) {
    const inline = adEl.querySelector("InLine");
    if (!inline) continue; // Wrapper → would need another fetch; not used here
    const linear = inline.querySelector("Creative > Linear");
    if (!linear) continue; // non-linear (display) creative — not a pre-roll

    const durationSec = parseClock(linear.querySelector("Duration")?.textContent);

    const tracking: Record<string, string[]> = {};
    const progress: { atSec: number; url: string }[] = [];
    for (const t of Array.from(linear.querySelectorAll("TrackingEvents > Tracking"))) {
      const event = t.getAttribute("event");
      const url = (t.textContent ?? "").trim();
      if (!event || !/^https?:\/\//i.test(url)) continue;
      if (event === "progress") {
        const offset = t.getAttribute("offset");
        const atSec = offset ? offsetToSec(offset, durationSec) : null;
        if (atSec != null) progress.push({ atSec, url });
      } else if (!tracking[event]) {
        tracking[event] = [url];
      } else {
        tracking[event].push(url);
      }
    }

    const mediaFiles: VastMediaFile[] = [];
    for (const mf of Array.from(linear.querySelectorAll("MediaFiles > MediaFile"))) {
      const url = (mf.textContent ?? "").trim();
      if (!/^https?:\/\//i.test(url)) continue;
      mediaFiles.push({
        url,
        type: (mf.getAttribute("type") ?? "").toLowerCase(),
        bitrate: Number(mf.getAttribute("bitrate") ?? 0) || 0,
        width: Number(mf.getAttribute("width") ?? 0) || 0,
        height: Number(mf.getAttribute("height") ?? 0) || 0,
      });
    }

    const skipRaw = linear.getAttribute("skipoffset");

    ads.push({
      id: adEl.getAttribute("id") ?? "",
      title: (inline.querySelector("AdTitle")?.textContent ?? "").trim(),
      durationSec,
      skipOffsetSec: skipRaw == null ? null : offsetToSec(skipRaw, durationSec),
      mediaFiles,
      impressions: beaconUrls(inline.querySelectorAll(":scope > Impression")),
      clickThrough:
        (inline.querySelector("VideoClicks > ClickThrough")?.textContent ?? "").trim() || null,
      tracking,
      progress,
      errors: [...beaconUrls(inline.querySelectorAll(":scope > Error")), ...rootErrors],
    });
  }

  return ads;
}

/** Pick the file that starts fastest and plays everywhere: mp4 first, lowest
 * bitrate wins (a 720p ad at ~900 kbps beats a 1080p 6.8 Mbps one on a phone
 * on mobile data — the ad's job is to start, not to win awards). */
export function pickMediaFile(ad: VastLinearAd): VastMediaFile | null {
  if (ad.mediaFiles.length === 0) return null;
  const browserSafe = ad.mediaFiles.filter(
    (m) => m.type === "video/mp4" || m.type === "video/webm"
  );
  const pool = browserSafe.length > 0 ? browserSafe : ad.mediaFiles;
  const mp4 = pool.filter((m) => m.type === "video/mp4");
  const finalists = mp4.length > 0 ? mp4 : pool;
  return [...finalists].sort((a, b) => (a.bitrate || 1e9) - (b.bitrate || 1e9))[0];
}

/** Pick ONE ad to play from the zone's pod (rotating at random spreads
 * impressions across the creatives the advertiser is running). */
export function pickAd(ads: VastLinearAd[]): VastLinearAd | null {
  const playable = ads.filter((a) => pickMediaFile(a) !== null);
  if (playable.length === 0) return null;
  return playable[Math.floor(Math.random() * playable.length)];
}

/** Fire a tracking beacon — a 1×1 GET the ad server counts. Image beacons
 * need no CORS and never throw; failures are silent by design. */
export function fireBeacon(url: string, errorCode?: number): void {
  try {
    const filled = url.replace("[ERRORCODE]", String(errorCode ?? 100));
    const img = new Image();
    img.style.display = "none";
    img.alt = "";
    img.src = filled;
  } catch {
    /* beacons are best-effort */
  }
}
