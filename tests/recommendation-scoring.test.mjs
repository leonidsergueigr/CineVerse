import test from "node:test";
import assert from "node:assert/strict";
import { sourceAffinityScore } from "../src/lib/recommendation-scoring.ts";

test("les sources repetitives sont plafonnees a trois occurrences", () => {
  assert.equal(
    sourceAffinityScore({
      recommendationHits: 3,
      similarHits: 3,
      discoveryHits: 3,
    }),
    sourceAffinityScore({
      recommendationHits: 30,
      similarHits: 30,
      discoveryHits: 30,
    }),
  );
});

test("les poids de provenance restent explicites", () => {
  assert.equal(
    sourceAffinityScore({
      recommendationHits: 1,
      similarHits: 1,
      discoveryHits: 1,
    }),
    13.5,
  );
});
