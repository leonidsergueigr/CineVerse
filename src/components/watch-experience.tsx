"use client";

import Link from "next/link";
import { ArrowLeft, Heart, Languages, Play, Server, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { EmbedProvider, MediaDetails, WatchProgress } from "@/lib/types";

type Props = {
  detail: MediaDetails;
  providers: EmbedProvider[];
  initialProgress: WatchProgress | null;
  initialSeason: number | null;
  initialEpisode: number | null;
};

export function WatchExperience({
  detail,
  providers,
  initialProgress,
  initialSeason,
  initialEpisode,
}: Props) {
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [language, setLanguage] = useState("vostfr");
  const [season, setSeason] = useState(initialSeason ?? 1);
  const [episode, setEpisode] = useState(initialEpisode ?? 1);
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState({
    currentTime: initialProgress?.progressSeconds ?? 0,
    duration: initialProgress?.durationSeconds ?? 0,
  });
  const [, startTransition] = useTransition();
  const lastSaveRef = useRef(0);

  const provider = providers.find((item) => item.id === providerId) ?? providers[0];
  const iframeUrl = useMemo(() => {
    if (!provider) return "";
    const values: Record<string, string> = {
      tmdbId: String(detail.id),
      mediaType: detail.mediaType,
      title: detail.title,
      language,
      season: String(season),
      episode: String(episode),
    };
    return provider.template.replace(/\{(\w+)\}/g, (_, key: string) =>
      encodeURIComponent(values[key] ?? ""),
    );
  }, [detail.id, detail.mediaType, detail.title, episode, language, provider, season]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = typeof event.data === "string" ? parseJson(event.data) : event.data;
      if (!data || data.type !== "cineverse:timeupdate") return;

      const currentTime = Number(data.currentTime);
      const duration = Number(data.duration);
      if (!Number.isFinite(currentTime) || !Number.isFinite(duration)) return;

      setProgress({ currentTime, duration });
      const now = Date.now();
      if (now - lastSaveRef.current < 9000) return;
      lastSaveRef.current = now;

      fetch("/api/progress", {
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
          progressSeconds: currentTime,
          durationSeconds: duration,
        }),
      });
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [detail, episode, season]);

  function like() {
    startTransition(() => {
      fetch("/api/likes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tmdbId: detail.id,
          mediaType: detail.mediaType,
          title: detail.title,
          posterPath: detail.posterPath,
          backdropPath: detail.backdropPath,
          liked: true,
        }),
      });
    });
  }

  function startPlayback() {
    setStarted(true);
    if (progress.currentTime > 0) return;

    fetch("/api/progress", {
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
        progressSeconds: 1,
        durationSeconds: progress.duration,
      }),
    });
  }

  const percent = progress.duration ? Math.min(100, (progress.currentTime / progress.duration) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="relative">
        <div className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black to-transparent">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link
              href="/"
              className="inline-flex h-10 w-10 items-center justify-center rounded bg-black/50 ring-1 ring-white/10 transition hover:bg-white hover:text-black"
              aria-label="Retour"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <span className="text-xl font-black tracking-[0.18em] text-[#e50914]">CineVerse</span>
          </div>
        </div>

        <section className="grid min-h-screen grid-rows-[minmax(55vh,1fr)_auto]">
          <div className="relative bg-black">
            {started && iframeUrl ? (
              <iframe
                key={iframeUrl}
                src={iframeUrl}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                className="h-full min-h-[55vh] w-full border-0"
                title={`Lecteur ${detail.title}`}
              />
            ) : !iframeUrl ? (
              <div className="flex h-full min-h-[55vh] items-center justify-center bg-zinc-950 text-zinc-400">
                Aucune source configuree
              </div>
            ) : null}
            {!started && iframeUrl ? (
              <div className="absolute inset-0 grid min-h-[55vh] place-items-center overflow-hidden bg-black">
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
            <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_380px] lg:px-8">
              <section>
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
                <div className="mt-5 flex flex-wrap gap-2">
                  {detail.genres.map((genre) => (
                    <span key={genre.id} className="rounded bg-white/10 px-3 py-1 text-xs text-zinc-200">
                      {genre.name}
                    </span>
                  ))}
                </div>
              </section>

              <aside className="grid gap-3 rounded bg-zinc-950 p-4 ring-1 ring-white/10">
                <div className="grid grid-cols-[auto_1fr] items-center gap-3">
                  <Server className="h-4 w-4 text-zinc-400" />
                  <select
                    value={providerId}
                    onChange={(event) => setProviderId(event.target.value)}
                    className="h-10 rounded border border-white/10 bg-white/[0.08] px-3 text-sm outline-none focus:border-[#e50914]"
                  >
                    {providers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-[auto_1fr] items-center gap-3">
                  <Languages className="h-4 w-4 text-zinc-400" />
                  <select
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                    className="h-10 rounded border border-white/10 bg-white/[0.08] px-3 text-sm outline-none focus:border-[#e50914]"
                  >
                    <option value="vostfr">VOSTFR</option>
                    <option value="vf">VF</option>
                    <option value="vo">VO</option>
                  </select>
                </div>
                {detail.mediaType === "tv" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={season}
                      onChange={(event) => setSeason(Number(event.target.value))}
                      className="h-10 rounded border border-white/10 bg-white/[0.08] px-3 text-sm outline-none focus:border-[#e50914]"
                    >
                      {(detail.seasons ?? []).map((item) => (
                        <option key={item.id} value={item.seasonNumber}>
                          Saison {item.seasonNumber}
                        </option>
                      ))}
                    </select>
                    <input
                      value={episode}
                      onChange={(event) => setEpisode(Math.max(1, Number(event.target.value) || 1))}
                      min={1}
                      type="number"
                      className="h-10 rounded border border-white/10 bg-white/[0.08] px-3 text-sm outline-none focus:border-[#e50914]"
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={like}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded bg-white px-4 text-sm font-bold text-black transition hover:bg-zinc-200"
                >
                  <Heart className="h-4 w-4" />
                  {"J'aime"}
                </button>
                <div className="rounded bg-white/5 p-3 text-xs text-zinc-300">
                  {formatTime(progress.currentTime)} / {formatTime(progress.duration)}
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

function formatTime(seconds: number) {
  if (!seconds) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}
