import type { EmbedProvider, MediaDetails } from "@/lib/types";

export function getEmbedProviders(): EmbedProvider[] {
  const raw = process.env.CINEVERSE_EMBED_PROVIDERS_JSON;
  if (raw) {
    try {
      const providers = JSON.parse(raw) as EmbedProvider[];
      return providers
        .filter((provider) => provider.id && provider.name && provider.template)
        .sort((a, b) => a.priority - b.priority);
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
