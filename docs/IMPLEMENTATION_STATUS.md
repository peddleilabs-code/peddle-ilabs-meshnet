# Implementation Status

Current state of the repository, checked against the code.

## Implemented

- **Signaling server** (`server/server.js`): HTTP `GET /health`; room join and presence; `peer-left` on disconnect; `offer`, `answer` and `ice` relay to a named peer in the same room.
- **Direct device connection** (`web/meshPeerConnection.js`): one WebRTC data channel per pair of devices, set up over the signaling server. Connection states are DISCOVERING, CONNECTING, CONNECTED, DISCONNECTED and FAILED. A connection that does not open within 20 seconds fails.
- **Typed messages and validation** (`web/protocol.js`): every incoming data-channel message and signaling message is size-checked and validated before use. Unknown fields are dropped.
- **Resource model** (`web/resourceModel.js`): a file shared on this device is fingerprinted with SHA-256 (`sha256:<hex>`) and described with title, MIME type, size, chunk size and chunk count.
- **Manifest exchange**: when two devices connect, each sends the list of resources it shares. Received lists are shown as unverified, because file contents are not transferred yet.
- **Web client** (`web/`): join a room, see connected devices and their state, share a file, see the list of shared files.
- **Tests** (`tests/`, run with `npm test`): 22 unit tests cover content IDs, chunk math, MIME normalization, message and signal validation, and the connection state machine using a fake WebRTC connection.

## Partially implemented

- **Peer discovery**: the peer ID is supplied by the client and is not validated by the server. Any client can claim any ID.
- **Device identity**: a random ID is generated on each page load and is not saved, so the identity changes on refresh.
- **Signaling port**: the web client connects to port `8080` on the same host. Serving the page from another origin or behind a proxy will not work.
- **Health endpoint**: returns only the service name and version, not room or peer counts.
- **Reconnection**: a connection that fails or drops is not retried automatically. A device must leave and rejoin.

## Not yet verified

- The direct connection and manifest exchange have been unit tested with a fake WebRTC layer only. No real two-browser session has been run, because this environment has no browser.

## Missing

- **Resource transfer**: no chunk requests, no chunk transfer, no verification of received contents against the declared SHA-256.
- **Local cache**: nothing is stored. Shared files exist only while the page is open.
- **Store-and-forward**: devices do not re-advertise resources they received.
- **STUN and TURN**: connections use only addresses on the same network. Devices on different networks cannot connect yet.
- **Server-side validation**: the signaling server forwards arbitrary JSON, does not limit message size, and does not check sender identity beyond the room.
- **Learning features**: recommendations, progress tracking, and dashboards.
- **Location features**: live device location and map.
- **Build and deployment**: no Vite build, no TypeScript, no Dockerfile, no `.env.example`.
- **Documentation**: `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/VERSION_HISTORY.md` and the v0.3 and v0.4 READMEs still describe features that are not built yet.

## Errors recorded during audit

- `server/` had no installed dependencies; `npm install` now succeeds (express 4.x, ws 8.x).
- `node --check server/server.js` passes on Node v22.23.1.
- Signaling smoke test (two clients, join, presence, offer relay, health) passes.
- The incoming-message parsing in the web client was not guarded; it now is.

## Next steps

Resource transfer over the existing data channel, with chunked requests and SHA-256 verification before a file is stored. After that: a local cache, STUN/TURN configuration for connections across networks, and server-side validation of signaling messages.
