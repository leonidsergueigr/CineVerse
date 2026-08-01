const INPUT_CHANNEL = "cineverse-media-observer-v1";
const OUTPUT_CHANNEL = "cineverse-companion-bridge-v1";
const POPUP_CHANNEL = "cineverse-companion-popup-v1";
const COMMAND_CHANNEL = "cineverse-companion-command-v1";
const candidatesByTab = new Map();
const activeCandidateByTab = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.channel === POPUP_CHANNEL && message?.kind === "get-status") {
    sendResponse(statusForTab(Number(message.tabId)));
    return;
  }
  if (
    message?.channel === COMMAND_CHANNEL &&
    message?.kind === "player-command" &&
    sender.tab?.id
  ) {
    const tabId = sender.tab.id;
    const active = activeCandidateByTab.get(tabId);
    const candidate = active
      ? candidatesByTab.get(tabId)?.get(active.key)
      : undefined;
    if (candidate) {
      chrome.tabs.sendMessage(
        tabId,
        {
          channel: INPUT_CHANNEL,
          kind: "player-command",
          payload: {
            ...message.payload,
            mediaElementId: candidate.payload?.mediaElementId,
          },
        },
        { frameId: candidate.frameId },
      ).catch(() => undefined);
    }
    return;
  }
  if (
    message?.channel !== INPUT_CHANNEL ||
    message?.kind !== "media-state" ||
    !sender.tab?.id
  ) {
    return;
  }

  const tabId = sender.tab.id;
  const frameId = sender.frameId ?? 0;
  const key = `${frameId}:${String(message.payload?.mediaElementId ?? "video")}`;
  const now = Date.now();
  const candidates = candidatesByTab.get(tabId) ?? new Map();
  candidates.set(key, { receivedAt: now, payload: message.payload, frameId });
  for (const [candidateKey, candidate] of candidates) {
    if (now - candidate.receivedAt > 60_000) candidates.delete(candidateKey);
  }
  candidatesByTab.set(tabId, candidates);

  const currentActive = activeCandidateByTab.get(tabId);
  const selected = selectActiveCandidate(candidates, currentActive?.key, now);
  if (!selected) return;
  activeCandidateByTab.set(tabId, { key: selected.key, updatedAt: now });
  if (selected.key !== key) return;

  chrome.tabs
    .sendMessage(
      tabId,
      {
        channel: OUTPUT_CHANNEL,
        kind: "media-state",
        payload: {
          ...message.payload,
          providerFrameId: frameId,
        },
      },
      { frameId: 0 },
    )
    .catch(() => undefined);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  candidatesByTab.delete(tabId);
  activeCandidateByTab.delete(tabId);
});

function selectActiveCandidate(candidates, currentKey, now) {
  const liveCandidates = [...candidates.entries()]
    .filter(([, candidate]) => now - candidate.receivedAt <= 15_000)
    .map(([key, candidate]) => ({
      key,
      candidate,
      score: candidateScore(candidate.payload),
    }))
    .sort((left, right) => right.score - left.score);
  const best = liveCandidates[0];
  if (!best || !currentKey) return best;

  const current = liveCandidates.find((candidate) => candidate.key === currentKey);
  if (!current) return best;

  // A small hysteresis prevents two concurrent media elements from alternating.
  return current.score + 15 >= best.score ? current : best;
}

function candidateScore(payload) {
  const duration = finite(payload?.duration);
  const width = finite(payload?.videoWidth);
  const height = finite(payload?.videoHeight);
  const area = width * height;
  let score = payload?.playbackState === "playing"
    ? 100
    : payload?.playbackState === "buffering"
      ? 70
      : 20;

  if (duration >= 90) score += 60;
  else if (duration > 0 && duration < 60) score -= 120;

  if (area >= 921_600) score += 50;
  else if (area >= 230_400) score += 35;
  else if (area >= 36_864) score += 15;

  if (payload?.ended === true) score += 30;
  if (payload?.muted === true) score -= 10;
  return score;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function statusForTab(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) {
    return { connected: false, reason: "invalid-tab" };
  }
  const active = activeCandidateByTab.get(tabId);
  const candidate = active
    ? candidatesByTab.get(tabId)?.get(active.key)
    : undefined;
  if (!candidate) return { connected: false, reason: "no-media" };
  return {
    connected: true,
    receivedAt: candidate.receivedAt,
    frameId: candidate.frameId,
    payload: candidate.payload,
  };
}
