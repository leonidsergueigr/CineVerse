import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type {
  DislikeRecord,
  LikeRecord,
  MediaType,
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

let db: Database.Database | null = null;
let lastCachePrune = 0;

export function getDb() {
  if (db) return db;

  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(path.join(dataDir, "cineverse.sqlite"));
  db.pragma("journal_mode = WAL");
  db.exec(`
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

  return db;
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

export function saveProgress(input: ProgressInput) {
  const completed =
    input.durationSeconds > 0 && input.progressSeconds / input.durationSeconds >= 0.9 ? 1 : 0;

  const database = getDb();
  const payload = { ...input, completed };

  const updated = database
    .prepare(
      `
      update watch_history set
        title = @title,
        poster_path = @posterPath,
        backdrop_path = @backdropPath,
        progress_seconds = @progressSeconds,
        duration_seconds = @durationSeconds,
        completed = @completed,
        updated_at = datetime('now')
      where user_id = 'local'
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
        poster_path, backdrop_path, progress_seconds, duration_seconds, completed, updated_at
      )
      values ('local', @tmdbId, @mediaType, @seasonNumber, @episodeNumber, @title,
        @posterPath, @backdropPath, @progressSeconds, @durationSeconds, @completed, datetime('now'))
    `,
    )
    .run(payload);
}

export function getProgress(
  tmdbId: number,
  mediaType: MediaType,
  seasonNumber: number | null,
  episodeNumber: number | null,
): WatchProgress | null {
  const row = getDb()
    .prepare(
      `
      select * from watch_history
      where user_id = 'local'
        and tmdb_id = ?
        and media_type = ?
        and coalesce(season_number, -1) = coalesce(?, -1)
        and coalesce(episode_number, -1) = coalesce(?, -1)
      limit 1
    `,
    )
    .get(tmdbId, mediaType, seasonNumber, episodeNumber) as DbProgress | undefined;

  return row ? mapProgress(row) : null;
}

export function getContinueWatching(limit = 12): WatchProgress[] {
  const rows = getDb()
    .prepare(
      `
      with ranked_history as (
        select *,
          row_number() over (
            partition by user_id, tmdb_id, media_type
            order by datetime(updated_at) desc, id desc
          ) as media_rank
        from watch_history
        where user_id = 'local'
      )
      select * from ranked_history
      where media_rank = 1
        and completed = 0
        and progress_seconds > 0
      order by datetime(updated_at) desc, id desc
      limit ?
    `,
    )
    .all(limit) as DbProgress[];

  return rows.map(mapProgress);
}

export function setLike(input: LikeInput) {
  if (!input.liked) {
    getDb()
      .prepare(
        "delete from user_likes where user_id = 'local' and tmdb_id = ? and media_type = ?",
      )
      .run(input.tmdbId, input.mediaType);
    return;
  }

  const database = getDb();
  database.transaction(() => {
    database
      .prepare(
        "delete from user_dislikes where user_id = 'local' and tmdb_id = ? and media_type = ?",
      )
      .run(input.tmdbId, input.mediaType);
    database
      .prepare(
        `
        insert into user_likes (user_id, tmdb_id, media_type, title, poster_path, backdrop_path, liked_at)
        values ('local', @tmdbId, @mediaType, @title, @posterPath, @backdropPath, datetime('now'))
        on conflict(user_id, tmdb_id, media_type)
        do update set liked_at = datetime('now'), title = excluded.title,
          poster_path = excluded.poster_path, backdrop_path = excluded.backdrop_path
      `,
      )
      .run(input);
  })();
}

export function getLikes(limit = 24): LikeRecord[] {
  return getDb()
    .prepare(
      `
      select tmdb_id as tmdbId, media_type as mediaType, title, poster_path as posterPath,
        backdrop_path as backdropPath, liked_at as likedAt
      from user_likes
      where user_id = 'local'
      order by liked_at desc
      limit ?
    `,
    )
    .all(limit) as LikeRecord[];
}

export function hasLike(tmdbId: number, mediaType: MediaType) {
  const row = getDb()
    .prepare(
      "select 1 from user_likes where user_id = 'local' and tmdb_id = ? and media_type = ? limit 1",
    )
    .get(tmdbId, mediaType);
  return Boolean(row);
}

export function setDislike(input: DislikeInput) {
  const database = getDb();
  if (!input.disliked) {
    database
      .prepare(
        "delete from user_dislikes where user_id = 'local' and tmdb_id = ? and media_type = ?",
      )
      .run(input.tmdbId, input.mediaType);
    return;
  }

  database.transaction(() => {
    database
      .prepare(
        "delete from user_likes where user_id = 'local' and tmdb_id = ? and media_type = ?",
      )
      .run(input.tmdbId, input.mediaType);
    database
      .prepare(
        `
        insert into user_dislikes (
          user_id, tmdb_id, media_type, title, poster_path, backdrop_path,
          genre_ids, original_language, disliked_at
        )
        values (
          'local', @tmdbId, @mediaType, @title, @posterPath, @backdropPath,
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
        genreIds: JSON.stringify(input.genreIds ?? []),
        originalLanguage: input.originalLanguage ?? "",
      });
  })();
}

export function getDislikes(limit = 48): DislikeRecord[] {
  const rows = getDb()
    .prepare(
      `
      select tmdb_id as tmdbId, media_type as mediaType, title,
        poster_path as posterPath, backdrop_path as backdropPath,
        genre_ids as genreIds, original_language as originalLanguage,
        disliked_at as dislikedAt
      from user_dislikes
      where user_id = 'local'
      order by disliked_at desc
      limit ?
    `,
    )
    .all(limit) as DbDislike[];

  return rows.map((row) => ({
    ...row,
    genreIds: parseNumberArray(row.genreIds),
  }));
}

export function hasDislike(tmdbId: number, mediaType: MediaType) {
  const row = getDb()
    .prepare(
      "select 1 from user_dislikes where user_id = 'local' and tmdb_id = ? and media_type = ? limit 1",
    )
    .get(tmdbId, mediaType);
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
    updatedAt: row.updated_at,
  };
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
