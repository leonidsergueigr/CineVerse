import { NextRequest, NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import {
  getWatchlist,
  recordViewingEvent,
  setWatchlist,
} from "@/lib/store";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const profileId = await getActiveProfileId();
  if (!profileId) return profileRequired();
  return NextResponse.json({ items: getWatchlist(profileId) });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!isMediaType(body.mediaType) || !Number.isFinite(Number(body.tmdbId))) {
    return NextResponse.json(
      { error: "Invalid watchlist payload" },
      { status: 400 },
    );
  }

  const profileId = await getActiveProfileId();
  if (!profileId) return profileRequired();
  const included = Boolean(body.included);
  setWatchlist(profileId, {
    tmdbId: Number(body.tmdbId),
    mediaType: body.mediaType,
    title: String(body.title ?? "Sans titre"),
    posterPath: body.posterPath ?? null,
    backdropPath: body.backdropPath ?? null,
    genreIds: Array.isArray(body.genreIds) ? body.genreIds.map(Number) : [],
    originalLanguage: String(body.originalLanguage ?? ""),
    included,
  });

  if (included) {
    recordViewingEvent(profileId, {
      eventType: "WATCHLIST_ADDED",
      tmdbId: Number(body.tmdbId),
      mediaType: body.mediaType,
      title: String(body.title ?? "Sans titre"),
      posterPath: body.posterPath ?? null,
      genreIds: Array.isArray(body.genreIds) ? body.genreIds.map(Number) : [],
      timezoneOffsetMinutes: Number(body.timezoneOffsetMinutes) || 0,
    });
  }

  return NextResponse.json({ ok: true });
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
