import { CineVerseHome } from "@/components/cineverse-home";
import { getContinueWatching } from "@/lib/store";
import { getCatalogItemsByIds, getHomeCatalog } from "@/lib/tmdb";
import type { CatalogItem, WatchProgress } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const progress = getContinueWatching();
  const [catalog, refreshedItems] = await Promise.all([
    getHomeCatalog(),
    getCatalogItemsByIds(
      progress.map((item) => ({ id: item.tmdbId, mediaType: item.mediaType })),
    ),
  ]);
  const continueWatching = progress.map(
    (item, index) => refreshedItems[index] ?? progressToCatalogItem(item),
  );

  return <CineVerseHome catalog={catalog} continueWatching={continueWatching} />;
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
