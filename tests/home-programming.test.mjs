import test from "node:test";
import assert from "node:assert/strict";
import { composeHomeProgramming } from "../src/lib/home-programming.ts";

function item(id, mediaType = "movie") {
  return {
    id,
    mediaType,
    title: `Titre ${id}`,
    overview: "",
    posterPath: `/${id}.jpg`,
    backdropPath: `/${id}-backdrop.jpg`,
    posterUrl: `https://image.test/${id}.jpg`,
    backdropUrl: `https://image.test/${id}-backdrop.jpg`,
    releaseDate: "2026-01-01",
    voteAverage: 7,
    voteCount: 100,
    popularity: 10,
    genreIds: [28],
    originalLanguage: "fr",
  };
}

test("le cooldown ne vide pas les catalogues mais une exclusion reste stricte", () => {
  const items = Array.from({ length: 8 }, (_, index) => item(index + 1));
  const exposures = items.map((candidate) => ({
    tmdbId: candidate.id,
    mediaType: candidate.mediaType,
    shownCount: 5,
    clickedCount: 0,
    playedCount: 0,
    completedCount: 0,
    dismissedCount: 0,
    ignoredCount: 5,
    lastShownAt: Date.now(),
  }));
  const result = composeHomeProgramming({
    catalog: {
      hero: items[0],
      heroCandidates: items,
      heroTrailerUrl: null,
      sections: [
        { id: "new-movies", title: "Nouveautes", items: items.slice(0, 4) },
        { id: "movies", title: "Films", items: items.slice(4) },
      ],
    },
    continueWatching: [],
    watchlist: [],
    recommendations: {
      items: [],
      strategy: "empty",
      profile: {
        likeCount: 0,
        watchlistCount: 0,
        dislikeCount: 0,
        movieCount: 0,
        seriesCount: 0,
        topGenres: [],
      },
    },
    exposures,
    exclusions: [
      { tmdbId: 1, mediaType: "movie", reason: "watched", expiresAt: null },
    ],
    now: new Date("2026-08-02T20:00:00Z"),
  });

  assert.equal(result.sections.length, 2);
  assert.ok(result.sections.every((section) => section.items.length >= 2));
  assert.ok(
    result.sections.every((section) =>
      section.items.every((candidate) => candidate.id !== 1),
    ),
  );
});
