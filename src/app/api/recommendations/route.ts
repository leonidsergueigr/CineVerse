import { NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import { buildPersonalizedRecommendations } from "@/lib/recommendations";
import { getDislikes, getLikes } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const profileId = await getActiveProfileId();
  const result = await buildPersonalizedRecommendations(
    getLikes(profileId),
    getDislikes(profileId),
  );
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
