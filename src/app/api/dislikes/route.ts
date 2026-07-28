import { NextRequest, NextResponse } from "next/server";
import { getDislikes, setDislike } from "@/lib/store";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ items: getDislikes() });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!isMediaType(body.mediaType) || !Number.isFinite(Number(body.tmdbId))) {
    return NextResponse.json({ error: "Invalid dislike payload" }, { status: 400 });
  }

  setDislike({
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

function isMediaType(value: unknown): value is MediaType {
  return value === "movie" || value === "tv";
}
