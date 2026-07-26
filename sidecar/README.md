# Photon Node sidecar (Branch B)

Thin Node wrapper over `@photon-ai/advanced-imessage` (the SDK is TS-only).
Exposes loopback HTTP command routes + a WebSocket event stream to the Python
adapter in `src/imessage/`. Deliberately dumb — all logic lives in Python.

B owns this directory entirely, including its `package.json`.
See docs/branch-b.md.
