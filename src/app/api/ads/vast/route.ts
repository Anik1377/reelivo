/* Server-side proxy for the HilltopAds VAST video zone.
 *
 * Why a proxy: the zone replies differently per client (plain curl gets a
 * 404, real browsers get the XML), so the pre-roll player asks our own API,
 * which fetches the tag with browser-like headers. A no-fill reply —
 * HilltopAds serves an EMPTY <VAST/> or a 404 when a request isn't sold — is
 * normalized to an empty <VAST/>; the client parser then yields zero ads and
 * the stream starts instantly. The zone is never allowed to block playback.
 *
 * Rotate the zone without code edits via HILLTOPADS_VAST_URL in .env.
 * `GET /api/ads/vast?mock=1` (dev servers only) returns a bundled sample VAST
 * so the whole pre-roll flow can be QA'd even when the live zone has no fill
 * — pair it with ?adtest=1 on the site (see lib/ads.ts adTestMode()).
 */

export const dynamic = "force-dynamic";

const ZONE_URL =
  process.env.HILLTOPADS_VAST_URL ??
  "https://windy-imagination.com/dLm.FKzzdbG/NVv/Z/G/Ub/kedmm9auQZwUfl-k/PoTtcNzqN/zDk/zQMYTtcyt/Naz/Mi3rOVTIMsyoMDQe";

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
              <MediaFile delivery="progressive" type="video/mp4" bitrate="400" width="320" height="176" codec="h264"><![CDATA[https://www.w3schools.com/html/mov_bbb.mp4]]></MediaFile>
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

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.searchParams.has("mock")) {
    // never let a production deployment serve the sample inventory
    return xml(process.env.NODE_ENV === "production" ? EMPTY_VAST : mockVast(url.origin));
  }

  try {
    if (cache && Date.now() - cache.at < CACHE_MS) return xml(cache.body);
    const res = await fetch(ZONE_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
      headers: {
        // the zone 404s plain clients — present as a browser coming from us
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        accept: "*/*",
        referer: "https://reelivo.app/",
      },
    });
    const body = (await res.text()).trim();
    // 404 / HTML error page / anything non-VAST → normalized no-fill
    const out = res.ok && /<VAST[\s>]/i.test(body) ? body : EMPTY_VAST;
    cache = { at: Date.now(), body: out };
    return xml(out);
  } catch {
    // timeout / network failure → no fill; never make the ad block the stream
    return xml(EMPTY_VAST);
  }
}
