const CHANNEL = "cineverse-media-observer-v1";
const states = new WeakMap();
const observerInstanceId = crypto.randomUUID();
let nextMediaId = 1;
const MAX_FOREGROUND_SAMPLE_GAP_SECONDS = 45;
const MAX_BACKGROUND_SAMPLE_GAP_SECONDS = 300;

const IMMEDIATE_EVENTS = new Set([
  "play",
  "playing",
  "pause",
  "waiting",
  "stalled",
  "seeking",
  "seeked",
  "ended",
  "loadedmetadata",
  "durationchange",
  "ratechange",
]);

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof Element) scan(node);
    }
  }
});
startObserving();
setInterval(() => {
  for (const video of document.querySelectorAll("video")) {
    if (!video.paused && !video.ended) emit(video, "sample", false);
  }
}, 1_000);

document.addEventListener("visibilitychange", () => {
  for (const video of document.querySelectorAll("video")) {
    emit(video, "visibilitychange", true);
  }
});
window.addEventListener("pagehide", () => {
  for (const video of document.querySelectorAll("video")) {
    emit(video, "pagehide", true);
  }
});

function scan(root) {
  if (root instanceof HTMLVideoElement) attach(root);
  for (const video of root.querySelectorAll?.("video") ?? []) attach(video);
}

function startObserving() {
  scan(document);
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return;
  }
  document.addEventListener("readystatechange", startObserving, { once: true });
}

function attach(video) {
  if (states.has(video)) return;
  states.set(video, {
    id: `media-${nextMediaId++}`,
    watchedSeconds: 0,
    lastCurrentTime: finite(video.currentTime),
    lastSampleAt: performance.now(),
    lastEmitAt: 0,
    wasPaused: video.paused,
    wasSeeking: video.seeking,
    wasBuffering: !video.paused && video.readyState < 3,
    sequence: 0,
  });

  for (const eventName of [
    ...IMMEDIATE_EVENTS,
    "timeupdate",
    "progress",
    "canplay",
  ]) {
    video.addEventListener(eventName, () => {
      emit(video, eventName, IMMEDIATE_EVENTS.has(eventName));
    });
  }
  emit(video, "attached", true);
}

function emit(video, eventName, immediate) {
  const state = states.get(video);
  if (!state) return;
  const now = performance.now();
  const currentTime = finite(video.currentTime);
  const duration = finiteDuration(video.duration);
  const wallDelta = Math.max(0, (now - state.lastSampleAt) / 1000);
  const mediaDelta = currentTime - state.lastCurrentTime;
  const playbackRate = Math.max(0.25, finite(video.playbackRate) || 1);
  const seekEvent = eventName === "seeking" || eventName === "seeked";
  const playedWallSeconds = mediaDelta / playbackRate;
  const maximumSampleGap = document.visibilityState === "hidden"
    ? MAX_BACKGROUND_SAMPLE_GAP_SECONDS
    : MAX_FOREGROUND_SAMPLE_GAP_SECONDS;
  const plausibleMediaDelta =
    mediaDelta > 0 &&
    wallDelta > 0 &&
    wallDelta <= maximumSampleGap &&
    playedWallSeconds <= wallDelta + 2.5;

  if (
    !state.wasPaused &&
    !state.wasSeeking &&
    !state.wasBuffering &&
    !seekEvent &&
    !video.seeking &&
    plausibleMediaDelta
  ) {
    state.watchedSeconds += Math.min(wallDelta, playedWallSeconds);
  }

  const buffering =
    !video.paused &&
    !video.ended &&
    (eventName === "waiting" || eventName === "stalled" || video.readyState < 3);

  state.lastCurrentTime = currentTime;
  state.lastSampleAt = now;
  state.wasPaused = video.paused;
  state.wasSeeking = video.seeking || eventName === "seeking";
  state.wasBuffering = buffering;

  if (!immediate && now - state.lastEmitAt < 1_000) return;
  state.lastEmitAt = now;
  state.sequence += 1;

  const playbackState = video.ended
    ? "paused"
    : buffering
      ? "buffering"
      : video.paused
        ? "paused"
        : "playing";

  chrome.runtime
    .sendMessage({
      channel: CHANNEL,
      kind: "media-state",
      payload: {
        mediaElementId: state.id,
        observerInstanceId,
        eventName,
        sequence: state.sequence,
        observedAt: Date.now(),
        currentTime,
        duration,
        watchedSeconds: round(state.watchedSeconds),
        playbackRate,
        playbackState,
        ended: video.ended || eventName === "ended",
        seeking: video.seeking || seekEvent,
        buffering,
        readyState: video.readyState,
        documentVisible: document.visibilityState === "visible",
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        muted: video.muted,
        volume: finite(video.volume),
        pageOrigin: window.location.origin,
        pagePath: window.location.pathname,
      },
    })
    .catch(() => undefined);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function finiteDuration(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
