import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("l'historique importe reste neutre, idempotent et sans temps invente", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cineverse-history-"));
  process.env.CINEVERSE_DATA_DIR = dataDir;
  process.env.NODE_ENV = "test";

  const store = await import("../src/lib/store.ts");
  const statistics = await import("../src/lib/profile-statistics.ts");
  const profile = store.createProfile({ name: "Historique Test" });
  const input = {
    tmdbId: 2316,
    title: "The Office",
    posterPath: "/office.jpg",
    episodes: [
      { seasonNumber: 1, episodeNumber: 1 },
      { seasonNumber: 1, episodeNumber: 2 },
    ],
    seriesEpisodeCounts: [{ seasonNumber: 1, episodeCount: 6 }],
    sentiment: "neutral",
  };

  assert.deepEqual(store.importWatchHistory(profile.id, input), {
    imported: 2,
    alreadyKnown: 0,
  });
  assert.deepEqual(store.importWatchHistory(profile.id, input), {
    imported: 0,
    alreadyKnown: 2,
  });

  const history = store.getWatchHistory(profile.id);
  assert.equal(history.length, 2);
  assert.ok(history.every((item) => item.completionSource === "manual_legacy"));
  assert.ok(history.every((item) => item.trackingConfidence === "low"));
  assert.ok(history.every((item) => item.activePlaybackSeconds === 0));
  assert.ok(history.every((item) => item.extensionMeasuredSeconds === 0));
  assert.ok(history.every((item) => item.estimatedSeconds === 0));
  assert.ok(history.every((item) => item.watchedAt === null));
  assert.equal(store.getRecommendationLikes(profile.id).length, 0);

  const exclusions = store.getRecommendationExclusions(profile.id);
  assert.ok(
    exclusions.some(
      (item) =>
        item.tmdbId === input.tmdbId &&
        item.mediaType === "tv" &&
        item.reason === "watched",
    ),
  );

  const stats = statistics.getProfileStats(profile.id);
  assert.equal(stats.overview.completedEpisodes, 2);
  assert.equal(stats.overview.totalWatchSeconds, 0);
  assert.equal(stats.recap.completedCount, 0);
  assert.equal(stats.recap.watchSeconds, 0);

  store.importWatchHistory(profile.id, { ...input, sentiment: "liked" });
  const retrospectiveLikes = store.getRecommendationLikes(profile.id);
  assert.equal(retrospectiveLikes.length, 1);
  assert.equal(retrospectiveLikes[0].signalOrigin, "manual_legacy");
  assert.equal(retrospectiveLikes[0].signalStrength, 0.5);

  store.setRecommendationSuppression(profile.id, {
    tmdbId: 999,
    mediaType: "movie",
    reason: "never",
  });
  store.setRecommendationSuppression(profile.id, {
    tmdbId: 999,
    mediaType: "movie",
    reason: "not-now",
  });
  assert.equal(
    store
      .getRecommendationExclusions(profile.id)
      .find((item) => item.tmdbId === 999)?.reason,
    "never",
  );

  const manyLikesProfile = store.createProfile({ name: "Beaucoup de likes" });
  for (let index = 1; index <= 35; index += 1) {
    store.setLike(manyLikesProfile.id, {
      tmdbId: index,
      mediaType: "movie",
      title: `Film ${index}`,
      liked: true,
    });
  }
  assert.equal(
    store
      .getRecommendationExclusions(manyLikesProfile.id)
      .filter((item) => item.reason === "liked").length,
    35,
  );

  store.setWatchlist(manyLikesProfile.id, {
    tmdbId: 500,
    mediaType: "movie",
    title: "Liste test",
    included: true,
  });
  store.setWatchlist(manyLikesProfile.id, {
    tmdbId: 500,
    mediaType: "movie",
    title: "Liste test",
    included: false,
  });
  let weakSignal = store
    .getDislikes(manyLikesProfile.id)
    .find((item) => item.tmdbId === 500);
  assert.equal(weakSignal?.signalStrength, 0.2);
  assert.equal(weakSignal?.exactExclusion, false);
  store.setWatchlist(manyLikesProfile.id, {
    tmdbId: 500,
    mediaType: "movie",
    title: "Liste test",
    included: true,
  });
  weakSignal = store
    .getDislikes(manyLikesProfile.id)
    .find((item) => item.tmdbId === 500);
  assert.equal(weakSignal, undefined);

  store.setDislike(manyLikesProfile.id, {
    tmdbId: 501,
    mediaType: "movie",
    title: "Rejet explicite",
    disliked: true,
  });
  assert.ok(
    store
      .getRecommendationExclusions(manyLikesProfile.id)
      .some((item) => item.tmdbId === 501 && item.reason === "disliked"),
  );
});
