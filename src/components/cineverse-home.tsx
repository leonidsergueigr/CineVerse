"use client";

import Link from "next/link";
import { ChevronRight, Heart, Play, Star } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import type { BrowseCatalog, CatalogItem, HomeCatalog } from "@/lib/types";
import { SiteHeader } from "@/components/site-header";

type Props = {
  catalog: HomeCatalog;
  continueWatching: CatalogItem[];
};

export function CineVerseHome({ catalog, continueWatching }: Props) {
  const [, startTransition] = useTransition();
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const hero = catalog.hero;
  const heroBackground = hero.backdropUrl ?? hero.posterUrl;

  const sections = useMemo(() => {
    return [
      ...(continueWatching.length
        ? [{ id: "resume", title: "Reprendre la lecture", items: continueWatching }]
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
      <SiteHeader />

      <section className="relative min-h-[82vh] overflow-hidden">
        {catalog.heroTrailerUrl ? (
          <iframe
            src={catalog.heroTrailerUrl}
            title={`Trailer ${hero.title}`}
            allow="autoplay; encrypted-media; picture-in-picture"
            className="pointer-events-none absolute inset-0 h-full w-full scale-125 border-0 opacity-70"
          />
        ) : heroBackground ? (
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

      <div id="catalog" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="mb-10">
            <h2 className="mb-4 text-xl font-bold tracking-normal">{section.title}</h2>
            <div className="scrollbar-none grid auto-cols-[150px] grid-flow-col gap-3 overflow-x-auto pb-2 sm:auto-cols-[190px]">
              {section.items.map((item) => (
                <MediaCard
                  key={`${section.id}-${item.mediaType}-${item.id}`}
                  item={item}
                  liked={Boolean(liked[`${item.mediaType}-${item.id}`])}
                  onLike={toggleLike}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

export function BrowseExperience({ catalog }: { catalog: BrowseCatalog }) {
  const [, startTransition] = useTransition();
  const [liked, setLiked] = useState<Record<string, boolean>>({});

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
    <main className="min-h-screen bg-[#050505] pt-16 text-white">
      <SiteHeader query={catalog.filters.query} />

      <div id="catalog" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <FilteredGrid
          items={catalog.items}
          liked={liked}
          onLike={toggleLike}
          filters={catalog.filters}
          currentPage={catalog.page}
          totalPages={catalog.totalPages}
          totalResults={catalog.totalResults}
        />
      </div>
    </main>
  );
}

function FilteredGrid({
  items,
  liked,
  onLike,
  filters,
  currentPage,
  totalPages,
  totalResults,
}: {
  items: CatalogItem[];
  liked: Record<string, boolean>;
  onLike: (item: CatalogItem) => void;
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
            onLike={onLike}
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
  onLike,
  compact = false,
}: {
  item: CatalogItem;
  liked: boolean;
  onLike: (item: CatalogItem) => void;
  compact?: boolean;
}) {
  return (
    <article className="group relative">
      <Link
        href={`/watch/${item.mediaType}/${item.id}`}
        className="block overflow-hidden rounded bg-zinc-900 ring-1 ring-white/10 transition duration-200 hover:scale-[1.03] hover:ring-white/30"
      >
        <div className="relative aspect-[2/3] bg-zinc-900">
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
          <div className="absolute left-2 top-2 inline-flex h-8 items-center gap-1 rounded bg-black/85 px-2 text-xs font-black text-white shadow-lg ring-1 ring-white/20 backdrop-blur">
            <Star className="h-3.5 w-3.5 fill-[#f5c542] text-[#f5c542]" />
            {item.voteCount > 0 || item.voteAverage > 0
              ? item.voteAverage.toFixed(1)
              : "N/A"}
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
        </div>
        <div className={compact ? "min-h-16 p-2" : "min-h-20 p-3"}>
          <h3 className="line-clamp-2 text-sm font-bold leading-5">{item.title}</h3>
          <p className="mt-1 text-xs text-zinc-400">
            {yearOf(item.releaseDate)} · {item.mediaType === "movie" ? "Film" : "Serie"}
          </p>
        </div>
      </Link>
      <button
        type="button"
        onClick={() => onLike(item)}
        className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded bg-black/85 text-zinc-100 shadow-lg ring-1 ring-white/20 backdrop-blur transition hover:bg-[#e50914] hover:text-white"
        aria-label="J'aime"
      >
        <Heart className={`h-4 w-4 ${liked ? "fill-[#e50914] text-[#e50914]" : ""}`} />
      </button>
    </article>
  );
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
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.mediaType) params.set("type", filters.mediaType);
  if (filters.genre) params.set("genre", filters.genre);
  if (filters.yearFrom) params.set("yearFrom", filters.yearFrom);
  if (filters.yearTo) params.set("yearTo", filters.yearTo);
  if (filters.minRating) params.set("minRating", filters.minRating);
  if (filters.originalLanguage) params.set("originalLanguage", filters.originalLanguage);
  if (filters.person) params.set("person", filters.person);
  if (filters.personName) params.set("personName", filters.personName);
  if (filters.sort) params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
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
