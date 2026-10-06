# SatsHole

Swallow the city. Stack your score.

SatsHole is a 3D city-eating arcade game for LNbits. Start as a small hole, collect street scraps, grow big enough to consume cars and skyscrapers, and outsmart rival holes in Bitcoin Borough. Play unlimited practice or compete with a verified score on a weekly Lightning leaderboard.

## Features

- A 3D city with moving traffic, pedestrians, parks, buildings and Bitcoin collectibles.
- Keyboard, mouse and touch controls, with optional arcade sound.
- Configurable game duration, opponent count, difficulty and death penalties.
- Unlimited practice, introductory official attempts and paid Lightning play.
- Server-verified scores using deterministic game replay.
- Weekly competitions with local-time closing schedules and historical leaderboards.
- Separate leaderboard entry payments, configurable prize contributions and podium shares.
- Operator tools for reviewing runs, managing entries, freezing prizes and sending payouts or refunds.

Defaults are 120-second games, eight opponents at Balanced difficulty, three introductory official attempts, 25 sats per paid attempt and a 20% score penalty when consumed.

## Installation

Requires **LNbits 1.6.2 or later with native WASM extension support**. The compiled module is included; Node.js is only needed for development.

1. Extract the extension into your configured WASM extension directory. The default location is `data/wasm_extensions/satsholewasm`.
2. Restart LNbits, enable **SatsHole**, and approve its declared permissions.
3. Set the extension's WASM runtime limits to:

   | Setting | Value |
   | --- | --- |
   | Maximum fuel | 40,000,000,000 |
   | Execution timeout | 5 seconds |
   | Memory | 64 MiB |

   The default fuel allowance is too small for score verification.

4. Open `/ext/satsholewasm`, choose a receiving wallet, and save settings. The wallet is fixed after initial setup.
5. Copy the public link from **Share your game** at the top of the operator page.

Players do not need an LNbits account to use the public game link.

## Playing

Use **WASD**, arrow keys, or hold the mouse to move. On a touch screen, drag to steer. Consume smaller objects to grow, avoid larger rival holes, and build the highest score before time runs out.

**Practice** is unlimited and does not qualify for the leaderboard. **Official attempts** use introductory allowances or a Lightning payment. Scan the invoice QR code or copy the invoice into a Lightning wallet, then press **START** when ready.

Leaving or refreshing after START forfeits the attempt. A purchased attempt remains available before START until its ready expiry. A valid late play payment still grants its purchased attempt.

Official scores are verified after the game finishes. If verification is interrupted, use **Retry verification** to continue with the same submitted inputs.

Introductory allowances are tied to the browser session. A new tab or cleared session can create a new player identity; the allowance is not a guarantee of one allocation per person.

## Weekly leaderboard

Only eligible, verified official runs can enter. Leaderboard entry is a separate Lightning payment from the play fee, and practice scores are never eligible. Introductory official runs are eligible only when the operator enables that option.

Each player's best accepted score ranks. Tied scores use the earlier accepted entry. Payment must be confirmed by the extension before the weekly cutoff; an unpaid invoice does not reserve a place. Late and duplicate entry payments are recorded as refund liabilities.

The default entry fee is 250 sats, with 80% contributed to prizes and 20% retained as operator revenue. The default podium split is 70% / 20% / 10%. Entries are disabled until the operator enables them.

Prize estimates can change until the competition closes and its prize plan is frozen. Missing podium shares can carry forward to the next week or remain held for operator review.

## Operator page

The public share link remains visible above four tabs:

- **Settings:** configure play, attempt expiry, leaderboard eligibility, prize allocation and the weekly schedule. Emergency pause stops new official games and entries immediately.
- **Run review:** inspect attempts, export replay inputs, block players, or disqualify and refund entries before prizes are frozen.
- **Prizes & payments:** view recorded revenue and liabilities, freeze a closed competition's prize plan after its review delay, and explicitly send prizes or refunds.
- **Audit:** review the reasons and outcomes of operator actions.

Official game and competition rules are snapshotted for each week. Rule changes apply to the next competition; availability changes apply immediately. Closing schedules follow the configured IANA timezone, including daylight-saving changes.

Payouts use the recipient's Lightning Address. The invoice is saved before sending, and retries use that same invoice. Holds prevent sending while preserving the obligation. Only destinations with no attempted payment can be repaired.

## Current status

This is a development release. Test with a dedicated wallet before accepting paid competition entries.

- Concurrent financial operations are not guaranteed to be atomic. Production paid competitions require further hardening.
- Payouts are manual; automatic settlement is unavailable.
- Incoming payments depend on invoice-paid notifications. Lost notifications require operator investigation.
- Read-only payment reconciliation and replacement of attempted payout invoices are unavailable. Inspect pending or expired attempts in the LNbits wallet before further action.
- Revenue and liabilities reflect extension records, not the wallet's spendable balance, and exclude routing-fee reserves.
- Timezone data covers 2020–2040 and should be refreshed when timezone rules change.

## Development

Build and run checks:

```sh
cd dev
npm ci
npm run check
npm run build:wasm
```

The build updates `wasm/module.wasm`. Integration checks use an existing LNbits Python environment and simulated Lightning I/O; no funds are sent:

```sh
/path/to/lnbits/.venv/bin/python test/runtime.py
/path/to/lnbits/.venv/bin/python test/host.py
```

For a full two-minute replay check:

```sh
SATSHOLE_TEST_DURATION=120 SATSHOLE_TEST_AI=8 /path/to/lnbits/.venv/bin/python test/runtime.py
```

Preview the public game and operator page with simulated storage:

```sh
npm run preview
```

Open `http://127.0.0.1:5091` for the game or `/admin` for the operator page. The preview rejects Lightning payments. If your LNbits checkout is elsewhere, set `SATSHOLE_CORE_ASSETS=/path/to/lnbits/lnbits/static/vendor`.

## License

MIT. See [LICENSE](LICENSE). Three.js is bundled with its own license in `static/vendor/three.LICENSE`.
