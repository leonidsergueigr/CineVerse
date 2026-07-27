import { NextRequest, NextResponse } from "next/server";
import { getLikes, setLike } from "@/lib/store";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ items: getLikes() });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!isMediaType(body.mediaType) || !Number.isFinite(Number(body.tmdbId))) {
    return NextResponse.json({ error: "Invalid like payload" }, { status: 400 });
  }

  setLike({
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
