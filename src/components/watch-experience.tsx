"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Heart,
  Languages,
  Play,
  Star,
  ThumbsDown,
  ToggleRight,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { buildEmbedUrl, getProviderLanguages } from "@/lib/providers";
import { SiteHeader } from "@/components/site-header";
import type { EmbedProvider, MediaDetails, WatchProgress } from "@/lib/types";

type Props = {
  detail: MediaDetails;
  providers: EmbedProvider[];
  initialProgress: WatchProgress | null;
  initialLiked: boolean;
  initialDisliked: boolean;
  initialSeason: number | null;
  initialEpisode: number | null;
};

export function WatchExperience({
  detail,
  providers,
  initialProgress,
  initialLiked,
  initialDisliked,
  initialSeason,
  initialEpisode,
}: Props) {
  const availableSeasons = useMemo(
    () =>
      (detail.seasons ?? [])
        .filter((item) => item.episodeCount > 0)
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
  const [autoNext, setAutoNext] = useState(true);
  const [playerLoadToken, setPlayerLoadToken] = useState(0);
  const [progress, setProgress] = useState({
    currentTime: initialProgress?.progressSeconds ?? 0,
    duration: initialProgress?.durationSeconds ?? 0,
  });
  const [, startTransition] = useTransition();
  const lastSaveRef = useRef(0);
  const autoAdvancedRef = useRef("");
  const playerFrameRef = useRef<HTMLIFrameElement>(null);
  const fallbackProgressRef = useRef(initialProgress?.progressSeconds ?? 0);
  const trackingDetectedRef = useRef(false);

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
      autoNext,
    });
  }, [activeLanguage, autoNext, detail, episode, provider, season, started]);

  const savePlaybackProgress = useCallback(
    (
      currentTime: number,
      duration: number,
      playbackCompleted = false,
    ) => {
      void fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tmdbId: detail.id,
          mediaType: detail.mediaType,
          seasonNumber: detail.mediaType === "tv" ? season : null,
          episodeNumber: detail.mediaType === "tv" ? episode : null,
          title: detail.title,
          posterPath: detail.posterPath,
          backdropPath: detail.backdropPath,
          progressSeconds: Math.max(0, currentTime),
          durationSeconds: Math.max(0, duration),
          completed: playbackCompleted,
          seriesEpisodeCounts:
            detail.mediaType === "tv" ? seriesEpisodeCounts : [],
        }),
      });
    },
    [detail, episode, season, seriesEpisodeCounts],
  );

  const advanceEpisode = useCallback(() => {
    if (!autoNext || detail.mediaType !== "tv") return false;
    const key = `${season}-${episode}`;
    if (autoAdvancedRef.current === key) return false;

    const currentSeason = availableSeasons.find(
      (item) => item.seasonNumber === season,
    );
    const nextEpisode = episode + 1;
    if (currentSeason && nextEpisode <= currentSeason.episodeCount) {
      autoAdvancedRef.current = key;
      setEpisode(nextEpisode);
      setProgress({ currentTime: 0, duration: 0 });
      setCompleted(false);
      fallbackProgressRef.current = 0;
      trackingDetectedRef.current = false;
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
      setCompleted(false);
      fallbackProgressRef.current = 0;
      trackingDetectedRef.current = false;
      replaceEpisodeUrl(nextSeason.seasonNumber, 1);
      return true;
    }
    return false;
  }, [autoNext, availableSeasons, detail.mediaType, episode, season]);

  const maybeAutoAdvance = useCallback(
    (currentTime: number, duration: number) => {
      if (duration <= 0 || currentTime / duration < 0.98) return;
      advanceEpisode();
    },
    [advanceEpisode],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== playerFrameRef.current?.contentWindow) return;
      const data =
        typeof event.data === "string"
          ? parseJson(event.data) ?? event.data
          : event.data;
      const playbackEvent = normalizePlaybackEvent(data);
      if (!playbackEvent) return;
      trackingDetectedRef.current = true;

      if (playbackEvent.ended) {
        const duration = Math.max(
          playbackEvent.duration,
          progress.duration,
          playbackEvent.currentTime,
        );
        setCompleted(true);
        setProgress({
          currentTime: duration || playbackEvent.currentTime,
          duration,
        });
        savePlaybackProgress(
          duration || playbackEvent.currentTime,
          duration,
          true,
        );
        advanceEpisode();
        return;
      }

      const currentTime = playbackEvent.currentTime;
      const duration = playbackEvent.duration;
      if (!Number.isFinite(currentTime) || !Number.isFinite(duration)) return;

      fallbackProgressRef.current = currentTime;
      setProgress({ currentTime, duration });
      if (isNearPlaybackEnd(detail.mediaType, currentTime, duration)) {
        setCompleted(true);
      }
      maybeAutoAdvance(currentTime, duration);
      const now = Date.now();
      if (now - lastSaveRef.current < 9000) return;
      lastSaveRef.current = now;

      savePlaybackProgress(currentTime, duration);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [
    advanceEpisode,
    detail.mediaType,
    maybeAutoAdvance,
    progress.duration,
    savePlaybackProgress,
  ]);

  useEffect(() => {
    if (
      !started ||
      provider?.supportsTracking ||
      playerLoadToken === 0
    ) {
      return;
    }

    const estimatedDuration = Math.max(60, (detail.runtime ?? 45) * 60);
    let ticksSinceSave = 0;

    const timer = window.setInterval(() => {
      if (
        document.visibilityState !== "visible" ||
        trackingDetectedRef.current
      ) {
        return;
      }

      const currentTime = Math.min(
        estimatedDuration,
        fallbackProgressRef.current + 5,
      );
      fallbackProgressRef.current = currentTime;
      ticksSinceSave += 1;
      setProgress({ currentTime, duration: estimatedDuration });

      const nearEnd = isNearPlaybackEnd(
        detail.mediaType,
        currentTime,
        estimatedDuration,
      );
      if (nearEnd) setCompleted(true);
      if (nearEnd || ticksSinceSave >= 3) {
        savePlaybackProgress(currentTime, estimatedDuration, nearEnd);
        ticksSinceSave = 0;
      }
      if (
        autoNext &&
        detail.mediaType === "tv" &&
        currentTime / estimatedDuration >= 0.98
      ) {
        advanceEpisode();
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [
    advanceEpisode,
    autoNext,
    detail.mediaType,
    detail.runtime,
    playerLoadToken,
    provider?.supportsTracking,
    savePlaybackProgress,
    started,
  ]);

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

  function changeSeason(nextSeason: number) {
    setSeason(nextSeason);
    setEpisode(1);
    setProgress({ currentTime: 0, duration: 0 });
    setCompleted(false);
    fallbackProgressRef.current = 0;
    trackingDetectedRef.current = false;
    autoAdvancedRef.current = "";
    replaceEpisodeUrl(nextSeason, 1);
    void loadStoredProgress(nextSeason, 1);
  }

  function changeEpisode(nextEpisode: number) {
    setEpisode(nextEpisode);
    setProgress({ currentTime: 0, duration: 0 });
    setCompleted(false);
    fallbackProgressRef.current = 0;
    trackingDetectedRef.current = false;
    autoAdvancedRef.current = "";
    replaceEpisodeUrl(season, nextEpisode);
    void loadStoredProgress(season, nextEpisode);
  }

  function startPlayback() {
    setStarted(true);
    if (progress.currentTime > 0) return;
    fallbackProgressRef.current = 1;
    setProgress((current) => ({ ...current, currentTime: 1 }));
    savePlaybackProgress(1, progress.duration);
  }

  function markAsWatched() {
    const duration = Math.max(progress.duration, (detail.runtime ?? 45) * 60);
    fallbackProgressRef.current = duration;
    setCompleted(true);
    setProgress({ currentTime: duration, duration });
    savePlaybackProgress(duration, duration, true);
    if (detail.mediaType === "tv" && autoNext) advanceEpisode();
  }

  async function loadStoredProgress(
    nextSeason: number,
    nextEpisode: number,
  ) {
    try {
      const params = new URLSearchParams({
        tmdbId: String(detail.id),
        mediaType: detail.mediaType,
        season: String(nextSeason),
        episode: String(nextEpisode),
      });
      const response = await fetch(`/api/progress?${params.toString()}`);
      if (!response.ok) return;
      const payload = (await response.json()) as {
        progress?: WatchProgress | null;
      };
      if (!payload.progress) return;
      fallbackProgressRef.current = payload.progress.progressSeconds;
      setProgress({
        currentTime: payload.progress.progressSeconds,
        duration: payload.progress.durationSeconds,
      });
      setCompleted(payload.progress.completed);
    } catch {
      // The selected episode remains playable even if history is unavailable.
    }
  }

  const percent = progress.duration ? Math.min(100, (progress.currentTime / progress.duration) * 100) : 0;
  const isAnime =
    detail.mediaType === "tv" &&
    detail.originalLanguage === "ja" &&
    detail.genreIds.includes(16);
  const featuredCrew = detail.crew.filter((person) =>
    detail.mediaType === "movie"
      ? person.job === "Director"
      : person.job === "Creator",
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050505] pt-16 text-white">
      <SiteHeader fixed />
      <div className="relative">
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

        <section className="grid min-h-[calc(100svh-4rem)] grid-rows-[minmax(42svh,1fr)_auto] sm:grid-rows-[minmax(52vh,1fr)_auto]">
          <div className="relative bg-black">
            {started && iframeUrl ? (
              <iframe
                key={iframeUrl}
                ref={playerFrameRef}
                src={iframeUrl}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                onLoad={() => setPlayerLoadToken((value) => value + 1)}
                className="h-full min-h-[42svh] w-full border-0 sm:min-h-[55vh]"
                title={`Lecteur ${detail.title}`}
              />
            ) : !iframeUrl ? (
              <div className="flex h-full min-h-[42svh] items-center justify-center bg-zinc-950 text-zinc-400 sm:min-h-[55vh]">
                Aucune source configuree
              </div>
            ) : null}
            {!started && iframeUrl ? (
              <div className="absolute inset-0 grid min-h-[42svh] place-items-center overflow-hidden bg-black sm:min-h-[55vh]">
                {detail.backdropUrl ?? detail.posterUrl ? (
                  <img
                    src={detail.backdropUrl ?? detail.posterUrl ?? ""}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-45"
                  />
                ) : (
                  <div className="poster-fallback absolute inset-0" />
                )}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(229,9,20,.28),transparent_34%),linear-gradient(0deg,#050505,rgba(5,5,5,.45))]" />
                <button
                  type="button"
                  onClick={startPlayback}
                  className="relative z-10 inline-flex h-16 items-center gap-3 rounded bg-white px-8 text-base font-black text-black shadow-2xl transition hover:scale-105 hover:bg-zinc-200"
                >
                  <Play className="h-6 w-6 fill-black" />
                  Play
                </button>
              </div>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
              <span className="block h-full bg-[#e50914]" style={{ width: `${percent}%` }} />
            </div>
          </div>

          <div className="border-t border-white/10 bg-[#0b0b0b]">
            <div className="mx-auto grid min-w-0 max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[150px_minmax(0,1fr)] lg:px-8 xl:grid-cols-[180px_minmax(0,1fr)_320px]">
              <aside className="hidden lg:block">
                {detail.posterUrl ? (
                  <img
                    src={detail.posterUrl}
                    alt={detail.title}
                    className="aspect-[2/3] w-full rounded object-cover shadow-2xl ring-1 ring-white/10"
                  />
                ) : (
                  <div className="poster-fallback aspect-[2/3] rounded ring-1 ring-white/10" />
                )}
              </aside>

              <section className="min-w-0 overflow-hidden">
                <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
                  <span>{detail.mediaType === "movie" ? "Film" : "Serie"}</span>
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-4 w-4 fill-[#f5c542] text-[#f5c542]" />
                    {detail.voteAverage.toFixed(1)}
                  </span>
                  {detail.runtime ? <span>{detail.runtime} min</span> : null}
                </div>
                <h1 className="text-3xl font-black tracking-normal sm:text-5xl">{detail.title}</h1>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-300 sm:text-base">
                  {detail.overview}
                </p>
                {featuredCrew.length ? (
                  <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-bold text-zinc-500">
                      {detail.mediaType === "movie"
                        ? featuredCrew.length > 1
                          ? "Réalisateurs"
                          : "Réalisateur"
                        : "Création"}
                    </span>
                    {featuredCrew.map((person) => (
                      <Link
                        key={`${person.id}-${person.job}`}
                        href={personBrowseHref(detail, person.id, person.name, person.job, isAnime)}
                        className="font-semibold text-zinc-200 transition hover:text-[#e50914]"
                      >
                        {person.name}
                      </Link>
                    ))}
                  </div>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-2">
                  {detail.genres.map((genre) => (
                    <Link
                      key={genre.id}
                      href={`/browse?type=${detail.mediaType}${isAnime ? "&catalog=anime" : ""}&genre=${genre.id}`}
                      className="rounded bg-white/10 px-3 py-1 text-xs text-zinc-200 transition hover:bg-[#e50914] hover:text-white"
                    >
                      {genre.name}
                    </Link>
                  ))}
                </div>
                {detail.cast.length ? (
                  <div className="mt-6 min-w-0 max-w-full overflow-hidden">
                    <h2 className="mb-3 text-sm font-black uppercase tracking-[0.12em] text-zinc-400">
                      Casting
                    </h2>
                    <div className="scrollbar-none flex w-full max-w-full gap-3 overflow-x-auto pb-2">
                      {detail.cast.map((person) => (
                        <Link
                          key={person.id}
                          href={personBrowseHref(
                            detail,
                            person.id,
                            person.name,
                            undefined,
                            isAnime,
                          )}
                          className="group w-[92px] shrink-0"
                        >
                          <div className="aspect-[3/4] overflow-hidden rounded bg-zinc-900 ring-1 ring-white/10">
                            {person.profileUrl ? (
                              <img
                                src={person.profileUrl}
                                alt={person.name}
                                className="h-full w-full object-cover transition group-hover:scale-105"
                                loading="lazy"
                              />
                            ) : (
                              <div className="grid h-full place-items-center px-2 text-center text-xs text-zinc-400">
                                {person.name}
                              </div>
                            )}
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs font-bold text-zinc-100">{person.name}</p>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              <aside className="order-first grid min-w-0 content-start gap-3 rounded bg-zinc-950 p-4 ring-1 ring-white/10 lg:order-none lg:col-span-2 xl:col-span-1">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-2">
                  {providers.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        trackingDetectedRef.current = false;
                        setProviderId(item.id);
                      }}
                      className={`h-9 rounded border px-3 text-xs font-bold transition ${
                        providerId === item.id
                          ? "border-[#e50914] bg-[#e50914] text-white"
                          : "border-white/10 bg-white/[0.06] text-zinc-300 hover:text-white"
                      }`}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-[auto_1fr] items-center gap-3">
                  <Languages className="h-4 w-4 text-zinc-400" />
                  <select
                    value={activeLanguage}
                    onChange={(event) => setLanguage(event.target.value)}
                    className="control-field w-full"
                  >
                    {languageOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {detail.mediaType === "tv" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={season}
                      onChange={(event) => changeSeason(Number(event.target.value))}
                      className="control-field w-full"
                    >
                      {availableSeasons.map((item) => (
                        <option key={item.id} value={item.seasonNumber}>
                          Saison {item.seasonNumber}
                        </option>
                      ))}
                    </select>
                    <select
                      value={episode}
                      onChange={(event) => changeEpisode(Number(event.target.value))}
                      className="control-field w-full"
                    >
                      {episodeOptions.map((episodeNumber) => (
                        <option key={episodeNumber} value={episodeNumber}>
                          Episode {episodeNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {detail.mediaType === "tv" ? (
                  <label className="flex h-10 items-center justify-between rounded bg-white/[0.06] px-3 text-sm text-zinc-200 ring-1 ring-white/10">
                    <span className="inline-flex items-center gap-2">
                      <ToggleRight className="h-4 w-4 text-zinc-400" />
                      Episode suivant
                    </span>
                    <input
                      type="checkbox"
                      checked={autoNext}
                      onChange={(event) => setAutoNext(event.target.checked)}
                      className="h-4 w-4 accent-[#e50914]"
                    />
                  </label>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={like}
                    aria-pressed={liked}
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded px-3 text-sm font-bold transition ${
                      liked
                        ? "bg-[#e50914] text-white hover:bg-[#f6121d]"
                        : "bg-white text-black hover:bg-zinc-200"
                    }`}
                  >
                    <Heart className={`h-4 w-4 ${liked ? "fill-white" : ""}`} />
                    {liked ? "Aime" : "J'aime"}
                  </button>
                  <button
                    type="button"
                    onClick={dislike}
                    aria-pressed={disliked}
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded px-3 text-sm font-bold transition ${
                      disliked
                        ? "bg-white text-black"
                        : "bg-white/[0.06] text-zinc-200 ring-1 ring-white/10 hover:bg-white/10"
                    }`}
                  >
                    <ThumbsDown
                      className={`h-4 w-4 ${disliked ? "fill-black" : ""}`}
                    />
                    {disliked ? "Ignore" : "Pas pour moi"}
                  </button>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <div className="rounded bg-white/5 p-3 text-xs text-zinc-300">
                    {formatTime(progress.currentTime)} /{" "}
                    {formatTime(progress.duration)}
                  </div>
                  <button
                    type="button"
                    onClick={markAsWatched}
                    aria-pressed={completed}
                    className={`inline-flex h-10 items-center gap-2 rounded px-3 text-xs font-bold transition ${
                      completed
                        ? "bg-[#e50914] text-white"
                        : "bg-white/[0.06] text-zinc-200 ring-1 ring-white/10 hover:bg-white/10"
                    }`}
                  >
                    <Check className="h-4 w-4" />
                    {completed ? "Vu" : "Marquer vu"}
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </div>
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

function normalizePlaybackEvent(data: unknown) {
  if (typeof data === "string") {
    return isEndedEvent(data)
      ? { currentTime: 0, duration: 0, ended: true }
      : null;
  }
  if (!data || typeof data !== "object") return null;

  const message = data as Record<string, unknown>;
  const eventName = String(
    message.type ?? message.event ?? message.action ?? "",
  );
  const currentTime = Number(message.currentTime ?? message.time ?? 0);
  const duration = Number(message.duration ?? message.total ?? 0);
  const percentage = Number(message.percentage ?? message.percent ?? 0);
  const ended =
    isEndedEvent(eventName) ||
    Number((message.info as Record<string, unknown> | undefined)?.playerState) === 0 ||
    percentage >= 98;

  if (ended) return { currentTime, duration, ended: true };
  if (currentTime > 0 && duration > 0) {
    return { currentTime, duration, ended: false };
  }
  return null;
}

function isEndedEvent(value: string) {
  return ["ended", "videoended", "complete", "completed"].includes(
    value.toLowerCase(),
  );
}

function replaceEpisodeUrl(season: number, episode: number) {
  const url = new URL(window.location.href);
  url.searchParams.set("season", String(season));
  url.searchParams.set("episode", String(episode));
  window.history.replaceState(null, "", url);
}

function isNearPlaybackEnd(
  mediaType: MediaDetails["mediaType"],
  currentTime: number,
  duration: number,
) {
  if (duration <= 0) return false;
  const ratio = currentTime / duration;
  const remaining = Math.max(0, duration - currentTime);
  const creditsWindow = mediaType === "movie" ? 7 * 60 : 3 * 60;
  return ratio >= 0.9 || (ratio >= 0.75 && remaining <= creditsWindow);
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
