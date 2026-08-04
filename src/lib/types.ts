export type MediaType = "movie" | "tv";

export type Profile = {
  id: string;
  name: string;
  color: string;
  hasPin: boolean;
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
  recentEpisode?: {
    seasonNumber: number | null;
    episodeNumber: number;
    totalEpisodes: number | null;
    airDate: string | null;
    source: "fstream" | "tmdb";
  };
  resume?: {
    seasonNumber: number | null;
    episodeNumber: number | null;
    progressSeconds: number;
    durationSeconds: number;
    kind?:
      | "continue-now"
      | "almost-finished"
      | "next-episode"
      | "returning-series"
      | "rewatch";
    label?: string;
    remainingSeconds?: number;
    updatedAt?: string;
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
  reason?: string;
  personalized?: boolean;
};

export type HomeCatalog = {
  hero: CatalogItem;
  heroCandidates: CatalogItem[];
  heroTrailerUrl: string | null;
  heroReasons?: Record<string, string>;
  programmingSessionId?: string;
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
  completionSource: import("@/lib/watch-tracking").CompletionSource;
  trackingConfidence: import("@/lib/watch-tracking").TrackingConfidence;
  manuallyMarkedAt: string | null;
  estimatedWatchSeconds: number;
  providerWatchSeconds: number;
  seriesEpisodeCounts: Array<{
    seasonNumber: number;
    episodeCount: number;
  }>;
  updatedAt: string;
  resumeKind?: NonNullable<CatalogItem["resume"]>["kind"];
  resumeLabel?: string;
  remainingSeconds?: number;
};

export type PlaybackPreferences = {
  autoNextEnabled: boolean;
  bingeLimitEpisodes: number;
  introSkipEnabled: boolean;
  sessionSummaryEnabled: boolean;
};

export type LearnedPlaybackSegment = {
  tmdbId: number;
  seasonNumber: number;
  segmentType: "intro" | "credits";
  startSeconds: number;
  endSeconds: number;
  remainingSeconds: number;
  sampleCount: number;
  confidence: number;
  disabled: boolean;
};

export type ProviderPerformance = {
  providerId: string;
  score: number;
  sampleCount: number;
  startupSuccessPercent: number;
  averageStartupMs: number | null;
  bufferingCount: number;
  bufferingSeconds: number;
  errorCount: number;
  completionPercent: number;
  preciseTrackingPercent: number;
  lastUsedAt: number | null;
};

export type EpisodeInfo = {
  name: string;
  runtime: number | null;
};

export type SeasonEpisode = EpisodeInfo & {
  episodeNumber: number;
  overview: string;
  stillUrl: string | null;
  airDate: string | null;
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
  signalStrength?: number;
  signalOrigin?: "liked" | "completed" | "manual_legacy";
  completionSource?: import("@/lib/watch-tracking").CompletionSource;
};

export type WatchlistRecord = {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  addedAt: string;
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
  signalStrength?: number;
  signalOrigin?: "explicit" | "abandoned" | "watchlist_removed" | "manual_legacy";
  exactExclusion?: boolean;
};

export type WatchHistoryRecord = {
  tmdbId: number;
  mediaType: MediaType;
  completed: boolean;
  completionSource: import("@/lib/watch-tracking").CompletionSource;
  trackingConfidence: import("@/lib/watch-tracking").TrackingConfidence;
  importedAt: number | null;
  watchedAt: number | null;
  activePlaybackSeconds: number;
  extensionMeasuredSeconds: number;
  estimatedSeconds: number;
  seasonNumber: number | null;
  episodeNumber: number | null;
};

export type RecommendationExclusion = {
  tmdbId: number;
  mediaType: MediaType;
  reason:
    | "liked"
    | "disliked"
    | "watchlist"
    | "watched"
    | "not-now"
    | "never";
  expiresAt?: number | null;
};

export type ViewingEventType =
  | "VIEW_DETAILS"
  | "PLAY_STARTED"
  | "PROGRESS_UPDATED"
  | "PAUSED"
  | "COMPLETED"
  | "ABANDONED"
  | "WATCHLIST_ADDED"
  | "RATED"
  | "RECOMMENDATION_CLICKED"
  | "SEARCHED"
  | "FILTER_APPLIED";

export type ProfileStats = {
  profile: Profile;
  generatedAt: string;
  tracking: {
    measuredSessions: number;
    untrackedStarts: number;
    isPartial: boolean;
    confirmedWatchSeconds: number;
    estimatedWatchSeconds: number;
    manualCompletions: number;
    automaticCompletions: number;
    dataQuality: "high" | "medium" | "low";
    untrackedReasons: Array<{
      id:
        | "extension-absent"
        | "media-not-detected"
        | "session-too-short"
        | "provider-error"
        | "provider-changed"
        | "unknown";
      label: string;
      count: number;
    }>;
  };
  overview: {
    totalWatchSeconds: number;
    monthWatchSeconds: number;
    weekWatchSeconds: number;
    completedMovies: number;
    startedSeries: number;
    completedEpisodes: number;
    completedTitles: number;
    averageCompletionPercent: number;
  };
  habits: {
    topDay: string | null;
    usualTimeWindow: string | null;
    averageSessionSeconds: number;
    activeDays: number;
    longestStreakDays: number;
    moviePercent: number;
    seriesPercent: number;
    weekdayPercent: number;
    weekendPercent: number;
  };
  tastes: {
    genres: Array<{ id: number; name: string; percent: number }>;
    providers: Array<{ name: string; percent: number }>;
    audioLanguages: Array<{ name: string; percent: number }>;
  };
  progress: {
    likelyAbandoned: Array<{
      tmdbId: number;
      mediaType: MediaType;
      title: string;
      posterPath: string | null;
      percent: number;
      updatedAt: string;
    }>;
    series: Array<{
      tmdbId: number;
      title: string;
      posterPath: string | null;
      completedEpisodes: number;
      totalEpisodes: number;
      completedSeasons: number;
      remainingEpisodes: number;
      remainingSeconds: number;
      percent: number;
    }>;
  };
  recap: {
    label: string;
    watchSeconds: number;
    completedCount: number;
    topTitle: string | null;
    topGenre: string | null;
    comparedToPreviousPercent: number | null;
  };
  intelligence: {
    cinemaProfile: {
      title: string;
      summary: string;
      confidence: "emerging" | "established";
      traits: string[];
      suggestedMinutes: number | null;
    };
    discovery: {
      recommendationPercent: number | null;
      newGenresThisMonth: number;
      playedTitles: number;
      sources: Array<{
        id: "recommendation" | "search" | "filter" | "direct";
        label: string;
        count: number;
        percent: number;
      }>;
    };
    seriesLoyalty: {
      completionRate: number | null;
      mostRegularTitle: string | null;
      averageGapDays: number | null;
      longestPauseDays: number | null;
      longestPauseTitle: string | null;
      abandonedSeries: number;
      resumedSeries: number;
    };
    selection: {
      averageDetailsBeforePlay: number | null;
      averageDecisionSeconds: number | null;
      recommendationConversionPercent: number | null;
      searches: number;
      topFilters: Array<{ label: string; count: number }>;
    };
    regularity: {
      calendar: Array<{
        date: string;
        intensity: number;
        watchSeconds: number;
      }>;
      consecutiveWeeks: number;
      longestBreakDays: number;
      longestSessionSeconds: number;
      busiestDay: { date: string; watchSeconds: number } | null;
      busiestMonth: { label: string; watchSeconds: number } | null;
    };
  };
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
    watchlistCount: number;
    dislikeCount: number;
    movieCount: number;
    seriesCount: number;
    topGenres: Array<{ name: string; weight: number }>;
  };
};

export type RecommendationExposure = {
  tmdbId: number;
  mediaType: MediaType;
  shownCount: number;
  clickedCount: number;
  playedCount: number;
  completedCount: number;
  dismissedCount: number;
  ignoredCount: number;
  lastShownAt: number;
};

export type RecommendationImpression = {
  tmdbId: number;
  mediaType: MediaType;
  shelfType: string;
  position: number;
  score?: number;
};

export type EmbedProvider = {
  id: string;
  name: string;
  template: string;
  availabilityApi?: string;
  messageOrigins?: string[];
  supportsTracking: boolean;
  supportsLanguage: boolean;
  trackingCapabilities?: import("@/lib/watch-tracking").ProviderTrackingCapabilities;
  priority: number;
  quality?: number | null;
  reliability?: {
    score: number;
    lastCheckedAt: string | null;
  };
  performance?: ProviderPerformance;
  languages?: Array<{ id: string; label: string }>;
  customizationOptions?: {
    autoplay?: string;
    autonext?: string;
    [key: string]: string | undefined;
  };
};
