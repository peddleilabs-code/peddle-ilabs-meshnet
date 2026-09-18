# MeshNet Architecture

## v0.1 — Foundation

The first layer defines the resource model and the idea that learning content should be usable without continuous connectivity.

Core concepts:

- local resources
- metadata
- resource identity
- offline-first operation

## v0.2 — Local Network

The second layer introduces local peer awareness and resource exchange.

The network is treated as a local community environment rather than assuming that every device has an independent internet connection.

## v0.3 — Peer-to-Peer Transport

v0.3 introduces WebRTC DataChannels.

```text
Control plane:
Browser A -> signaling server -> Browser B

Data plane:
Browser A <======== WebRTC DataChannel ========> Browser B
```

The signaling server forwards negotiation information only. Resource payloads are transferred directly between peers after the data channel is established.

## v0.4 — Resource Network

v0.4 introduces:

1. Resource manifests
2. SHA-256 content IDs
3. Chunked transfer
4. Transfer state
5. Missing-chunk requests
6. Local persistence
7. Integrity verification
8. Peer resource advertisement
9. Store-and-forward foundations

### Resource identity

```text
content
   |
   v
SHA-256
   |
   v
contentId
```

### Resumable transfer

```text
Manifest
   |
   v
Check local cache
   |
   +---- complete ----> use resource
   |
   +---- partial -----> request missing chunks
   |
   +---- absent ------> request all chunks
                            |
                            v
                       verify SHA-256
                            |
                            v
                       commit cache
```

### Store-and-forward

```text
A has R
  |
  | transfer
  v
B caches R
  |
  | advertises R
  v
C requests R
  |
  v
B transfers R
```

v0.4 does not implement automatic routing between arbitrary nodes. It establishes the data and persistence primitives required for that later layer.
