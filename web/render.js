import { PeerState } from "./meshPeerConnection.js";

const STATE_LABELS = {
  [PeerState.DISCOVERING]: "Discovered",
  [PeerState.CONNECTING]: "Connecting",
  [PeerState.CONNECTED]: "Connected",
  [PeerState.DISCONNECTED]: "Disconnected",
  [PeerState.FAILED]: "Failed",
};

export function displayDeviceId(peerId) {
  return `MN-${peerId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function resourceItem(resource, note) {
  const item = element("li", "resource");
  item.append(
    element("strong", "", resource.title),
    element("span", "meta", `${formatBytes(resource.size)} · ${resource.mimeType}`),
    element("code", "", resource.contentId),
    element("span", "meta", note),
  );
  return item;
}

function emptyItem(text) {
  return element("li", "empty", text);
}

export function renderLocalResources(container, entries) {
  const items = entries.map(({ resource }) =>
    resourceItem(resource, "Shared with connected devices. Contents are not transferred yet."),
  );
  container.replaceChildren(...(items.length ? items : [emptyItem("No files shared yet.")]));
}

function locationSummary(location) {
  if (!location) return "Not sharing location.";
  const time = new Date(location.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `Sharing location, accurate to about ${Math.round(location.accuracy)} m, updated ${time}.`;
}

function peerItem(peerId, entry) {
  const item = element("li", "peer");
  const header = element("div", "peer-header");
  const badge = element("span", `badge state-${entry.state.toLowerCase()}`, STATE_LABELS[entry.state]);
  header.append(element("h3", "", displayDeviceId(peerId)), badge);
  item.append(header);

  if (entry.error) item.append(element("p", "error", entry.error));

  if (entry.state !== PeerState.CONNECTED) return item;

  item.append(element("p", "meta", locationSummary(entry.location)));

  if (entry.resources === null) {
    item.append(element("p", "meta", "Waiting for the resource list."));
  } else if (entry.resources.length === 0) {
    item.append(element("p", "meta", "This device is not sharing any files."));
  } else {
    const list = element("ul", "list nested");
    list.append(
      ...entry.resources.map((resource) =>
        resourceItem(resource, "Offered by this device. Not verified until its contents are received."),
      ),
    );
    item.append(list);
  }
  return item;
}

export function renderPeers(container, peers) {
  const items = [...peers].map(([peerId, entry]) => peerItem(peerId, entry));
  container.replaceChildren(...(items.length ? items : [emptyItem("No other devices connected yet.")]));
}
