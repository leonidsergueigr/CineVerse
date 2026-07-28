import { notFound } from "next/navigation";
import { WatchExperience } from "@/components/watch-experience";
import {
  applyProviderMetadata,
  resolveProvidersForMedia,
} from "@/lib/provider-availability";
import { getEmbedProviders } from "@/lib/providers";
import { getProgress, hasDislike, hasLike } from "@/lib/store";
import { getDetails } from "@/lib/tmdb";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ mediaType: string; id: string }>;
  searchParams: Promise<{ season?: string; episode?: string }>;
};

export default async function WatchPage({ params, searchParams }: PageProps) {
  const route = await params;
  const query = await searchParams;
  if (route.mediaType !== "movie" && route.mediaType !== "tv") notFound();

  const mediaType = route.mediaType as MediaType;
  const id = Number(route.id);
  if (!Number.isFinite(id)) notFound();

  const requestedSeason = mediaType === "tv" ? Number(query.season ?? 1) : null;
  const requestedEpisode = mediaType === "tv" ? Number(query.episode ?? 1) : null;
  const configuredProviders = getEmbedProviders();
  const [tmdbDetail, providerResolution] = await Promise.all([
    getDetails(mediaType, id),
    resolveProvidersForMedia(configuredProviders, id, mediaType),
  ]);
  const detail = applyProviderMetadata(tmdbDetail, providerResolution.mediaInfo);
  const availableSeasons = (detail.seasons ?? []).filter(
    (item) => item.episodeCount > 0,
  );
  const selectedSeason =
    availableSeasons.find((item) => item.seasonNumber === requestedSeason) ??
    availableSeasons[0];
  const season = mediaType === "tv" ? selectedSeason?.seasonNumber ?? 1 : null;
  const maxEpisode = selectedSeason?.episodeCount ?? 1;
  const episode =
    mediaType === "tv"
      ? Math.min(maxEpisode, Math.max(1, requestedEpisode || 1))
      : null;
  const progress = getProgress(id, mediaType, season, episode);

  return (
    <WatchExperience
      detail={detail}
      providers={providerResolution.providers}
      initialProgress={progress}
      initialLiked={hasLike(id, mediaType)}
      initialDisliked={hasDislike(id, mediaType)}
      initialSeason={season}
      initialEpisode={episode}
    />
  );
}
