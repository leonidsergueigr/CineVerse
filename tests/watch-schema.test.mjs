import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { applyWatchTrackingSchema } from "../src/lib/watch-schema.ts";

test("la migration hybride est additive, idempotente et prudente", () => {
  const database = new Database(":memory:");
  database.exec(`
    create table watch_history (
      id integer primary key,
      user_id text not null,
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
      updated_at text not null default current_timestamp
    );
    create table viewing_events (
      id integer primary key,
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
    insert into watch_history (
      id, user_id, tmdb_id, media_type, title, completed
    ) values (1, 'p1', 1, 'movie', 'Termine', 1),
             (2, 'p1', 2, 'movie', 'En cours', 0);
    insert into viewing_events (
      id, profile_id, event_type, occurred_at
    ) values (1, 'p1', 'COMPLETED', 1),
             (2, 'p1', 'PLAY_STARTED', 2);
  `);

  applyWatchTrackingSchema(database);
  applyWatchTrackingSchema(database);

  const history = database
    .prepare("select completion_source as source, tracking_confidence as confidence from watch_history order by id")
    .all();
  assert.deepEqual(history, [
    { source: "legacy", confidence: "low" },
    { source: "unknown", confidence: "low" },
  ]);
  const events = database
    .prepare("select completion_source as source from viewing_events order by id")
    .all();
  assert.deepEqual(events, [{ source: "legacy" }, { source: "unknown" }]);
  assert.ok(
    database
      .prepare("select 1 from sqlite_master where type = 'table' and name = 'watch_sessions'")
      .get(),
  );
  assert.equal(
    database
      .prepare("select count(*) as count from app_migrations where id = 'hybrid-watch-tracking-v1'")
      .get().count,
    1,
  );
  assert.equal(
    database
      .prepare("select count(*) as count from app_migrations where id = 'taste-history-v4'")
      .get().count,
    1,
  );
  assert.ok(
    database
      .prepare("select 1 from sqlite_master where type = 'table' and name = 'recommendation_suppressions'")
      .get(),
  );
  const historyColumns = database
    .prepare("pragma table_info(watch_history)")
    .all()
    .map((column) => column.name);
  assert.ok(historyColumns.includes("imported_at"));
  assert.ok(historyColumns.includes("watched_at"));
  assert.ok(historyColumns.includes("history_origin"));
  assert.equal(
    database
      .prepare("select count(*) as count from app_migrations where id = 'browser-extension-tracking-v2'")
      .get().count,
    1,
  );
  const sessionColumns = database
    .prepare("pragma table_info(watch_sessions)")
    .all()
    .map((column) => column.name);
  assert.ok(sessionColumns.includes("last_provider_observed_seconds"));
  assert.ok(sessionColumns.includes("last_provider_observer_id"));
  assert.ok(sessionColumns.includes("last_provider_observer_sequence"));
  assert.ok(sessionColumns.includes("tracking_method"));
  database.close();
});
