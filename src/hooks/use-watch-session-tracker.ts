"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProviderPlaybackSignal } from "@/lib/provider-tracking";
import type {
  WatchSessionIdentity,
  WatchSessionSnapshot,
} from "@/lib/watch-session-service";
import { TRACKING_CONFIG } from "@/lib/watch-tracking";

type Options = {
  active: boolean;
  playbackKey: string;
  identity: Omit<WatchSessionIdentity, "sessionId">;
  onSnapshot?: (snapshot: WatchSessionSnapshot) => void;
};

export function useWatchSessionTracker({
  active,
  playbackKey,
  identity,
  onSnapshot,
}: Options) {
  const [snapshot, setSnapshot] = useState<WatchSessionSnapshot | null>(null);
  const sessionIdRef = useRef("");
  const identityRef = useRef(identity);
  const signalRef = useRef<ProviderPlaybackSignal | null>(null);
  const signalAtRef = useRef(0);
  const onSnapshotRef = useRef(onSnapshot);

  useEffect(() => {
    identityRef.current = identity;
    onSnapshotRef.current = onSnapshot;
  }, [identity, onSnapshot]);

  const acceptSnapshot = useCallback((next: WatchSessionSnapshot | null) => {
    if (!next) return;
    setSnapshot(next);
    onSnapshotRef.current?.(next);
  }, []);

  const request = useCallback(
    async (
      action: "start" | "heartbeat" | "manual-complete" | "unmark",
      extra: Record<string, unknown> = {},
    ) => {
      if (!sessionIdRef.current) sessionIdRef.current = createSessionId();
      const response = await fetch("/api/watch-sessions", {
        method: "POST",
        keepalive: action === "heartbeat",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          ...identityRef.current,
          sessionId: sessionIdRef.current,
          ...extra,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        snapshot?: WatchSessionSnapshot | null;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Suivi de lecture impossible.");
      }
      acceptSnapshot(payload.snapshot ?? null);
      return payload.snapshot ?? null;
    },
    [acceptSnapshot],
  );

  const heartbeat = useCallback(
    (override: Partial<ProviderPlaybackSignal> = {}) => {
      const providerSignalIsFresh =
        Date.now() - signalAtRef.current <=
        TRACKING_CONFIG.maxHeartbeatGapSeconds * 1000;
      const signal = {
        ...(providerSignalIsFresh ? signalRef.current : null),
        ...override,
      };
      return request("heartbeat", {
        sentAt: Date.now(),
        heartbeatId: `${sessionIdRef.current}:${Date.now()}:${randomSuffix()}`,
        documentVisible: document.visibilityState === "visible",
        playbackState: signal.playbackState ?? "unknown",
        providerProgressSeconds: signal.currentTime ?? null,
        providerProgressPercent: signal.progressPercent ?? null,
        providerWatchedSeconds: signal.watchedSeconds ?? null,
        providerSeeking: signal.seeking === true,
        providerEnded: signal.ended === true || signal.creditsReached === true,
        providerObserverSessionId: signal.observerSessionId ?? null,
        providerObserverSequence: signal.observerSequence ?? null,
        trackingMethod: signal.trackingMethod ?? "local-estimate",
        providerEventName: signal.eventName ?? "",
        providerBufferingCount: signal.bufferingCount ?? 0,
        providerBufferingSeconds: signal.bufferingSeconds ?? 0,
        providerSeekCount: signal.seekCount ?? 0,
        providerStartupMilliseconds: signal.startupMilliseconds ?? null,
        providerVideoHeight: signal.videoHeight ?? 0,
        providerError: signal.providerError === true,
        providerErrorCount: signal.errorCount ?? 0,
      });
    },
    [request],
  );

  useEffect(() => {
    if (!active) return;
    sessionIdRef.current = createSessionId();
    signalRef.current = null;
    signalAtRef.current = 0;
    void request("start").catch(() => undefined);

    const timer = window.setInterval(() => {
      void heartbeat().catch(() => undefined);
    }, TRACKING_CONFIG.heartbeatIntervalSeconds * 1000);

    function onVisibilityChange() {
      void heartbeat().catch(() => undefined);
    }
    function onPageHide() {
      if (!sessionIdRef.current) return;
      const signal = signalRef.current;
      const providerSignalIsFresh =
        Date.now() - signalAtRef.current <=
        TRACKING_CONFIG.maxHeartbeatGapSeconds * 1000;
      navigator.sendBeacon(
        "/api/watch-sessions",
        JSON.stringify({
          action: "heartbeat-interrupt",
          ...identityRef.current,
          sessionId: sessionIdRef.current,
          sentAt: Date.now(),
          heartbeatId: `${sessionIdRef.current}:pagehide:${Date.now()}`,
          documentVisible: document.visibilityState === "visible",
          playbackState:
            providerSignalIsFresh ? signal?.playbackState ?? "unknown" : "unknown",
          providerProgressSeconds:
            providerSignalIsFresh ? signal?.currentTime ?? null : null,
          providerProgressPercent:
            providerSignalIsFresh ? signal?.progressPercent ?? null : null,
          providerWatchedSeconds:
            providerSignalIsFresh ? signal?.watchedSeconds ?? null : null,
          providerSeeking: providerSignalIsFresh && signal?.seeking === true,
          providerEnded:
            providerSignalIsFresh &&
            (signal?.ended === true || signal?.creditsReached === true),
          providerObserverSessionId:
            providerSignalIsFresh ? signal?.observerSessionId ?? null : null,
          providerObserverSequence:
            providerSignalIsFresh ? signal?.observerSequence ?? null : null,
          trackingMethod:
            providerSignalIsFresh
              ? signal?.trackingMethod ?? "local-estimate"
              : "local-estimate",
          providerEventName: providerSignalIsFresh ? signal?.eventName ?? "" : "",
          providerBufferingCount:
            providerSignalIsFresh ? signal?.bufferingCount ?? 0 : 0,
          providerBufferingSeconds:
            providerSignalIsFresh ? signal?.bufferingSeconds ?? 0 : 0,
          providerSeekCount: providerSignalIsFresh ? signal?.seekCount ?? 0 : 0,
          providerStartupMilliseconds:
            providerSignalIsFresh ? signal?.startupMilliseconds ?? null : null,
          providerVideoHeight: providerSignalIsFresh ? signal?.videoHeight ?? 0 : 0,
          providerError: providerSignalIsFresh && signal?.providerError === true,
          providerErrorCount:
            providerSignalIsFresh ? signal?.errorCount ?? 0 : 0,
        }),
      );
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      void fetch("/api/watch-sessions", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "interrupt",
          sessionId: sessionIdRef.current,
        }),
      });
    };
  }, [active, heartbeat, playbackKey, request]);

  const reportProviderSignal = useCallback(
    async (signal: ProviderPlaybackSignal) => {
      const previousSignal = signalRef.current;
      if (
        signal.trackingMethod === "browser-extension" &&
        previousSignal?.trackingMethod === "browser-extension" &&
        signal.observerSessionId &&
        signal.observerSessionId === previousSignal.observerSessionId &&
        (signal.observerSequence ?? 0) <= (previousSignal.observerSequence ?? 0)
      ) {
        return null;
      }
      const previousPlaybackState = previousSignal?.playbackState;
      const playbackStateChanged =
        signal.playbackState !== previousPlaybackState;
      const newlyReachedCredits =
        signal.creditsReached === true && previousSignal?.creditsReached !== true;
      const crossedCompletionThreshold =
        (previousSignal?.progressPercent ?? 0) <
          TRACKING_CONFIG.automaticCompletionThreshold &&
        (signal.progressPercent ?? 0) >=
          TRACKING_CONFIG.automaticCompletionThreshold;
      signalRef.current = signal;
      signalAtRef.current = Date.now();
      if (
        signal.ended ||
        newlyReachedCredits ||
        crossedCompletionThreshold ||
        (playbackStateChanged && signal.playbackState === "paused") ||
        (playbackStateChanged && signal.playbackState === "buffering") ||
        (signal.playbackState === "playing" &&
          (previousPlaybackState === "paused" ||
            previousPlaybackState === "buffering"))
      ) {
        return heartbeat(signal);
      }
      return null;
    },
    [heartbeat],
  );

  const markWatched = useCallback(
    () => request("manual-complete"),
    [request],
  );
  const unmarkWatched = useCallback(() => request("unmark"), [request]);

  return {
    snapshot,
    reportProviderSignal,
    markWatched,
    unmarkWatched,
  };
}

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${randomSuffix()}`;
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}
