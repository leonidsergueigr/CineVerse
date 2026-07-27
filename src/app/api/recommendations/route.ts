import { NextResponse } from "next/server";
import { getLikes } from "@/lib/store";
import { discover, getRecommendations } from "@/lib/tmdb";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const likes = getLikes(6) as Array<{ tmdbId: number; mediaType: MediaType }>;
  if (likes[0]) {
    const items = await getRecommendations(likes[0].mediaType, likes[0].tmdbId);
    return NextResponse.json({ items, strategy: "likes" });
  }

  const items = await discover({ mediaType: "movie", minRating: "7.5" });
  return NextResponse.json({ items, strategy: "popular" });
}
