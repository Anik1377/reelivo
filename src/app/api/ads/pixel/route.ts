/* 1×1 transparent GIF beacon for the dev mock VAST (see /api/ads/vast).
 * Impression/tracking pixels resolve to a real 200 so the whole ad pipeline
 * is observable in the network log without calling any third party. */

export const dynamic = "force-dynamic";

const GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export function GET(): Response {
  const bytes = Uint8Array.from(atob(GIF_BASE64), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store",
    },
  });
}
