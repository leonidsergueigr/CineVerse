import { notFound } from "next/navigation";
import { WatchExperience } from "@/components/watch-experience";
import { getEmbedProviders } from "@/lib/providers";
import { getProgress } from "@/lib/store";
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

  const season = mediaType === "tv" ? Number(query.season ?? 1) : null;
  const episode = mediaType === "tv" ? Number(query.episode ?? 1) : null;
  const detail = await getDetails(mediaType, id);
  const progress = getProgress(id, mediaType, season, episode);

  return (
    <WatchExperience
      detail={detail}
      providers={getEmbedProviders()}
      initialProgress={progress}
      initialSeason={season}
      initialEpisode={episode}
    />
  );
}
