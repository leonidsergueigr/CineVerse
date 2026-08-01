import { NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import { getSeriesProgressSummary } from "@/lib/store";
import { getSeasonEpisodes } from "@/lib/tmdb";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tmdbId = Number(url.searchParams.get("tmdbId"));
  const season = Number(url.searchParams.get("season"));
  const episode = Number(url.searchParams.get("episode"));
  const totalEpisodes = Number(url.searchParams.get("totalEpisodes"));

  if (
    !Number.isInteger(tmdbId) ||
    !Number.isInteger(season) ||
    !Number.isInteger(episode) ||
    tmdbId <= 0 ||
    season <= 0 ||
    episode <= 0
  ) {
    return NextResponse.json({ error: "Parametres invalides" }, { status: 400 });
  }

  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json(
      { error: "Selectionnez un profil." },
      { status: 401 },
    );
  }
  const [episodes, seriesProgress] = await Promise.all([
    getSeasonEpisodes(tmdbId, season),
    Promise.resolve(
      getSeriesProgressSummary(
        profileId,
        tmdbId,
        season,
        Number.isInteger(totalEpisodes) ? Math.max(0, totalEpisodes) : 0,
      ),
    ),
  ]);
  const episodeInfo =
    episodes.find((item) => item.episodeNumber === episode) ?? null;

  return NextResponse.json({ episodeInfo, episodes, seriesProgress });
}
