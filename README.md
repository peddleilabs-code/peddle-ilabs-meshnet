# Peddle iLabs MeshNet

Peddle iLabs MeshNet is an open-source peer-to-peer learning resource distribution system designed for environments where internet access, electricity, devices, and conventional digital infrastructure are limited.

The project explores a progressive architecture:

- **v0.1 — Foundation:** local learning resources and basic resource handling.
- **v0.2 — Local Network:** discovery and exchange of resources across a local network.
- **v0.3 — Peer-to-Peer Transport:** direct device-to-device communication using WebRTC DataChannels.
- **v0.4 — Resource Network:** content-addressed resources, resumable transfers, persistent local cache, resource discovery, and store-and-forward replication.

## Architecture

```text
                         ┌─────────────────────┐
                         │     SchoolBox       │
                         │ local gateway/cache  │
                         └──────────┬──────────┘
                                    │
                         Local / community network
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
        ┌─────▼─────┐        ┌──────▼──────┐       ┌──────▼──────┐
        │  Device A │◄──────►│   Device B  │◄─────►│   Device C  │
        │  learner  │ WebRTC│ local cache  │ WebRTC│  learner    │
        └───────────┘        └─────────────┘       └─────────────┘
```

The signaling service helps peers find and negotiate connections. Resource payloads are transferred over peer-to-peer data channels after the connection is established.

## Core concepts

### Content IDs

Resources are addressed by SHA-256 content identifiers. The same content produces the same content ID, allowing peers to recognize resources without depending on a central filename or URL.

### Resource manifests

Peers advertise metadata before transferring content:

- resource ID
- content ID
- title
- subject
- level
- language
- MIME type
- size
- version
- license
- checksum

### Resumable transfers

Large resources are transferred in chunks. The receiving peer records completed chunks locally and can request only missing chunks after an interruption.

### Local cache

Resources and transfer state are persisted locally using browser storage. A peer can continue advertising resources after the original source is no longer connected.

### Store-and-forward

A peer that has completely received and verified a resource can advertise it to another peer. This creates the foundation for community-scale resource replication without requiring every learner device to maintain a direct connection to the original source.

## Important technical boundary

MeshNet v0.4 is a peer-to-peer resource distribution layer. It is **not yet a general-purpose multi-hop IP router or radio mesh**.

WebRTC provides peer-to-peer data channels between connected browsers. Network-level internet sharing through a SchoolBox gateway is a separate layer that can be developed above or alongside this resource-distribution protocol.

## Getting started

### Server

```bash
cd server
npm install
npm start
```

The development server listens on port `8080` by default.

### Web application

The web client can be served from the repository's static web directory or through a local development server.

For the v0.3/v0.4 prototype, use a modern browser with WebRTC and IndexedDB support.

## Development roadmap

| Version | Focus |
|---|---|
| v0.1 | Foundation and resource model |
| v0.2 | Local discovery and exchange |
| v0.3 | Direct peer-to-peer transport |
| v0.4 | Content IDs, manifests, resumable transfer, cache, store-and-forward |
| v0.5 | Automatic replication and peer/resource availability |
| v0.6 | Multi-peer scheduling and intelligent distribution |
| v0.7 | SchoolBox gateway and community network integration |

## Open source

This project is released under the MIT License.

Contributions, testing, documentation improvements, hardware integrations, transport experiments, and educational-resource tooling are welcome.

## Project status

MeshNet is an actively evolving prototype. Experimental components are documented explicitly so that measured functionality is not confused with future architecture.
