import { NextRequest, NextResponse } from "next/server";

import { clientIp, rateLimit } from "@/lib/ai-server";

export const runtime = "nodejs";

/**
 * POST /api/asr — speech-to-text for voice search (Task 32 / wave 1-a).
 * Body: { file_base64: string } — plain base64 or a data: URI from MediaRecorder audio.
 * → 200 { text } | honest 4xx/502 { error }.
 *
 * Validation: JSON body, base64 shape, decoded size > 0, body < 12 MB base64.
 * SDK failures surface as 502 — never swallowed silently.
 */

const MAX_BODY_CHARS = 12 * 1024 * 1024; // ~12MB of base64 text
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 1000;

export async function POST(req: NextRequest) {
  if (!rateLimit(`asr:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json(
      { error: "Too many voice searches in a minute — try again shortly." },
      { status: 429, headers: { "Retry-After": "30" } }
    );
  }

  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return NextResponse.json({ error: "Could not read the request body." }, { status: 400 });
  }

  if (bodyText.length === 0) {
    return NextResponse.json({ error: "Empty body — expected { file_base64 }." }, { status: 400 });
  }
  if (bodyText.length > MAX_BODY_CHARS) {
    return NextResponse.json(
      { error: "Audio too large — keep clips under a few seconds to a minute." },
      { status: 413 }
    );
  }

  let parsed: { file_base64?: unknown };
  try {
    parsed = JSON.parse(bodyText) as { file_base64?: unknown };
  } catch {
    return NextResponse.json({ error: "Body must be JSON: { file_base64 }." }, { status: 400 });
  }

  let b64 = typeof parsed.file_base64 === "string" ? parsed.file_base64.trim() : "";
  if (!b64) {
    return NextResponse.json(
      { error: "Missing file_base64 — record some audio first." },
      { status: 400 }
    );
  }

  // tolerate data URIs from MediaRecorder clients
  const dataUri = /^data:[^;,]+;base64,/.exec(b64);
  if (dataUri) b64 = b64.slice(dataUri[0].length);

  // strip whitespace/newlines some encoders insert
  b64 = b64.replace(/\s+/g, "");

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    return NextResponse.json(
      { error: "file_base64 is not valid base64." },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(b64, "base64");
  if (bytes.length === 0) {
    return NextResponse.json(
      { error: "Decoded audio is empty — check the recorder." },
      { status: 400 }
    );
  }

  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const result = await zai.audio.asr.create({ file_base64: b64 });
    const text =
      result && typeof result === "object" && typeof (result as { text?: unknown }).text === "string"
        ? (result as { text: string }).text
        : "";
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json(
      { error: "Speech recognition failed — try again or type the search instead." },
      { status: 502 }
    );
  }
}
