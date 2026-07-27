import { NextRequest, NextResponse } from "next/server";
import { getContinueWatching, getProgress, saveProgress } from "@/lib/store";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const tmdbId = Number(search.get("tmdbId"));
  const mediaType = search.get("mediaType") as MediaType | null;

  if (tmdbId && isMediaType(mediaType)) {
    const season = nullableNumber(search.get("season"));
    const episode = nullableNumber(search.get("episode"));
    return NextResponse.json({
      progress: getProgress(tmdbId, mediaType, season, episode),
    });
  }

  return NextResponse.json({ items: getContinueWatching() });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!isMediaType(body.mediaType) || !Number.isFinite(Number(body.tmdbId))) {
    return NextResponse.json({ error: "Invalid media payload" }, { status: 400 });
  }

  saveProgress({
    tmdbId: Number(body.tmdbId),
    mediaType: body.mediaType,
    seasonNumber: nullableNumber(body.seasonNumber),
    episodeNumber: nullableNumber(body.episodeNumber),
    title: String(body.title ?? "Sans titre"),
    posterPath: body.posterPath ?? null,
    backdropPath: body.backdropPath ?? null,
    progressSeconds: Math.max(0, Math.floor(Number(body.progressSeconds) || 0)),
    durationSeconds: Math.max(0, Math.floor(Number(body.durationSeconds) || 0)),
  });

  return NextResponse.json({ ok: true });
}

function isMediaType(value: unknown): value is MediaType {
  return value === "movie" || value === "tv";
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
