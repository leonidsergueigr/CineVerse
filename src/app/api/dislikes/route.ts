import { NextRequest, NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import { getDislikes, setDislike } from "@/lib/store";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const profileId = await getActiveProfileId();
  if (!profileId) return profileRequired();
  return NextResponse.json({ items: getDislikes(profileId) });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!isMediaType(body.mediaType) || !Number.isFinite(Number(body.tmdbId))) {
    return NextResponse.json({ error: "Invalid dislike payload" }, { status: 400 });
  }

  const profileId = await getActiveProfileId();
  if (!profileId) return profileRequired();
  setDislike(profileId, {
    tmdbId: Number(body.tmdbId),
    mediaType: body.mediaType,
    title: String(body.title ?? "Sans titre"),
    posterPath: body.posterPath ?? null,
    backdropPath: body.backdropPath ?? null,
    genreIds: Array.isArray(body.genreIds) ? body.genreIds.map(Number) : [],
    originalLanguage: String(body.originalLanguage ?? ""),
    disliked: Boolean(body.disliked),
  });

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
