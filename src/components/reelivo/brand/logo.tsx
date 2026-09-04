/* Reelivo brand system — the single source of truth for the logo.
 *
 * THE LOGO IS ONLY THE NAME: "reelivo" in Manrope 800 with the full stop in
 * the brand cyan. No icons, no tiles, no shapes — the wordmark is the brand.
 * (Direction from the user: "our logo is only reelivo, with the dot being
 * the brand color".)
 *
 * Inline text so it stays crisp at any size, inherits layout via className,
 * and costs zero network requests.
 */
export function ReelivoWordmark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Reelivo"
      className={`display inline-flex items-baseline font-extrabold tracking-tight ${className ?? ""}`}
    >
      <span aria-hidden="true" className="leading-none">
        reelivo
      </span>
      {/* the full stop — always in the brand cyan */}
      <span aria-hidden="true" className="leading-none text-primary">
        .
      </span>
    </span>
  );
}
