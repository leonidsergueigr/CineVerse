import "server-only";

import { getDb, getProfile } from "@/lib/store";
import {
  calculateProviderScore,
  learnPlaybackSegment,
  shouldRecordIntroSeekObservation,
  type PlaybackObservationSample,
} from "@/lib/playback-intelligence-core";
import { TRACKING_CONFIG } from "@/lib/watch-tracking";
import type {
  EmbedProvider,
  LearnedPlaybackSegment,
  PlaybackPreferences,
  ProviderPerformance,
} from "@/lib/types";

const DEFAULT_PREFERENCES: PlaybackPreferences = {
  autoNextEnabled: true,
  bingeLimitEpisodes: TRACKING_CONFIG.defaultBingeLimitEpisodes,
  introSkipEnabled: true,
  sessionSummaryEnabled: true,
};

export function getPlaybackPreferences(profileId: string): PlaybackPreferences {
  const row = getDb()
    .prepare(
      `
      select auto_next_enabled as autoNextEnabled,
        binge_limit_episodes as bingeLimitEpisodes,
        intro_skip_enabled as introSkipEnabled,
        session_summary_enabled as sessionSummaryEnabled
      from profile_playback_preferences
      where profile_id = ?
      limit 1
    `,
    )
    .get(profileId) as
    | {
        autoNextEnabled: 0 | 1;
        bingeLimitEpisodes: number;
        introSkipEnabled: 0 | 1;
        sessionSummaryEnabled: 0 | 1;
      }
    | undefined;
  return row
    ? {
        autoNextEnabled: Boolean(row.autoNextEnabled),
        bingeLimitEpisodes: normalizeBingeLimit(row.bingeLimitEpisodes),
        introSkipEnabled: Boolean(row.introSkipEnabled),
        sessionSummaryEnabled: Boolean(row.sessionSummaryEnabled),
      }
    : { ...DEFAULT_PREFERENCES };
}

export function updatePlaybackPreferences(
  profileId: string,
  patch: Partial<PlaybackPreferences>,
) {
  if (!getProfile(profileId)) throw new Error("Profil introuvable.");
  const current = getPlaybackPreferences(profileId);
  const next: PlaybackPreferences = {
    autoNextEnabled:
      typeof patch.autoNextEnabled === "boolean"
        ? patch.autoNextEnabled
        : current.autoNextEnabled,
    bingeLimitEpisodes:
      patch.bingeLimitEpisodes === undefined
        ? current.bingeLimitEpisodes
        : normalizeBingeLimit(patch.bingeLimitEpisodes),
    introSkipEnabled:
      typeof patch.introSkipEnabled === "boolean"
        ? patch.introSkipEnabled
        : current.introSkipEnabled,
    sessionSummaryEnabled:
      typeof patch.sessionSummaryEnabled === "boolean"
        ? patch.sessionSummaryEnabled
        : current.sessionSummaryEnabled,
  };
  getDb()
    .prepare(
      `
      insert into profile_playback_preferences (
        profile_id, auto_next_enabled, binge_limit_episodes,
        intro_skip_enabled, session_summary_enabled, updated_at
      ) values (?, ?, ?, ?, ?, ?)
      on conflict(profile_id) do update set
        auto_next_enabled = excluded.auto_next_enabled,
        binge_limit_episodes = excluded.binge_limit_episodes,
        intro_skip_enabled = excluded.intro_skip_enabled,
        session_summary_enabled = excluded.session_summary_enabled,
        updated_at = excluded.updated_at
    `,
    )
    .run(
      profileId,
      next.autoNextEnabled ? 1 : 0,
      next.bingeLimitEpisodes,
      next.introSkipEnabled ? 1 : 0,
      next.sessionSummaryEnabled ? 1 : 0,
      Date.now(),
    );
  return next;
}

export function recordPlaybackObservation(
  profileId: string,
  input: {
    sessionId: string;
    tmdbId: number;
    seasonNumber: number;
    episodeNumber: number;
    observationType: "intro" | "credits";
    fromSeconds: number;
    toSeconds: number;
    durationSeconds: number;
    observedAt?: number;
  },
) {
  if (!getProfile(profileId)) throw new Error("Profil introuvable.");
  const normalized = normalizeObservation(input);
  if (!normalized) return getLearnedPlaybackSegments(
    profileId,
    input.tmdbId,
    input.seasonNumber,
  );
  const ownedSession = getDb()
    .prepare(
      `
      select 1 from watch_sessions
      where id = ? and profile_id = ? and tmdb_id = ? and media_type = 'tv'
        and season_number = ? and episode_number = ?
      limit 1
    `,
    )
    .get(
      input.sessionId.slice(0, 96),
      profileId,
      normalized.tmdbId,
      normalized.seasonNumber,
      normalized.episodeNumber,
    );
  if (!ownedSession) throw new Error("Session de lecture invalide.");
  const observationKey = [
    input.sessionId.slice(0, 96),
    normalized.observationType,
    normalized.seasonNumber,
    normalized.episodeNumber,
    Math.round(normalized.fromSeconds),
    Math.round(normalized.toSeconds),
  ].join(":");
  getDb()
    .prepare(
      `
      insert or ignore into playback_observations (
        observation_key, profile_id, session_id, tmdb_id, season_number,
        episode_number, observation_type, from_seconds, to_seconds,
        duration_seconds, remaining_seconds, observed_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      observationKey,
      profileId,
      input.sessionId.slice(0, 96),
      normalized.tmdbId,
      normalized.seasonNumber,
      normalized.episodeNumber,
      normalized.observationType,
      normalized.fromSeconds,
      normalized.toSeconds,
      normalized.durationSeconds,
      normalized.remainingSeconds,
      normalized.observedAt,
    );
  relearnSegment(
    profileId,
    normalized.tmdbId,
    normalized.seasonNumber,
    normalized.observationType,
  );
  return getLearnedPlaybackSegments(
    profileId,
    normalized.tmdbId,
    normalized.seasonNumber,
  );
}

export function getLearnedPlaybackSegments(
  profileId: string,
  tmdbId: number,
  seasonNumber: number,
): LearnedPlaybackSegment[] {
  const rows = getDb()
    .prepare(
      `
      select tmdb_id as tmdbId, season_number as seasonNumber,
        segment_type as segmentType, start_seconds as startSeconds,
        end_seconds as endSeconds, remaining_seconds as remainingSeconds,
        sample_count as sampleCount, confidence, disabled
      from learned_playback_segments
      where profile_id = ? and tmdb_id = ? and season_number = ?
      order by segment_type
    `,
    )
    .all(profileId, tmdbId, seasonNumber) as Array<
    Omit<LearnedPlaybackSegment, "disabled"> & { disabled: 0 | 1 }
  >;
  return rows.map((row) => ({ ...row, disabled: Boolean(row.disabled) }));
}

export function updateLearnedPlaybackSegment(
  profileId: string,
  input: {
    tmdbId: number;
    seasonNumber: number;
    segmentType: "intro" | "credits";
    disabled?: boolean;
    startSeconds?: number;
    endSeconds?: number;
    remainingSeconds?: number;
  },
) {
  const existing = getLearnedPlaybackSegments(
    profileId,
    input.tmdbId,
    input.seasonNumber,
  ).find((segment) => segment.segmentType === input.segmentType);
  if (!existing) throw new Error("Segment introuvable.");
  const startSeconds = nonNegative(input.startSeconds ?? existing.startSeconds);
  const endSeconds = nonNegative(input.endSeconds ?? existing.endSeconds);
  if (input.segmentType === "intro" && endSeconds <= startSeconds) {
    throw new Error("La fin de l'introduction doit suivre son debut.");
  }
  getDb()
    .prepare(
      `
      update learned_playback_segments set
        disabled = ?, start_seconds = ?, end_seconds = ?,
        remaining_seconds = ?, updated_at = ?
      where profile_id = ? and tmdb_id = ? and season_number = ?
        and segment_type = ?
    `,
    )
    .run(
      (input.disabled ?? existing.disabled) ? 1 : 0,
      startSeconds,
      endSeconds,
      nonNegative(input.remainingSeconds ?? existing.remainingSeconds),
      Date.now(),
      profileId,
      input.tmdbId,
      input.seasonNumber,
      input.segmentType,
    );
  return getLearnedPlaybackSegments(profileId, input.tmdbId, input.seasonNumber);
}

export function getProviderPerformance(profileId: string): ProviderPerformance[] {
  const rows = getDb()
    .prepare(
      `
      select provider_id as providerId, count(*) as sampleCount,
        sum(case when first_play_at is not null then 1 else 0 end) as startupSuccesses,
        avg(case when startup_milliseconds is not null then startup_milliseconds end) as averageStartupMs,
        sum(buffering_count) as bufferingCount,
        sum(buffering_seconds) as bufferingSeconds,
        sum(error_count) as errorCount,
        sum(case when completed = 1 then 1 else 0 end) as completedSessions,
        sum(case when tracking_method in ('browser-extension', 'provider-message') then 1 else 0 end) as preciseTrackingSessions,
        sum(provider_watched_seconds + estimated_watched_seconds) as watchedSeconds,
        max(last_heartbeat_at) as lastUsedAt
      from watch_sessions
      where profile_id = ? and provider_id <> ''
      group by lower(provider_id)
    `,
    )
    .all(profileId) as Array<{
    providerId: string;
    sampleCount: number;
    startupSuccesses: number;
    averageStartupMs: number | null;
    bufferingCount: number;
    bufferingSeconds: number;
    errorCount: number;
    completedSessions: number;
    preciseTrackingSessions: number;
    watchedSeconds: number;
    lastUsedAt: number | null;
  }>;
  return rows.map((row) => ({
    providerId: row.providerId,
    score: calculateProviderScore(row),
    sampleCount: row.sampleCount,
    startupSuccessPercent: percent(row.startupSuccesses, row.sampleCount),
    averageStartupMs:
      row.averageStartupMs === null ? null : Math.round(row.averageStartupMs),
    bufferingCount: row.bufferingCount,
    bufferingSeconds: row.bufferingSeconds,
    errorCount: row.errorCount,
    completionPercent: percent(row.completedSessions, row.sampleCount),
    preciseTrackingPercent: percent(row.preciseTrackingSessions, row.sampleCount),
    lastUsedAt: row.lastUsedAt,
  }));
}

export function rankProvidersForProfile(
  profileId: string,
  providers: EmbedProvider[],
) {
  const metrics = new Map(
    getProviderPerformance(profileId).map((metric) => [
      metric.providerId.toLowerCase(),
      metric,
    ]),
  );
  return providers
    .map((provider) => {
      const metric =
        metrics.get(provider.name.toLowerCase()) ??
        metrics.get(provider.id.toLowerCase());
      return {
        ...provider,
        measuredPerformance: metric,
        sortScore:
          provider.priority * 10 -
          (metric && metric.sampleCount >= 2 ? metric.score : 50),
      };
    })
    .sort((left, right) => left.sortScore - right.sortScore)
    .map(({ sortScore, measuredPerformance, ...provider }) => {
      if (!Number.isFinite(sortScore)) return provider;
      return {
        ...provider,
        reliability: measuredPerformance
          ? {
              score: measuredPerformance.score,
              lastCheckedAt: measuredPerformance.lastUsedAt
                ? new Date(measuredPerformance.lastUsedAt).toISOString()
                : null,
            }
          : provider.reliability,
        performance: measuredPerformance,
      };
    });
}

function relearnSegment(
  profileId: string,
  tmdbId: number,
  seasonNumber: number,
  type: "intro" | "credits",
) {
  const samples = getDb()
    .prepare(
      `
      select session_id as sessionId, episode_number as episodeNumber,
        observed_at as observedAt, from_seconds as fromSeconds,
        to_seconds as toSeconds, duration_seconds as durationSeconds,
        remaining_seconds as remainingSeconds
      from playback_observations
      where profile_id = ? and tmdb_id = ? and season_number = ?
        and observation_type = ?
      order by observed_at desc
      limit 80
    `,
    )
    .all(profileId, tmdbId, seasonNumber, type) as PlaybackObservationSample[];
  const learned = learnPlaybackSegment(type, samples);
  if (!learned) return;
  getDb()
    .prepare(
      `
      insert into learned_playback_segments (
        profile_id, tmdb_id, season_number, segment_type, start_seconds,
        end_seconds, remaining_seconds, sample_count, confidence, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(profile_id, tmdb_id, season_number, segment_type) do update set
        start_seconds = excluded.start_seconds,
        end_seconds = excluded.end_seconds,
        remaining_seconds = excluded.remaining_seconds,
        sample_count = excluded.sample_count,
        confidence = excluded.confidence,
        updated_at = excluded.updated_at
    `,
    )
    .run(
      profileId,
      tmdbId,
      seasonNumber,
      type,
      learned.startSeconds,
      learned.endSeconds,
      learned.remainingSeconds,
      learned.sampleCount,
      learned.confidence,
      Date.now(),
    );
}

function normalizeObservation(input: {
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  observationType: "intro" | "credits";
  fromSeconds: number;
  toSeconds: number;
  durationSeconds: number;
  observedAt?: number;
}) {
  const tmdbId = positiveInteger(input.tmdbId);
  const seasonNumber = positiveInteger(input.seasonNumber);
  const episodeNumber = positiveInteger(input.episodeNumber);
  const fromSeconds = nonNegative(input.fromSeconds);
  const toSeconds = nonNegative(input.toSeconds);
  const durationSeconds = nonNegative(input.durationSeconds);
  if (!tmdbId || !seasonNumber || !episodeNumber || !durationSeconds) return null;
  const remainingSeconds = Math.max(0, durationSeconds - fromSeconds);
  if (
    input.observationType === "intro" &&
    !shouldRecordIntroSeekObservation({
      fromSeconds,
      toSeconds,
      durationSeconds,
    })
  ) {
    return null;
  }
  if (
    input.observationType === "credits" &&
    (remainingSeconds < 10 || remainingSeconds > 5 * 60)
  ) {
    return null;
  }
  return {
    tmdbId,
    seasonNumber,
    episodeNumber,
    observationType: input.observationType,
    fromSeconds,
    toSeconds,
    durationSeconds,
    remainingSeconds,
    observedAt: Math.max(0, Math.floor(input.observedAt ?? Date.now())),
  };
}

function normalizeBingeLimit(value: number) {
  const limit = Math.floor(Number(value));
  return Number.isFinite(limit) ? Math.min(12, Math.max(0, limit)) : 4;
}

function positiveInteger(value: number) {
  const normalized = Math.floor(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

function nonNegative(value: number) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? Math.max(0, normalized) : 0;
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}
