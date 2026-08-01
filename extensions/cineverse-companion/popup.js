const CHANNEL = "cineverse-companion-popup-v1";
const labels = {
  playing: "Lecture en cours",
  paused: "Lecture en pause",
  buffering: "Chargement de la video",
  seeking: "Deplacement dans la video",
  ended: "Lecture terminee",
  idle: "Aucun lecteur detecte",
};

document.querySelector("#version").textContent =
  `Version ${chrome.runtime.getManifest().version}`;

void refresh();
const refreshTimer = setInterval(refresh, 1_000);
window.addEventListener("unload", () => clearInterval(refreshTimer));

async function refresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const status = tab?.id
    ? await chrome.runtime.sendMessage({
        channel: CHANNEL,
        kind: "get-status",
        tabId: tab.id,
      }).catch(() => null)
    : null;
  render(status);
}

function render(status) {
  const details = document.querySelector("#details");
  const dot = document.querySelector("#status-dot");
  if (!status?.connected || !status.payload) {
    details.hidden = true;
    dot.className = "status-dot idle";
    text("state", labels.idle);
    text("provider", "Lancez une video dans CineVerse");
    return;
  }

  const payload = status.payload;
  const state = payload.ended
    ? "ended"
    : payload.seeking
      ? "seeking"
      : String(payload.playbackState || "idle");
  const duration = finite(payload.duration);
  const currentTime = finite(payload.currentTime);
  const percent = duration > 0 ? Math.min(100, currentTime / duration * 100) : 0;

  details.hidden = false;
  dot.className = `status-dot ${state}`;
  text("state", labels[state] || "Etat du lecteur inconnu");
  text("provider", hostname(payload.pageOrigin));
  text("position", formatTime(currentTime));
  text("duration", formatTime(duration));
  text("watched", formatTime(finite(payload.watchedSeconds)));
  text("rate", `${finite(payload.playbackRate) || 1}x`);
  text("signal-age", relativeAge(status.receivedAt));
  text("event-name", String(payload.eventName || "-").slice(0, 32));
  text(
    "buffering",
    `${Math.floor(finite(payload.bufferingCount))} · ${formatTime(finite(payload.bufferingSeconds))}`,
  );
  text("seeks", String(Math.floor(finite(payload.seekCount))));
  text(
    "startup",
    finite(payload.startupMilliseconds) > 0
      ? `${(finite(payload.startupMilliseconds) / 1000).toFixed(1)} s`
      : "-",
  );
  text(
    "quality",
    finite(payload.videoHeight) > 0 ? `${Math.round(finite(payload.videoHeight))}p` : "-",
  );
  document.querySelector("#progress-fill").style.width = `${percent}%`;
}

function text(id, value) {
  document.querySelector(`#${id}`).textContent = value;
}

function hostname(value) {
  try {
    return new URL(String(value)).hostname;
  } catch {
    return "Provider detecte";
  }
}

function relativeAge(timestamp) {
  const seconds = Math.max(0, Math.round((Date.now() - finite(timestamp)) / 1000));
  return seconds < 2 ? "maintenant" : `il y a ${seconds} s`;
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(remaining)}`
    : `${pad(minutes)}:${pad(remaining)}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}
