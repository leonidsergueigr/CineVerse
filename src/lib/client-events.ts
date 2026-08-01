import type { MediaType, ViewingEventType } from "@/lib/types";

type ClientEvent = {
  eventType: ViewingEventType;
  tmdbId?: number;
  mediaType?: MediaType;
  title?: string;
  posterPath?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  genreIds?: number[];
  metadata?: Record<string, unknown>;
};

export function trackClientEvent(event: ClientEvent) {
  void fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      ...event,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    }),
  }).catch(() => undefined);
}
