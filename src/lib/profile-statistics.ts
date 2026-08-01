import "server-only";

import { GENRES, SERIES_GENRES } from "@/lib/genres";
import { getDb, getProfile } from "@/lib/store";
import {
  completionSignalWeight,
  TRACKING_CONFIG,
  type CompletionSource,
} from "@/lib/watch-tracking";
import type {
  MediaType,
  ProfileStats,
  ViewingEventType,
} from "@/lib/types";

type EventRow = {
  sessionId: string;
  tmdbId: number | null;
  mediaType: MediaType | null;
  title: string;
  eventType: ViewingEventType;
  occurredAt: number;
  seasonNumber: number | null;
  episodeNumber: number | null;
  positionSeconds: number;
  durationSeconds: number;
  watchSeconds: number;
  estimatedWatchSeconds: number;
  providerWatchSeconds: number;
  completionSource: CompletionSource;
  audioLanguage: string;
  provider: string;
  genreIds: string;
  timezoneOffsetMinutes: number;
  metadataJson: string;
};

type HistoryRow = {
  tmdb_id: number;
  media_type: MediaType;
  season_number: number | null;
  episode_number: number | null;
  title: string;
  poster_path: string | null;
  progress_seconds: number;
  duration_seconds: number;
  completed: 0 | 1;
  completion_source: CompletionSource;
  series_episode_counts: string;
  updated_at: string;
};

type TrackingSessionRow = {
  id: string;
  startedAt: number;
  lastHeartbeatAt: number;
  providerWatchedSeconds: number;
  estimatedWatchedSeconds: number;
  trackingMethod: string;
  errorCount: number;
  lastEventName: string;
};

const DAY_NAMES = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];
const DAY_MS = 24 * 60 * 60 * 1000;

export function getProfileStats(profileId: string): ProfileStats {
  const profile = getProfile(profileId);
  if (!profile) throw new Error("Profil introuvable.");

  const events = getDb()
    .prepare(
      `
      select session_id as sessionId, tmdb_id as tmdbId,
        media_type as mediaType, title, event_type as eventType,
        occurred_at as occurredAt, season_number as seasonNumber,
        episode_number as episodeNumber, position_seconds as positionSeconds,
        duration_seconds as durationSeconds, watch_seconds as watchSeconds,
        estimated_watch_seconds as estimatedWatchSeconds,
        provider_watch_seconds as providerWatchSeconds,
        completion_source as completionSource,
        audio_language as audioLanguage, provider, genre_ids as genreIds,
        timezone_offset_minutes as timezoneOffsetMinutes,
        metadata_json as metadataJson
      from viewing_events
      where profile_id = ?
      order by occurred_at, id
    `,
    )
    .all(profileId) as EventRow[];
  const history = getDb()
    .prepare(
      `
      select *
      from watch_history
      where user_id = ?
      order by datetime(updated_at) desc, id desc
    `,
    )
    .all(profileId) as HistoryRow[];
  const trackingSessions = getDb()
    .prepare(
      `
      select id, started_at as startedAt,
        last_heartbeat_at as lastHeartbeatAt,
        provider_watched_seconds as providerWatchedSeconds,
        estimated_watched_seconds as estimatedWatchedSeconds,
        tracking_method as trackingMethod, error_count as errorCount,
        last_event_name as lastEventName
      from watch_sessions
      where profile_id = ?
    `,
    )
    .all(profileId) as TrackingSessionRow[];

  const offset = events.at(-1)?.timezoneOffsetMinutes ?? 0;
  const now = Date.now();
  const currentMonth = localMonth(now, offset);
  const previousMonth = previousMonthKey(now, offset);
  const currentWeekStart = weekStartKey(now, offset);
  const totalWatchSeconds = sum(events.map((event) => event.watchSeconds));
  const confirmedWatchSeconds = sum(
    events.map((event) => event.providerWatchSeconds),
  );
  const estimatedWatchSeconds = sum(
    events.map((event) => event.estimatedWatchSeconds),
  );
  const monthEvents = events.filter(
    (event) => localMonth(event.occurredAt, offset) === currentMonth,
  );
  const previousMonthEvents = events.filter(
    (event) => localMonth(event.occurredAt, offset) === previousMonth,
  );
  const weekEvents = events.filter(
    (event) => localDay(event.occurredAt, offset) >= currentWeekStart,
  );
  const completedMovies = history.filter(
    (item) => item.media_type === "movie" && item.completed,
  ).length;
  const completedEpisodes = new Set(
    history
      .filter(
        (item) =>
          item.media_type === "tv" &&
          item.completed &&
          item.season_number !== null &&
          item.episode_number !== null,
      )
      .map(
        (item) =>
          `${item.tmdb_id}:${item.season_number}:${item.episode_number}`,
      ),
  ).size;
  const manualCompletions = history.filter(
    (item) =>
      item.completed &&
      (item.completion_source === "manual" ||
        item.completion_source === "hybrid"),
  ).length;
  const automaticCompletions = history.filter(
    (item) =>
      item.completed &&
      (item.completion_source === "provider" ||
        item.completion_source === "estimated"),
  ).length;
  const seriesGroups = buildSeriesGroups(history);
  const completedSeries = seriesGroups.filter(
    (series) =>
      series.totalEpisodes > 0 &&
      series.completedEpisodes >= series.totalEpisodes,
  ).length;
  const completionRatios = history.map(completionRatio).filter(isNumber);
  const sessionTotals = groupedTotals(
    events.filter((event) => event.sessionId),
    (event) => event.sessionId,
    (event) => event.watchSeconds,
  );
  const measuredSessions = [...sessionTotals.values()].filter(
    (seconds) => seconds > 0,
  );
  const startedSessionKeys = new Set(
    events
      .filter((event) => event.eventType === "PLAY_STARTED")
      .map((event) => event.sessionId)
      .filter(Boolean),
  );
  const untrackedStarts = [...startedSessionKeys].filter(
    (sessionId) => (sessionTotals.get(sessionId) ?? 0) === 0,
  ).length;
  const sessionRows = new Map(trackingSessions.map((row) => [row.id, row]));
  const untrackedReasonCounts = new Map<
    ProfileStats["tracking"]["untrackedReasons"][number]["id"],
    number
  >();
  [...startedSessionKeys]
    .filter((sessionId) => (sessionTotals.get(sessionId) ?? 0) === 0)
    .forEach((sessionId) => {
      const reason = untrackedReason(sessionRows.get(sessionId));
      add(untrackedReasonCounts, reason, 1);
    });
  const trackedSeconds = confirmedWatchSeconds + estimatedWatchSeconds;
  const confirmedRatio = trackedSeconds > 0
    ? confirmedWatchSeconds / trackedSeconds
    : 0;
  const untrackedRatio = startedSessionKeys.size
    ? untrackedStarts / startedSessionKeys.size
    : 0;
  const dataQuality: ProfileStats["tracking"]["dataQuality"] =
    confirmedRatio >= 0.8 && untrackedRatio <= 0.1
      ? "high"
      : confirmedRatio >= 0.35 && untrackedRatio <= 0.5
        ? "medium"
        : "low";
  const averageSessionSeconds = measuredSessions.length
    ? Math.round(sum(measuredSessions) / measuredSessions.length)
    : 0;

  const dayWeights = new Map<number, number>();
  for (const event of events) {
    const weight =
      event.watchSeconds ||
      (event.eventType === "PLAY_STARTED" ? 1 : 0);
    if (!weight) continue;
    add(dayWeights, localWeekday(event.occurredAt, offset), weight);
  }
  const topDayNumber = topEntry(dayWeights)?.[0];
  const startEvents = events.filter(
    (event) => event.eventType === "PLAY_STARTED",
  );
  const hourBuckets = new Map<number, number>();
  startEvents.forEach((event) => {
    const hour = localHour(event.occurredAt, offset);
    add(hourBuckets, Math.floor(hour / 3) * 3, 1);
  });
  const topHour = topEntry(hourBuckets)?.[0];
  const activeDayKeys = new Set(
    events
      .filter(
        (event) =>
          event.eventType === "PLAY_STARTED" || event.watchSeconds > 0,
      )
      .map((event) => localDay(event.occurredAt, offset)),
  );
  const movieWatchSeconds = sum(
    events
      .filter((event) => event.mediaType === "movie")
      .map((event) => event.watchSeconds),
  );
  const seriesWatchSeconds = sum(
    events
      .filter((event) => event.mediaType === "tv")
      .map((event) => event.watchSeconds),
  );
  const mediaTotal = movieWatchSeconds + seriesWatchSeconds;
  const weekendSeconds = sum(
    events
      .filter((event) =>
        [0, 6].includes(localWeekday(event.occurredAt, offset)),
      )
      .map((event) => event.watchSeconds),
  );
  const habitTotal = Math.max(1, totalWatchSeconds);
  const moviePercent = mediaTotal
    ? Math.round((movieWatchSeconds / mediaTotal) * 100)
    : fallbackMediaPercent(history, "movie");
  const seriesPercent = mediaTotal
    ? Math.round((seriesWatchSeconds / mediaTotal) * 100)
    : fallbackMediaPercent(history, "tv");
  const genreWeights = tasteWeights(events, (event) =>
    parseNumberArray(event.genreIds),
  );
  const providerWeights = tasteWeights(events, (event) =>
    event.provider ? [event.provider] : [],
  );
  const languageWeights = tasteWeights(events, (event) =>
    event.audioLanguage ? [event.audioLanguage.toUpperCase()] : [],
  );
  const currentMonthSeconds = sum(
    monthEvents.map((event) => event.watchSeconds),
  );
  const previousMonthSeconds = sum(
    previousMonthEvents.map((event) => event.watchSeconds),
  );
  const currentMonthGenres = tasteWeights(monthEvents, (event) =>
    parseNumberArray(event.genreIds),
  );
  const recapTitles = tasteWeights(monthEvents, (event) =>
    event.tmdbId && event.title
      ? [`${event.mediaType}:${event.tmdbId}:${event.title}`]
      : [],
  );
  const recapTitleKey = topEntry(recapTitles)?.[0] ?? null;
  const abandoned = likelyAbandoned(history, now);
  const intelligence = buildIntelligence({
    events,
    history,
    seriesGroups,
    abandoned,
    offset,
    now,
    currentMonth,
    genreWeights,
    averageSessionSeconds,
    moviePercent,
    seriesPercent,
    topDay:
      topDayNumber === undefined ? null : DAY_NAMES[topDayNumber] ?? null,
    topHour: topHour ?? null,
    sessionTotals,
  });

  return {
    profile,
    generatedAt: new Date().toISOString(),
    tracking: {
      measuredSessions: measuredSessions.length,
      untrackedStarts,
      isPartial: untrackedStarts > 0,
      confirmedWatchSeconds,
      estimatedWatchSeconds,
      manualCompletions,
      automaticCompletions,
      dataQuality,
      untrackedReasons: [...untrackedReasonCounts.entries()]
        .map(([id, count]) => ({ id, label: untrackedReasonLabel(id), count }))
        .sort((left, right) => right.count - left.count),
    },
    overview: {
      totalWatchSeconds,
      monthWatchSeconds: currentMonthSeconds,
      weekWatchSeconds: sum(weekEvents.map((event) => event.watchSeconds)),
      completedMovies,
      startedSeries: seriesGroups.length,
      completedEpisodes,
      completedTitles: completedMovies + completedSeries,
      averageCompletionPercent: completionRatios.length
        ? Math.round(
            (sum(completionRatios) / completionRatios.length) * 100,
          )
        : 0,
    },
    habits: {
      topDay:
        topDayNumber === undefined ? null : DAY_NAMES[topDayNumber] ?? null,
      usualTimeWindow:
        topHour === undefined
          ? null
          : `${String(topHour).padStart(2, "0")} h - ${String(
              (topHour + 3) % 24,
            ).padStart(2, "0")} h`,
      averageSessionSeconds,
      activeDays: activeDayKeys.size,
      longestStreakDays: longestDateStreak([...activeDayKeys]),
      moviePercent,
      seriesPercent,
      weekdayPercent: Math.round(
        ((totalWatchSeconds - weekendSeconds) / habitTotal) * 100,
      ),
      weekendPercent: Math.round((weekendSeconds / habitTotal) * 100),
    },
    tastes: {
      genres: shares(genreWeights, 5).map(({ key, percent }) => ({
        id: Number(key),
        name: genreName(Number(key)),
        percent,
      })),
      providers: shares(providerWeights, 4).map(({ key, percent }) => ({
        name: String(key),
        percent,
      })),
      audioLanguages: shares(languageWeights, 4).map(
        ({ key, percent }) => ({
          name: String(key),
          percent,
        }),
      ),
    },
    progress: {
      likelyAbandoned: abandoned,
      series: seriesGroups
        .filter(
          (series) =>
            series.totalEpisodes === 0 ||
            series.completedEpisodes < series.totalEpisodes,
        )
        .slice(0, 8),
    },
    recap: {
      label: monthLabel(now, offset),
      watchSeconds: currentMonthSeconds,
      completedCount: history.filter(
        (item) =>
          item.completed &&
          localMonth(historyTimestamp(item.updated_at), offset) === currentMonth,
      ).length,
      topTitle: recapTitleKey?.split(":").slice(2).join(":") || null,
      topGenre:
        topEntry(currentMonthGenres)?.[0] === undefined
          ? null
          : genreName(Number(topEntry(currentMonthGenres)?.[0])),
      comparedToPreviousPercent:
        previousMonthSeconds > 0
          ? Math.round(
              ((currentMonthSeconds - previousMonthSeconds) /
                previousMonthSeconds) *
                100,
            )
          : null,
    },
    intelligence,
  };
}

function buildSeriesGroups(history: HistoryRow[]) {
  const groups = new Map<number, HistoryRow[]>();
  history
    .filter((item) => item.media_type === "tv")
    .forEach((item) => {
      const group = groups.get(item.tmdb_id) ?? [];
      group.push(item);
      groups.set(item.tmdb_id, group);
    });

  return [...groups.entries()]
    .map(([tmdbId, rows]) => {
      const latest = rows[0];
      const episodeCounts =
        rows
          .map((row) => parseEpisodeCounts(row.series_episode_counts))
          .find((counts) => counts.length > 0) ?? [];
      const completed = new Set(
        rows
          .filter(
            (row) =>
              row.completed &&
              row.season_number !== null &&
              row.episode_number !== null,
          )
          .map((row) => `${row.season_number}:${row.episode_number}`),
      );
      const totalEpisodes = sum(
        episodeCounts.map((item) => item.episodeCount),
      );
      const completedSeasons = episodeCounts.filter(({ seasonNumber, episodeCount }) =>
        Array.from({ length: episodeCount }, (_, index) => index + 1).every(
          (episodeNumber) =>
            completed.has(`${seasonNumber}:${episodeNumber}`),
        ),
      ).length;
      const measuredDurations = rows
        .map((row) => row.duration_seconds)
        .filter((duration) => duration > 0);
      const averageEpisodeSeconds = measuredDurations.length
        ? Math.round(sum(measuredDurations) / measuredDurations.length)
        : 45 * 60;
      const remainingEpisodes = Math.max(
        0,
        totalEpisodes - completed.size,
      );

      return {
        tmdbId,
        title: latest.title,
        posterPath: latest.poster_path,
        completedEpisodes: completed.size,
        totalEpisodes,
        completedSeasons,
        remainingEpisodes,
        remainingSeconds: remainingEpisodes * averageEpisodeSeconds,
        percent: totalEpisodes
          ? Math.round((completed.size / totalEpisodes) * 100)
          : 0,
      };
    })
    .sort((left, right) => right.percent - left.percent);
}

function likelyAbandoned(history: HistoryRow[], now: number) {
  const latestByTitle = new Map<string, HistoryRow>();
  for (const item of history) {
    const key = `${item.media_type}:${item.tmdb_id}`;
    if (!latestByTitle.has(key)) latestByTitle.set(key, item);
  }
  const staleBefore = now - 14 * 24 * 60 * 60 * 1000;

  return [...latestByTitle.values()]
    .filter((item) => {
      if (item.completed || item.progress_seconds <= 0) return false;
      const ratio = completionRatio(item);
      return (
        new Date(`${item.updated_at.replace(" ", "T")}Z`).getTime() <
          staleBefore &&
        (ratio === null || ratio < 0.3)
      );
    })
    .map((item) => ({
      tmdbId: item.tmdb_id,
      mediaType: item.media_type,
      title: item.title,
      posterPath: item.poster_path,
      percent: Math.round((completionRatio(item) ?? 0) * 100),
      updatedAt: item.updated_at,
    }))
    .slice(0, 6);
}

function buildIntelligence({
  events,
  history,
  seriesGroups,
  abandoned,
  offset,
  now,
  currentMonth,
  genreWeights,
  averageSessionSeconds,
  moviePercent,
  seriesPercent,
  topDay,
  topHour,
  sessionTotals,
}: {
  events: EventRow[];
  history: HistoryRow[];
  seriesGroups: ReturnType<typeof buildSeriesGroups>;
  abandoned: ReturnType<typeof likelyAbandoned>;
  offset: number;
  now: number;
  currentMonth: string;
  genreWeights: Map<number, number>;
  averageSessionSeconds: number;
  moviePercent: number;
  seriesPercent: number;
  topDay: string | null;
  topHour: number | null;
  sessionTotals: Map<string, number>;
}): ProfileStats["intelligence"] {
  const discovery = discoveryStats(events, currentMonth);
  const seriesLoyalty = seriesLoyaltyStats(
    events,
    history,
    seriesGroups,
    abandoned,
  );
  const selection = selectionStats(events);
  const regularity = regularityStats(
    events,
    history,
    sessionTotals,
    offset,
    now,
  );
  const knownDurations = history
    .map((item) => item.duration_seconds)
    .filter((duration) => duration > 0);
  const typicalSeconds =
    averageSessionSeconds ||
    (knownDurations.length
      ? Math.round(sum(knownDurations) / knownDurations.length)
      : 0);
  const topGenre = shares(genreWeights, 1)[0];
  const titleCount = new Set(
    history.map((item) => `${item.media_type}:${item.tmdb_id}`),
  ).size;
  const playCount = events.filter(
    (event) => event.eventType === "PLAY_STARTED",
  ).length;
  const isEstablished = titleCount >= 10 && playCount >= 3;
  const isAnimation =
    topGenre?.key === 16 && (topGenre?.percent ?? 0) >= 30;
  const isNight = topHour !== null && (topHour >= 20 || topHour < 3);
  const isMarathon =
    averageSessionSeconds >= 2 * 60 * 60 ||
    regularity.longestSessionSeconds >= 3 * 60 * 60;
  let profileTitle = "Spectateur curieux";
  if (titleCount < 3) profileTitle = "Profil en construction";
  else if (isAnimation) profileTitle = "Amateur d'animation";
  else if (seriesPercent >= 70) profileTitle = "Serievore";
  else if (isMarathon) profileTitle = "Marathonien";
  else if (isNight) profileTitle = "Explorateur nocturne";
  else if (genreWeights.size >= 4) profileTitle = "Explorateur";
  else if (moviePercent >= 70) profileTitle = "Cinephile";

  const traits = [
    seriesPercent > moviePercent
      ? `${seriesPercent} % de series`
      : `${moviePercent} % de films`,
    topGenre ? `Genre dominant : ${genreName(Number(topGenre.key))}` : null,
    topDay ? `Jour le plus actif : ${topDay}` : null,
    typicalSeconds
      ? `Format habituel : ${formatMinutes(typicalSeconds)}`
      : null,
  ].filter((value): value is string => Boolean(value));
  const medium =
    seriesPercent > moviePercent ? "des series" : "des films";
  const rhythm = topDay
    ? ` surtout le ${topDay}`
    : "";
  const genre = topGenre
    ? `, avec une preference pour ${genreName(Number(topGenre.key)).toLowerCase()}`
    : "";
  const summary =
    titleCount < 3
      ? "Continuez quelques lectures pour que CineVerse distingue vos vrais choix des simples consultations."
      : `Vous choisissez principalement ${medium}${rhythm}${genre}. Ce portrait evolue avec les lectures terminees, les abandons et vos avis.`;

  return {
    cinemaProfile: {
      title: profileTitle,
      summary,
      confidence: isEstablished ? "established" : "emerging",
      traits,
      suggestedMinutes: typicalSeconds
        ? nearestDuration(Math.round(typicalSeconds / 60))
        : null,
    },
    discovery,
    seriesLoyalty,
    selection,
    regularity,
  };
}

function discoveryStats(
  events: EventRow[],
  currentMonth: string,
): ProfileStats["intelligence"]["discovery"] {
  const firstPlays = new Map<string, EventRow>();
  for (const event of events) {
    if (event.eventType !== "PLAY_STARTED") continue;
    const key = mediaKey(event);
    if (key && !firstPlays.has(key)) firstPlays.set(key, event);
  }

  const counts = new Map<
    "recommendation" | "search" | "filter" | "direct",
    number
  >();
  for (const [key, play] of firstPlays) {
    const recommendation = events.some(
      (event) =>
        event.eventType === "RECOMMENDATION_CLICKED" &&
        mediaKey(event) === key &&
        event.occurredAt <= play.occurredAt &&
        play.occurredAt - event.occurredAt <= 7 * DAY_MS,
    );
    if (recommendation) {
      add(counts, "recommendation", 1);
      continue;
    }
    const navigation = [...events]
      .reverse()
      .find(
        (event) =>
          (event.eventType === "SEARCHED" ||
            event.eventType === "FILTER_APPLIED") &&
          event.occurredAt <= play.occurredAt &&
          play.occurredAt - event.occurredAt <= 30 * 60 * 1000,
      );
    add(
      counts,
      navigation?.eventType === "SEARCHED"
        ? "search"
        : navigation?.eventType === "FILTER_APPLIED"
          ? "filter"
          : "direct",
      1,
    );
  }

  const allGenresBeforeMonth = new Set<number>();
  const genresThisMonth = new Set<number>();
  events
    .filter((event) =>
      ["PLAY_STARTED", "COMPLETED"].includes(event.eventType),
    )
    .forEach((event) => {
      const target =
        localMonth(event.occurredAt, event.timezoneOffsetMinutes) ===
        currentMonth
          ? genresThisMonth
          : allGenresBeforeMonth;
      parseNumberArray(event.genreIds).forEach((id) => target.add(id));
    });
  const playedTitles = firstPlays.size;
  const labels = {
    recommendation: "Recommandations",
    search: "Recherche",
    filter: "Filtres",
    direct: "Acces direct",
  } as const;

  return {
    recommendationPercent: playedTitles
      ? Math.round(((counts.get("recommendation") ?? 0) / playedTitles) * 100)
      : null,
    newGenresThisMonth: [...genresThisMonth].filter(
      (genre) => !allGenresBeforeMonth.has(genre),
    ).length,
    playedTitles,
    sources: (
      ["recommendation", "search", "filter", "direct"] as const
    )
      .map((id) => ({
        id,
        label: labels[id],
        count: counts.get(id) ?? 0,
        percent: playedTitles
          ? Math.round(((counts.get(id) ?? 0) / playedTitles) * 100)
          : 0,
      }))
      .filter((item) => item.count > 0),
  };
}

function seriesLoyaltyStats(
  events: EventRow[],
  history: HistoryRow[],
  seriesGroups: ReturnType<typeof buildSeriesGroups>,
  abandoned: ReturnType<typeof likelyAbandoned>,
): ProfileStats["intelligence"]["seriesLoyalty"] {
  const continuationRate = seriesContinuationRate(history);
  const episodesBySeries = new Map<
    number,
    { title: string; episodes: Map<string, number> }
  >();
  const remember = (
    tmdbId: number,
    title: string,
    season: number | null,
    episode: number | null,
    timestamp: number,
  ) => {
    if (season === null || episode === null || !Number.isFinite(timestamp)) {
      return;
    }
    const series = episodesBySeries.get(tmdbId) ?? {
      title,
      episodes: new Map<string, number>(),
    };
    const key = `${season}:${episode}`;
    const existing = series.episodes.get(key);
    if (existing === undefined || timestamp < existing) {
      series.episodes.set(key, timestamp);
    }
    episodesBySeries.set(tmdbId, series);
  };
  events
    .filter(
      (event) =>
        event.mediaType === "tv" &&
        (event.eventType === "PLAY_STARTED" ||
          event.eventType === "COMPLETED") &&
        event.tmdbId !== null,
    )
    .forEach((event) =>
      remember(
        event.tmdbId as number,
        event.title,
        event.seasonNumber,
        event.episodeNumber,
        event.occurredAt,
      ),
    );
  history
    .filter((item) => item.media_type === "tv")
    .forEach((item) =>
      remember(
        item.tmdb_id,
        item.title,
        item.season_number,
        item.episode_number,
        historyTimestamp(item.updated_at),
      ),
    );

  const allGaps: Array<{ days: number; title: string }> = [];
  const averages: Array<{ days: number; title: string }> = [];
  let resumedSeries = 0;
  episodesBySeries.forEach(({ title, episodes }) => {
    const times = [...episodes.values()].sort((left, right) => left - right);
    const gaps = times
      .slice(1)
      .map((time, index) => Math.max(0, (time - times[index]) / DAY_MS));
    if (!gaps.length) return;
    gaps.forEach((days) => allGaps.push({ days, title }));
    averages.push({ days: sum(gaps) / gaps.length, title });
    if (gaps.some((days) => days >= 14)) resumedSeries += 1;
  });
  const mostRegular = [...averages].sort(
    (left, right) => left.days - right.days,
  )[0];
  const longestPause = [...allGaps].sort(
    (left, right) => right.days - left.days,
  )[0];

  return {
    completionRate: continuationRate,
    mostRegularTitle: mostRegular?.title ?? null,
    averageGapDays: allGaps.length
      ? roundTo(sum(allGaps.map((gap) => gap.days)) / allGaps.length, 1)
      : null,
    longestPauseDays: longestPause ? Math.round(longestPause.days) : null,
    longestPauseTitle: longestPause?.title ?? null,
    abandonedSeries: new Set(
      abandoned
        .filter((item) => item.mediaType === "tv")
        .map((item) => item.tmdbId),
    ).size,
    resumedSeries,
  };
}

function seriesContinuationRate(history: HistoryRow[]) {
  const bySeries = new Map<number, HistoryRow[]>();
  history
    .filter(
      (item) =>
        item.media_type === "tv" &&
        item.season_number !== null &&
        item.episode_number !== null &&
        (item.progress_seconds > 0 || item.completed),
    )
    .forEach((item) => {
      const rows = bySeries.get(item.tmdb_id) ?? [];
      rows.push(item);
      bySeries.set(item.tmdb_id, rows);
    });

  let opportunities = 0;
  let continued = 0;
  bySeries.forEach((rows) => {
    const counts = rows
      .map((row) => parseEpisodeCounts(row.series_episode_counts))
      .find((value) => value.length > 0);
    if (!counts?.length) return;
    const watched = new Set(
      rows.map((row) => `${row.season_number}:${row.episode_number}`),
    );
    watched.forEach((key) => {
      const [seasonNumber, episodeNumber] = key.split(":").map(Number);
      const currentSeason = counts.find(
        (season) => season.seasonNumber === seasonNumber,
      );
      let nextKey = "";
      if (currentSeason && episodeNumber < currentSeason.episodeCount) {
        nextKey = `${seasonNumber}:${episodeNumber + 1}`;
      } else {
        const nextSeason = counts
          .filter((season) => season.seasonNumber > seasonNumber)
          .sort((left, right) => left.seasonNumber - right.seasonNumber)[0];
        if (nextSeason) nextKey = `${nextSeason.seasonNumber}:1`;
      }
      if (!nextKey) return;
      opportunities += 1;
      if (watched.has(nextKey)) continued += 1;
    });
  });
  return opportunities > 0
    ? Math.round((continued / opportunities) * 100)
    : null;
}

function untrackedReason(
  session: TrackingSessionRow | undefined,
): ProfileStats["tracking"]["untrackedReasons"][number]["id"] {
  if (!session) return "unknown";
  if (session.errorCount > 0 || session.lastEventName === "error") {
    return "provider-error";
  }
  if (session.lastHeartbeatAt - session.startedAt < 15_000) {
    return "session-too-short";
  }
  if (
    session.trackingMethod === "browser-extension" &&
    session.providerWatchedSeconds <= 0
  ) {
    return "media-not-detected";
  }
  if (
    session.trackingMethod === "local-estimate" ||
    session.trackingMethod === "unknown"
  ) {
    return "extension-absent";
  }
  return "unknown";
}

function untrackedReasonLabel(
  id: ProfileStats["tracking"]["untrackedReasons"][number]["id"],
) {
  const labels = {
    "extension-absent": "Extension absente ou inactive",
    "media-not-detected": "Aucun media exploitable detecte",
    "session-too-short": "Session trop courte",
    "provider-error": "Erreur du provider",
    "provider-changed": "Provider change pendant la lecture",
    unknown: "Cause indeterminee",
  } as const;
  return labels[id];
}

function selectionStats(
  events: EventRow[],
): ProfileStats["intelligence"]["selection"] {
  const playEvents = events.filter(
    (event) => event.eventType === "PLAY_STARTED",
  );
  const detailCounts: number[] = [];
  const decisionTimes: number[] = [];
  for (const play of playEvents) {
    const context = events.filter(
      (event) =>
        event.occurredAt <= play.occurredAt &&
        play.occurredAt - event.occurredAt <=
          TRACKING_CONFIG.maximumActiveDecisionSeconds * 1000 &&
        [
          "SEARCHED",
          "FILTER_APPLIED",
          "VIEW_DETAILS",
          "RECOMMENDATION_CLICKED",
        ].includes(event.eventType),
    );
    detailCounts.push(
      context.filter((event) => event.eventType === "VIEW_DETAILS").length,
    );
    const activeContext = [...context]
      .sort((left, right) => right.occurredAt - left.occurredAt)
      .reduce<EventRow[]>((chain, event) => {
        const previous = chain.at(-1)?.occurredAt ?? play.occurredAt;
        if (previous - event.occurredAt > 5 * 60 * 1000) return chain;
        chain.push(event);
        return chain;
      }, []);
    const first = activeContext.at(-1);
    if (first) decisionTimes.push(play.occurredAt - first.occurredAt);
  }

  const recommendationClicks = events.filter(
    (event) =>
      event.eventType === "RECOMMENDATION_CLICKED" && mediaKey(event),
  );
  const converted = recommendationClicks.filter((click) =>
    playEvents.some(
      (play) =>
        mediaKey(play) === mediaKey(click) &&
        play.occurredAt >= click.occurredAt &&
        play.occurredAt - click.occurredAt <= 7 * DAY_MS,
    ),
  ).length;
  const filterCounts = new Map<string, number>();
  events
    .filter((event) => event.eventType === "FILTER_APPLIED")
    .forEach((event) => {
      const metadata = parseObject(event.metadataJson);
      const filters = isRecord(metadata.filters) ? metadata.filters : {};
      Object.entries(filters).forEach(([key, value]) => {
        const label = filterLabel(key, String(value));
        if (label) add(filterCounts, label, 1);
      });
    });

  return {
    averageDetailsBeforePlay: detailCounts.length
      ? roundTo(sum(detailCounts) / detailCounts.length, 1)
      : null,
    averageDecisionSeconds: decisionTimes.length
      ? Math.round(sum(decisionTimes) / decisionTimes.length / 1000)
      : null,
    recommendationConversionPercent: recommendationClicks.length
      ? Math.round((converted / recommendationClicks.length) * 100)
      : null,
    searches: events.filter((event) => event.eventType === "SEARCHED").length,
    topFilters: [...filterCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([label, count]) => ({ label, count })),
  };
}

function regularityStats(
  events: EventRow[],
  history: HistoryRow[],
  sessionTotals: Map<string, number>,
  offset: number,
  now: number,
): ProfileStats["intelligence"]["regularity"] {
  const days = new Map<string, { watchSeconds: number; starts: number }>();
  events.forEach((event) => {
    const key = localDay(event.occurredAt, offset);
    const day = days.get(key) ?? { watchSeconds: 0, starts: 0 };
    day.watchSeconds += event.watchSeconds;
    if (event.eventType === "PLAY_STARTED") day.starts += 1;
    days.set(key, day);
  });
  history.forEach((item) => {
    const timestamp = historyTimestamp(item.updated_at);
    if (!Number.isFinite(timestamp)) return;
    const key = localDay(timestamp, offset);
    if (!days.has(key)) days.set(key, { watchSeconds: 0, starts: 1 });
  });

  const currentWeekStart = Date.parse(
    `${weekStartFromDay(localDay(now, offset))}T00:00:00Z`,
  );
  const firstDay = currentWeekStart - 51 * 7 * DAY_MS;
  const scores = [...days.values()].map(
    (day) => day.watchSeconds || day.starts * 60,
  );
  const maxScore = Math.max(1, ...scores);
  const calendar = Array.from({ length: 364 }, (_, index) => {
    const date = new Date(firstDay + index * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const activity = days.get(date) ?? { watchSeconds: 0, starts: 0 };
    const score = activity.watchSeconds || activity.starts * 60;
    return {
      date,
      intensity: score ? Math.max(1, Math.ceil((score / maxScore) * 4)) : 0,
      watchSeconds: activity.watchSeconds,
    };
  });
  const activeKeys = [...days.entries()]
    .filter(([, value]) => value.watchSeconds > 0 || value.starts > 0)
    .map(([key]) => key)
    .sort();
  const weekKeys = new Set(activeKeys.map(weekStartFromDay));
  const dayEntries = [...days.entries()].filter(
    ([, value]) => value.watchSeconds > 0 || value.starts > 0,
  );
  const busiestDayEntry = [...dayEntries].sort(
    (left, right) =>
      right[1].watchSeconds +
      right[1].starts * 60 -
      (left[1].watchSeconds + left[1].starts * 60),
  )[0];
  const months = new Map<string, number>();
  dayEntries.forEach(([key, value]) =>
    add(months, key.slice(0, 7), value.watchSeconds),
  );
  const busiestMonthEntry = topEntry(months);

  return {
    calendar,
    consecutiveWeeks: longestDateStreak(
      [...weekKeys].map((key) => key),
      7,
    ),
    longestBreakDays: longestBreak(activeKeys),
    longestSessionSeconds: Math.max(0, ...sessionTotals.values()),
    busiestDay: busiestDayEntry
      ? {
          date: busiestDayEntry[0],
          watchSeconds: busiestDayEntry[1].watchSeconds,
        }
      : null,
    busiestMonth: busiestMonthEntry
      ? {
          label: monthLabel(
            Date.parse(`${busiestMonthEntry[0]}-01T00:00:00Z`),
            0,
          ),
          watchSeconds: busiestMonthEntry[1],
        }
      : null,
  };
}

function tasteWeights<K extends string | number>(
  events: EventRow[],
  keys: (event: EventRow) => K[],
) {
  const weights = new Map<K, number>();
  for (const event of events) {
    const eventKeys = keys(event);
    if (!eventKeys.length) continue;
    const weight =
      event.watchSeconds ||
      (event.eventType === "COMPLETED"
        ? Math.round(5 * 60 * completionSignalWeight(event.completionSource))
        : event.eventType === "PLAY_STARTED"
          ? 1
          : 0);
    if (!weight) continue;
    eventKeys.forEach((key) => add(weights, key, weight));
  }
  return weights;
}

function shares<K extends string | number>(weights: Map<K, number>, limit: number) {
  const total = sum([...weights.values()]);
  if (!total) return [];
  return [...weights.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([key, weight]) => ({
      key,
      percent: Math.max(1, Math.round((weight / total) * 100)),
    }));
}

function groupedTotals<T, K>(
  items: T[],
  keyOf: (item: T) => K,
  valueOf: (item: T) => number,
) {
  const result = new Map<K, number>();
  items.forEach((item) => add(result, keyOf(item), valueOf(item)));
  return result;
}

function add<K>(map: Map<K, number>, key: K, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function topEntry<K>(map: Map<K, number>) {
  return [...map.entries()].sort((left, right) => right[1] - left[1])[0];
}

function completionRatio(item: HistoryRow) {
  if (item.completed) return 1;
  if (item.duration_seconds <= 0) return null;
  return Math.max(
    0,
    Math.min(1, item.progress_seconds / item.duration_seconds),
  );
}

function fallbackMediaPercent(history: HistoryRow[], mediaType: MediaType) {
  const media = new Set(
    history
      .filter((item) => item.media_type === mediaType)
      .map((item) => `${item.media_type}:${item.tmdb_id}`),
  ).size;
  const all = new Set(
    history.map((item) => `${item.media_type}:${item.tmdb_id}`),
  ).size;
  return all ? Math.round((media / all) * 100) : 0;
}

function genreName(id: number) {
  return (
    [...GENRES, ...SERIES_GENRES].find((genre) => genre.id === id)?.name ??
    `Genre ${id}`
  );
}

function parseEpisodeCounts(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const value = item as Record<string, unknown>;
        return {
          seasonNumber: Math.floor(Number(value.seasonNumber)),
          episodeCount: Math.floor(Number(value.episodeCount)),
        };
      })
      .filter(
        (item) =>
          item.seasonNumber > 0 &&
          Number.isFinite(item.seasonNumber) &&
          item.episodeCount > 0 &&
          Number.isFinite(item.episodeCount),
      );
  } catch {
    return [];
  }
}

function parseNumberArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map(Number).filter(Number.isFinite)
      : [];
  } catch {
    return [];
  }
}

function localDate(timestamp: number, offsetMinutes: number) {
  return new Date(timestamp - offsetMinutes * 60 * 1000);
}

function localDay(timestamp: number, offsetMinutes: number) {
  return localDate(timestamp, offsetMinutes).toISOString().slice(0, 10);
}

function localMonth(timestamp: number, offsetMinutes: number) {
  return localDate(timestamp, offsetMinutes).toISOString().slice(0, 7);
}

function localWeekday(timestamp: number, offsetMinutes: number) {
  return localDate(timestamp, offsetMinutes).getUTCDay();
}

function localHour(timestamp: number, offsetMinutes: number) {
  return localDate(timestamp, offsetMinutes).getUTCHours();
}

function weekStartKey(timestamp: number, offsetMinutes: number) {
  const date = localDate(timestamp, offsetMinutes);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return date.toISOString().slice(0, 10);
}

function previousMonthKey(timestamp: number, offsetMinutes: number) {
  const date = localDate(timestamp, offsetMinutes);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

function monthLabel(timestamp: number, offsetMinutes: number) {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(localDate(timestamp, offsetMinutes));
}

function longestDateStreak(keys: string[], intervalDays = 1) {
  const days = [...new Set(keys)]
    .map((key) => Date.parse(`${key}T00:00:00Z`))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  let longest = 0;
  let current = 0;
  let previous = 0;
  for (const day of days) {
    current = previous && day - previous === intervalDays * DAY_MS
      ? current + 1
      : 1;
    longest = Math.max(longest, current);
    previous = day;
  }
  return longest;
}

function longestBreak(keys: string[]) {
  const days = [...new Set(keys)]
    .map((key) => Date.parse(`${key}T00:00:00Z`))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  let longest = 0;
  for (let index = 1; index < days.length; index += 1) {
    longest = Math.max(
      longest,
      Math.max(0, Math.round((days[index] - days[index - 1]) / DAY_MS) - 1),
    );
  }
  return longest;
}

function weekStartFromDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return date.toISOString().slice(0, 10);
}

function mediaKey(event: EventRow) {
  return event.tmdbId !== null && event.mediaType
    ? `${event.mediaType}:${event.tmdbId}`
    : null;
}

function historyTimestamp(value: string) {
  const normalized = value.endsWith("Z")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function filterLabel(key: string, value: string) {
  if (!value || value === "undefined" || value === "null" || key === "page") {
    return null;
  }
  if (key === "genre") return `Genre : ${genreName(Number(value))}`;
  if (key === "mediaType") {
    return value === "tv" ? "Type : Series" : "Type : Films";
  }
  if (key === "language" || key === "originalLanguage") {
    return `Langue : ${value.toUpperCase()}`;
  }
  if (key === "sort") return `Tri : ${value}`;
  if (key === "yearFrom") return `Depuis : ${value}`;
  if (key === "yearTo") return `Jusqu'a : ${value}`;
  if (key === "catalog") return `Catalogue : ${value}`;
  return null;
}

function nearestDuration(minutes: number) {
  return [25, 45, 90, 120, 150].reduce((nearest, candidate) =>
    Math.abs(candidate - minutes) < Math.abs(nearest - minutes)
      ? candidate
      : nearest,
  );
}

function formatMinutes(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} h ${remaining}` : `${hours} h`;
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function isNumber(value: number | null): value is number {
  return value !== null;
}
