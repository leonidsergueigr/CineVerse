import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("completion manuelle, estimation et profils restent separes", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cineverse-watch-"));
  process.env.CINEVERSE_DATA_DIR = dataDir;
  process.env.NODE_ENV = "test";

  const store = await import("../src/lib/store.ts");
  const sessions = await import("../src/lib/watch-session-service.ts");
  const statistics = await import("../src/lib/profile-statistics.ts");
  const firstProfile = store.createProfile({ name: "Profil Test" });
  const secondProfile = store.createProfile({ name: "Profil Deux" });
  const manualMovie = {
    sessionId: "manual-session-1",
    tmdbId: 101,
    mediaType: "movie",
    title: "Film manuel",
    officialRuntimeSeconds: 7_200,
  };

  const manual = sessions.manuallyCompleteWatchSession(
    firstProfile.id,
    manualMovie,
  );
  assert.equal(manual.completed, true);
  assert.equal(manual.completionSource, "manual");
  assert.equal(manual.credibleWatchedSeconds, 0);
  let stats = statistics.getProfileStats(firstProfile.id);
  assert.equal(stats.overview.completedMovies, 1);
  assert.equal(stats.overview.totalWatchSeconds, 0);
  assert.equal(stats.tracking.manualCompletions, 1);

  const estimatedMovie = {
    sessionId: "estimated-session-1",
    tmdbId: 102,
    mediaType: "movie",
    title: "Film estime",
    officialRuntimeSeconds: 100,
  };
  sessions.startWatchSession(firstProfile.id, estimatedMovie);
  store
    .getDb()
    .prepare(
      "update watch_sessions set last_heartbeat_at = ?, last_document_visible = 1, last_playback_state = 'playing' where id = ?",
    )
    .run(Date.now() - 15_000, estimatedMovie.sessionId);
  const heartbeat = sessions.heartbeatWatchSession(firstProfile.id, {
    ...estimatedMovie,
    sentAt: Date.now(),
    documentVisible: true,
    playbackState: "playing",
    heartbeatId: "estimated-heartbeat-1",
  });
  assert.ok(heartbeat.estimatedWatchedSeconds >= 14);
  assert.equal(heartbeat.completed, false);

  const providerMovie = {
    sessionId: "provider-session-1",
    tmdbId: 103,
    mediaType: "movie",
    title: "Film suivi par le provider",
    officialRuntimeSeconds: 100,
  };
  sessions.startWatchSession(firstProfile.id, providerMovie);
  store
    .getDb()
    .prepare(
      "update watch_sessions set last_heartbeat_at = ?, last_document_visible = 1, last_playback_state = 'playing' where id = ?",
    )
    .run(Date.now() - 15_000, providerMovie.sessionId);
  const providerHeartbeat = sessions.heartbeatWatchSession(firstProfile.id, {
    ...providerMovie,
    sentAt: Date.now(),
    documentVisible: true,
    playbackState: "playing",
    providerProgressSeconds: 20,
    providerProgressPercent: 0.2,
    heartbeatId: "provider-heartbeat-1",
  });
  assert.ok(providerHeartbeat.providerWatchedSeconds > 0);
  assert.equal(providerHeartbeat.estimatedWatchedSeconds, 0);
  assert.equal(providerHeartbeat.completed, false);

  const extensionMovie = {
    sessionId: "extension-session-1",
    tmdbId: 104,
    mediaType: "movie",
    title: "Film suivi par extension",
    officialRuntimeSeconds: 100,
  };
  sessions.startWatchSession(firstProfile.id, extensionMovie);
  store
    .getDb()
    .prepare(
      "update watch_sessions set last_heartbeat_at = ?, last_document_visible = 1, last_playback_state = 'playing' where id = ?",
    )
    .run(Date.now() - 15_000, extensionMovie.sessionId);
  const firstExtensionHeartbeatAt = Date.now();
  const extensionHeartbeat = sessions.heartbeatWatchSession(firstProfile.id, {
    ...extensionMovie,
    sentAt: firstExtensionHeartbeatAt,
    documentVisible: true,
    playbackState: "playing",
    providerProgressSeconds: 20,
    providerProgressPercent: 0.2,
    providerWatchedSeconds: 15,
    providerObserverSessionId: "observer-1",
    providerObserverSequence: 1,
    trackingMethod: "browser-extension",
    heartbeatId: "extension-heartbeat-1",
  });
  assert.equal(extensionHeartbeat.providerWatchedSeconds, 15);
  assert.equal(extensionHeartbeat.estimatedWatchedSeconds, 0);
  assert.equal(extensionHeartbeat.trackingMethod, "browser-extension");

  store
    .getDb()
    .prepare("update watch_sessions set last_heartbeat_at = ? where id = ?")
    .run(Date.now() - 15_000, extensionMovie.sessionId);
  const afterSeek = sessions.heartbeatWatchSession(firstProfile.id, {
    ...extensionMovie,
    sentAt: firstExtensionHeartbeatAt + 1,
    documentVisible: true,
    playbackState: "playing",
    providerProgressSeconds: 90,
    providerProgressPercent: 0.9,
    providerWatchedSeconds: 15,
    providerSeeking: true,
    providerObserverSessionId: "observer-1",
    providerObserverSequence: 2,
    trackingMethod: "browser-extension",
    heartbeatId: "extension-heartbeat-seek",
  });
  assert.equal(afterSeek.providerWatchedSeconds, 15);
  assert.equal(afterSeek.progressSeconds, 90);
  assert.equal(afterSeek.completed, false);

  const staleExtensionHeartbeat = sessions.heartbeatWatchSession(firstProfile.id, {
    ...extensionMovie,
    sentAt: firstExtensionHeartbeatAt + 2,
    documentVisible: true,
    playbackState: "playing",
    providerProgressSeconds: 95,
    providerProgressPercent: 0.95,
    providerWatchedSeconds: 30,
    providerObserverSessionId: "observer-1",
    providerObserverSequence: 1,
    trackingMethod: "browser-extension",
    heartbeatId: "extension-heartbeat-stale",
  });
  assert.equal(staleExtensionHeartbeat.providerWatchedSeconds, 15);
  assert.equal(staleExtensionHeartbeat.progressSeconds, 90);

  const creditsCompletion = sessions.heartbeatWatchSession(firstProfile.id, {
    ...extensionMovie,
    sentAt: firstExtensionHeartbeatAt + 3,
    documentVisible: false,
    playbackState: "playing",
    providerProgressSeconds: 96,
    providerProgressPercent: 0.96,
    providerWatchedSeconds: 16,
    providerEnded: true,
    providerObserverSessionId: "observer-1",
    providerObserverSequence: 3,
    trackingMethod: "browser-extension",
    heartbeatId: "extension-heartbeat-credits",
  });
  assert.equal(creditsCompletion.completed, true);
  assert.equal(creditsCompletion.completionSource, "provider");
  assert.equal(creditsCompletion.confidence, "high");
  assert.equal(creditsCompletion.providerWatchedSeconds, 16);
  assert.equal(creditsCompletion.estimatedWatchedSeconds, 0);

  store
    .getDb()
    .prepare(
      "update watch_sessions set estimated_watched_seconds = 40 where id = ?",
    )
    .run(estimatedMovie.sessionId);
  const hybrid = sessions.manuallyCompleteWatchSession(
    firstProfile.id,
    estimatedMovie,
  );
  assert.equal(hybrid.completionSource, "hybrid");
  assert.equal(hybrid.confidence, "medium");

  sessions.manuallyCompleteWatchSession(secondProfile.id, {
    ...manualMovie,
    sessionId: "manual-session-2",
  });
  assert.equal(
    store.getProgress(
      firstProfile.id,
      manualMovie.tmdbId,
      "movie",
      null,
      null,
    )?.completed,
    true,
  );
  assert.equal(statistics.getProfileStats(secondProfile.id).overview.completedMovies, 1);

  sessions.unmarkWatchSession(firstProfile.id, manualMovie);
  assert.equal(
    store.getProgress(
      firstProfile.id,
      manualMovie.tmdbId,
      "movie",
      null,
      null,
    )?.completed,
    false,
  );
  assert.equal(
    store.getProgress(
      secondProfile.id,
      manualMovie.tmdbId,
      "movie",
      null,
      null,
    )?.completed,
    true,
  );

  stats = statistics.getProfileStats(firstProfile.id);
  assert.ok(stats.overview.totalWatchSeconds >= 14);
  assert.equal(stats.overview.completedMovies, 2);
  store.getDb().close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
