import type { EmbedProvider, MediaDetails } from "@/lib/types";

export function getEmbedProviders(): EmbedProvider[] {
  const raw = process.env.CINEVERSE_EMBED_PROVIDERS_JSON;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return demoProviders();
      const providers = parsed.flatMap((value) => {
        const provider = normalizeEmbedProvider(value);
        return provider ? [provider] : [];
      });
      return providers.length
        ? providers.sort((a, b) => a.priority - b.priority)
        : demoProviders();
    } catch {
      return demoProviders();
    }
  }

  return demoProviders();
}

export function getProviderLanguages(provider?: EmbedProvider) {
  if (provider?.languages?.length) return provider.languages;
  if (provider?.supportsLanguage === false) return [{ id: "vo", label: "VO" }];
  return [
    { id: "vf", label: "VF" },
    { id: "vostfr", label: "VOSTFR" },
    { id: "vo", label: "VO" },
  ];
}

export function buildEmbedUrl(
  provider: EmbedProvider,
  detail: Pick<MediaDetails, "id" | "mediaType" | "title">,
  options: {
    language: string;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    autoNext?: boolean;
    autoplay?: boolean;
  },
) {
  const providerMediaType = detail.mediaType === "tv" ? "serie" : "movie";
  const languagePath = options.language === "vo" ? "" : `/${options.language}`;
  const season = String(options.seasonNumber ?? 1);
  const episode = String(options.episodeNumber ?? 1);
  const seasonEpisodePath = detail.mediaType === "tv" ? `/${season}/${episode}` : "";
  const values: Record<string, string> = {
    tmdbId: encodeURIComponent(String(detail.id)),
    mediaType: providerMediaType,
    providerMediaType,
    tmdbMediaType: detail.mediaType,
    title: encodeURIComponent(detail.title),
    language: encodeURIComponent(options.language),
    languagePath,
    season: encodeURIComponent(season),
    episode: encodeURIComponent(episode),
    seasonEpisodePath,
    autoplay: options.autoplay ? "1" : "0",
    autoNext: options.autoNext ? "1" : "0",
  };

  const rendered = provider.template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
  return appendProviderOptions(rendered, provider, options);
}

function appendProviderOptions(
  url: string,
  provider: EmbedProvider,
  options: { autoplay?: boolean; autoNext?: boolean },
) {
  let nextUrl = url;
  if (options.autoplay && provider.customizationOptions?.autoplay) {
    nextUrl = appendOption(nextUrl, provider.customizationOptions.autoplay);
  }
  if (options.autoNext && provider.customizationOptions?.autonext) {
    nextUrl = appendOption(nextUrl, provider.customizationOptions.autonext);
  }
  return nextUrl;
}

function appendOption(url: string, option: string) {
  if (!option) return url;
  const clean = option.replace(/\{(\w+)\}/g, "");
  if (!clean) return url;
  if (!clean.startsWith("?") && !clean.startsWith("&")) return `${url}${clean}`;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${clean.replace(/^[?&]/, "")}`;
}

function normalizeEmbedProvider(value: unknown): EmbedProvider | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    typeof value.template !== "string" ||
    !value.template.trim()
  ) {
    return null;
  }

  const languages = Array.isArray(value.languages)
    ? value.languages.flatMap((language) => {
        if (
          !isRecord(language) ||
          typeof language.id !== "string" ||
          !language.id.trim() ||
          typeof language.label !== "string" ||
          !language.label.trim()
        ) {
          return [];
        }
        return [{ id: language.id.trim(), label: language.label.trim() }];
      })
    : undefined;
  const customizationOptions = isRecord(value.customizationOptions)
    ? Object.fromEntries(
        Object.entries(value.customizationOptions).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === "string",
        ),
      )
    : undefined;

  return {
    id: value.id.trim(),
    name: value.name.trim(),
    template: value.template.trim(),
    availabilityApi:
      typeof value.availabilityApi === "string" &&
      value.availabilityApi.trim()
        ? value.availabilityApi.trim()
        : undefined,
    supportsTracking: value.supportsTracking === true,
    supportsLanguage: value.supportsLanguage !== false,
    priority:
      typeof value.priority === "number" && Number.isFinite(value.priority)
        ? value.priority
        : 100,
    languages: languages?.length ? languages : undefined,
    customizationOptions:
      customizationOptions && Object.keys(customizationOptions).length
        ? customizationOptions
        : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function demoProviders(): EmbedProvider[] {
  return [
    {
      id: "cineverse-demo",
      name: "CineVerse Demo",
      template:
        "/api/demo-player?tmdbId={tmdbId}&mediaType={tmdbMediaType}&title={title}&language={language}&season={season}&episode={episode}",
      supportsTracking: true,
      supportsLanguage: true,
      priority: 1,
    },
  ];
}
