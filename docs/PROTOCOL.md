# MeshNet Resource Protocol

## Manifest

A resource manifest follows this conceptual structure:

```json
{
  "resourceId": "resource-opaque-id",
  "contentId": "sha256:<hex>",
  "title": "Example lesson",
  "subject": "Science",
  "level": "Basic",
  "language": "en",
  "mimeType": "application/pdf",
  "size": 1048576,
  "chunkSize": 16384,
  "totalChunks": 64,
  "version": 1,
  "license": "CC-BY-4.0"
}
```

## Control messages

Typical control messages include:

- `manifest`
- `resource-list`
- `resource-request`
- `transfer-start`
- `chunk-request`
- `transfer-complete`
- `transfer-error`
- `peer-resources`

## Transfer

A device downloads a file by asking for its chunks one at a time, up to eight requests at once. Each message is sent over the existing direct connection:

- `chunk-request` with `{ contentId, index }`: asks the file's owner for one chunk.
- `chunk` with `{ contentId, index, data }`: carries one chunk, base64-encoded. Chunks are 16 KB before encoding.
- `chunk-unavailable` with `{ contentId, index }`: the owner no longer has that file or chunk, and the download stops.

A chunk is accepted only if it was requested and has the expected size. The receiver keeps completed chunks in memory until the whole file has arrived.

## Integrity

The final reconstructed resource must match the advertised SHA-256 content ID before it is offered for saving. A file that does not match is discarded.

## Location storage (edge function)

The `device-location` edge function stores each device's last known location. It is called at `/functions/v1/device-location/<action>` with the project's public anon key, and accepts JSON bodies. It allows CORS from any origin.

- `save` with `{ deviceKey, location }`, where `location` is `{ latitude, longitude, accuracy, capturedAt }`. Returns `{ ok: true }`.
- `load` with `{ deviceKey }`. Returns `{ location }`, which is `null` when nothing is saved.
- `clear` with `{ deviceKey }`. Returns `{ ok: true }`.

`deviceKey` is a private string of 16 to 128 characters kept in the browser. The function hashes it before it reaches the database, so only the hash is stored. Responses are `400` for invalid input, `502` when the database call fails, and `503` when the function has no database configuration.

## Future protocol work

Future versions may add:

- multi-source downloads
- priority scheduling
- bandwidth-aware replication
- battery-aware scheduling
- peer scoring
- resource expiration
- signed manifests
- encrypted application-level resource packages
