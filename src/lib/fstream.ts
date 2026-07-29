import "server-only";

import { load } from "cheerio";
import { getCachedApiResponse, setCachedApiResponse } from "@/lib/store";
import {
  createStreamCandidate,
  isPlayerHostId,
  isStreamLanguageId,
  normalizeCachedStreamCandidates,
  PLAYER_HOST_IDS,
  PLAYER_HOST_REGISTRY,
  type PlayerHostId,
  type StreamCandidate,
  type StreamLanguageId,
  type StreamSourceAdapter,
} from "@/lib/streaming";
import type { MediaDetails, MediaType } from "@/lib/types";

const FSTREAM_INDEX_URL = "https://fstream.info/";
const FALLBACK_FSTREAM_URL = "https://fs16.lol";
const SERIES_LANGUAGES = ["vf", "vostfr", "vo"] as const;
const SOURCE_ID = "fstream";

type FstreamSource = {
  newsId: string;
  seasonNumber: number | null;
};

type SearchCandidate = FstreamSource & {
  title: string;
  posterPath: string | null;
  year: number | null;
};

type MoviePlayers = {
  players: Record<
    string,
    {
      default?: string;
      vostfr?: string;
      vff?: string;
      vfq?: string;
    }
  >;
  meta: {
    tagz?: string;
  };
};

type SeriesPlayers = {
  vf: Record<string, Record<string, string>>;
  vostfr: Record<string, Record<string, string>>;
  vo: Record<string, Record<string, string>>;
};

type ResourceOptions = {
  cacheKey: string;
  ttlSeconds: number;
  method?: "GET" | "POST";
  body?: string;
  contentType?: string;
};

export async function getFstreamBaseUrl(forceRefresh = false) {
  const override = normalizedFstreamOrigin(process.env.FSTREAM_BASE_URL);
  if (override) return override;

  const indexUrl =
    normalizedSecureHttpUrl(process.env.FSTREAM_INDEX_URL) ??
    FSTREAM_INDEX_URL;
  const cacheKey = `source:fstream:domain:${indexUrl}`;
  const cached = getCachedApiResponse<string>(cacheKey);
  const cachedOrigin = normalizedFstreamOrigin(cached?.value);
  if (!forceRefresh && cachedOrigin && cached && !cached.stale) {
    return cachedOrigin;
  }

  const startedAt = Date.now();
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
      reportFstreamIssue("DOMAIN_UNAVAILABLE", {
        operation: "discover-domain",
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
    } else {
      reportFstreamIssue(httpErrorCode(response.status), {
        operation: "discover-domain",
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
    }
  } catch (error) {
    reportFstreamIssue(requestErrorCode(error), {
      operation: "discover-domain",
      durationMs: Date.now() - startedAt,
    });
    // A stale domain remains useful when the landing page is temporarily down.
  }

  if (cachedOrigin) return cachedOrigin;
  return (
    normalizedFstreamOrigin(process.env.FS16_BASE_URL) ??
    FALLBACK_FSTREAM_URL
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

export const fstreamSourceAdapter: StreamSourceAdapter = {
  id: SOURCE_ID,
  providerTemplate(hostId) {
    return (
      `/api/fstream-player?host=${hostId}` +
      "&tmdbId={tmdbId}&mediaType={tmdbMediaType}" +
      "&season={season}&episode={episode}&language={language}" +
      "&autoplay={autoplay}"
    );
  },
  async resolve({ detail, seasonNumber, episodeNumber }) {
    return (
      (await resolveFstreamCandidates(
        detail,
        seasonNumber,
        episodeNumber,
      )) ?? []
    );
  },
};

export async function getFstreamEmbedUrl(
  detail: MediaDetails,
  host: PlayerHostId,
  language: StreamLanguageId,
  seasonNumber: number | null,
  episodeNumber: number | null,
) {
  const candidates = await resolveFstreamCandidates(
    detail,
    seasonNumber,
    episodeNumber,
  );
  if (!candidates) return null;

  const preferredLanguages: StreamLanguageId[] =
    language === "vf"
      ? ["vf", "vff", "vfq"]
      : [language];
  return (
    candidates.find(
      (candidate) =>
        candidate.hostId === host &&
        preferredLanguages.includes(candidate.languageId),
    )?.embedUrl ?? null
  );
}

export function isFstreamProviderHost(
  value: string | null,
): value is PlayerHostId {
  return isPlayerHostId(value);
}

export function isFstreamLanguage(
  value: string | null,
): value is StreamLanguageId {
  return isStreamLanguageId(value);
}

export function getFstreamProviderName(host: PlayerHostId) {
  return PLAYER_HOST_REGISTRY[host].name;
}

async function resolveFstreamCandidates(
  detail: MediaDetails,
  seasonNumber: number | null,
  episodeNumber: number | null,
) {
  const season = detail.mediaType === "tv" ? seasonNumber ?? 1 : null;
  const episode = detail.mediaType === "tv" ? episodeNumber ?? 1 : null;
  const streamCacheKey = [
    "source:fstream:streams:v3",
    detail.mediaType,
    detail.id,
    season ?? 0,
    episode ?? 0,
  ].join(":");
  const cached = getCachedApiResponse<unknown>(streamCacheKey);
  if (cached && !cached.stale) {
    if (cached.value === false) return null;
    const normalized = normalizeCachedStreamCandidates(cached.value);
    if (normalized) return normalized;
    reportFstreamIssue("INVALID_PAYLOAD", {
      operation: "stream-cache",
      mediaType: detail.mediaType,
    });
  }

  const source = await resolveFstreamSource(detail, season);
  if (!source) {
    setCachedApiResponse(streamCacheKey, false, 15 * 60);
    return null;
  }

  const candidates =
    detail.mediaType === "movie"
      ? await getMovieCandidates(detail, source.newsId)
      : await getSeriesCandidates(
          detail,
          source.newsId,
          season ?? 1,
          episode ?? 1,
        );
  if (!candidates?.length) {
    reportFstreamIssue("NO_STREAM", {
      operation: "resolve-streams",
      mediaType: detail.mediaType,
    });
    setCachedApiResponse(streamCacheKey, false, 10 * 60);
    return null;
  }

  setCachedApiResponse(streamCacheKey, candidates, 30 * 60);
  return candidates;
}

async function resolveFstreamSource(
  detail: MediaDetails,
  seasonNumber: number | null,
) {
  const cacheKey = sourceKey(detail.mediaType, detail.id, seasonNumber);
  const cached = getCachedApiResponse<unknown>(cacheKey);
  const cachedSource = normalizeFstreamSource(cached?.value);
  if (cachedSource && cached && !cached.stale) return cachedSource;

  const hint = getCachedApiResponse<unknown>(
    sourceHintKey(detail.mediaType, detail.id, seasonNumber),
  );
  const hintedSource = normalizeFstreamSource(hint?.value);
  if (
    hintedSource &&
    (await sourceMatchesTmdb(detail, hintedSource.newsId))
  ) {
    setCachedApiResponse(cacheKey, hintedSource, 7 * 24 * 60 * 60);
    return hintedSource;
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

  const match = await findFirstMatchingSource(detail, ranked, 3);
  if (match) {
    const source = {
      newsId: match.newsId,
      seasonNumber: match.seasonNumber,
    };
    setCachedApiResponse(cacheKey, source, 7 * 24 * 60 * 60);
    return source;
  }

  reportFstreamIssue("TMDB_MISMATCH", {
    operation: "match-source",
    mediaType: detail.mediaType,
    candidateCount: ranked.length,
  });
  return null;
}

async function findFirstMatchingSource(
  detail: MediaDetails,
  candidates: SearchCandidate[],
  concurrency: number,
) {
  const batchSize = Math.max(1, concurrency);
  for (let index = 0; index < candidates.length; index += batchSize) {
    const batch = candidates.slice(index, index + batchSize);
    const matches = await Promise.all(
      batch.map((candidate) =>
        sourceMatchesTmdb(detail, candidate.newsId),
      ),
    );
    const matchIndex = matches.findIndex(Boolean);
    if (matchIndex >= 0) return batch[matchIndex];
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
  if (!html) {
    reportFstreamIssue("SEARCH_FAILED", {
      operation: "search",
    });
    return [];
  }

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

async function getMovieCandidates(detail: MediaDetails, newsId: string) {
  const payload = await fetchMoviePayload(newsId);
  if (payload?.meta?.tagz !== `f-${detail.id}`) return null;

  const candidates: StreamCandidate[] = [];
  for (const host of PLAYER_HOST_IDS) {
      const source = payload.players?.[host];
    if (!source) continue;

    pushCandidate(candidates, {
      hostId: host,
      embedUrl: source.vff,
      languageId: "vff",
      audioLanguage: "fr-FR",
      subtitleLanguage: null,
      season: null,
      episode: null,
    });
    pushCandidate(candidates, {
      hostId: host,
      embedUrl: source.vfq,
      languageId: "vfq",
      audioLanguage: "fr-CA",
      subtitleLanguage: null,
      season: null,
      episode: null,
    });
    pushCandidate(candidates, {
      hostId: host,
      embedUrl: source.vostfr,
      languageId: "vostfr",
      audioLanguage: detail.originalLanguage || "und",
      subtitleLanguage: "fr",
      season: null,
      episode: null,
    });

    if (
      source.default &&
      ![source.vff, source.vfq, source.vostfr].includes(source.default)
    ) {
      pushCandidate(candidates, {
        hostId: host,
        embedUrl: source.default,
        languageId: "vf",
        audioLanguage: "fr",
        subtitleLanguage: null,
        season: null,
        episode: null,
      });
    }
  }
  return candidates;
}

async function fetchMoviePayload(newsId: string) {
  const raw = await fetchFstreamResource(
    `/engine/ajax/film_api.php?id=${encodeURIComponent(newsId)}`,
    {
      cacheKey: `movie-players:${newsId}`,
      ttlSeconds: 30 * 60,
    },
  );
  return parseMoviePlayers(raw);
}

async function getSeriesCandidates(
  detail: MediaDetails,
  newsId: string,
  seasonNumber: number,
  episodeNumber: number,
) {
  const raw = await fetchFstreamResource(
    `/static/series/${encodeURIComponent(newsId)}.js`,
    {
      cacheKey: `series-players:${newsId}`,
      ttlSeconds: 15 * 60,
    },
  );
  const payload = parseSeriesPlayers(raw);
  if (!payload) return null;

  const candidates: StreamCandidate[] = [];
  for (const host of PLAYER_HOST_IDS) {
    for (const language of SERIES_LANGUAGES) {
      const embedUrl = payload[language][String(episodeNumber)]?.[host];
      pushCandidate(candidates, {
        hostId: host,
        embedUrl,
        languageId: language,
        audioLanguage:
          language === "vf"
            ? "fr"
            : detail.originalLanguage || "und",
        subtitleLanguage: language === "vostfr" ? "fr" : null,
        season: seasonNumber,
        episode: episodeNumber,
      });
    }
  }
  return candidates;
}

async function fetchFstreamResource(path: string, options: ResourceOptions) {
  const cacheKey = `source:fstream:${options.cacheKey}`;
  const cached = getCachedApiResponse<unknown>(cacheKey);
  const cachedValue =
    typeof cached?.value === "string" ? cached.value : null;
  if (cachedValue !== null && cached && !cached.stale) return cachedValue;

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

  return cachedValue;
}

async function requestFstreamResource(
  baseUrl: string,
  path: string,
  options: ResourceOptions,
) {
  const startedAt = Date.now();
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
    if (response.ok) return await response.text();

    reportFstreamIssue(httpErrorCode(response.status), {
      operation: resourceOperation(options.cacheKey),
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return null;
  } catch (error) {
    reportFstreamIssue(requestErrorCode(error), {
      operation: resourceOperation(options.cacheKey),
      durationMs: Date.now() - startedAt,
    });
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
    const origin = normalizedFstreamOrigin(candidate);
    if (!origin) continue;
    return origin;
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

function pushCandidate(
  candidates: StreamCandidate[],
  input: {
    hostId: PlayerHostId;
    embedUrl: string | undefined;
    languageId: StreamLanguageId;
    audioLanguage: string;
    subtitleLanguage: string | null;
    season: number | null;
    episode: number | null;
  },
) {
  const embedUrl = input.embedUrl;
  if (!embedUrl) return;
  const candidate = createStreamCandidate({
    sourceId: SOURCE_ID,
    hostId: input.hostId,
    embedUrl,
    languageId: input.languageId,
    audioLanguage: input.audioLanguage,
    subtitleLanguage: input.subtitleLanguage,
    season: input.season,
    episode: input.episode,
  });
  if (candidate) {
    candidates.push(candidate);
    return;
  }

  reportFstreamIssue("HOST_REJECTED", {
    operation: "normalize-player",
    hostId: input.hostId,
  });
}

function parseMoviePlayers(value: string | null): MoviePlayers | null {
  const parsed = parseUnknownJson(value);
  if (
    !isRecord(parsed) ||
    !isRecord(parsed.players) ||
    !isRecord(parsed.meta)
  ) {
    reportFstreamIssue("INVALID_PAYLOAD", {
      operation: "movie-players",
    });
    return null;
  }

  const players: MoviePlayers["players"] = {};
  for (const [host, rawPlayer] of Object.entries(parsed.players)) {
    if (!isRecord(rawPlayer)) continue;
    const player: MoviePlayers["players"][string] = {};
    for (const key of ["default", "vostfr", "vff", "vfq"] as const) {
      if (typeof rawPlayer[key] === "string") {
        player[key] = rawPlayer[key];
      }
    }
    players[host] = player;
  }

  return {
    players,
    meta: {
      tagz: typeof parsed.meta.tagz === "string" ? parsed.meta.tagz : undefined,
    },
  };
}

function parseSeriesPlayers(value: string | null): SeriesPlayers | null {
  const parsed = parseUnknownJson(value);
  if (!isRecord(parsed)) {
    reportFstreamIssue("INVALID_PAYLOAD", {
      operation: "series-players",
    });
    return null;
  }

  const payload: SeriesPlayers = {
    vf: {},
    vostfr: {},
    vo: {},
  };
  for (const language of SERIES_LANGUAGES) {
    const episodes = normalizeEpisodePlayers(parsed[language]);
    if (!episodes) {
      reportFstreamIssue("INVALID_PAYLOAD", {
        operation: "series-players",
      });
      return null;
    }
    payload[language] = episodes;
  }
  return payload;
}

function normalizeEpisodePlayers(
  value: unknown,
): Record<string, Record<string, string>> | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;

  const episodes: Record<string, Record<string, string>> = {};
  for (const [episode, rawPlayers] of Object.entries(value)) {
    if (!/^\d+$/.test(episode) || !isRecord(rawPlayers)) return null;
    const players: Record<string, string> = {};
    for (const [host, embedUrl] of Object.entries(rawPlayers)) {
      if (typeof embedUrl !== "string") return null;
      players[host] = embedUrl;
    }
    episodes[episode] = players;
  }
  return episodes;
}

function parseUnknownJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizedSecureHttpUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizedFstreamOrigin(value: string | undefined) {
  const normalized = normalizedSecureHttpUrl(value);
  if (!normalized) return null;

  const url = new URL(normalized);
  const hostname = url.hostname.toLowerCase();
  const allowedOrigins = new Set(
    (process.env.FSTREAM_ALLOWED_ORIGINS ?? "")
      .split(",")
      .flatMap((item) => {
        const allowed = normalizedSecureHttpUrl(item.trim());
        return allowed ? [new URL(allowed).origin] : [];
      }),
  );
  if (!/^fs\d+\.lol$/.test(hostname) && !allowedOrigins.has(url.origin)) {
    return null;
  }
  return url.origin;
}

function resourceOperation(cacheKey: string) {
  return cacheKey.split(":", 1)[0] || "resource";
}

type FstreamErrorCode =
  | "TIMEOUT"
  | "DOMAIN_UNAVAILABLE"
  | "SEARCH_FAILED"
  | "INVALID_PAYLOAD"
  | "TMDB_MISMATCH"
  | "NO_STREAM"
  | "HOST_REJECTED"
  | "HTTP_403"
  | "HTTP_429"
  | "HTTP_5XX"
  | "HTTP_ERROR"
  | "NETWORK_ERROR";

function httpErrorCode(status: number): FstreamErrorCode {
  if (status === 403) return "HTTP_403";
  if (status === 429) return "HTTP_429";
  if (status >= 500) return "HTTP_5XX";
  return "HTTP_ERROR";
}

function requestErrorCode(error: unknown): FstreamErrorCode {
  return error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
    ? "TIMEOUT"
    : "NETWORK_ERROR";
}

function reportFstreamIssue(
  code: FstreamErrorCode,
  context: {
    operation: string;
    status?: number;
    durationMs?: number;
    mediaType?: MediaType;
    candidateCount?: number;
    hostId?: PlayerHostId;
  },
) {
  console.warn(
    "[stream-source]",
    JSON.stringify({
      sourceId: SOURCE_ID,
      code,
      ...context,
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFstreamSource(value: unknown): FstreamSource | null {
  if (
    !isRecord(value) ||
    typeof value.newsId !== "string" ||
    !/^\d{4,}$/.test(value.newsId) ||
    (value.seasonNumber !== null &&
      (!Number.isSafeInteger(value.seasonNumber) ||
        Number(value.seasonNumber) < 0))
  ) {
    return null;
  }

  return {
    newsId: value.newsId,
    seasonNumber:
      value.seasonNumber === null ? null : Number(value.seasonNumber),
  };
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
