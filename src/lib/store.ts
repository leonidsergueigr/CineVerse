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
  SeriesProgressSummary,
  WatchProgress,
} from "@/lib/types";

type ProgressInput = {
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
};

type ApiCacheRow = {
  payload: string;
  expires_at: number;
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

    create table if not exists external_api_cache (
      cache_key text primary key,
      payload text not null,
      expires_at integer not null,
      updated_at integer not null
    );

    create index if not exists external_api_cache_expiry
      on external_api_cache(expires_at);
  `);
  ensureColumn(
    db,
    "watch_history",
    "series_episode_counts",
    "text not null default '[]'",
  );
  ensureColumn(db, "profiles", "pin_hash", "text");
  ensureColumn(db, "profiles", "pin_salt", "text");
  if (hadLegacyPersonalData) {
    db.prepare(
      `
      insert or ignore into profiles (id, name, color)
      values (?, 'Principal', ?)
    `,
    ).run(LEGACY_PROFILE_ID, PROFILE_COLORS[0]);
  }

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
    database.prepare("delete from user_likes where user_id = ?").run(profileId);
    database.prepare("delete from user_dislikes where user_id = ?").run(profileId);
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
  const completed = isPlaybackComplete(input) ? 1 : 0;
  const seriesEpisodeCounts = JSON.stringify(
    sanitizeEpisodeCounts(input.seriesEpisodeCounts),
  );

  const database = getDb();
  const payload = { ...input, profileId, completed, seriesEpisodeCounts };

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
        series_episode_counts = case
          when @seriesEpisodeCounts = '[]' then series_episode_counts
          else @seriesEpisodeCounts
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

  if (updated.changes > 0) return;

  database
    .prepare(
      `
      insert into watch_history (
        user_id, tmdb_id, media_type, season_number, episode_number, title,
        poster_path, backdrop_path, progress_seconds, duration_seconds, completed,
        series_episode_counts, updated_at
      )
      values (@profileId, @tmdbId, @mediaType, @seasonNumber, @episodeNumber, @title,
        @posterPath, @backdropPath, @progressSeconds, @durationSeconds, @completed,
        @seriesEpisodeCounts, datetime('now'))
    `,
    )
    .run(payload);
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
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
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
        insert into user_likes (user_id, tmdb_id, media_type, title, poster_path, backdrop_path, liked_at)
        values (@profileId, @tmdbId, @mediaType, @title, @posterPath, @backdropPath, datetime('now'))
        on conflict(user_id, tmdb_id, media_type)
        do update set liked_at = datetime('now'), title = excluded.title,
          poster_path = excluded.poster_path, backdrop_path = excluded.backdrop_path
      `,
      )
      .run({ ...input, profileId });
  })();
}

export function getLikes(profileId: string, limit = 24): LikeRecord[] {
  return getDb()
    .prepare(
      `
      select tmdb_id as tmdbId, media_type as mediaType, title, poster_path as posterPath,
        backdrop_path as backdropPath, liked_at as likedAt
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
    database
      .prepare(
        "delete from user_likes where user_id = ? and tmdb_id = ? and media_type = ?",
      )
      .run(profileId, input.tmdbId, input.mediaType);
    database
      .prepare(
        `
        insert into user_dislikes (
          user_id, tmdb_id, media_type, title, poster_path, backdrop_path,
          genre_ids, original_language, disliked_at
        )
        values (
          @profileId, @tmdbId, @mediaType, @title, @posterPath, @backdropPath,
          @genreIds, @originalLanguage, datetime('now')
        )
        on conflict(user_id, tmdb_id, media_type)
        do update set disliked_at = datetime('now'), title = excluded.title,
          poster_path = excluded.poster_path, backdrop_path = excluded.backdrop_path,
          genre_ids = excluded.genre_ids, original_language = excluded.original_language
      `,
      )
      .run({
        ...input,
        profileId,
        genreIds: JSON.stringify(input.genreIds ?? []),
        originalLanguage: input.originalLanguage ?? "",
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
        disliked_at as dislikedAt
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
  }));
}

export function hasDislike(
  profileId: string,
  tmdbId: number,
  mediaType: MediaType,
) {
  const row = getDb()
    .prepare(
      "select 1 from user_dislikes where user_id = ? and tmdb_id = ? and media_type = ? limit 1",
    )
    .get(profileId, tmdbId, mediaType);
  return Boolean(row);
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
    seriesEpisodeCounts: parseEpisodeCounts(row.series_episode_counts),
    updatedAt: row.updated_at,
  };
}

function resolveContinueWatching(rows: DbProgress[]) {
  const latest = rows[0];
  if (!latest) return null;
  if (latest.media_type === "movie") {
    return latest.completed ? null : mapProgress(latest);
  }

  const episodeCounts =
    rows.map((row) => parseEpisodeCounts(row.series_episode_counts))
      .find((counts) => counts.length > 0) ?? [];
  const latestIncomplete = rows.find((row) => !row.completed);
  if (latestIncomplete) return mapProgress(latestIncomplete);
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

  return {
    ...mapProgress(latest),
    seasonNumber: nextEpisode.seasonNumber,
    episodeNumber: nextEpisode.episodeNumber,
    progressSeconds: 0,
    durationSeconds: 0,
    completed: false,
    seriesEpisodeCounts: episodeCounts,
  };
}

function isPlaybackComplete(input: ProgressInput) {
  if (input.completed) return true;
  if (input.durationSeconds <= 0) return false;

  const ratio = input.progressSeconds / input.durationSeconds;
  const remainingSeconds = Math.max(
    0,
    input.durationSeconds - input.progressSeconds,
  );
  const creditsWindow = input.mediaType === "movie" ? 7 * 60 : 3 * 60;
  return ratio >= 0.9 || (ratio >= 0.75 && remainingSeconds <= creditsWindow);
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
