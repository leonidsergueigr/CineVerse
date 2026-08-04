import { fallbackCatalog, fallbackDetails } from "@/lib/fallback-data";
import { load } from "cheerio";
import dns from "node:dns";
import Fuse from "fuse.js";
import { genreIdsForMediaType } from "@/lib/catalog-filters";
import {
  isRecentlyAired,
  parseEpisodeProgress,
  recentDateCutoff,
} from "@/lib/catalog-freshness";
import {
  fetchFstreamCatalogPage,
  rememberFstreamCatalogMatch,
} from "@/lib/fstream";
import { getCachedApiResponse, setCachedApiResponse } from "@/lib/store";
import type {
  BrowseCatalog,
  CatalogFilters,
  CatalogItem,
  EpisodeInfo,
  HomeCatalog,
  MediaDetails,
  MediaType,
  SeasonEpisode,
  SearchSuggestion,
} from "@/lib/types";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p";
const tmdbRequests = new Map<string, Promise<unknown | null>>();
let fuzzySearchPool: Promise<CatalogItem[]> | null = null;

dns.setDefaultResultOrder("ipv4first");

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
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
  genres?: Array<{ id: number; name: string }>;
  original_language?: string;
  profile_path?: string | null;
  known_for_department?: string;
};

type TmdbList = {
  page?: number;
  results?: TmdbResult[];
  total_pages?: number;
  total_results?: number;
};

type TmdbCredit = TmdbResult & {
  job?: string;
  department?: string;
};

type TmdbPersonCredits = {
  cast?: TmdbCredit[];
  crew?: TmdbCredit[];
};

type TmdbVideo = {
  key: string;
  site: string;
  type: string;
  official?: boolean;
  name?: string;
};

type TmdbVideos = {
  results?: TmdbVideo[];
};

type TmdbDetails = TmdbResult & {
  runtime?: number;
  episode_run_time?: number[];
  genres?: Array<{ id: number; name: string }>;
  created_by?: Array<{
    id: number;
    name: string;
  }>;
  credits?: {
    cast?: Array<{
      id: number;
      name: string;
      character?: string;
      profile_path?: string | null;
    }>;
    crew?: Array<{
      id: number;
      name: string;
      job?: string;
    }>;
  };
  seasons?: Array<{
    id: number;
    name: string;
    season_number: number;
    episode_count: number;
  }>;
  last_episode_to_air?: {
    air_date?: string | null;
    episode_number?: number;
    season_number?: number;
  } | null;
};

type TmdbEpisodeDetails = {
  name?: string;
  runtime?: number | null;
};

type TmdbSeasonDetails = {
  episodes?: Array<{
    episode_number?: number;
    name?: string;
    overview?: string;
    runtime?: number | null;
    still_path?: string | null;
    air_date?: string | null;
  }>;
};

type SourceCatalogItem = {
  title: string;
  overview: string;
  posterPath: string | null;
  newsId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  totalEpisodes: number | null;
};

export async function getHomeCatalog(): Promise<HomeCatalog> {
  const [newMovies, newTv, trendingMovies, trendingTv, anime, mood] =
    await Promise.all([
    getNewCatalogWithMeta("movie", "1").then((catalog) => catalog.items),
    getNewCatalogWithMeta("tv", "1").then((catalog) => catalog.items),
    getTrending("movie"),
    getTrending("tv"),
    discover({
      catalog: "anime",
      mediaType: "tv",
      sort: "popular",
    }),
    discover(
      {
        mediaType: "movie",
        genre: "878",
        minRating: "7",
      },
      true,
    ),
    ]);

  const sections = [
    { id: "new-movies", title: "Nouveautes Films", items: newMovies },
    { id: "new-series", title: "Nouveautes Series", items: newTv },
    { id: "movies", title: "Films tendance", items: trendingMovies },
    {
      id: "series",
      title: "Series a devorer",
      items: trendingTv.filter((item) => !isAnimeItem(item)),
    },
    { id: "anime", title: "Animes du moment", items: anime },
    { id: "mood", title: "Soiree science-fiction", items: mood },
  ];
  const heroCandidates = uniqueCatalogItems([
    ...newMovies,
    ...trendingMovies,
    ...newTv,
    ...trendingTv,
  ]).filter((item) => Boolean(item.backdropUrl) && item.voteCount > 0);
  const rotationSlot = Math.floor(Date.now() / (15 * 60 * 1000));
  const hero =
    heroCandidates[rotationSlot % Math.max(1, heroCandidates.length)] ??
    trendingMovies[0] ??
    fallbackCatalog()[0];
  const heroTrailerUrl = await getTrailerUrl(hero.mediaType, hero.id);

  return {
    hero,
    heroCandidates,
    heroTrailerUrl,
    sections,
  };
}

export async function getBrowseCatalog(filters: CatalogFilters): Promise<BrowseCatalog> {
  const result =
    filters.catalog === "new" && !filters.query
      ? await getNewCatalogWithMeta(
          filters.mediaType === "tv" ? "tv" : "movie",
          filters.page,
        )
      : filters.query
        ? await searchWithMeta(filters.query, filters.mediaType, filters.page)
        : await discoverWithMeta(filters);

  return {
    ...result,
    filters,
  };
}

export async function getCatalogItemsByIds(
  requests: Array<{ id: number; mediaType: MediaType }>,
) {
  return Promise.all(
    requests.map(async ({ id, mediaType }) => {
      const data = await tmdb<TmdbResult>(`/${mediaType}/${id}`, {});
      return data ? normalizeItem(data, mediaType) : null;
    }),
  );
}

export async function getTrending(mediaType: MediaType) {
  const data = await tmdb<TmdbList>(`/trending/${mediaType}/week`, {});
  return normalizeList(data?.results, mediaType);
}

export async function discover(filters: CatalogFilters, withFallback = false) {
  const result = await discoverWithMeta(filters, withFallback);
  return result.items;
}

export async function discoverWithMeta(filters: CatalogFilters, withFallback = false) {
  if (filters.query) {
    return searchWithMeta(filters.query, filters.mediaType, filters.page, withFallback);
  }

  const isAnime = filters.catalog === "anime";
  const isNew = filters.catalog === "new";
  const mediaType = isAnime || filters.mediaType === "tv" ? "tv" : "movie";
  if (filters.person) {
    return getPersonCreditsWithMeta(filters, mediaType);
  }

  const params: Record<string, string> = {
    sort_by: tmdbSort(filters.sort, mediaType),
    include_adult: "false",
    page: normalizedPage(filters.page),
  };

  const genres = genreIdsForMediaType(filters.genre, mediaType);
  if (isAnime) {
    params.with_genres = ["16", ...genres.filter((genre) => genre !== "16")].join(",");
    params.with_original_language = "ja";
  } else {
    if (genres.length) params.with_genres = genres.join(",");
    if (mediaType === "tv" && !genres.length) params.without_genres = "16";
    if (mediaType === "tv" && genres.includes("16")) {
      params.without_keywords = "210024";
    }
  }
  if (filters.minRating) params["vote_average.gte"] = filters.minRating;
  if (filters.originalLanguage && !isAnime) {
    params.with_original_language = filters.originalLanguage;
  }
  if (filters.sort === "rating") params["vote_count.gte"] = "80";

  if (mediaType === "movie") {
    if (isNew) {
      params["primary_release_date.gte"] = oneYearAgo();
      params["primary_release_date.lte"] = today();
      params["vote_count.gte"] = "2";
    } else {
      if (filters.yearFrom) params["primary_release_date.gte"] = `${filters.yearFrom}-01-01`;
      if (filters.yearTo) params["primary_release_date.lte"] = `${filters.yearTo}-12-31`;
    }
  } else {
    if (isNew) {
      params["first_air_date.gte"] = oneYearAgo();
      params["first_air_date.lte"] = today();
      params["vote_count.gte"] = "2";
    } else {
      if (filters.yearFrom) params["first_air_date.gte"] = `${filters.yearFrom}-01-01`;
      if (filters.yearTo) params["first_air_date.lte"] = `${filters.yearTo}-12-31`;
    }
  }

  let data = await tmdb<TmdbList>(`/discover/${mediaType}`, params);
  const requestedPage = Number(params.page);
  const availablePages = Math.max(1, Math.min(data?.total_pages ?? 1, 500));
  if (data && requestedPage > availablePages) {
    params.page = String(availablePages);
    data = await tmdb<TmdbList>(`/discover/${mediaType}`, params);
  }
  return normalizeMeta(data, mediaType, withFallback);
}

export async function search(query: string, mediaType?: string, withFallback = false) {
  const result = await searchWithMeta(query, mediaType, undefined, withFallback);
  return result.items;
}

export async function searchWithMeta(
  query: string,
  mediaType?: string,
  page?: string,
  withFallback = false,
) {
  const type = mediaType === "movie" || mediaType === "tv" ? mediaType : "multi";
  const data = await tmdb<TmdbList>(`/search/${type}`, {
    query,
    include_adult: "false",
    page: normalizedPage(page),
  });

  const result = normalizeMeta(
    data,
    type === "multi" ? undefined : type,
    withFallback,
  );
  if (Number(normalizedPage(page)) > 1 || query.trim().length < 2) {
    return result;
  }

  const fuzzyMatches = await getFuzzyCatalogMatches(
    query,
    type === "multi" ? undefined : type,
    20,
  );
  const rankedItems = rankCatalogSearchResults(
    uniqueCatalogItems([...result.items, ...fuzzyMatches]),
    query,
  );
  const hasExactTitle = rankedItems.some(
    (item) =>
      normalizeSearchText(item.title) === normalizeSearchText(query),
  );
  const items = hasExactTitle
    ? rankedItems
        .filter((item) => titleSearchRelevance(item.title, query) > 0)
        .slice(0, 10)
    : rankedItems.slice(0, 20);

  return {
    ...result,
    items,
    totalPages: hasExactTitle ? 1 : result.totalPages,
    totalResults: hasExactTitle
      ? items.length
      : Math.max(result.totalResults, items.length),
  };
}

export async function getSearchSuggestions(
  query: string,
  limit = 8,
): Promise<SearchSuggestion[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];

  const data = await tmdb<TmdbList>("/search/multi", {
    query: normalizedQuery,
    include_adult: "false",
    page: "1",
  });
  const direct = (data?.results ?? []).flatMap((result) => {
    if (result.media_type === "movie" || result.media_type === "tv") {
      const item = normalizeItem(result);
      return item ? [catalogSuggestion(item)] : [];
    }
    if (result.media_type !== "person" || !result.name) return [];

    const params = new URLSearchParams({
      type: "movie",
      person: String(result.id),
      personName: result.name,
      personRole:
        result.known_for_department === "Directing" ? "crew" : "cast",
    });
    if (result.known_for_department === "Directing") {
      params.set("personJob", "Director");
    }
    return [
      {
        id: result.id,
        kind: "person" as const,
        title: result.name,
        subtitle:
          result.known_for_department === "Directing"
            ? "Realisation"
            : "Casting",
        imageUrl: posterUrl(result.profile_path ?? null, "w185"),
        href: `/browse?${params.toString()}`,
      },
    ];
  });
  const fuzzy = await getFuzzyCatalogMatches(normalizedQuery, undefined, limit);
  const suggestions = [
    ...direct,
    ...fuzzy.map(catalogSuggestion),
  ];
  const seen = new Set<string>();
  const uniqueSuggestions = suggestions
    .filter((suggestion) => {
      const key = `${suggestion.kind}:${suggestion.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const titleSuggestions = uniqueSuggestions
    .filter((suggestion) => suggestion.kind !== "person")
    .sort(
      (left, right) =>
        titleSearchRelevance(right.title, normalizedQuery) -
        titleSearchRelevance(left.title, normalizedQuery),
    );
  const peopleSuggestions = uniqueSuggestions
    .filter((suggestion) => suggestion.kind === "person")
    .sort(
      (left, right) =>
        titleSearchRelevance(right.title, normalizedQuery) -
        titleSearchRelevance(left.title, normalizedQuery),
    );
  const peopleLimit = peopleSuggestions.length ? Math.min(2, limit) : 0;

  return [
    ...titleSuggestions.slice(0, limit - peopleLimit),
    ...peopleSuggestions.slice(0, peopleLimit),
  ];
}

async function getFuzzyCatalogMatches(
  query: string,
  mediaType: MediaType | undefined,
  limit: number,
) {
  const pool = (await getFuzzySearchPool()).filter(
    (item) => !mediaType || item.mediaType === mediaType,
  );
  if (!pool.length) return [];

  const fuse = new Fuse(pool, {
    keys: [{ name: "title", weight: 1 }],
    threshold: 0.38,
    distance: 120,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
  return fuse.search(query, { limit }).map((result) => result.item);
}

function rankCatalogSearchResults(items: CatalogItem[], query: string) {
  return items
    .map((item, index) => ({
      item,
      index,
      relevance: titleSearchRelevance(item.title, query),
    }))
    .sort(
      (left, right) =>
        right.relevance - left.relevance ||
        right.item.popularity - left.item.popularity ||
        left.index - right.index,
    )
    .map(({ item }) => item);
}

function titleSearchRelevance(title: string, query: string) {
  const normalizedTitle = normalizeSearchText(title);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedTitle || !normalizedQuery) return 0;
  if (normalizedTitle === normalizedQuery) return 10_000;
  if (normalizedTitle.startsWith(`${normalizedQuery} `)) return 4_000;
  if (normalizedTitle.includes(normalizedQuery)) return 2_500;

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const titleTokens = new Set(normalizedTitle.split(" ").filter(Boolean));
  const matchingTokens = queryTokens.filter((token) => titleTokens.has(token));
  if (!matchingTokens.length) return 0;

  return Math.round((matchingTokens.length / queryTokens.length) * 1_000);
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function getFuzzySearchPool() {
  if (fuzzySearchPool) return fuzzySearchPool;

  fuzzySearchPool = Promise.all(
    (["movie", "tv"] as const).flatMap((mediaType) =>
      ["popularity.desc", "vote_count.desc"].flatMap((sortBy) =>
        [1, 2, 3].map(async (page) => {
          const data = await tmdb<TmdbList>(`/discover/${mediaType}`, {
            sort_by: sortBy,
            include_adult: "false",
            page: String(page),
          });
          return normalizeList(data?.results, mediaType, false);
        }),
      ),
    ),
  ).then((groups) => uniqueCatalogItems(groups.flat()));

  return fuzzySearchPool;
}

function catalogSuggestion(item: CatalogItem): SearchSuggestion {
  const year = item.releaseDate?.slice(0, 4);
  return {
    id: item.id,
    kind: item.mediaType,
    title: item.title,
    subtitle: `${item.mediaType === "movie" ? "Film" : "Serie"}${
      year ? ` · ${year}` : ""
    }`,
    imageUrl: item.posterUrl,
    href: `/watch/${item.mediaType}/${item.id}`,
  };
}

export async function getDetails(mediaType: MediaType, id: number): Promise<MediaDetails> {
  const data = await tmdb<TmdbDetails>(`/${mediaType}/${id}`, {
    append_to_response: "credits",
  }, { noStore: true });
  if (!data) return fallbackDetails(mediaType, id);

  const item = normalizeItem(data, mediaType);
  if (!item) return fallbackDetails(mediaType, id);

  return {
    ...item,
    metadataSource: "tmdb",
    runtime: data.runtime ?? data.episode_run_time?.[0] ?? null,
    genres: data.genres ?? [],
    cast:
      data.credits?.cast?.slice(0, 12).map((person) => ({
        id: person.id,
        name: person.name,
        character: person.character ?? "",
        profileUrl: posterUrl(person.profile_path ?? null, "w185"),
      })) ?? [],
    crew: uniqueCrew([
      ...(data.created_by?.map((person) => ({
        id: person.id,
        name: person.name,
        job: "Creator",
      })) ?? []),
      ...(data.credits?.crew
        ?.filter((person) =>
          mediaType === "movie"
            ? ["Director", "Writer", "Screenplay"].includes(person.job ?? "")
            : ["Creator", "Executive Producer"].includes(person.job ?? ""),
        )
        .slice(0, 8)
        .map((person) => ({
          id: person.id,
          name: person.name,
          job: person.job ?? "",
        })) ?? []),
    ]),
    seasons: data.seasons?.map((season) => ({
      id: season.id,
      name: season.name,
      seasonNumber: season.season_number,
      episodeCount: season.episode_count,
    })),
  };
}

export async function getEpisodeInfo(
  tvId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<EpisodeInfo | null> {
  const data = await tmdb<TmdbEpisodeDetails>(
    `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`,
    {},
  );
  if (!data) return null;

  return {
    name: data.name ?? `Episode ${episodeNumber}`,
    runtime:
      typeof data.runtime === "number" && data.runtime > 0
        ? data.runtime
        : null,
  };
}

export async function getSeasonEpisodes(
  tvId: number,
  seasonNumber: number,
): Promise<SeasonEpisode[]> {
  const data = await tmdb<TmdbSeasonDetails>(
    `/tv/${tvId}/season/${seasonNumber}`,
    {},
  );

  return (data?.episodes ?? [])
    .map((episode, index) => {
      const episodeNumber = episode.episode_number ?? index + 1;
      return {
        episodeNumber,
        name: episode.name ?? `Episode ${episodeNumber}`,
        overview: episode.overview ?? "",
        runtime:
          typeof episode.runtime === "number" && episode.runtime > 0
            ? episode.runtime
            : null,
        stillUrl: posterUrl(episode.still_path ?? null, "w300"),
        airDate: episode.air_date ?? null,
      };
    })
    .filter((episode) => episode.episodeNumber > 0);
}

export async function getTasteCandidates(mediaType: MediaType, id: number) {
  const [recommendations, similar] = await Promise.all([
    tmdb<TmdbList>(`/${mediaType}/${id}/recommendations`, {}),
    tmdb<TmdbList>(`/${mediaType}/${id}/similar`, {}),
  ]);

  return {
    recommendations: normalizeList(recommendations?.results, mediaType, false),
    similar: normalizeList(similar?.results, mediaType, false),
  };
}

export async function discoverTasteCandidates(
  mediaType: MediaType,
  genreIds: number[],
) {
  if (!genreIds.length) return [];

  const params: Record<string, string> = {
    sort_by: "popularity.desc",
    include_adult: "false",
    with_genres: genreIds.join("|"),
    "vote_count.gte": mediaType === "movie" ? "80" : "30",
    "vote_average.gte": "6",
    page: "1",
  };
  const data = await tmdb<TmdbList>(`/discover/${mediaType}`, params);
  return normalizeList(data?.results, mediaType, false);
}

export async function getTrailerUrl(mediaType: MediaType, id: number) {
  const data = await tmdb<TmdbVideos>(`/${mediaType}/${id}/videos`, {});
  const fallbackData = data?.results?.length
    ? null
    : await tmdb<TmdbVideos>(`/${mediaType}/${id}/videos`, { language: "en-US" });
  const videos = data?.results?.length ? data.results : fallbackData?.results ?? [];
  const trailer =
    videos.find((video) => isYoutubeTrailer(video) && video.official) ??
    videos.find(isYoutubeTrailer) ??
    videos.find((video) => video.site === "YouTube");

  if (!trailer) return null;
  return `https://www.youtube-nocookie.com/embed/${trailer.key}`;
}

async function getNewCatalogWithMeta(mediaType: MediaType, page?: string) {
  const sourceCatalog = await getFstreamCatalog(mediaType, page);
  if (sourceCatalog.items.length) return sourceCatalog;

  if (mediaType === "tv") {
    const recentlyAired = await getRecentlyAiredSeries(page);
    if (recentlyAired.items.length) return recentlyAired;
  }

  return discoverWithMeta({
    catalog: "new",
    mediaType,
    sort: "new",
    page,
  });
}

async function getRecentlyAiredSeries(page?: string) {
  const requestedPage = normalizedPage(page);
  const data = await tmdb<TmdbList>("/discover/tv", {
    sort_by: "popularity.desc",
    include_adult: "false",
    without_genres: "16,10763,10764,10767",
    with_type: "2|4",
    "vote_count.gte": "80",
    "air_date.gte": recentDateCutoff(),
    "air_date.lte": today(),
    page: requestedPage,
  });
  const candidates = normalizeList(data?.results, "tv", false).slice(0, 12);
  const details = await Promise.all(
    candidates.map((item) => tmdb<TmdbDetails>(`/tv/${item.id}`, {})),
  );
  const items = candidates.flatMap((item, index) => {
    const episode = details[index]?.last_episode_to_air;
    const episodeNumber = episode?.episode_number ?? 0;
    if (!episodeNumber || !isRecentlyAired(episode?.air_date)) return [];
    return [{
      ...item,
      recentEpisode: {
        seasonNumber: episode?.season_number ?? null,
        episodeNumber,
        totalEpisodes: null,
        airDate: episode?.air_date ?? null,
        source: "tmdb" as const,
      },
    }];
  });

  return {
    items,
    page: data?.page ?? Number(requestedPage),
    totalPages: Math.max(1, Math.min(data?.total_pages ?? 1, 500)),
    totalResults: data?.total_results ?? items.length,
  };
}

async function getFstreamCatalog(mediaType: MediaType, page?: string) {
  const requestedPage = Number(normalizedPage(page));
  const html = await fetchFstreamCatalogPage(mediaType, requestedPage);
  if (!html) return emptyMeta();

  const { items: sourceItems, totalPages } = parseFstreamCatalog(
    html,
    mediaType,
  );
  const resolved: Array<CatalogItem | null> = [];
  for (let index = 0; index < sourceItems.length; index += 6) {
    const batch = sourceItems.slice(index, index + 6);
    resolved.push(
      ...(await Promise.all(
        batch.map((item) => resolveSourceCatalogItem(item, mediaType)),
      )),
    );
  }

  const items = uniqueCatalogItems(
    resolved.filter((item): item is CatalogItem => Boolean(item)),
  );
  const safeTotalPages = Math.max(1, totalPages);
  return {
    items,
    page: Math.min(requestedPage, safeTotalPages),
    totalPages: safeTotalPages,
    totalResults: safeTotalPages * Math.max(1, sourceItems.length),
  };
}

function parseFstreamCatalog(html: string, mediaType: MediaType) {
  const $ = load(html);
  const items: SourceCatalogItem[] = [];
  const seen = new Set<string>();

  $(".short").each((_, element) => {
    const card = $(element);
    if (mediaType === "tv" && !card.find(".mli-eps").length) return;

    const rawTitle = card.find(".short-title").first().text().trim();
    const seasonMatch = rawTitle.match(/\s*-\s*Saison\s+(\d+)/i);
    const episodeProgress = parseEpisodeProgress(
      card.find(".mli-eps").first().text().trim(),
    );
    const title =
      mediaType === "tv"
        ? rawTitle.replace(/\s*-\s*Saison\s+\d+.*$/i, "").trim()
        : rawTitle;
    const href = card.find(".short-poster[href]").first().attr("href") ?? "";
    const newsId = href.match(/[?&]newsid=(\d+)/)?.[1] ?? null;
    const posterPath = tmdbImagePath(
      card.find(".short-poster img").first().attr("src") ?? "",
    );
    const key = `${normalizeTitle(title)}:${posterPath ?? ""}`;
    if (!title || seen.has(key)) return;
    seen.add(key);

    items.push({
      title,
      posterPath,
      overview: card.find('[id^="desc-"]').first().text().trim(),
      newsId,
      seasonNumber:
        mediaType === "tv" && seasonMatch ? Number(seasonMatch[1]) : null,
      episodeNumber:
        mediaType === "tv" ? episodeProgress?.episodeNumber ?? null : null,
      totalEpisodes:
        mediaType === "tv" ? episodeProgress?.totalEpisodes ?? null : null,
    });
  });

  const pageNumbers = $(".pagi-nav .navigation a")
    .map((_, element) => {
      const href = $(element).attr("href") ?? "";
      const match = href.match(/[?&]cstart=(\d+)/);
      return match ? Number(match[1]) : 0;
    })
    .get()
    .filter(Number.isFinite);

  return {
    items,
    totalPages: Math.max(1, ...pageNumbers),
  };
}

async function resolveSourceCatalogItem(
  source: SourceCatalogItem,
  mediaType: MediaType,
) {
  const data = await tmdb<TmdbList>(`/search/${mediaType}`, {
    query: source.title,
    include_adult: "false",
  });
  const results = data?.results ?? [];
  const posterMatch = source.posterPath
    ? results.find((item) => item.poster_path === source.posterPath)
    : undefined;
  const normalizedSourceTitle = normalizeTitle(source.title);
  const titleMatch = results.find(
    (item) =>
      normalizeTitle(item.title ?? item.name ?? "") === normalizedSourceTitle,
  );
  const match =
    posterMatch ?? titleMatch ?? (results.length === 1 ? results[0] : undefined);
  if (!match) return null;

  const item = normalizeItem(match, mediaType);
  if (item && source.newsId) {
    rememberFstreamCatalogMatch(
      mediaType,
      item.id,
      source.newsId,
      source.seasonNumber,
    );
  }
  if (!item) return null;
  const withOverview =
    !item.overview && source.overview
      ? { ...item, overview: source.overview }
      : item;
  return mediaType === "tv" && source.episodeNumber
    ? {
        ...withOverview,
        recentEpisode: {
          seasonNumber: source.seasonNumber,
          episodeNumber: source.episodeNumber,
          totalEpisodes: source.totalEpisodes,
          airDate: null,
          source: "fstream" as const,
        },
      }
    : withOverview;
}

export function posterUrl(path: string | null, size = "w342") {
  return path ? `${IMAGE_BASE_URL}/${size}${path}` : null;
}

export function backdropUrl(path: string | null, size = "w1280") {
  return path ? `${IMAGE_BASE_URL}/${size}${path}` : null;
}

async function tmdb<T>(
  path: string,
  params: Record<string, string>,
  options: { noStore?: boolean } = {},
): Promise<T | null> {
  const cacheKey = tmdbCacheKey(path, params);
  const cached = getCachedApiResponse<T>(cacheKey);
  if (cached && !cached.stale) return cached.value;

  const pending = tmdbRequests.get(cacheKey);
  if (pending) return (await pending) as T | null;

  const request = fetchTmdb<T>(path, params, options, cached?.value ?? null);
  tmdbRequests.set(cacheKey, request);
  try {
    const result = await request;
    if (result !== null) {
      setCachedApiResponse(cacheKey, result, tmdbCacheTtl(path));
    }
    return result;
  } finally {
    tmdbRequests.delete(cacheKey);
  }
}

async function fetchTmdb<T>(
  path: string,
  params: Record<string, string>,
  options: { noStore?: boolean },
  staleValue: T | null,
): Promise<T | null> {
  const accessToken = process.env.TMDB_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;
  if (!accessToken && !apiKey) return staleValue;

  const credentials: Array<{ accessToken: string } | { apiKey: string }> = [];
  if (accessToken) credentials.push({ accessToken });
  if (apiKey) credentials.push({ apiKey });

  for (const credential of credentials) {
    const url = new URL(`${TMDB_BASE_URL}${path}`);
    url.searchParams.set("language", "fr-FR");
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    if ("apiKey" in credential) url.searchParams.set("api_key", credential.apiKey);

    try {
      const response = await fetchWithRetry(url, {
        headers:
          "accessToken" in credential
            ? { Authorization: `Bearer ${credential.accessToken}` }
            : undefined,
        ...(options.noStore
          ? { cache: "no-store" as const }
          : { next: { revalidate: 60 * 30 } }),
      });
      if (response.ok) return (await response.json()) as T;
      if (![401, 403].includes(response.status)) return staleValue;
    } catch (error) {
      console.error(`TMDB request failed for ${path}`, error);
    }
  }

  return staleValue;
}

async function fetchWithRetry(url: URL, init: RequestInit, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function normalizeList(
  results: TmdbResult[] | undefined,
  forcedType?: MediaType,
  withFallback = true,
) {
  const normalized = (results ?? [])
    .map((result) => normalizeItem(result, forcedType))
    .filter((item): item is CatalogItem => Boolean(item));

  return normalized.length || !withFallback ? normalized : fallbackCatalog();
}

function normalizeMeta(data: TmdbList | null, forcedType?: MediaType, withFallback = false) {
  const items = normalizeList(data?.results, forcedType, withFallback);
  return {
    items,
    page: data?.page ?? 1,
    totalPages: Math.max(1, Math.min(data?.total_pages ?? 1, 500)),
    totalResults: data?.total_results ?? items.length,
  };
}

async function getPersonCreditsWithMeta(
  filters: CatalogFilters,
  mediaType: MediaType,
) {
  const personId = Number(filters.person);
  if (!Number.isFinite(personId)) return emptyMeta();

  const data = await tmdb<TmdbPersonCredits>(
    `/person/${personId}/${mediaType === "movie" ? "movie_credits" : "tv_credits"}`,
    {},
  );
  const role = filters.personRole === "crew" ? "crew" : "cast";
  const requestedJob = filters.personJob?.toLocaleLowerCase("en");
  const credits = role === "crew" ? data?.crew ?? [] : data?.cast ?? [];
  const genres = genreIdsForMediaType(filters.genre, mediaType);
  const seen = new Set<number>();

  const items = credits
    .filter(
      (credit) =>
        role !== "crew" ||
        !requestedJob ||
        credit.job?.toLocaleLowerCase("en") === requestedJob,
    )
    .map((credit) => normalizeItem(credit, mediaType))
    .filter((item): item is CatalogItem => Boolean(item))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      if (filters.catalog === "anime" && !isAnimeItem(item)) return false;
      if (mediaType === "tv" && filters.catalog !== "anime" && isAnimeItem(item)) {
        return false;
      }
      if (genres.some((genre) => !item.genreIds.includes(Number(genre)))) return false;
      if (
        filters.originalLanguage &&
        item.originalLanguage !== filters.originalLanguage
      ) {
        return false;
      }
      if (filters.minRating && item.voteAverage < Number(filters.minRating)) return false;

      const year = Number(item.releaseDate?.slice(0, 4));
      if (filters.yearFrom && (!year || year < Number(filters.yearFrom))) return false;
      if (filters.yearTo && (!year || year > Number(filters.yearTo))) return false;
      return true;
    });

  const sorted = sortCatalogItems(items, filters.sort ?? "new");
  const requestedPage = Math.max(1, Number(normalizedPage(filters.page)));
  const totalPages = Math.max(1, Math.ceil(sorted.length / 20));
  const page = Math.min(requestedPage, totalPages);

  return {
    items: sorted.slice((page - 1) * 20, page * 20),
    page,
    totalPages,
    totalResults: sorted.length,
  };
}

function emptyMeta() {
  return {
    items: [] as CatalogItem[],
    page: 1,
    totalPages: 1,
    totalResults: 0,
  };
}

function normalizedPage(page?: string) {
  const value = Number(page);
  if (!Number.isFinite(value)) return "1";
  return String(Math.min(500, Math.max(1, Math.floor(value))));
}

function tmdbCacheKey(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(
    Object.entries({ language: "fr-FR", ...params }).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  );
  return `tmdb:${path}?${query.toString()}`;
}

function tmdbCacheTtl(path: string) {
  if (path.startsWith("/trending/")) return 60 * 60;
  if (path.startsWith("/search/")) return 24 * 60 * 60;
  if (path.startsWith("/discover/")) return 6 * 60 * 60;
  if (path.endsWith("/videos")) return 24 * 60 * 60;
  if (path.includes("/recommendations") || path.endsWith("/similar")) {
    return 12 * 60 * 60;
  }
  if (/^\/tv\/\d+$/.test(path)) return 6 * 60 * 60;
  return 7 * 24 * 60 * 60;
}

function tmdbSort(sort: string | undefined, mediaType: MediaType) {
  if (sort === "rating") return "vote_average.desc";
  if (sort === "new") return mediaType === "movie" ? "primary_release_date.desc" : "first_air_date.desc";
  return "popularity.desc";
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
    voteCount: result.vote_count ?? 0,
    popularity: result.popularity ?? 0,
    genreIds: result.genre_ids ?? result.genres?.map((genre) => genre.id) ?? [],
    originalLanguage: result.original_language ?? "na",
  };
}

function isAnimeItem(item: CatalogItem) {
  return item.originalLanguage === "ja" && item.genreIds.includes(16);
}

function sortCatalogItems(items: CatalogItem[], sort?: string) {
  return [...items].sort((a, b) => {
    if (sort === "rating") return b.voteAverage - a.voteAverage;
    if (sort === "az") return a.title.localeCompare(b.title, "fr");
    if (sort === "new") {
      return (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "");
    }
    return b.popularity - a.popularity;
  });
}

function uniqueCrew(crew: MediaDetails["crew"]) {
  const seen = new Set<string>();
  return crew.filter((person) => {
    const key = `${person.id}-${person.job}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueCatalogItems(items: CatalogItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.mediaType}-${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function oneYearAgo() {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

function tmdbImagePath(url: string) {
  const match = url.match(/\/t\/p\/[^/]+(\/[^?#]+)/);
  return match?.[1] ?? null;
}

function normalizeTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isYoutubeTrailer(video: TmdbVideo) {
  return video.site === "YouTube" && ["Trailer", "Teaser"].includes(video.type);
}
