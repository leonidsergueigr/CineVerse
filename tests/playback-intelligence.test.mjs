import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateProviderScore,
  learnPlaybackSegment,
  rewindResumePosition,
} from "../src/lib/playback-intelligence-core.ts";

test("une intro exige trois episodes concordants", () => {
  assert.equal(
    learnPlaybackSegment("intro", [
      sample(1, 8, 91, 1_320),
      sample(2, 5, 89, 1_315),
    ]),
    null,
  );
  const learned = learnPlaybackSegment("intro", [
    sample(1, 8, 91, 1_320),
    sample(2, 5, 89, 1_315),
    sample(3, 9, 94, 1_330),
    sample(4, 6, 240, 1_325),
  ]);
  assert.ok(learned);
  assert.equal(learned.sampleCount, 3);
  assert.equal(learned.endSeconds, 91);
});

test("un generique est appris depuis des fins concordantes", () => {
  const learned = learnPlaybackSegment("credits", [
    sample(1, 1_255, 1_320, 1_320),
    sample(2, 1_250, 1_315, 1_315),
    sample(3, 1_263, 1_330, 1_330),
  ]);
  assert.ok(learned);
  assert.equal(learned.sampleCount, 3);
  assert.equal(learned.remainingSeconds, 65);
});

test("la reprise revient huit secondes en arriere", () => {
  assert.equal(rewindResumePosition(100), 92);
  assert.equal(rewindResumePosition(20), 20);
});

test("le score provider baisse avec buffering et erreurs", () => {
  const reliable = calculateProviderScore({
    sampleCount: 10,
    startupSuccesses: 10,
    averageStartupMs: 700,
    bufferingCount: 1,
    bufferingSeconds: 3,
    errorCount: 0,
    completedSessions: 8,
    preciseTrackingSessions: 10,
    watchedSeconds: 18_000,
  });
  const unstable = calculateProviderScore({
    sampleCount: 10,
    startupSuccesses: 7,
    averageStartupMs: 6_000,
    bufferingCount: 20,
    bufferingSeconds: 900,
    errorCount: 4,
    completedSessions: 2,
    preciseTrackingSessions: 4,
    watchedSeconds: 7_200,
  });
  assert.ok(reliable > unstable);
});

function sample(episodeNumber, fromSeconds, toSeconds, durationSeconds) {
  return {
    episodeNumber,
    fromSeconds,
    toSeconds,
    durationSeconds,
    remainingSeconds: durationSeconds - fromSeconds,
  };
}
