import type { EmbedProvider } from "@/lib/types";
import type {
  PlaybackState,
  ProviderTrackingCapabilities,
  TrackingMethod,
} from "@/lib/watch-tracking";

export type ProviderPlaybackSignal = {
  currentTime: number;
  duration: number;
  progressPercent: number | null;
  playbackState: PlaybackState;
  ended: boolean;
  creditsReached?: boolean;
  watchedSeconds?: number | null;
  seeking?: boolean;
  buffering?: boolean;
  trackingMethod?: TrackingMethod;
  observerSessionId?: string;
  observerSequence?: number;
};

export const CINEVERSE_COMPANION_SOURCE = "cineverse-companion";

export type ProviderTrackingAdapter = {
  capabilities: ProviderTrackingCapabilities;
  parseMessage(data: unknown): ProviderPlaybackSignal | null;
  isReadyMessage(data: unknown): boolean;
};

const NO_CAPABILITIES: ProviderTrackingCapabilities = {
  progress: false,
  playState: false,
  endedEvent: false,
  postMessage: false,
};

export function createProviderTrackingAdapter(
  provider?: EmbedProvider,
): ProviderTrackingAdapter {
  const capabilities = provider?.trackingCapabilities ??
    (provider?.supportsTracking
      ? {
          progress: true,
          playState: true,
          endedEvent: true,
          postMessage: true,
        }
      : NO_CAPABILITIES);
  return {
    capabilities,
    parseMessage: capabilities.postMessage ? parseGenericMessage : () => null,
    isReadyMessage: capabilities.postMessage ? isReadyMessage : () => false,
  };
}

function parseGenericMessage(data: unknown): ProviderPlaybackSignal | null {
  if (typeof data === "string") {
    return isEndedEvent(data)
      ? {
          currentTime: 0,
          duration: 0,
          progressPercent: 1,
          playbackState: "paused",
          ended: true,
        }
      : null;
  }
  if (!data || typeof data !== "object") return null;

  const root = data as Record<string, unknown>;
  const nested = recordOrNull(root.data) ??
    recordOrNull(root.detail) ??
    recordOrNull(root.info);
  const message = nested ? { ...root, ...nested } : root;
  const eventName = String(
    message.type ?? message.event ?? message.action ?? "",
  ).toLowerCase();
  const currentTime = finiteNumber(message.currentTime ?? message.time);
  const duration = finiteNumber(message.duration ?? message.total);
  const rawPercentage = finiteNumber(
    message.percentage ?? message.percent ?? message.pct ?? message.progress,
  );
  const progressPercent = rawPercentage > 0
    ? Math.min(1, rawPercentage > 1 ? rawPercentage / 100 : rawPercentage)
    : duration > 0 && currentTime >= 0
      ? Math.min(1, currentTime / duration)
      : null;
  const ended =
    isEndedEvent(eventName) ||
    Number(recordOrNull(message.info)?.playerState) === 0 ||
    (progressPercent ?? 0) >= 0.999;
  const paused =
    eventName === "pause" ||
    (eventName === "updateplaypausebutton" && message.isPlaying === false);
  const playing =
    eventName === "play" ||
    eventName === "playing" ||
    message.isPlaying === true ||
    (currentTime > 0 && duration > 0 && !paused);

  if (!ended && !paused && !playing && progressPercent === null) return null;
  return {
    currentTime,
    duration,
    progressPercent,
    playbackState: ended || paused ? "paused" : playing ? "playing" : "unknown",
    ended,
    trackingMethod: "provider-message",
  };
}

export function isCineVerseCompanionMessage(data: unknown) {
  const envelope = recordOrNull(data);
  return (
    envelope?.source === CINEVERSE_COMPANION_SOURCE &&
    envelope.version === 1
  );
}

export function isCineVerseCompanionReadyMessage(data: unknown) {
  const envelope = recordOrNull(data);
  return isCineVerseCompanionMessage(data) && envelope?.type === "ready";
}

export function parseCineVerseCompanionMessage(
  data: unknown,
  expectedDurationSeconds?: number | null,
): ProviderPlaybackSignal | null {
  const envelope = recordOrNull(data);
  if (
    !isCineVerseCompanionMessage(data) ||
    envelope?.type !== "media-state"
  ) {
    return null;
  }
  const payload = recordOrNull(envelope.payload);
  if (!payload) return null;

  const currentTime = finiteNumber(payload.currentTime);
  const duration = finiteNumber(payload.duration);
  const expectedDuration = finiteNumber(expectedDurationSeconds);
  if (duration <= 0 || currentTime < 0 || !isPlausibleRuntime(duration, expectedDuration)) {
    return null;
  }

  const videoWidth = finiteNumber(payload.videoWidth);
  const videoHeight = finiteNumber(payload.videoHeight);
  if (
    videoWidth > 0 &&
    videoHeight > 0 &&
    videoWidth * videoHeight < 256 * 144
  ) {
    return null;
  }

  const rawPlaybackState = String(payload.playbackState ?? "unknown");
  const playbackState: PlaybackState =
    rawPlaybackState === "playing" ||
    rawPlaybackState === "paused" ||
    rawPlaybackState === "buffering"
      ? rawPlaybackState
      : "unknown";
  const ended = payload.ended === true;
  return {
    currentTime,
    duration,
    progressPercent: Math.min(1, currentTime / duration),
    playbackState: ended ? "paused" : playbackState,
    ended,
    watchedSeconds: finiteNumber(payload.watchedSeconds),
    seeking: payload.seeking === true,
    buffering: payload.buffering === true,
    trackingMethod: "browser-extension",
    observerSessionId: String(payload.observerInstanceId ?? "").slice(0, 96),
    observerSequence: Math.floor(finiteNumber(payload.sequence)),
  };
}

function isReadyMessage(data: unknown) {
  if (!data || typeof data !== "object") return false;
  const message = data as Record<string, unknown>;
  const eventName = String(
    message.action ?? message.event ?? message.type ?? "",
  ).toLowerCase();
  return [
    "videoloaded",
    "playerready",
    "durationupdate",
    "play",
    "timeupdate",
    "currenttime",
    "updateplaypausebutton",
  ].includes(eventName);
}

function isEndedEvent(value: string) {
  return [
    "ended",
    "videoended",
    "videocompleted",
    "complete",
    "completed",
  ].includes(value.toLowerCase());
}

function recordOrNull(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function isPlausibleRuntime(duration: number, expectedDuration: number) {
  if (!expectedDuration) return duration >= 90;
  const ratio = duration / expectedDuration;
  return ratio >= 0.5 && ratio <= 1.75;
}
