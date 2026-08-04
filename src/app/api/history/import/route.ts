import { NextRequest, NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import {
  buildHistoryImportEpisodes,
  historyImportSummary,
  type HistoryImportMode,
} from "@/lib/history-import";
import { getSeriesProgressSummary, importWatchHistory } from "@/lib/store";
import { getDetails } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

const IMPORT_MODES = new Set<HistoryImportMode>([
  "previous-episodes",
  "current-season",
  "previous-seasons",
  "whole-series",
  "selected",
]);

export async function POST(request: NextRequest) {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json(
      { error: "Selectionnez un profil." },
      { status: 401 },
    );
  }

  const body = await request.json();
  const tmdbId = Math.floor(Number(body.tmdbId));
  const mode = String(body.mode ?? "") as HistoryImportMode;
  const currentSeason = Math.floor(Number(body.currentSeason));
  const currentEpisode = Math.floor(Number(body.currentEpisode));
  if (
    !Number.isFinite(tmdbId) ||
    tmdbId <= 0 ||
    !IMPORT_MODES.has(mode) ||
    !Number.isFinite(currentSeason) ||
    !Number.isFinite(currentEpisode)
  ) {
    return NextResponse.json({ error: "Import invalide." }, { status: 400 });
  }

  const detail = await getDetails("tv", tmdbId);
  const seasons = (detail.seasons ?? []).filter(
    (item) => item.seasonNumber > 0 && item.episodeCount > 0,
  );
  if (!seasons.length) {
    return NextResponse.json(
      { error: "Les episodes de cette serie sont indisponibles." },
      { status: 422 },
    );
  }
  const selectedEpisodes = Array.isArray(body.selectedEpisodes)
    ? body.selectedEpisodes.map((item: unknown) => {
        const value = item as Record<string, unknown>;
        return {
          seasonNumber: Number(value.seasonNumber),
          episodeNumber: Number(value.episodeNumber),
        };
      })
    : [];
  const episodes = buildHistoryImportEpisodes({
    mode,
    seasons,
    currentSeason,
    currentEpisode,
    selectedEpisodes,
  });
  if (!episodes.length) {
    return NextResponse.json(
      { error: "Aucun episode ne correspond a cette selection." },
      { status: 400 },
    );
  }
  const sentiment = ["liked", "neutral", "disliked"].includes(body.sentiment)
    ? (body.sentiment as "liked" | "neutral" | "disliked")
    : "neutral";
  const result = importWatchHistory(profileId, {
    tmdbId,
    title: detail.title,
    posterPath: detail.posterPath,
    backdropPath: detail.backdropPath,
    episodes,
    seriesEpisodeCounts: seasons,
    sentiment,
    genreIds: detail.genreIds,
    originalLanguage: detail.originalLanguage,
  });
  const selectedSeason = seasons.find(
    (item) => item.seasonNumber === currentSeason,
  );
  const seriesProgress = selectedSeason
    ? getSeriesProgressSummary(
        profileId,
        tmdbId,
        currentSeason,
        selectedSeason.episodeCount,
      )
    : null;

  return NextResponse.json({
    ok: true,
    ...result,
    ...historyImportSummary(episodes),
    seriesProgress,
  });
}
