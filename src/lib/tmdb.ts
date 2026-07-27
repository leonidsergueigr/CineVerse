import { fallbackCatalog, fallbackDetails } from "@/lib/fallback-data";
import type {
  CatalogFilters,
  CatalogItem,
  HomeCatalog,
  MediaDetails,
  MediaType,
} from "@/lib/types";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

type TmdbResult = {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
  genres?: Array<{ id: number; name: string }>;
  original_language?: string;
};

type TmdbList = {
  results?: TmdbResult[];
};

type TmdbDetails = TmdbResult & {
  runtime?: number;
  episode_run_time?: number[];
  genres?: Array<{ id: number; name: string }>;
  seasons?: Array<{
    id: number;
    name: string;
    season_number: number;
    episode_count: number;
  }>;
};

export async function getHomeCatalog(filters: CatalogFilters): Promise<HomeCatalog> {
  const hasActiveFilters = Boolean(
    filters.query ||
      filters.mediaType ||
      filters.genre ||
      filters.yearFrom ||
      filters.yearTo ||
      filters.minRating ||
      filters.language,
  );

  const [trendingMovies, trendingTv, mood, filtered] = await Promise.all([
    getTrending("movie"),
    getTrending("tv"),
    discover({
      mediaType: "movie",
      genre: "878",
      minRating: "7",
    }),
    hasActiveFilters ? discover(filters) : Promise.resolve([]),
  ]);

  const sections = [
    ...(filtered.length
      ? [{ id: "filtered", title: "Selection affinee", items: filtered }]
      : []),
    { id: "movies", title: "Films tendance", items: trendingMovies },
    { id: "series", title: "Series a devorer", items: trendingTv },
    { id: "mood", title: "Soiree science-fiction", items: mood },
  ];

  return {
    hero: filtered[0] ?? trendingMovies[0] ?? fallbackCatalog()[0],
    sections,
    filters,
  };
}

export async function getTrending(mediaType: MediaType) {
  const data = await tmdb<TmdbList>(`/trending/${mediaType}/week`, {});
  return normalizeList(data?.results, mediaType);
}

export async function discover(filters: CatalogFilters) {
  if (filters.query) {
    return search(filters.query, filters.mediaType);
  }

  const mediaType = filters.mediaType === "tv" ? "tv" : "movie";
  const params: Record<string, string> = {
    sort_by: "popularity.desc",
    include_adult: "false",
  };

  if (filters.genre) params.with_genres = filters.genre;
  if (filters.minRating) params["vote_average.gte"] = filters.minRating;
  if (filters.language) params.with_original_language = filters.language;

  if (mediaType === "movie") {
    if (filters.yearFrom) params["primary_release_date.gte"] = `${filters.yearFrom}-01-01`;
    if (filters.yearTo) params["primary_release_date.lte"] = `${filters.yearTo}-12-31`;
  } else {
    if (filters.yearFrom) params["first_air_date.gte"] = `${filters.yearFrom}-01-01`;
    if (filters.yearTo) params["first_air_date.lte"] = `${filters.yearTo}-12-31`;
  }

  const data = await tmdb<TmdbList>(`/discover/${mediaType}`, params);
  return normalizeList(data?.results, mediaType);
}

export async function search(query: string, mediaType?: string) {
  const type = mediaType === "movie" || mediaType === "tv" ? mediaType : "multi";
  const data = await tmdb<TmdbList>(`/search/${type}`, {
    query,
    include_adult: "false",
  });

  return normalizeList(data?.results, type === "multi" ? undefined : type);
}

export async function getDetails(mediaType: MediaType, id: number): Promise<MediaDetails> {
  const data = await tmdb<TmdbDetails>(`/${mediaType}/${id}`, {});
  if (!data) return fallbackDetails(mediaType, id);

  const item = normalizeItem(data, mediaType);
  if (!item) return fallbackDetails(mediaType, id);

  return {
    ...item,
    runtime: data.runtime ?? data.episode_run_time?.[0] ?? null,
    genres: data.genres ?? [],
    seasons: data.seasons?.map((season) => ({
      id: season.id,
      name: season.name,
      seasonNumber: season.season_number,
      episodeCount: season.episode_count,
    })),
  };
}

export async function getRecommendations(mediaType: MediaType, id: number) {
  const data = await tmdb<TmdbList>(`/${mediaType}/${id}/recommendations`, {});
  const recommendations = normalizeList(data?.results, mediaType);
  return recommendations.length ? recommendations : fallbackCatalog();
}

export function posterUrl(path: string | null, size = "w342") {
  return path ? `${IMAGE_BASE_URL}/${size}${path}` : null;
}

export function backdropUrl(path: string | null, size = "w1280") {
  return path ? `${IMAGE_BASE_URL}/${size}${path}` : null;
}

async function tmdb<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const accessToken = process.env.TMDB_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;
  if (!accessToken && !apiKey) return null;

  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("language", "fr-FR");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  if (!accessToken && apiKey) url.searchParams.set("api_key", apiKey);

  try {
    const response = await fetch(url, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      next: { revalidate: 60 * 30 },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function normalizeList(results: TmdbResult[] | undefined, forcedType?: MediaType) {
  const normalized = (results ?? [])
    .map((result) => normalizeItem(result, forcedType))
    .filter((item): item is CatalogItem => Boolean(item));

  return normalized.length ? normalized : fallbackCatalog();
}

function normalizeItem(result: TmdbResult, forcedType?: MediaType): CatalogItem | null {
  const mediaType = forcedType ?? result.media_type;
  if (mediaType !== "movie" && mediaType !== "tv") return null;

  return {
    id: result.id,
    mediaType,
    title: mediaType === "movie" ? result.title ?? "Film sans titre" : result.name ?? "Serie sans titre",
    overview: result.overview ?? "",
    posterPath: result.poster_path ?? null,
    backdropPath: result.backdrop_path ?? null,
    posterUrl: posterUrl(result.poster_path ?? null),
    backdropUrl: backdropUrl(result.backdrop_path ?? null),
    releaseDate:
      mediaType === "movie" ? result.release_date ?? null : result.first_air_date ?? null,
    voteAverage: Number((result.vote_average ?? 0).toFixed(1)),
    genreIds: result.genre_ids ?? result.genres?.map((genre) => genre.id) ?? [],
    originalLanguage: result.original_language ?? "na",
  };
}
