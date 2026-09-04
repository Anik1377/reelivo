import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Shared lists — Task 32 / wave 1-a.
 *
 * POST /api/lists/share
 *   body: { name: string, items: Array<{ id, type: "movie"|"tv", title, poster?,
 *           backdrop?, year?, rating?, folder? }> }
 *   → 201 { id }   (12-char nanoid-style id → #/list/<id>)
 *
 * GET /api/lists/share?id=<id>
 *   → 200 { name, items, createdAt } | 404 { error }
 *
 * Storage: Prisma SharedList row — `items` is a JSON-serialized SavedItem-lite
 * array so the stored payload mirrors exactly what the client saved.
 */

const MAX_NAME = 60;
const MAX_ITEMS = 100;
const ID_RE = /^[A-Za-z0-9]{6,24}$/;

/* Strip control chars + cap length — strings end up in JSON and later in the DOM. */
function cleanStr(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

 
function cleanItem(raw: unknown): { id: string; type: "movie" | "tv"; title: string; poster: string | null; backdrop: string | null; year: string; rating: number; folder: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const it = raw as any;

  const id = String(it.id ?? "").slice(0, 40).trim();
  if (!id || !/^\d+$|^[A-Za-z0-9_-]{1,40}$/.test(id)) return null;

  const title = cleanStr(it.title, 200) || "Untitled";
  const type: "movie" | "tv" = it.type === "tv" ? "tv" : "movie";

  // TMDB image paths start with "/" — anything else is not a path, drop it
  const path = (v: unknown): string | null =>
    typeof v === "string" && /^\/[\w.,-]{1,200}$/.test(v) ? v : null;

  let rating = 0;
  if (typeof it.rating === "number" && Number.isFinite(it.rating)) {
    rating = Math.min(10, Math.max(0, Math.round(it.rating * 10) / 10));
  }

  return {
    id,
    type,
    title,
    poster: path(it.poster),
    backdrop: path(it.backdrop),
    year: typeof it.year === "string" ? cleanStr(it.year, 10) : String(it.year ?? "").slice(0, 10),
    rating,
    folder: cleanStr(it.folder, 60),
  };
}
 

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const b = (body ?? {}) as { name?: unknown; items?: unknown };
  const name = cleanStr(b.name, MAX_NAME);
  if (!name) {
    return NextResponse.json(
      { error: "Give the list a name (1–60 characters)." },
      { status: 400 }
    );
  }
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `A shared list carries 1–${MAX_ITEMS} items.` },
      { status: 400 }
    );
  }

  const items = b.items.map(cleanItem);
  if (items.some((it) => it === null)) {
    return NextResponse.json(
      { error: "One or more items are malformed (missing/invalid id)." },
      { status: 400 }
    );
  }

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

  try {
    await db.sharedList.create({
      data: { id, name, items: JSON.stringify(items) },
    });
  } catch {
    // 12-char id collision (astronomically unlikely) → one honest retry path
    return NextResponse.json(
      { error: "Could not save the list — try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ id }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: "Bad list id." }, { status: 404 });
  }

  const row = await db.sharedList.findUnique({ where: { id } }).catch(() => null);
  if (!row) {
    return NextResponse.json({ error: "This list has drifted away — link may be wrong or expired." }, { status: 404 });
  }

  let items: unknown;
  try {
    items = JSON.parse(row.items);
  } catch {
    return NextResponse.json({ error: "Stored list data is corrupt." }, { status: 500 });
  }

  return NextResponse.json({ name: row.name, items, createdAt: row.createdAt });
}
