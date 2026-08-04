import { NextRequest, NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import {
  importLegacyTitleHistory,
  setRecommendationSuppression,
} from "@/lib/store";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json(
      { error: "Selectionnez un profil." },
      { status: 401 },
    );
  }
  const body = await request.json();
  const tmdbId = Math.floor(Number(body.tmdbId));
  const mediaType = body.mediaType as MediaType;
  const action = String(body.action ?? "");
  if (
    !Number.isFinite(tmdbId) ||
    tmdbId <= 0 ||
    (mediaType !== "movie" && mediaType !== "tv") ||
    !["seen", "not-now", "never"].includes(action)
  ) {
    return NextResponse.json({ error: "Feedback invalide." }, { status: 400 });
  }

  if (action === "seen") {
    const seasonNumber = nullablePositiveInteger(body.seasonNumber);
    const episodeNumber = nullablePositiveInteger(body.episodeNumber);
    if (mediaType === "tv" && (!seasonNumber || !episodeNumber)) {
      return NextResponse.json(
        { error: "Selectionnez les episodes deja vus." },
        { status: 400 },
      );
    }
    importLegacyTitleHistory(profileId, {
      tmdbId,
      mediaType,
      seasonNumber,
      episodeNumber,
      title: String(body.title ?? "Sans titre"),
      posterPath: body.posterPath ?? null,
      backdropPath: body.backdropPath ?? null,
      seriesEpisodeCounts: Array.isArray(body.seriesEpisodeCounts)
        ? body.seriesEpisodeCounts
        : [],
    });
    return NextResponse.json({ ok: true, action });
  }

  const suppression = setRecommendationSuppression(profileId, {
    tmdbId,
    mediaType,
    reason: action as "not-now" | "never",
  });
  return NextResponse.json({ ok: true, action, suppression });
}

function nullablePositiveInteger(value: unknown) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : null;
}
