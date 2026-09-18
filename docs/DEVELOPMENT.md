# Development Notes

## Principles

- Offline-first
- Peer-to-peer where practical
- Minimal central dependency
- Content-addressed resources
- Verifiable transfers
- Explicit protocol boundaries
- Privacy by design
- Low-bandwidth operation
- Graceful interruption and recovery

## Testing priorities

1. Two-peer connection
2. Manifest exchange
3. Resource discovery
4. Complete resource transfer
5. Interrupted transfer
6. Resume after interruption
7. SHA-256 verification
8. Cache persistence
9. Peer-to-peer re-advertisement
10. Store-and-forward between three devices

## Prototype boundary

The browser implementation is a research and development prototype. A production community network may require native transports, a SchoolBox gateway, routing/NAT functionality, access-point services, device management, stronger identity, and additional security controls.
