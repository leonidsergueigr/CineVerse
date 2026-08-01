import "server-only";

import { GENRES, SERIES_GENRES } from "@/lib/genres";
import {
  discoverTasteCandidates,
  getCatalogItemsByIds,
  getTasteCandidates,
} from "@/lib/tmdb";
import type {
  CatalogItem,
  DislikeRecord,
  LikeRecord,
  MediaType,
  PersonalizedRecommendation,
  RecommendationExposure,
  RecommendationResult,
  WatchlistRecord,
} from "@/lib/types";

const MAX_LIKE_SEEDS = 8;
const MAX_WATCHLIST_SEEDS = 4;
const MAX_NEGATIVE_SIGNALS = 16;
const MAX_RESULTS = 18;

type PositiveSeed = LikeRecord & {
  strength: number;
  origin: "liked" | "completed" | "watchlist";
};

type Candidate = {
  item: CatalogItem;
  recommendationHits: number;
  similarHits: number;
  discoveryHits: number;
  sourceTitles: Set<string>;
};

export async function buildPersonalizedRecommendations(
  likes: LikeRecord[],
  dislikes: DislikeRecord[] = [],
  exposures: RecommendationExposure[] = [],
  watchlist: WatchlistRecord[] = [],
): Promise<RecommendationResult> {
  const likedKeys = new Set(likes.map((like) => feedbackKey(like)));
  const seeds: PositiveSeed[] = [
    ...likes.slice(0, MAX_LIKE_SEEDS).map((item) => ({
      ...item,
      strength: item.signalStrength ?? 1,
      origin: item.signalOrigin ?? ("liked" as const),
    })),
    ...watchlist
      .filter((item) => !likedKeys.has(feedbackKey(item)))
      .slice(0, MAX_WATCHLIST_SEEDS)
      .map((item) => ({
        ...item,
        likedAt: item.addedAt,
        strength: 0.45,
        origin: "watchlist" as const,
      })),
  ];
  const negativeSignals = dislikes.slice(0, MAX_NEGATIVE_SIGNALS);
  const emptyProfile = {
    likeCount: likes.length,
    watchlistCount: watchlist.length,
    dislikeCount: dislikes.length,
    movieCount: likes.filter((like) => like.mediaType === "movie").length,
    seriesCount: likes.filter((like) => like.mediaType === "tv").length,
    topGenres: [],
  };
  if (!seeds.length) return { items: [], strategy: "empty", profile: emptyProfile };

  const [seedItems, tastePools] = await Promise.all([
    getCatalogItemsByIds(
      seeds.map((seed) => ({ id: seed.tmdbId, mediaType: seed.mediaType })),
    ),
    Promise.all(seeds.map((seed) => getTasteCandidates(seed.mediaType, seed.tmdbId))),
  ]);

  const genreWeights = {
    movie: new Map<number, number>(),
    tv: new Map<number, number>(),
  } satisfies Record<MediaType, Map<number, number>>;
  const languageWeights = new Map<string, number>();
  const genrePenalties = {
    movie: new Map<number, number>(),
    tv: new Map<number, number>(),
  } satisfies Record<MediaType, Map<number, number>>;
  const languagePenalties = new Map<string, number>();

  seedItems.forEach((item, index) => {
    if (!item) return;
    const recencyWeight =
      Math.max(0.65, 1 - index * 0.05) * seeds[index].strength;
    addWeight(languageWeights, item.originalLanguage, recencyWeight);

    (["movie", "tv"] as const).forEach((targetType) => {
      item.genreIds.forEach((genreId) => {
        const mappedGenre = mapGenre(genreId, item.mediaType, targetType);
        if (mappedGenre) addWeight(genreWeights[targetType], mappedGenre, recencyWeight);
      });
    });
  });

  negativeSignals.forEach((item, index) => {
    const recencyWeight = Math.max(0.5, 0.9 - index * 0.035);
    if (item.originalLanguage) {
      addWeight(languagePenalties, item.originalLanguage, recencyWeight);
    }
    (["movie", "tv"] as const).forEach((targetType) => {
      item.genreIds.forEach((genreId) => {
        const mappedGenre = mapGenre(genreId, item.mediaType, targetType);
        if (mappedGenre) {
          addWeight(genrePenalties[targetType], mappedGenre, recencyWeight);
        }
      });
    });
  });

  const discoveries = await Promise.all(
    (["movie", "tv"] as const).map((mediaType) =>
      discoverTasteCandidates(mediaType, topIds(genreWeights[mediaType], 4)),
    ),
  );
  const candidates = new Map<string, Candidate>();

  tastePools.forEach((pool, index) => {
    const sourceTitle = seeds[index].title;
    pool.recommendations.forEach((item) =>
      mergeCandidate(candidates, item, "recommendation", sourceTitle),
    );
    pool.similar.forEach((item) =>
      mergeCandidate(candidates, item, "similar", sourceTitle),
    );
  });
  discoveries.flat().forEach((item) =>
    mergeCandidate(candidates, item, "discovery"),
  );

  const positiveKeys = new Set(seeds.map((seed) => feedbackKey(seed)));
  const dislikedKeys = new Set(dislikes.map((item) => feedbackKey(item)));
  const exposureByItem = new Map(
    exposures.map((item) => [
      `${item.mediaType}:${item.tmdbId}`,
      item,
    ]),
  );
  const scored = [...candidates.values()]
    .filter(
      ({ item }) => {
        const exposure = exposureByItem.get(itemKey(item));
        return (
          !positiveKeys.has(itemKey(item)) &&
          !dislikedKeys.has(itemKey(item)) &&
          !isCoolingDown(exposure)
        );
      },
    )
    .map((candidate) =>
      scoreCandidate(
        candidate,
        genreWeights,
        languageWeights,
        genrePenalties,
        languagePenalties,
        seeds,
        exposureByItem.get(itemKey(candidate.item)),
      ),
    )
    .filter((item) => item.posterUrl && item.voteCount > 0)
    .sort((a, b) => b.score - a.score);

  const topGenres = aggregateGenreProfile(genreWeights);
  return {
    items: diversify(scored, MAX_RESULTS),
    strategy: scored.length ? "personalized" : "empty",
    profile: {
      ...emptyProfile,
      topGenres,
    },
  };
}

function mergeCandidate(
  candidates: Map<string, Candidate>,
  item: CatalogItem,
  source: "recommendation" | "similar" | "discovery",
  sourceTitle?: string,
) {
  const key = itemKey(item);
  const candidate = candidates.get(key) ?? {
    item,
    recommendationHits: 0,
    similarHits: 0,
    discoveryHits: 0,
    sourceTitles: new Set<string>(),
  };

  if (source === "recommendation") candidate.recommendationHits += 1;
  if (source === "similar") candidate.similarHits += 1;
  if (source === "discovery") candidate.discoveryHits += 1;
  if (sourceTitle) candidate.sourceTitles.add(sourceTitle);
  if (item.overview.length > candidate.item.overview.length) candidate.item = item;
  candidates.set(key, candidate);
}

function scoreCandidate(
  candidate: Candidate,
  genreWeights: Record<MediaType, Map<number, number>>,
  languageWeights: Map<string, number>,
  genrePenalties: Record<MediaType, Map<number, number>>,
  languagePenalties: Map<string, number>,
  seeds: PositiveSeed[],
  exposure?: RecommendationExposure,
): PersonalizedRecommendation {
  const { item } = candidate;
  const genreScore = item.genreIds.reduce(
    (score, genreId) => score + (genreWeights[item.mediaType].get(genreId) ?? 0),
    0,
  );
  const languageScore = languageWeights.get(item.originalLanguage) ?? 0;
  const negativeGenreScore = item.genreIds.reduce(
    (score, genreId) =>
      score + (genrePenalties[item.mediaType].get(genreId) ?? 0),
    0,
  );
  const negativeLanguageScore =
    languagePenalties.get(item.originalLanguage) ?? 0;
  const typeLikes = seeds
    .filter((seed) => seed.mediaType === item.mediaType)
    .reduce((sum, seed) => sum + seed.strength, 0);
  const totalSeedStrength = seeds.reduce(
    (sum, seed) => sum + seed.strength,
    0,
  );
  const qualityScore =
    item.voteAverage * 0.55 +
    Math.log10(item.voteCount + 1) * 0.7 +
    Math.log10(item.popularity + 1) * 0.3;
  const exposurePenalty = exposure
    ? ignoredExposureCount(exposure) * 2.25 +
      Math.max(0, exposure.shownCount - 1) * 0.75
    : 0;
  const score =
    candidate.recommendationHits * 8 +
    candidate.similarHits * 4 +
    candidate.discoveryHits * 1.5 +
    genreScore * 1.8 +
    languageScore +
    negativeGenreScore * -1.15 +
    negativeLanguageScore * -0.45 +
    (typeLikes / Math.max(0.1, totalSeedStrength)) * 2 +
    qualityScore -
    exposurePenalty;

  const sourceTitles = [...candidate.sourceTitles];
  const strongestGenre = item.genreIds
    .map((genreId) => ({
      name: genreName(item.mediaType, genreId),
      weight: genreWeights[item.mediaType].get(genreId) ?? 0,
    }))
    .filter(({ name }) => Boolean(name))
    .sort((a, b) => b.weight - a.weight)[0];
  const reason = recommendationReason(
    item,
    sourceTitles,
    strongestGenre?.name ?? null,
    candidate.recommendationHits + candidate.similarHits,
  );

  return { ...item, reason, score: Number(score.toFixed(2)) };
}

function recommendationReason(
  item: CatalogItem,
  sourceTitles: string[],
  strongestGenre: string | null,
  tasteHits: number,
) {
  if (sourceTitles.length > 1 && tasteHits > 1) {
    return `Recommande depuis ${sourceTitles[0]} et ${sourceTitles[1]}`;
  }

  const sourceTitle = sourceTitles[0];
  if (sourceTitle) {
    const variants = strongestGenre
      ? [
          `Base sur ${sourceTitle} · ${strongestGenre}`,
          `${strongestGenre}, proche de ${sourceTitle}`,
          `Dans la veine de ${sourceTitle} · ${strongestGenre}`,
        ]
      : [
          `Parce que ${sourceTitle} vous a plu`,
          `Dans la veine de ${sourceTitle}`,
          `Une piste proche de ${sourceTitle}`,
        ];
    return variants[Math.abs(item.id) % variants.length];
  }

  return strongestGenre
    ? `Dans vos genres favoris : ${strongestGenre}`
    : "Selectionnee selon vos gouts";
}

function isCoolingDown(exposure: RecommendationExposure | undefined) {
  if (!exposure) return false;
  const ignored = ignoredExposureCount(exposure);
  const cooldown =
    ignored >= 4 ? 14 * DAY_MS : ignored >= 3 ? 7 * DAY_MS : 0;
  return cooldown > 0 && Date.now() - exposure.lastShownAt < cooldown;
}

function ignoredExposureCount(exposure: RecommendationExposure) {
  return Math.max(0, exposure.ignoredCount);
}

function diversify(
  candidates: PersonalizedRecommendation[],
  limit: number,
) {
  const remaining = [...candidates];
  const selected: PersonalizedRecommendation[] = [];

  while (remaining.length && selected.length < limit) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    remaining.forEach((candidate, index) => {
      const overlapPenalty = selected.length
        ? Math.max(...selected.map((item) => genreOverlap(candidate, item))) * 2.5
        : 0;
      const recentTypes = selected.slice(-3).map((item) => item.mediaType);
      const typePenalty =
        recentTypes.length === 3 &&
        recentTypes.every((mediaType) => mediaType === candidate.mediaType)
          ? 2
          : 0;
      const adjustedScore = candidate.score - overlapPenalty - typePenalty;
      if (adjustedScore > bestScore) {
        bestScore = adjustedScore;
        bestIndex = index;
      }
    });

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected;
}

function genreOverlap(a: CatalogItem, b: CatalogItem) {
  const aGenres = new Set(a.genreIds);
  const intersection = b.genreIds.filter((genreId) => aGenres.has(genreId)).length;
  const union = new Set([...a.genreIds, ...b.genreIds]).size;
  return union ? intersection / union : 0;
}

function aggregateGenreProfile(
  genreWeights: Record<MediaType, Map<number, number>>,
) {
  const names = new Map<string, number>();
  (["movie", "tv"] as const).forEach((mediaType) => {
    genreWeights[mediaType].forEach((weight, genreId) => {
      const name = genreName(mediaType, genreId);
      if (name) addWeight(names, name, weight);
    });
  });

  return [...names.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, weight]) => ({ name, weight: Number(weight.toFixed(2)) }));
}

function topIds(weights: Map<number, number>, limit: number) {
  return [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

function addWeight<K>(weights: Map<K, number>, key: K, amount: number) {
  weights.set(key, (weights.get(key) ?? 0) + amount);
}

function itemKey(item: Pick<CatalogItem, "id" | "mediaType">) {
  return `${item.mediaType}:${item.id}`;
}

function feedbackKey(
  item: Pick<LikeRecord | DislikeRecord, "tmdbId" | "mediaType">,
) {
  return `${item.mediaType}:${item.tmdbId}`;
}

function genreName(mediaType: MediaType, genreId: number) {
  const genres = mediaType === "movie" ? GENRES : SERIES_GENRES;
  return genres.find((genre) => genre.id === genreId)?.name ?? null;
}

function mapGenre(
  genreId: number,
  sourceType: MediaType,
  targetType: MediaType,
) {
  if (sourceType === targetType) return genreId;
  const movieToTv: Record<number, number> = {
    28: 10759,
    12: 10759,
    14: 10765,
    878: 10765,
  };
  const tvToMovie: Record<number, number> = {
    10759: 28,
    10765: 878,
  };
  const targetGenres = targetType === "movie" ? GENRES : SERIES_GENRES;
  const mapped = sourceType === "movie" ? movieToTv[genreId] : tvToMovie[genreId];
  if (mapped) return mapped;
  return targetGenres.some((genre) => genre.id === genreId) ? genreId : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
