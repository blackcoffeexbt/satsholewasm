# Verification status

The native WASM component was compiled successfully and invoked using the LNbits Python environment with Wasmtime. The compiled binary is included at `wasm/module.wasm`.

- Eight Node regressions passed: replay/checkpoint parity, private projections, player ownership, paid receipt validation, late and duplicate receipts, frozen allocation, refunds, SHA-256 player identity, interrupted event recovery, DST and sandbox bridge identity/replay behavior.
- A full 120-second run with eight opponents completed in compiled WASM with private checkpoints. Peak measured fuel: 23,411,430,312.
- The final binary also completed a ten-second run with sixteen opponents at maximum aggression. Peak measured fuel: 32,681,154,732; longest measured call: 1.658 seconds. Both checks used a 64 MiB memory limit and 1 MiB stack limit.
- Native config/permissions validation and migrations passed against LNbits' actual SQLite abstraction in an isolated extension-local test directory. Cross-owner reads and writes were rejected or isolated.
- Both preview pages and every linked stylesheet/script loaded successfully. The preview applies the native frame CSP; the renderer and its dependency are bundled locally.
- The original city-7 engine is byte-for-byte identical to satsholeio, and that original extension's Git working tree remains clean.

All Lightning I/O in tests is simulated. No extension was installed into the running LNbits server, no permissions or wallet settings were changed there, and no funds were sent. Browser visual/interaction verification remains incomplete because the computer-use service reported a native pipe startup failure and no available browsers. Live settlement, concurrent financial operations and production deployment are unverified; see README.md for host limitations.
