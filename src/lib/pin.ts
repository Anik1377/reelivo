/**
 * Profile-lock PIN hashing.
 *
 * The lock is a gentle, local-only gate (like a "keep little fingers out"
 * switch), not security: the hash lives in the same localStorage as every
 * other profile datum. SHA-256 via Web Crypto is preferred; a small FNV-1a
 * fallback keeps file:// and plain-http contexts working, where crypto.subtle
 * is unavailable.
 */
export async function pinHash(pin: string, profileId: string): Promise<string> {
  const msg = `reelivo:${profileId}:${pin}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  /* two interleaved FNV-1a lanes so position matters even at 32 bits */
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < msg.length; i++) {
    a = ((a ^ msg.charCodeAt(i)) * 16777619) >>> 0;
    b = ((b ^ msg.charCodeAt(msg.length - 1 - i)) * 16777619) >>> 0;
  }
  return `fnv1a-${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

export const isFourDigits = (s: string) => /^\d{4}$/.test(s);
