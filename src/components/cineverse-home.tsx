"use client";

import Link from "next/link";
import { Filter, Heart, Play, Search, SlidersHorizontal, Star } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { GENRES, LANGUAGES } from "@/lib/genres";
import type { CatalogItem, HomeCatalog, WatchProgress } from "@/lib/types";

type Props = {
  catalog: HomeCatalog;
  continueWatching: WatchProgress[];
};

export function CineVerseHome({ catalog, continueWatching }: Props) {
  const [isPending, startTransition] = useTransition();
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const hero = catalog.hero;
  const heroBackground = hero.backdropUrl ?? hero.posterUrl;

  const sections = useMemo(() => {
    const resumeItems = continueWatching.map(progressToCatalogItem);
    return [
      ...(resumeItems.length
        ? [{ id: "resume", title: "Reprendre la lecture", items: resumeItems }]
        : []),
      ...catalog.sections,
    ];
  }, [catalog.sections, continueWatching]);

  function toggleLike(item: CatalogItem) {
    const key = `${item.mediaType}-${item.id}`;
    const next = !liked[key];
    setLiked((current) => ({ ...current, [key]: next }));
    startTransition(() => {
      fetch("/api/likes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tmdbId: item.id,
          mediaType: item.mediaType,
          title: item.title,
          posterPath: item.posterPath,
          backdropPath: item.backdropPath,
          liked: next,
        }),
      });
    });
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <header className="fixed inset-x-0 top-0 z-30 border-b border-white/5 bg-black/55 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-2xl font-black tracking-[0.18em] text-[#e50914]">
            CineVerse
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-zinc-300 md:flex">
            <a href="#films">Films</a>
            <a href="#series">Series</a>
            <a href="#filtres">Filtres</a>
          </nav>
        </div>
      </header>

      <section className="relative min-h-[82vh] overflow-hidden">
        {heroBackground ? (
          <img
            src={heroBackground}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="poster-fallback absolute inset-0" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#050505_0%,rgba(5,5,5,.82)_34%,rgba(5,5,5,.34)_70%),linear-gradient(0deg,#050505_0%,rgba(5,5,5,.1)_42%,rgba(5,5,5,.62)_100%)]" />
        <div className="relative z-10 mx-auto flex min-h-[82vh] max-w-7xl flex-col justify-end px-4 pb-16 pt-28 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="mb-4 flex items-center gap-3 text-sm font-semibold text-zinc-200">
              <span className="rounded-sm bg-[#e50914] px-2 py-1 text-white">
                {hero.mediaType === "movie" ? "FILM" : "SERIE"}
              </span>
              <span>{yearOf(hero.releaseDate)}</span>
              <span className="inline-flex items-center gap-1">
                <Star className="h-4 w-4 fill-[#f5c542] text-[#f5c542]" />
                {hero.voteAverage.toFixed(1)}
              </span>
            </div>
            <h1 className="text-5xl font-black leading-none tracking-normal sm:text-7xl">
              {hero.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-200 sm:text-lg">
              {hero.overview}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={`/watch/${hero.mediaType}/${hero.id}`}
                className="inline-flex h-12 items-center gap-2 rounded bg-white px-5 text-sm font-bold text-black transition hover:bg-zinc-200"
              >
                <Play className="h-5 w-5 fill-black" />
                Regarder
              </Link>
              <button
                type="button"
                onClick={() => toggleLike(hero)}
                className="inline-flex h-12 items-center gap-2 rounded bg-zinc-900/85 px-5 text-sm font-bold text-white ring-1 ring-white/15 transition hover:bg-zinc-800"
              >
                <Heart
                  className={`h-5 w-5 ${liked[`${hero.mediaType}-${hero.id}`] ? "fill-[#e50914] text-[#e50914]" : ""}`}
                />
                {"J'aime"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="filtres" className="border-y border-white/10 bg-[#0b0b0b]">
        <form className="mx-auto grid max-w-7xl gap-3 px-4 py-5 sm:px-6 md:grid-cols-[1.5fr_repeat(5,1fr)_auto] lg:px-8">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              name="q"
              defaultValue={catalog.filters.query}
              placeholder="Rechercher"
              className="h-11 w-full rounded border border-white/10 bg-white/[0.08] pl-10 pr-3 text-sm text-white outline-none transition focus:border-[#e50914]"
            />
          </label>
          <select name="type" defaultValue={catalog.filters.mediaType ?? ""} className="filter-field">
            <option value="">Tout</option>
            <option value="movie">Films</option>
            <option value="tv">Series</option>
          </select>
          <select name="genre" defaultValue={catalog.filters.genre ?? ""} className="filter-field">
            <option value="">Genre</option>
            {GENRES.map((genre) => (
              <option key={genre.id} value={genre.id}>
                {genre.name}
              </option>
            ))}
          </select>
          <input
            name="yearFrom"
            defaultValue={catalog.filters.yearFrom}
            placeholder="Depuis"
            inputMode="numeric"
            className="filter-field"
          />
          <input
            name="yearTo"
            defaultValue={catalog.filters.yearTo}
            placeholder="Jusqu'a"
            inputMode="numeric"
            className="filter-field"
          />
          <select
            name="language"
            defaultValue={catalog.filters.language ?? ""}
            className="filter-field"
          >
            <option value="">Langue</option>
            {LANGUAGES.map((language) => (
              <option key={language.id} value={language.id}>
                {language.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded bg-[#e50914] px-4 text-sm font-bold text-white transition hover:bg-[#f6121d]"
          >
            {isPending ? <SlidersHorizontal className="h-4 w-4 animate-pulse" /> : <Filter className="h-4 w-4" />}
            Filtrer
          </button>
        </form>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="mb-10">
            <h2 className="mb-4 text-xl font-bold tracking-normal">{section.title}</h2>
            <div className="scrollbar-none grid auto-cols-[150px] grid-flow-col gap-3 overflow-x-auto pb-2 sm:auto-cols-[190px]">
              {section.items.map((item) => (
                <article key={`${section.id}-${item.mediaType}-${item.id}`} className="group">
                  <Link
                    href={`/watch/${item.mediaType}/${item.id}`}
                    className="block overflow-hidden rounded bg-zinc-900 ring-1 ring-white/10 transition duration-200 hover:scale-[1.03] hover:ring-white/30"
                  >
                    <div className="aspect-[2/3] bg-zinc-900">
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt={item.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="poster-fallback flex h-full w-full items-end p-3">
                          <span className="text-sm font-black leading-tight">{item.title}</span>
                        </div>
                      )}
                    </div>
                    <div className="min-h-20 p-3">
                      <h3 className="line-clamp-2 text-sm font-bold leading-5">{item.title}</h3>
                      <p className="mt-1 text-xs text-zinc-400">
                        {yearOf(item.releaseDate)} · {item.voteAverage.toFixed(1)}
                      </p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleLike(item)}
                    className="mt-2 inline-flex h-8 w-8 items-center justify-center rounded bg-zinc-900 text-zinc-200 ring-1 ring-white/10 transition hover:text-white"
                    aria-label="J'aime"
                  >
                    <Heart
                      className={`h-4 w-4 ${liked[`${item.mediaType}-${item.id}`] ? "fill-[#e50914] text-[#e50914]" : ""}`}
                    />
                  </button>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function progressToCatalogItem(progress: WatchProgress): CatalogItem {
  return {
    id: progress.tmdbId,
    mediaType: progress.mediaType,
    title: progress.title,
    overview: "",
    posterPath: progress.posterPath,
    backdropPath: progress.backdropPath,
    posterUrl: progress.posterPath ? `https://image.tmdb.org/t/p/w342${progress.posterPath}` : null,
    backdropUrl: progress.backdropPath
      ? `https://image.tmdb.org/t/p/w1280${progress.backdropPath}`
      : null,
    releaseDate: null,
    voteAverage: progress.durationSeconds
      ? Math.round((progress.progressSeconds / progress.durationSeconds) * 100) / 10
      : 0,
    genreIds: [],
    originalLanguage: "",
  };
}

function yearOf(date: string | null) {
  return date ? date.slice(0, 4) : "CineVerse";
}
