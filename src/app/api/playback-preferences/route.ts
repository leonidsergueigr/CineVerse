import { NextRequest, NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import {
  getPlaybackPreferences,
  updatePlaybackPreferences,
} from "@/lib/playback-intelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Selectionnez un profil." }, { status: 401 });
  }
  return NextResponse.json({ preferences: getPlaybackPreferences(profileId) });
}

export async function PATCH(request: NextRequest) {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Selectionnez un profil." }, { status: 401 });
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const preferences = updatePlaybackPreferences(profileId, {
      autoNextEnabled:
        typeof body.autoNextEnabled === "boolean"
          ? body.autoNextEnabled
          : undefined,
      bingeLimitEpisodes:
        body.bingeLimitEpisodes === undefined
          ? undefined
          : Number(body.bingeLimitEpisodes),
      introSkipEnabled:
        typeof body.introSkipEnabled === "boolean"
          ? body.introSkipEnabled
          : undefined,
      sessionSummaryEnabled:
        typeof body.sessionSummaryEnabled === "boolean"
          ? body.sessionSummaryEnabled
          : undefined,
    });
    return NextResponse.json({ ok: true, preferences });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preferences invalides." },
      { status: 400 },
    );
  }
}
