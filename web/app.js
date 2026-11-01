import { createResourceFromFile } from "./resourceModel.js";
import { decodeMessage, encodeMessage, MESSAGE_TYPES, PROTOCOL_VERSION, validateSignal } from "./protocol.js";
import { MeshPeerConnection, PeerState } from "./meshPeerConnection.js";
import { watchDeviceLocation } from "./deviceLocation.js";
import { createLocationMap } from "./locationMap.js";
import { displayDeviceId, renderLocalResources, renderPeers } from "./render.js";
import {
  clearLastLocation,
  createThrottledSaver,
  getOrCreateDeviceKey,
  loadLastLocation,
  readSharingPreference,
  saveLastLocation,
  writeSharingPreference,
} from "./locationStore.js";
import { SIGNALING_PORT } from "./serverConfig.js";

const DEFAULT_ROOM = "meshnet-demo";

const elements = {
  room: document.querySelector("#room"),
  join: document.querySelector("#join"),
  status: document.querySelector("#status"),
  deviceId: document.querySelector("#device-id"),
  share: document.querySelector("#share"),
  shareStatus: document.querySelector("#share-status"),
  localResources: document.querySelector("#local-resources"),
  peers: document.querySelector("#peers"),
  locationToggle: document.querySelector("#location-toggle"),
  locationStatus: document.querySelector("#location-status"),
  map: document.querySelector("#map"),
};

const localPeerId = crypto.randomUUID();
const deviceKey = getOrCreateDeviceKey();
const localResources = [];
const peers = new Map();
let signaling = null;
let localLocation = null;
let stopWatchingLocation = null;
const locationMap = createLocationMap(elements.map);
const locationSaver = createThrottledSaver(persistLocation);

elements.deviceId.textContent = displayDeviceId(localPeerId);
refreshViews();
if (readSharingPreference()) startSharingLocation();
void restoreLastLocation();

elements.join.addEventListener("click", () => (signaling ? leaveRoom() : joinRoom()));
elements.share.addEventListener("change", shareSelectedFile);
elements.locationToggle.addEventListener("click", () => (stopWatchingLocation ? stopSharingLocation() : startSharingLocation()));

function setStatus(text) {
  elements.status.textContent = text;
}

function refreshViews() {
  renderPeers(elements.peers, peers);
  locationMap?.update(mapDevices());
}

function mapDevices() {
  const devices = [];
  if (localLocation) {
    devices.push({
      id: localPeerId,
      label: `${displayDeviceId(localPeerId)} (you)`,
      isSelf: true,
      ...localLocation,
    });
  }
  for (const [peerId, entry] of peers) {
    if (entry.location) {
      devices.push({ id: peerId, label: displayDeviceId(peerId), isSelf: false, ...entry.location });
    }
  }
  return devices;
}

function joinRoom() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const host = location.hostname || "localhost";
  const roomId = elements.room.value.trim() || DEFAULT_ROOM;
  const socket = new WebSocket(`${protocol}://${host}:${SIGNALING_PORT}`);

  signaling = socket;
  elements.join.textContent = "Leave network";
  setStatus("Connecting to the signaling server...");

  socket.onopen = () => socket.send(JSON.stringify({ type: "join", roomId, peerId: localPeerId }));
  socket.onmessage = ({ data }) => handleSignalingMessage(data);
  socket.onerror = () => {
    if (signaling === socket) setStatus("The signaling server is unavailable.");
  };
  socket.onclose = () => {
    if (signaling !== socket) return;
    signaling = null;
    resetRoom("Disconnected from the signaling server.");
  };
}

function leaveRoom() {
  const socket = signaling;
  signaling = null;
  socket.close();
  resetRoom("Disconnected.");
}

function resetRoom(message) {
  closeAllPeers();
  elements.join.textContent = "Join network";
  setStatus(message);
}

function handleSignalingMessage(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }
  if (!message || typeof message !== "object") return;

  switch (message.type) {
    case "joined":
      setStatus("Joined the room. Waiting for other devices.");
      break;
    case "peer-present":
      onPeerAppeared(message.peerId, true);
      break;
    case "peer-joined":
      onPeerAppeared(message.peerId, false);
      break;
    case "peer-left":
      removePeer(message.peerId);
      break;
    case "offer":
    case "answer":
    case "ice":
      routeSignal(message);
      break;
    case "error":
      setStatus(`Signaling error: ${String(message.error)}`);
      break;
  }
}

function onPeerAppeared(remotePeerId, isInitiator) {
  if (typeof remotePeerId !== "string" || remotePeerId === localPeerId) return;
  removePeer(remotePeerId);
  createPeer(remotePeerId, isInitiator);
}

function createPeer(remotePeerId, isInitiator) {
  const connection = new MeshPeerConnection({
    remotePeerId,
    isInitiator,
    sendSignal,
    onStateChange: (change) => handlePeerState(remotePeerId, change),
    onMessage: (raw) => handlePeerMessage(remotePeerId, raw),
  });
  peers.set(remotePeerId, {
    connection,
    state: PeerState.DISCOVERING,
    error: null,
    resources: null,
    location: null,
  });
  refreshViews();
  void connection.start();
}

function removePeer(remotePeerId) {
  const entry = peers.get(remotePeerId);
  if (!entry) return;
  peers.delete(remotePeerId);
  entry.connection.close();
  refreshViews();
}

function closeAllPeers() {
  for (const remotePeerId of [...peers.keys()]) removePeer(remotePeerId);
}

function sendSignal(signal) {
  if (signaling?.readyState !== WebSocket.OPEN) return;
  signaling.send(JSON.stringify(signal));
}

function routeSignal(message) {
  let signal;
  try {
    signal = validateSignal(message);
  } catch (error) {
    console.warn(error.message);
    return;
  }

  let entry = peers.get(signal.from);
  if (signal.type === "offer" && (!entry || entry.state !== PeerState.CONNECTED)) {
    removePeer(signal.from);
    createPeer(signal.from, false);
    entry = peers.get(signal.from);
  }
  entry?.connection.handleSignal(signal);
}

function handlePeerState(remotePeerId, { state, reason }) {
  const entry = peers.get(remotePeerId);
  if (!entry) return;
  entry.state = state;
  entry.error = reason;
  if (state === PeerState.CONNECTED) {
    sendManifest(entry.connection);
    sendLocation(entry.connection);
  } else {
    entry.resources = null;
    entry.location = null;
  }
  refreshViews();
}

function handlePeerMessage(remotePeerId, raw) {
  let message;
  try {
    message = decodeMessage(raw);
  } catch (error) {
    console.warn(error.message);
    return;
  }
  const entry = peers.get(remotePeerId);
  if (!entry) return;

  if (message.type === MESSAGE_TYPES.MANIFEST) {
    entry.resources = message.payload.resources;
  } else if (message.type === MESSAGE_TYPES.LOCATION) {
    entry.location = message.payload.location;
  }
  refreshViews();
}

function sendManifest(connection) {
  connection.send(
    encodeMessage(MESSAGE_TYPES.MANIFEST, {
      protocolVersion: PROTOCOL_VERSION,
      resources: localResources.map(({ resource }) => resource),
    }),
  );
}

function broadcastManifest() {
  for (const entry of peers.values()) {
    if (entry.state === PeerState.CONNECTED) sendManifest(entry.connection);
  }
}

function sendLocation(connection) {
  connection.send(encodeMessage(MESSAGE_TYPES.LOCATION, { location: localLocation }));
}

function broadcastLocation() {
  for (const entry of peers.values()) {
    if (entry.state === PeerState.CONNECTED) sendLocation(entry.connection);
  }
}

async function restoreLastLocation() {
  try {
    const saved = await loadLastLocation(deviceKey);
    if (!saved) return;
    if (stopWatchingLocation) {
      localLocation ??= saved;
      broadcastLocation();
      refreshViews();
      return;
    }
    elements.locationStatus.textContent = `Last known location saved ${new Date(saved.capturedAt).toLocaleString()}. Sharing is off.`;
  } catch (error) {
    if (!stopWatchingLocation) {
      elements.locationStatus.textContent = `Could not load your last known location: ${error.message}`;
    }
  }
}

function persistLocation(location) {
  saveLastLocation(deviceKey, location).catch((error) => {
    elements.locationStatus.textContent = `Your location could not be saved: ${error.message}`;
  });
}

function startSharingLocation() {
  writeSharingPreference(true);
  elements.locationToggle.textContent = "Stop sharing location";
  elements.locationStatus.textContent = "Finding your location...";
  stopWatchingLocation = watchDeviceLocation({
    onPosition: (position) => {
      localLocation = position;
      elements.locationStatus.textContent = "Sharing your location with connected devices.";
      locationSaver.schedule(position);
      broadcastLocation();
      refreshViews();
    },
    onError: (message) => {
      elements.locationStatus.textContent = message;
    },
  });
}

function stopSharingLocation() {
  stopWatchingLocation();
  stopWatchingLocation = null;
  locationSaver.cancel();
  writeSharingPreference(false);
  localLocation = null;
  elements.locationToggle.textContent = "Share my location";
  elements.locationStatus.textContent = "Location sharing is off.";
  broadcastLocation();
  refreshViews();
  clearLastLocation(deviceKey).catch((error) => {
    elements.locationStatus.textContent = `Your saved location could not be cleared: ${error.message}`;
  });
}

async function shareSelectedFile() {
  const file = elements.share.files?.[0];
  elements.share.value = "";
  if (!file) return;

  elements.shareStatus.textContent = `Preparing ${file.name}...`;
  try {
    localResources.push(await createResourceFromFile(file));
    renderLocalResources(elements.localResources, localResources);
    broadcastManifest();
    elements.shareStatus.textContent = `Shared ${file.name}.`;
  } catch (error) {
    elements.shareStatus.textContent = error.message;
  }
}
