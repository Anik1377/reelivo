/* Editorial curation for the home walls — franchises and director spotlights.
 * IDs are plain TMDB references (verified live); all data still streams from
 * the /api/tmdb proxy at runtime, so names, counts and art stay truthful. */

export interface FranchiseRef {
  /** TMDB collection id. */
  id: number;
  /** One-line editorial hook — why this boxset earns a slot. */
  note: string;
}

export const FRANCHISES: FranchiseRef[] = [
  { id: 263, note: "Gotham, grounded" },
  { id: 86311, note: "Earth's mightiest boxset" },
  { id: 119, note: "One ring, three sittings" },
  { id: 10, note: "A galaxy, nine films deep" },
  { id: 1241, note: "Eight years at Hogwarts" },
  { id: 328, note: "Life finds a way — thrice" },
  { id: 84, note: "Fedora archaeology, remastered" },
  { id: 264, note: "1.21 gigawatts of nostalgia" },
];

export interface DirectorRef {
  /** TMDB person id. */
  id: number;
  /** Editorial kicker for the card. */
  note: string;
}

export const DIRECTORS: DirectorRef[] = [
  { id: 525, note: "Practical scale, formulas of grief" },
  { id: 137427, note: "Slow awe, hard science" },
  { id: 138, note: "Dialogue as a sharp instrument" },
  { id: 608, note: "Hand-drawn wonder" },
  { id: 1032, note: "Guilt, streets and neon" },
  { id: 21684, note: "Genre-flipping social thrillers" },
  { id: 5655, note: "Symmetrical whimsy" },
  { id: 10828, note: "Monsters with a heartbeat" },
];

export const DIRECTOR_FLOOR = 300; // min votes before a title counts as "best"
