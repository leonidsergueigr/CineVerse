export type MediaType = "movie" | "tv";

export type CatalogItem = {
  id: number;
  mediaType: MediaType;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  releaseDate: string | null;
  voteAverage: number;
  genreIds: number[];
  originalLanguage: string;
};

export type MediaDetails = CatalogItem & {
  runtime: number | null;
  seasons?: Array<{
    id: number;
    name: string;
    seasonNumber: number;
    episodeCount: number;
  }>;
  genres: Array<{ id: number; name: string }>;
};

export type CatalogSection = {
  id: string;
  title: string;
  items: CatalogItem[];
};

export type HomeCatalog = {
  hero: CatalogItem;
  heroTrailerUrl: string | null;
  sections: CatalogSection[];
  filters: CatalogFilters;
  filteredItems: CatalogItem[];
  isFiltered: boolean;
};

export type CatalogFilters = {
  query?: string;
  mediaType?: string;
  genre?: string;
  yearFrom?: string;
  yearTo?: string;
  minRating?: string;
  language?: string;
};

export type WatchProgress = {
  tmdbId: number;
  mediaType: MediaType;
  seasonNumber: number | null;
  episodeNumber: number | null;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  progressSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: string;
};

export type EmbedProvider = {
  id: string;
  name: string;
  template: string;
  supportsTracking: boolean;
  supportsLanguage: boolean;
  priority: number;
};
