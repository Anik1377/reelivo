import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

/**
 * Branded share-card generator (1200×630).
 * GET /api/og                          → generic Reelivo card
 * GET /api/og?title=&kind=&sub=&score=&img=&free=1 → per-title card
 * `img` is a TMDB image path ("/abc.jpg") fetched server-side and embedded.
 */

export const runtime = "nodejs";

const ACCENT = "#00a8e1";
const W = 1200;
const H = 630;

/* ★ is missing from the generated OG font — ship our own star as an SVG data URI. */
const STAR_SRC = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${ACCENT}"><path d="M12 2.5l2.95 6.31 6.92.83-5.11 4.75 1.35 6.86L12 17.77l-6.11 3.48 1.35-6.86-5.11-4.75 6.92-.83z"/></svg>`
).toString("base64")}`;

/* The Reelivo play-tile mark (same artwork as components/reelivo/brand/logo.tsx)
 * so share cards carry the real logo instead of a text-only wordmark. */
const MARK_SRC = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2ec7f5"/><stop offset="1" stop-color="#0071a4"/></linearGradient></defs><rect x="1" y="1" width="62" height="62" rx="16" fill="url(#g)"/><rect x="1.75" y="1.75" width="60.5" height="60.5" rx="15.25" fill="none" stroke="rgba(255,255,255,0.30)" stroke-width="1.5"/><rect x="11.5" y="15" width="4.5" height="7" rx="2" fill="rgba(0,20,30,0.42)"/><rect x="11.5" y="28.5" width="4.5" height="7" rx="2" fill="rgba(0,20,30,0.42)"/><rect x="11.5" y="42" width="4.5" height="7" rx="2" fill="rgba(0,20,30,0.42)"/><path d="M27.5 21.5 L45 32 L27.5 42.5 Z" fill="#ffffff" stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round"/></svg>`
).toString("base64")}`;

function esc(s: string): string {
  // satori renders text as-is; this just guards against absurd lengths
  return s.length > 90 ? `${s.slice(0, 87)}…` : s;
}

async function tmdbImage(path: string): Promise<string | null> {
  try {
    const res = await fetch(`https://image.tmdb.org/t/p/w1280${path}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    return `data:image/jpeg;base64,${b64}`;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const title = sp.get("title")?.slice(0, 120) ?? "";
  const kind = (sp.get("kind") ?? "").toUpperCase().slice(0, 10);
  const sub = sp.get("sub")?.slice(0, 90) ?? "";
  const score = sp.get("score")?.slice(0, 4) ?? "";
  const free = sp.get("free") === "1";
  const imgPath = sp.get("img");
  const hasArt = !!imgPath && /^\/[\w./-]+\.(jpg|jpeg|png|webp)$/i.test(imgPath);

  const art = hasArt ? await tmdbImage(imgPath as string) : null;

  /* ---------------------------- generic brand card --------------------------- */
  if (!title) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: "#000",
            padding: 72,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img src={MARK_SRC} alt="" width={30} height={30} />
            <div style={{ fontSize: 26, letterSpacing: 6, color: "rgba(255,255,255,0.55)" }}>
              WHAT TO WATCH TONIGHT
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 30, fontSize: 132, color: "#fff" }}>
              <img src={MARK_SRC} alt="" width={106} height={106} />
              <span>reelivo</span>
            </div>
            <div style={{ fontSize: 30, color: "rgba(255,255,255,0.62)", display: "flex", gap: 22 }}>
              <span>Films &amp; series</span>
              <span style={{ color: ACCENT }}>·</span>
              <span>Where to watch</span>
              <span style={{ color: ACCENT }}>·</span>
              <span>Free streams</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  border: "2px solid rgba(255,255,255,0.22)",
                  borderRadius: 999,
                  padding: "10px 22px",
                  fontSize: 24,
                  color: "#fff",
                }}
              >
                <span style={{ color: ACCENT }}>▶</span> Press play — no account needed
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: ACCENT,
                  borderRadius: 999,
                  padding: "10px 22px",
                  fontSize: 24,
                  color: "#001018",
                }}
              >
                Free · ad-supported
              </div>
            </div>
            <div
              style={{
                width: 320,
                height: 6,
                borderRadius: 999,
                background: `linear-gradient(90deg, ${ACCENT}, rgba(0,168,225,0.15))`,
                display: "flex",
              }}
            />
          </div>
        </div>
      ),
      { width: W, height: H, headers: { "Cache-Control": "public, max-age=3600" } }
    );
  }

  /* ------------------------------ per-title card ----------------------------- */
  const metaBits = [sub, sp.get("genres")?.slice(0, 60) ?? ""].filter(Boolean);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#000",
          position: "relative",
        }}
      >
        {art && (
          <img
            src={art}
            alt=""
            width={W}
            height={H}
            style={{ position: "absolute", inset: 0, objectFit: "cover" }}
          />
        )}
        {/* scrims: art fades to black on the left + bottom so type always wins */}
        {art && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              background:
                "linear-gradient(90deg, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.82) 34%, rgba(0,0,0,0.18) 72%, rgba(0,0,0,0.35) 100%)",
            }}
          />
        )}
        {art && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              background: "linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 42%)",
            }}
          />
        )}

        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 56,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 34, color: "#fff" }}>
              <img src={MARK_SRC} alt="" width={38} height={38} />
              <span>reelivo</span>
            </div>
            {free && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: ACCENT,
                  color: "#001018",
                  fontSize: 22,
                  letterSpacing: 2,
                  padding: "8px 18px",
                  borderRadius: 999,
                }}
              >
                FREE
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 950 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {kind && (
                <span style={{ fontSize: 22, letterSpacing: 6, color: ACCENT }}>{kind}</span>
              )}
              {score && (
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 24 }}>
                  <img src={STAR_SRC} alt="" width={20} height={20} />
                  <span style={{ color: "#fff" }}>{score}</span>
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: title.length > 26 ? 58 : 72,
                lineHeight: 1.08,
                color: "#fff",
                lineClamp: 2,
              }}
            >
              {esc(title)}
            </div>
            {metaBits.length > 0 && (
              <div style={{ display: "flex", gap: 14, fontSize: 25, color: "rgba(255,255,255,0.66)" }}>
                {metaBits.map((b, i) => (
                  <span key={i} style={{ display: "flex", gap: 14 }}>
                    {i > 0 && <span style={{ color: ACCENT }}>·</span>}
                    <span>{b}</span>
                  </span>
                ))}
              </div>
            )}
            <div
              style={{
                width: 260,
                height: 6,
                borderRadius: 999,
                background: `linear-gradient(90deg, ${ACCENT}, rgba(0,168,225,0.12))`,
                display: "flex",
                marginTop: 6,
              }}
            />
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "Cache-Control": "public, max-age=86400" } }
  );
}
