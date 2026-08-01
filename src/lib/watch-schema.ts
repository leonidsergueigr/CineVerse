import type Database from "better-sqlite3";

const HYBRID_TRACKING_MIGRATION = "hybrid-watch-tracking-v1";
const BROWSER_EXTENSION_TRACKING_MIGRATION = "browser-extension-tracking-v2";
const PLAYBACK_INTELLIGENCE_MIGRATION = "playback-intelligence-v3";

export function applyWatchTrackingSchema(database: Database.Database) {
  database.exec(`
    create table if not exists app_migrations (
      id text primary key,
      applied_at integer not null
    );

    create table if not exists watch_sessions (
      id text primary key,
      profile_id text not null,
      tmdb_id integer not null,
      media_type text not null check (media_type in ('movie', 'tv')),
      series_id integer,
      season_number integer,
      episode_number integer,
      title text not null default '',
      poster_path text,
      provider_id text not null default '',
      audio_language text not null default '',
      started_at integer not null,
      last_heartbeat_at integer not null,
      last_client_timestamp integer not null default 0,
      ended_at integer,
      elapsed_seconds integer not null default 0,
      visible_seconds integer not null default 0,
      provider_watched_seconds integer not null default 0,
      estimated_watched_seconds integer not null default 0,
      official_runtime_seconds integer,
      provider_progress_seconds integer not null default 0,
      provider_progress_percent real,
      last_provider_observed_seconds real not null default 0,
      last_provider_observer_id text not null default '',
      last_provider_observer_sequence integer not null default 0,
      tracking_method text not null default 'local-estimate',
      manually_marked_watched integer not null default 0,
      manual_marked_at integer,
      completed integer not null default 0,
      completion_source text not null default 'unknown',
      confidence text not null default 'low',
      status text not null default 'active',
      last_document_visible integer not null default 1,
      last_playback_state text not null default 'unknown',
      rewatch integer not null default 0
    );

    create index if not exists watch_sessions_profile_status
      on watch_sessions(profile_id, status, last_heartbeat_at desc);

    create index if not exists watch_sessions_profile_media
      on watch_sessions(
        profile_id, media_type, tmdb_id, season_number, episode_number,
        started_at desc
      );

    create table if not exists profile_playback_preferences (
      profile_id text primary key,
      auto_next_enabled integer not null default 1,
      binge_limit_episodes integer not null default 4,
      intro_skip_enabled integer not null default 1,
      session_summary_enabled integer not null default 1,
      updated_at integer not null
    );

    create table if not exists playback_observations (
      id integer primary key autoincrement,
      observation_key text not null unique,
      profile_id text not null,
      session_id text not null,
      tmdb_id integer not null,
      season_number integer not null,
      episode_number integer not null,
      observation_type text not null check (observation_type in ('intro', 'credits')),
      from_seconds real not null default 0,
      to_seconds real not null default 0,
      duration_seconds real not null default 0,
      remaining_seconds real not null default 0,
      observed_at integer not null
    );

    create index if not exists playback_observations_learning
      on playback_observations(
        profile_id, tmdb_id, season_number, observation_type, observed_at desc
      );

    create table if not exists learned_playback_segments (
      id integer primary key autoincrement,
      profile_id text not null,
      tmdb_id integer not null,
      season_number integer not null,
      segment_type text not null check (segment_type in ('intro', 'credits')),
      start_seconds real not null default 0,
      end_seconds real not null default 0,
      remaining_seconds real not null default 0,
      sample_count integer not null default 0,
      confidence real not null default 0,
      disabled integer not null default 0,
      updated_at integer not null,
      unique(profile_id, tmdb_id, season_number, segment_type)
    );
  `);

  ensureColumn(database, "watch_history", "completion_source", "text not null default 'unknown'");
  ensureColumn(database, "watch_history", "tracking_confidence", "text not null default 'low'");
  ensureColumn(database, "watch_history", "manual_marked_at", "integer");
  ensureColumn(database, "watch_history", "estimated_watch_seconds", "integer not null default 0");
  ensureColumn(database, "watch_history", "provider_watch_seconds", "integer not null default 0");

  ensureColumn(database, "viewing_events", "completion_source", "text not null default 'unknown'");
  ensureColumn(database, "viewing_events", "tracking_confidence", "text not null default 'low'");
  ensureColumn(database, "viewing_events", "estimated_watch_seconds", "integer not null default 0");
  ensureColumn(database, "viewing_events", "provider_watch_seconds", "integer not null default 0");
  ensureColumn(database, "viewing_events", "idempotency_key", "text not null default ''");
  ensureColumn(
    database,
    "watch_sessions",
    "last_provider_observed_seconds",
    "real not null default 0",
  );
  ensureColumn(
    database,
    "watch_sessions",
    "last_provider_observer_id",
    "text not null default ''",
  );
  ensureColumn(
    database,
    "watch_sessions",
    "last_provider_observer_sequence",
    "integer not null default 0",
  );
  ensureColumn(
    database,
    "watch_sessions",
    "tracking_method",
    "text not null default 'local-estimate'",
  );
  ensureColumn(database, "watch_sessions", "first_play_at", "integer");
  ensureColumn(database, "watch_sessions", "startup_milliseconds", "integer");
  ensureColumn(database, "watch_sessions", "buffering_count", "integer not null default 0");
  ensureColumn(database, "watch_sessions", "buffering_seconds", "integer not null default 0");
  ensureColumn(database, "watch_sessions", "seek_count", "integer not null default 0");
  ensureColumn(database, "watch_sessions", "error_count", "integer not null default 0");
  ensureColumn(database, "watch_sessions", "last_provider_seeking", "integer not null default 0");
  ensureColumn(database, "watch_sessions", "last_event_name", "text not null default ''");
  ensureColumn(database, "watch_sessions", "video_height", "integer not null default 0");
  ensureColumn(database, "watch_sessions", "provider_ended_signal", "integer not null default 0");
  database.exec(`
    create unique index if not exists viewing_events_idempotency
      on viewing_events(profile_id, idempotency_key)
      where idempotency_key <> '';
  `);

  const applied = database
    .prepare("select 1 from app_migrations where id = ? limit 1")
    .get(HYBRID_TRACKING_MIGRATION);
  if (!applied) {
    database.transaction(() => {
      database.exec(`
        update watch_history
        set completion_source = case when completed = 1 then 'legacy' else 'unknown' end,
            tracking_confidence = 'low'
        where completion_source = 'unknown';

        update viewing_events
        set completion_source = case when event_type = 'COMPLETED' then 'legacy' else 'unknown' end,
            tracking_confidence = 'low'
        where completion_source = 'unknown';
      `);
      database
        .prepare("insert into app_migrations (id, applied_at) values (?, ?)")
        .run(HYBRID_TRACKING_MIGRATION, Date.now());
    })();
  }

  const extensionApplied = database
    .prepare("select 1 from app_migrations where id = ? limit 1")
    .get(BROWSER_EXTENSION_TRACKING_MIGRATION);
  if (!extensionApplied) {
    database
      .prepare("insert into app_migrations (id, applied_at) values (?, ?)")
      .run(BROWSER_EXTENSION_TRACKING_MIGRATION, Date.now());
  }

  const intelligenceApplied = database
    .prepare("select 1 from app_migrations where id = ? limit 1")
    .get(PLAYBACK_INTELLIGENCE_MIGRATION);
  if (!intelligenceApplied) {
    database
      .prepare("insert into app_migrations (id, applied_at) values (?, ?)")
      .run(PLAYBACK_INTELLIGENCE_MIGRATION, Date.now());
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
