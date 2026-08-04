import test from "node:test";
import assert from "node:assert/strict";
import {
  TRACKING_CONFIG,
  capEstimatedSeconds,
  completionSignalWeight,
  evaluateCompletion,
  providerProgressDeltaSeconds,
  providerObservedDeltaSeconds,
  validHeartbeatIntervalSeconds,
} from "../src/lib/watch-tracking.ts";

test("un ended provider termine avec une confiance haute", () => {
  assert.deepEqual(evaluateCompletion({ providerEnded: true }), {
    completed: true,
    completionSource: "provider",
    confidence: "high",
  });
});

test("la progression provider termine a 80 pour cent, pas a 40", () => {
  assert.equal(
    evaluateCompletion({
      providerProgressSeconds: 85,
      officialRuntimeSeconds: 100,
    }).completed,
    true,
  );
  assert.equal(
    evaluateCompletion({
      providerProgressSeconds: 40,
      officialRuntimeSeconds: 100,
    }).completed,
    false,
  );
});

test("une estimation visible a 85 pour cent termine en confiance moyenne", () => {
  assert.deepEqual(
    evaluateCompletion({
      estimatedWatchedSeconds: 85,
      officialRuntimeSeconds: 100,
    }),
    {
      completed: true,
      completionSource: "estimated",
      confidence: "medium",
    },
  );
});

test("le marquage manuel reste manuel sous 30 pour cent", () => {
  assert.equal(
    evaluateCompletion({
      estimatedWatchedSeconds: 20,
      officialRuntimeSeconds: 100,
      manuallyMarkedWatched: true,
    }).completionSource,
    "manual",
  );
});

test("le marquage manuel devient hybride apres 30 pour cent", () => {
  assert.deepEqual(
    evaluateCompletion({
      estimatedWatchedSeconds: 40,
      officialRuntimeSeconds: 100,
      manuallyMarkedWatched: true,
    }),
    {
      completed: true,
      completionSource: "hybrid",
      confidence: "medium",
    },
  );
});

test("un onglet masque ne credite aucun intervalle", () => {
  assert.equal(
    validHeartbeatIntervalSeconds({
      previousHeartbeatAt: 1_000,
      heartbeatAt: 16_000,
      previousDocumentVisible: false,
    }),
    0,
  );
});

test("une longue interruption n'est pas comptee", () => {
  assert.equal(
    validHeartbeatIntervalSeconds({
      previousHeartbeatAt: 1_000,
      heartbeatAt:
        1_000 + (TRACKING_CONFIG.maxHeartbeatGapSeconds + 1) * 1_000,
      previousDocumentVisible: true,
    }),
    0,
  );
});

test("un intervalle visible et court est credite", () => {
  assert.equal(
    validHeartbeatIntervalSeconds({
      previousHeartbeatAt: 1_000,
      heartbeatAt: 16_000,
      previousDocumentVisible: true,
      previousPlaybackState: "playing",
    }),
    15,
  );
});

test("un saut provider ne credite pas arbitrairement toute la position", () => {
  assert.equal(
    providerProgressDeltaSeconds({
      previousProgressSeconds: 10,
      progressSeconds: 1_000,
      intervalSeconds: 15,
    }),
    20,
  );
});

test("le temps observe par extension est borne et monotone", () => {
  assert.equal(
    providerObservedDeltaSeconds({
      previousObservedSeconds: 10,
      observedSeconds: 25.8,
    }),
    15,
  );
  assert.equal(
    providerObservedDeltaSeconds({
      previousObservedSeconds: 25,
      observedSeconds: 500,
    }),
    TRACKING_CONFIG.maximumExtensionObservationGapSeconds,
  );
  assert.equal(
    providerObservedDeltaSeconds({
      previousObservedSeconds: 25,
      observedSeconds: 20,
    }),
    0,
  );
});

test("l'estimation est plafonnee a 1,5 fois la duree officielle", () => {
  assert.equal(capEstimatedSeconds(10_000, 100), 150);
});

test("les sources de completion ont des poids de recommandation distincts", () => {
  assert.equal(completionSignalWeight("provider"), 0.45);
  assert.equal(completionSignalWeight("estimated"), 0.3);
  assert.equal(completionSignalWeight("hybrid"), 0.25);
  assert.equal(completionSignalWeight("manual"), 0.5);
  assert.equal(completionSignalWeight("manual_legacy"), 0);
});
