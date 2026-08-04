import test from "node:test";
import assert from "node:assert/strict";
import {
  genreIdsForMediaType,
  parseGenreIds,
} from "../src/lib/catalog-filters.ts";

test("parse et deduplique plusieurs genres", () => {
  assert.deepEqual(parseGenreIds("16,9648,16"), ["16", "9648"]);
  assert.deepEqual(parseGenreIds("16|35"), ["16", "35"]);
});

test("adapte les genres entre films et series", () => {
  assert.deepEqual(genreIdsForMediaType("16,10765", "movie"), ["16", "878"]);
  assert.deepEqual(genreIdsForMediaType("16,878", "tv"), ["16", "10765"]);
});

test("ignore les genres inconnus sans invalider les autres", () => {
  assert.deepEqual(genreIdsForMediaType("16,999999", "tv"), ["16"]);
});
