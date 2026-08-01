import { NextRequest, NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import {
  markRecommendationImpression,
  recordRecommendationImpressions,
} from "@/lib/store";
import type {
  MediaType,
  RecommendationImpression,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const profileId = await getActiveProfileId();
  if (!profileId) return profileRequired();
  const body = await request.json();
  const impressions: RecommendationImpression[] = Array.isArray(body.items)
    ? body.items.flatMap((item: unknown) => {
        const impression = normalizeImpression(item);
        return impression ? [impression] : [];
      })
    : [];
  const inserted = recordRecommendationImpressions(
    profileId,
    String(body.sessionId ?? ""),
    impressions,
  );
  return NextResponse.json({ ok: true, inserted });
}

export async function PATCH(request: NextRequest) {
  const profileId = await getActiveProfileId();
  if (!profileId) return profileRequired();
  const body = await request.json();
  const mediaType = body.mediaType as MediaType;
  const tmdbId = Number(body.tmdbId);
  const action = String(body.action ?? "");
  if (
    !Number.isFinite(tmdbId) ||
    (mediaType !== "movie" && mediaType !== "tv") ||
    !["clicked", "played", "completed", "dismissed"].includes(action)
  ) {
    return NextResponse.json(
      { error: "Impression invalide." },
      { status: 400 },
    );
  }
  const updated = markRecommendationImpression(profileId, {
    sessionId: String(body.sessionId ?? ""),
    tmdbId,
    mediaType,
    action: action as "clicked" | "played" | "completed" | "dismissed",
    shelfType: String(body.shelfType ?? ""),
  });
  return NextResponse.json({ ok: true, updated });
}

function normalizeImpression(
  value: unknown,
): RecommendationImpression | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const tmdbId = Number(item.tmdbId);
  const mediaType = item.mediaType;
  const shelfType = String(item.shelfType ?? "");
  if (
    !Number.isFinite(tmdbId) ||
    (mediaType !== "movie" && mediaType !== "tv") ||
    !shelfType
  ) {
    return null;
  }
  return {
    tmdbId,
    mediaType,
    shelfType,
    position: Number(item.position) || 0,
    score: Number.isFinite(Number(item.score)) ? Number(item.score) : undefined,
  };
}

function profileRequired() {
  return NextResponse.json(
    { error: "Selectionnez un profil." },
    { status: 401 },
  );
}
