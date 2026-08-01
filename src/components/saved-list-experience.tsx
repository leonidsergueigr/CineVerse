"use client";

import Link from "next/link";
import { BookmarkMinus, Clapperboard, Star } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { SiteHeader } from "@/components/site-header";
import type { CatalogItem } from "@/lib/types";

type SortMode = "recent" | "az" | "type";

export function SavedListExperience({
  initialItems,
}: {
  initialItems: CatalogItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [sort, setSort] = useState<SortMode>("recent");
  const [removingKey, setRemovingKey] = useState("");
  const [, startTransition] = useTransition();
  const sortedItems = useMemo(() => {
    if (sort === "az") {
      return [...items].sort((left, right) =>
        left.title.localeCompare(right.title, "fr"),
      );
    }
    if (sort === "type") {
      return [...items].sort((left, right) =>
        left.mediaType.localeCompare(right.mediaType),
      );
    }
    return items;
  }, [items, sort]);

  function removeFromList(item: CatalogItem) {
    const key = `${item.mediaType}:${item.id}`;
    const previousItems = items;
    setRemovingKey(key);
    setItems((current) =>
      current.filter(
        (candidate) =>
          candidate.id !== item.id || candidate.mediaType !== item.mediaType,
      ),
    );

    startTransition(() => {
      void fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tmdbId: item.id,
          mediaType: item.mediaType,
          title: item.title,
          posterPath: item.posterPath,
          backdropPath: item.backdropPath,
          included: false,
        }),
      })
        .then((response) => {
          if (!response.ok) setItems(previousItems);
        })
        .catch(() => setItems(previousItems))
        .finally(() => setRemovingKey(""));
    });
  }

  return (
    <main className="min-h-screen bg-[#050505] pt-16 text-white">
      <SiteHeader />
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-6">
          <div>
            <p className="text-xs font-bold uppercase text-zinc-500">
              Profil actif
            </p>
            <h1 className="mt-1 text-3xl font-black sm:text-4xl">Ma liste</h1>
            <p className="mt-2 text-sm text-zinc-500">
              {items.length
                ? `${items.length} titre${items.length > 1 ? "s" : ""} enregistre${items.length > 1 ? "s" : ""}.`
                : "Aucun titre enregistre pour ce profil."}
            </p>
          </div>

          {items.length > 1 ? (
            <div
              className="grid grid-cols-3 overflow-hidden rounded border border-white/10"
              aria-label="Trier Ma liste"
            >
              {(
                [
                  ["recent", "Ajouts"],
                  ["az", "A-Z"],
                  ["type", "Type"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSort(value)}
                  aria-pressed={sort === value}
                  className={`h-9 min-w-20 px-3 text-xs font-bold transition ${
                    sort === value
                      ? "bg-white text-black"
                      : "bg-white/[0.04] text-zinc-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {sortedItems.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {sortedItems.map((item) => {
              const key = `${item.mediaType}:${item.id}`;
              return (
                <article key={key} className="group relative min-w-0">
                  <Link
                    href={`/watch/${item.mediaType}/${item.id}`}
                    className="block overflow-hidden rounded bg-zinc-900 ring-1 ring-white/10 transition duration-200 hover:-translate-y-1 hover:shadow-2xl hover:ring-white/30"
                  >
                    <div className="poster-fallback relative aspect-[2/3] overflow-hidden">
                      <span className="absolute inset-x-3 bottom-3 line-clamp-3 text-sm font-black text-white/60">
                        {item.title}
                      </span>
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt={item.title}
                          loading="lazy"
                          className="relative h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : null}
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/75 to-transparent" />
                      {item.voteCount > 0 && item.voteAverage > 0 ? (
                        <span className="absolute left-2 top-2 inline-flex h-8 items-center gap-1 rounded bg-black/85 px-2 text-xs font-black ring-1 ring-white/20">
                          <Star className="h-3.5 w-3.5 fill-[#f5c542] text-[#f5c542]" />
                          {item.voteAverage.toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                    <div className="min-h-24 p-3">
                      <h2 className="line-clamp-2 min-h-10 text-sm font-bold leading-5">
                        {item.title}
                      </h2>
                      <p className="mt-1 text-xs text-zinc-500">
                        {item.releaseDate?.slice(0, 4) || "Date inconnue"} ·{" "}
                        {item.mediaType === "movie" ? "Film" : "Serie"}
                      </p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeFromList(item)}
                    disabled={removingKey === key}
                    className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded bg-black/85 text-zinc-200 shadow-lg ring-1 ring-white/20 transition hover:bg-white hover:text-black disabled:opacity-50"
                    aria-label={`Retirer ${item.title} de Ma liste`}
                    title="Retirer de Ma liste"
                  >
                    <BookmarkMinus className="h-4 w-4" />
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid min-h-80 place-items-center border border-dashed border-white/10 bg-white/[0.02] px-6 text-center">
            <div>
              <Clapperboard className="mx-auto h-8 w-8 text-zinc-600" />
              <h2 className="mt-4 text-xl font-bold">Votre liste est vide</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
                Ajoutez un film ou une serie depuis sa fiche. Les titres seront
                conserves uniquement pour ce profil.
              </p>
              <Link
                href="/browse"
                className="mt-5 inline-flex h-10 items-center rounded bg-[#e50914] px-4 text-sm font-bold text-white transition hover:bg-[#f6121d]"
              >
                Explorer le catalogue
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
