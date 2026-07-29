import { NextRequest, NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import { getLikes, setLike } from "@/lib/store";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const profileId = await getActiveProfileId();
  return NextResponse.json({ items: getLikes(profileId) });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!isMediaType(body.mediaType) || !Number.isFinite(Number(body.tmdbId))) {
    return NextResponse.json({ error: "Invalid like payload" }, { status: 400 });
  }

  const profileId = await getActiveProfileId();
  setLike(profileId, {
    tmdbId: Number(body.tmdbId),
    mediaType: body.mediaType,
    title: String(body.title ?? "Sans titre"),
    posterPath: body.posterPath ?? null,
    backdropPath: body.backdropPath ?? null,
    liked: Boolean(body.liked),
  });

  return NextResponse.json({ ok: true });
}

function isMediaType(value: unknown): value is MediaType {
  return value === "movie" || value === "tv";
}
