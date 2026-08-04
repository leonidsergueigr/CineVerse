import Database from "better-sqlite3";
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { applyWatchTrackingSchema } from "@/lib/watch-schema";
import {
  completionSignalWeight,
  evaluateCompletion,
  type CompletionSource,
  type TrackingConfidence,
} from "@/lib/watch-tracking";
import {
  LEGACY_PROFILE_ID,
  MAX_PROFILES,
  PROFILE_COLORS,
  PROFILE_PIN_LENGTH,
} from "@/lib/profile-constants";
import type {
  DislikeRecord,
  LikeRecord,
  MediaType,
  Profile,
  RecommendationExposure,
  RecommendationExclusion,
  RecommendationImpression,
  SeriesProgressSummary,
  ViewingEventType,
  WatchHistoryRecord,
  WatchProgress,
  WatchlistRecord,
} from "@/lib/types";

export type ProgressInput = {
  tmdbId: number;
  mediaType: MediaType;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  progressSeconds: number;
  durationSeconds: number;
  completed?: boolean;
  completionSource?: CompletionSource;
  trackingConfidence?: TrackingConfidence;
  manualMarkedAt?: number | null;
  estimatedWatchSeconds?: number;
  providerWatchSeconds?: number;
  seriesEpisodeCounts?: Array<{
    seasonNumber: number;
    episodeCount: number;
  }>;
};

type LikeInput = {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  liked: boolean;
  signalStrength?: number;
  signalOrigin?: LikeRecord["signalOrigin"];
};

type WatchlistInput = {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  included: boolean;
  genreIds?: number[];
  originalLanguage?: string;
};

type DislikeInput = {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  genreIds?: number[];
  originalLanguage?: string;
  disliked: boolean;
  signalStrength?: number;
  signalOrigin?: DislikeRecord["signalOrigin"];
  exactExclusion?: boolean;
};

type DbDislike = {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  genreIds: string;
  originalLanguage: string;
  dislikedAt: string;
  signalStrength: number;
  signalOrigin: NonNullable<DislikeRecord["signalOrigin"]>;
  exactExclusion: 0 | 1;
};

export type HistoryImportEpisode = {
  seasonNumber: number;
  episodeNumber: number;
};

export type HistoryImportInput = {
  tmdbId: number;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  episodes: HistoryImportEpisode[];
  seriesEpisodeCounts: Array<{ seasonNumber: number; episodeCount: number }>;
  sentiment?: "liked" | "neutral" | "disliked";
  genreIds?: number[];
  originalLanguage?: string;
};

type ApiCacheRow = {
  payload: string;
  expires_at: number;
};

export type ViewingEventInput = {
  eventType: ViewingEventType;
  tmdbId?: number | null;
  mediaType?: MediaType | null;
  title?: string;
  posterPath?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  positionSeconds?: number;
  durationSeconds?: number;
  audioLanguage?: string;
  subtitleLanguage?: string | null;
  provider?: string;
  sessionId?: string;
  genreIds?: number[];
  timezoneOffsetMinutes?: number;
  metadata?: Record<string, unknown>;
  completionSource?: CompletionSource;
  trackingConfidence?: TrackingConfidence;
  estimatedWatchSeconds?: number;
  providerWatchSeconds?: number;
  watchSecondsOverride?: number;
  idempotencyKey?: string;
};

type DbProfile = {
  id: string;
  name: string;
  color: string;
  hasPin: 0 | 1;
  createdAt: string;
};

let db: Database.Database | null = null;
let lastCachePrune = 0;

export function getDb() {
  if (db) return db;

  const configuredDataDir = process.env.CINEVERSE_DATA_DIR?.trim();
  const dataDir = configuredDataDir
    ? path.resolve(configuredDataDir)
    : path.join(process.cwd(), "data");
  const databasePath = path.join(dataDir, "cineverse.sqlite");

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.accessSync(dataDir, fs.constants.R_OK | fs.constants.W_OK);
    db = new Database(databasePath);
  } catch (error) {
    throw new Error(
      `CineVerse ne peut pas ouvrir SQLite dans ${databasePath}. Verifie les permissions du volume et le label SELinux (:Z avec Docker Compose).`,
      { cause: error },
    );
  }
  db.pragma("journal_mode = WAL");
  const hadProfilesTable = tableExists(db, "profiles");
  const hadLegacyPersonalData =
    !hadProfilesTable &&
    ["watch_history", "user_likes", "user_dislikes"].some(
      (table) => tableExists(db!, table) && tableHasRows(db!, table),
    );
  db.exec(`
    create table if not exists profiles (
      id text primary key,
      name text not null,
      color text not null,
      pin_hash text,
      pin_salt text,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists profile_sessions (
      token_hash text primary key,
      profile_id text not null,
      expires_at integer not null,
      created_at integer not null
    );

    create index if not exists profile_sessions_profile
      on profile_sessions(profile_id);

    create index if not exists profile_sessions_expiry
      on profile_sessions(expires_at);

    create table if not exists watch_history (
      id integer primary key autoincrement,
      user_id text not null default 'local',
      tmdb_id integer not null,
      media_type text not null,
      season_number integer,
      episode_number integer,
      title text not null,
      poster_path text,
      backdrop_path text,
      progress_seconds integer not null default 0,
      duration_seconds integer not null default 0,
      completed integer not null default 0,
      series_episode_counts text not null default '[]',
      updated_at text not null default current_timestamp,
      unique(user_id, tmdb_id, media_type, season_number, episode_number)
    );

    create table if not exists user_likes (
      id integer primary key autoincrement,
      user_id text not null default 'local',
      tmdb_id integer not null,
      media_type text not null,
      title text not null,
      poster_path text,
      backdrop_path text,
      liked_at text not null default current_timestamp,
      unique(user_id, tmdb_id, media_type)
    );

    create table if not exists user_dislikes (
      id integer primary key autoincrement,
      user_id text not null default 'local',
      tmdb_id integer not null,
      media_type text not null,
      title text not null,
      poster_path text,
      backdrop_path text,
      genre_ids text not null default '[]',
      original_language text not null default '',
      disliked_at text not null default current_timestamp,
      unique(user_id, tmdb_id, media_type)
    );

    create table if not exists user_watchlist (
      id integer primary key autoincrement,
      user_id text not null default 'local',
      tmdb_id integer not null,
      media_type text not null,
      title text not null,
      poster_path text,
      backdrop_path text,
      added_at text not null default current_timestamp,
      unique(user_id, tmdb_id, media_type)
    );

    create table if not exists external_api_cache (
      cache_key text primary key,
      payload text not null,
      expires_at integer not null,
      updated_at integer not null
    );

    create index if not exists external_api_cache_expiry
      on external_api_cache(expires_at);

    create table if not exists viewing_events (
      id integer primary key autoincrement,
      profile_id text not null,
      session_id text not null default '',
      tmdb_id integer,
      media_type text,
      title text not null default '',
      poster_path text,
      event_type text not null,
      occurred_at integer not null,
      season_number integer,
      episode_number integer,
      position_seconds integer not null default 0,
      duration_seconds integer not null default 0,
      watch_seconds integer not null default 0,
      audio_language text not null default '',
      subtitle_language text,
      provider text not null default '',
      genre_ids text not null default '[]',
      timezone_offset_minutes integer not null default 0,
      metadata_json text not null default '{}'
    );

    create index if not exists viewing_events_profile_time
      on viewing_events(profile_id, occurred_at desc);

    create index if not exists viewing_events_profile_media
      on viewing_events(profile_id, media_type, tmdb_id);

    create index if not exists viewing_events_session
      on viewing_events(profile_id, session_id, occurred_at);

    create table if not exists recommendation_impressions (
      id integer primary key autoincrement,
      profile_id text not null,
      session_id text not null,
      tmdb_id integer not null,
      media_type text not null,
      shelf_type text not null,
      position integer not null default 0,
      score real,
      shown_at integer not null,
      clicked integer not null default 0,
      played integer not null default 0,
      completed integer not null default 0,
      dismissed integer not null default 0,
      unique(profile_id, session_id, tmdb_id, media_type, shelf_type)
    );

    create index if not exists recommendation_impressions_profile_time
      on recommendation_impressions(profile_id, shown_at desc);

    create index if not exists recommendation_impressions_profile_media
      on recommendation_impressions(profile_id, media_type, tmdb_id, shown_at desc);

    create table if not exists app_migrations (
      id text primary key,
      applied_at integer not null
    );
  `);
  ensureColumn(
    db,
    "watch_history",
    "series_episode_counts",
    "text not null default '[]'",
  );
  ensureColumn(db, "profiles", "pin_hash", "text");
  ensureColumn(db, "profiles", "pin_salt", "text");
  applyWatchTrackingSchema(db);
  if (hadLegacyPersonalData) {
    db.prepare(
      `
      insert or ignore into profiles (id, name, color)
      values (?, 'Principal', ?)
    `,
    ).run(LEGACY_PROFILE_ID, PROFILE_COLORS[0]);
  }
  runMigration(db, "completion-watch-seconds-v2", () => {
    repairCompletionWatchSeconds(db!);
  });

  return db;
}

export function getProfiles(): Profile[] {
  const rows = getDb()
    .prepare(
      `
      select id, name, color, pin_hash is not null as hasPin,
        created_at as createdAt
      from profiles
      order by datetime(created_at), name
    `,
    )
    .all() as DbProfile[];
  return rows.map(mapProfile);
}

export function getProfile(profileId: string | undefined | null) {
  if (!profileId) return null;
  const row = getDb()
    .prepare(
      `
      select id, name, color, pin_hash is not null as hasPin,
        created_at as createdAt
      from profiles
      where id = ?
      limit 1
    `,
    )
    .get(profileId) as DbProfile | undefined;
  return row ? mapProfile(row) : null;
}

export function createProfile(input: {
  name: string;
  color?: string;
  pin?: string;
}) {
  const name = normalizeProfileName(input.name);
  const database = getDb();
  const count = (
    database.prepare("select count(*) as count from profiles").get() as {
      count: number;
    }
  ).count;
  if (count >= MAX_PROFILES) {
    throw new Error(`Vous pouvez creer jusqu'a ${MAX_PROFILES} profils.`);
  }
  if (
    database
      .prepare("select 1 from profiles where lower(name) = lower(?) limit 1")
      .get(name)
  ) {
    throw new Error("Ce nom de profil existe deja.");
  }

  const pin = createPinRecord(input.pin);
  const profile: Profile = {
    id: `profile-${randomUUID()}`,
    name,
    color: normalizeProfileColor(input.color),
    hasPin: Boolean(pin.hash),
    createdAt: new Date().toISOString(),
  };
  database
    .prepare(
      `
      insert into profiles (
        id, name, color, pin_hash, pin_salt, created_at, updated_at
      )
      values (
        @id, @name, @color, @pinHash, @pinSalt, @createdAt, @createdAt
      )
    `,
    )
    .run({ ...profile, pinHash: pin.hash, pinSalt: pin.salt });
  return profile;
}

export function updateProfile(
  profileId: string,
  input: { name?: string; color?: string; pin?: string | null },
) {
  const current = getProfile(profileId);
  if (!current) throw new Error("Profil introuvable.");
  const name =
    input.name === undefined ? current.name : normalizeProfileName(input.name);
  const color =
    input.color === undefined
      ? current.color
      : normalizeProfileColor(input.color);
  const duplicate = getDb()
    .prepare(
      "select 1 from profiles where lower(name) = lower(?) and id != ? limit 1",
    )
    .get(name, profileId);
  if (duplicate) throw new Error("Ce nom de profil existe deja.");

  if (input.pin === undefined) {
    getDb()
      .prepare(
        `
        update profiles
        set name = ?, color = ?, updated_at = datetime('now')
        where id = ?
      `,
      )
      .run(name, color, profileId);
  } else {
    const pin = createPinRecord(input.pin ?? "");
    getDb()
      .prepare(
        `
        update profiles
        set name = ?, color = ?, pin_hash = ?, pin_salt = ?,
          updated_at = datetime('now')
        where id = ?
      `,
      )
      .run(name, color, pin.hash, pin.salt, profileId);
  }
  return getProfile(profileId);
}

export function deleteProfile(profileId: string) {
  if (!getProfile(profileId)) return false;

  const database = getDb();
  database.transaction(() => {
    database
      .prepare("delete from profile_sessions where profile_id = ?")
      .run(profileId);
    database.prepare("delete from watch_history where user_id = ?").run(profileId);
    database
      .prepare("delete from watch_sessions where profile_id = ?")
      .run(profileId);
    database
      .prepare("delete from profile_playback_preferences where profile_id = ?")
      .run(profileId);
    database
      .prepare("delete from playback_observations where profile_id = ?")
      .run(profileId);
    database
      .prepare("delete from learned_playback_segments where profile_id = ?")
      .run(profileId);
    database.prepare("delete from user_likes where user_id = ?").run(profileId);
    database.prepare("delete from user_dislikes where user_id = ?").run(profileId);
    database.prepare("delete from user_watchlist where user_id = ?").run(profileId);
    database
      .prepare("delete from viewing_events where profile_id = ?")
      .run(profileId);
    database
      .prepare("delete from recommendation_impressions where profile_id = ?")
      .run(profileId);
    database
      .prepare("delete from recommendation_suppressions where profile_id = ?")
      .run(profileId);
    database.prepare("delete from profiles where id = ?").run(profileId);
  })();
  return true;
}

export function createProfileSession(profileId: string) {
  if (!getProfile(profileId)) throw new Error("Profil introuvable.");
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const database = getDb();
  database
    .prepare(
      `
      insert into profile_sessions (
        token_hash, profile_id, expires_at, created_at
      )
      values (?, ?, ?, ?)
    `,
    )
    .run(
      hashSessionToken(token),
      profileId,
      now + 30 * 24 * 60 * 60 * 1000,
      now,
    );
  database
    .prepare("delete from profile_sessions where expires_at <= ?")
    .run(now);
  return token;
}

export function getProfileIdForSession(token: string | undefined) {
  if (!token) return null;
  const row = getDb()
    .prepare(
      `
      select profile_id as profileId
      from profile_sessions
      where token_hash = ? and expires_at > ?
      limit 1
    `,
    )
    .get(hashSessionToken(token), Date.now()) as
    | { profileId: string }
    | undefined;
  return row?.profileId ?? null;
}

export function revokeProfileSession(token: string | undefined) {
  if (!token) return;
  getDb()
    .prepare("delete from profile_sessions where token_hash = ?")
    .run(hashSessionToken(token));
}

export function verifyProfilePin(profileId: string, pin: string) {
  const row = getDb()
    .prepare(
      `
      select pin_hash as pinHash, pin_salt as pinSalt
      from profiles
      where id = ?
      limit 1
    `,
    )
    .get(profileId) as
    | { pinHash: string | null; pinSalt: string | null }
    | undefined;
  if (!row) return false;
  if (!row.pinHash || !row.pinSalt) return true;
  if (!isValidPin(pin)) return false;

  const expected = Buffer.from(row.pinHash, "hex");
  const actual = scryptSync(pin, row.pinSalt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function getCachedApiResponse<T>(cacheKey: string) {
  const row = getDb()
    .prepare(
      `
      select payload, expires_at
      from external_api_cache
      where cache_key = ?
      limit 1
    `,
    )
    .get(cacheKey) as ApiCacheRow | undefined;

  if (!row) return null;

  try {
    return {
      value: JSON.parse(row.payload) as T,
      stale: row.expires_at <= Date.now(),
    };
  } catch {
    getDb()
      .prepare("delete from external_api_cache where cache_key = ?")
      .run(cacheKey);
    return null;
  }
}

export function setCachedApiResponse(
  cacheKey: string,
  value: unknown,
  ttlSeconds: number,
) {
  const now = Date.now();
  getDb()
    .prepare(
      `
      insert into external_api_cache (cache_key, payload, expires_at, updated_at)
      values (?, ?, ?, ?)
      on conflict(cache_key) do update set
        payload = excluded.payload,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `,
    )
    .run(cacheKey, JSON.stringify(value), now + ttlSeconds * 1000, now);

  if (now - lastCachePrune < 24 * 60 * 60 * 1000) return;
  lastCachePrune = now;
  getDb()
    .prepare("delete from external_api_cache where expires_at < ?")
    .run(now - 30 * 24 * 60 * 60 * 1000);
}

export function saveProgress(profileId: string, input: ProgressInput) {
  const previous = getProgress(
    profileId,
    input.tmdbId,
    input.mediaType,
    input.seasonNumber ?? null,
    input.episodeNumber ?? null,
  );
  const completed =
    input.completed === undefined
      ? isPlaybackComplete(input)
        ? 1
        : 0
      : input.completed
        ? 1
        : 0;
  const completionSource = completed
    ? input.completionSource ?? "unknown"
    : "unknown";
  const trackingConfidence = input.trackingConfidence ?? "low";
  const seriesEpisodeCounts = JSON.stringify(
    sanitizeEpisodeCounts(input.seriesEpisodeCounts),
  );

  const database = getDb();
  const payload = {
    ...input,
    profileId,
    completed,
    completionSource,
    trackingConfidence,
    manualMarkedAt: input.manualMarkedAt ?? null,
    estimatedWatchSeconds: nonNegativeInteger(input.estimatedWatchSeconds),
    providerWatchSeconds: nonNegativeInteger(input.providerWatchSeconds),
    seriesEpisodeCounts,
    watchedAt: completed && !previous?.completed ? Date.now() : null,
  };

  const updated = database
    .prepare(
      `
      update watch_history set
        title = @title,
        poster_path = @posterPath,
        backdrop_path = @backdropPath,
        progress_seconds = case
          when completed = 1 and @completed = 0 then progress_seconds
          else @progressSeconds
        end,
        duration_seconds = case
          when completed = 1 and @completed = 0 then duration_seconds
          else @durationSeconds
        end,
        completed = max(completed, @completed),
        completion_source = case
          when @completed = 1 then @completionSource
          else completion_source
        end,
        tracking_confidence = case
          when @completed = 1 then @trackingConfidence
          else tracking_confidence
        end,
        manual_marked_at = coalesce(@manualMarkedAt, manual_marked_at),
        estimated_watch_seconds = max(
          estimated_watch_seconds, @estimatedWatchSeconds
        ),
        provider_watch_seconds = max(
          provider_watch_seconds, @providerWatchSeconds
        ),
        series_episode_counts = case
          when @seriesEpisodeCounts = '[]' then series_episode_counts
          else @seriesEpisodeCounts
        end,
        watched_at = coalesce(@watchedAt, watched_at),
        history_origin = case
          when @completed = 1 then 'tracking'
          else history_origin
        end,
        updated_at = datetime('now')
      where user_id = @profileId
        and tmdb_id = @tmdbId
        and media_type = @mediaType
        and coalesce(season_number, -1) = coalesce(@seasonNumber, -1)
        and coalesce(episode_number, -1) = coalesce(@episodeNumber, -1)
    `,
    )
    .run(payload);

  if (updated.changes === 0) {
    database
      .prepare(
        `
        insert into watch_history (
          user_id, tmdb_id, media_type, season_number, episode_number, title,
          poster_path, backdrop_path, progress_seconds, duration_seconds, completed,
          completion_source, tracking_confidence, manual_marked_at,
          estimated_watch_seconds, provider_watch_seconds,
          series_episode_counts, watched_at, history_origin, updated_at
        )
        values (@profileId, @tmdbId, @mediaType, @seasonNumber, @episodeNumber, @title,
          @posterPath, @backdropPath, @progressSeconds, @durationSeconds, @completed,
          @completionSource, @trackingConfidence, @manualMarkedAt,
          @estimatedWatchSeconds, @providerWatchSeconds,
          @seriesEpisodeCounts, @watchedAt, 'tracking', datetime('now'))
      `,
      )
      .run(payload);
  }

  return {
    completed: Boolean(completed || previous?.completed),
    newlyCompleted: Boolean(completed && !previous?.completed),
  };
}

export function unmarkProgress(
  profileId: string,
  input: Pick<
    ProgressInput,
    "tmdbId" | "mediaType" | "seasonNumber" | "episodeNumber"
  >,
) {
  const result = getDb()
    .prepare(
      `
      update watch_history set
        completed = 0,
        completion_source = 'unknown',
        tracking_confidence = case
          when provider_watch_seconds > 0 then 'high'
          when estimated_watch_seconds > 0 then 'medium'
          else 'low'
        end,
        manual_marked_at = null,
        progress_seconds = case
          when provider_watch_seconds > 0 then min(provider_watch_seconds, duration_seconds)
          when estimated_watch_seconds > 0 then min(estimated_watch_seconds, duration_seconds)
          else 0
        end,
        updated_at = datetime('now')
      where user_id = ? and tmdb_id = ? and media_type = ?
        and coalesce(season_number, -1) = coalesce(?, -1)
        and coalesce(episode_number, -1) = coalesce(?, -1)
    `,
    )
    .run(
      profileId,
      input.tmdbId,
      input.mediaType,
      input.seasonNumber ?? null,
      input.episodeNumber ?? null,
    );
  return result.changes > 0;
}

export function getProgress(
  profileId: string,
  tmdbId: number,
  mediaType: MediaType,
  seasonNumber: number | null,
  episodeNumber: number | null,
): WatchProgress | null {
  const row = getDb()
    .prepare(
      `
      select * from watch_history
      where user_id = ?
        and tmdb_id = ?
        and media_type = ?
        and coalesce(season_number, -1) = coalesce(?, -1)
        and coalesce(episode_number, -1) = coalesce(?, -1)
      limit 1
    `,
    )
    .get(profileId, tmdbId, mediaType, seasonNumber, episodeNumber) as
    | DbProgress
    | undefined;

  return row ? mapProgress(row) : null;
}

export function getSeriesProgressSummary(
  profileId: string,
  tmdbId: number,
  seasonNumber: number,
  totalEpisodes: number,
): SeriesProgressSummary {
  const completedEpisodeNumbers = (
    getDb()
      .prepare(
        `
        select distinct episode_number
        from watch_history
        where user_id = ?
          and tmdb_id = ?
          and media_type = 'tv'
          and season_number = ?
          and completed = 1
          and episode_number is not null
        order by episode_number
      `,
      )
      .all(profileId, tmdbId, seasonNumber) as Array<{ episode_number: number }>
  )
    .map((row) => row.episode_number)
    .filter(
      (episodeNumber) =>
        episodeNumber >= 1 && episodeNumber <= Math.max(0, totalEpisodes),
    );

  return {
    seasonNumber,
    completedEpisodes: completedEpisodeNumbers.length,
    totalEpisodes: Math.max(0, totalEpisodes),
    completedEpisodeNumbers,
  };
}

export function getContinueWatching(
  profileId: string,
  limit = 12,
): WatchProgress[] {
  const rows = getDb()
    .prepare(
      `
      select *
      from watch_history
      where user_id = ?
        and progress_seconds > 0
      order by datetime(updated_at) desc, id desc
      `,
    )
    .all(profileId) as DbProgress[];

  const grouped = new Map<string, DbProgress[]>();
  for (const row of rows) {
    const key = `${row.media_type}:${row.tmdb_id}`;
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }

  return [...grouped.values()]
    .map(resolveContinueWatching)
    .filter((progress): progress is WatchProgress => Boolean(progress))
    .sort((left, right) => {
      const priorityDifference = resumePriority(left) - resumePriority(right);
      return priorityDifference || right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, limit);
}

export function getRecommendationLikes(
  profileId: string,
  limit = 32,
): LikeRecord[] {
  const explicitLikes = getLikes(profileId, limit);
  const seen = new Set(
    explicitLikes.map((item) => `${item.mediaType}:${item.tmdbId}`),
  );
  const completed = getDb()
    .prepare(
      `
      select history.tmdb_id as tmdbId, history.media_type as mediaType,
        history.title, history.poster_path as posterPath,
        history.backdrop_path as backdropPath,
        history.updated_at as likedAt,
        history.completion_source as completionSource,
        coalesce(metrics.completedSessions, 0) as completedSessions,
        coalesce(metrics.rewatchSessions, 0) as rewatchSessions
      from watch_history history
      left join (
        select tmdb_id, media_type,
          sum(case when completed = 1 then 1 else 0 end) as completedSessions,
          sum(rewatch) as rewatchSessions
        from watch_sessions
        where profile_id = ?
        group by tmdb_id, media_type
      ) metrics on metrics.tmdb_id = history.tmdb_id
        and metrics.media_type = history.media_type
      where history.user_id = ? and history.completed = 1
      order by datetime(history.updated_at) desc, history.id desc
    `,
    )
    .all(profileId, profileId) as Array<
      LikeRecord & { completedSessions: number; rewatchSessions: number }
    >;

  for (const item of completed) {
    if (item.completionSource === "manual_legacy") continue;
    const key = `${item.mediaType}:${item.tmdbId}`;
    if (seen.has(key)) continue;
    explicitLikes.push({
      ...item,
      signalOrigin: "completed",
      signalStrength: Math.min(
        1.25,
        completionSignalWeight(item.completionSource ?? "unknown") +
          (item.rewatchSessions > 0 ? 0.2 : 0) +
          (item.mediaType === "tv" && item.completedSessions >= 3 ? 0.12 : 0),
      ),
    });
    seen.add(key);
    if (explicitLikes.length >= limit) break;
  }
  return explicitLikes.slice(0, limit);
}

export function recordRecommendationImpressions(
  profileId: string,
  sessionId: string,
  impressions: RecommendationImpression[],
) {
  const normalizedSessionId = normalizeEventText(sessionId, 96);
  if (!normalizedSessionId || !getProfile(profileId)) return 0;
  const now = Date.now();
  const statement = getDb().prepare(
    `
      insert or ignore into recommendation_impressions (
        profile_id, session_id, tmdb_id, media_type, shelf_type,
        position, score, shown_at
      )
      values (
        @profileId, @sessionId, @tmdbId, @mediaType, @shelfType,
        @position, @score, @shownAt
      )
    `,
  );
  const items = impressions
    .slice(0, 160)
    .filter(
      (item) =>
        Number.isFinite(item.tmdbId) &&
        (item.mediaType === "movie" || item.mediaType === "tv"),
    );
  const transaction = getDb().transaction(() =>
    items.reduce(
      (count, item) =>
        count +
        statement.run({
          profileId,
          sessionId: normalizedSessionId,
          tmdbId: Math.floor(item.tmdbId),
          mediaType: item.mediaType,
          shelfType: normalizeEventText(item.shelfType, 80) || "home",
          position: clampInteger(item.position, 0, 1000),
          score: Number.isFinite(item.score) ? item.score : null,
          shownAt: now,
        }).changes,
      0,
    ),
  );
  return transaction();
}

export function markRecommendationImpression(
  profileId: string,
  input: {
    sessionId?: string;
    tmdbId: number;
    mediaType: MediaType;
    action: "clicked" | "played" | "completed" | "dismissed";
    shelfType?: string;
  },
) {
  const column = input.action;
  const sessionId = normalizeEventText(input.sessionId, 96);
  const row = getDb()
    .prepare(
      `
        select id
        from recommendation_impressions
        where profile_id = ? and tmdb_id = ? and media_type = ?
          and (? = '' or session_id = ?)
        order by shown_at desc, id desc
        limit 1
      `,
    )
    .get(
      profileId,
      Math.floor(input.tmdbId),
      input.mediaType,
      sessionId,
      sessionId,
    ) as { id: number } | undefined;
  if (!row) {
    if (!sessionId) return false;
    const shelfType =
      normalizeEventText(input.shelfType, 80) || "interaction";
    getDb()
      .prepare(
        `
          insert into recommendation_impressions (
            profile_id, session_id, tmdb_id, media_type, shelf_type,
            position, shown_at, ${column}
          )
          values (?, ?, ?, ?, ?, 0, ?, 1)
          on conflict(profile_id, session_id, tmdb_id, media_type, shelf_type)
          do update set ${column} = 1
        `,
      )
      .run(
        profileId,
        sessionId,
        Math.floor(input.tmdbId),
        input.mediaType,
        shelfType,
        Date.now(),
      );
    return true;
  }
  getDb()
    .prepare(
      `update recommendation_impressions set ${column} = 1 where id = ?`,
    )
    .run(row.id);
  return true;
}

export function getRecommendationExposures(
  profileId: string,
  days = 30,
): RecommendationExposure[] {
  const since = Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000;
  return getDb()
    .prepare(
      `
        select tmdb_id as tmdbId, media_type as mediaType,
          count(*) as shownCount, sum(clicked) as clickedCount,
          sum(played) as playedCount, sum(completed) as completedCount,
          sum(dismissed) as dismissedCount,
          sum(
            case
              when clicked = 0 and played = 0 and completed = 0 and dismissed = 0
              then 1 else 0
            end
          ) as ignoredCount,
          max(shown_at) as lastShownAt
        from recommendation_impressions
        where profile_id = ? and shown_at >= ?
        group by tmdb_id, media_type
      `,
    )
    .all(profileId, since) as RecommendationExposure[];
}

export function recordViewingEvent(
  profileId: string,
  input: ViewingEventInput,
) {
  if (!getProfile(profileId)) return false;

  const now = Date.now();
  const tmdbId = finiteIntegerOrNull(input.tmdbId);
  const mediaType =
    input.mediaType === "movie" || input.mediaType === "tv"
      ? input.mediaType
      : null;
  const sessionId = normalizeEventText(input.sessionId, 96);
  const seasonNumber = finiteIntegerOrNull(input.seasonNumber);
  const episodeNumber = finiteIntegerOrNull(input.episodeNumber);
  const positionSeconds = nonNegativeInteger(input.positionSeconds);
  const durationSeconds = nonNegativeInteger(input.durationSeconds);
  const database = getDb();
  const idempotencyKey = normalizeEventText(input.idempotencyKey, 128);

  if (
    idempotencyKey &&
    database
      .prepare(
        "select 1 from viewing_events where profile_id = ? and idempotency_key = ? limit 1",
      )
      .get(profileId, idempotencyKey)
  ) {
    return false;
  }

  const duplicateWindow =
    input.eventType === "VIEW_DETAILS"
      ? 30 * 60 * 1000
      : input.eventType === "COMPLETED"
        ? 10 * 60 * 1000
        : 0;
  if (duplicateWindow > 0) {
    const duplicate = database
      .prepare(
        `
        select 1
        from viewing_events
        where profile_id = ?
          and event_type = ?
          and coalesce(tmdb_id, -1) = coalesce(?, -1)
          and coalesce(media_type, '') = coalesce(?, '')
          and coalesce(season_number, -1) = coalesce(?, -1)
          and coalesce(episode_number, -1) = coalesce(?, -1)
          and occurred_at >= ?
        limit 1
      `,
      )
      .get(
        profileId,
        input.eventType,
        tmdbId,
        mediaType,
        seasonNumber,
        episodeNumber,
        now - duplicateWindow,
      );
    if (duplicate) return false;
  }

  if (input.eventType === "PLAY_STARTED" && sessionId) {
    const duplicate = database
      .prepare(
        `
        select 1
        from viewing_events
        where profile_id = ? and session_id = ? and event_type = 'PLAY_STARTED'
          and coalesce(tmdb_id, -1) = coalesce(?, -1)
          and coalesce(season_number, -1) = coalesce(?, -1)
          and coalesce(episode_number, -1) = coalesce(?, -1)
        limit 1
      `,
      )
      .get(profileId, sessionId, tmdbId, seasonNumber, episodeNumber);
    if (duplicate) return false;
  }

  const previous =
    sessionId && tmdbId !== null
      ? (database
          .prepare(
            `
            select occurred_at as occurredAt, position_seconds as positionSeconds
            from viewing_events
            where profile_id = ? and session_id = ?
              and tmdb_id = ?
              and coalesce(season_number, -1) = coalesce(?, -1)
              and coalesce(episode_number, -1) = coalesce(?, -1)
              and event_type in ('PLAY_STARTED', 'PROGRESS_UPDATED', 'PAUSED')
            order by occurred_at desc, id desc
            limit 1
          `,
          )
          .get(
            profileId,
            sessionId,
            tmdbId,
            seasonNumber,
            episodeNumber,
          ) as
          | { occurredAt: number; positionSeconds: number }
          | undefined)
      : undefined;
  const watchSeconds =
    input.watchSecondsOverride === undefined
      ? measuredWatchSeconds(input.eventType, now, positionSeconds, previous)
      : nonNegativeInteger(input.watchSecondsOverride);
  const estimatedWatchSeconds = Math.min(
    watchSeconds,
    nonNegativeInteger(input.estimatedWatchSeconds),
  );
  const providerWatchSeconds = Math.min(
    watchSeconds,
    nonNegativeInteger(input.providerWatchSeconds),
  );

  database
    .prepare(
      `
      insert into viewing_events (
        profile_id, session_id, tmdb_id, media_type, title, poster_path,
        event_type, occurred_at, season_number, episode_number,
        position_seconds, duration_seconds, watch_seconds, audio_language,
        subtitle_language, provider, genre_ids, timezone_offset_minutes,
        metadata_json, completion_source, tracking_confidence,
        estimated_watch_seconds, provider_watch_seconds, idempotency_key
      )
      values (
        @profileId, @sessionId, @tmdbId, @mediaType, @title, @posterPath,
        @eventType, @occurredAt, @seasonNumber, @episodeNumber,
        @positionSeconds, @durationSeconds, @watchSeconds, @audioLanguage,
        @subtitleLanguage, @provider, @genreIds, @timezoneOffsetMinutes,
        @metadataJson, @completionSource, @trackingConfidence,
        @estimatedWatchSeconds, @providerWatchSeconds, @idempotencyKey
      )
    `,
    )
    .run({
      profileId,
      sessionId,
      tmdbId,
      mediaType,
      title: normalizeEventText(input.title, 180),
      posterPath: input.posterPath ?? null,
      eventType: input.eventType,
      occurredAt: now,
      seasonNumber,
      episodeNumber,
      positionSeconds,
      durationSeconds,
      watchSeconds,
      audioLanguage: normalizeEventText(input.audioLanguage, 24),
      subtitleLanguage: input.subtitleLanguage
        ? normalizeEventText(input.subtitleLanguage, 24)
        : null,
      provider: normalizeEventText(input.provider, 80),
      genreIds: JSON.stringify(
        Array.isArray(input.genreIds)
          ? input.genreIds.map(Number).filter(Number.isFinite).slice(0, 12)
          : [],
      ),
      timezoneOffsetMinutes: clampInteger(
        input.timezoneOffsetMinutes,
        -14 * 60,
        14 * 60,
      ),
      metadataJson: JSON.stringify(input.metadata ?? {}),
      completionSource: input.completionSource ?? "unknown",
      trackingConfidence: input.trackingConfidence ?? "low",
      estimatedWatchSeconds,
      providerWatchSeconds,
      idempotencyKey,
    });
  if (tmdbId !== null && mediaType) {
    if (input.eventType === "PLAY_STARTED") {
      markRecommendationImpression(profileId, {
        tmdbId,
        mediaType,
        action: "played",
      });
    } else if (input.eventType === "COMPLETED") {
      markRecommendationImpression(profileId, {
        tmdbId,
        mediaType,
        action: "completed",
      });
    }
  }
  return true;
}

export function setLike(profileId: string, input: LikeInput) {
  if (!input.liked) {
    getDb()
      .prepare(
        "delete from user_likes where user_id = ? and tmdb_id = ? and media_type = ?",
      )
      .run(profileId, input.tmdbId, input.mediaType);
    return;
  }

  const database = getDb();
  database.transaction(() => {
    database
      .prepare(
        "delete from user_dislikes where user_id = ? and tmdb_id = ? and media_type = ?",
      )
      .run(profileId, input.tmdbId, input.mediaType);
    database
      .prepare(
        `
        insert into user_likes (
          user_id, tmdb_id, media_type, title, poster_path, backdrop_path,
          liked_at, signal_strength, signal_origin
        )
        values (
          @profileId, @tmdbId, @mediaType, @title, @posterPath, @backdropPath,
          datetime('now'), @signalStrength, @signalOrigin
        )
        on conflict(user_id, tmdb_id, media_type)
        do update set liked_at = datetime('now'), title = excluded.title,
          poster_path = excluded.poster_path, backdrop_path = excluded.backdrop_path,
          signal_strength = excluded.signal_strength,
          signal_origin = excluded.signal_origin
      `,
      )
      .run({
        ...input,
        profileId,
        posterPath: input.posterPath ?? null,
        backdropPath: input.backdropPath ?? null,
        signalStrength: clampSignalStrength(input.signalStrength, 1),
        signalOrigin: input.signalOrigin ?? "liked",
      });
  })();
}

export function getLikes(profileId: string, limit = 24): LikeRecord[] {
  return getDb()
    .prepare(
      `
      select tmdb_id as tmdbId, media_type as mediaType, title, poster_path as posterPath,
        backdrop_path as backdropPath, liked_at as likedAt,
        signal_strength as signalStrength, signal_origin as signalOrigin
      from user_likes
      where user_id = ?
      order by liked_at desc
      limit ?
    `,
    )
    .all(profileId, limit) as LikeRecord[];
}

export function hasLike(
  profileId: string,
  tmdbId: number,
  mediaType: MediaType,
) {
  const row = getDb()
    .prepare(
      "select 1 from user_likes where user_id = ? and tmdb_id = ? and media_type = ? limit 1",
    )
    .get(profileId, tmdbId, mediaType);
  return Boolean(row);
}

export function setWatchlist(profileId: string, input: WatchlistInput) {
  if (!input.included) {
    const removed = getDb()
      .prepare(
        "delete from user_watchlist where user_id = ? and tmdb_id = ? and media_type = ?",
      )
      .run(profileId, input.tmdbId, input.mediaType);
    if (removed.changes > 0) {
      setDislike(profileId, {
        ...input,
        disliked: true,
        signalStrength: 0.2,
        signalOrigin: "watchlist_removed",
        exactExclusion: false,
      });
    }
    return;
  }

  const database = getDb();
  database
    .prepare(
      `
      delete from user_dislikes
      where user_id = ? and tmdb_id = ? and media_type = ?
        and signal_origin = 'watchlist_removed' and exact_exclusion = 0
      `,
    )
    .run(profileId, input.tmdbId, input.mediaType);

  database
    .prepare(
      `
      insert into user_watchlist (
        user_id, tmdb_id, media_type, title, poster_path, backdrop_path, added_at
      )
      values (
        @profileId, @tmdbId, @mediaType, @title, @posterPath, @backdropPath, datetime('now')
      )
      on conflict(user_id, tmdb_id, media_type)
      do update set added_at = datetime('now'), title = excluded.title,
        poster_path = excluded.poster_path, backdrop_path = excluded.backdrop_path
    `,
    )
    .run({
      ...input,
      profileId,
      posterPath: input.posterPath ?? null,
      backdropPath: input.backdropPath ?? null,
    });
}

export function getWatchlist(
  profileId: string,
  limit = 48,
): WatchlistRecord[] {
  return getDb()
    .prepare(
      `
      select tmdb_id as tmdbId, media_type as mediaType, title,
        poster_path as posterPath, backdrop_path as backdropPath,
        added_at as addedAt
      from user_watchlist
      where user_id = ?
      order by added_at desc
      limit ?
    `,
    )
    .all(profileId, limit) as WatchlistRecord[];
}

export function hasWatchlist(
  profileId: string,
  tmdbId: number,
  mediaType: MediaType,
) {
  const row = getDb()
    .prepare(
      "select 1 from user_watchlist where user_id = ? and tmdb_id = ? and media_type = ? limit 1",
    )
    .get(profileId, tmdbId, mediaType);
  return Boolean(row);
}

export function setDislike(profileId: string, input: DislikeInput) {
  const database = getDb();
  if (!input.disliked) {
    database
      .prepare(
        "delete from user_dislikes where user_id = ? and tmdb_id = ? and media_type = ?",
      )
      .run(profileId, input.tmdbId, input.mediaType);
    return;
  }

  database.transaction(() => {
    if (input.exactExclusion !== false) {
      database
        .prepare(
          "delete from user_likes where user_id = ? and tmdb_id = ? and media_type = ?",
        )
        .run(profileId, input.tmdbId, input.mediaType);
    }
    database
      .prepare(
        `
        insert into user_dislikes (
          user_id, tmdb_id, media_type, title, poster_path, backdrop_path,
          genre_ids, original_language, disliked_at, signal_strength,
          signal_origin, exact_exclusion
        )
        values (
          @profileId, @tmdbId, @mediaType, @title, @posterPath, @backdropPath,
          @genreIds, @originalLanguage, datetime('now'), @signalStrength,
          @signalOrigin, @exactExclusion
        )
        on conflict(user_id, tmdb_id, media_type)
        do update set disliked_at = datetime('now'), title = excluded.title,
          poster_path = excluded.poster_path, backdrop_path = excluded.backdrop_path,
          genre_ids = excluded.genre_ids, original_language = excluded.original_language,
          signal_strength = max(user_dislikes.signal_strength, excluded.signal_strength),
          exact_exclusion = max(user_dislikes.exact_exclusion, excluded.exact_exclusion),
          signal_origin = case
            when excluded.exact_exclusion = 1 then excluded.signal_origin
            when excluded.signal_strength >= user_dislikes.signal_strength then excluded.signal_origin
            else user_dislikes.signal_origin
          end
      `,
      )
      .run({
        ...input,
        profileId,
        posterPath: input.posterPath ?? null,
        backdropPath: input.backdropPath ?? null,
        genreIds: JSON.stringify(input.genreIds ?? []),
        originalLanguage: input.originalLanguage ?? "",
        signalStrength: clampSignalStrength(input.signalStrength, 1),
        signalOrigin: input.signalOrigin ?? "explicit",
        exactExclusion: input.exactExclusion === false ? 0 : 1,
      });
  })();
}

export function getDislikes(profileId: string, limit = 48): DislikeRecord[] {
  const rows = getDb()
    .prepare(
      `
      select tmdb_id as tmdbId, media_type as mediaType, title,
        poster_path as posterPath, backdrop_path as backdropPath,
        genre_ids as genreIds, original_language as originalLanguage,
        disliked_at as dislikedAt, signal_strength as signalStrength,
        signal_origin as signalOrigin, exact_exclusion as exactExclusion
      from user_dislikes
      where user_id = ?
      order by disliked_at desc
      limit ?
    `,
    )
    .all(profileId, limit) as DbDislike[];

  return rows.map((row) => ({
    ...row,
    genreIds: parseNumberArray(row.genreIds),
    exactExclusion: Boolean(row.exactExclusion),
  }));
}

export function hasDislike(
  profileId: string,
  tmdbId: number,
  mediaType: MediaType,
) {
  const row = getDb()
    .prepare(
      "select 1 from user_dislikes where user_id = ? and tmdb_id = ? and media_type = ? and exact_exclusion = 1 limit 1",
    )
    .get(profileId, tmdbId, mediaType);
  return Boolean(row);
}

export function getWatchHistory(profileId: string): WatchHistoryRecord[] {
  return getDb()
    .prepare(
      `
      select tmdb_id as tmdbId, media_type as mediaType,
        completed, completion_source as completionSource,
        tracking_confidence as trackingConfidence,
        imported_at as importedAt, watched_at as watchedAt,
        progress_seconds as activePlaybackSeconds,
        provider_watch_seconds as extensionMeasuredSeconds,
        estimated_watch_seconds as estimatedSeconds,
        season_number as seasonNumber, episode_number as episodeNumber
      from watch_history
      where user_id = ? and (completed = 1 or progress_seconds > 0)
      order by id desc
      `,
    )
    .all(profileId) as WatchHistoryRecord[];
}

export function getRecommendationExclusions(
  profileId: string,
): RecommendationExclusion[] {
  const now = Date.now();
  const rows = getDb()
    .prepare(
      `
      select tmdb_id as tmdbId, media_type as mediaType, 'liked' as reason,
        null as expiresAt
      from user_likes where user_id = ?
      union all
      select tmdb_id, media_type, 'disliked', null
      from user_dislikes where user_id = ? and exact_exclusion = 1
      union all
      select tmdb_id, media_type, 'watchlist', null
      from user_watchlist where user_id = ?
      union all
      select distinct tmdb_id, media_type, 'watched', null
      from watch_history
      where user_id = ? and (completed = 1 or progress_seconds > 0)
      union all
      select tmdb_id, media_type, reason, expires_at
      from recommendation_suppressions
      where profile_id = ? and (expires_at is null or expires_at > ?)
      `,
    )
    .all(
      profileId,
      profileId,
      profileId,
      profileId,
      profileId,
      now,
    ) as RecommendationExclusion[];

  return rows;
}

export function setRecommendationSuppression(
  profileId: string,
  input: {
    tmdbId: number;
    mediaType: MediaType;
    reason: "not-now" | "never";
    days?: number;
  },
) {
  const now = Date.now();
  const expiresAt = input.reason === "not-now"
    ? now + Math.max(1, Math.min(30, input.days ?? 7)) * 24 * 60 * 60 * 1000
    : null;
  getDb()
    .prepare(
      `
      insert into recommendation_suppressions (
        profile_id, tmdb_id, media_type, reason, expires_at, created_at
      ) values (?, ?, ?, ?, ?, ?)
      on conflict(profile_id, tmdb_id, media_type)
      do update set
        reason = case
          when recommendation_suppressions.reason = 'never' then 'never'
          else excluded.reason
        end,
        expires_at = case
          when recommendation_suppressions.reason = 'never' then null
          else excluded.expires_at
        end,
        created_at = excluded.created_at
      `,
    )
    .run(
      profileId,
      Math.floor(input.tmdbId),
      input.mediaType,
      input.reason,
      expiresAt,
      now,
    );
  return { reason: input.reason, expiresAt };
}

export function importWatchHistory(
  profileId: string,
  input: HistoryImportInput,
) {
  if (!getProfile(profileId)) throw new Error("Profil introuvable.");
  const episodeCounts = sanitizeEpisodeCounts(input.seriesEpisodeCounts);
  const available = new Map(
    episodeCounts.map((item) => [item.seasonNumber, item.episodeCount]),
  );
  const episodes = uniqueHistoryEpisodes(input.episodes).filter(
    (item) =>
      item.seasonNumber > 0 &&
      item.episodeNumber > 0 &&
      item.episodeNumber <= (available.get(item.seasonNumber) ?? 0),
  );
  if (!episodes.length) return { imported: 0, alreadyKnown: 0 };

  const database = getDb();
  const now = Date.now();
  const statement = database.prepare(
    `
    insert into watch_history (
      user_id, tmdb_id, media_type, season_number, episode_number, title,
      poster_path, backdrop_path, progress_seconds, duration_seconds,
      completed, completion_source, tracking_confidence, manual_marked_at,
      estimated_watch_seconds, provider_watch_seconds, series_episode_counts,
      imported_at, watched_at, history_origin, updated_at
    ) values (
      @profileId, @tmdbId, 'tv', @seasonNumber, @episodeNumber, @title,
      @posterPath, @backdropPath, 0, 0,
      1, 'manual_legacy', 'low', null,
      0, 0, @seriesEpisodeCounts,
      @importedAt, null, 'import', datetime('now')
    )
    on conflict(user_id, tmdb_id, media_type, season_number, episode_number)
    do update set
      title = excluded.title,
      poster_path = coalesce(excluded.poster_path, watch_history.poster_path),
      backdrop_path = coalesce(excluded.backdrop_path, watch_history.backdrop_path),
      completed = 1,
      completion_source = case
        when watch_history.completed = 1 then watch_history.completion_source
        else 'manual_legacy'
      end,
      tracking_confidence = case
        when watch_history.completed = 1 then watch_history.tracking_confidence
        else 'low'
      end,
      series_episode_counts = excluded.series_episode_counts,
      imported_at = case
        when watch_history.completed = 1 then watch_history.imported_at
        else coalesce(watch_history.imported_at, excluded.imported_at)
      end,
      history_origin = case
        when watch_history.completed = 1 then watch_history.history_origin
        else 'import'
      end
    `,
  );
  const existing = database.prepare(
    `
    select 1 from watch_history
    where user_id = ? and tmdb_id = ? and media_type = 'tv'
      and season_number = ? and episode_number = ? and completed = 1
    limit 1
    `,
  );
  const payload = {
    profileId,
    tmdbId: Math.floor(input.tmdbId),
    title: normalizeEventText(input.title, 180) || "Serie",
    posterPath: input.posterPath ?? null,
    backdropPath: input.backdropPath ?? null,
    seriesEpisodeCounts: JSON.stringify(episodeCounts),
    importedAt: now,
  };
  const result = database.transaction(() => {
    let alreadyKnown = 0;
    for (const item of episodes) {
      if (
        existing.get(
          profileId,
          payload.tmdbId,
          item.seasonNumber,
          item.episodeNumber,
        )
      ) {
        alreadyKnown += 1;
      }
      statement.run({ ...payload, ...item });
    }
    return { imported: episodes.length - alreadyKnown, alreadyKnown };
  })();

  if (input.sentiment === "liked") {
    setLike(profileId, {
      ...input,
      mediaType: "tv",
      liked: true,
      signalOrigin: "manual_legacy",
      signalStrength: 0.5,
    });
  } else if (input.sentiment === "disliked") {
    setDislike(profileId, {
      ...input,
      mediaType: "tv",
      disliked: true,
      signalOrigin: "manual_legacy",
      signalStrength: 0.5,
      exactExclusion: true,
    });
  }

  return result;
}

export function importLegacyTitleHistory(
  profileId: string,
  input: {
    tmdbId: number;
    mediaType: MediaType;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    title: string;
    posterPath?: string | null;
    backdropPath?: string | null;
    seriesEpisodeCounts?: HistoryImportInput["seriesEpisodeCounts"];
  },
) {
  const database = getDb();
  const existing = database
    .prepare(
      `
      select completed from watch_history
      where user_id = ? and tmdb_id = ? and media_type = ?
        and coalesce(season_number, -1) = coalesce(?, -1)
        and coalesce(episode_number, -1) = coalesce(?, -1)
      limit 1
      `,
    )
    .get(
      profileId,
      input.tmdbId,
      input.mediaType,
      input.seasonNumber ?? null,
      input.episodeNumber ?? null,
    ) as { completed: 0 | 1 } | undefined;
  if (existing?.completed) return { imported: false, alreadyKnown: true };

  saveProgress(profileId, {
    ...input,
    progressSeconds: 0,
    durationSeconds: 0,
    completed: true,
    completionSource: "manual_legacy",
    trackingConfidence: "low",
    estimatedWatchSeconds: 0,
    providerWatchSeconds: 0,
  });
  database
    .prepare(
      `
      update watch_history set imported_at = coalesce(imported_at, ?),
        watched_at = null, history_origin = 'import'
      where user_id = ? and tmdb_id = ? and media_type = ?
        and coalesce(season_number, -1) = coalesce(?, -1)
        and coalesce(episode_number, -1) = coalesce(?, -1)
      `,
    )
    .run(
      Date.now(),
      profileId,
      input.tmdbId,
      input.mediaType,
      input.seasonNumber ?? null,
      input.episodeNumber ?? null,
    );
  return { imported: true, alreadyKnown: false };
}

type DbProgress = {
  tmdb_id: number;
  media_type: MediaType;
  season_number: number | null;
  episode_number: number | null;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  progress_seconds: number;
  duration_seconds: number;
  completed: 0 | 1;
  completion_source: CompletionSource;
  tracking_confidence: TrackingConfidence;
  manual_marked_at: number | null;
  estimated_watch_seconds: number;
  provider_watch_seconds: number;
  series_episode_counts: string;
  updated_at: string;
};

function mapProgress(row: DbProgress): WatchProgress {
  return {
    tmdbId: row.tmdb_id,
    mediaType: row.media_type,
    seasonNumber: row.season_number,
    episodeNumber: row.episode_number,
    title: row.title,
    posterPath: row.poster_path,
    backdropPath: row.backdrop_path,
    progressSeconds: row.progress_seconds,
    durationSeconds: row.duration_seconds,
    completed: Boolean(row.completed),
    completionSource: row.completion_source ?? "unknown",
    trackingConfidence: row.tracking_confidence ?? "low",
    manuallyMarkedAt: row.manual_marked_at
      ? new Date(row.manual_marked_at).toISOString()
      : null,
    estimatedWatchSeconds: row.estimated_watch_seconds ?? 0,
    providerWatchSeconds: row.provider_watch_seconds ?? 0,
    seriesEpisodeCounts: parseEpisodeCounts(row.series_episode_counts),
    updatedAt: row.updated_at,
  };
}

function resolveContinueWatching(rows: DbProgress[]) {
  const latest = rows[0];
  if (!latest) return null;
  if (latest.media_type === "movie") {
    return latest.completed ? null : annotateResume(mapProgress(latest));
  }

  const episodeCounts =
    rows.map((row) => parseEpisodeCounts(row.series_episode_counts))
      .find((counts) => counts.length > 0) ?? [];
  const latestIncomplete = rows.find((row) => !row.completed);
  if (latestIncomplete) return annotateResume(mapProgress(latestIncomplete));
  if (!episodeCounts.length) return null;

  const completedEpisodes = new Set(
    rows
      .filter(
        (row) =>
          row.completed &&
          row.season_number !== null &&
          row.episode_number !== null,
      )
      .map((row) => `${row.season_number}:${row.episode_number}`),
  );
  const allEpisodes = episodeCounts.flatMap(({ seasonNumber, episodeCount }) =>
    Array.from({ length: episodeCount }, (_, index) => ({
      seasonNumber,
      episodeNumber: index + 1,
    })),
  );
  const nextEpisode = allEpisodes.find(
    (episode) =>
      !completedEpisodes.has(
        `${episode.seasonNumber}:${episode.episodeNumber}`,
      ),
  );
  if (!nextEpisode) return null;

  return annotateResume({
    ...mapProgress(latest),
    seasonNumber: nextEpisode.seasonNumber,
    episodeNumber: nextEpisode.episodeNumber,
    progressSeconds: 0,
    durationSeconds: 0,
    completed: false,
    seriesEpisodeCounts: episodeCounts,
  }, "next-episode");
}

function annotateResume(
  progress: WatchProgress,
  forcedKind?: NonNullable<WatchProgress["resumeKind"]>,
): WatchProgress {
  const remainingSeconds = progress.durationSeconds > 0
    ? Math.max(0, progress.durationSeconds - progress.progressSeconds)
    : undefined;
  const inactiveDays = Math.max(
    0,
    (Date.now() - new Date(progress.updatedAt).getTime()) / 86_400_000,
  );
  const kind = forcedKind ??
    (inactiveDays >= 14 && progress.mediaType === "tv"
      ? "returning-series"
      : remainingSeconds !== undefined &&
          remainingSeconds > 0 &&
          remainingSeconds <= 20 * 60
        ? "almost-finished"
        : "continue-now");
  const episodeLabel =
    progress.mediaType === "tv" &&
    progress.seasonNumber &&
    progress.episodeNumber
      ? `S${progress.seasonNumber} E${progress.episodeNumber}`
      : "Film";
  const resumeLabel = kind === "next-episode"
    ? `${episodeLabel} · Episode suivant`
    : kind === "returning-series"
      ? `${episodeLabel} · Reprendre apres ${Math.floor(inactiveDays)} jours`
      : kind === "almost-finished" && remainingSeconds !== undefined
        ? `${episodeLabel} · ${Math.max(1, Math.ceil(remainingSeconds / 60))} min restantes`
        : `${episodeLabel} · Reprendre a ${formatResumeTime(progress.progressSeconds)}`;
  return {
    ...progress,
    resumeKind: kind,
    resumeLabel,
    remainingSeconds,
  };
}

function resumePriority(progress: WatchProgress) {
  const priorities: Record<string, number> = {
    "continue-now": 0,
    "almost-finished": 1,
    "next-episode": 2,
    "returning-series": 3,
    rewatch: 4,
  };
  return priorities[progress.resumeKind ?? "continue-now"] ?? 5;
}

function formatResumeTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function isPlaybackComplete(input: ProgressInput) {
  if (input.completed) return true;
  return evaluateCompletion({
    providerProgressSeconds: input.progressSeconds,
    officialRuntimeSeconds: input.durationSeconds,
  }).completed;
}

function sanitizeEpisodeCounts(
  counts: ProgressInput["seriesEpisodeCounts"],
) {
  if (!Array.isArray(counts)) return [];
  return counts
    .map((item) => ({
      seasonNumber: Math.floor(Number(item.seasonNumber)),
      episodeCount: Math.max(0, Math.floor(Number(item.episodeCount))),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.seasonNumber) &&
        Number.isFinite(item.episodeCount) &&
        item.seasonNumber > 0 &&
        item.episodeCount > 0,
    );
}

function parseEpisodeCounts(value: string) {
  try {
    return sanitizeEpisodeCounts(JSON.parse(value) as ProgressInput["seriesEpisodeCounts"]);
  } catch {
    return [];
  }
}

function ensureColumn(
  database: Database.Database,
  table: string,
  column: string,
  definition: string,
) {
  const columns = database.prepare(`pragma table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (columns.some((item) => item.name === column)) return;
  database.exec(`alter table ${table} add column ${column} ${definition}`);
}

function parseNumberArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map(Number).filter(Number.isFinite)
      : [];
  } catch {
    return [];
  }
}

function uniqueHistoryEpisodes(episodes: HistoryImportEpisode[]) {
  const unique = new Map<string, HistoryImportEpisode>();
  for (const item of episodes) {
    const seasonNumber = Math.floor(Number(item.seasonNumber));
    const episodeNumber = Math.floor(Number(item.episodeNumber));
    if (!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) {
      continue;
    }
    unique.set(`${seasonNumber}:${episodeNumber}`, {
      seasonNumber,
      episodeNumber,
    });
  }
  return [...unique.values()].slice(0, 5000);
}

function clampSignalStrength(value: number | undefined, fallback: number) {
  const strength = Number(value);
  return Number.isFinite(strength)
    ? Math.max(0, Math.min(1, strength))
    : fallback;
}

function measuredWatchSeconds(
  eventType: ViewingEventType,
  now: number,
  positionSeconds: number,
  previous:
    | { occurredAt: number; positionSeconds: number }
    | undefined,
) {
  if (
    !previous ||
    !["PROGRESS_UPDATED", "PAUSED", "COMPLETED"].includes(eventType)
  ) {
    return 0;
  }
  const positionDelta = positionSeconds - previous.positionSeconds;
  if (positionDelta <= 0) return 0;
  const wallSeconds = Math.max(
    0,
    Math.floor((now - previous.occurredAt) / 1000),
  );
  const measuredSeconds = Math.min(positionDelta, wallSeconds + 5);

  // A completion is already bounded by both the player position and elapsed
  // wall time. Keeping the regular 120 s heartbeat cap here discarded almost
  // entire movies when a provider only emitted PLAY_STARTED and COMPLETED.
  if (eventType === "COMPLETED") {
    return Math.max(0, Math.floor(measuredSeconds));
  }

  return Math.max(0, Math.floor(Math.min(measuredSeconds, 120)));
}

function runMigration(
  database: Database.Database,
  id: string,
  migrate: () => void,
) {
  const applied = database
    .prepare("select 1 from app_migrations where id = ? limit 1")
    .get(id);
  if (applied) return;

  database.transaction(() => {
    migrate();
    database
      .prepare("insert into app_migrations (id, applied_at) values (?, ?)")
      .run(id, Date.now());
  })();
}

function repairCompletionWatchSeconds(database: Database.Database) {
  const completions = database
    .prepare(
      `
      select id, profile_id as profileId, session_id as sessionId,
        tmdb_id as tmdbId, season_number as seasonNumber,
        episode_number as episodeNumber, occurred_at as occurredAt,
        position_seconds as positionSeconds, watch_seconds as watchSeconds
      from viewing_events
      where event_type = 'COMPLETED' and session_id <> ''
      order by occurred_at, id
    `,
    )
    .all() as Array<{
    id: number;
    profileId: string;
    sessionId: string;
    tmdbId: number | null;
    seasonNumber: number | null;
    episodeNumber: number | null;
    occurredAt: number;
    positionSeconds: number;
    watchSeconds: number;
  }>;
  const previousStatement = database.prepare(
    `
    select occurred_at as occurredAt, position_seconds as positionSeconds
    from viewing_events
    where profile_id = ? and session_id = ?
      and coalesce(tmdb_id, -1) = coalesce(?, -1)
      and coalesce(season_number, -1) = coalesce(?, -1)
      and coalesce(episode_number, -1) = coalesce(?, -1)
      and event_type in ('PLAY_STARTED', 'PROGRESS_UPDATED', 'PAUSED')
      and (occurred_at < ? or (occurred_at = ? and id < ?))
    order by occurred_at desc, id desc
    limit 1
  `,
  );
  const updateStatement = database.prepare(
    "update viewing_events set watch_seconds = ? where id = ?",
  );

  for (const completion of completions) {
    const previous = previousStatement.get(
      completion.profileId,
      completion.sessionId,
      completion.tmdbId,
      completion.seasonNumber,
      completion.episodeNumber,
      completion.occurredAt,
      completion.occurredAt,
      completion.id,
    ) as
      | { occurredAt: number; positionSeconds: number }
      | undefined;
    const repaired = measuredWatchSeconds(
      "COMPLETED",
      completion.occurredAt,
      completion.positionSeconds,
      previous,
    );
    if (repaired > completion.watchSeconds) {
      updateStatement.run(repaired, completion.id);
    }
  }
}

function finiteIntegerOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : null;
}

function nonNegativeInteger(value: unknown) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function clampInteger(value: unknown, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Math.floor(Number(value) || 0)));
}

function normalizeEventText(value: unknown, maximumLength: number) {
  return String(value ?? "").trim().slice(0, maximumLength);
}

function normalizeProfileName(value: string) {
  const name = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);
  if (name.length < 2) {
    throw new Error("Le nom du profil doit contenir au moins 2 caracteres.");
  }
  return name;
}

function normalizeProfileColor(value: string | undefined) {
  return PROFILE_COLORS.includes(value as (typeof PROFILE_COLORS)[number])
    ? value!
    : PROFILE_COLORS[0];
}

function mapProfile(row: DbProfile): Profile {
  return {
    ...row,
    hasPin: Boolean(row.hasPin),
  };
}

function createPinRecord(pin: string | undefined) {
  const normalizedPin = String(pin ?? "").trim();
  if (!normalizedPin) return { hash: null, salt: null };
  if (!isValidPin(normalizedPin)) {
    throw new Error(
      `Le code PIN doit contenir exactement ${PROFILE_PIN_LENGTH} chiffres.`,
    );
  }
  const salt = randomBytes(16).toString("hex");
  return {
    hash: scryptSync(normalizedPin, salt, 32).toString("hex"),
    salt,
  };
}

function isValidPin(pin: string) {
  return new RegExp(`^\\d{${PROFILE_PIN_LENGTH}}$`).test(pin);
}

function tableExists(database: Database.Database, table: string) {
  return Boolean(
    database
      .prepare(
        `
        select 1
        from sqlite_master
        where type = 'table' and name = ?
        limit 1
      `,
      )
      .get(table),
  );
}

function tableHasRows(database: Database.Database, table: string) {
  return Boolean(
    (
      database.prepare(`select count(*) as count from ${table}`).get() as {
        count: number;
      }
    ).count,
  );
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
