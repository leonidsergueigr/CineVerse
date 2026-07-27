import type { CatalogItem, MediaDetails } from "@/lib/types";

const fallbackItems: CatalogItem[] = [
  {
    id: 603,
    mediaType: "movie",
    title: "The Matrix",
    overview:
      "Un programmeur decouvre que son monde est une simulation et rejoint une resistance clandestine.",
    posterPath: null,
    backdropPath: null,
    posterUrl: null,
    backdropUrl: null,
    releaseDate: "1999-03-31",
    voteAverage: 8.2,
    genreIds: [28, 878],
    originalLanguage: "en",
  },
  {
    id: 1399,
    mediaType: "tv",
    title: "Game of Thrones",
    overview:
      "Neuf familles nobles luttent pour le controle d'un royaume pendant qu'une menace ancienne se reveille.",
    posterPath: null,
    backdropPath: null,
    posterUrl: null,
    backdropUrl: null,
    releaseDate: "2011-04-17",
    voteAverage: 8.5,
    genreIds: [18, 10765],
    originalLanguage: "en",
  },
  {
    id: 157336,
    mediaType: "movie",
    title: "Interstellar",
    overview:
      "Une equipe franchit un trou de ver pour chercher une nouvelle maison a l'humanite.",
    posterPath: null,
    backdropPath: null,
    posterUrl: null,
    backdropUrl: null,
    releaseDate: "2014-11-05",
    voteAverage: 8.4,
    genreIds: [12, 18, 878],
    originalLanguage: "en",
  },
  {
    id: 76479,
    mediaType: "tv",
    title: "The Boys",
    overview:
      "Un groupe combat des super-heros corrompus proteges par une puissante multinationale.",
    posterPath: null,
    backdropPath: null,
    posterUrl: null,
    backdropUrl: null,
    releaseDate: "2019-07-25",
    voteAverage: 8.4,
    genreIds: [10765, 10759],
    originalLanguage: "en",
  },
  {
    id: 550,
    mediaType: "movie",
    title: "Fight Club",
    overview:
      "Un employe insomniaque rencontre un vendeur de savon charismatique et bascule dans un chaos organise.",
    posterPath: null,
    backdropPath: null,
    posterUrl: null,
    backdropUrl: null,
    releaseDate: "1999-10-15",
    voteAverage: 8.4,
    genreIds: [18],
    originalLanguage: "en",
  },
  {
    id: 66732,
    mediaType: "tv",
    title: "Stranger Things",
    overview:
      "Dans une petite ville, une disparition devoile des experiences secretes et une dimension hostile.",
    posterPath: null,
    backdropPath: null,
    posterUrl: null,
    backdropUrl: null,
    releaseDate: "2016-07-15",
    voteAverage: 8.6,
    genreIds: [18, 9648, 10765],
    originalLanguage: "en",
  },
];

export function fallbackCatalog() {
  return fallbackItems;
}

export function fallbackDetails(mediaType: string, id: number): MediaDetails {
  const item = fallbackItems.find((entry) => entry.id === id && entry.mediaType === mediaType) ?? {
    id,
    mediaType: mediaType === "tv" ? "tv" : "movie",
    title: mediaType === "tv" ? "Serie indisponible" : "Film indisponible",
    overview:
      "Les metadonnees TMDB ne sont pas disponibles pour ce contenu pour le moment.",
    posterPath: null,
    backdropPath: null,
    posterUrl: null,
    backdropUrl: null,
    releaseDate: null,
    voteAverage: 0,
    genreIds: [],
    originalLanguage: "na",
  };

  return {
    ...item,
    metadataSource: "fallback",
    runtime: item.mediaType === "movie" ? 136 : null,
    genres: item.genreIds.map((genreId) => ({ id: genreId, name: String(genreId) })),
    cast: [],
    crew: [],
    seasons:
      item.mediaType === "tv"
        ? [
            { id: 1, name: "Saison 1", seasonNumber: 1, episodeCount: 8 },
            { id: 2, name: "Saison 2", seasonNumber: 2, episodeCount: 8 },
          ]
        : undefined,
  };
}
