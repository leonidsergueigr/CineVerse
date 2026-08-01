import { NextRequest, NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import {
  heartbeatWatchSession,
  interruptWatchSession,
  manuallyCompleteWatchSession,
  startWatchSession,
  unmarkWatchSession,
  type WatchHeartbeat,
  type WatchSessionIdentity,
} from "@/lib/watch-session-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json(
      { error: "Selectionnez un profil." },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "interrupt") {
      return NextResponse.json({
        ok: true,
        interrupted: interruptWatchSession(profileId, String(body.sessionId ?? "")),
      });
    }

    const identity = parseIdentity(body);
    const snapshot =
      action === "start"
        ? startWatchSession(profileId, identity)
        : action === "heartbeat" || action === "heartbeat-interrupt"
          ? heartbeatWatchSession(profileId, {
              ...identity,
              sentAt: finiteNumber(body.sentAt) ?? Date.now(),
              documentVisible: body.documentVisible === true,
              playbackState: isPlaybackState(body.playbackState)
                ? body.playbackState
                : "unknown",
              providerProgressSeconds: finiteNumber(body.providerProgressSeconds),
              providerProgressPercent: finiteNumber(body.providerProgressPercent),
              providerWatchedSeconds: finiteNumber(body.providerWatchedSeconds),
              providerSeeking: body.providerSeeking === true,
              providerEnded: body.providerEnded === true,
              providerObserverSessionId:
                typeof body.providerObserverSessionId === "string"
                  ? body.providerObserverSessionId
                  : null,
              providerObserverSequence: finiteNumber(
                body.providerObserverSequence,
              ),
              trackingMethod: isTrackingMethod(body.trackingMethod)
                ? body.trackingMethod
                : "local-estimate",
              heartbeatId: String(body.heartbeatId ?? ""),
              providerEventName: String(body.providerEventName ?? ""),
              providerBufferingCount: finiteNumber(body.providerBufferingCount),
              providerBufferingSeconds: finiteNumber(body.providerBufferingSeconds),
              providerSeekCount: finiteNumber(body.providerSeekCount),
              providerStartupMilliseconds: finiteNumber(
                body.providerStartupMilliseconds,
              ),
              providerVideoHeight: finiteNumber(body.providerVideoHeight),
              providerError: body.providerError === true,
              providerErrorCount: finiteNumber(body.providerErrorCount),
            } satisfies WatchHeartbeat)
          : action === "manual-complete"
            ? manuallyCompleteWatchSession(profileId, identity)
            : action === "unmark"
              ? unmarkWatchSession(profileId, identity)
              : null;

    if (!snapshot) {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }
    if (action === "heartbeat-interrupt") {
      interruptWatchSession(profileId, identity.sessionId);
    }
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suivi impossible.";
    const status = /introuvable/.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

function parseIdentity(body: Record<string, unknown>): WatchSessionIdentity {
  if (body.mediaType !== "movie" && body.mediaType !== "tv") {
    throw new Error("Type de contenu invalide.");
  }
  return {
    sessionId: String(body.sessionId ?? ""),
    tmdbId: Number(body.tmdbId),
    mediaType: body.mediaType,
    seasonNumber: finiteNumber(body.seasonNumber),
    episodeNumber: finiteNumber(body.episodeNumber),
    title: String(body.title ?? "Sans titre"),
    posterPath: typeof body.posterPath === "string" ? body.posterPath : null,
    backdropPath:
      typeof body.backdropPath === "string" ? body.backdropPath : null,
    providerId: String(body.providerId ?? ""),
    audioLanguage: String(body.audioLanguage ?? ""),
    officialRuntimeSeconds: finiteNumber(body.officialRuntimeSeconds),
    genreIds: Array.isArray(body.genreIds)
      ? body.genreIds.map(Number).filter(Number.isFinite)
      : [],
    timezoneOffsetMinutes: finiteNumber(body.timezoneOffsetMinutes) ?? 0,
    seriesEpisodeCounts: Array.isArray(body.seriesEpisodeCounts)
      ? (body.seriesEpisodeCounts as WatchSessionIdentity["seriesEpisodeCounts"])
      : [],
  };
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function isPlaybackState(
  value: unknown,
): value is "playing" | "paused" | "buffering" | "unknown" {
  return (
    value === "playing" ||
    value === "paused" ||
    value === "buffering" ||
    value === "unknown"
  );
}

function isTrackingMethod(
  value: unknown,
): value is "browser-extension" | "provider-message" | "local-estimate" {
  return (
    value === "browser-extension" ||
    value === "provider-message" ||
    value === "local-estimate"
  );
}
