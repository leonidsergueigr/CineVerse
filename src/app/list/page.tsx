import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SavedListExperience } from "@/components/saved-list-experience";
import { getActiveProfileId } from "@/lib/active-profile";
import { getWatchlist } from "@/lib/store";
import { getCatalogItemsByIds } from "@/lib/tmdb";
import type { CatalogItem, WatchlistRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ma liste",
};

export default async function SavedListPage() {
  const profileId = await getActiveProfileId();
  if (!profileId) redirect("/profiles?next=%2Flist");

  const records = getWatchlist(profileId);
  const refreshed = await getCatalogItemsByIds(
    records.map((item) => ({
      id: item.tmdbId,
      mediaType: item.mediaType,
    })),
  );
  const items = records.map(
    (record, index) => refreshed[index] ?? watchlistToCatalogItem(record),
  );

  return <SavedListExperience initialItems={items} />;
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
