import type { MediaType } from "@/lib/types";

const MOVIE_GENRES = new Set([
  "28",
  "12",
  "16",
  "35",
  "80",
  "99",
  "18",
  "14",
  "27",
  "9648",
  "10749",
  "878",
  "53",
]);

const TV_GENRES = new Set([
  "10759",
  "16",
  "35",
  "80",
  "99",
  "18",
  "10751",
  "10765",
  "9648",
  "10768",
  "37",
]);

export function parseGenreIds(value?: string) {
  if (!value) return [];
  return [...new Set(value.split(/[|,]/).map((id) => id.trim()).filter(Boolean))];
}

export function genreIdsForMediaType(value: string | undefined, mediaType: MediaType) {
  return [
    ...new Set(
      parseGenreIds(value)
        .map((genre) => genreForMediaType(genre, mediaType))
        .filter((genre): genre is string => Boolean(genre)),
    ),
  ];
}

function genreForMediaType(genre: string, mediaType: MediaType) {
  if (mediaType === "movie" && MOVIE_GENRES.has(genre)) return genre;
  if (mediaType === "tv" && TV_GENRES.has(genre)) return genre;
  if (mediaType === "movie" && genre === "10765") return "878";
  if (mediaType === "tv" && genre === "878") return "10765";
  if (mediaType === "movie" && genre === "10759") return "28";
  if (mediaType === "tv" && (genre === "28" || genre === "12")) return "10759";
  return undefined;
}
