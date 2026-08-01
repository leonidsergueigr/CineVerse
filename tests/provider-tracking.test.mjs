import test from "node:test";
import assert from "node:assert/strict";
import {
  isCineVerseCompanionReadyMessage,
  parseCineVerseCompanionMessage,
} from "../src/lib/provider-tracking.ts";

test("le compagnon produit un signal video confirme", () => {
  const signal = parseCineVerseCompanionMessage(
    companionMessage({
      currentTime: 630,
      duration: 1_320,
      watchedSeconds: 598.5,
      playbackState: "playing",
      videoWidth: 1_920,
      videoHeight: 1_080,
      observerInstanceId: "observer-1",
    }),
    1_380,
  );

  assert.ok(signal);
  assert.equal(signal.trackingMethod, "browser-extension");
  assert.equal(signal.watchedSeconds, 598.5);
  assert.equal(signal.playbackState, "playing");
  assert.equal(signal.observerSessionId, "observer-1");
});

test("une video publicitaire courte est rejetee", () => {
  assert.equal(
    parseCineVerseCompanionMessage(
      companionMessage({
        currentTime: 10,
        duration: 30,
        watchedSeconds: 10,
        playbackState: "playing",
        videoWidth: 1_920,
        videoHeight: 1_080,
      }),
      7_200,
    ),
    null,
  );
});

test("le message ready du compagnon est reconnu", () => {
  assert.equal(
    isCineVerseCompanionReadyMessage({
      source: "cineverse-companion",
      version: 1,
      type: "ready",
      payload: {},
    }),
    true,
  );
});

function companionMessage(payload) {
  return {
    source: "cineverse-companion",
    version: 1,
    type: "media-state",
    payload,
  };
}
