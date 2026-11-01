# Implementation Status

Current state of the repository, checked against the code.

## Implemented

- **Signaling server** (`server/server.js`): HTTP `GET /health`; room join and presence; `peer-left` on disconnect; `offer`, `answer` and `ice` relay to a named peer in the same room.
- **Direct device connection** (`web/meshPeerConnection.js`): one WebRTC data channel per pair of devices, set up over the signaling server. Connection states are DISCOVERING, CONNECTING, CONNECTED, DISCONNECTED and FAILED. A connection that does not open within 20 seconds fails.
- **Typed messages and validation** (`web/protocol.js`): every incoming data-channel message and signaling message is size-checked and validated before use. Unknown fields are dropped.
- **Resource model** (`web/resourceModel.js`): a file shared on this device is fingerprinted with SHA-256 (`sha256:<hex>`) and described with title, MIME type, size, chunk size and chunk count.
- **Manifest exchange**: when two devices connect, each sends the list of resources it shares. Received lists are shown as unverified, because file contents are not transferred yet.
- **Web client** (`web/`): join a room, see connected devices and their state, share a file, see the list of shared files.
- **Resource transfer** (`web/fileTransfer.js`): a connected device can download a file offered in another device's list. Chunks are requested up to eight at a time over the direct connection. The finished file is checked against its SHA-256 fingerprint before a save link appears; a mismatch is discarded. Downloads stop if the connection drops.
- **Tests** (`tests/`, run with `npm test`): 36 unit tests cover content IDs, chunk math, MIME normalization, message and signal validation (including location and chunk messages), and the chunk downloader and its fingerprint check, and the connection state machine using a fake WebRTC connection.
- **Live location map** (`web/locationMap.js`, `web/deviceLocation.js`): opt-in location sharing. Each device's location is sent over its direct connections only and shown on a map with a marker per device. The map uses Leaflet and OpenStreetMap tiles loaded from the internet. Locations are self-reported and not verified.
- **Last known location** (`supabase/functions/device-location/index.ts`, `web/locationStore.js`): while sharing is on, the location is saved to Supabase through an edge function, at most every 30 seconds. A random device key is kept in the browser, and the database stores only a SHA-256 hash of it. On return, the saved location is restored, and sharing resumes if it was on. Stopping sharing deletes the saved location.

## Partially implemented

- **Peer discovery**: the peer ID is supplied by the client and is not validated by the server. Any client can claim any ID.
- **Device identity**: a random ID is generated on each page load and is not saved, so the identity changes on refresh.
- **Signaling port**: the web client connects to port `8080` on the same host. Serving the page from another origin or behind a proxy will not work.
- **Health endpoint**: returns only the service name and version, not room or peer counts.
- **Reconnection**: a connection that fails or drops is not retried automatically. A device must leave and rejoin.

## Not yet verified

- The direct connection and manifest exchange have been unit tested with a fake WebRTC layer only. No real two-browser session has been run, because this environment has no browser.

## Missing

- **Local cache**: nothing is stored. Shared files exist only while the page is open.
- **Store-and-forward**: devices do not re-advertise resources they received.
- **STUN and TURN**: connections use only addresses on the same network. Devices on different networks cannot connect yet.
- **Server-side validation**: the signaling server forwards arbitrary JSON, does not limit message size, and does not check sender identity beyond the room.
- **Learning features**: recommendations, progress tracking, and dashboards.
- **Build and deployment**: no Vite build, no TypeScript, no Dockerfile, no `.env.example`.
- **Documentation**: `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/VERSION_HISTORY.md` and the v0.3 and v0.4 READMEs still describe features that are not built yet.

## Errors recorded during audit

- `server/` had no installed dependencies; `npm install` now succeeds (express 4.x, ws 8.x).
- `node --check server/server.js` passes on Node v22.23.1.
- Signaling smoke test (two clients, join, presence, offer relay, health) passes.
- The incoming-message parsing in the web client was not guarded; it now is.

## Next steps

Connection retries and STUN/TURN configuration for connections across networks. After that: a local cache that keeps shared files between sessions, and server-side validation of signaling messages.
