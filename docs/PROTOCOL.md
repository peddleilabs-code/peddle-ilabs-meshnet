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
