import test from "node:test";
import assert from "node:assert/strict";
import {
  isRecentlyAired,
  parseEpisodeProgress,
  recentDateCutoff,
} from "../src/lib/catalog-freshness.ts";

test("parse les compteurs d'episodes FStream", () => {
  assert.deepEqual(parseEpisodeProgress("Ep 02 sur 08"), {
    episodeNumber: 2,
    totalEpisodes: 8,
  });
  assert.deepEqual(parseEpisodeProgress("Episode 7/10"), {
    episodeNumber: 7,
    totalEpisodes: 10,
  });
});

test("rejette un compteur d'episode incoherent", () => {
  assert.equal(parseEpisodeProgress("Ep 12 sur 08"), null);
  assert.equal(parseEpisodeProgress("Prochainement"), null);
});

test("identifie une diffusion dans la fenetre recente", () => {
  const now = new Date("2026-08-02T20:00:00Z");
  assert.equal(recentDateCutoff(now, 14), "2026-07-19");
  assert.equal(isRecentlyAired("2026-07-25", now), true);
  assert.equal(isRecentlyAired("2026-07-18", now), false);
  assert.equal(isRecentlyAired("2026-08-03", now), false);
});
