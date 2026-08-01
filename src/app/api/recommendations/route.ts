import { NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import { buildPersonalizedRecommendations } from "@/lib/recommendations";
import {
  getDislikes,
  getRecommendationExposures,
  getRecommendationLikes,
  getWatchlist,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json(
      { error: "Selectionnez un profil." },
      { status: 401 },
    );
  }
  const result = await buildPersonalizedRecommendations(
    getRecommendationLikes(profileId),
    getDislikes(profileId),
    getRecommendationExposures(profileId),
    getWatchlist(profileId),
  );
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
