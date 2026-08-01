import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { WatchExperience } from "@/components/watch-experience";
import { getActiveProfileId } from "@/lib/active-profile";
import {
  applyProviderMetadata,
  resolveProvidersForMedia,
} from "@/lib/provider-availability";
import { fstreamSourceAdapter } from "@/lib/fstream";
import { getEmbedProviders } from "@/lib/providers";
import {
  getLearnedPlaybackSegments,
  getPlaybackPreferences,
  rankProvidersForProfile,
} from "@/lib/playback-intelligence";
import { resolveStreamProviders } from "@/lib/stream-resolver";
import {
  getProgress,
  getSeriesProgressSummary,
  hasDislike,
  hasLike,
  hasWatchlist,
} from "@/lib/store";
import { getDetails, getSeasonEpisodes } from "@/lib/tmdb";
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
  const profileId = await getActiveProfileId();
  if (!profileId) {
    const watchQuery =
      route.mediaType === "tv"
        ? `?season=${encodeURIComponent(query.season ?? "1")}&episode=${encodeURIComponent(query.episode ?? "1")}`
        : "";
    const destination = `/watch/${route.mediaType}/${route.id}${watchQuery}`;
    redirect(`/profiles?next=${encodeURIComponent(destination)}`);
  }

  const requestedSeason = mediaType === "tv" ? Number(query.season ?? 1) : null;
  const requestedEpisode = mediaType === "tv" ? Number(query.episode ?? 1) : null;
  const configuredProviders = getEmbedProviders();
  const [tmdbDetail, providerResolution] = await Promise.all([
    getDetails(mediaType, id),
    resolveProvidersForMedia(configuredProviders, id, mediaType),
  ]);
  const detail = applyProviderMetadata(tmdbDetail, providerResolution.mediaInfo);
  const availableSeasons = (detail.seasons ?? []).filter(
    (item) => item.seasonNumber > 0 && item.episodeCount > 0,
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
  const sourceProviders = await resolveStreamProviders(
    [fstreamSourceAdapter],
    {
      detail,
      seasonNumber: season,
      episodeNumber: episode,
    },
  );
  const providers = rankProvidersForProfile(profileId, [
    ...providerResolution.providers,
    ...sourceProviders,
  ]);
  const progress = getProgress(profileId, id, mediaType, season, episode);
  const playbackPreferences = getPlaybackPreferences(profileId);
  const learnedPlaybackSegments =
    mediaType === "tv" && season !== null
      ? getLearnedPlaybackSegments(profileId, id, season)
      : [];
  const [seasonEpisodes, seriesProgress] =
    mediaType === "tv" && season !== null && episode !== null
      ? await Promise.all([
          getSeasonEpisodes(id, season),
          Promise.resolve(
            getSeriesProgressSummary(profileId, id, season, maxEpisode),
          ),
        ])
      : [null, null];
  const episodeInfo =
    seasonEpisodes?.find((item) => item.episodeNumber === episode) ?? null;

  return (
    <WatchExperience
      detail={detail}
      providers={providers}
      initialProgress={progress}
      initialLiked={hasLike(profileId, id, mediaType)}
      initialDisliked={hasDislike(profileId, id, mediaType)}
      initialWatchlisted={hasWatchlist(profileId, id, mediaType)}
      initialSeason={season}
      initialEpisode={episode}
      initialEpisodeInfo={episodeInfo}
      initialSeasonEpisodes={seasonEpisodes ?? []}
      initialSeriesProgress={seriesProgress}
      initialPlaybackPreferences={playbackPreferences}
      initialLearnedPlaybackSegments={learnedPlaybackSegments}
    />
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const route = await params;
  const query = await searchParams;
  if (route.mediaType !== "movie" && route.mediaType !== "tv") {
    return { title: "Lecture" };
  }
  const id = Number(route.id);
  if (!Number.isFinite(id)) return { title: "Lecture" };

  try {
    const detail = await getDetails(route.mediaType, id);
    const episode =
      route.mediaType === "tv"
        ? ` - S${Number(query.season ?? 1)} E${Number(query.episode ?? 1)}`
        : "";
    return { title: `${detail.title}${episode}` };
  } catch {
    return { title: "Lecture" };
  }
}
