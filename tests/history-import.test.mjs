import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHistoryImportEpisodes,
  historyImportSummary,
} from "../src/lib/history-import.ts";

const seasons = [
  { seasonNumber: 0, episodeCount: 4 },
  { seasonNumber: 1, episodeCount: 3 },
  { seasonNumber: 2, episodeCount: 2 },
];

test("l'import des episodes precedents ignore la saison zero", () => {
  assert.deepEqual(
    buildHistoryImportEpisodes({
      mode: "previous-episodes",
      seasons,
      currentSeason: 1,
      currentEpisode: 3,
    }),
    [
      { seasonNumber: 1, episodeNumber: 1 },
      { seasonNumber: 1, episodeNumber: 2 },
    ],
  );
});

test("les saisons precedentes et la serie entiere respectent les limites", () => {
  assert.equal(
    buildHistoryImportEpisodes({
      mode: "previous-seasons",
      seasons,
      currentSeason: 2,
      currentEpisode: 1,
    }).length,
    3,
  );
  assert.deepEqual(
    historyImportSummary(
      buildHistoryImportEpisodes({
        mode: "whole-series",
        seasons,
        currentSeason: 2,
        currentEpisode: 1,
      }),
    ),
    { seasonCount: 2, episodeCount: 5 },
  );
});

test("la selection precise deduplique et rejette les episodes inexistants", () => {
  assert.deepEqual(
    buildHistoryImportEpisodes({
      mode: "selected",
      seasons,
      currentSeason: 1,
      currentEpisode: 1,
      selectedEpisodes: [
        { seasonNumber: 1, episodeNumber: 2 },
        { seasonNumber: 1, episodeNumber: 2 },
        { seasonNumber: 1, episodeNumber: 99 },
        { seasonNumber: 0, episodeNumber: 1 },
      ],
    }),
    [{ seasonNumber: 1, episodeNumber: 2 }],
  );
});
