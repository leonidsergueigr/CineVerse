export type MediaType = "movie" | "tv";

export type Profile = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
};

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
  voteCount: number;
  popularity: number;
  genreIds: number[];
  originalLanguage: string;
  resume?: {
    seasonNumber: number | null;
    episodeNumber: number | null;
    progressSeconds: number;
    durationSeconds: number;
  };
};

export type MediaDetails = CatalogItem & {
  metadataSource: "tmdb" | "provider" | "fallback";
  runtime: number | null;
  seasons?: Array<{
    id: number;
    name: string;
    seasonNumber: number;
    episodeCount: number;
  }>;
  genres: Array<{ id: number; name: string }>;
  cast: Array<{ id: number; name: string; character: string; profileUrl: string | null }>;
  crew: Array<{ id: number; name: string; job: string }>;
};

export type CatalogSection = {
  id: string;
  title: string;
  items: CatalogItem[];
};

export type HomeCatalog = {
  hero: CatalogItem;
  heroCandidates: CatalogItem[];
  heroTrailerUrl: string | null;
  sections: CatalogSection[];
};

export type BrowseCatalog = {
  items: CatalogItem[];
  filters: CatalogFilters;
  page: number;
  totalPages: number;
  totalResults: number;
};

export type CatalogFilters = {
  query?: string;
  catalog?: string;
  mediaType?: string;
  genre?: string;
  yearFrom?: string;
  yearTo?: string;
  minRating?: string;
  language?: string;
  originalLanguage?: string;
  person?: string;
  personName?: string;
  personRole?: string;
  personJob?: string;
  sort?: string;
  page?: string;
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
  seriesEpisodeCounts: Array<{
    seasonNumber: number;
    episodeCount: number;
  }>;
  updatedAt: string;
};

export type EpisodeInfo = {
  name: string;
  runtime: number | null;
};

export type SeriesProgressSummary = {
  seasonNumber: number;
  completedEpisodes: number;
  totalEpisodes: number;
  completedEpisodeNumbers: number[];
};

export type SearchSuggestion = {
  id: number;
  kind: MediaType | "person";
  title: string;
  subtitle: string;
  imageUrl: string | null;
  href: string;
};

export type LikeRecord = {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  likedAt: string;
};

export type DislikeRecord = {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  genreIds: number[];
  originalLanguage: string;
  dislikedAt: string;
};

export type PersonalizedRecommendation = CatalogItem & {
  reason: string;
  score: number;
};

export type RecommendationResult = {
  items: PersonalizedRecommendation[];
  strategy: "personalized" | "empty";
  profile: {
    likeCount: number;
    dislikeCount: number;
    movieCount: number;
    seriesCount: number;
    topGenres: Array<{ name: string; weight: number }>;
  };
};

export type EmbedProvider = {
  id: string;
  name: string;
  template: string;
  availabilityApi?: string;
  supportsTracking: boolean;
  supportsLanguage: boolean;
  priority: number;
  languages?: Array<{ id: string; label: string }>;
  customizationOptions?: {
    autoplay?: string;
    autonext?: string;
    [key: string]: string | undefined;
  };
};
