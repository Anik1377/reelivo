/* Server-side FALLBACK proxy for the HilltopAds VAST video zone.
 *
 * The PRIMARY path is a direct fetch from the visitor's browser (see
 * lib/ads.ts): HilltopAds only counts traffic from real end-user clients —
 * a request from this server carries a datacenter IP and no real referer,
 * which their anti-fraud filters discard. This proxy exists for the rare
 * browser where the cross-origin read fails; it forwards the visitor's own
 * Origin/Referer so even fallback traffic is attributed to the site, and
 * normalizes a no-fill reply (empty <VAST/> or 404) to an empty <VAST/> —
 * the client parser then yields zero ads and the stream starts instantly.
 * The zone is never allowed to block playback.
 *
 * Rotate the zone without code edits via HILLTOPADS_VAST_URL in .env.
 * `GET /api/ads/vast?mock=1` (dev servers only) returns a bundled sample VAST
 * so the whole pre-roll flow can be QA'd even when the live zone has no fill
 * — pair it with ?adtest=1 on the site (see lib/ads.ts adTestMode()).
 */

export const dynamic = "force-dynamic";

const ZONE_URL =
  process.env.HILLTOPADS_VAST_URL ??
  "https://windy-imagination.com/d/mVFHzud.GzNsvSZCGkUI/zezmX9PulZAUPlqkzPnTnclziNyzdkOzOM/TpcNtBNgzFMj3TOzTwMLy/M/QP";

const EMPTY_VAST =
  '<?xml version="1.0" encoding="UTF-8"?>\n<VAST version="3.0" xmlns="http://www.w3.org/2001/XMLSchema"></VAST>';

/* Short burst cache — the zone rotates creatives, so don't pin them long. */
const CACHE_MS = 20_000;
let cache: { at: number; body: string } | null = null;

/* Dev-only sample VAST, modeled on the real zone's shape (2 InLine ads, skip
 * after 3s, quartile + progress beacons). Media comes from small public
 * sample clips the sandbox can actually reach, and beacons point back at our
 * own /api/ads/pixel (ABSOLUTE urls — VAST beacons are absolute and the
 * parser drops relative ones, matching real-world tags). */
function mockVast(origin: string): string {
  const px = (q: string) => `${origin}/api/ads/pixel?${q}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<VAST xmlns="http://www.w3.org/2001/XMLSchema" version="3.0">
  <Ad id="900001">
    <InLine>
      <AdSystem version="3.0">ReelivoMock</AdSystem>
      <AdTitle>reelivo mock creative A</AdTitle>
      <Impression><![CDATA[${px("k=impression&ad=900001")}]]></Impression>
      <Creatives>
        <Creative>
          <Linear skipoffset="00:00:03">
            <Duration>00:00:05</Duration>
            <TrackingEvents>
              <Tracking event="start"><![CDATA[${px("k=start&ad=900001")}]]></Tracking>
              <Tracking event="firstQuartile"><![CDATA[${px("k=firstQuartile&ad=900001")}]]></Tracking>
              <Tracking event="midpoint"><![CDATA[${px("k=midpoint&ad=900001")}]]></Tracking>
              <Tracking event="thirdQuartile"><![CDATA[${px("k=thirdQuartile&ad=900001")}]]></Tracking>
              <Tracking event="complete"><![CDATA[${px("k=complete&ad=900001")}]]></Tracking>
              <Tracking event="progress" offset="00:00:02"><![CDATA[${px("k=progress2s&ad=900001")}]]></Tracking>
            </TrackingEvents>
            <VideoClicks>
              <ClickThrough><![CDATA[https://example.com/mock-click]]></ClickThrough>
            </VideoClicks>
            <MediaFiles>
              <MediaFile delivery="progressive" type="video/mp4" bitrate="900" width="960" height="540" codec="h264"><![CDATA[https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4]]></MediaFile>
            </MediaFiles>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
  <Ad id="900002">
    <InLine>
      <AdSystem version="3.0">ReelivoMock</AdSystem>
      <AdTitle>reelivo mock creative B</AdTitle>
      <Impression><![CDATA[${px("k=impression&ad=900002")}]]></Impression>
      <Creatives>
        <Creative>
          <Linear skipoffset="00:00:03">
            <Duration>00:00:10</Duration>
            <TrackingEvents>
              <Tracking event="start"><![CDATA[${px("k=start&ad=900002")}]]></Tracking>
              <Tracking event="complete"><![CDATA[${px("k=complete&ad=900002")}]]></Tracking>
            </TrackingEvents>
            <VideoClicks>
              <ClickThrough><![CDATA[https://example.com/mock-click]]></ClickThrough>
            </VideoClicks>
            <MediaFiles>
              <MediaFile delivery="progressive" type="video/mp4" bitrate="400" width="320" height="176" codec="h264"><![CDATA[https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4]]></MediaFile>
            </MediaFiles>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
  <Error><![CDATA[${px("k=error&code=[ERRORCODE]")}]]></Error>
</VAST>`;
}

function xml(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/* HilltopAds ties traffic to the registered website (915848), so the referer
 * we present must be the REAL site — forwarded from the visitor's own
 * request headers (correct on every deployment: production, previews,
 * localhost) instead of a hardcoded guess. */
function refererFrom(req: Request): string | undefined {
  const candidates = [
    req.headers.get("referer"),
    req.headers.get("origin"),
    process.env.NEXT_PUBLIC_SITE_URL,
  ];
  for (const cand of candidates) {
    if (!cand) continue;
    try {
      const u = new URL(cand);
      if (u.protocol === "https:" || u.protocol === "http:") return `${u.origin}/`;
    } catch {
      /* not a URL — try the next candidate */
    }
  }
  return undefined;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.searchParams.has("mock")) {
    // never let a production deployment serve the sample inventory
    return xml(process.env.NODE_ENV === "production" ? EMPTY_VAST : mockVast(url.origin));
  }

  try {
    if (cache && Date.now() - cache.at < CACHE_MS) return xml(cache.body);
    const referer = refererFrom(req);
    const res = await fetch(ZONE_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
      headers: {
        // present as a browser coming from the visitor's own site
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        accept: "*/*",
        ...(referer ? { referer } : {}),
      },
    });
    const body = (await res.text()).trim();
    // 404 / HTML error page / anything non-VAST → normalized no-fill
    const looksVast = /<VAST[\s>]/i.test(body);
    const out = res.ok && looksVast ? body : EMPTY_VAST;
    cache = { at: Date.now(), body: out };
    // observability: this line in the server log proves the fallback path
    // reached the zone (primary browser-direct requests never show up here)
    console.log(
      `[ads] fallback proxy → zone status=${res.status} bytes=${body.length} vast=${looksVast ? "ok" : "no"} referer=${referer ?? "none"}`
    );
    return xml(out);
  } catch {
    // timeout / network failure → no fill; never make the ad block the stream
    console.log("[ads] fallback proxy → zone failed (timeout/network) — empty VAST");
    return xml(EMPTY_VAST);
  }
}
