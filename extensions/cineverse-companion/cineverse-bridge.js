const BRIDGE_CHANNEL = "cineverse-companion-bridge-v1";
const COMMAND_CHANNEL = "cineverse-companion-command-v1";
const PAGE_SOURCE = "cineverse-companion";

if (window.top === window) {
  announce("ready", {
    extensionVersion: chrome.runtime.getManifest().version,
  });

  window.addEventListener("message", (event) => {
    if (
      event.source === window &&
      event.origin === window.location.origin &&
      event.data?.source === "cineverse-app" &&
      event.data?.type === "companion-ping"
    ) {
      announce("ready", {
        extensionVersion: chrome.runtime.getManifest().version,
      });
    }
    if (
      event.source === window &&
      event.origin === window.location.origin &&
      event.data?.source === "cineverse-app" &&
      event.data?.type === "companion-command"
    ) {
      chrome.runtime.sendMessage({
        channel: COMMAND_CHANNEL,
        kind: "player-command",
        payload: event.data.payload,
      }).catch(() => undefined);
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.channel !== BRIDGE_CHANNEL || message?.kind !== "media-state") {
      return;
    }
    announce("media-state", {
      ...message.payload,
      extensionVersion: chrome.runtime.getManifest().version,
    });
  });
}

function announce(type, payload) {
  window.postMessage(
    {
      source: PAGE_SOURCE,
      version: 1,
      type,
      payload,
    },
    window.location.origin,
  );
}
