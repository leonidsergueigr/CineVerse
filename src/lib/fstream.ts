import "server-only";

import { load } from "cheerio";
import { getCachedApiResponse, setCachedApiResponse } from "@/lib/store";
import type { EmbedProvider, MediaDetails, MediaType } from "@/lib/types";

const FSTREAM_INDEX_URL = "https://fstream.info/";
const FALLBACK_FSTREAM_URL = "https://fs16.lol";
const PROVIDER_HOSTS = ["uqload", "voe"] as const;
const LANGUAGES = ["vf", "vostfr", "vo"] as const;

type ProviderHost = (typeof PROVIDER_HOSTS)[number];
type ProviderLanguage = (typeof LANGUAGES)[number];

type FstreamSource = {
  newsId: string;
  seasonNumber: number | null;
};

type SearchCandidate = FstreamSource & {
  title: string;
  posterPath: string | null;
  year: number | null;
};

type StreamSet = Record<
  ProviderHost,
  Partial<Record<ProviderLanguage, string>>
>;

type MoviePlayers = {
  players?: Record<
    string,
    {
      default?: string;
      vostfr?: string;
      vff?: string;
      vfq?: string;
    }
  >;
  meta?: {
    tagz?: string;
  };
};

type SeriesPlayers = {
  vf?: Record<string, Record<string, string>>;
  vostfr?: Record<string, Record<string, string>>;
  vo?: Record<string, Record<string, string>>;
};

type ResourceOptions = {
  cacheKey: string;
  ttlSeconds: number;
  method?: "GET" | "POST";
  body?: string;
  contentType?: string;
};

export async function getFstreamBaseUrl(forceRefresh = false) {
  const override = normalizedOrigin(process.env.FSTREAM_BASE_URL);
  if (override) return override;

  const indexUrl =
    normalizedHttpUrl(process.env.FSTREAM_INDEX_URL) ?? FSTREAM_INDEX_URL;
  const cacheKey = `source:fstream:domain:${indexUrl}`;
  const cached = getCachedApiResponse<string>(cacheKey);
  if (!forceRefresh && cached && !cached.stale) return cached.value;

  try {
    const response = await fetch(indexUrl, {
      cache: "no-store",
      headers: {
        Accept: "text/html",
        "User-Agent": "CineVerse/1.0",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      const currentUrl = extractCurrentFstreamUrl(await response.text());
      if (currentUrl) {
        setCachedApiResponse(cacheKey, currentUrl, 30 * 60);
        return currentUrl;
      }
    }
  } catch {
    // A stale domain remains useful when the landing page is temporarily down.
  }

  if (cached?.value) return cached.value;
  return (
    normalizedOrigin(process.env.FS16_BASE_URL) ?? FALLBACK_FSTREAM_URL
  );
}

export async function fetchFstreamCatalogPage(
  mediaType: MediaType,
  page: number,
) {
  const category = mediaType === "movie" ? "films" : "s-tv";
  const path =
    page <= 1
      ? mediaType === "movie"
        ? "/films/"
        : "/s-tv/"
      : `/index.php?cstart=${page}&do=cat&category=${category}`;

  return fetchFstreamResource(path, {
    cacheKey: `catalog:${mediaType}:${page}`,
    ttlSeconds: 30 * 60,
  });
}

export function rememberFstreamCatalogMatch(
  mediaType: MediaType,
  tmdbId: number,
  newsId: string,
  seasonNumber: number | null,
) {
  if (!newsId) return;
  setCachedApiResponse(
    sourceHintKey(mediaType, tmdbId, seasonNumber),
    { newsId, seasonNumber } satisfies FstreamSource,
    7 * 24 * 60 * 60,
  );
}

export async function getFstreamProviders(
  detail: MediaDetails,
  seasonNumber: number | null,
  episodeNumber: number | null,
) {
  const streams = await resolveFstreamStreams(
    detail,
    seasonNumber,
    episodeNumber,
  );
  if (!streams) return [];

  return PROVIDER_HOSTS.flatMap((host, index) => {
    const languages = LANGUAGES.filter((language) =>
      Boolean(streams[host][language]),
    );
    if (!languages.length) return [];

    return [
      {
        id: `fstream-${host}`,
        name: host === "uqload" ? "Uqload" : "Voe",
        template:
          `/api/fstream-player?host=${host}` +
          "&tmdbId={tmdbId}&mediaType={tmdbMediaType}" +
          "&season={season}&episode={episode}&language={language}" +
          "&autoplay={autoplay}",
        supportsTracking: false,
        supportsLanguage: true,
        priority: 20 + index,
        languages: languages.map(toLanguageOption),
      } satisfies EmbedProvider,
    ];
  });
}

export async function getFstreamEmbedUrl(
  detail: MediaDetails,
  host: ProviderHost,
  language: ProviderLanguage,
  seasonNumber: number | null,
  episodeNumber: number | null,
) {
  const streams = await resolveFstreamStreams(
    detail,
    seasonNumber,
    episodeNumber,
  );
  return streams?.[host][language] ?? null;
}

export function isFstreamProviderHost(
  value: string | null,
): value is ProviderHost {
  return PROVIDER_HOSTS.includes(value as ProviderHost);
}

export function isFstreamLanguage(
  value: string | null,
): value is ProviderLanguage {
  return LANGUAGES.includes(value as ProviderLanguage);
}

async function resolveFstreamStreams(
  detail: MediaDetails,
  seasonNumber: number | null,
  episodeNumber: number | null,
) {
  const season = detail.mediaType === "tv" ? seasonNumber ?? 1 : null;
  const episode = detail.mediaType === "tv" ? episodeNumber ?? 1 : null;
  const streamCacheKey = [
    "source:fstream:streams",
    detail.mediaType,
    detail.id,
    season ?? 0,
    episode ?? 0,
  ].join(":");
  const cached = getCachedApiResponse<StreamSet | false>(streamCacheKey);
  if (cached && !cached.stale) return cached.value || null;

  const source = await resolveFstreamSource(detail, season);
  if (!source) {
    setCachedApiResponse(streamCacheKey, false, 15 * 60);
    return null;
  }

  const streams =
    detail.mediaType === "movie"
      ? await getMovieStreams(detail.id, source.newsId)
      : await getSeriesStreams(source.newsId, episode ?? 1);
  if (!streams || !hasStreams(streams)) {
    setCachedApiResponse(streamCacheKey, false, 10 * 60);
    return null;
  }

  setCachedApiResponse(streamCacheKey, streams, 30 * 60);
  return streams;
}

async function resolveFstreamSource(
  detail: MediaDetails,
  seasonNumber: number | null,
) {
  const cacheKey = sourceKey(detail.mediaType, detail.id, seasonNumber);
  const cached = getCachedApiResponse<FstreamSource>(cacheKey);
  if (cached && !cached.stale) return cached.value;

  const hint = getCachedApiResponse<FstreamSource>(
    sourceHintKey(detail.mediaType, detail.id, seasonNumber),
  );
  if (
    hint?.value &&
    (await sourceMatchesTmdb(detail, hint.value.newsId))
  ) {
    setCachedApiResponse(cacheKey, hint.value, 7 * 24 * 60 * 60);
    return hint.value;
  }

  const candidates = await searchFstream(detail.title);
  const ranked = candidates
    .filter((candidate) =>
      detail.mediaType === "tv"
        ? candidate.seasonNumber === seasonNumber
        : candidate.seasonNumber === null,
    )
    .sort(
      (left, right) =>
        scoreCandidate(right, detail) - scoreCandidate(left, detail),
    )
    .slice(0, 8);

  for (const candidate of ranked) {
    if (await sourceMatchesTmdb(detail, candidate.newsId)) {
      const source = {
        newsId: candidate.newsId,
        seasonNumber: candidate.seasonNumber,
      };
      setCachedApiResponse(cacheKey, source, 7 * 24 * 60 * 60);
      return source;
    }
  }

  return null;
}

async function searchFstream(query: string) {
  const normalizedQuery = normalizeTitle(query);
  const html = await fetchFstreamResource("/engine/ajax/search.php", {
    cacheKey: `search:${normalizedQuery}`,
    ttlSeconds: 12 * 60 * 60,
    method: "POST",
    body: new URLSearchParams({ query, page: "1" }).toString(),
    contentType: "application/x-www-form-urlencoded; charset=UTF-8",
  });
  if (!html) return [];

  const $ = load(html);
  const candidates: SearchCandidate[] = [];
  $(".search-item").each((_, element) => {
    const item = $(element);
    const target =
      item.attr("onclick") ??
      item.find("a[href]").first().attr("href") ??
      "";
    const newsId = extractNewsId(target);
    const title = item.find(".search-title").first().text().trim();
    if (!newsId || !title) return;

    candidates.push({
      newsId,
      title,
      posterPath: tmdbImagePath(
        item.find(".search-poster img").first().attr("src") ?? "",
      ),
      seasonNumber: seasonFromTitle(title),
      year: yearFromTitle(title),
    });
  });
  return candidates;
}

async function sourceMatchesTmdb(detail: MediaDetails, newsId: string) {
  if (detail.mediaType === "movie") {
    const payload = await fetchMoviePayload(newsId);
    return payload?.meta?.tagz === `f-${detail.id}`;
  }

  const html = await fetchFstreamResource(
    `/index.php?newsid=${encodeURIComponent(newsId)}`,
    {
      cacheKey: `source-page:${newsId}`,
      ttlSeconds: 24 * 60 * 60,
    },
  );
  return Boolean(html?.match(new RegExp(`\\bs-${detail.id}\\b`)));
}

async function getMovieStreams(tmdbId: number, newsId: string) {
  const payload = await fetchMoviePayload(newsId);
  if (payload?.meta?.tagz !== `f-${tmdbId}`) return null;

  return PROVIDER_HOSTS.reduce<StreamSet>(
    (streams, host) => {
      const source = payload.players?.[host];
      if (!source) return streams;

      const vf = firstHttpUrl(source.vff, source.vfq, source.default);
      const vostfr = firstHttpUrl(source.vostfr);
      if (vf) streams[host].vf = vf;
      if (vostfr) streams[host].vostfr = vostfr;
      return streams;
    },
    emptyStreamSet(),
  );
}

async function fetchMoviePayload(newsId: string) {
  const raw = await fetchFstreamResource(
    `/engine/ajax/film_api.php?id=${encodeURIComponent(newsId)}`,
    {
      cacheKey: `movie-players:${newsId}`,
      ttlSeconds: 30 * 60,
    },
  );
  return parseJson<MoviePlayers>(raw);
}

async function getSeriesStreams(newsId: string, episodeNumber: number) {
  const raw = await fetchFstreamResource(
    `/static/series/${encodeURIComponent(newsId)}.js`,
    {
      cacheKey: `series-players:${newsId}`,
      ttlSeconds: 15 * 60,
    },
  );
  const payload = parseJson<SeriesPlayers>(raw);
  if (!payload) return null;

  return PROVIDER_HOSTS.reduce<StreamSet>(
    (streams, host) => {
      for (const language of LANGUAGES) {
        const url = firstHttpUrl(
          payload[language]?.[String(episodeNumber)]?.[host],
        );
        if (url) streams[host][language] = url;
      }
      return streams;
    },
    emptyStreamSet(),
  );
}

async function fetchFstreamResource(path: string, options: ResourceOptions) {
  const cacheKey = `source:fstream:${options.cacheKey}`;
  const cached = getCachedApiResponse<string>(cacheKey);
  if (cached && !cached.stale) return cached.value;

  const baseUrl = await getFstreamBaseUrl();
  const first = await requestFstreamResource(baseUrl, path, options);
  if (first !== null) {
    setCachedApiResponse(cacheKey, first, options.ttlSeconds);
    return first;
  }

  const refreshedBaseUrl = await getFstreamBaseUrl(true);
  if (refreshedBaseUrl !== baseUrl) {
    const retried = await requestFstreamResource(
      refreshedBaseUrl,
      path,
      options,
    );
    if (retried !== null) {
      setCachedApiResponse(cacheKey, retried, options.ttlSeconds);
      return retried;
    }
  }

  return cached?.value ?? null;
}

async function requestFstreamResource(
  baseUrl: string,
  path: string,
  options: ResourceOptions,
) {
  try {
    const response = await fetch(new URL(path, baseUrl), {
      method: options.method ?? "GET",
      body: options.body,
      cache: "no-store",
      headers: {
        Accept: "application/json, text/html;q=0.9, */*;q=0.8",
        Referer: `${baseUrl}/`,
        "User-Agent": "CineVerse/1.0",
        ...(options.contentType
          ? { "Content-Type": options.contentType }
          : {}),
      },
      signal: AbortSignal.timeout(10000),
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

function extractCurrentFstreamUrl(html: string) {
  const $ = load(html);
  const candidates = [
    $("#mainUrl").attr("href"),
    ...$("a[href]")
      .map((_, element) => $(element).attr("href"))
      .get(),
  ];

  for (const candidate of candidates) {
    const origin = normalizedOrigin(candidate);
    if (!origin) continue;
    const hostname = new URL(origin).hostname.toLowerCase();
    if (/^fs\d+\./.test(hostname)) return origin;
  }
  return null;
}

function scoreCandidate(candidate: SearchCandidate, detail: MediaDetails) {
  let score = 0;
  if (
    candidate.posterPath &&
    detail.posterPath &&
    candidate.posterPath === detail.posterPath
  ) {
    score += 100;
  }
  if (normalizeTitle(candidate.title) === normalizeTitle(detail.title)) {
    score += 50;
  }
  const releaseYear = Number(detail.releaseDate?.slice(0, 4));
  if (candidate.year && candidate.year === releaseYear) score += 20;
  return score;
}

function normalizeTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*-\s*saison\s+\d+.*$/i, "")
    .replace(/\(\d{4}\)\s*$/i, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function seasonFromTitle(value: string) {
  const match = value.match(/\bsaison\s+(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function yearFromTitle(value: string) {
  const match = value.match(/\((\d{4})\)\s*$/);
  return match ? Number(match[1]) : null;
}

function extractNewsId(value: string) {
  return value.match(/(?:newsid=|\/)(\d{4,})/)?.[1] ?? null;
}

function tmdbImagePath(value: string) {
  const match = value.match(
    /^https?:\/\/image\.tmdb\.org\/t\/p\/[^/]+(\/.+)$/i,
  );
  return match?.[1] ?? null;
}

function emptyStreamSet(): StreamSet {
  return { uqload: {}, voe: {} };
}

function hasStreams(streams: StreamSet) {
  return PROVIDER_HOSTS.some((host) =>
    LANGUAGES.some((language) => Boolean(streams[host][language])),
  );
}

function firstHttpUrl(...values: Array<string | undefined>) {
  for (const value of values) {
    const url = normalizedHttpUrl(value);
    if (url) return url;
  }
  return null;
}

function normalizedHttpUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function normalizedOrigin(value: string | undefined) {
  const url = normalizedHttpUrl(value);
  return url ? new URL(url).origin : null;
}

function parseJson<T>(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toLanguageOption(language: ProviderLanguage) {
  const labels: Record<ProviderLanguage, string> = {
    vf: "VF",
    vostfr: "VOSTFR",
    vo: "VO",
  };
  return { id: language, label: labels[language] };
}

function sourceKey(
  mediaType: MediaType,
  tmdbId: number,
  seasonNumber: number | null,
) {
  return `source:fstream:match:${mediaType}:${tmdbId}:${seasonNumber ?? 0}`;
}

function sourceHintKey(
  mediaType: MediaType,
  tmdbId: number,
  seasonNumber: number | null,
) {
  return `source:fstream:hint:${mediaType}:${tmdbId}:${seasonNumber ?? 0}`;
}
