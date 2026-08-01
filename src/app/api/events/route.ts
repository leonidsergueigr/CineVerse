import { NextRequest, NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import { recordViewingEvent } from "@/lib/store";
import type { MediaType, ViewingEventType } from "@/lib/types";

export const dynamic = "force-dynamic";

const EVENT_TYPES: ViewingEventType[] = [
  "VIEW_DETAILS",
  "PLAY_STARTED",
  "PROGRESS_UPDATED",
  "PAUSED",
  "COMPLETED",
  "ABANDONED",
  "WATCHLIST_ADDED",
  "RATED",
  "RECOMMENDATION_CLICKED",
  "SEARCHED",
  "FILTER_APPLIED",
];

export async function POST(request: NextRequest) {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json(
      { error: "Selectionnez un profil." },
      { status: 401 },
    );
  }

  const body = await request.json();
  if (!isEventType(body.eventType)) {
    return NextResponse.json(
      { error: "Type d'evenement invalide." },
      { status: 400 },
    );
  }
  const mediaType = isMediaType(body.mediaType) ? body.mediaType : null;
  const tmdbId = nullableNumber(body.tmdbId);
  if (
    ["VIEW_DETAILS", "PLAY_STARTED", "PROGRESS_UPDATED", "COMPLETED"].includes(
      body.eventType,
    ) &&
    (!mediaType || tmdbId === null)
  ) {
    return NextResponse.json(
      { error: "Contenu manquant pour cet evenement." },
      { status: 400 },
    );
  }

  recordViewingEvent(profileId, {
    eventType: body.eventType,
    tmdbId,
    mediaType,
    title: String(body.title ?? ""),
    posterPath: typeof body.posterPath === "string" ? body.posterPath : null,
    seasonNumber: nullableNumber(body.seasonNumber),
    episodeNumber: nullableNumber(body.episodeNumber),
    positionSeconds: Number(body.positionSeconds) || 0,
    durationSeconds: Number(body.durationSeconds) || 0,
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
    metadata:
      body.metadata && typeof body.metadata === "object"
        ? body.metadata
        : {},
  });

  return NextResponse.json({ ok: true });
}

function isEventType(value: unknown): value is ViewingEventType {
  return EVENT_TYPES.includes(value as ViewingEventType);
}

function isMediaType(value: unknown): value is MediaType {
  return value === "movie" || value === "tv";
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
