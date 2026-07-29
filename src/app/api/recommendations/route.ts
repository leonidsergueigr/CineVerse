import { NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import { buildPersonalizedRecommendations } from "@/lib/recommendations";
import { getDislikes, getLikes } from "@/lib/store";

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
    getLikes(profileId),
    getDislikes(profileId),
  );
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
