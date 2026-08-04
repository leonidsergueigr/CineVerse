import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateProviderScore,
  learnPlaybackSegment,
  rewindResumePosition,
  shouldRecordIntroSeekObservation,
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

test("une intro apres un cold open conserve son vrai debut", () => {
  const learned = learnPlaybackSegment("intro", [
    sample(1, 65, 123, 1_320),
    sample(2, 67, 125, 1_315),
    sample(3, 64, 122, 1_330),
  ]);
  assert.ok(learned);
  assert.equal(learned.startSeconds, 65);
  assert.equal(learned.endSeconds, 123);
});

test("les seeks avant et arriere affinent la fin de l'intro", () => {
  const learned = learnPlaybackSegment("intro", [
    observation(1, 65, 123, 1_320, "episode-1", 1_000),
    observation(1, 123, 112, 1_320, "episode-1", 5_000),
    observation(1, 112, 119, 1_320, "episode-1", 8_000),
    observation(1, 119, 115, 1_320, "episode-1", 11_000),
    observation(2, 67, 124, 1_315, "episode-2", 2_000),
    observation(2, 124, 113, 1_315, "episode-2", 7_000),
    observation(2, 113, 120, 1_315, "episode-2", 10_000),
    observation(2, 120, 116, 1_315, "episode-2", 13_000),
    observation(3, 64, 122, 1_330, "episode-3", 3_000),
    observation(3, 122, 111, 1_330, "episode-3", 8_000),
    observation(3, 111, 118, 1_330, "episode-3", 11_000),
    observation(3, 118, 115, 1_330, "episode-3", 14_000),
  ]);
  assert.ok(learned);
  assert.equal(learned.sampleCount, 3);
  assert.equal(learned.startSeconds, 65);
  assert.equal(learned.endSeconds, 115);
});

test("plusieurs corrections sur un seul episode ne suffisent pas", () => {
  const learned = learnPlaybackSegment("intro", [
    observation(1, 65, 123, 1_320, "episode-1", 1_000),
    observation(1, 123, 108, 1_320, "episode-1", 4_000),
    observation(1, 108, 119, 1_320, "episode-1", 7_000),
    observation(1, 119, 114, 1_320, "episode-1", 10_000),
  ]);
  assert.equal(learned, null);
});

test("un seek sans continuite ne modifie pas la fin de l'intro", () => {
  const learned = learnPlaybackSegment("intro", [
    observation(1, 65, 115, 1_320, "episode-1", 1_000),
    observation(1, 300, 360, 1_320, "episode-1", 4_000),
    observation(2, 67, 116, 1_315, "episode-2", 2_000),
    observation(3, 64, 114, 1_330, "episode-3", 3_000),
  ]);
  assert.ok(learned);
  assert.equal(learned.startSeconds, 65);
  assert.equal(learned.endSeconds, 115);
});

test("un seek du cold open reste distinct du saut de l'intro", () => {
  const learned = learnPlaybackSegment("intro", [
    observation(1, 5, 45, 1_320, "episode-1", 1_000),
    observation(1, 65, 123, 1_320, "episode-1", 8_000),
    observation(1, 123, 115, 1_320, "episode-1", 11_000),
    observation(2, 4, 42, 1_315, "episode-2", 2_000),
    observation(2, 67, 124, 1_315, "episode-2", 9_000),
    observation(2, 124, 116, 1_315, "episode-2", 12_000),
    observation(3, 8, 48, 1_330, "episode-3", 3_000),
    observation(3, 64, 122, 1_330, "episode-3", 10_000),
    observation(3, 122, 115, 1_330, "episode-3", 13_000),
  ]);
  assert.ok(learned);
  assert.equal(learned.startSeconds, 65);
  assert.equal(learned.endSeconds, 115);
});

test("une correction temporairement trop loin peut etre rectifiee", () => {
  const learned = learnPlaybackSegment("intro", [
    observation(1, 65, 123, 1_320, "episode-1", 1_000),
    observation(1, 123, 20, 1_320, "episode-1", 4_000),
    observation(1, 20, 115, 1_320, "episode-1", 7_000),
    observation(2, 67, 124, 1_315, "episode-2", 2_000),
    observation(2, 124, 116, 1_315, "episode-2", 5_000),
    observation(3, 64, 122, 1_330, "episode-3", 3_000),
    observation(3, 122, 115, 1_330, "episode-3", 6_000),
  ]);
  assert.ok(learned);
  assert.equal(learned.startSeconds, 65);
  assert.equal(learned.endSeconds, 115);
});

test("seuls les seeks plausibles du debut alimentent l'intro", () => {
  assert.equal(
    shouldRecordIntroSeekObservation({
      fromSeconds: 123,
      toSeconds: 115,
      durationSeconds: 1_320,
    }),
    true,
  );
  assert.equal(
    shouldRecordIntroSeekObservation({
      fromSeconds: 700,
      toSeconds: 760,
      durationSeconds: 1_320,
    }),
    false,
  );
  assert.equal(
    shouldRecordIntroSeekObservation({
      fromSeconds: 65,
      toSeconds: 66,
      durationSeconds: 1_320,
    }),
    false,
  );
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

function observation(
  episodeNumber,
  fromSeconds,
  toSeconds,
  durationSeconds,
  sessionId,
  observedAt,
) {
  return {
    ...sample(episodeNumber, fromSeconds, toSeconds, durationSeconds),
    sessionId,
    observedAt,
  };
}
