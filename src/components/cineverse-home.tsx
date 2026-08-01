"use client";

import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Info,
  LoaderCircle,
  Play,
  RefreshCw,
  Star,
  ThumbsDown,
  X,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { GENRES, LANGUAGES, SERIES_GENRES } from "@/lib/genres";
import { trackClientEvent } from "@/lib/client-events";
import type {
  BrowseCatalog,
  CatalogFilters,
  CatalogItem,
  CatalogSection,
  HomeCatalog,
  RecommendationResult,
} from "@/lib/types";
import { SiteHeader } from "@/components/site-header";

type Props = {
  catalog: HomeCatalog;
  initialLikedKeys: string[];
  initialDislikedKeys: string[];
  initialRecommendations: RecommendationResult;
};

type YouTubePlayer = {
  destroy: () => void;
  mute: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};

type YouTubeNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      host: string;
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: (event: { target: YouTubePlayer }) => void;
        onStateChange: (event: { data: number; target: YouTubePlayer }) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
  };
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeNamespace> | null = null;

export function CineVerseHome({
  catalog,
  initialLikedKeys,
  initialDislikedKeys,
  initialRecommendations,
}: Props) {
  const [, startTransition] = useTransition();
  const [liked, setLiked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialLikedKeys.map((key) => [key, true])),
  );
  const [disliked, setDisliked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialDislikedKeys.map((key) => [key, true])),
  );
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroLikePulse, setHeroLikePulse] = useState(false);
  const [previousHeroBackground, setPreviousHeroBackground] = useState<
    string | null
  >(null);
  const [impressionSessionId] = useState(
    () => getHomeSessionId(catalog.programmingSessionId),
  );
  const recordedImpressions = useRef(new Set<string>());
  const heroTransitionTimer = useRef<number | null>(null);
  const heroCandidates = useMemo(
    () =>
      uniqueItems([
        catalog.hero,
        ...recommendations.items,
        ...catalog.heroCandidates,
      ]).filter(
        (item) =>
          Boolean(item.backdropUrl ?? item.posterUrl) &&
          !disliked[`${item.mediaType}-${item.id}`],
      ),
    [catalog.hero, catalog.heroCandidates, disliked, recommendations.items],
  );
  const hero = heroCandidates[heroIndex % Math.max(1, heroCandidates.length)] ??
    catalog.hero;
  const heroBackground = hero.backdropUrl ?? hero.posterUrl;
  const heroTrailerUrl =
    hero.id === catalog.hero.id && hero.mediaType === catalog.hero.mediaType
      ? catalog.heroTrailerUrl
      : null;
  const heroReason =
    catalog.heroReasons?.[`${hero.mediaType}:${hero.id}`] ??
    ("reason" in hero ? String(hero.reason) : "Selectionne pour cette visite.");

  const sections = useMemo(() => {
    const refreshed = catalog.sections.map((section) =>
      section.id === "for-you" && recommendations.items.length
        ? { ...section, items: recommendations.items.slice(0, 12) }
        : section,
    );
    return dedupeSections(refreshed, hero);
  }, [catalog.sections, hero, recommendations.items]);

  const recordImpression = useCallback(
    (item: CatalogItem, shelfType: string, position: number) => {
      const sessionId = impressionSessionId;
      if (!sessionId) return;
      const key = `${sessionId}:${shelfType}:${item.mediaType}:${item.id}`;
      if (recordedImpressions.current.has(key)) return;
      recordedImpressions.current.add(key);
      void fetch("/api/recommendations/impressions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          sessionId,
          items: [
            {
              tmdbId: item.id,
              mediaType: item.mediaType,
              shelfType,
              position,
              score: "score" in item ? Number(item.score) : undefined,
            },
          ],
        }),
      }).catch(() => undefined);
    },
    [impressionSessionId],
  );

  useEffect(() => {
    recordImpression(hero, "hero", heroIndex);
  }, [hero, heroIndex, recordImpression]);

  useEffect(
    () => () => {
      if (heroTransitionTimer.current) {
        window.clearTimeout(heroTransitionTimer.current);
      }
    },
    [],
  );

  function advanceHero() {
    if (heroCandidates.length <= 1) return;
    if (heroTransitionTimer.current) {
      window.clearTimeout(heroTransitionTimer.current);
    }
    setPreviousHeroBackground(heroBackground);
    setHeroIndex((current) => (current + 1) % heroCandidates.length);
    heroTransitionTimer.current = window.setTimeout(() => {
      setPreviousHeroBackground(null);
      heroTransitionTimer.current = null;
    }, 650);
  }

  function markImpression(
    item: CatalogItem,
    action: "clicked" | "dismissed",
    shelfType = "interaction",
  ) {
    const sessionId = impressionSessionId;
    if (!sessionId) return;
    void fetch("/api/recommendations/impressions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        sessionId,
        tmdbId: item.id,
        mediaType: item.mediaType,
        action,
        shelfType,
      }),
    }).catch(() => undefined);
  }

  function toggleLike(item: CatalogItem) {
    const key = `${item.mediaType}-${item.id}`;
    const next = !liked[key];
    const previous = { liked: Boolean(liked[key]), disliked: Boolean(disliked[key]) };
    setLiked((current) => ({ ...current, [key]: next }));
    if (next) setDisliked((current) => ({ ...current, [key]: false }));

    void syncPreference(item, "like", next, key, previous);
  }

  function toggleDislike(item: CatalogItem) {
    const key = `${item.mediaType}-${item.id}`;
    const next = !disliked[key];
    const previous = { liked: Boolean(liked[key]), disliked: Boolean(disliked[key]) };
    setDisliked((current) => ({ ...current, [key]: next }));
    if (next) {
      setLiked((current) => ({ ...current, [key]: false }));
      if (item.id === hero.id && item.mediaType === hero.mediaType) {
        advanceHero();
      }
      markImpression(item, "dismissed");
    }

    void syncPreference(item, "dislike", next, key, previous);
  }

  async function syncPreference(
    item: CatalogItem,
    preference: "like" | "dislike",
    next: boolean,
    key: string,
    previous: { liked: boolean; disliked: boolean },
  ) {
    setRecommendationsLoading(true);
    let preferenceSaved = false;
    try {
      const response = await fetch(
        preference === "like" ? "/api/likes" : "/api/dislikes",
        {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tmdbId: item.id,
          mediaType: item.mediaType,
          title: item.title,
          posterPath: item.posterPath,
          backdropPath: item.backdropPath,
          genreIds: item.genreIds,
          originalLanguage: item.originalLanguage,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          [preference === "like" ? "liked" : "disliked"]: next,
        }),
      });
      if (!response.ok) throw new Error("Preference update failed");
      preferenceSaved = true;

      const recommendationResponse = await fetch("/api/recommendations", {
        cache: "no-store",
      });
      if (!recommendationResponse.ok) throw new Error("Recommendation refresh failed");
      const result = (await recommendationResponse.json()) as RecommendationResult;
      startTransition(() => setRecommendations(result));
    } catch {
      if (!preferenceSaved) {
        setLiked((current) => ({ ...current, [key]: previous.liked }));
        setDisliked((current) => ({ ...current, [key]: previous.disliked }));
      }
    } finally {
      setRecommendationsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <SiteHeader />

      <section className="relative min-h-[82vh] overflow-hidden">
        {heroBackground ? (
          <img
            key={`backdrop-${hero.mediaType}-${hero.id}`}
            src={heroBackground}
            alt=""
            className="hero-backdrop-enter absolute inset-0 h-full w-full object-cover brightness-90"
          />
        ) : (
          <div className="poster-fallback absolute inset-0" />
        )}
        {previousHeroBackground ? (
          <div
            aria-hidden="true"
            className="hero-backdrop-exit absolute inset-0 z-[1] bg-cover bg-center brightness-90"
            style={{ backgroundImage: `url("${previousHeroBackground}")` }}
          />
        ) : null}
        {heroTrailerUrl ? (
          <HeroTrailer
            key={`trailer-${hero.mediaType}-${hero.id}`}
            url={heroTrailerUrl}
            title={hero.title}
          />
        ) : null}
        <div className="absolute inset-0 z-[2] bg-[linear-gradient(90deg,rgba(5,5,5,.94)_0%,rgba(5,5,5,.62)_34%,rgba(5,5,5,.1)_72%),linear-gradient(0deg,#050505_0%,rgba(5,5,5,.04)_38%,rgba(5,5,5,.34)_100%)]" />
        <div className="relative z-10 mx-auto flex min-h-[82vh] max-w-7xl flex-col justify-end px-4 pb-16 pt-28 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase text-zinc-300">
              <Info className="h-4 w-4 text-[#e50914]" />
              Notre choix pour vous
            </p>
            <div className="mb-4 flex items-center gap-3 text-sm font-semibold text-zinc-200">
              <span className="rounded-sm bg-[#e50914] px-2 py-1 text-white">
                {hero.mediaType === "movie" ? "FILM" : "SERIE"}
              </span>
              <span>{yearOf(hero.releaseDate)}</span>
              {hero.voteCount > 0 && hero.voteAverage > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-4 w-4 fill-[#f5c542] text-[#f5c542]" />
                  {hero.voteAverage.toFixed(1)}
                </span>
              ) : null}
            </div>
            <h1 className="line-clamp-2 text-4xl font-black leading-none tracking-normal sm:text-6xl lg:text-7xl">
              {hero.title}
            </h1>
            <p className="mt-5 line-clamp-3 min-h-[5.25rem] max-w-2xl overflow-hidden text-base leading-7 text-zinc-200 sm:text-lg">
              {hero.overview}
            </p>
            <p className="mt-4 line-clamp-2 min-h-12 max-w-2xl overflow-hidden border-l-2 border-[#e50914] pl-3 text-sm leading-6 text-zinc-300">
              {heroReason}
            </p>
            <div className="mt-7 inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg bg-black/30 p-2 shadow-2xl ring-1 ring-white/10 backdrop-blur-md">
              <Link
                href={`/watch/${hero.mediaType}/${hero.id}`}
                onClick={() => {
                  markImpression(hero, "clicked", "hero");
                  trackClientEvent({
                    eventType: "RECOMMENDATION_CLICKED",
                    tmdbId: hero.id,
                    mediaType: hero.mediaType,
                    title: hero.title,
                    posterPath: hero.posterPath,
                    genreIds: hero.genreIds,
                    metadata: { reason: heroReason, placement: "hero" },
                  });
                }}
                className="inline-flex h-11 items-center gap-2 rounded bg-white px-5 text-sm font-bold text-black transition hover:bg-zinc-200"
              >
                <Play className="h-5 w-5 fill-black" />
                Regarder
              </Link>
              <div className="inline-flex overflow-hidden rounded bg-zinc-950/75 ring-1 ring-white/15">
                <button
                  type="button"
                  onClick={() => {
                    setHeroLikePulse(true);
                    toggleLike(hero);
                  }}
                  aria-label="J'aime"
                  title="J'aime"
                  aria-pressed={Boolean(liked[`${hero.mediaType}-${hero.id}`])}
                  className="inline-flex h-11 w-11 items-center justify-center text-zinc-100 transition hover:bg-white/10"
                >
                  <Heart
                    onAnimationEnd={() => setHeroLikePulse(false)}
                    className={`h-5 w-5 ${
                      liked[`${hero.mediaType}-${hero.id}`]
                        ? "fill-[#e50914] text-[#e50914]"
                        : ""
                    } ${heroLikePulse ? "like-pop" : ""}`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => toggleDislike(hero)}
                  aria-label="Pas pour moi"
                  title="Pas pour moi"
                  aria-pressed={Boolean(disliked[`${hero.mediaType}-${hero.id}`])}
                  className={`inline-flex h-11 w-11 items-center justify-center border-l border-white/10 transition ${
                    disliked[`${hero.mediaType}-${hero.id}`]
                      ? "bg-white text-black"
                      : "text-zinc-100 hover:bg-white/10"
                  }`}
                >
                  <ThumbsDown
                    className={`h-5 w-5 ${
                      disliked[`${hero.mediaType}-${hero.id}`]
                        ? "fill-black"
                        : ""
                    }`}
                  />
                </button>
              </div>
              {heroCandidates.length > 1 ? (
                <button
                  type="button"
                  onClick={advanceHero}
                  aria-label="Autre proposition"
                  title="Autre proposition"
                  className="inline-flex h-11 w-11 items-center justify-center rounded bg-zinc-950/75 text-white ring-1 ring-white/15 transition hover:bg-white/10"
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div id="catalog" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <nav
          aria-label="Sections de l'accueil"
          className="scrollbar-none mb-8 flex gap-2 overflow-x-auto border-b border-white/10 pb-4"
        >
          {sections.map((section) => (
            <a
              key={`shortcut-${section.id}`}
              href={`#${section.id}`}
              className="shrink-0 rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
            >
              {section.title}
            </a>
          ))}
        </nav>

        {sections.map((section) => (
          <CatalogRevealSection
            key={section.id}
            id={section.id}
          >
            <div className="mb-4 flex min-h-8 flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold tracking-normal">
                    {section.title}
                  </h2>
                  {section.id.startsWith("new-") ? (
                    <span className="rounded-sm bg-[#f5c542]/15 px-2 py-1 text-[10px] font-black uppercase text-[#f5c542] ring-1 ring-[#f5c542]/30">
                      Nouveau
                    </span>
                  ) : null}
                </div>
                {section.reason ? (
                  <p className="mt-1 max-w-2xl text-sm leading-5 text-zinc-500">
                    {section.reason}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                {section.personalized && recommendationsLoading ? (
                  <LoaderCircle className="h-4 w-4 animate-spin text-zinc-500" />
                ) : null}
                {sectionBrowseHref(section.id) ? (
                  <Link
                    href={sectionBrowseHref(section.id) ?? "/browse"}
                    className="inline-flex items-center gap-1 text-xs font-bold text-zinc-400 transition hover:text-white"
                  >
                    Voir tout
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            </div>
            <HorizontalCarousel label={section.title}>
              {section.items.map((item, position) => (
                <MediaCard
                  key={`${section.id}-${item.mediaType}-${item.id}`}
                  item={item}
                  liked={Boolean(liked[`${item.mediaType}-${item.id}`])}
                  disliked={Boolean(disliked[`${item.mediaType}-${item.id}`])}
                  onLike={toggleLike}
                  onDislike={toggleDislike}
                  onOpen={(item) =>
                    markImpression(item, "clicked", section.id)
                  }
                  onImpression={(item) =>
                    recordImpression(item, section.id, position)
                  }
                  reason={
                    section.personalized && "reason" in item
                      ? String(item.reason)
                      : undefined
                  }
                  animationIndex={position}
                />
              ))}
            </HorizontalCarousel>
          </CatalogRevealSection>
        ))}
      </div>
    </main>
  );
}

function CatalogRevealSection({
  children,
  id,
}: {
  children: ReactNode;
  id: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (!("IntersectionObserver" in window)) {
      const frame = globalThis.requestAnimationFrame(() => setVisible(true));
      return () => globalThis.cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "80px 0px", threshold: 0.08 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id={id}
      className={`catalog-row-reveal mb-14 scroll-mt-24 ${
        visible ? "is-visible" : ""
      }`}
    >
      {children}
    </section>
  );
}

function HorizontalCarousel({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scroll(direction: -1 | 1) {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollBy({
      left: direction * Math.max(320, container.clientWidth * 0.82),
      behavior: "smooth",
    });
  }

  return (
    <div className="group/carousel relative">
      <button
        type="button"
        onClick={() => scroll(-1)}
        className="absolute left-2 top-[42%] z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/90 text-white opacity-0 shadow-xl ring-1 ring-white/20 transition hover:bg-white hover:text-black focus:opacity-100 group-hover/carousel:opacity-100 md:inline-flex"
        aria-label={`Faire defiler ${label} vers la gauche`}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div
        ref={scrollRef}
        className="scrollbar-none grid touch-pan-x auto-cols-[150px] grid-flow-col gap-3 overflow-x-auto overscroll-x-contain pb-2 sm:auto-cols-[190px]"
      >
        {children}
      </div>
      <button
        type="button"
        onClick={() => scroll(1)}
        className="absolute right-2 top-[42%] z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/90 text-white opacity-0 shadow-xl ring-1 ring-white/20 transition hover:bg-white hover:text-black focus:opacity-100 group-hover/carousel:opacity-100 md:inline-flex"
        aria-label={`Faire defiler ${label} vers la droite`}
      >
        <ChevronRight className="h-5 w-5" />
      </button>
      <div className="mt-3 flex justify-end gap-2 md:hidden">
        <button
          type="button"
          onClick={() => scroll(-1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.07] text-zinc-200 ring-1 ring-white/15"
          aria-label={`Faire defiler ${label} vers la gauche`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => scroll(1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.07] text-zinc-200 ring-1 ring-white/15"
          aria-label={`Faire defiler ${label} vers la droite`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function HeroTrailer({ url, title }: { url: string; title: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const revealTimer = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const videoId = youtubeVideoId(url);
    if (!videoId || !mountRef.current) return;

    let cancelled = false;
    void loadYouTubeApi()
      .then((youtube) => {
        if (cancelled || !mountRef.current) return;

        playerRef.current = new youtube.Player(mountRef.current, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            cc_load_policy: 0,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              event.target.mute();
              event.target.playVideo();
            },
            onStateChange: (event) => {
              if (event.data === youtube.PlayerState.PLAYING) {
                if (revealTimer.current) {
                  window.clearTimeout(revealTimer.current);
                }
                revealTimer.current = window.setTimeout(() => {
                  if (!cancelled) setVisible(true);
                }, 3200);
              }

              if (event.data === youtube.PlayerState.ENDED) {
                setVisible(false);
                event.target.seekTo(0, true);
                event.target.playVideo();
              }
            },
          },
        });
      })
      .catch(() => setVisible(false));

    return () => {
      cancelled = true;
      if (revealTimer.current) window.clearTimeout(revealTimer.current);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [url]);

  return (
    <div
      aria-label={`Trailer ${title}`}
      className={`pointer-events-none absolute inset-0 h-full w-full scale-125 transition-opacity duration-1000 ${
        visible ? "opacity-90" : "opacity-0"
      }`}
    >
      <div
        ref={mountRef}
        className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full [&>iframe]:border-0"
      />
    </div>
  );
}

export function BrowseExperience({
  catalog,
  initialLikedKeys = [],
  initialDislikedKeys = [],
}: {
  catalog: BrowseCatalog;
  initialLikedKeys?: string[];
  initialDislikedKeys?: string[];
}) {
  const [, startTransition] = useTransition();
  const [liked, setLiked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialLikedKeys.map((key) => [key, true])),
  );
  const [disliked, setDisliked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialDislikedKeys.map((key) => [key, true])),
  );

  useEffect(() => {
    const activeFilters = Object.fromEntries(
      Object.entries(catalog.filters).filter(([, value]) => Boolean(value)),
    );
    if (!Object.keys(activeFilters).length) return;
    trackClientEvent({
      eventType: "FILTER_APPLIED",
      mediaType:
        catalog.filters.mediaType === "movie" ||
        catalog.filters.mediaType === "tv"
          ? catalog.filters.mediaType
          : undefined,
      metadata: { filters: activeFilters },
    });
  }, [catalog.filters]);

  function toggleLike(item: CatalogItem) {
    const key = `${item.mediaType}-${item.id}`;
    const next = !liked[key];
    const previous = { liked: Boolean(liked[key]), disliked: Boolean(disliked[key]) };
    setLiked((current) => ({ ...current, [key]: next }));
    if (next) setDisliked((current) => ({ ...current, [key]: false }));
    syncBrowsePreference(item, "like", next, key, previous);
  }

  function toggleDislike(item: CatalogItem) {
    const key = `${item.mediaType}-${item.id}`;
    const next = !disliked[key];
    const previous = { liked: Boolean(liked[key]), disliked: Boolean(disliked[key]) };
    setDisliked((current) => ({ ...current, [key]: next }));
    if (next) setLiked((current) => ({ ...current, [key]: false }));
    syncBrowsePreference(item, "dislike", next, key, previous);
  }

  function syncBrowsePreference(
    item: CatalogItem,
    preference: "like" | "dislike",
    next: boolean,
    key: string,
    previous: { liked: boolean; disliked: boolean },
  ) {
    startTransition(() => {
      fetch(preference === "like" ? "/api/likes" : "/api/dislikes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tmdbId: item.id,
          mediaType: item.mediaType,
          title: item.title,
          posterPath: item.posterPath,
          backdropPath: item.backdropPath,
          genreIds: item.genreIds,
          originalLanguage: item.originalLanguage,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          [preference === "like" ? "liked" : "disliked"]: next,
        }),
      }).then((response) => {
        if (response.ok) return;
        setLiked((current) => ({ ...current, [key]: previous.liked }));
        setDisliked((current) => ({ ...current, [key]: previous.disliked }));
      });
    });
  }

  return (
    <main className="min-h-screen bg-[#050505] pt-16 text-white">
      <SiteHeader query={catalog.filters.query} />

      <div id="catalog" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <ActiveFilters filters={catalog.filters} />
        <FilteredGrid
          items={catalog.items}
          liked={liked}
          disliked={disliked}
          onLike={toggleLike}
          onDislike={toggleDislike}
          filters={catalog.filters}
          currentPage={catalog.page}
          totalPages={catalog.totalPages}
          totalResults={catalog.totalResults}
        />
      </div>
    </main>
  );
}

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => {
      youtubeApiPromise = null;
      reject(new Error("YouTube API timeout"));
    }, 12000);

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      window.clearTimeout(timeout);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube API unavailable"));
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-cineverse-youtube="true"]',
    );
    if (existing) return;

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.dataset.cineverseYoutube = "true";
    script.onerror = () => {
      window.clearTimeout(timeout);
      youtubeApiPromise = null;
      reject(new Error("YouTube API failed to load"));
    };
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

function youtubeVideoId(url: string) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  } catch {
    return "";
  }
}

function ActiveFilters({ filters }: { filters: CatalogFilters }) {
  const active = activeFilterLabels(filters);
  if (!active.length) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-bold uppercase text-zinc-500">
        Filtres actifs
      </span>
      {active.map((filter) => (
        <Link
          key={filter.key}
          href={filterHrefWithout(filters, filter.key)}
          className="inline-flex h-8 items-center gap-2 rounded border border-white/15 bg-white/[0.07] px-3 text-xs text-zinc-200 transition hover:border-[#e50914] hover:text-white"
          title={`Retirer ${filter.label}`}
        >
          {filter.label}
          <X className="h-3.5 w-3.5 text-zinc-500" />
        </Link>
      ))}
      <Link
        href="/browse"
        className="ml-1 text-xs font-semibold text-zinc-500 transition hover:text-white"
      >
        Tout effacer
      </Link>
    </div>
  );
}

function FilteredGrid({
  items,
  liked,
  disliked,
  onLike,
  onDislike,
  filters,
  currentPage,
  totalPages,
  totalResults,
}: {
  items: CatalogItem[];
  liked: Record<string, boolean>;
  disliked: Record<string, boolean>;
  onLike: (item: CatalogItem) => void;
  onDislike: (item: CatalogItem) => void;
  filters: BrowseCatalog["filters"];
  currentPage: number;
  totalPages: number;
  totalResults: number;
}) {
  const sort = filters.sort ?? (filters.query ? "relevance" : "new");
  const sorted = useMemo(() => sortItems(items, sort), [items, sort]);
  const pageWindow = buildPageWindow(currentPage, totalPages);
  const sortOptions = filters.query
    ? [
        ["relevance", "Pertinence"],
        ["rating", "Les + Notes"],
        ["popular", "Les + Regardes"],
        ["new", "Nouveautes"],
        ["az", "A-Z"],
      ]
    : [
        ["new", "Nouveautes"],
        ["rating", "Les + Notes"],
        ["popular", "Les + Regardes"],
        ["az", "A-Z"],
        ["type", "Type"],
      ];

  return (
    <section className="mb-12 border border-white/10 bg-[#101010] p-3 shadow-2xl sm:p-4">
      <div className="mb-4 flex items-center justify-between gap-3 text-sm text-zinc-400">
        <span>{totalResults.toLocaleString("fr-FR")} resultats</span>
        <span>
          Page {currentPage} / {totalPages}
        </span>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {sortOptions.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              window.location.href = pageHref({ ...filters, sort: value, page: undefined }, 1);
            }}
            className={`h-9 border text-xs font-bold transition ${
              sort === value
                ? "border-[#e50914] bg-[#e50914] text-white"
                : "border-white/10 bg-white/[0.07] text-zinc-300 hover:border-zinc-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {sorted.map((item) => (
          <MediaCard
            key={`filtered-${item.mediaType}-${item.id}`}
            item={item}
            liked={Boolean(liked[`${item.mediaType}-${item.id}`])}
            disliked={Boolean(disliked[`${item.mediaType}-${item.id}`])}
            onLike={onLike}
            onDislike={onDislike}
            compact
          />
        ))}
        {!sorted.length ? (
          <div className="col-span-full grid min-h-48 place-items-center border border-white/10 bg-black/20 text-sm text-zinc-400">
            Aucun resultat
          </div>
        ) : null}
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
        {pageWindow.map((number, index) =>
          number === "gap" ? (
            <span key={`gap-${index}`} className="px-2 text-zinc-400">
              ...
            </span>
          ) : (
            <Link
            key={number}
            href={pageHref(filters, number)}
            className={`h-9 min-w-9 px-3 text-sm font-bold ${
              currentPage === number ? "bg-[#e50914] text-white" : "bg-white/10 text-zinc-200"
            }`}
          >
            {number}
            </Link>
          ),
        )}
        <Link
          href={pageHref(filters, Math.min(totalPages, currentPage + 1))}
          className="inline-flex h-9 min-w-9 items-center justify-center bg-white/10 text-zinc-200"
          aria-label="Page suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function MediaCard({
  item,
  liked,
  disliked,
  onLike,
  onDislike,
  onOpen,
  onImpression,
  compact = false,
  reason,
  animationIndex = 0,
}: {
  item: CatalogItem;
  liked: boolean;
  disliked: boolean;
  onLike: (item: CatalogItem) => void;
  onDislike: (item: CatalogItem) => void;
  onOpen?: (item: CatalogItem) => void;
  onImpression?: (item: CatalogItem) => void;
  compact?: boolean;
  reason?: string;
  animationIndex?: number;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const posterImageRef = useRef<HTMLImageElement>(null);
  const impressionRecorded = useRef(false);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [likePulse, setLikePulse] = useState(false);
  const watchHref = item.resume
    ? `/watch/${item.mediaType}/${item.id}${
        item.mediaType === "tv" &&
        item.resume.seasonNumber !== null &&
        item.resume.seasonNumber > 0 &&
        item.resume.episodeNumber !== null &&
        item.resume.episodeNumber > 0
          ? `?season=${item.resume.seasonNumber}&episode=${item.resume.episodeNumber}`
          : ""
      }`
    : `/watch/${item.mediaType}/${item.id}`;
  const resumePercent =
    item.resume?.durationSeconds && item.resume.durationSeconds > 0
      ? Math.min(
          100,
          (item.resume.progressSeconds / item.resume.durationSeconds) * 100,
        )
      : 0;

  useEffect(() => {
    const image = posterImageRef.current;
    if (!image?.complete) return;
    const frame = window.requestAnimationFrame(() => {
      if (image.naturalWidth > 0) setPosterLoaded(true);
      else setPosterFailed(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [item.posterUrl]);

  useEffect(() => {
    const element = cardRef.current;
    if (!element || !onImpression || impressionRecorded.current) return;
    if (!("IntersectionObserver" in window)) {
      impressionRecorded.current = true;
      onImpression(item);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || entry.intersectionRatio < 0.55) return;
        impressionRecorded.current = true;
        onImpression(item);
        observer.disconnect();
      },
      { threshold: [0.55] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [item, onImpression]);

  return (
    <article
      ref={cardRef}
      className="row-card group relative"
      style={
        {
          "--card-delay": `${Math.min(animationIndex, 8) * 40}ms`,
        } as CSSProperties
      }
    >
      <Link
        href={watchHref}
        onClick={() => {
          onOpen?.(item);
          if (!reason) return;
          trackClientEvent({
            eventType: "RECOMMENDATION_CLICKED",
            tmdbId: item.id,
            mediaType: item.mediaType,
            title: item.title,
            posterPath: item.posterPath,
            genreIds: item.genreIds,
            metadata: { reason },
          });
        }}
        className="block overflow-hidden rounded bg-zinc-900 shadow-black/50 ring-1 ring-white/10 transition duration-200 hover:-translate-y-1 hover:scale-[1.04] hover:shadow-2xl hover:ring-white/30"
      >
        <div
          suppressHydrationWarning
          className={`relative aspect-[2/3] overflow-hidden bg-zinc-900 ${
            item.posterUrl && !posterLoaded && !posterFailed
              ? "poster-shimmer"
              : ""
          }`}
        >
          {item.posterUrl && !posterFailed ? (
            <div className="poster-fallback absolute inset-0 flex items-end p-3">
              <span className="line-clamp-3 text-sm font-black leading-tight text-white/60">
                {item.title}
              </span>
            </div>
          ) : null}
          {item.posterUrl && !posterFailed ? (
            <img
              ref={posterImageRef}
              src={item.posterUrl}
              alt={item.title}
              className={`relative h-full w-full object-cover transition-opacity duration-300 ${
                posterLoaded ? "opacity-100" : "opacity-0"
              }`}
              loading="lazy"
              onLoad={() => setPosterLoaded(true)}
              onError={() => setPosterFailed(true)}
            />
          ) : (
            <div className="poster-fallback flex h-full w-full items-end p-3">
              <span className="text-sm font-black leading-tight">{item.title}</span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/75 via-black/35 to-transparent" />
          {item.voteCount > 0 && item.voteAverage > 0 ? (
            <div className="absolute left-2 top-2 inline-flex h-8 items-center gap-1 rounded bg-black/85 px-2 text-xs font-black text-white shadow-lg ring-1 ring-white/20 backdrop-blur">
              <Star className="h-3.5 w-3.5 fill-[#f5c542] text-[#f5c542]" />
              {item.voteAverage.toFixed(1)}
            </div>
          ) : null}
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
          {item.resume ? (
            <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/25">
              <span
                className="progress-fill block h-full bg-[#e50914]"
                style={{ width: `${resumePercent}%` }}
              />
            </div>
          ) : null}
        </div>
        <div
          className={
            compact
              ? "min-h-[76px] p-2"
              : reason
                ? "min-h-32 p-3"
                : "min-h-24 p-3"
          }
        >
          <h3 className="line-clamp-2 min-h-10 text-sm font-bold leading-5">
            {item.title}
          </h3>
          <p className="mt-1 text-xs text-zinc-400">
            {item.resume
              ? resumeLabel(item)
              : `${yearOf(item.releaseDate)} · ${
                  item.mediaType === "movie" ? "Film" : "Serie"
                }`}
          </p>
          {reason ? (
            <p className="mt-2 line-clamp-2 text-xs leading-4 text-zinc-400">{reason}</p>
          ) : null}
        </div>
      </Link>
      <button
        type="button"
        onClick={() => {
          setLikePulse(true);
          onLike(item);
        }}
        className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded bg-black/85 text-zinc-100 shadow-lg ring-1 ring-white/20 backdrop-blur transition hover:bg-[#e50914] hover:text-white"
        aria-label="J'aime"
      >
        <Heart
          onAnimationEnd={() => setLikePulse(false)}
          className={`h-4 w-4 ${
            liked ? "fill-[#e50914] text-[#e50914]" : ""
          } ${likePulse ? "like-pop" : ""}`}
        />
      </button>
      <button
        type="button"
        onClick={() => onDislike(item)}
        className={`absolute right-2 top-12 z-10 inline-flex h-8 w-8 items-center justify-center rounded shadow-lg ring-1 backdrop-blur transition ${
          disliked
            ? "bg-white text-black ring-white"
            : "bg-black/85 text-zinc-100 ring-white/20 hover:bg-zinc-700"
        }`}
        aria-label="Pas pour moi"
        aria-pressed={disliked}
        title="Pas pour moi"
      >
        <ThumbsDown className={`h-4 w-4 ${disliked ? "fill-black" : ""}`} />
      </button>
    </article>
  );
}

function resumeLabel(item: CatalogItem) {
  if (!item.resume) return "";
  if (item.resume.label) return item.resume.label;
  const position =
    item.mediaType === "tv" &&
    item.resume.seasonNumber !== null &&
    item.resume.seasonNumber > 0 &&
    item.resume.episodeNumber !== null &&
    item.resume.episodeNumber > 0
      ? `S${item.resume.seasonNumber} E${item.resume.episodeNumber}`
      : item.mediaType === "movie"
        ? "Film"
        : "Serie";
  if (item.resume.progressSeconds <= 0) return `${position} · A commencer`;
  if (item.resume.durationSeconds <= 0) return `${position} · En cours`;
  const ratio = item.resume.progressSeconds / item.resume.durationSeconds;
  if (ratio < 0.1) return `${position} · Commence`;
  if (ratio < 0.9) return `${position} · En cours`;
  return `${position} · Presque termine`;
}

function sectionBrowseHref(sectionId: string) {
  const hrefs: Record<string, string> = {
    watchlist: "/list",
    "new-movies": "/browse?type=movie&sort=new",
    "new-series": "/browse?type=tv&sort=new",
    movies: "/browse?type=movie&sort=popular",
    series: "/browse?type=tv&sort=popular",
    anime: "/browse?type=tv&catalog=anime",
    mood: "/browse?type=movie&genre=878",
  };
  return hrefs[sectionId] ?? null;
}

function uniqueItems(items: CatalogItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.mediaType}-${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeSections(
  sections: CatalogSection[],
  hero: CatalogItem,
) {
  return sections
    .map((section) => {
      const heroKey = `${hero.mediaType}-${hero.id}`;
      return {
        ...section,
        items: uniqueItems(section.items)
          .filter(
            (item) =>
              section.id === "resume" ||
              section.id === "watchlist" ||
              `${item.mediaType}-${item.id}` !== heroKey,
          )
          .slice(0, 12),
      };
    })
    .filter((section) => section.items.length > 0);
}

function getHomeSessionId(fallback?: string) {
  if (typeof window === "undefined") return fallback ?? null;
  const storageKey = "cineverse-home-session-v1";
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const sessionId =
    window.crypto.randomUUID?.() ??
    `home-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem(storageKey, sessionId);
  return sessionId;
}

function sortItems(items: CatalogItem[], sort: string) {
  return [...items].sort((a, b) => {
    if (sort === "relevance") return 0;
    if (sort === "rating") return b.voteAverage - a.voteAverage;
    if (sort === "az") return a.title.localeCompare(b.title);
    if (sort === "type") return a.mediaType.localeCompare(b.mediaType);
    if (sort === "popular") return b.popularity - a.popularity;
    return yearOf(b.releaseDate).localeCompare(yearOf(a.releaseDate));
  });
}

function pageHref(filters: BrowseCatalog["filters"], page: number) {
  const params = filterParams(filters);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/browse?${query}` : "/browse";
}

function filterParams(filters: CatalogFilters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.catalog) params.set("catalog", filters.catalog);
  if (filters.mediaType) params.set("type", filters.mediaType);
  if (filters.genre) params.set("genre", filters.genre);
  if (filters.yearFrom) params.set("yearFrom", filters.yearFrom);
  if (filters.yearTo) params.set("yearTo", filters.yearTo);
  if (filters.minRating) params.set("minRating", filters.minRating);
  if (filters.originalLanguage) params.set("originalLanguage", filters.originalLanguage);
  if (filters.person) params.set("person", filters.person);
  if (filters.personName) params.set("personName", filters.personName);
  if (filters.personRole) params.set("personRole", filters.personRole);
  if (filters.personJob) params.set("personJob", filters.personJob);
  if (filters.sort) params.set("sort", filters.sort);
  return params;
}

function activeFilterLabels(filters: CatalogFilters) {
  const labels: Array<{ key: string; label: string }> = [];
  if (filters.query) labels.push({ key: "query", label: `Recherche : ${filters.query}` });
  if (filters.catalog === "anime") {
    labels.push({ key: "catalog", label: "Catalogue : Animes" });
  } else if (filters.catalog === "new") {
    labels.push({
      key: "catalog",
      label: `Catalogue : Nouveautes ${
        filters.mediaType === "tv" ? "Series" : "Films"
      }`,
    });
  } else if (filters.mediaType) {
    labels.push({
      key: "mediaType",
      label: filters.mediaType === "tv" ? "Series" : "Films",
    });
  }
  if (filters.genre) {
    const genres =
      filters.catalog === "anime" || filters.mediaType === "tv"
        ? SERIES_GENRES
        : GENRES;
    const genre = genres.find((item) => String(item.id) === filters.genre);
    labels.push({ key: "genre", label: `Genre : ${genre?.name ?? filters.genre}` });
  }
  if (filters.yearFrom || filters.yearTo) {
    const years =
      filters.yearFrom === filters.yearTo
        ? filters.yearFrom
        : `${filters.yearFrom ?? "..."} - ${filters.yearTo ?? "..."}`;
    labels.push({ key: "year", label: `Annee : ${years}` });
  }
  if (filters.minRating) {
    labels.push({ key: "minRating", label: `Note : ${filters.minRating}+` });
  }
  if (filters.originalLanguage) {
    const language = LANGUAGES.find((item) => item.id === filters.originalLanguage);
    labels.push({
      key: "originalLanguage",
      label: `Langue : ${language?.name ?? filters.originalLanguage}`,
    });
  }
  if (filters.person) {
    const personLabel =
      filters.personRole === "crew"
        ? filters.mediaType === "tv"
          ? "Création"
          : "Réalisation"
        : "Casting";
    labels.push({
      key: "person",
      label: `${personLabel} : ${filters.personName ?? filters.person}`,
    });
  }
  if (filters.sort) {
    const sortLabels: Record<string, string> = {
      new: "Nouveautes",
      rating: "Les mieux notes",
      popular: "Les plus regardes",
      az: "A-Z",
      type: "Type",
    };
    labels.push({
      key: "sort",
      label: `Tri : ${sortLabels[filters.sort] ?? filters.sort}`,
    });
  }
  return labels;
}

function filterHrefWithout(filters: CatalogFilters, key: string) {
  const params = filterParams(filters);
  const queryKeys: Record<string, string[]> = {
    query: ["q"],
    catalog: ["catalog"],
    mediaType: ["type", "catalog", "genre"],
    genre: ["genre"],
    year: ["yearFrom", "yearTo"],
    minRating: ["minRating"],
    originalLanguage: ["originalLanguage"],
    person: ["person", "personName", "personRole", "personJob"],
    sort: ["sort"],
  };
  (queryKeys[key] ?? [key]).forEach((queryKey) => params.delete(queryKey));
  params.delete("page");
  const query = params.toString();
  return query ? `/browse?${query}` : "/browse";
}

function buildPageWindow(currentPage: number, totalPages: number) {
  const pages = new Set<number>([1, totalPages, currentPage]);
  for (let offset = -2; offset <= 2; offset += 1) {
    const page = currentPage + offset;
    if (page >= 1 && page <= totalPages) pages.add(page);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((page, index) => {
    const previous = sorted[index - 1];
    return previous && page - previous > 1 ? (["gap", page] as const) : [page];
  });
}

function yearOf(date: string | null) {
  return date ? date.slice(0, 4) : "CineVerse";
}
