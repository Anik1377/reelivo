/* QA seed generator — builds the zustand-persist payload for the History DNA QA.
 * Fetches real TMDB art through the dev proxy so history rows render posters.
 * TEMP helper for Task 32 / wave 2-d QA — delete after use. */
const BASE = "http://localhost:3000/api/tmdb";
const NOW = Date.now();
const H = 3600_000;

interface Row {
  id: number;
  type: "movie" | "tv";
  title: string;
  year: string;
  pct: number;
  agoH: number;
  rating: number;
  season?: number;
  episode?: number;
}

const ROWS: Row[] = [
  { id: 272, type: "movie", title: "Inception", year: "2010", pct: 1.0, agoH: 2, rating: 8.4 },
  { id: 155, type: "movie", title: "The Dark Knight", year: "2008", pct: 1.0, agoH: 5, rating: 8.5 },
  { id: 1396, type: "tv", title: "Breaking Bad", year: "2008", pct: 1.0, agoH: 26, rating: 8.9, season: 1, episode: 1 },
  { id: 680, type: "movie", title: "Pulp Fiction", year: "1994", pct: 0.42, agoH: 30, rating: 8.4 },
  { id: 603, type: "movie", title: "The Matrix", year: "1999", pct: 0.8, agoH: 50, rating: 8.2 },
  { id: 1668, type: "tv", title: "Friends", year: "1994", pct: 1.0, agoH: 51, rating: 8.4, season: 1, episode: 1 },
  { id: 1124, type: "movie", title: "The Prestige", year: "2006", pct: 1.0, agoH: 74, rating: 8.2 },
  { id: 1891, type: "movie", title: "The Empire Strikes Back", year: "1980", pct: 0.25, agoH: 122, rating: 8.7 },
];

interface Detail {
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
}

const history: unknown[] = [];
for (const r of ROWS) {
  const res = await fetch(`${BASE}/${r.type}/${r.id}`);
  const d = (await res.json()) as Detail;
  const key =
    r.type === "tv"
      ? `${r.type}-${r.id}-s${r.season ?? 1}e${r.episode ?? 1}`
      : `${r.type}-${r.id}`;
  history.push({
    id: r.id,
    type: r.type,
    title: d.title ?? d.name ?? r.title,
    poster: d.poster_path ?? null,
    backdrop: d.backdrop_path ?? null,
    year: (d.release_date ?? d.first_air_date ?? r.year).slice(0, 4),
    rating: d.vote_average ?? r.rating,
    addedAt: NOW - r.agoH * H,
    key,
    ...(r.type === "tv" ? { season: r.season, episode: r.episode } : {}),
    pct: r.pct,
    watchedAt: NOW - r.agoH * H,
  });
  console.error(`fetched ${r.type}/${r.id} -> ${res.status}`);
}

const pid = "qa_dna_profile";
const payload = {
  state: {
    profiles: [{ id: pid, name: "QA DNA", avatar: 0, kids: false, createdAt: NOW }],
    activeProfileId: pid,
    data: {
      [pid]: {
        watchlist: [],
        recents: [],
        progress: {},
        lastEpisode: {},
        searchHistory: [],
        history,
        reminders: [],
      },
    },
    watchlist: [],
    recents: [],
    progress: {},
    lastEpisode: {},
    searchHistory: [],
    history,
    reminders: [],
    region: "US",
    serviceFocus: null,
  },
  version: 2,
};

await Bun.write("/home/z/my-project/.qa-tmp/reelivo-qa-dna.json", JSON.stringify(payload));
console.log("payload written:", history.length, "history rows");
