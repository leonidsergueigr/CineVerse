"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Clapperboard,
  LoaderCircle,
  Search,
  Tv,
  UserRound,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { GENRES, LANGUAGES, SERIES_GENRES } from "@/lib/genres";
import type { SearchSuggestion } from "@/lib/types";

type MenuKind = "movie" | "tv" | "anime";

type Props = {
  query?: string;
  fixed?: boolean;
};

export function SiteHeader({ query, fixed = true }: Props) {
  const [openMenu, setOpenMenu] = useState<MenuKind | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
        setMobileSearchOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenu(null);
        setMobileSearchOpen(false);
      }
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
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:gap-5 sm:px-6 lg:gap-10 lg:px-8">
        <Link
          href="/"
          onClick={() => {
            setOpenMenu(null);
            setMobileSearchOpen(false);
          }}
          className="text-base font-black tracking-[0.1em] text-[#e50914] sm:text-2xl sm:tracking-[0.16em]"
        >
          CineVerse
        </Link>

        <div className="hidden w-full max-w-xl md:block">
          <SearchBox key={query ?? "empty"} query={query} />
        </div>

        <div className="flex h-full min-w-0 items-center">
          <button
            type="button"
            onClick={() => {
              setMobileSearchOpen((open) => !open);
              setOpenMenu(null);
            }}
            aria-label="Rechercher"
            aria-expanded={mobileSearchOpen}
            className={`mr-0.5 inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-full transition md:hidden ${
              mobileSearchOpen
                ? "bg-white text-black"
                : "text-zinc-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Search className="h-4 w-4" />
          </button>
          <nav className="flex h-full min-w-0 items-center gap-0 text-[11px] font-medium text-zinc-300 sm:gap-1 sm:text-sm">
          <NavMenuButton
            label="Films"
            open={openMenu === "movie"}
            onClick={() => {
              setMobileSearchOpen(false);
              setOpenMenu((current) =>
                current === "movie" ? null : "movie",
              );
            }}
          />
          <NavMenuButton
            label="Series"
            open={openMenu === "tv"}
            onClick={() => {
              setMobileSearchOpen(false);
              setOpenMenu((current) => (current === "tv" ? null : "tv"));
            }}
          />
          <NavMenuButton
            label="Animes"
            open={openMenu === "anime"}
            onClick={() => {
              setMobileSearchOpen(false);
              setOpenMenu((current) =>
                current === "anime" ? null : "anime",
              );
            }}
          />
          </nav>
        </div>
      </div>

      {mobileSearchOpen ? (
        <div className="absolute inset-x-0 top-full border-b border-white/10 bg-[#090909] p-3 shadow-2xl md:hidden">
          <SearchBox
            key={query ?? "empty"}
            query={query}
            autoFocus
            onNavigate={() => setMobileSearchOpen(false)}
          />
        </div>
      ) : null}

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
      className={`inline-flex h-full min-w-0 items-center gap-1 border-b-2 px-1.5 transition sm:gap-1.5 sm:px-3 ${
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

function SearchBox({
  query,
  autoFocus = false,
  onNavigate,
}: {
  query?: string;
  autoFocus?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const suggestionsId = useId();
  const [value, setValue] = useState(query ?? "");
  const [items, setItems] = useState<SearchSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const suggestionGroups = useMemo(() => {
    const titles = items.filter((item) => item.kind !== "person");
    const people = items.filter((item) => item.kind === "person");
    return [
      ...(titles.length ? [{ label: "Titres", items: titles }] : []),
      ...(people.length ? [{ label: "Personnes", items: people }] : []),
    ];
  }, [items]);
  const displayedItems = useMemo(
    () => suggestionGroups.flatMap((group) => group.items),
    [suggestionGroups],
  );

  function closeSuggestions(blurInput = false) {
    requestRef.current?.abort();
    requestRef.current = null;
    setOpen(false);
    setLoading(false);
    setActiveIndex(-1);
    if (blurInput) inputRef.current?.blur();
  }

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!formRef.current?.contains(event.target as Node)) {
        closeSuggestions();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  useEffect(() => {
    const search = value.trim();
    requestRef.current?.abort();
    if (search.length < 2) return;

    const timer = window.setTimeout(() => {
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      void fetch(`/api/search/suggestions?q=${encodeURIComponent(search)}`, {
        signal: controller.signal,
      })
        .then((response) =>
          response.ok
            ? (response.json() as Promise<{ items?: SearchSuggestion[] }>)
            : { items: [] },
        )
        .then((payload) => {
          if (controller.signal.aborted) return;
          setItems(payload.items ?? []);
          setOpen(true);
          setActiveIndex(-1);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 220);

    return () => window.clearTimeout(timer);
  }, [value]);

  function navigate(href: string) {
    closeSuggestions(true);
    onNavigate?.();
    router.push(href);
  }

  return (
    <form
      ref={formRef}
      action="/browse"
      role="search"
      className="relative w-full"
      onSubmit={(event) => {
        event.preventDefault();
        const search = value.trim();
        if (!search) {
          closeSuggestions(true);
          return;
        }
        if (activeIndex >= 0 && displayedItems[activeIndex]) {
          navigate(displayedItems[activeIndex].href);
          return;
        }
        navigate(`/browse?q=${encodeURIComponent(search)}`);
      }}
    >
      <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-500" />
      <input
        ref={inputRef}
        name="q"
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="Titre, acteur, realisateur..."
        aria-label="Rechercher un film, une serie ou une personne"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && value.trim().length >= 2}
        aria-controls={suggestionsId}
        aria-activedescendant={
          activeIndex >= 0
            ? `${suggestionsId}-option-${activeIndex}`
            : undefined
        }
        onFocus={() => {
          if (value.trim().length >= 2) setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          const nextValue = event.target.value;
          setValue(nextValue);
          if (nextValue.trim().length < 2) {
            setItems([]);
            closeSuggestions();
          }
        }}
        onKeyDown={(event) => {
          if (!open || !displayedItems.length) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex(
              (index) => (index + 1) % displayedItems.length,
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex(
              (index) =>
                index <= 0 ? displayedItems.length - 1 : index - 1,
            );
          } else if (event.key === "Escape") {
            closeSuggestions(true);
          }
        }}
        className="h-11 w-full rounded-full border border-white/15 bg-[#191919] pl-11 pr-11 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-white/35 focus:bg-[#202020]"
      />
      {loading ? (
        <LoaderCircle className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-500" />
      ) : null}

      {open && value.trim().length >= 2 ? (
        <div
          id={suggestionsId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+8px)] z-50 max-h-[min(68vh,34rem)] overflow-y-auto rounded border border-white/15 bg-[#111] p-1.5 shadow-2xl"
        >
          {suggestionGroups.map((group) => (
            <div key={group.label} role="presentation">
              <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase text-zinc-500">
                {group.label}
              </div>
              {group.items.map((item) => {
                const index = displayedItems.indexOf(item);
                return (
                  <button
                    key={`${item.kind}-${item.id}`}
                    id={`${suggestionsId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => navigate(item.href)}
                    className={`grid min-h-16 w-full grid-cols-[42px_minmax(0,1fr)] items-center gap-3 rounded px-2 py-1.5 text-left transition ${
                      activeIndex === index
                        ? "bg-white/10"
                        : "hover:bg-white/[0.07]"
                    }`}
                  >
                    <span className="grid h-14 w-[42px] place-items-center overflow-hidden rounded bg-zinc-900 ring-1 ring-white/10">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : item.kind === "movie" ? (
                        <Clapperboard className="h-4 w-4 text-zinc-500" />
                      ) : item.kind === "tv" ? (
                        <Tv className="h-4 w-4 text-zinc-500" />
                      ) : (
                        <UserRound className="h-4 w-4 text-zinc-500" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-white">
                        {item.title}
                      </span>
                      <span className="mt-1 block truncate text-xs text-zinc-500">
                        {item.subtitle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {!loading && !items.length ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-500">
              Aucun resultat proche
            </div>
          ) : null}
          <button
            type="submit"
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(-1)}
            className="mt-1 flex h-10 w-full items-center justify-center rounded border-t border-white/10 text-xs font-bold text-zinc-300 transition hover:bg-white/[0.07] hover:text-white"
          >
            Tous les resultats pour “{value.trim()}”
          </button>
        </div>
      ) : null}
    </form>
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
    <div className="absolute inset-x-0 top-full border-b border-white/10 bg-[#050505]/[.985] shadow-2xl backdrop-blur-2xl">
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
