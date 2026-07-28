"use client";

import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GENRES, LANGUAGES, SERIES_GENRES } from "@/lib/genres";

type MenuKind = "movie" | "tv" | "anime";

type Props = {
  query?: string;
  fixed?: boolean;
};

export function SiteHeader({ query, fixed = true }: Props) {
  const [openMenu, setOpenMenu] = useState<MenuKind | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setOpenMenu(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <header
      ref={headerRef}
      className={`${fixed ? "fixed" : "sticky"} inset-x-0 top-0 z-30 border-b border-white/10 bg-[#070707]/95 backdrop-blur-xl`}
    >
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4 sm:gap-5 sm:px-6 lg:gap-10 lg:px-8">
        <Link
          href="/"
          onClick={() => setOpenMenu(null)}
          className="text-lg font-black tracking-[0.16em] text-[#e50914] sm:text-2xl"
        >
          CineVerse
        </Link>

        <form action="/browse" className="relative hidden w-full max-w-xl md:block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Titre, acteur, realisateur..."
            className="h-10 w-full rounded-full border border-white/15 bg-white/[0.07] pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-[#e50914] focus:bg-white/[0.1]"
          />
        </form>

        <nav className="flex h-full items-center gap-0.5 text-xs font-medium text-zinc-300 sm:gap-1 sm:text-sm">
          <NavMenuButton
            label="Films"
            open={openMenu === "movie"}
            onClick={() => setOpenMenu((current) => (current === "movie" ? null : "movie"))}
          />
          <NavMenuButton
            label="Series"
            open={openMenu === "tv"}
            onClick={() => setOpenMenu((current) => (current === "tv" ? null : "tv"))}
          />
          <NavMenuButton
            label="Animes"
            open={openMenu === "anime"}
            onClick={() =>
              setOpenMenu((current) => (current === "anime" ? null : "anime"))
            }
          />
        </nav>
      </div>

      {openMenu ? (
        <BrowseMenu menu={openMenu} onNavigate={() => setOpenMenu(null)} />
      ) : null}
    </header>
  );
}

function NavMenuButton({
  label,
  open,
  onClick,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`inline-flex h-full items-center gap-1.5 border-b-2 px-1.5 transition sm:px-3 ${
        open
          ? "border-[#e50914] text-white"
          : "border-transparent text-zinc-300 hover:text-white"
      }`}
    >
      {label}
      <ChevronDown
        className={`hidden h-4 w-4 transition sm:block ${open ? "rotate-180" : ""}`}
      />
    </button>
  );
}

function BrowseMenu({
  menu,
  onNavigate,
}: {
  menu: MenuKind;
  onNavigate: () => void;
}) {
  const isAnime = menu === "anime";
  const mediaType = menu === "movie" ? "movie" : "tv";
  const isMovie = mediaType === "movie";
  const genres = isMovie ? GENRES : SERIES_GENRES;
  const label = isAnime ? "animes" : isMovie ? "films" : "series";
  const title = isAnime ? "Animes" : isMovie ? "Films" : "Series";

  return (
    <div className="absolute inset-x-0 top-full border-b border-white/10 bg-black/95 shadow-2xl">
      <div className="mx-auto max-h-[calc(100vh-5rem)] max-w-6xl overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-bold uppercase text-zinc-500">Explorer</p>
            <h2 className="mt-1 text-lg font-bold text-white">{title}</h2>
          </div>
          <MenuLink href={menuHref(menu)} onNavigate={onNavigate} prominent>
            Tous les {label}
          </MenuLink>
        </div>

        <div className="grid gap-px overflow-hidden rounded border border-white/10 bg-white/10 md:grid-cols-[1.15fr_.9fr_.9fr_.75fr]">
          <MenuColumn title="Par genre">
            <div className="grid gap-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              {genres.map((genre) => (
                <MenuLink
                  key={genre.id}
                  href={menuHref(menu, { genre: String(genre.id) })}
                  onNavigate={onNavigate}
                >
                  {genre.name}
                </MenuLink>
              ))}
            </div>
          </MenuColumn>

          {isAnime ? (
            <MenuColumn title="Catalogue">
              <MenuLink href={menuHref(menu)} onNavigate={onNavigate}>
                Tous les animes
              </MenuLink>
              <MenuLink
                href={menuHref(menu, { sort: "popular" })}
                onNavigate={onNavigate}
              >
                Les plus populaires
              </MenuLink>
              <MenuLink
                href={menuHref(menu, { minRating: "8", sort: "rating" })}
                onNavigate={onNavigate}
              >
                Les mieux notes
              </MenuLink>
              <MenuLink
                href={menuHref(menu, { yearFrom: "2025", sort: "new" })}
                onNavigate={onNavigate}
              >
                Nouveautes
              </MenuLink>
            </MenuColumn>
          ) : (
            <MenuColumn title="Par langue">
              <MenuLink href={menuHref(menu)} onNavigate={onNavigate}>
                Toutes les langues
              </MenuLink>
              {LANGUAGES.map((language) => (
                <MenuLink
                  key={language.id}
                  href={menuHref(menu, { originalLanguage: language.id })}
                  onNavigate={onNavigate}
                >
                  {language.name}
                </MenuLink>
              ))}
            </MenuColumn>
          )}

          <MenuColumn title="Selections">
            {!isAnime ? (
              <MenuLink
                href={menuHref(menu, { catalog: "new", sort: "new" })}
                onNavigate={onNavigate}
              >
                Nouveautes {isMovie ? "Films" : "Series"}
              </MenuLink>
            ) : null}
            <MenuLink
              href={menuHref(menu, { minRating: "8", sort: "rating" })}
              onNavigate={onNavigate}
            >
              Tres bien notes
            </MenuLink>
            <MenuLink
              href={menuHref(menu, {
                yearFrom: "2026",
                yearTo: "2026",
                sort: "new",
              })}
              onNavigate={onNavigate}
            >
              Nouveautes 2026
            </MenuLink>
            <MenuLink
              href={menuHref(menu, { yearFrom: "2025", yearTo: "2025" })}
              onNavigate={onNavigate}
            >
              Sorties 2025
            </MenuLink>
            <MenuLink
              href={menuHref(menu, {
                genre: isAnime ? "10759" : isMovie ? "16" : "10759",
              })}
              onNavigate={onNavigate}
            >
              {isAnime ? "Action & Aventure" : isMovie ? "Animation" : "Action & Aventure"}
            </MenuLink>
          </MenuColumn>

          <MenuColumn title="Par annee">
            {[2026, 2025, 2024, 2023, 2022, 2021].map((year) => (
              <MenuLink
                key={year}
                href={menuHref(menu, {
                  yearFrom: String(year),
                  yearTo: String(year),
                })}
                onNavigate={onNavigate}
              >
                {year}
              </MenuLink>
            ))}
          </MenuColumn>
        </div>
      </div>
    </div>
  );
}

function menuHref(menu: MenuKind, values: Record<string, string> = {}) {
  const params = new URLSearchParams({
    type: menu === "movie" ? "movie" : "tv",
  });
  if (menu === "anime") params.set("catalog", "anime");
  Object.entries(values).forEach(([key, value]) => params.set(key, value));
  return `/browse?${params.toString()}`;
}

function MenuColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#121212] p-4">
      <h3 className="mb-3 border-b border-[#e50914]/50 pb-2 text-xs font-black uppercase text-zinc-400">
        {title}
      </h3>
      <div className="grid gap-1">{children}</div>
    </section>
  );
}

function MenuLink({
  href,
  children,
  onNavigate,
  prominent = false,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate: () => void;
  prominent?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex min-h-8 items-center rounded px-2 text-sm transition ${
        prominent
          ? "bg-[#e50914] px-4 font-bold text-white hover:bg-[#f6121d]"
          : "text-zinc-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
