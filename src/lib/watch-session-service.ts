import "server-only";

import {
  getDb,
  getProgress,
  recordViewingEvent,
  saveProgress,
  unmarkProgress,
} from "@/lib/store";
import type { MediaType, WatchProgress } from "@/lib/types";
import {
  TRACKING_CONFIG,
  capEstimatedSeconds,
  evaluateCompletion,
  providerObservedDeltaSeconds,
  providerProgressDeltaSeconds,
  validHeartbeatIntervalSeconds,
  type CompletionSource,
  type PlaybackState,
  type TrackingConfidence,
  type TrackingMethod,
  type WatchSessionStatus,
} from "@/lib/watch-tracking";

export type WatchSessionIdentity = {
  sessionId: string;
  tmdbId: number;
  mediaType: MediaType;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  providerId?: string;
  audioLanguage?: string;
  officialRuntimeSeconds?: number | null;
  genreIds?: number[];
  timezoneOffsetMinutes?: number;
  seriesEpisodeCounts?: Array<{
    seasonNumber: number;
    episodeCount: number;
  }>;
};

export type WatchHeartbeat = WatchSessionIdentity & {
  sentAt: number;
  documentVisible: boolean;
  playbackState?: PlaybackState;
  providerProgressSeconds?: number | null;
  providerProgressPercent?: number | null;
  providerWatchedSeconds?: number | null;
  providerSeeking?: boolean;
  providerEnded?: boolean;
  providerObserverSessionId?: string | null;
  providerObserverSequence?: number | null;
  trackingMethod?: TrackingMethod;
  heartbeatId?: string;
};

export type WatchSessionSnapshot = {
  sessionId: string;
  status: WatchSessionStatus;
  completed: boolean;
  completionSource: CompletionSource;
  confidence: TrackingConfidence;
  providerWatchedSeconds: number;
  estimatedWatchedSeconds: number;
  credibleWatchedSeconds: number;
  progressSeconds: number;
  durationSeconds: number;
  manuallyMarkedWatched: boolean;
  trackingMethod: TrackingMethod;
};

type SessionRow = {
  id: string;
  profile_id: string;
  tmdb_id: number;
  media_type: MediaType;
  season_number: number | null;
  episode_number: number | null;
  started_at: number;
  last_heartbeat_at: number;
  last_client_timestamp: number;
  elapsed_seconds: number;
  visible_seconds: number;
  provider_watched_seconds: number;
  estimated_watched_seconds: number;
  official_runtime_seconds: number | null;
  provider_progress_seconds: number;
  provider_progress_percent: number | null;
  last_provider_observed_seconds: number;
  last_provider_observer_id: string;
  last_provider_observer_sequence: number;
  tracking_method: TrackingMethod;
  manually_marked_watched: 0 | 1;
  completed: 0 | 1;
  completion_source: CompletionSource;
  confidence: TrackingConfidence;
  status: WatchSessionStatus;
  last_document_visible: 0 | 1;
  last_playback_state: string;
};

export function startWatchSession(
  profileId: string,
  input: WatchSessionIdentity,
) {
  validateIdentity(input);
  const database = getDb();
  const existing = getSession(input.sessionId);
  if (existing && existing.profile_id !== profileId) {
    throw new Error("Cette session appartient a un autre profil.");
  }
  if (existing) return snapshot(existing, getProgressFor(input, profileId));

  const now = Date.now();
  const previous = getProgressFor(input, profileId);
  database.transaction(() => {
    database
      .prepare(
        `
        update watch_sessions set status = 'interrupted', ended_at = ?
        where profile_id = ? and status in ('active', 'paused')
          and last_heartbeat_at < ?
      `,
      )
      .run(
        now,
        profileId,
        now - 2 * TRACKING_CONFIG.maxHeartbeatGapSeconds * 1000,
      );
    database
      .prepare(
        `
        update watch_sessions set status = 'interrupted', ended_at = ?
        where profile_id = ? and status in ('active', 'paused')
          and tmdb_id = ? and media_type = ?
          and coalesce(season_number, -1) = coalesce(?, -1)
          and coalesce(episode_number, -1) = coalesce(?, -1)
      `,
      )
      .run(
        now,
        profileId,
        input.tmdbId,
        input.mediaType,
        nullableInteger(input.seasonNumber),
        nullableInteger(input.episodeNumber),
      );
    database
      .prepare(
        `
        insert into watch_sessions (
          id, profile_id, tmdb_id, media_type, series_id, season_number,
          episode_number, title, poster_path, provider_id, audio_language,
          started_at, last_heartbeat_at, last_client_timestamp,
          official_runtime_seconds, rewatch
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        normalizeSessionId(input.sessionId),
        profileId,
        input.tmdbId,
        input.mediaType,
        input.mediaType === "tv" ? input.tmdbId : null,
        nullableInteger(input.seasonNumber),
        nullableInteger(input.episodeNumber),
        input.title.slice(0, 180),
        input.posterPath ?? null,
        normalizeText(input.providerId, 80),
        normalizeText(input.audioLanguage, 24),
        now,
        now,
        0,
        positiveIntegerOrNull(input.officialRuntimeSeconds),
        previous?.completed ? 1 : 0,
      );

    saveProgress(profileId, {
      ...progressPayload(input),
      progressSeconds: previous?.completed
        ? 1
        : Math.max(1, previous?.progressSeconds ?? 0),
      durationSeconds:
        positiveIntegerOrNull(input.officialRuntimeSeconds) ??
        previous?.durationSeconds ??
        0,
    });
    recordViewingEvent(profileId, {
      ...eventPayload(input),
      eventType: "PLAY_STARTED",
      positionSeconds: previous?.completed ? 0 : previous?.progressSeconds ?? 0,
      durationSeconds: positiveIntegerOrNull(input.officialRuntimeSeconds) ?? 0,
      idempotencyKey: `${input.sessionId}:started`,
    });
  })();

  logTracking("watch_session_started", profileId, input, {
    confidence: "low",
    completionSource: "unknown",
  });
  return snapshot(getRequiredSession(input.sessionId), getProgressFor(input, profileId));
}

export function heartbeatWatchSession(
  profileId: string,
  input: WatchHeartbeat,
) {
  validateIdentity(input);
  let row = getRequiredOwnedSession(profileId, input.sessionId);
  const wasCompleted = Boolean(
    row.completed || getProgressFor(input, profileId)?.completed,
  );
  if (
    row.status === "interrupted" &&
    hasNewerActiveSession(profileId, row)
  ) {
    return snapshot(row, getProgressFor(input, profileId));
  }
  const clientTimestamp = positiveIntegerOrNull(input.sentAt) ?? 0;
  if (clientTimestamp && clientTimestamp <= row.last_client_timestamp) {
    return snapshot(row, getProgressFor(input, profileId));
  }
  const trackingMethod = normalizeTrackingMethod(input.trackingMethod);
  const observerSessionId = normalizeText(input.providerObserverSessionId, 96);
  const observerSequence = nonNegativeInteger(input.providerObserverSequence);
  if (
    trackingMethod === "browser-extension" &&
    observerSessionId &&
    observerSessionId === row.last_provider_observer_id &&
    observerSequence > 0 &&
    observerSequence <= row.last_provider_observer_sequence
  ) {
    return snapshot(row, getProgressFor(input, profileId));
  }

  const now = Date.now();
  const intervalSeconds = validHeartbeatIntervalSeconds({
    previousHeartbeatAt: row.last_heartbeat_at,
    heartbeatAt: now,
    previousDocumentVisible: Boolean(row.last_document_visible),
    previousPlaybackState: row.last_playback_state,
  });
  const hasFreshProviderProgress =
    trackingMethod === "browser-extension" ||
    trackingMethod === "provider-message" ||
    input.providerEnded === true ||
    nonNegativeInteger(input.providerProgressSeconds) > 0 ||
    nullableNumber(input.providerProgressPercent) !== undefined;
  const estimatedDelta = hasFreshProviderProgress ? 0 : intervalSeconds;
  const observerChanged = Boolean(
    observerSessionId && observerSessionId !== row.last_provider_observer_id,
  );
  const providerDelta = trackingMethod === "browser-extension"
    ? input.providerSeeking
      ? 0
      : providerObservedDeltaSeconds({
          previousObservedSeconds: observerChanged
            ? 0
            : row.last_provider_observed_seconds,
          observedSeconds: input.providerWatchedSeconds,
        })
    : input.providerSeeking
      ? 0
      : providerProgressDeltaSeconds({
          previousProgressSeconds: row.provider_progress_seconds,
          progressSeconds: input.providerProgressSeconds,
          intervalSeconds,
        });
  const officialRuntime =
    positiveIntegerOrNull(input.officialRuntimeSeconds) ??
    row.official_runtime_seconds;
  const estimatedTotal = capEstimatedSeconds(
    row.estimated_watched_seconds + estimatedDelta,
    officialRuntime,
  );
  const providerTotal = row.provider_watched_seconds + providerDelta;
  const progressSeconds = Math.max(
    row.provider_progress_seconds,
    nonNegativeInteger(input.providerProgressSeconds),
  );
  const previousTotals = aggregateContentSessions(profileId, input);
  const cumulativeEstimated = Math.max(
    0,
    previousTotals.estimatedSeconds - row.estimated_watched_seconds + estimatedTotal,
  );
  const cumulativeProgress = Math.max(
    previousTotals.providerProgressSeconds,
    progressSeconds,
  );
  const cumulativeProviderWatched = Math.max(
    0,
    previousTotals.providerSeconds - row.provider_watched_seconds + providerTotal,
  );
  const extensionProgressIsCredible =
    trackingMethod !== "browser-extension" ||
    input.providerEnded === true ||
    !officialRuntime ||
    cumulativeProviderWatched >=
      officialRuntime * TRACKING_CONFIG.hybridCompletionThreshold;
  const decision = evaluateCompletion({
    providerEnded: input.providerEnded === true,
    providerProgressSeconds: extensionProgressIsCredible
      ? cumulativeProgress
      : undefined,
    providerProgressPercent: extensionProgressIsCredible
      ? nullableNumber(input.providerProgressPercent)
      : undefined,
    estimatedWatchedSeconds: cumulativeEstimated,
    officialRuntimeSeconds: officialRuntime,
    manuallyMarkedWatched: Boolean(row.manually_marked_watched),
  });
  const status: WatchSessionStatus = decision.completed
    ? "completed"
    : input.playbackState === "paused" || input.playbackState === "buffering"
      ? "paused"
      : "active";
  const creditedProviderDelta = providerDelta;
  const creditedEstimatedDelta = providerDelta > 0 ? 0 : estimatedDelta;

  getDb().transaction(() => {
    getDb()
      .prepare(
        `
        update watch_sessions set
          last_heartbeat_at = @now,
          last_client_timestamp = @clientTimestamp,
          elapsed_seconds = elapsed_seconds + @intervalSeconds,
          visible_seconds = visible_seconds + @intervalSeconds,
          provider_watched_seconds = @providerTotal,
          estimated_watched_seconds = @estimatedTotal,
          official_runtime_seconds = coalesce(@officialRuntime, official_runtime_seconds),
          provider_progress_seconds = @progressSeconds,
          provider_progress_percent = coalesce(@providerProgressPercent, provider_progress_percent),
          last_provider_observed_seconds = case
            when @trackingMethod = 'browser-extension' then @providerObservedSeconds
            else last_provider_observed_seconds end,
          last_provider_observer_id = case
            when @trackingMethod = 'browser-extension' then @providerObserverSessionId
            else last_provider_observer_id end,
          last_provider_observer_sequence = case
            when @trackingMethod = 'browser-extension' then @providerObserverSequence
            else last_provider_observer_sequence end,
          tracking_method = @trackingMethod,
          completed = max(completed, @completed),
          completion_source = case when @completed = 1 then @completionSource else completion_source end,
          confidence = case when @completed = 1 then @confidence else confidence end,
          status = @status,
          ended_at = case when @completed = 1 then coalesce(ended_at, @now) else ended_at end,
          last_document_visible = @documentVisible,
          last_playback_state = @playbackState,
          provider_id = @providerId,
          audio_language = @audioLanguage
        where id = @sessionId and profile_id = @profileId
      `,
      )
      .run({
        now,
        clientTimestamp,
        intervalSeconds,
        estimatedDelta,
        providerTotal,
        estimatedTotal,
        officialRuntime,
        progressSeconds,
        providerProgressPercent: nullableNumber(input.providerProgressPercent),
        providerObservedSeconds: nonNegativeNumber(input.providerWatchedSeconds),
        providerObserverSessionId: observerSessionId,
        providerObserverSequence: observerSequence,
        trackingMethod,
        completed: decision.completed ? 1 : 0,
        completionSource: decision.completionSource,
        confidence: decision.confidence,
        status,
        documentVisible: input.documentVisible ? 1 : 0,
        playbackState: input.playbackState ?? "unknown",
        providerId: normalizeText(input.providerId, 80),
        audioLanguage: normalizeText(input.audioLanguage, 24),
        sessionId: input.sessionId,
        profileId,
      });

    const totals = aggregateContentSessions(profileId, input);
    const logicalProgress = totals.providerProgressSeconds > 0
      ? totals.providerProgressSeconds
      : Math.min(officialRuntime ?? Number.MAX_SAFE_INTEGER, totals.estimatedSeconds);
    const progress = saveProgress(profileId, {
      ...progressPayload(input),
      progressSeconds: logicalProgress,
      durationSeconds: officialRuntime ?? 0,
      completed: decision.completed,
      completionSource: decision.completionSource,
      trackingConfidence: decision.confidence,
      estimatedWatchSeconds: totals.estimatedSeconds,
      providerWatchSeconds: totals.providerSeconds,
    });
    const eventType = progress.newlyCompleted
      ? "COMPLETED"
      : input.playbackState === "paused" || input.playbackState === "buffering"
        ? "PAUSED"
        : "PROGRESS_UPDATED";
    recordViewingEvent(profileId, {
      ...eventPayload(input),
      eventType,
      positionSeconds: logicalProgress,
      durationSeconds: officialRuntime ?? 0,
      completionSource: decision.completionSource,
      trackingConfidence: decision.confidence,
      watchSecondsOverride: creditedProviderDelta + creditedEstimatedDelta,
      providerWatchSeconds: creditedProviderDelta,
      estimatedWatchSeconds: creditedEstimatedDelta,
      idempotencyKey:
        normalizeText(input.heartbeatId, 128) ||
        `${input.sessionId}:heartbeat:${clientTimestamp || now}`,
    });
  })();

  row = getRequiredSession(input.sessionId);
  if (decision.completed && !wasCompleted) {
    logTracking("watch_session_completed", profileId, input, decision);
  }
  return snapshot(row, getProgressFor(input, profileId));
}

export function manuallyCompleteWatchSession(
  profileId: string,
  input: WatchSessionIdentity,
) {
  validateIdentity(input);
  const now = Date.now();
  const decision = getDb().transaction(() => {
    if (!getSession(input.sessionId)) {
      getDb()
        .prepare(
          `
          insert into watch_sessions (
            id, profile_id, tmdb_id, media_type, series_id, season_number,
            episode_number, title, poster_path, provider_id, audio_language,
            started_at, last_heartbeat_at, official_runtime_seconds,
            last_document_visible, status, tracking_method
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'interrupted', 'manual')
        `,
        )
        .run(
          normalizeSessionId(input.sessionId),
          profileId,
          input.tmdbId,
          input.mediaType,
          input.mediaType === "tv" ? input.tmdbId : null,
          nullableInteger(input.seasonNumber),
          nullableInteger(input.episodeNumber),
          input.title.slice(0, 180),
          input.posterPath ?? null,
          normalizeText(input.providerId, 80),
          normalizeText(input.audioLanguage, 24),
          now,
          now,
          positiveIntegerOrNull(input.officialRuntimeSeconds),
        );
    }
    const row = getRequiredOwnedSession(profileId, input.sessionId);
    const totals = aggregateContentSessions(profileId, input);
    const duration =
      positiveIntegerOrNull(input.officialRuntimeSeconds) ??
      row.official_runtime_seconds ??
      0;
    const nextDecision = evaluateCompletion({
      estimatedWatchedSeconds: totals.estimatedSeconds,
      officialRuntimeSeconds: duration,
      manuallyMarkedWatched: true,
    });
    const logicalProgress = totals.providerProgressSeconds ||
      Math.min(duration || Number.MAX_SAFE_INTEGER, totals.estimatedSeconds);
    getDb()
      .prepare(
        `
        update watch_sessions set
          manually_marked_watched = 1, manual_marked_at = ?, completed = 1,
          completion_source = ?, confidence = ?, status = 'completed',
          ended_at = coalesce(ended_at, ?)
        where id = ? and profile_id = ?
      `,
      )
      .run(
        now,
        nextDecision.completionSource,
        nextDecision.confidence,
        now,
        input.sessionId,
        profileId,
      );
    saveProgress(profileId, {
      ...progressPayload(input),
      progressSeconds: logicalProgress,
      durationSeconds: duration,
      completed: true,
      completionSource: nextDecision.completionSource,
      trackingConfidence: nextDecision.confidence,
      manualMarkedAt: now,
      estimatedWatchSeconds: totals.estimatedSeconds,
      providerWatchSeconds: totals.providerSeconds,
    });
    recordViewingEvent(profileId, {
      ...eventPayload(input),
      eventType: "COMPLETED",
      positionSeconds: logicalProgress,
      durationSeconds: duration,
      completionSource: nextDecision.completionSource,
      trackingConfidence: nextDecision.confidence,
      watchSecondsOverride: 0,
      idempotencyKey: `${input.sessionId}:manual:${now}`,
      metadata: { manuallyMarkedWatched: true },
    });
    return nextDecision;
  })();
  logTracking("manual_completion_recorded", profileId, input, decision);
  return snapshot(getRequiredSession(input.sessionId), getProgressFor(input, profileId));
}

export function unmarkWatchSession(
  profileId: string,
  input: WatchSessionIdentity,
) {
  validateIdentity(input);
  getDb().transaction(() => {
    unmarkProgress(profileId, input);
    getDb()
      .prepare(
        `
        update watch_sessions set manually_marked_watched = 0,
          manual_marked_at = null,
          completed = 0,
          completion_source = 'unknown',
          confidence = case when provider_watched_seconds > 0 then 'high'
            when estimated_watched_seconds > 0 then 'medium' else 'low' end,
          status = 'interrupted'
        where profile_id = ? and tmdb_id = ? and media_type = ?
          and coalesce(season_number, -1) = coalesce(?, -1)
          and coalesce(episode_number, -1) = coalesce(?, -1)
      `,
      )
      .run(
        profileId,
        input.tmdbId,
        input.mediaType,
        nullableInteger(input.seasonNumber),
        nullableInteger(input.episodeNumber),
      );
    recordViewingEvent(profileId, {
      ...eventPayload(input),
      eventType: "PROGRESS_UPDATED",
      idempotencyKey: `${input.sessionId}:unmark:${Date.now()}`,
      metadata: { manuallyUnmarkedWatched: true },
    });
  })();
  const progress = getProgressFor(input, profileId);
  const row = getSession(input.sessionId);
  if (row && row.profile_id !== profileId) {
    throw new Error("Cette session appartient a un autre profil.");
  }
  return row
    ? snapshot(row, progress)
    : snapshotWithoutSession(input.sessionId, progress);
}

export function interruptWatchSession(profileId: string, sessionId: string) {
  const result = getDb()
    .prepare(
      `
      update watch_sessions set status = 'interrupted', ended_at = ?
      where id = ? and profile_id = ? and status in ('active', 'paused')
    `,
    )
    .run(Date.now(), normalizeSessionId(sessionId), profileId);
  return result.changes > 0;
}

function aggregateContentSessions(
  profileId: string,
  input: WatchSessionIdentity,
) {
  return getDb()
    .prepare(
      `
      select coalesce(sum(provider_watched_seconds), 0) as providerSeconds,
        coalesce(sum(estimated_watched_seconds), 0) as estimatedSeconds,
        coalesce(max(provider_progress_seconds), 0) as providerProgressSeconds
      from watch_sessions
      where profile_id = ? and tmdb_id = ? and media_type = ?
        and coalesce(season_number, -1) = coalesce(?, -1)
        and coalesce(episode_number, -1) = coalesce(?, -1)
    `,
    )
    .get(
      profileId,
      input.tmdbId,
      input.mediaType,
      nullableInteger(input.seasonNumber),
      nullableInteger(input.episodeNumber),
    ) as {
    providerSeconds: number;
    estimatedSeconds: number;
    providerProgressSeconds: number;
  };
}

function getSession(sessionId: string) {
  return getDb()
    .prepare("select * from watch_sessions where id = ? limit 1")
    .get(normalizeSessionId(sessionId)) as SessionRow | undefined;
}

function hasNewerActiveSession(profileId: string, row: SessionRow) {
  return Boolean(
    getDb()
      .prepare(
        `
        select 1 from watch_sessions
        where profile_id = ? and status in ('active', 'paused')
          and started_at > ? and tmdb_id = ? and media_type = ?
          and coalesce(season_number, -1) = coalesce(?, -1)
          and coalesce(episode_number, -1) = coalesce(?, -1)
        limit 1
      `,
      )
      .get(
        profileId,
        row.started_at,
        row.tmdb_id,
        row.media_type,
        row.season_number,
        row.episode_number,
      ),
  );
}

function getRequiredSession(sessionId: string) {
  const row = getSession(sessionId);
  if (!row) throw new Error("Session de lecture introuvable.");
  return row;
}

function getRequiredOwnedSession(profileId: string, sessionId: string) {
  const row = getRequiredSession(sessionId);
  if (row.profile_id !== profileId) {
    throw new Error("Cette session appartient a un autre profil.");
  }
  return row;
}

function getProgressFor(input: WatchSessionIdentity, profileId: string) {
  return getProgress(
    profileId,
    input.tmdbId,
    input.mediaType,
    nullableInteger(input.seasonNumber),
    nullableInteger(input.episodeNumber),
  );
}

function snapshot(row: SessionRow, progress: WatchProgress | null): WatchSessionSnapshot {
  const credibleWatchedSeconds = row.provider_watched_seconds > 0
    ? row.provider_watched_seconds
    : row.estimated_watched_seconds;
  return {
    sessionId: row.id,
    status: row.status,
    completed: Boolean(row.completed || progress?.completed),
    completionSource: progress?.completionSource ?? row.completion_source,
    confidence: progress?.trackingConfidence ?? row.confidence,
    providerWatchedSeconds: row.provider_watched_seconds,
    estimatedWatchedSeconds: row.estimated_watched_seconds,
    credibleWatchedSeconds,
    progressSeconds: progress?.progressSeconds ?? row.provider_progress_seconds,
    durationSeconds: progress?.durationSeconds ?? row.official_runtime_seconds ?? 0,
    manuallyMarkedWatched: Boolean(row.manually_marked_watched),
    trackingMethod: row.tracking_method ?? "unknown",
  };
}

function snapshotWithoutSession(
  sessionId: string,
  progress: WatchProgress | null,
): WatchSessionSnapshot {
  return {
    sessionId: normalizeSessionId(sessionId),
    status: "interrupted",
    completed: Boolean(progress?.completed),
    completionSource: progress?.completionSource ?? "unknown",
    confidence: progress?.trackingConfidence ?? "low",
    providerWatchedSeconds: progress?.providerWatchSeconds ?? 0,
    estimatedWatchedSeconds: progress?.estimatedWatchSeconds ?? 0,
    credibleWatchedSeconds: progress?.providerWatchSeconds
      ? progress.providerWatchSeconds
      : progress?.estimatedWatchSeconds ?? 0,
    progressSeconds: progress?.progressSeconds ?? 0,
    durationSeconds: progress?.durationSeconds ?? 0,
    manuallyMarkedWatched: false,
    trackingMethod: "unknown",
  };
}

function progressPayload(input: WatchSessionIdentity) {
  return {
    tmdbId: input.tmdbId,
    mediaType: input.mediaType,
    seasonNumber: nullableInteger(input.seasonNumber),
    episodeNumber: nullableInteger(input.episodeNumber),
    title: input.title,
    posterPath: input.posterPath ?? null,
    backdropPath: input.backdropPath ?? null,
    seriesEpisodeCounts: input.seriesEpisodeCounts ?? [],
  };
}

function eventPayload(input: WatchSessionIdentity) {
  return {
    tmdbId: input.tmdbId,
    mediaType: input.mediaType,
    title: input.title,
    posterPath: input.posterPath ?? null,
    seasonNumber: nullableInteger(input.seasonNumber),
    episodeNumber: nullableInteger(input.episodeNumber),
    audioLanguage: normalizeText(input.audioLanguage, 24),
    provider: normalizeText(input.providerId, 80),
    sessionId: normalizeSessionId(input.sessionId),
    genreIds: input.genreIds ?? [],
    timezoneOffsetMinutes: input.timezoneOffsetMinutes ?? 0,
  };
}

function validateIdentity(input: WatchSessionIdentity) {
  normalizeSessionId(input.sessionId);
  if (!Number.isFinite(input.tmdbId) || input.tmdbId <= 0) {
    throw new Error("Identifiant TMDB invalide.");
  }
  if (input.mediaType !== "movie" && input.mediaType !== "tv") {
    throw new Error("Type de contenu invalide.");
  }
  if (input.mediaType === "tv") {
    if (!positiveIntegerOrNull(input.seasonNumber) || !positiveIntegerOrNull(input.episodeNumber)) {
      throw new Error("Saison ou episode invalide.");
    }
  }
}

function normalizeSessionId(value: unknown) {
  const sessionId = normalizeText(value, 96);
  if (!sessionId || !/^[a-zA-Z0-9._:-]+$/.test(sessionId)) {
    throw new Error("Identifiant de session invalide.");
  }
  return sessionId;
}

function normalizeText(value: unknown, maximumLength: number) {
  return String(value ?? "").trim().slice(0, maximumLength);
}

function positiveIntegerOrNull(value: unknown) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function nonNegativeInteger(value: unknown) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function nonNegativeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function nullableInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : null;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number > 1 ? number / 100 : number)) : undefined;
}

function normalizeTrackingMethod(value: unknown): TrackingMethod {
  return value === "browser-extension" ||
    value === "provider-message" ||
    value === "local-estimate" ||
    value === "manual" ||
    value === "legacy"
    ? value
    : "unknown";
}

function logTracking(
  event: string,
  profileId: string,
  input: WatchSessionIdentity,
  result: { completionSource: CompletionSource; confidence: TrackingConfidence },
) {
  if (process.env.NODE_ENV === "test") return;
  console.info(JSON.stringify({
    event,
    sessionId: input.sessionId,
    profileId,
    mediaId: input.tmdbId,
    mediaType: input.mediaType,
    providerId: input.providerId ?? "",
    trackingMethod: "trackingMethod" in input
      ? normalizeTrackingMethod(input.trackingMethod)
      : "unknown",
    completionSource: result.completionSource,
    confidence: result.confidence,
  }));
}
