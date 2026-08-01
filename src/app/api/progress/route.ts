import { NextRequest, NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import {
  getContinueWatching,
  getProgress,
  recordViewingEvent,
  saveProgress,
} from "@/lib/store";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const profileId = await getActiveProfileId();
  if (!profileId) return profileRequired();
  const search = request.nextUrl.searchParams;
  const tmdbId = Number(search.get("tmdbId"));
  const mediaType = search.get("mediaType") as MediaType | null;

  if (tmdbId && isMediaType(mediaType)) {
    const season = nullableNumber(search.get("season"));
    const episode = nullableNumber(search.get("episode"));
    return NextResponse.json({
      progress: getProgress(profileId, tmdbId, mediaType, season, episode),
    });
  }

  return NextResponse.json({ items: getContinueWatching(profileId) });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!isMediaType(body.mediaType) || !Number.isFinite(Number(body.tmdbId))) {
    return NextResponse.json({ error: "Invalid media payload" }, { status: 400 });
  }

  const profileId = await getActiveProfileId();
  if (!profileId) return profileRequired();
  const progress = saveProgress(profileId, {
    tmdbId: Number(body.tmdbId),
    mediaType: body.mediaType,
    seasonNumber: nullableNumber(body.seasonNumber),
    episodeNumber: nullableNumber(body.episodeNumber),
    title: String(body.title ?? "Sans titre"),
    posterPath: body.posterPath ?? null,
    backdropPath: body.backdropPath ?? null,
    progressSeconds: Math.max(0, Math.floor(Number(body.progressSeconds) || 0)),
    durationSeconds: Math.max(0, Math.floor(Number(body.durationSeconds) || 0)),
    completed:
      typeof body.completed === "boolean" ? body.completed : undefined,
    seriesEpisodeCounts: Array.isArray(body.seriesEpisodeCounts)
      ? body.seriesEpisodeCounts
      : [],
  });
  const eventType = progress.newlyCompleted
    ? "COMPLETED"
    : body.eventType === "PLAY_STARTED"
      ? "PLAY_STARTED"
      : body.eventType === "PROGRESS_UPDATED"
        ? "PROGRESS_UPDATED"
        : null;
  if (eventType) {
    recordViewingEvent(profileId, {
      eventType,
      tmdbId: Number(body.tmdbId),
      mediaType: body.mediaType,
      title: String(body.title ?? "Sans titre"),
      posterPath: body.posterPath ?? null,
      seasonNumber: nullableNumber(body.seasonNumber),
      episodeNumber: nullableNumber(body.episodeNumber),
      positionSeconds: Math.max(
        0,
        Math.floor(Number(body.progressSeconds) || 0),
      ),
      durationSeconds: Math.max(
        0,
        Math.floor(Number(body.durationSeconds) || 0),
      ),
      audioLanguage: String(body.audioLanguage ?? ""),
      subtitleLanguage:
        typeof body.subtitleLanguage === "string"
          ? body.subtitleLanguage
          : null,
      provider: String(body.provider ?? ""),
      sessionId: String(body.sessionId ?? ""),
      genreIds: Array.isArray(body.genreIds)
        ? body.genreIds.map(Number).filter(Number.isFinite)
        : [],
      timezoneOffsetMinutes: Number(body.timezoneOffsetMinutes) || 0,
    });
  }

  return NextResponse.json({ ok: true, completed: progress.completed });
}

function profileRequired() {
  return NextResponse.json(
    { error: "Selectionnez un profil." },
    { status: 401 },
  );
}

function isMediaType(value: unknown): value is MediaType {
  return value === "movie" || value === "tv";
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
