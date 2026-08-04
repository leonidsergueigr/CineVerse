"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  Check,
  Clock3,
  Eye,
  Heart,
  History,
  Info,
  Languages,
  ListPlus,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Play,
  SkipForward,
  Star,
  ThumbsDown,
  X,
  ZoomIn,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { buildEmbedUrl, getProviderLanguages } from "@/lib/providers";
import {
  createProviderTrackingAdapter,
  isCineVerseCompanionMessage,
  isCineVerseCompanionReadyMessage,
  parseCineVerseCompanionMessage,
} from "@/lib/provider-tracking";
import { useWatchSessionTracker } from "@/hooks/use-watch-session-tracker";
import {
  rewindResumePosition,
  shouldRecordIntroSeekObservation,
} from "@/lib/playback-intelligence-core";
import { TRACKING_CONFIG } from "@/lib/watch-tracking";
import { SiteHeader } from "@/components/site-header";
import { SeriesHistoryImport } from "@/components/series-history-import";
import type {
  EmbedProvider,
  EpisodeInfo,
  MediaDetails,
  LearnedPlaybackSegment,
  PlaybackPreferences,
  SeasonEpisode,
  SeriesProgressSummary,
  WatchProgress,
} from "@/lib/types";

type Props = {
  detail: MediaDetails;
  providers: EmbedProvider[];
  initialProgress: WatchProgress | null;
  initialLiked: boolean;
  initialDisliked: boolean;
  initialWatchlisted: boolean;
  initialSeason: number | null;
  initialEpisode: number | null;
  initialEpisodeInfo: EpisodeInfo | null;
  initialSeasonEpisodes: SeasonEpisode[];
  initialSeriesProgress: SeriesProgressSummary | null;
  initialPlaybackPreferences: PlaybackPreferences;
  initialLearnedPlaybackSegments: LearnedPlaybackSegment[];
};

export function WatchExperience({
  detail,
  providers,
  initialProgress,
  initialLiked,
  initialDisliked,
  initialWatchlisted,
  initialSeason,
  initialEpisode,
  initialEpisodeInfo,
  initialSeasonEpisodes,
  initialSeriesProgress,
  initialPlaybackPreferences,
  initialLearnedPlaybackSegments,
}: Props) {
  const availableSeasons = useMemo(
    () =>
      (detail.seasons ?? [])
        .filter((item) => item.seasonNumber > 0 && item.episodeCount > 0)
        .sort((a, b) => a.seasonNumber - b.seasonNumber),
    [detail.seasons],
  );
  const firstSeason =
    availableSeasons.find((item) => item.seasonNumber === initialSeason) ??
    availableSeasons[0];
  const initialSeasonNumber = firstSeason?.seasonNumber ?? 1;
  const initialEpisodeNumber = Math.min(
    firstSeason?.episodeCount ?? 1,
    Math.max(1, initialEpisode ?? 1),
  );
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [language, setLanguage] = useState("vf");
  const [season, setSeason] = useState(initialSeasonNumber);
  const [episode, setEpisode] = useState(initialEpisodeNumber);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(initialProgress?.completed ?? false);
  const [liked, setLiked] = useState(initialLiked);
  const [disliked, setDisliked] = useState(initialDisliked);
  const [watchlisted, setWatchlisted] = useState(initialWatchlisted);
  const [playbackPreferences, setPlaybackPreferences] = useState(
    initialPlaybackPreferences,
  );
  const autoNext = playbackPreferences.autoNextEnabled;
  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(
    null,
  );
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [posterExpanded, setPosterExpanded] = useState(false);
  const [historyImportOpen, setHistoryImportOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [learnedPlaybackSegments, setLearnedPlaybackSegments] = useState(
    initialLearnedPlaybackSegments,
  );
  const [stillWatchingPrompt, setStillWatchingPrompt] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<{
    watchedSeconds: number;
    bufferingSeconds: number;
    completedEpisodes: number;
  } | null>(null);
  const [providerSuggestionDismissed, setProviderSuggestionDismissed] =
    useState(false);
  const [trackingAvailable, setTrackingAvailable] = useState(false);
  const [companionAvailable, setCompanionAvailable] = useState(false);
  const [companionTrackingActive, setCompanionTrackingActive] = useState(false);
  const [playerFullscreen, setPlayerFullscreen] = useState(false);
  const [progress, setProgress] = useState({
    currentTime: initialProgress?.progressSeconds ?? 0,
    duration: initialProgress?.durationSeconds ?? 0,
  });
  const [resumeStartSeconds, setResumeStartSeconds] = useState(
    initialProgress?.completed
      ? 0
      : rewindResumePosition(initialProgress?.progressSeconds ?? 0),
  );
  const [episodeInfo, setEpisodeInfo] = useState(initialEpisodeInfo);
  const [seasonEpisodes, setSeasonEpisodes] = useState(initialSeasonEpisodes);
  const [seriesProgress, setSeriesProgress] = useState(initialSeriesProgress);
  const [, startTransition] = useTransition();
  const autoAdvancedRef = useRef("");
  const consecutiveAutoAdvancesRef = useRef(0);
  const stillWatchingKeyRef = useRef("");
  const lastSummaryKeyRef = useRef("");
  const scheduledAutoNextKeyRef = useRef("");
  const playbackSelectionRef = useRef("");
  const activeObserverSessionRef = useRef("");
  const playbackSelectionChangedAtRef = useRef(Date.now());
  const playerFrameRef = useRef<HTMLIFrameElement>(null);
  const playerShellRef = useRef<HTMLElement>(null);
  const fallbackProgressRef = useRef(initialProgress?.progressSeconds ?? 0);
  const latestDurationRef = useRef(initialProgress?.durationSeconds ?? 0);
  const trackingDetectedRef = useRef(false);
  const companionTrackingRef = useRef(false);
  const lastProgressPaintAtRef = useRef(0);
  const autoNextTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTargetRef = useRef(
    initialProgress?.completed
      ? 0
      : rewindResumePosition(initialProgress?.progressSeconds ?? 0),
  );
  const resumeAttemptsRef = useRef(0);
  const resumeAppliedRef = useRef(false);
  const programmaticSeekRef = useRef<{
    targetSeconds: number;
    expiresAt: number;
  } | null>(null);

  const provider = providers.find((item) => item.id === providerId) ?? providers[0];
  const languageOptions = useMemo(() => getProviderLanguages(provider), [provider]);
  const defaultLanguage = languageOptions.find((option) => option.id === "vf")?.id ?? languageOptions[0]?.id ?? "vo";
  const activeLanguage = languageOptions.some((option) => option.id === language)
    ? language
    : defaultLanguage;
  const selectedSeason =
    availableSeasons.find((item) => item.seasonNumber === season) ??
    availableSeasons[0];
  const episodeOptions = Array.from(
    { length: selectedSeason?.episodeCount ?? 1 },
    (_, index) => index + 1,
  );
  const activeRuntime = detail.mediaType === "movie"
    ? detail.runtime
    : episodeInfo?.runtime ?? detail.runtime ?? null;
  const officialDurationSeconds = activeRuntime
    ? Math.max(60, activeRuntime * 60)
    : null;
  const introSegment = learnedPlaybackSegments.find(
    (segment) => segment.segmentType === "intro",
  );
  const creditsSegment = learnedPlaybackSegments.find(
    (segment) => segment.segmentType === "credits",
  );
  const learnedIntro = introSegment?.disabled ? undefined : introSegment;
  const learnedCredits = creditsSegment?.disabled ? undefined : creditsSegment;
  const seriesEpisodeCounts = useMemo(
    () =>
      availableSeasons.map((item) => ({
        seasonNumber: item.seasonNumber,
        episodeCount: item.episodeCount,
      })),
    [availableSeasons],
  );
  const iframeUrl = useMemo(() => {
    if (!provider) return "";
    return buildEmbedUrl(provider, detail, {
      language: activeLanguage,
      seasonNumber: season,
      episodeNumber: episode,
      autoplay: started,
      // CineVerse owns episode transitions. Enabling the provider option as well
      // can make both players advance and skip an episode.
      autoNext: false,
    });
  }, [activeLanguage, detail, episode, provider, season, started]);
  const playbackSelectionKey = `${provider?.id ?? "none"}:${activeLanguage}:${season}:${episode}:${started ? "playing" : "preview"}`;
  if (playbackSelectionRef.current !== playbackSelectionKey) {
    playbackSelectionRef.current = playbackSelectionKey;
    activeObserverSessionRef.current = "";
    programmaticSeekRef.current = null;
    playbackSelectionChangedAtRef.current = Date.now();
  }
  const playerSrc = useMemo(
    () =>
      started
        ? appendResumeFragment(iframeUrl, resumeStartSeconds)
        : iframeUrl,
    [iframeUrl, resumeStartSeconds, started],
  );
  const trustedMessageOrigins = useMemo(
    () => new Set(provider?.messageOrigins ?? []),
    [provider?.messageOrigins],
  );
  const completeCurrentEpisode = useCallback(() => {
    if (detail.mediaType !== "tv") return;
    setSeriesProgress((current) => {
      if (
        !current ||
        current.seasonNumber !== season ||
        current.completedEpisodeNumbers.includes(episode)
      ) {
        return current;
      }

      return {
        ...current,
        completedEpisodes: current.completedEpisodes + 1,
        completedEpisodeNumbers: [
          ...current.completedEpisodeNumbers,
          episode,
        ].sort((left, right) => left - right),
      };
    });
  }, [detail.mediaType, episode, season]);

  const uncompleteCurrentEpisode = useCallback(() => {
    if (detail.mediaType !== "tv") return;
    setSeriesProgress((current) => {
      if (
        !current ||
        current.seasonNumber !== season ||
        !current.completedEpisodeNumbers.includes(episode)
      ) {
        return current;
      }
      return {
        ...current,
        completedEpisodes: Math.max(0, current.completedEpisodes - 1),
        completedEpisodeNumbers: current.completedEpisodeNumbers.filter(
          (item) => item !== episode,
        ),
      };
    });
  }, [detail.mediaType, episode, season]);
  const providerTrackingAdapter = useMemo(
    () => createProviderTrackingAdapter(provider),
    [provider],
  );
  const trackingIdentity = useMemo(
    () => ({
      tmdbId: detail.id,
      mediaType: detail.mediaType,
      seasonNumber: detail.mediaType === "tv" ? season : null,
      episodeNumber: detail.mediaType === "tv" ? episode : null,
      title: detail.title,
      posterPath: detail.posterPath,
      backdropPath: detail.backdropPath,
      providerId: provider?.name ?? provider?.id ?? "",
      audioLanguage: activeLanguage,
      officialRuntimeSeconds: officialDurationSeconds,
      genreIds: detail.genreIds,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      seriesEpisodeCounts:
        detail.mediaType === "tv" ? seriesEpisodeCounts : [],
    }),
    [
      activeLanguage,
      detail,
      episode,
      officialDurationSeconds,
      provider?.id,
      provider?.name,
      season,
      seriesEpisodeCounts,
    ],
  );
  const {
    snapshot: trackingSnapshot,
    reportProviderSignal,
    markWatched,
    unmarkWatched,
  } = useWatchSessionTracker({
    active: started,
    playbackKey: `${providerId}:${activeLanguage}:${season}:${episode}`,
    identity: trackingIdentity,
    onSnapshot: (next) => {
      if (next.progressSeconds > 0) {
        fallbackProgressRef.current = next.progressSeconds;
        latestDurationRef.current = next.durationSeconds;
        setProgress({
          currentTime: next.progressSeconds,
          duration: next.durationSeconds,
        });
      }
      setCompleted(next.completed);
      if (next.completed) completeCurrentEpisode();
    },
  });

  const recordPlaybackObservation = useCallback(
    async (
      observationType: "intro" | "credits",
      fromSeconds: number,
      toSeconds: number,
      durationSeconds: number,
    ) => {
      if (
        detail.mediaType !== "tv" ||
        !trackingSnapshot?.sessionId ||
        durationSeconds <= 0
      ) {
        return;
      }
      const response = await fetch("/api/playback-intelligence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: trackingSnapshot.sessionId,
          tmdbId: detail.id,
          seasonNumber: season,
          episodeNumber: episode,
          observationType,
          fromSeconds,
          toSeconds,
          durationSeconds,
          observedAt: Date.now(),
        }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        segments?: LearnedPlaybackSegment[];
      };
      if (payload.segments) setLearnedPlaybackSegments(payload.segments);
    },
    [detail.id, detail.mediaType, episode, season, trackingSnapshot?.sessionId],
  );

  const updatePlaybackPreference = useCallback(
    (patch: Partial<PlaybackPreferences>) => {
      setPlaybackPreferences((current) => ({ ...current, ...patch }));
      void fetch("/api/playback-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Preferences non enregistrees.");
          const payload = (await response.json()) as {
            preferences?: PlaybackPreferences;
          };
          if (payload.preferences) setPlaybackPreferences(payload.preferences);
        })
        .catch(() => setPlaybackPreferences(initialPlaybackPreferences));
    },
    [initialPlaybackPreferences],
  );

  const updateLearnedSegment = useCallback(
    async (
      segmentType: "intro" | "credits",
      patch: {
        disabled?: boolean;
        startSeconds?: number;
        endSeconds?: number;
        remainingSeconds?: number;
      },
    ) => {
      const response = await fetch("/api/playback-intelligence", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tmdbId: detail.id,
          seasonNumber: season,
          segmentType,
          ...patch,
        }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        segments?: LearnedPlaybackSegment[];
      };
      if (payload.segments) setLearnedPlaybackSegments(payload.segments);
    },
    [detail.id, season],
  );

  useEffect(() => {
    document.title =
      detail.mediaType === "tv"
        ? `${detail.title} - S${season} E${episode} | CineVerse`
        : `${detail.title} | CineVerse`;
  }, [detail.mediaType, detail.title, episode, season]);

  useEffect(() => {
    void fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventType: "VIEW_DETAILS",
        tmdbId: detail.id,
        mediaType: detail.mediaType,
        title: detail.title,
        posterPath: detail.posterPath,
        seasonNumber: detail.mediaType === "tv" ? season : null,
        episodeNumber: detail.mediaType === "tv" ? episode : null,
        genreIds: detail.genreIds,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      }),
    });
  }, [
    detail.genreIds,
    detail.id,
    detail.mediaType,
    detail.posterPath,
    detail.title,
    episode,
    season,
  ]);

  const advanceEpisode = useCallback((force = false, expectedKey?: string) => {
    if ((!force && !autoNext) || detail.mediaType !== "tv") return false;
    const key = playbackSelectionRef.current;
    if (expectedKey && playbackSelectionRef.current !== expectedKey) return false;
    if (autoAdvancedRef.current === key) return false;
    if (force) consecutiveAutoAdvancesRef.current = 0;
    if (autoNextTimerRef.current) {
      clearInterval(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
    scheduledAutoNextKeyRef.current = "";
    setAutoNextCountdown(null);

    const currentSeason = availableSeasons.find(
      (item) => item.seasonNumber === season,
    );
    const nextEpisode = episode + 1;
    if (currentSeason && nextEpisode <= currentSeason.episodeCount) {
      autoAdvancedRef.current = key;
      setEpisode(nextEpisode);
      setProgress({ currentTime: 0, duration: 0 });
      setResumeStartSeconds(0);
      latestDurationRef.current = 0;
      setCompleted(false);
      fallbackProgressRef.current = 0;
      resumeTargetRef.current = 0;
      resumeAttemptsRef.current = 0;
      resumeAppliedRef.current = false;
      trackingDetectedRef.current = false;
      companionTrackingRef.current = false;
      lastProgressPaintAtRef.current = 0;
      setTrackingAvailable(false);
      setCompanionTrackingActive(false);
      setStillWatchingPrompt(false);
      stillWatchingKeyRef.current = "";
      replaceEpisodeUrl(season, nextEpisode);
      return true;
    }

    const nextSeason = availableSeasons.find(
      (item) => item.seasonNumber > season && item.episodeCount > 0,
    );
    if (nextSeason) {
      autoAdvancedRef.current = key;
      setSeason(nextSeason.seasonNumber);
      setEpisode(1);
      setProgress({ currentTime: 0, duration: 0 });
      setResumeStartSeconds(0);
      latestDurationRef.current = 0;
      setCompleted(false);
      fallbackProgressRef.current = 0;
      resumeTargetRef.current = 0;
      resumeAttemptsRef.current = 0;
      resumeAppliedRef.current = false;
      trackingDetectedRef.current = false;
      companionTrackingRef.current = false;
      lastProgressPaintAtRef.current = 0;
      setTrackingAvailable(false);
      setCompanionTrackingActive(false);
      setStillWatchingPrompt(false);
      stillWatchingKeyRef.current = "";
      replaceEpisodeUrl(nextSeason.seasonNumber, 1);
      return true;
    }
    return false;
  }, [autoNext, availableSeasons, detail.mediaType, episode, season]);

  const cancelScheduledAutoNext = useCallback(() => {
    if (autoNextTimerRef.current) {
      clearInterval(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
    scheduledAutoNextKeyRef.current = "";
    setAutoNextCountdown(null);
    setStillWatchingPrompt(false);
    stillWatchingKeyRef.current = "";
  }, []);

  const scheduleAutoAdvance = useCallback(() => {
    if (
      detail.mediaType !== "tv" ||
      !autoNext ||
      autoNextTimerRef.current
    ) {
      return;
    }

    const sourceKey = playbackSelectionRef.current;
    if (!sourceKey || autoAdvancedRef.current === sourceKey) return;
    if (
      playbackPreferences.bingeLimitEpisodes > 0 &&
      consecutiveAutoAdvancesRef.current >=
        playbackPreferences.bingeLimitEpisodes - 1
    ) {
      stillWatchingKeyRef.current = sourceKey;
      setStillWatchingPrompt(true);
      return;
    }
    scheduledAutoNextKeyRef.current = sourceKey;
    let remaining = TRACKING_CONFIG.autoNextCountdownSeconds;
    setAutoNextCountdown(remaining);
    autoNextTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (autoNextTimerRef.current) {
          clearInterval(autoNextTimerRef.current);
          autoNextTimerRef.current = null;
        }
        scheduledAutoNextKeyRef.current = "";
        setAutoNextCountdown(null);
        if (advanceEpisode(false, sourceKey)) {
          consecutiveAutoAdvancesRef.current += 1;
        }
        return;
      }
      setAutoNextCountdown(remaining);
    }, 1000);
  }, [advanceEpisode, autoNext, detail.mediaType, playbackPreferences.bingeLimitEpisodes]);

  const requestPlayerState = useCallback(() => {
    if (companionTrackingRef.current) return;
    const playerWindow = playerFrameRef.current?.contentWindow;
    if (!playerWindow) return;
    playerWindow.postMessage({ action: "getCurrentTime" }, "*");
  }, []);

  const sendCompanionCommand = useCallback(
    (action: "seek" | "play", time?: number) => {
      window.postMessage(
        {
          source: "cineverse-app",
          type: "companion-command",
          payload: { action, time },
        },
        window.location.origin,
      );
    },
    [],
  );

  const seekPlayerToResume = useCallback(() => {
    const target = resumeTargetRef.current;
    const playerWindow = playerFrameRef.current?.contentWindow;
    if (
      !playerWindow ||
      target <= 30 ||
      resumeAppliedRef.current ||
      resumeAttemptsRef.current >= 5
    ) {
      return;
    }

    resumeAttemptsRef.current += 1;
    programmaticSeekRef.current = {
      targetSeconds: target,
      expiresAt: Date.now() + 5_000,
    };
    sendCompanionCommand("seek", target);
    playerWindow.postMessage({ action: "seek", value: target }, "*");
    playerWindow.postMessage({ action: "seek", time: target }, "*");
    playerWindow.postMessage(
      { action: "setCurrentTime", value: target },
      "*",
    );
  }, [sendCompanionCommand]);

  useEffect(() => {
    if (!started) return;
    requestPlayerState();
    const poller = window.setInterval(requestPlayerState, 2000);
    return () => window.clearInterval(poller);
  }, [playerSrc, requestPlayerState, started]);

  useEffect(
    () => () => {
      if (autoNextTimerRef.current) {
        clearInterval(autoNextTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const companionMessage =
        event.source === window &&
        event.origin === window.location.origin &&
        isCineVerseCompanionMessage(event.data);
      if (companionMessage && isCineVerseCompanionReadyMessage(event.data)) {
        setCompanionAvailable(true);
        return;
      }
      const directPlayerMessage =
        event.source === playerFrameRef.current?.contentWindow;
      const trustedNestedPlayerMessage =
        event.origin !== "null" && trustedMessageOrigins.has(event.origin);
      if (
        !companionMessage &&
        !directPlayerMessage &&
        !trustedNestedPlayerMessage
      ) {
        return;
      }
      const data =
        typeof event.data === "string"
          ? parseJson(event.data) ?? event.data
          : event.data;
      if (!companionMessage && providerTrackingAdapter.isReadyMessage(data)) {
        requestPlayerState();
        seekPlayerToResume();
      }
      if (!companionMessage && companionTrackingRef.current) return;
      const playbackEvent = companionMessage
        ? parseCineVerseCompanionMessage(data, officialDurationSeconds)
        : providerTrackingAdapter.parseMessage(data);
      if (!playbackEvent) return;
      if (
        playbackEvent.trackingMethod === "browser-extension" &&
        playbackEvent.observerSessionId
      ) {
        const activeObserverSession = activeObserverSessionRef.current;
        if (!activeObserverSession) {
          // A delayed ended event from the iframe being replaced must not own
          // the freshly selected episode.
          if (playbackEvent.ended) return;
          activeObserverSessionRef.current = playbackEvent.observerSessionId;
        } else if (
          playbackEvent.observerSessionId !== activeObserverSession
        ) {
          if (playbackEvent.ended) return;
          activeObserverSessionRef.current = playbackEvent.observerSessionId;
        }
      }
      if (playbackEvent.trackingMethod === "browser-extension") {
        companionTrackingRef.current = true;
        setCompanionAvailable(true);
        setCompanionTrackingActive(true);
      }
      trackingDetectedRef.current = true;
      setTrackingAvailable(true);

      const remainingSeconds = Math.max(
        0,
        playbackEvent.duration - playbackEvent.currentTime,
      );
      const hasPreciseProviderSignal =
        playbackEvent.trackingMethod === "browser-extension" ||
        playbackEvent.trackingMethod === "provider-message";
      const reachedCredits =
        hasPreciseProviderSignal &&
        Boolean(learnedCredits) &&
        playbackEvent.playbackState === "playing" &&
        !playbackEvent.seeking &&
        playbackEvent.duration > 0 &&
        playbackEvent.currentTime >= (learnedCredits?.startSeconds ?? Infinity) &&
        remainingSeconds <=
          (learnedCredits?.remainingSeconds ?? 0) +
            TRACKING_CONFIG.segmentLearningToleranceSeconds;
      if (
        (playbackEvent.ended || reachedCredits) &&
        Date.now() - playbackSelectionChangedAtRef.current < 3_000
      ) {
        return;
      }
      const trackingSignal = reachedCredits
        ? { ...playbackEvent, creditsReached: true }
        : playbackEvent;
      void reportProviderSignal(trackingSignal).catch(() => undefined);

      const pendingProgrammaticSeek = programmaticSeekRef.current;
      const isProgrammaticSeek = Boolean(
        playbackEvent.eventName === "seeked" &&
          pendingProgrammaticSeek &&
          pendingProgrammaticSeek.expiresAt >= Date.now() &&
          playbackEvent.seekToSeconds !== null &&
          playbackEvent.seekToSeconds !== undefined &&
          Math.abs(
            playbackEvent.seekToSeconds - pendingProgrammaticSeek.targetSeconds,
          ) <= 5,
      );
      if (
        isProgrammaticSeek ||
        (pendingProgrammaticSeek && pendingProgrammaticSeek.expiresAt < Date.now())
      ) {
        programmaticSeekRef.current = null;
      }
      if (
        detail.mediaType === "tv" &&
        playbackEvent.trackingMethod === "browser-extension" &&
        playbackEvent.eventName === "seeked" &&
        !isProgrammaticSeek &&
        playbackEvent.seekFromSeconds !== null &&
        playbackEvent.seekFromSeconds !== undefined &&
        playbackEvent.seekToSeconds !== null &&
        playbackEvent.seekToSeconds !== undefined &&
        shouldRecordIntroSeekObservation({
          fromSeconds: playbackEvent.seekFromSeconds,
          toSeconds: playbackEvent.seekToSeconds,
          durationSeconds: playbackEvent.duration,
        })
      ) {
        void recordPlaybackObservation(
          "intro",
          playbackEvent.seekFromSeconds,
          playbackEvent.seekToSeconds,
          playbackEvent.duration,
        ).catch(() => undefined);
      }

      const currentTime = playbackEvent.currentTime;
      const duration = playbackEvent.duration;
      if (!Number.isFinite(currentTime) || !Number.isFinite(duration)) return;
      fallbackProgressRef.current = currentTime;
      latestDurationRef.current = duration;
      const now = Date.now();
      const shouldPaintProgress =
        playbackEvent.ended ||
        reachedCredits ||
        playbackEvent.playbackState === "paused" ||
        now - lastProgressPaintAtRef.current >= 5_000;
      if (shouldPaintProgress) {
        lastProgressPaintAtRef.current = now;
        setProgress({ currentTime, duration });
      }

      if (
        !playbackEvent.ended &&
        (playbackEvent.playbackState === "paused" ||
          playbackEvent.playbackState === "buffering")
      ) {
        cancelScheduledAutoNext();
        return;
      }

      if (playbackEvent.ended || reachedCredits) {
        const duration = firstPositiveNumber(
          playbackEvent.duration,
          latestDurationRef.current,
          officialDurationSeconds ?? 0,
        );
        const finalPosition = firstPositiveNumber(
          playbackEvent.currentTime,
          duration,
        );
        setCompleted(true);
        setProgress({
          currentTime: finalPosition,
          duration,
        });
        fallbackProgressRef.current = finalPosition;
        latestDurationRef.current = duration;
        completeCurrentEpisode();
        const summaryKey = playbackSelectionRef.current;
        if (
          playbackPreferences.sessionSummaryEnabled &&
          lastSummaryKeyRef.current !== summaryKey
        ) {
          lastSummaryKeyRef.current = summaryKey;
          setSessionSummary({
            watchedSeconds:
              playbackEvent.watchedSeconds ??
              trackingSnapshot?.providerWatchedSeconds ??
              0,
            bufferingSeconds:
              playbackEvent.bufferingSeconds ??
              trackingSnapshot?.bufferingSeconds ??
              0,
            completedEpisodes: detail.mediaType === "tv" ? 1 : 0,
          });
        }
        scheduleAutoAdvance();
        return;
      }

      const resumeTarget = resumeTargetRef.current;
      if (
        resumeTarget > 30 &&
        !resumeAppliedRef.current &&
        currentTime < resumeTarget - 8
      ) {
        seekPlayerToResume();
        return;
      }
      if (
        resumeTarget > 30 &&
        (Math.abs(currentTime - resumeTarget) <= 8 ||
          currentTime >= resumeTarget - 3)
      ) {
        resumeAppliedRef.current = true;
        resumeTargetRef.current = 0;
      }

    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [
    completeCurrentEpisode,
    cancelScheduledAutoNext,
    officialDurationSeconds,
    detail.mediaType,
    learnedCredits,
    playbackPreferences.sessionSummaryEnabled,
    providerTrackingAdapter,
    recordPlaybackObservation,
    reportProviderSignal,
    requestPlayerState,
    scheduleAutoAdvance,
    seekPlayerToResume,
    trustedMessageOrigins,
    trackingSnapshot?.bufferingSeconds,
    trackingSnapshot?.providerWatchedSeconds,
  ]);

  useEffect(() => {
    window.postMessage(
      { source: "cineverse-app", type: "companion-ping" },
      window.location.origin,
    );
  }, []);

  useEffect(() => {
    if (!posterExpanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPosterExpanded(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [posterExpanded]);

  function like() {
    const next = !liked;
    const previous = { liked, disliked };
    setLiked(next);
    if (next) setDisliked(false);
    startTransition(() => {
      void fetch("/api/likes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tmdbId: detail.id,
          mediaType: detail.mediaType,
          title: detail.title,
          posterPath: detail.posterPath,
          backdropPath: detail.backdropPath,
          genreIds: detail.genreIds,
          originalLanguage: detail.originalLanguage,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          liked: next,
        }),
      }).then((response) => {
        if (!response.ok) {
          setLiked(previous.liked);
          setDisliked(previous.disliked);
        }
      });
    });
  }

  function dislike() {
    const next = !disliked;
    const previous = { liked, disliked };
    setDisliked(next);
    if (next) setLiked(false);
    startTransition(() => {
      void fetch("/api/dislikes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tmdbId: detail.id,
          mediaType: detail.mediaType,
          title: detail.title,
          posterPath: detail.posterPath,
          backdropPath: detail.backdropPath,
          genreIds: detail.genreIds,
          originalLanguage: detail.originalLanguage,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          disliked: next,
        }),
      }).then((response) => {
        if (!response.ok) {
          setLiked(previous.liked);
          setDisliked(previous.disliked);
        }
      });
    });
  }

  function toggleWatchlist() {
    const next = !watchlisted;
    setWatchlisted(next);
    startTransition(() => {
      void fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tmdbId: detail.id,
          mediaType: detail.mediaType,
          title: detail.title,
          posterPath: detail.posterPath,
          backdropPath: detail.backdropPath,
          genreIds: detail.genreIds,
          originalLanguage: detail.originalLanguage,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          included: next,
        }),
      }).then((response) => {
        if (!response.ok) setWatchlisted(!next);
      });
    });
  }

  function changeSeason(nextSeason: number) {
    if (nextSeason > season) recordCreditsAtCurrentPosition();
    cancelScheduledAutoNext();
    consecutiveAutoAdvancesRef.current = 0;
    setSeason(nextSeason);
    setEpisode(1);
    setProgress({ currentTime: 0, duration: 0 });
    setResumeStartSeconds(0);
    latestDurationRef.current = 0;
    setCompleted(false);
    fallbackProgressRef.current = 0;
    trackingDetectedRef.current = false;
    companionTrackingRef.current = false;
    lastProgressPaintAtRef.current = 0;
    resumeTargetRef.current = 0;
    resumeAttemptsRef.current = 0;
    resumeAppliedRef.current = false;
    setTrackingAvailable(false);
    setCompanionTrackingActive(false);
    setProviderSuggestionDismissed(false);
    setSessionSummary(null);
    autoAdvancedRef.current = "";
    replaceEpisodeUrl(nextSeason, 1);
  }

  function changeEpisode(nextEpisode: number) {
    if (nextEpisode === episode + 1) recordCreditsAtCurrentPosition();
    cancelScheduledAutoNext();
    consecutiveAutoAdvancesRef.current = 0;
    setEpisode(nextEpisode);
    setProgress({ currentTime: 0, duration: 0 });
    setResumeStartSeconds(0);
    latestDurationRef.current = 0;
    setCompleted(false);
    fallbackProgressRef.current = 0;
    trackingDetectedRef.current = false;
    companionTrackingRef.current = false;
    lastProgressPaintAtRef.current = 0;
    resumeTargetRef.current = 0;
    resumeAttemptsRef.current = 0;
    resumeAppliedRef.current = false;
    setTrackingAvailable(false);
    setCompanionTrackingActive(false);
    setProviderSuggestionDismissed(false);
    setSessionSummary(null);
    autoAdvancedRef.current = "";
    replaceEpisodeUrl(season, nextEpisode);
  }

  function recordCreditsAtCurrentPosition() {
    const duration = firstPositiveNumber(
      progress.duration,
      latestDurationRef.current,
      officialDurationSeconds ?? 0,
    );
    const fromSeconds = firstPositiveNumber(
      progress.currentTime,
      fallbackProgressRef.current,
    );
    const remainingSeconds = Math.max(0, duration - fromSeconds);
    if (
      detail.mediaType !== "tv" ||
      !companionTrackingRef.current ||
      duration <= 0 ||
      remainingSeconds < 10 ||
      remainingSeconds > 5 * 60
    ) {
      return;
    }
    void recordPlaybackObservation(
      "credits",
      fromSeconds,
      duration,
      duration,
    ).catch(() => undefined);
  }

  function startPlayback() {
    resumeTargetRef.current = completed
      ? 0
      : rewindResumePosition(fallbackProgressRef.current);
    setResumeStartSeconds(resumeTargetRef.current);
    resumeAttemptsRef.current = 0;
    resumeAppliedRef.current = false;
    setTrackingAvailable(false);
    setStarted(true);
  }

  async function markAsWatched() {
    const wasCompleted = completed;
    setCompleted(!wasCompleted);
    if (wasCompleted) {
      uncompleteCurrentEpisode();
    } else {
      completeCurrentEpisode();
    }
    try {
      if (wasCompleted) {
        await unmarkWatched();
      } else {
        await markWatched();
      }
    } catch {
      setCompleted(wasCompleted);
      if (wasCompleted) completeCurrentEpisode();
      else uncompleteCurrentEpisode();
    }
  }

  async function submitRecommendationFeedback(action: "seen" | "not-now" | "never") {
    if (action === "seen" && detail.mediaType === "tv") {
      setHistoryImportOpen(true);
      return;
    }
    const response = await fetch("/api/recommendations/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tmdbId: detail.id,
        mediaType: detail.mediaType,
        title: detail.title,
        posterPath: detail.posterPath,
        backdropPath: detail.backdropPath,
        seasonNumber: season,
        episodeNumber: episode,
        seriesEpisodeCounts,
        action,
      }),
    });
    if (!response.ok) {
      setFeedbackMessage("Cette action n'a pas pu etre enregistree.");
      return;
    }
    if (action === "seen") setCompleted(true);
    setFeedbackMessage(
      action === "seen"
        ? "Ajoute a votre historique sans temps invente."
        : action === "not-now"
          ? "Masque des recommandations pendant 7 jours."
          : "Ce titre ne sera plus recommande.",
    );
  }

  useEffect(() => {
    if (detail.mediaType !== "tv") return;
    const controller = new AbortController();

    async function loadEpisodeState() {
      const params = new URLSearchParams({
        tmdbId: String(detail.id),
        mediaType: detail.mediaType,
        season: String(season),
        episode: String(episode),
      });
      const episodeParams = new URLSearchParams({
        tmdbId: String(detail.id),
        season: String(season),
        episode: String(episode),
        totalEpisodes: String(selectedSeason?.episodeCount ?? 0),
      });
      const [progressResponse, episodeResponse] = await Promise.all([
        fetch(`/api/progress?${params.toString()}`, {
          signal: controller.signal,
        }),
        fetch(`/api/media/episode?${episodeParams.toString()}`, {
          signal: controller.signal,
        }),
      ]);
      if (controller.signal.aborted) return;

      const progressPayload = progressResponse.ok
        ? ((await progressResponse.json()) as {
        progress?: WatchProgress | null;
          })
        : { progress: null };
      const episodePayload = episodeResponse.ok
          ? ((await episodeResponse.json()) as {
            episodeInfo?: EpisodeInfo | null;
            episodes?: SeasonEpisode[];
            seriesProgress?: SeriesProgressSummary | null;
          })
        : {};

      const storedProgress = progressPayload.progress;
      fallbackProgressRef.current = storedProgress?.progressSeconds ?? 0;
      latestDurationRef.current = storedProgress?.durationSeconds ?? 0;
      resumeTargetRef.current = storedProgress?.completed
        ? 0
        : rewindResumePosition(storedProgress?.progressSeconds ?? 0);
      resumeAttemptsRef.current = 0;
      resumeAppliedRef.current = false;
      setProgress({
        currentTime: storedProgress?.progressSeconds ?? 0,
        duration: storedProgress?.durationSeconds ?? 0,
      });
      setResumeStartSeconds(
        storedProgress?.completed
          ? 0
          : rewindResumePosition(storedProgress?.progressSeconds ?? 0),
      );
      setCompleted(storedProgress?.completed ?? false);
      setEpisodeInfo(episodePayload.episodeInfo ?? null);
      setSeasonEpisodes(episodePayload.episodes ?? []);
      setSeriesProgress((current) => {
        const incoming = episodePayload.seriesProgress ?? null;
        if (
          current &&
          incoming &&
          current.seasonNumber === incoming.seasonNumber &&
          current.completedEpisodes > incoming.completedEpisodes
        ) {
          return current;
        }
        return incoming;
      });
      if (started && resumeTargetRef.current > 30) {
        requestPlayerState();
        seekPlayerToResume();
      }
    }

    void loadEpisodeState().catch(() => {
      // The selected episode remains playable even if its metadata is unavailable.
    });
    return () => controller.abort();
  }, [
    detail.id,
    detail.mediaType,
    episode,
    requestPlayerState,
    season,
    seekPlayerToResume,
    selectedSeason?.episodeCount,
    started,
  ]);

  useEffect(() => {
    if (detail.mediaType !== "tv") return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      tmdbId: String(detail.id),
      season: String(season),
    });
    void fetch(`/api/playback-intelligence?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as {
          segments?: LearnedPlaybackSegment[];
        };
        if (payload.segments) setLearnedPlaybackSegments(payload.segments);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [detail.id, detail.mediaType, season]);

  useEffect(() => {
    function updateFullscreenState() {
      const fullscreenElement = document.fullscreenElement;
      setPlayerFullscreen(
        Boolean(
          fullscreenElement &&
            playerShellRef.current?.contains(fullscreenElement),
        ),
      );
    }

    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  async function togglePlayerFullscreen() {
    const playerShell = playerShellRef.current;
    if (!playerShell) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await playerShell.requestFullscreen({ navigationUI: "hide" });
      }
    } catch {
      setFeedbackMessage(
        "Le navigateur a refuse le plein ecran. Autorisez-le pour ce site puis reessayez.",
      );
    }
  }

  function skipIntroduction() {
    if (!learnedIntro) return;
    const target = Math.max(0, learnedIntro.endSeconds);
    programmaticSeekRef.current = {
      targetSeconds: target,
      expiresAt: Date.now() + 5_000,
    };
    sendCompanionCommand("seek", target);
    const playerWindow = playerFrameRef.current?.contentWindow;
    playerWindow?.postMessage({ action: "seek", value: target }, "*");
    playerWindow?.postMessage({ action: "seek", time: target }, "*");
    setProgress((current) => ({ ...current, currentTime: target }));
    fallbackProgressRef.current = target;
  }

  function confirmStillWatching() {
    const sourceKey = stillWatchingKeyRef.current;
    consecutiveAutoAdvancesRef.current = 0;
    setStillWatchingPrompt(false);
    stillWatchingKeyRef.current = "";
    if (sourceKey) advanceEpisode(true, sourceKey);
  }

  const seriesPercent =
    seriesProgress?.totalEpisodes
      ? Math.min(
          100,
          (seriesProgress.completedEpisodes / seriesProgress.totalEpisodes) *
            100,
        )
      : 0;
  const preciseTrackingActive =
    companionTrackingActive ||
    trackingSnapshot?.trackingMethod === "browser-extension" ||
    trackingSnapshot?.trackingMethod === "provider-message";
  const showSkipIntro = Boolean(
    started &&
      preciseTrackingActive &&
      playbackPreferences.introSkipEnabled &&
      learnedIntro &&
      progress.currentTime >= Math.max(0, learnedIntro.startSeconds - 5) &&
      progress.currentTime < learnedIntro.endSeconds - 2,
  );
  const suggestedProvider =
    !providerSuggestionDismissed &&
    (trackingSnapshot?.bufferingCount ?? 0) >=
      TRACKING_CONFIG.providerSwitchBufferingThreshold
      ? providers.find((item) => item.id !== providerId)
      : undefined;
  const isAnime =
    detail.mediaType === "tv" &&
    detail.originalLanguage === "ja" &&
    detail.genreIds.includes(16);
  const featuredCrew = detail.crew.filter((person) =>
    detail.mediaType === "movie"
      ? person.job === "Director"
      : person.job === "Creator",
  );
  const releaseYear = detail.releaseDate?.slice(0, 4) ?? null;
  const playbackLabel =
    progress.currentTime > 5 && !completed
      ? `Reprendre a ${formatTime(progress.currentTime)}`
      : detail.mediaType === "tv"
        ? `Lire S${season} E${episode}`
        : "Regarder";
  const confirmedSessionSeconds = trackingSnapshot?.providerWatchedSeconds ?? 0;
  const trackingLabel = companionTrackingActive ||
    trackingSnapshot?.trackingMethod === "browser-extension"
    ? confirmedSessionSeconds > 0
      ? `Lecture confirmee par extension · ${formatCompactDuration(confirmedSessionSeconds)}`
      : "Lecture confirmee par extension"
    : trackingSnapshot
      ? trackingSnapshot.completionSource === "provider"
      ? "Progression detectee"
      : trackingSnapshot.completionSource === "manual"
        ? "Marque comme vu"
        : trackingSnapshot.completionSource === "hybrid"
          ? "Progression estimee et validee"
          : trackingSnapshot.completionSource === "estimated"
            ? "Temps estime"
            : trackingSnapshot.estimatedWatchedSeconds > 0
              ? "Temps estime"
              : "Suivi en attente"
      : started
        ? companionAvailable
          ? "Extension active, detection du lecteur"
          : trackingAvailable
          ? "Progression detectee"
          : "La progression de ce lecteur est estimee"
        : null;
  const overviewCanExpand = detail.overview.length > 180;
  const nextEpisodeSelection = getNextEpisodeSelection(
    availableSeasons,
    season,
    episode,
  );
  const episodeCompletedNumbers = new Set(
    seriesProgress?.seasonNumber === season
      ? seriesProgress.completedEpisodeNumbers
      : [],
  );
  const displayedEpisodes: SeasonEpisode[] =
    seasonEpisodes.length > 0
      ? seasonEpisodes
      : episodeOptions.map((episodeNumber) => ({
          episodeNumber,
          name: `Episode ${episodeNumber}`,
          overview: "",
          runtime: null,
          stillUrl: null,
          airDate: null,
        }));

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050505] pt-16 text-white">
      <SiteHeader fixed />
      {posterExpanded && detail.posterUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Affiche de ${detail.title}`}
          className="fixed inset-0 z-[100] grid place-items-center bg-black/90 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => setPosterExpanded(false)}
            className="absolute inset-0 cursor-default"
            aria-label="Fermer l'affiche"
          />
          <button
            type="button"
            onClick={() => setPosterExpanded(false)}
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded bg-black/70 text-white ring-1 ring-white/20 transition hover:bg-white hover:text-black"
            aria-label="Fermer l'affiche"
            title="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={detail.posterUrl}
            alt={`Affiche agrandie de ${detail.title}`}
            className="relative max-h-[90vh] max-w-[92vw] rounded object-contain shadow-2xl ring-1 ring-white/15"
          />
        </div>
      ) : null}
      {detail.mediaType === "tv" ? (
        <SeriesHistoryImport
          detail={detail}
          currentSeason={season}
          currentEpisode={episode}
          open={historyImportOpen}
          onOpenChange={setHistoryImportOpen}
          onImported={({ seriesProgress: importedProgress, currentEpisodeImported, episodeCount }) => {
            if (importedProgress) setSeriesProgress(importedProgress);
            if (currentEpisodeImported) setCompleted(true);
            setFeedbackMessage(
              `${episodeCount} episode${episodeCount > 1 ? "s" : ""} ajoute${episodeCount > 1 ? "s" : ""} a l'historique.`,
            );
          }}
        />
      ) : null}
      <div className="relative" id="watch-player">
        <div className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black to-transparent">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link
              href="/"
              className="inline-flex h-10 w-10 items-center justify-center rounded bg-black/50 ring-1 ring-white/10 transition hover:bg-white hover:text-black"
              aria-label="Retour"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>
        </div>

        <section
          ref={playerShellRef}
          className="relative h-[46svh] min-h-[320px] max-h-[650px] overflow-hidden bg-black fullscreen:h-screen fullscreen:max-h-none fullscreen:w-screen sm:h-[58vh]"
        >
          {started && playerSrc ? (
            <button
              type="button"
              onClick={togglePlayerFullscreen}
              className="absolute right-4 top-3 z-30 inline-flex h-10 w-10 items-center justify-center rounded bg-black/70 text-white ring-1 ring-white/20 transition hover:bg-white hover:text-black"
              aria-label={playerFullscreen ? "Quitter le plein écran" : "Mettre en plein écran"}
              title={playerFullscreen ? "Quitter le plein écran" : "Plein écran CineVerse"}
            >
              {playerFullscreen ? (
                <Minimize2 className="h-5 w-5" />
              ) : (
                <Maximize2 className="h-5 w-5" />
              )}
            </button>
          ) : null}
          {started && playerSrc ? (
            <iframe
              key={playerSrc}
              ref={playerFrameRef}
              src={playerSrc}
              onLoad={() => {
                requestPlayerState();
                window.setTimeout(seekPlayerToResume, 500);
                window.setTimeout(requestPlayerState, 1000);
              }}
              allow="autoplay *; fullscreen *; picture-in-picture *"
              allowFullScreen
              referrerPolicy="no-referrer"
              sandbox="allow-presentation allow-same-origin allow-scripts"
              className="h-full w-full border-0"
              title={`Lecteur ${detail.title}`}
            />
          ) : !iframeUrl ? (
            <div className="grid h-full place-items-center bg-zinc-950 text-zinc-400">
              Aucune source configuree
            </div>
          ) : (
            <div className="absolute inset-0 grid place-items-center overflow-hidden bg-black">
              {detail.backdropUrl ?? detail.posterUrl ? (
                <img
                  src={detail.backdropUrl ?? detail.posterUrl ?? ""}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-60"
                />
              ) : (
                <div className="poster-fallback absolute inset-0" />
              )}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(229,9,20,.18),transparent_28%),linear-gradient(0deg,#050505_0%,rgba(5,5,5,.2)_52%,rgba(0,0,0,.65)_100%)]" />
              <div className="absolute inset-x-0 bottom-0 mx-auto hidden max-w-7xl px-8 pb-12 sm:block">
                <p className="text-sm font-bold text-zinc-300">
                  {detail.mediaType === "tv"
                    ? `Saison ${season} · Episode ${episode}${activeRuntime ? ` · ${activeRuntime} min` : ""}`
                    : [releaseYear, activeRuntime ? `${activeRuntime} min` : null]
                        .filter(Boolean)
                        .join(" · ")}
                </p>
                <p className="mt-1 max-w-3xl text-2xl font-black sm:text-3xl">
                  {detail.mediaType === "tv"
                    ? episodeInfo?.name ?? detail.title
                    : detail.title}
                </p>
              </div>
              <button
                type="button"
                onClick={startPlayback}
                className="relative z-10 inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-black shadow-2xl transition hover:scale-105 hover:bg-white"
                aria-label={playbackLabel}
                title={playbackLabel}
              >
                <Play className="ml-1 h-7 w-7 fill-black" />
              </button>
            </div>
          )}
          {autoNextCountdown !== null ? (
            <div className="absolute bottom-4 right-4 z-30 flex items-center gap-3 rounded bg-black/90 px-4 py-3 text-sm shadow-2xl ring-1 ring-white/15">
              <span>
                Episode suivant dans{" "}
                <strong className="text-white">{autoNextCountdown}s</strong>
              </span>
              <button
                type="button"
                onClick={cancelScheduledAutoNext}
                className="text-xs font-bold text-zinc-300 transition hover:text-white"
              >
                Annuler
              </button>
            </div>
          ) : null}
          {showSkipIntro ? (
            <button
              type="button"
              onClick={skipIntroduction}
              className="absolute bottom-20 right-4 z-30 inline-flex h-10 items-center gap-2 rounded bg-black/85 px-4 text-sm font-bold text-white shadow-2xl ring-1 ring-white/20 transition hover:bg-white hover:text-black"
            >
              Passer l&apos;introduction
              <SkipForward className="h-4 w-4" />
            </button>
          ) : null}
          {stillWatchingPrompt ? (
            <div className="absolute inset-0 z-40 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-md bg-[#171717] p-6 text-center shadow-2xl ring-1 ring-white/15">
                <h2 className="text-xl font-black">Toujours en train de regarder ?</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  La lecture automatique est en pause.
                </p>
                <div className="mt-5 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={confirmStillWatching}
                    className="inline-flex h-10 items-center gap-2 rounded bg-white px-4 text-sm font-black text-black"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Continuer
                  </button>
                  <button
                    type="button"
                    onClick={cancelScheduledAutoNext}
                    className="h-10 rounded bg-white/10 px-4 text-sm font-bold text-white"
                  >
                    Arreter
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <section
        aria-label="Reglages de lecture"
        className="relative z-30 mx-auto -mt-5 max-w-7xl px-4 sm:px-6 lg:px-8"
      >
        <div className="grid gap-3 rounded-md bg-[#171717] p-3 shadow-2xl ring-1 ring-white/10 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end">
          <button
            type="button"
            onClick={startPlayback}
            disabled={!iframeUrl}
            className="inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded bg-[#e50914] px-5 text-sm font-black text-white transition hover:bg-[#f6121d] disabled:cursor-not-allowed disabled:bg-zinc-700"
          >
            <Play className="h-4 w-4 fill-current" />
            {started ? "Lecture en cours" : playbackLabel}
          </button>

          <div
            className={`grid min-w-0 gap-3 ${
              detail.mediaType === "tv"
                ? "sm:grid-cols-2 lg:grid-cols-[1.1fr_1fr_0.8fr_0.9fr_auto]"
                : "sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr]"
            }`}
          >
            <label className="min-w-0">
              <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase text-zinc-500">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    provider && isRecentlyChecked(provider)
                      ? "bg-emerald-400"
                      : "bg-zinc-600"
                  }`}
                />
                Source
                {provider ? (
                  <span className="truncate font-normal normal-case text-zinc-600">
                    {providerStatusLabel(provider)}
                  </span>
                ) : null}
              </span>
              <select
                value={providerId}
                onChange={(event) => {
                  cancelScheduledAutoNext();
                  trackingDetectedRef.current = false;
                  companionTrackingRef.current = false;
                  lastProgressPaintAtRef.current = 0;
                  setTrackingAvailable(false);
                  setCompanionTrackingActive(false);
                  resumeTargetRef.current = rewindResumePosition(
                    fallbackProgressRef.current,
                  );
                  resumeAttemptsRef.current = 0;
                  resumeAppliedRef.current = false;
                  setResumeStartSeconds(resumeTargetRef.current);
                  setProviderId(event.target.value);
                }}
                className="control-field h-10 w-full"
                aria-label="Source de lecture"
                disabled={!providers.length}
              >
                {providers.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    title={providerStatusTitle(item)}
                  >
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0">
              <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase text-zinc-500">
                <Languages className="h-3 w-3" />
                Langue
              </span>
              <select
                value={activeLanguage}
                onChange={(event) => {
                  cancelScheduledAutoNext();
                  trackingDetectedRef.current = false;
                  companionTrackingRef.current = false;
                  lastProgressPaintAtRef.current = 0;
                  setTrackingAvailable(false);
                  setCompanionTrackingActive(false);
                  resumeTargetRef.current = rewindResumePosition(
                    fallbackProgressRef.current,
                  );
                  resumeAttemptsRef.current = 0;
                  resumeAppliedRef.current = false;
                  setResumeStartSeconds(resumeTargetRef.current);
                  setLanguage(event.target.value);
                }}
                className="control-field h-10 w-full"
                aria-label="Langue de lecture"
              >
                {languageOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {detail.mediaType === "tv" ? (
              <>
                <label>
                  <span className="mb-1 block text-[10px] font-bold uppercase text-zinc-500">
                    Saison
                  </span>
                  <select
                    value={season}
                    onChange={(event) =>
                      changeSeason(Number(event.target.value))
                    }
                    className="control-field h-10 w-full"
                    aria-label="Saison"
                  >
                    {availableSeasons.map((item) => (
                      <option key={item.id} value={item.seasonNumber}>
                        Saison {item.seasonNumber}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-[10px] font-bold uppercase text-zinc-500">
                    Episode
                  </span>
                  <select
                    value={episode}
                    onChange={(event) =>
                      changeEpisode(Number(event.target.value))
                    }
                    className="control-field h-10 w-full"
                    aria-label="Episode"
                  >
                    {episodeOptions.map((episodeNumber) => (
                      <option key={episodeNumber} value={episodeNumber}>
                        Episode {episodeNumber}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (autoNext) cancelScheduledAutoNext();
                    updatePlaybackPreference({ autoNextEnabled: !autoNext });
                  }}
                  aria-pressed={autoNext}
                  className={`mt-4 inline-flex h-10 items-center justify-center gap-2 rounded px-3 text-xs font-bold ring-1 transition ${
                    autoNext
                      ? "bg-white/10 text-white ring-white/20"
                      : "bg-transparent text-zinc-500 ring-white/10 hover:text-white"
                  }`}
                >
                  <SkipForward className="h-4 w-4" />
                  Auto-next {autoNext ? "active" : "inactif"}
                </button>
              </>
            ) : null}
          </div>
          {detail.mediaType === "tv" ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-3 text-xs text-zinc-400 lg:col-span-2">
              <label className="inline-flex items-center gap-2">
                <span>Pause auto apres</span>
                <select
                  value={playbackPreferences.bingeLimitEpisodes}
                  onChange={(event) =>
                    updatePlaybackPreference({
                      bingeLimitEpisodes: Number(event.target.value),
                    })
                  }
                  className="control-field h-8 min-w-24"
                  aria-label="Limite d'episodes consecutifs"
                >
                  <option value={0}>Jamais</option>
                  <option value={3}>3 episodes</option>
                  <option value={4}>4 episodes</option>
                  <option value={5}>5 episodes</option>
                  <option value={6}>6 episodes</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={playbackPreferences.introSkipEnabled}
                  onChange={(event) =>
                    updatePlaybackPreference({
                      introSkipEnabled: event.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-[#e50914]"
                />
                Intro intelligente
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={playbackPreferences.sessionSummaryEnabled}
                  onChange={(event) =>
                    updatePlaybackPreference({
                      sessionSummaryEnabled: event.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-[#e50914]"
                />
                Resume de session
              </label>
              {introSegment ? (
                <div className="inline-flex items-center gap-2 rounded bg-white/5 px-2 py-1">
                  <button
                    type="button"
                    onClick={() =>
                      void updateLearnedSegment("intro", {
                        disabled: !introSegment.disabled,
                      })
                    }
                    className={introSegment.disabled ? "text-zinc-500" : "text-white"}
                    aria-pressed={!introSegment.disabled}
                  >
                    Intro {introSegment.disabled ? "desactivee" : "active"}
                  </button>
                  <label className="inline-flex items-center gap-1 text-zinc-500">
                    debut
                    <input
                      type="number"
                      min={0}
                      max={TRACKING_CONFIG.introMaximumStartSeconds}
                      defaultValue={Math.round(introSegment.startSeconds)}
                      onBlur={(event) =>
                        void updateLearnedSegment("intro", {
                          startSeconds: Number(event.target.value),
                        })
                      }
                      className="h-7 w-16 rounded bg-black/30 px-2 text-white ring-1 ring-white/10"
                      aria-label="Debut de l'introduction en secondes"
                    />
                    s
                  </label>
                  <label className="inline-flex items-center gap-1 text-zinc-500">
                    fin
                    <input
                      type="number"
                      min={TRACKING_CONFIG.introMinimumSkipSeconds}
                      max={TRACKING_CONFIG.introMaximumSearchSeconds}
                      defaultValue={Math.round(introSegment.endSeconds)}
                      onBlur={(event) =>
                        void updateLearnedSegment("intro", {
                          endSeconds: Number(event.target.value),
                        })
                      }
                      className="h-7 w-16 rounded bg-black/30 px-2 text-white ring-1 ring-white/10"
                      aria-label="Fin de l'introduction en secondes"
                    />
                    s
                  </label>
                </div>
              ) : null}
              {creditsSegment ? (
                <div className="inline-flex items-center gap-2 rounded bg-white/5 px-2 py-1">
                  <button
                    type="button"
                    onClick={() =>
                      void updateLearnedSegment("credits", {
                        disabled: !creditsSegment.disabled,
                      })
                    }
                    className={creditsSegment.disabled ? "text-zinc-500" : "text-white"}
                    aria-pressed={!creditsSegment.disabled}
                  >
                    Generique {creditsSegment.disabled ? "desactive" : "actif"}
                  </button>
                  <label className="inline-flex items-center gap-1 text-zinc-500">
                    debut
                    <input
                      type="number"
                      min={60}
                      max={Math.max(60, Math.round(creditsSegment.endSeconds))}
                      defaultValue={Math.round(creditsSegment.startSeconds)}
                      onBlur={(event) =>
                        void updateLearnedSegment("credits", {
                          startSeconds: Number(event.target.value),
                          remainingSeconds: Math.max(
                            0,
                            creditsSegment.endSeconds - Number(event.target.value),
                          ),
                        })
                      }
                      className="h-7 w-16 rounded bg-black/30 px-2 text-white ring-1 ring-white/10"
                      aria-label="Debut du generique en secondes"
                    />
                    s
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {sessionSummary ? (
        <aside className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-md bg-[#171717] p-4 shadow-2xl ring-1 ring-white/15">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-black text-white">Session terminee</p>
              <p className="mt-1 text-sm text-zinc-400">
                {formatCompactDuration(sessionSummary.watchedSeconds)} regardees
                {sessionSummary.completedEpisodes
                  ? ` · ${sessionSummary.completedEpisodes} episode termine`
                  : ""}
              </p>
              {sessionSummary.bufferingSeconds > 0 ? (
                <p className="mt-1 text-xs text-zinc-500">
                  {formatCompactDuration(sessionSummary.bufferingSeconds)} de chargement
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setSessionSummary(null)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-zinc-400 ring-1 ring-white/10 hover:text-white"
              aria-label="Fermer le resume"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </aside>
      ) : null}

      <section className="mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6 lg:px-8">
        <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
          <article className="min-w-0">
            <div className="grid min-w-0 grid-cols-[110px_minmax(0,1fr)] gap-5 sm:grid-cols-[150px_minmax(0,1fr)] lg:grid-cols-[180px_minmax(0,1fr)]">
              <div>
                {detail.posterUrl ? (
                  <button
                    type="button"
                    onClick={() => setPosterExpanded(true)}
                    className="group relative block w-full overflow-hidden rounded text-left shadow-2xl ring-1 ring-white/10 transition hover:ring-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    aria-label={`Agrandir l'affiche de ${detail.title}`}
                    title="Agrandir l'affiche"
                  >
                    <img
                      src={detail.posterUrl}
                      alt={detail.title}
                      className="aspect-[2/3] w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                    />
                    <span className="absolute bottom-2 right-2 inline-flex h-9 w-9 items-center justify-center rounded bg-black/75 text-white opacity-0 ring-1 ring-white/20 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                      <ZoomIn className="h-4 w-4" />
                    </span>
                  </button>
                ) : (
                  <div className="poster-fallback aspect-[2/3] rounded ring-1 ring-white/10" />
                )}
              </div>

              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-400">
                  <span className="font-bold uppercase text-zinc-200">
                    {detail.mediaType === "movie" ? "Film" : "Serie"}
                  </span>
                  {detail.voteCount > 0 && detail.voteAverage > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-4 w-4 fill-[#f5c542] text-[#f5c542]" />
                      {detail.voteAverage.toFixed(1)}
                    </span>
                  ) : null}
                  {releaseYear ? <span>{releaseYear}</span> : null}
                  {detail.mediaType === "tv" ? (
                    <span>
                      S{season} E{episode}
                    </span>
                  ) : null}
                  {activeRuntime ? <span>{activeRuntime} min</span> : null}
                </div>
                <h1 className="text-3xl font-black tracking-normal sm:text-4xl lg:text-5xl">
                  {detail.title}
                </h1>

                <div className="mt-4 flex flex-wrap gap-2">
                  {detail.genres.map((genre) => (
                    <Link
                      key={genre.id}
                      href={`/browse?type=${detail.mediaType}${isAnime ? "&catalog=anime" : ""}&genre=${genre.id}`}
                      className="rounded bg-white/[0.07] px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/15 hover:text-white"
                    >
                      {genre.name}
                    </Link>
                  ))}
                </div>

                <div className="mt-5 max-w-3xl">
                  <div className="relative">
                    <p
                      id="media-overview"
                      className={`text-sm leading-6 text-zinc-300 transition-[max-height] duration-200 sm:text-base sm:leading-7 ${
                        overviewExpanded || !overviewCanExpand
                          ? "max-h-none"
                          : "max-h-28 overflow-hidden"
                      }`}
                    >
                      {detail.overview || "Aucun synopsis disponible."}
                    </p>
                    {!overviewExpanded && overviewCanExpand ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#050505] to-transparent"
                      />
                    ) : null}
                  </div>
                  {overviewCanExpand ? (
                    <button
                      type="button"
                      onClick={() =>
                        setOverviewExpanded((current) => !current)
                      }
                      aria-expanded={overviewExpanded}
                      aria-controls="media-overview"
                      className="mt-2 inline-flex h-8 items-center text-xs font-bold text-zinc-400 transition hover:text-white"
                    >
                      {overviewExpanded ? "Voir moins" : "Voir plus"}
                    </button>
                  ) : null}
                </div>

                {featuredCrew.length ? (
                  <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-bold text-zinc-500">
                      {detail.mediaType === "movie"
                        ? featuredCrew.length > 1
                          ? "Realisateurs"
                          : "Realisateur"
                        : "Creation"}
                    </span>
                    {featuredCrew.map((person) => (
                      <Link
                        key={`${person.id}-${person.job}`}
                        href={personBrowseHref(
                          detail,
                          person.id,
                          person.name,
                          person.job,
                          isAnime,
                        )}
                        className="font-semibold text-zinc-200 transition hover:text-[#e50914]"
                      >
                        {person.name}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </article>

          <aside className="min-w-0 border-t border-white/10 pt-6 xl:border-l xl:border-t-0 xl:pl-7 xl:pt-0">
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-xs font-bold uppercase text-zinc-500">
                  Progression
                </h2>
                {!trackingAvailable ? (
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-500 ring-1 ring-white/10"
                    title="La progression de ce lecteur est estimee."
                    aria-label="Progression estimee pour cette source"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </div>
              {detail.mediaType === "tv" && seriesProgress ? (
                <>
                  <div className="flex items-center justify-between gap-3 text-sm text-zinc-300">
                    <span>Saison {seriesProgress.seasonNumber}</span>
                    <span>
                      {seriesProgress.completedEpisodes}/
                      {seriesProgress.totalEpisodes} vus
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <span
                      className="progress-fill block h-full rounded-full bg-[#e50914]"
                      style={{ width: `${seriesPercent}%` }}
                    />
                  </div>
                  <p className="mt-2 truncate text-xs text-zinc-500">
                    {episodeInfo?.name ?? `Episode ${episode}`}
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-300">
                  {completed
                    ? "Film termine"
                    : trackingAvailable && progress.duration > 0
                      ? `${formatTime(progress.currentTime)} / ${formatTime(progress.duration)}`
                      : "Lecture non terminee"}
                </p>
              )}
              {trackingLabel ? (
                <p className="mt-2 text-xs text-zinc-500">{trackingLabel}</p>
              ) : null}
              {suggestedProvider ? (
                <div className="mt-4 rounded bg-amber-400/10 p-3 text-xs text-amber-100 ring-1 ring-amber-300/20">
                  <p>
                    Lecture instable. {suggestedProvider.name} est disponible.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setProviderSuggestionDismissed(true);
                        resumeTargetRef.current = rewindResumePosition(
                          fallbackProgressRef.current,
                        );
                        setResumeStartSeconds(resumeTargetRef.current);
                        setProviderId(suggestedProvider.id);
                      }}
                      className="font-bold text-white underline underline-offset-4"
                    >
                      Essayer cette source
                    </button>
                    <button
                      type="button"
                      onClick={() => setProviderSuggestionDismissed(true)}
                      className="text-zinc-400"
                    >
                      Ignorer
                    </button>
                  </div>
                </div>
              ) : null}

              {detail.mediaType === "tv" && nextEpisodeSelection ? (
                <button
                  type="button"
                  onClick={() => {
                    recordCreditsAtCurrentPosition();
                    advanceEpisode(true);
                    document
                      .getElementById("watch-player")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded bg-white/10 px-3 text-sm font-bold text-white transition hover:bg-white/15"
                >
                  <SkipForward className="h-4 w-4" />
                  Episode suivant
                </button>
              ) : null}
            </section>

            <section className="mt-6 border-t border-white/10 pt-6">
              <button
                type="button"
                onClick={toggleWatchlist}
                aria-pressed={watchlisted}
                className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded px-3 text-sm font-bold ring-1 transition ${
                  watchlisted
                    ? "bg-white/15 text-white ring-white/20"
                    : "bg-transparent text-zinc-300 ring-white/10 hover:bg-white/[0.06]"
                }`}
              >
                {watchlisted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <ListPlus className="h-4 w-4" />
                )}
                {watchlisted ? "Dans ma liste" : "Ajouter a ma liste"}
              </button>

              <div className="mt-5">
                <h2 className="mb-3 text-xs font-bold uppercase text-zinc-500">
                  Votre avis
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={like}
                    aria-pressed={liked}
                    className={`inline-flex h-10 items-center justify-center gap-2 rounded px-2 text-xs font-bold ring-1 transition ${
                      liked
                        ? "bg-[#e50914]/20 text-red-100 ring-[#e50914]/50"
                        : "bg-transparent text-zinc-300 ring-white/10 hover:bg-white/[0.06]"
                    }`}
                  >
                    <Heart
                      className={`h-4 w-4 ${liked ? "fill-current" : ""}`}
                    />
                    J&apos;aime
                  </button>
                  <details className="group relative">
                    <summary className="flex h-10 cursor-pointer list-none items-center justify-center gap-2 rounded px-2 text-xs font-bold text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/[0.06] [&::-webkit-details-marker]:hidden">
                      <MoreHorizontal className="h-4 w-4" />
                      Plus de choix
                    </summary>
                    <div className="absolute bottom-12 right-0 z-40 w-60 overflow-hidden rounded border border-white/15 bg-[#181818] p-1.5 shadow-2xl">
                      <FeedbackAction
                        icon={<Eye className="h-4 w-4" />}
                        label="Deja vu"
                        onClick={() => void submitRecommendationFeedback("seen")}
                      />
                      <FeedbackAction
                        icon={<ThumbsDown className="h-4 w-4" />}
                        label={disliked ? "Retirer Pas pour moi" : "Pas pour moi"}
                        onClick={dislike}
                      />
                      <FeedbackAction
                        icon={<Clock3 className="h-4 w-4" />}
                        label="Pas maintenant"
                        onClick={() => void submitRecommendationFeedback("not-now")}
                      />
                      <FeedbackAction
                        icon={<Ban className="h-4 w-4" />}
                        label="Ne plus recommander"
                        onClick={() => void submitRecommendationFeedback("never")}
                      />
                    </div>
                  </details>
                </div>
                {feedbackMessage ? (
                  <p className="mt-3 text-xs leading-5 text-zinc-400">
                    {feedbackMessage}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={markAsWatched}
                aria-pressed={completed}
                className={`mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded px-3 text-xs font-bold ring-1 transition ${
                  completed
                    ? "bg-white/15 text-white ring-white/20"
                    : "bg-transparent text-zinc-400 ring-white/10 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <Check className="h-4 w-4" />
                {completed ? "Marquer comme non vu" : "Marquer vu"}
              </button>
              {detail.mediaType === "tv" ? (
                <button
                  type="button"
                  onClick={() => setHistoryImportOpen(true)}
                  className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded px-3 text-xs font-bold text-zinc-400 ring-1 ring-white/10 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <History className="h-4 w-4" />
                  J&apos;ai deja regarde...
                </button>
              ) : null}
            </section>
          </aside>
        </div>

        {detail.mediaType === "tv" ? (
          <section className="mt-10 border-t border-white/10 pt-8">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-zinc-500">
                  Episodes
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  Saison {season}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {seriesProgress ? (
                  <span className="text-sm text-zinc-500">
                    {seriesProgress.completedEpisodes}/
                    {seriesProgress.totalEpisodes} vus
                  </span>
                ) : null}
                <select
                  value={season}
                  onChange={(event) =>
                    changeSeason(Number(event.target.value))
                  }
                  className="control-field h-10 min-w-32"
                  aria-label="Saison de la liste des episodes"
                >
                  {availableSeasons.map((item) => (
                    <option key={item.id} value={item.seasonNumber}>
                      Saison {item.seasonNumber}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {displayedEpisodes.map((item) => {
                const isCurrent = item.episodeNumber === episode;
                const isCompleted = episodeCompletedNumbers.has(
                  item.episodeNumber,
                );
                return (
                  <button
                    key={item.episodeNumber}
                    type="button"
                    onClick={() => {
                      changeEpisode(item.episodeNumber);
                      document
                        .getElementById("watch-player")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                    aria-current={isCurrent ? "true" : undefined}
                    className={`group grid min-h-24 grid-cols-[112px_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded border p-2 text-left transition sm:grid-cols-[144px_minmax(0,1fr)_auto] ${
                      isCurrent
                        ? "border-[#e50914]/70 bg-[#e50914]/10"
                        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
                    }`}
                  >
                    <div className="relative aspect-video overflow-hidden rounded-sm bg-zinc-900">
                      <div className="poster-fallback absolute inset-0" />
                      {item.stillUrl ? (
                        <img
                          src={item.stillUrl}
                          alt=""
                          loading="lazy"
                          className="relative h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : null}
                    </div>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-bold uppercase text-zinc-500">
                        Episode {item.episodeNumber}
                      </span>
                      <span className="mt-1 block truncate text-sm font-bold text-zinc-100">
                        {item.name}
                      </span>
                      {item.overview ? (
                        <span className="mt-1 hidden line-clamp-2 text-xs leading-5 text-zinc-500 sm:block">
                          {item.overview}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex min-w-8 flex-col items-end gap-2 text-xs text-zinc-500">
                      {item.runtime ? <span>{item.runtime} min</span> : null}
                      {isCompleted ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {detail.cast.length ? (
          <section className="mt-10 border-t border-white/10 pt-8">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-zinc-500">
                  Distribution
                </p>
                <h2 className="mt-1 text-2xl font-black">Casting</h2>
              </div>
              <span className="text-xs text-zinc-600">Defiler pour voir la suite</span>
            </div>
            <div className="relative">
              <div className="scrollbar-none flex touch-pan-x gap-4 overflow-x-auto overscroll-x-contain pb-3 pr-16">
                {detail.cast.map((person, index) => (
                  <Link
                    key={`${person.id}-${index}`}
                    href={personBrowseHref(
                      detail,
                      person.id,
                      person.name,
                      undefined,
                      isAnime,
                    )}
                    className="group w-28 shrink-0 sm:w-32"
                  >
                    <div className="relative aspect-[3/4] overflow-hidden rounded bg-zinc-900 ring-1 ring-white/10">
                      <div className="absolute inset-0 grid place-items-center px-2 text-center text-xs text-zinc-500">
                        {person.name}
                      </div>
                      {person.profileUrl ? (
                        <img
                          src={person.profileUrl}
                          alt={person.name}
                          className="relative h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : null}
                    </div>
                    <p className="mt-2 truncate text-sm font-bold text-zinc-100">
                      {person.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {person.character || "Role non renseigne"}
                    </p>
                  </Link>
                ))}
              </div>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#050505] to-transparent"
              />
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function FeedbackAction({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        onClick();
        event.currentTarget.closest("details")?.removeAttribute("open");
      }}
      className="flex min-h-10 w-full items-center gap-3 rounded px-3 text-left text-xs font-semibold text-zinc-300 hover:bg-white/10 hover:text-white"
    >
      {icon}
      {label}
    </button>
  );
}

function getNextEpisodeSelection(
  seasons: NonNullable<MediaDetails["seasons"]>,
  currentSeasonNumber: number,
  currentEpisodeNumber: number,
) {
  const currentSeason = seasons.find(
    (item) => item.seasonNumber === currentSeasonNumber,
  );
  if (
    currentSeason &&
    currentEpisodeNumber + 1 <= currentSeason.episodeCount
  ) {
    return {
      seasonNumber: currentSeasonNumber,
      episodeNumber: currentEpisodeNumber + 1,
    };
  }

  const nextSeason = seasons.find(
    (item) =>
      item.seasonNumber > currentSeasonNumber && item.episodeCount > 0,
  );
  return nextSeason
    ? { seasonNumber: nextSeason.seasonNumber, episodeNumber: 1 }
    : null;
}

function isRecentlyChecked(provider: EmbedProvider) {
  const checkedAt = provider.reliability?.lastCheckedAt;
  if (!checkedAt || (provider.reliability?.score ?? 0) < 50) return false;
  const age = Date.now() - Date.parse(checkedAt);
  return Number.isFinite(age) && age >= 0 && age <= 72 * 60 * 60 * 1000;
}

function providerStatusLabel(provider: EmbedProvider) {
  const details: string[] = [];
  if (provider.performance && provider.performance.sampleCount >= 2) {
    details.push(`${provider.performance.score}/100`);
  }
  if (provider.quality) details.push(`${provider.quality}p`);
  const languages = provider.languages
    ?.slice(0, 2)
    .map((language) => language.label)
    .join("/");
  if (languages) details.push(languages);
  if (details.length) return details.join(" · ");
  return isRecentlyChecked(provider) ? "Source testee" : "Non verifiee";
}

function providerStatusTitle(provider: EmbedProvider) {
  const checkedAt = provider.reliability?.lastCheckedAt;
  const status = checkedAt
    ? `Dernier controle : ${checkedAt.slice(0, 10)}`
    : "Aucun controle recent enregistre";
  const measured = provider.performance
    ? ` · ${provider.performance.bufferingCount} chargements · ${provider.performance.errorCount} erreurs`
    : "";
  return `${provider.name} · ${providerStatusLabel(provider)} · ${status}${measured}`;
}

function appendResumeFragment(url: string, seconds: number) {
  if (!url || seconds <= 30) return url;
  const fragment = `t=${Math.round(seconds)}&cineverseResume=1`;
  return url.includes("#") ? `${url}&${fragment}` : `${url}#${fragment}`;
}

function firstPositiveNumber(...values: number[]) {
  return values.find(
    (value) => Number.isFinite(value) && value > 0,
  ) ?? 0;
}

function replaceEpisodeUrl(season: number, episode: number) {
  const url = new URL(window.location.href);
  url.searchParams.set("season", String(season));
  url.searchParams.set("episode", String(episode));
  window.history.replaceState(null, "", url);
}

function personBrowseHref(
  detail: MediaDetails,
  personId: number,
  personName: string,
  job: string | undefined,
  isAnime: boolean,
) {
  const params = new URLSearchParams({
    type: detail.mediaType,
    person: String(personId),
    personName,
    personRole: job ? "crew" : "cast",
  });
  if (job) params.set("personJob", job);
  if (isAnime) params.set("catalog", "anime");
  return `/browse?${params.toString()}`;
}

function formatTime(seconds: number) {
  if (!seconds) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function formatCompactDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours} h ${minutes} min lues`;
  if (minutes > 0) return `${minutes} min lues`;
  return `${total} s lues`;
}
