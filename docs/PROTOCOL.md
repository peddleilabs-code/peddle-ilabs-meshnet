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

Each chunk has:

- transfer ID
- content ID
- chunk index
- total chunks
- binary payload

The receiver persists completed chunks and can reconstruct the resource after all chunks arrive.

## Integrity

The final reconstructed resource must match the advertised SHA-256 content ID before it is committed as complete.

## Location storage (HTTP)

The signaling server exposes three routes for each device's last known location. All accept JSON bodies up to 4 KB, return JSON, and allow CORS from any origin.

- `POST /api/device-location/save` with `{ deviceKey, location }`, where `location` is `{ latitude, longitude, accuracy, capturedAt }`. Returns `{ ok: true }`.
- `POST /api/device-location/load` with `{ deviceKey }`. Returns `{ location }`, which is `null` when nothing is saved.
- `POST /api/device-location/clear` with `{ deviceKey }`. Returns `{ ok: true }`.

`deviceKey` is a private string of 16 to 128 characters kept in the browser. The server hashes it before it reaches the database, so only the hash is stored. Responses are `400` for invalid input, `502` when the database call fails, and `503` when the server has no database configuration.

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
