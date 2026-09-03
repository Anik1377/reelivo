/** Minimal TMDB v3 shapes — only fields Reelivo actually consumes. */

export type MediaType = "movie" | "tv";

export interface MediaItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  popularity?: number;
  adult?: boolean;
}

export interface Paged<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

/** /movie/upcoming — `dates` is the theatrical window TMDB is currently
 * serving (the rail/calendar labels it as "in the next month"). */
export interface UpcomingResults {
  dates: { maximum: string; minimum: string };
  results: MediaItem[];
}

export interface MovieDetail {
  id: number;
  title: string;
  tagline?: string | null;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string; // absent in the movie payload, kept optional so union code can read both
  runtime?: number | null;
  genres?: { id: number; name: string }[];
  original_language?: string;
  status?: string;
  budget?: number;
  revenue?: number;
  imdb_id?: string | null;
  production_companies?: { id: number; name: string; logo_path: string | null }[];
  belongs_to_collection?: CollectionRef | null;
}

export interface CollectionRef {
  id: number;
  name: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
}

export interface CollectionDetail extends CollectionRef {
  overview?: string | null;
  parts?: MediaItem[];
}

export interface TvDetail {
  id: number;
  name: string;
  tagline?: string | null;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  release_date?: string; // absent in the tv payload, kept optional so union code can read both
  first_air_date?: string;
  last_air_date?: string | null;
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  genres?: { id: number; name: string }[];
  original_language?: string;
  status?: string;
  imdb_id?: string | null;
  networks?: { id: number; name: string; logo_path: string | null }[];
  created_by?: { id: number; name: string }[];
  seasons?: TvSeasonSummary[];
  next_episode_to_air?: EpisodeAir | null;
  last_episode_to_air?: EpisodeAir | null;
}

/** Strict shape of the next/last episode blocks on the /tv/{id} payload —
 * what calendar/reminders and the "next ep" chip read. */
export interface EpisodeAir {
  id: number;
  air_date: string | null;
  season_number: number;
  episode_number: number;
  name: string;
  still_path: string | null;
  overview: string;
}

export interface TvSeasonSummary {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  air_date?: string | null;
  poster_path?: string | null;
  overview?: string | null;
}

export interface TvSeason {
  id: number;
  name: string;
  season_number: number;
  overview?: string | null;
  episodes?: TvEpisode[];
}

export interface TvEpisode {
  id: number;
  name: string;
  episode_number: number;
  season_number: number;
  overview?: string | null;
  still_path?: string | null;
  air_date?: string | null;
  runtime?: number | null;
  vote_average?: number;
}

export interface CastMember {
  id: number;
  name: string;
  character?: string;
  profile_path?: string | null;
  order?: number;
}

export interface Credits {
  cast?: CastMember[];
  crew?: { id: number; name: string; job: string; department?: string }[];
}

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
}

export interface WatchProviders {
  id: number;
  results?: Record<
    string,
    {
      link?: string;
      flatrate?: WatchProvider[];
      rent?: WatchProvider[];
      buy?: WatchProvider[];
      free?: WatchProvider[];
    }
  >;
}

export interface Genre {
  id: number;
  name: string;
}

export interface ProviderEntry {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
  display_priority?: number;
}

export interface ProvidersList {
  results?: ProviderEntry[];
}

export interface SearchResult extends MediaItem {
  media_type: string;
  profile_path?: string | null;
  known_for_department?: string;
  known_for?: MediaItem[];
}

export interface VideoResult {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official?: boolean;
  published_at?: string;
}

export interface Videos {
  id: number;
  results?: VideoResult[];
}

export interface PersonDetail {
  id: number;
  name: string;
  biography?: string | null;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  known_for_department?: string;
  profile_path?: string | null;
  homepage?: string | null;
  also_known_as?: string[];
}

export interface PersonCredit {
  id: number;
  media_type?: "movie" | "tv";
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  character?: string;
  job?: string;
  department?: string;
  episode_count?: number;
}

export interface CombinedCredits {
  id: number;
  cast?: PersonCredit[];
  crew?: PersonCredit[];
}

export interface ReleaseDates {
  id: number;
  results?: { iso_3166_1: string; release_dates: { certification: string }[] }[];
}

export interface ContentRatings {
  id: number;
  results?: { iso_3166_1: string; rating: string }[];
}

export interface ReviewResult {
  id: string;
  author: string;
  content: string;
  created_at?: string;
  url?: string;
  author_details?: {
    name?: string;
    username?: string;
    avatar_path?: string | null;
    rating?: number | null;
  };
}

export interface Reviews {
  id: number;
  page: number;
  results?: ReviewResult[];
  total_pages?: number;
  total_results?: number;
}

/** Minimal review shape for surfaces that only render text (shared lists,
 * assistant digests); the detail page keeps the richer ReviewResult/Reviews
 * pair with author_details. */
export interface ReviewItem {
  id: string;
  author: string;
  content: string;
  created_at: string;
}

export interface ReviewsResults {
  results: ReviewItem[];
}

export interface TrendingPerson {
  id: number;
  name: string;
  profile_path?: string | null;
  known_for_department?: string;
  known_for?: MediaItem[];
}

export interface TrendingPersons {
  page: number;
  results?: TrendingPerson[];
  total_pages?: number;
  total_results?: number;
}

/** Payload behind #/shared/{id} — a snapshot of a watchlist shared between
 * devices. SharedListItem mirrors SavedItem's display fields (no addedAt, no
 * folders): a share is a moment-in-time copy, not a live list. */
export interface SharedListItem {
  id: number;
  type: MediaType;
  title: string;
  poster: string | null;
  backdrop: string | null;
  year: string;
  rating: number;
}

export interface SharedListPayload {
  id: string;
  name: string;
  items: SharedListItem[];
  /** ISO timestamp of when the list was shared. */
  createdAt: string;
}
