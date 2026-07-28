import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { LikeRecord, MediaType, WatchProgress } from "@/lib/types";

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

let db: Database.Database | null = null;

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
  `);

  return db;
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

  getDb()
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
