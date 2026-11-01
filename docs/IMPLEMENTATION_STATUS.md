# Implementation Status

Audit of the repository as it stood before the v0.5 work. Each item was checked against the code, not against the version documentation.

## Implemented

- **Signaling server** (`server/server.js`): HTTP `GET /health` returns `{ ok, service, version }`.
- **Room join and presence**: clients join a room with a peer ID; existing members are reported to the newcomer and the newcomer is announced to existing members; `peer-left` is sent on disconnect.
- **SDP and ICE relay**: `offer`, `answer` and `ice` messages are forwarded to a named peer in the same room. Verified with a two-client smoke test.
- **Static web shell** (`web/`): a page with a room field, a join button, a status line and a peer list populated from signaling messages.

## Partially implemented

- **Peer discovery**: presence works, but the peer ID is supplied by the client, is not validated, and is not persisted. Any client can claim any ID.
- **Device identity**: the web client generates a random UUID on every page load. Nothing is persisted, so identity changes on refresh.
- **Health endpoint**: exists, but reports no real state (room count, peer count, uptime).

## Broken

- **Server startup and port**: the web client hard-codes port `8080` and the server defaults to it. Serving the web app from any other origin or proxy fails silently.
- **Error handling in the client**: `JSON.parse` on incoming messages is not wrapped; a malformed message stops the handler.
- **Offer/answer relay trusts input**: the server forwards arbitrary JSON, adds a `from` field, and does not check message size, rate, or room membership beyond the room lookup.
- **Documentation overstates the code**: `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/VERSION_HISTORY.md` and the v0.3/v0.4 READMEs describe WebRTC data channels, chunked transfer, missing-chunk requests, IndexedDB cache, SHA-256 verification and store-and-forward. None of this exists in the code.

## Missing

- **WebRTC connection manager**: no `RTCPeerConnection` anywhere in the web client. Peers are listed but never connected.
- **Data channels and message protocol**: no typed messages, no validation of peer-supplied JSON.
- **Resource model and content IDs**: no resource type, no SHA-256 hashing, no manifests.
- **Resource library and local cache**: the Resources section is static text. No IndexedDB usage.
- **Chunking, resumable transfers, verification, transfer manager**: none.
- **Store-and-forward and re-advertisement**: none.
- **Learning layer, recommendation engine, progress tracking**: none.
- **Power/SchoolBox abstractions, telemetry, i18n, dashboards**: none.
- **Live device location and map**: none.
- **Tests**: `tests/` contains only a README listing intended tests. No test runner is configured.
- **Build tooling**: no root `package.json`, no Vite, no TypeScript, no Dockerfile, no `.env.example`. The root `package-lock.json` is an empty stub.
- **Deployment**: no Docker files or production configuration.

## Errors recorded during audit

- `server/` had no installed dependencies; `npm install` in `server/` now succeeds (express 4.x, ws 8.x).
- `node --check server/server.js` passes on Node v22.23.1.
- Signaling smoke test (two clients, join, presence, offer relay, health) passes.
- No web client test was run: the environment has no browser, so the page was only read, not exercised.

## Planned

Work follows the phase order in the master development prompt, starting with the core data models and typed protocol, then the WebRTC connection manager and the transfer and cache layers. The live location feature is planned after the peer dashboard, per the prompt's implementation order.
