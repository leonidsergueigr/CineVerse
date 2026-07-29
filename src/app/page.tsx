import { redirect } from "next/navigation";
import { CineVerseHome } from "@/components/cineverse-home";
import { getActiveProfileId } from "@/lib/active-profile";
import { buildPersonalizedRecommendations } from "@/lib/recommendations";
import { getContinueWatching, getDislikes, getLikes } from "@/lib/store";
import { getCatalogItemsByIds, getHomeCatalog } from "@/lib/tmdb";
import type { CatalogItem, WatchProgress } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const profileId = await getActiveProfileId();
  if (!profileId) redirect("/profiles?next=%2F");
  const progress = getContinueWatching(profileId);
  const likes = getLikes(profileId);
  const dislikes = getDislikes(profileId);
  const [catalog, refreshedItems, recommendations] = await Promise.all([
    getHomeCatalog(),
    getCatalogItemsByIds(
      progress.map((item) => ({ id: item.tmdbId, mediaType: item.mediaType })),
    ),
    buildPersonalizedRecommendations(likes, dislikes),
  ]);
  const continueWatching = progress.map((item, index) => ({
    ...(refreshedItems[index] ?? progressToCatalogItem(item)),
    resume: {
      seasonNumber: item.seasonNumber,
      episodeNumber: item.episodeNumber,
      progressSeconds: item.progressSeconds,
      durationSeconds: item.durationSeconds,
    },
  }));

  return (
    <CineVerseHome
      catalog={catalog}
      continueWatching={continueWatching}
      initialLikedKeys={likes.map((like) => `${like.mediaType}-${like.tmdbId}`)}
      initialDislikedKeys={dislikes.map(
        (item) => `${item.mediaType}-${item.tmdbId}`,
      )}
      initialRecommendations={recommendations}
    />
  );
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
