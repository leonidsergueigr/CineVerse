import "server-only";

import type { EmbedProvider, MediaDetails, MediaType } from "@/lib/types";

type ProviderMediaInfo = {
  providerId: string;
  title: string | null;
  year: number | null;
  posterUrl: string | null;
  languages: string[];
};

type AvailabilityResponse = {
  available?: boolean;
  detectedType?: string;
  title?: string;
  year?: number;
  poster?: string;
  languages?: string[];
};

export async function resolveProvidersForMedia(
  providers: EmbedProvider[],
  tmdbId: number,
  mediaType: MediaType,
) {
  const checks = await Promise.all(
    providers.map(async (provider) => ({
      provider,
      info: await checkAvailability(provider, tmdbId, mediaType),
    })),
  );

  const resolvedProviders = checks
    .filter(({ info }) => info !== false)
    .map(({ provider, info }) => {
      if (!info || !info.languages.length) return provider;
      return {
        ...provider,
        languages: info.languages.map(toLanguageOption),
      };
    });
  const mediaInfo =
    checks
      .map(({ info }) => info)
      .find((info): info is ProviderMediaInfo => typeof info === "object" && info !== null) ??
    null;

  return {
    providers: resolvedProviders,
    mediaInfo,
  };
}

export function applyProviderMetadata(
  detail: MediaDetails,
  info: ProviderMediaInfo | null,
): MediaDetails {
  if (detail.metadataSource !== "fallback" || !info) return detail;

  return {
    ...detail,
    title: info.title || detail.title,
    overview: "Ce contenu est disponible chez le provider. Les metadonnees TMDB completes sont temporairement indisponibles.",
    posterUrl: info.posterUrl || detail.posterUrl,
    releaseDate: info.year ? `${info.year}-01-01` : detail.releaseDate,
    metadataSource: "provider",
  };
}

async function checkAvailability(
  provider: EmbedProvider,
  tmdbId: number,
  mediaType: MediaType,
): Promise<ProviderMediaInfo | false | null> {
  if (!provider.availabilityApi) return null;

  const url = provider.availabilityApi.replace(
    /\{tmdbId\}/g,
    encodeURIComponent(String(tmdbId)),
  );

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as AvailabilityResponse;
    if (data.available === false) return false;
    if (data.available !== true || !matchesMediaType(data.detectedType, mediaType)) return null;

    return {
      providerId: provider.id,
      title: data.title?.trim() || null,
      year: Number.isFinite(data.year) ? Number(data.year) : null,
      posterUrl: isHttpUrl(data.poster) ? data.poster || null : null,
      languages: Array.isArray(data.languages)
        ? data.languages.filter((language): language is string => typeof language === "string")
        : [],
    };
  } catch (error) {
    console.error(`Provider availability failed for ${provider.id}`, error);
    return null;
  }
}

function matchesMediaType(detectedType: string | undefined, mediaType: MediaType) {
  if (!detectedType) return true;
  const normalized = detectedType.toLowerCase();
  if (mediaType === "movie") return ["movie", "film"].includes(normalized);
  return ["tv", "serie", "series", "show"].includes(normalized);
}

function toLanguageOption(language: string) {
  const id = language.trim().toLowerCase();
  const labels: Record<string, string> = {
    vf: "VF",
    vostfr: "VOSTFR",
    vo: "VO",
  };
  return { id, label: labels[id] ?? id.toUpperCase() };
}

function isHttpUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
