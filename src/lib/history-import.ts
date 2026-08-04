export type HistoryImportMode =
  | "previous-episodes"
  | "current-season"
  | "previous-seasons"
  | "whole-series"
  | "selected";

type SeasonShape = {
  seasonNumber: number;
  episodeCount: number;
};

type EpisodeSelection = {
  seasonNumber: number;
  episodeNumber: number;
};

export function buildHistoryImportEpisodes(input: {
  mode: HistoryImportMode;
  seasons: SeasonShape[];
  currentSeason: number;
  currentEpisode: number;
  selectedEpisodes?: EpisodeSelection[];
}) {
  const seasons = input.seasons
    .map((item) => ({
      seasonNumber: Math.floor(Number(item.seasonNumber)),
      episodeCount: Math.floor(Number(item.episodeCount)),
    }))
    .filter(
      (item) =>
        item.seasonNumber > 0 &&
        item.episodeCount > 0 &&
        Number.isFinite(item.seasonNumber) &&
        Number.isFinite(item.episodeCount),
    );
  const limits = new Map(
    seasons.map((item) => [item.seasonNumber, item.episodeCount]),
  );

  if (input.mode === "selected") {
    const unique = new Map<string, EpisodeSelection>();
    for (const item of input.selectedEpisodes ?? []) {
      const seasonNumber = Math.floor(Number(item.seasonNumber));
      const episodeNumber = Math.floor(Number(item.episodeNumber));
      if (
        seasonNumber > 0 &&
        episodeNumber > 0 &&
        episodeNumber <= (limits.get(seasonNumber) ?? 0)
      ) {
        unique.set(`${seasonNumber}:${episodeNumber}`, {
          seasonNumber,
          episodeNumber,
        });
      }
    }
    return [...unique.values()].slice(0, 5000);
  }

  const selectedSeasons = seasons.filter((item) => {
    if (input.mode === "current-season") {
      return item.seasonNumber === input.currentSeason;
    }
    if (input.mode === "previous-seasons") {
      return item.seasonNumber < input.currentSeason;
    }
    if (input.mode === "previous-episodes") {
      return item.seasonNumber === input.currentSeason;
    }
    return true;
  });

  return selectedSeasons.flatMap((season) => {
    const episodeLimit = input.mode === "previous-episodes"
      ? Math.min(season.episodeCount, Math.max(0, input.currentEpisode - 1))
      : season.episodeCount;
    return Array.from({ length: episodeLimit }, (_, index) => ({
      seasonNumber: season.seasonNumber,
      episodeNumber: index + 1,
    }));
  });
}

export function historyImportSummary(episodes: EpisodeSelection[]) {
  return {
    seasonCount: new Set(episodes.map((item) => item.seasonNumber)).size,
    episodeCount: episodes.length,
  };
}
