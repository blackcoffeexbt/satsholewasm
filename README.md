# SatsHole WASM · Bitcoin Borough

A separate WASM port of `satsholeio`, targeting the **native LNbits component host used by `battleshipswasm`**. The original Python extension is unchanged. This is a development build, not a production financial migration.

## Install and configure

1. Install this directory in the configured native WASM extension directory on **LNbits 1.6.2 or later** (default: `data/wasm_extensions/satsholewasm`). This runtime keeps WASM extensions outside the Python-importable `lnbits/extensions/` tree. The compiled component is included at `wasm/module.wasm`; Node is not needed on the LNbits server.
2. Enable the extension and grant its declared storage, wallet and utility permissions.
3. In the extension's LNbits runtime limits, raise **maximum fuel to 40,000,000,000**. Keep the execution deadline at 5 seconds and memory at 64 MiB. The default 100,000,000 fuel budget is insufficient for this game's replay engine. Replay work is split into forty-tick calls with private persisted checkpoints. Run the compiled runtime check below when changing these limits.
4. Open `/ext/satsholewasm`, choose a wallet you own, and save settings. The receiving wallet is fixed after initial setup.
5. Share the public arena link shown on that page: `/ext/satsholewasm/arenas/<arena_id>/play`.

Use a dedicated development wallet while validating payments. Paid leaderboard entries default to disabled. No existing Python database, player cookies, runs or financial obligations are imported.

## Preserved behavior

- Original 3D city, WebGL renderer, keyboard, mouse and touch controls, audio, eight default AI opponents and city-7 rules. Three.js and its license are bundled locally.
- Unlimited practice, introductory official attempts and paid Lightning attempts; QR and invoice copy work inside the sandbox.
- Private server-created seed revealed at START, run ownership, single-use state transitions, finish-time checks and immutable submitted inputs.
- Authoritative replay runs **inside the compiled WASM component**. Resumable checkpoints survive invocation failure; retries continue the same committed input log. The browser never supplies an authoritative score or checkpoint.
- Weekly frozen rules, IANA timezone closes with DST, one best accepted score per player, receipt-order ties, historical leaderboards and prize estimates.
- Separate play and leaderboard invoices, receipt-hash accounting, late/duplicate-entry refund liabilities, frozen podium allocations and carry/hold policies for missing recipients.
- Authenticated operator settings, pause, run inspection/replay export, reasoned player blocking, entry disqualification/refunds, payment holds and repair of unattempted destinations.
- Prize and refund transfers fetch a Lightning Address invoice, validate its amount/hash/expiry, persist it before sending, and pin retries to that invoice.

## Differences and host limitations

The old guide at `wasm/docs/agents_wasm_extensions.md` and `paidtasks` target another runtime with `host.db_get`, `public_wasm_functions` and `api.METHOD:/path` permissions. This port uses the native component/WIT host, `wasm.exports`, declarative `api_routes`, owner context and the `wallet.*`/`ext.storage.*` permissions shown by `battleshipswasm`. It makes no direct internal endpoint requests, including `POST /api/v1/payments`.

The native host currently has no compare-and-swap, transactions or cross-invocation lock. **Concurrent state changes are not guaranteed to be atomic**, even with one LNbits process. In particular, concurrent STARTs, free-slot creation, entry receipt processing, review and prize-plan creation still need host-level transactional support before production paid competitions. Deterministic record IDs and pinned outgoing invoices make sequential retries idempotent; they do not provide transactional isolation. Do not treat this as parity with the Python extension's financial locking.

The host also has no read-only incoming/outgoing payment status API or scheduler:

- Incoming payments rely on LNbits' invoice-paid event. Duplicate event delivery recovers a receipt persisted before its corresponding state projection. Lost events and invoices created before their response was persisted require operator investigation; status polling does not query the funding source.
- Automatic payouts are unavailable and rejected in settings. Operators freeze and explicitly settle closed competitions. No background-payment permission is requested.
- A pending/uncertain outgoing payment can be retried using its **original** invoice while unexpired. There is no receipt-only reconciliation or replacement of an attempted invoice. Expired or unresolved attempts remain liabilities; inspect their saved payment hash in the LNbits wallet before further action. Do not bypass the pinned-invoice guard.
- Wallet balance metrics and the Python extension's anomaly review/operational replay comparison are not implemented. Revenue/liability figures come from extension records, not the wallet's spendable balance. They exclude routing-fee reserves.

Player identity uses LNbits' parent **session-storage bridge**, with a private bearer token and hashed stored player ID. It survives reloads in that browser tab, but is not the original year-long HttpOnly cookie. A new tab/session may get a new introductory allowance. Clearing storage is not proof of a new human. The sandbox cannot launch `lightning:` links or download blobs: invoices use QR/copy, and replay export uses selectable JSON.

Invoice acceptance windows are extension-side deadlines; the host chooses the actual Bolt11 expiry. A verified play receipt arriving late still grants its original attempt. Entry qualification uses when this extension observes the paid event, not when an unpaid invoice was created.

Timezone offsets are bundled for 2020–2040 because the component's JavaScript runtime has no `Intl`. Rebuild that table when updating timezone rules. Configuration changes to official game/competition rules take effect with the next weekly snapshot; pauses take effect immediately.

## Build and test

```sh
cd dev
npm ci
npm run check
npm run build:wasm
```

The compiler is pinned in `package-lock.json`. It is a build dependency only. `module.wasm` is a component binary, not the old PaidTasks core-module ABI. Changes to sources require rebuilding the included component.

The compiled integration check uses an **existing** LNbits Python environment with Wasmtime and simulated host I/O. It installs no Python dependencies and sends no funds:

```sh
/path/to/lnbits/.venv/bin/python test/runtime.py
/path/to/lnbits/.venv/bin/python test/host.py
```

It instantiates a fresh component for each call, uses the 64 MiB memory/1 MiB stack limits, exercises real WASM replay, and reports invocation fuel. By default it tests a ten-second run with sixteen opponents at maximum aggression. For the normal two-minute game:

```sh
SATSHOLE_TEST_DURATION=120 SATSHOLE_TEST_AI=8 /path/to/lnbits/.venv/bin/python test/runtime.py
```

Node tests cover engine/checkpoint parity across restarts, secret projections, player ownership, replay commitment, paid-receipt validation, duplicate and late receipts, DST, frozen settlement allocation, pinned payout retry and operator-action idempotency. Real invoice settlement, concurrency, funding-source restart recovery and production deployment remain unverified.

## Local UI preview

```sh
cd dev
npm run preview
```

Open `http://127.0.0.1:5091` for the game or `/admin` for the operator page. This isolated preview uses simulated storage, rejects Lightning I/O and applies the native frame CSP. It does not install the extension or change the running LNbits server. If the LNbits checkout is elsewhere, set `SATSHOLE_CORE_ASSETS=/path/to/lnbits/lnbits/static/vendor` for Vue/QR assets. Automated visual verification was unavailable in the development session.
