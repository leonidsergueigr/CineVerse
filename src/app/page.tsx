import { redirect } from "next/navigation";
import { CineVerseHome } from "@/components/cineverse-home";
import { getActiveProfileId } from "@/lib/active-profile";
import { composeHomeProgramming } from "@/lib/home-programming";
import { buildPersonalizedRecommendations } from "@/lib/recommendations";
import {
  getContinueWatching,
  getDislikes,
  getLikes,
  getRecommendationExposures,
  getRecommendationLikes,
  getWatchlist,
} from "@/lib/store";
import {
  getCatalogItemsByIds,
  getHomeCatalog,
  getTrailerUrl,
} from "@/lib/tmdb";
import type {
  CatalogItem,
  WatchProgress,
  WatchlistRecord,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const profileId = await getActiveProfileId();
  if (!profileId) redirect("/profiles?next=%2F");
  const progress = getContinueWatching(profileId);
  const likes = getLikes(profileId);
  const dislikes = getDislikes(profileId);
  const recommendationLikes = getRecommendationLikes(profileId);
  const exposures = getRecommendationExposures(profileId);
  const watchlist = getWatchlist(profileId);
  const profileItemRequests = [
    ...progress.map((item) => ({
      id: item.tmdbId,
      mediaType: item.mediaType,
    })),
    ...watchlist.map((item) => ({
      id: item.tmdbId,
      mediaType: item.mediaType,
    })),
  ];
  const [catalog, refreshedProfileItems, recommendations] = await Promise.all([
    getHomeCatalog(),
    getCatalogItemsByIds(profileItemRequests),
    buildPersonalizedRecommendations(
      recommendationLikes,
      dislikes,
      exposures,
      watchlist,
    ),
  ]);
  const refreshedItems = new Map<string, CatalogItem>();
  profileItemRequests.forEach((request, index) => {
    const item = refreshedProfileItems[index];
    if (item) refreshedItems.set(`${request.mediaType}:${request.id}`, item);
  });
  const continueWatching = progress.map((item) => ({
    ...(refreshedItems.get(`${item.mediaType}:${item.tmdbId}`) ??
      progressToCatalogItem(item)),
    resume: {
      seasonNumber: item.seasonNumber,
      episodeNumber: item.episodeNumber,
      progressSeconds: item.progressSeconds,
      durationSeconds: item.durationSeconds,
    },
  }));
  const savedItems = watchlist.map(
    (item) =>
      refreshedItems.get(`${item.mediaType}:${item.tmdbId}`) ??
      watchlistToCatalogItem(item),
  );

  let programmedCatalog = composeHomeProgramming({
    catalog,
    continueWatching,
    watchlist: savedItems,
    recommendations,
    exposures,
  });
  if (!programmedCatalog.heroTrailerUrl) {
    programmedCatalog = {
      ...programmedCatalog,
      heroTrailerUrl: await getTrailerUrl(
        programmedCatalog.hero.mediaType,
        programmedCatalog.hero.id,
      ),
    };
  }

  return (
    <CineVerseHome
      catalog={programmedCatalog}
      initialLikedKeys={likes.map((like) => `${like.mediaType}-${like.tmdbId}`)}
      initialDislikedKeys={dislikes.map(
        (item) => `${item.mediaType}-${item.tmdbId}`,
      )}
      initialRecommendations={recommendations}
    />
  );
}

function watchlistToCatalogItem(item: WatchlistRecord): CatalogItem {
  return {
    id: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    overview: "",
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    posterUrl: item.posterPath
      ? `https://image.tmdb.org/t/p/w342${item.posterPath}`
      : null,
    backdropUrl: item.backdropPath
      ? `https://image.tmdb.org/t/p/w1280${item.backdropPath}`
      : null,
    releaseDate: null,
    voteAverage: 0,
    voteCount: 0,
    popularity: 0,
    genreIds: [],
    originalLanguage: "",
  };
}

function progressToCatalogItem(progress: WatchProgress): CatalogItem {
  return {
    id: progress.tmdbId,
    mediaType: progress.mediaType,
    title: progress.title,
    overview: "",
    posterPath: progress.posterPath,
    backdropPath: progress.backdropPath,
    posterUrl: progress.posterPath
      ? `https://image.tmdb.org/t/p/w342${progress.posterPath}`
      : null,
    backdropUrl: progress.backdropPath
      ? `https://image.tmdb.org/t/p/w1280${progress.backdropPath}`
      : null,
    releaseDate: null,
    voteAverage: 0,
    voteCount: 0,
    popularity: 0,
    genreIds: [],
    originalLanguage: "",
  };
}
