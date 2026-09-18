# Security

MeshNet should never be used to transmit private learner records or credentials in the prototype.

WebRTC DataChannels provide encrypted transport at the WebRTC layer. Application-level authorization, resource authenticity, access control, abuse prevention and signed content are separate concerns.

Production deployments should add:

- authenticated peer identity
- signed resource manifests
- trusted publisher keys
- resource authorization
- rate limiting
- abuse controls
- privacy-preserving telemetry
- secure gateway administration
- dependency and vulnerability scanning
