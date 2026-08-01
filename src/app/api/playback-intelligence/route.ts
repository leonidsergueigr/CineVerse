import { NextRequest, NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import {
  getLearnedPlaybackSegments,
  recordPlaybackObservation,
  updateLearnedPlaybackSegment,
} from "@/lib/playback-intelligence";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Selectionnez un profil." }, { status: 401 });
  }
  const tmdbId = Number(request.nextUrl.searchParams.get("tmdbId"));
  const seasonNumber = Number(request.nextUrl.searchParams.get("season"));
  if (!positiveInteger(tmdbId) || !positiveInteger(seasonNumber)) {
    return NextResponse.json({ error: "Parametres invalides." }, { status: 400 });
  }
  return NextResponse.json({
    segments: getLearnedPlaybackSegments(profileId, tmdbId, seasonNumber),
  });
}

export async function POST(request: NextRequest) {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Selectionnez un profil." }, { status: 401 });
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.observationType !== "intro" && body.observationType !== "credits") {
      throw new Error("Type d'observation invalide.");
    }
    const segments = recordPlaybackObservation(profileId, {
      sessionId: String(body.sessionId ?? ""),
      tmdbId: Number(body.tmdbId),
      seasonNumber: Number(body.seasonNumber),
      episodeNumber: Number(body.episodeNumber),
      observationType: body.observationType,
      fromSeconds: Number(body.fromSeconds),
      toSeconds: Number(body.toSeconds),
      durationSeconds: Number(body.durationSeconds),
      observedAt: Number(body.observedAt) || Date.now(),
    });
    return NextResponse.json({ ok: true, segments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Observation invalide." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Selectionnez un profil." }, { status: 401 });
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.segmentType !== "intro" && body.segmentType !== "credits") {
      throw new Error("Type de segment invalide.");
    }
    const segments = updateLearnedPlaybackSegment(profileId, {
      tmdbId: Number(body.tmdbId),
      seasonNumber: Number(body.seasonNumber),
      segmentType: body.segmentType,
      disabled: typeof body.disabled === "boolean" ? body.disabled : undefined,
      startSeconds: finiteOptional(body.startSeconds),
      endSeconds: finiteOptional(body.endSeconds),
      remainingSeconds: finiteOptional(body.remainingSeconds),
    });
    return NextResponse.json({ ok: true, segments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Segment invalide." },
      { status: 400 },
    );
  }
}

function positiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}

function finiteOptional(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
