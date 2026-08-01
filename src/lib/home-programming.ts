import "server-only";

import { randomUUID } from "node:crypto";
import type {
  CatalogItem,
  CatalogSection,
  HomeCatalog,
  RecommendationExposure,
  RecommendationResult,
} from "@/lib/types";

const MAX_SECTIONS = 9;
const MAX_ITEMS_PER_SECTION = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

export function composeHomeProgramming({
  catalog,
  continueWatching,
  watchlist,
  recommendations,
  exposures,
  now = new Date(),
}: {
  catalog: HomeCatalog;
  continueWatching: CatalogItem[];
  watchlist: CatalogItem[];
  recommendations: RecommendationResult;
  exposures: RecommendationExposure[];
  now?: Date;
}): HomeCatalog {
  const sessionId = randomUUID();
  const exposureMap = new Map(
    exposures.map((item) => [
      mediaKey(item.mediaType, item.tmdbId),
      item,
    ]),
  );
  const hour = now.getHours();
  const weekend = [0, 6].includes(now.getDay());
  const contextSeed = hash(`${sessionId}:${hour}:${now.getDay()}`);
  const availableRecommendations = recommendations.items.filter(
    (item) => !isCoolingDown(exposureMap.get(itemKey(item))),
  );
  const availableEditorial = uniqueItems([
    ...catalog.heroCandidates,
    ...catalog.sections.flatMap((section) => section.items),
  ]).filter((item) => !isCoolingDown(exposureMap.get(itemKey(item))));
  const heroPool = chooseHeroPool({
    continueWatching,
    recommendations: availableRecommendations,
    editorial: availableEditorial,
    seed: contextSeed,
  });
  const hero = heroPool[0] ?? catalog.hero;
  const heroReasons = Object.fromEntries(
    heroPool.map((item, index) => [
      itemKey(item),
      heroReason(item, index, continueWatching, recommendations, hour, weekend),
    ]),
  );
  const used = new Set<string>([itemKey(hero)]);
  const sectionCandidates: Array<CatalogSection & { priority: number }> = [];

  if (continueWatching.length) {
    sectionCandidates.push({
      id: "resume",
      title:
        continueWatching.length === 1
          ? `Continuer ${continueWatching[0].title}`
          : "Reprendre la lecture",
      reason: "Vos lectures en cours, au bon episode.",
      items: continueWatching,
      priority: 120,
    });
  }
  if (watchlist.length) {
    sectionCandidates.push({
      id: "watchlist",
      title: "Ma liste",
      reason: "Les titres enregistres dans ce profil.",
      items: watchlist,
      personalized: true,
      priority: 115,
    });
  }
  if (availableRecommendations.length) {
    sectionCandidates.push({
      id: "for-you",
      title: contextTitle(hour, weekend),
      reason: recommendationSectionReason(recommendations, hour),
      items: availableRecommendations,
      personalized: true,
      priority: 110,
    });
  }

  catalog.sections.forEach((section) => {
    const presentation = shelfPresentation(section.id, hour, weekend);
    sectionCandidates.push({
      ...section,
      title: presentation.title,
      reason: presentation.reason,
      priority: presentation.priority,
    });
  });

  const sections = sectionCandidates
    .sort((left, right) => right.priority - left.priority)
    .map((section) => {
      const original = uniqueItems(section.items);
      const respectsExposure =
        section.id !== "resume" && section.id !== "watchlist";
      const eligible = respectsExposure
        ? original.filter(
            (item) => !isCoolingDown(exposureMap.get(itemKey(item))),
          )
        : original;
      const refreshed = refreshShelf(
        eligible.length >= 2 ? eligible : original,
        `${sessionId}:${section.id}`,
        exposureMap,
      );
      const items: CatalogItem[] = [];
      for (const item of refreshed) {
        if (items.length >= MAX_ITEMS_PER_SECTION) break;
        const key = itemKey(item);
        if (used.has(key)) continue;
        items.push(item);
        used.add(key);
      }
      const minimumItems =
        section.id === "resume" || section.id === "watchlist" ? 1 : 2;
      if (items.length < minimumItems) {
        for (const item of refreshed) {
          if (items.length >= minimumItems) break;
          const key = itemKey(item);
          if (
            (key === itemKey(hero) &&
              section.id !== "resume" &&
              section.id !== "watchlist") ||
            items.some((selected) => itemKey(selected) === key)
          ) {
            continue;
          }
          items.push(item);
        }
      }
      return { ...section, items };
    })
    .filter((section) =>
      section.id === "resume" || section.id === "watchlist"
        ? section.items.length >= 1
        : section.items.length >= 2,
    )
    .slice(0, MAX_SECTIONS)
    .map((section) => ({
      id: section.id,
      title: section.title,
      reason: section.reason,
      personalized: section.personalized,
      items: section.items,
    }));

  return {
    ...catalog,
    hero,
    heroCandidates: heroPool,
    heroTrailerUrl:
      itemKey(hero) === itemKey(catalog.hero) ? catalog.heroTrailerUrl : null,
    heroReasons,
    programmingSessionId: sessionId,
    sections,
  };
}

function chooseHeroPool({
  continueWatching,
  recommendations,
  editorial,
  seed,
}: {
  continueWatching: CatalogItem[];
  recommendations: CatalogItem[];
  editorial: CatalogItem[];
  seed: number;
}) {
  const continuation =
    continueWatching.find((item) => item.backdropUrl) ?? continueWatching[0];
  const safe = recommendations.filter((item) => item.backdropUrl);
  const discoveries = editorial.filter((item) => item.backdropUrl);
  const modes = [
    safe,
    continuation ? [continuation, ...safe] : safe,
    [...discoveries.slice(seed % Math.max(1, discoveries.length)), ...safe],
  ];
  return uniqueItems([
    ...(modes[seed % modes.length] ?? safe),
    ...safe,
    ...discoveries,
  ]).slice(0, 8);
}

function refreshShelf(
  items: CatalogItem[],
  seedValue: string,
  exposureMap: Map<string, RecommendationExposure>,
) {
  if (items.length <= 4) return items;
  const ranked = items
    .map((item, index) => ({
      item,
      index,
      exposure: exposureMap.get(itemKey(item)),
    }))
    .sort((left, right) => {
      const leftIgnored = ignoredCount(left.exposure);
      const rightIgnored = ignoredCount(right.exposure);
      if (leftIgnored !== rightIgnored) return leftIgnored - rightIgnored;
      return left.index - right.index;
    })
    .map(({ item }) => item);
  const retained = ranked.slice(0, 3);
  const rotating = ranked.slice(3);
  const offset = hash(seedValue) % Math.max(1, rotating.length);
  return uniqueItems([
    ...retained,
    ...rotating.slice(offset),
    ...rotating.slice(0, offset),
  ]);
}

function shelfPresentation(id: string, hour: number, weekend: boolean) {
  const evening = hour >= 19 || hour < 2;
  const presentations: Record<
    string,
    { title: string; reason: string; priority: number }
  > = {
    "new-movies": {
      title: "Nouveaux films a ne pas manquer",
      reason: "Des sorties recentes, renouvelees entre vos visites.",
      priority: weekend || evening ? 94 : 82,
    },
    "new-series": {
      title: evening ? "Une nouvelle serie pour ce soir" : "Nouvelles series",
      reason: "Des series recentes que vous n'avez pas encore croisees ici.",
      priority: evening && !weekend ? 96 : 88,
    },
    movies: {
      title: weekend
        ? "Films populaires pour le week-end"
        : "Tendances proches de vos envies",
      reason: "Les tendances sont filtrees par votre historique d'exposition.",
      priority: weekend ? 92 : 76,
    },
    series: {
      title: weekend ? "Series pour un marathon" : "Series a poursuivre",
      reason: "Une selection differente des simples tendances generales.",
      priority: weekend ? 90 : 84,
    },
    anime: {
      title: "Animations a decouvrir",
      reason: "Des propositions animees sans saturer le reste de l'accueil.",
      priority: 72,
    },
    mood: {
      title: evening
        ? "Science-fiction pour la soiree"
        : "Une echappee science-fiction",
      reason: "Une rangée d'exploration pour sortir legerement des habitudes.",
      priority: evening ? 86 : 68,
    },
  };
  return (
    presentations[id] ?? {
      title: id,
      reason: "Selection renouvelee pour cette visite.",
      priority: 60,
    }
  );
}

function contextTitle(hour: number, weekend: boolean) {
  if (hour >= 22 || hour < 4) return "Nos meilleurs choix pour maintenant";
  if (weekend) return "Selectionnes pour votre week-end";
  if (hour >= 18) return "Pour votre soiree";
  return "Choisis pour vous";
}

function recommendationSectionReason(
  result: RecommendationResult,
  hour: number,
) {
  const genres = result.profile.topGenres.map((genre) => genre.name).slice(0, 2);
  const timing =
    hour >= 20 || hour < 3 ? "pour cette soiree" : "pour cette visite";
  return genres.length
    ? `${genres.join(" et ")} guident cette selection ${timing}.`
    : `Cette selection apprend de vos lectures et de vos avis ${timing}.`;
}

function heroReason(
  item: CatalogItem,
  index: number,
  continueWatching: CatalogItem[],
  recommendations: RecommendationResult,
  hour: number,
  weekend: boolean,
) {
  if (continueWatching.some((candidate) => itemKey(candidate) === itemKey(item))) {
    return "Votre lecture la plus naturelle a reprendre maintenant.";
  }
  const recommendation = recommendations.items.find(
    (candidate) => itemKey(candidate) === itemKey(item),
  );
  if (recommendation && "reason" in recommendation) {
    return String(recommendation.reason);
  }
  if (index === 0 && weekend) {
    return "Une proposition forte pour votre session du week-end.";
  }
  return hour >= 20 || hour < 3
    ? "Une decouverte renouvelee pour ce soir."
    : "Une proposition fraiche pour cette visite.";
}

function isCoolingDown(exposure: RecommendationExposure | undefined) {
  if (!exposure) return false;
  const ignored = ignoredCount(exposure);
  const cooldown =
    ignored >= 4 ? 14 * DAY_MS : ignored >= 3 ? 7 * DAY_MS : 0;
  return cooldown > 0 && Date.now() - exposure.lastShownAt < cooldown;
}

function ignoredCount(exposure: RecommendationExposure | undefined) {
  return exposure ? Math.max(0, exposure.ignoredCount) : 0;
}

function uniqueItems(items: CatalogItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = itemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function itemKey(item: Pick<CatalogItem, "id" | "mediaType">) {
  return mediaKey(item.mediaType, item.id);
}

function mediaKey(mediaType: string, id: number) {
  return `${mediaType}:${id}`;
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
