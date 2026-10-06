import { storage, system, wallet, utils } from "./lnbits-sdk.js";

const DEFAULTS = {
  enabled: true,
  game_price: 25,
  free_runs: 3,
  duration: 120,
  ai_count: 8,
  competitor_aggression: 5,
  death_penalty: 20,
  invoice_expiry: 600,
  ready_expiry: 3600,
  leaderboard_enabled: false,
  leaderboard_price: 250,
  prize_percentage: 80,
  first_percentage: 70,
  second_percentage: 20,
  third_percentage: 10,
  allow_free_entries: false,
  timezone: "Europe/London",
  close_weekday: 6,
  close_hour: 21,
  close_minute: 0,
  settlement_delay: 3600,
  undistributed_policy: "carry",
  automatic_payouts: false,
};
const BOUNDS = {
  game_price: [1, 100000],
  free_runs: [0, 100],
  duration: [10, 300],
  ai_count: [0, 16],
  competitor_aggression: [1, 10],
  death_penalty: [0, 100],
  invoice_expiry: [60, 3600],
  ready_expiry: [300, 86400],
  leaderboard_price: [1, 1000000],
  prize_percentage: [0, 100],
  first_percentage: [0, 100],
  second_percentage: [0, 100],
  third_percentage: [0, 100],
  close_weekday: [0, 6],
  close_hour: [0, 23],
  close_minute: [0, 59],
  settlement_delay: [60, 604800],
};
const clockNow = () => system.now(),
  id = (prefix) => system.id(prefix);
// SHA-256 of UTF-8 credentials; bearer secrets never appear in stored player IDs.
function digest(text) {
  const bytes = [];
  for (const ch of unescape(encodeURIComponent(text)))
    bytes.push(ch.charCodeAt(0));
  const bits = bytes.length * 8;
  bytes.push(128);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--)
    bytes.push(i >= 4 ? 0 : (bits >>> (i * 8)) & 255);
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
      0x1f83d9ab, 0x5be0cd19,
    ],
    rotate = (x, n) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const w = new Array(64);
    for (let i = 0; i < 16; i++)
      w[i] =
        (bytes[offset + i * 4] << 24) |
        (bytes[offset + i * 4 + 1] << 16) |
        (bytes[offset + i * 4 + 2] << 8) |
        bytes[offset + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15],
        y = w[i - 2];
      w[i] =
        (w[i - 16] +
          (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) +
          w[i - 7] +
          (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) |
        0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 =
          (h +
            (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) +
            ((e & f) ^ (~e & g)) +
            K[i] +
            w[i]) |
          0,
        t2 =
          ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) +
            ((a & b) ^ (a & c) ^ (b & c))) |
          0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    const values = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i++) H[i] = (H[i] + values[i]) | 0;
  }
  return H.map((n) => (n >>> 0).toString(16).padStart(8, "0")).join("");
}
function credential(value) {
  requireValue(
    typeof value === "string" && /^[0-9a-f]{64}$/.test(value),
    "Player session required.",
  );
  return digest(value);
}
function secret() {
  return utils.lightning.randomSecretAndHash(32).secret;
}
function wrap(fn) {
  try {
    return JSON.stringify({ ok: true, data: fn() });
  } catch (e) {
    return JSON.stringify({ ok: false, error: e.message || String(e) });
  }
}
function parse(raw) {
  const r = JSON.parse(raw || "{}");
  if (!r || Array.isArray(r) || typeof r !== "object")
    throw Error("Invalid request.");
  return r;
}
function requireValue(ok, message) {
  if (!ok) throw Error(message);
}
function getArena(arenaId) {
  const a = storage.get("arenas", arenaId);
  requireValue(a, "Game not configured.");
  a.config = JSON.parse(a.config_json);
  return a;
}
function adminArena() {
  const row = storage.getPaginated("arenas", { limit: 1 }).data[0];
  return row ? getArena(row.id) : null;
}
function saveArena(a) {
  storage.set("arenas", {
    id: a.id,
    wallet_id: a.wallet_id,
    name: a.name,
    config_json: JSON.stringify(a.config),
    created_at: a.created_at,
  });
  return a;
}
function get(a, key, kind) {
  const row = storage.get("records", key);
  if (!row || row.arena_id !== a.id) return null;
  const result = JSON.parse(row.payload);
  return !kind || result.kind === kind ? result : null;
}
function put(a, row) {
  row.arena_id = a.id;
  storage.set("records", {
    id: row.id,
    arena_id: a.id,
    player_id: row.player_id || "",
    run_id: row.run_id || "",
    competition_id: row.competition_id || "",
    kind: row.kind,
    status: row.status || "",
    created_at: row.created_at || clockNow(),
    payload: JSON.stringify(row),
  });
  return row;
}
function list(a, kind, filters = {}, limit = 100, offset = 0) {
  return storage
    .getPaginated("records", {
      filters: { arena_id: a.id, kind, ...filters },
      sortBy: "created_at",
      descending: true,
      limit,
      offset,
    })
    .data.map((r) => JSON.parse(r.payload));
}
function all(a, kind, filters = {}) {
  const rows = [];
  for (let offset = 0; offset < 100000; offset += 500) {
    const page = list(a, kind, filters, 500, offset);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
  throw Error("Record limit exceeded. Export and archive this arena.");
}
function player(a, r) {
  const p = get(a, credential(r.player_token), "player");
  requireValue(p, "Player session required.");
  requireValue(!p.blocked, "Player is blocked.");
  return p;
}
function owned(a, r, p, kind = "run") {
  const row = get(a, r.run_id || r.submission_id, kind);
  requireValue(row && row.player_id === p.id, "Attempt not found.");
  return row;
}
function cleanName(n) {
  requireValue(
    typeof n === "string" &&
      n.trim().length >= 1 &&
      n.trim().length <= 24 &&
      !/[<>&\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(
        n,
      ),
    "Use 1–24 characters without markup or control characters.",
  );
  return n.trim();
}
function address(n) {
  requireValue(
    typeof n === "string" &&
      /^[a-zA-Z0-9_.+-]{1,128}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/.test(n) &&
      n.length <= 320,
    "Enter a valid Lightning Address.",
  );
  return n.toLowerCase();
}
function configuration(input) {
  const c = { ...DEFAULTS, ...input };
  for (const [key, [min, max]] of Object.entries(BOUNDS))
    requireValue(
      Number.isInteger(c[key]) && c[key] >= min && c[key] <= max,
      `Invalid ${key}.`,
    );
  for (const key of [
    "enabled",
    "leaderboard_enabled",
    "allow_free_entries",
    "automatic_payouts",
  ])
    requireValue(typeof c[key] === "boolean", `Invalid ${key}.`);
  requireValue(
    !c.automatic_payouts,
    "Automatic payouts require a scheduler and are unavailable in this WASM host.",
  );
  requireValue(
    c.first_percentage + c.second_percentage + c.third_percentage === 100,
    "Winner percentages must total 100.",
  );
  requireValue(
    ["carry", "hold"].includes(c.undistributed_policy),
    "Invalid missing-recipient policy.",
  );
  requireValue(
    Object.hasOwn(globalThis.SatsHoleTimezones, c.timezone),
    "Choose a supported IANA timezone.",
  );
  return c;
}
// Resolve the wall-clock close in its IANA zone, including DST offset changes.
function timezoneOffset(t, zone) {
  const changes = globalThis.SatsHoleTimezones[zone];
  requireValue(
    changes && t >= 1577836800 && t < 2240611200,
    "Timezone data supports 2020–2040; rebuild its offset table for later dates.",
  );
  let lo = 0,
    hi = changes.length / 2 - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (changes[mid * 2] <= t) lo = mid;
    else hi = mid - 1;
  }
  return changes[lo * 2 + 1];
}
function parts(t, zone) {
  const d = new Date((t + timezoneOffset(t, zone)) * 1000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}
function localEpoch(d, zone) {
  const nominal = Date.UTC(d.year, d.month - 1, d.day, d.hour, d.minute) / 1000;
  let t = nominal;
  for (let i = 0; i < 4; i++) {
    const next = nominal - timezoneOffset(t, zone);
    if (next === t) return t;
    t = next;
  }
  throw Error("Choose a closing time outside the DST clock-change hour.");
}
function bounds(stamp, c) {
  const p = parts(stamp, c.timezone),
    local = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const days = (c.close_weekday - ((local.getUTCDay() + 6) % 7) + 7) % 7;
  local.setUTCDate(local.getUTCDate() + days);
  const close = () =>
    localEpoch(
      {
        year: local.getUTCFullYear(),
        month: local.getUTCMonth() + 1,
        day: local.getUTCDate(),
        hour: c.close_hour,
        minute: c.close_minute,
      },
      c.timezone,
    );
  let end = close();
  if (end <= stamp) {
    local.setUTCDate(local.getUTCDate() + 7);
    end = close();
  }
  local.setUTCDate(local.getUTCDate() - 7);
  return [close(), end];
}
function current(a) {
  const weeks = all(a, "week");
  let open = weeks.find((w) => w.status === "OPEN" && w.ends_at > clockNow());
  for (const w of weeks.filter(
    (w) => w.status === "OPEN" && w.ends_at <= clockNow(),
  ))
    put(a, { ...w, status: "CLOSED" });
  if (open) return open;
  const [start, end] = bounds(clockNow(), a.config);
  return put(a, {
    id: `${a.id}:week:${end}`,
    kind: "week",
    status: "OPEN",
    starts_at: start,
    ends_at: end,
    created_at: clockNow(),
    wallet_id: a.wallet_id,
    config: { ...a.config },
  });
}
function runView(r) {
  const keys = [
    "id",
    "status",
    "paid",
    "amount",
    "bolt11",
    "expires_at",
    "authoritative_score",
    "game_version",
    "map_version",
  ];
  return Object.fromEntries(keys.map((k) => [k, r[k] ?? null]));
}
function freshRun(a, r) {
  if (
    ["READY", "WAITING_PAYMENT"].includes(r.status) &&
    r.expires_at <= clockNow()
  )
    r = put(a, { ...r, status: "EXPIRED" });
  return r;
}
function session(a, r) {
  let p = r.player_token ? get(a, credential(r.player_token), "player") : null;
  let token = r.player_token;
  if (!p) {
    token = secret();
    p = put(a, {
      id: digest(token),
      kind: "player",
      display_name: "Visitor",
      created_at: clockNow(),
      blocked: false,
    });
  }
  requireValue(!p.blocked, "Player is blocked.");
  const w = current(a),
    runs = all(a, "run", { player_id: p.id }).map((x) => freshRun(a, x));
  return {
    player_token: token,
    player: { id: p.id.slice(0, 12), display_name: p.display_name },
    free_remaining: Math.max(
      0,
      a.config.free_runs - runs.filter((x) => x.free).length,
    ),
    config: {
      ...w.config,
      enabled: a.config.enabled,
      leaderboard_enabled: a.config.leaderboard_enabled,
    },
    practice_config: { competitor_aggression: a.config.competitor_aggression },
    runs: runs
      .filter((x) => ["READY", "WAITING_PAYMENT"].includes(x.status))
      .slice(0, 3),
  };
}
function createRun(a, r, p) {
  requireValue(a.config.enabled, "New games are paused.");
  requireValue(typeof r.free === "boolean", "Choose a free or paid attempt.");
  const runs = all(a, "run", { player_id: p.id });
  requireValue(
    runs.filter(
      (x) =>
        ["CREATING", "READY", "WAITING_PAYMENT"].includes(x.status) &&
        x.expires_at > clockNow(),
    ).length < 3 &&
      runs.filter((x) => x.created_at > clockNow() - 60).length < 6,
    "Too many run requests.",
  );
  const w = current(a);
  let key = id("run");
  if (r.free) {
    const used = runs.filter((x) => x.free).length;
    requireValue(
      used < a.config.free_runs,
      "No introductory free games remain.",
    );
    key = `${p.id}:free:${used}`;
    const existing = get(a, key, "run");
    if (existing) return runView(freshRun(a, existing));
  }
  const token = secret();
  let run = put(a, {
    id: key,
    kind: "run",
    player_id: p.id,
    competition_id: w.id,
    wallet_id: a.wallet_id,
    status: r.free ? "READY" : "CREATING",
    free: r.free,
    paid: false,
    amount: r.free ? 0 : w.config.game_price,
    bolt11: "",
    payment_hash: "",
    game_version: "city-7",
    map_version: "bitcoin-borough-7",
    config: w.config,
    seed: parseInt(secret().slice(0, 8), 16) >>> 0,
    run_token: token,
    created_at: clockNow(),
    expires_at:
      clockNow() + (r.free ? w.config.ready_expiry : w.config.invoice_expiry),
    authoritative_score: null,
    input_log: null,
  });
  if (!r.free) {
    const invoice = wallet.createInvoicePublic({
      sourceId: a.id,
      amount: run.amount,
      memo: "SatsHole · one city run",
      extra: { kind: "run", record_id: run.id },
    });
    run = put(a, {
      ...get(a, run.id, "run"),
      status: get(a, run.id, "run").paid ? "READY" : "WAITING_PAYMENT",
      bolt11: invoice.paymentRequest,
      payment_hash: invoice.paymentHash,
    });
  }
  return runView(run);
}
function startRun(a, run) {
  run = freshRun(a, run);
  requireValue(
    run.status === "READY",
    "This attempt is unavailable or already started.",
  );
  put(a, { ...run, status: "RUNNING", started_at: clockNow() });
  return {
    id: run.id,
    seed: run.seed,
    run_token: run.run_token,
    game_version: run.game_version,
    map_version: run.map_version,
    config: run.config,
  };
}
function validateInputs(run, inputs) {
  requireValue(
    Array.isArray(inputs) &&
      inputs.length <= run.config.duration * 20 &&
      JSON.stringify(inputs).length <= 256000,
    "Input log too large.",
  );
  let prev = -1;
  for (const row of inputs) {
    requireValue(
      Array.isArray(row) &&
        row.length === 3 &&
        row.every(Number.isInteger) &&
        row[0] > prev &&
        row[0] >= 0 &&
        row[0] < run.config.duration * 20 &&
        Math.abs(row[1]) <= 100 &&
        Math.abs(row[2]) <= 100,
      "Invalid input stream.",
    );
    prev = row[0];
  }
}
function finishRun(a, r, run) {
  requireValue(r.run_token === run.run_token, "Invalid run token.");
  requireValue(
    run.started_at && clockNow() >= run.started_at + run.config.duration - 1,
    "The run has not reached its finish time.",
  );
  const log = JSON.stringify(r.inputs);
  if (run.input_log !== null) {
    requireValue(
      log === run.input_log,
      "A different result was already submitted.",
    );
    return verifyStep(a, run);
  }
  requireValue(
    run.status === "RUNNING" &&
      clockNow() <= run.started_at + run.config.duration + 300,
    "Run submission window expired.",
  );
  validateInputs(run, r.inputs);
  run = put(a, {
    ...run,
    input_log: log,
    status: "VERIFYING",
    finished_at: clockNow(),
  });
  return verifyStep(a, run);
}
// Checkpoints are private host storage; no client-supplied score or state is accepted.
function verifyStep(a, run) {
  if (run.status === "VERIFIED" || run.status === "INVALID")
    return finished(a, run);
  requireValue(run.input_log !== null, "No committed replay.");
  const checkpoint = get(a, `replay:${run.id}`, "replay");
  const E = globalThis.SatsHoleEngine;
  let s = checkpoint
    ? JSON.parse(checkpoint.state)
    : E.make(run.seed, run.config);
  if (checkpoint) {
    const rng = new E.RNG(1);
    rng.s = s.rng.s;
    s.rng = rng;
  }
  const inputs = JSON.parse(run.input_log);
  let cursor = checkpoint?.cursor || 0,
    move = checkpoint?.move || [0, 0];
  const end = Math.min(s.tick + 40, run.config.duration * 20);
  while (s.tick < end) {
    if (cursor < inputs.length && inputs[cursor][0] === s.tick)
      move = inputs[cursor++].slice(1);
    E.step(s, move);
  }
  if (s.tick === run.config.duration * 20) {
    const p = s.holes[0];
    run = put(a, {
      ...run,
      status: "VERIFIED",
      verified_at: clockNow(),
      authoritative_score: p.score,
      result: {
        score: p.score,
        mass: p.mass,
        radius: p.radius,
        x: p.x,
        y: p.y,
        deaths: p.deaths,
        ticks: s.tick,
      },
    });
    storage.delete("records", `replay:${run.id}`);
  } else
    put(a, {
      id: `replay:${run.id}`,
      kind: "replay",
      run_id: run.id,
      player_id: run.player_id,
      state: JSON.stringify(s),
      cursor,
      move,
    });
  return {
    ...finished(a, run),
    verification_progress: s.tick / (run.config.duration * 20),
  };
}
function finished(a, run) {
  return {
    ...runView(run),
    personal_best: Math.max(
      0,
      ...all(a, "run", { player_id: run.player_id })
        .filter((r) => r.status === "VERIFIED")
        .map((r) => r.authoritative_score),
    ),
  };
}
function ranking(a, w) {
  const best = new Map();
  const accepted = all(a, "entry", { competition_id: w.id }).filter(
    (e) => e.status === "ENTRY_CREATED" && !e.disqualified && !e.refund,
  );
  for (const e of accepted) {
    const p = get(a, e.player_id, "player");
    if (!p || p.blocked) continue;
    const prior = best.get(e.player_id);
    if (
      !prior ||
      e.score > prior.score ||
      (e.score === prior.score && e.accepted_at < prior.accepted_at)
    )
      best.set(e.player_id, { ...e, display_name: p.display_name });
  }
  return [...best.values()].sort(
    (x, y) =>
      y.score - x.score ||
      x.accepted_at - y.accepted_at ||
      x.id.localeCompare(y.id),
  );
}
function prizes(pot, c) {
  const second = Math.floor((pot * c.second_percentage) / 100),
    third = Math.floor((pot * c.third_percentage) / 100);
  return [pot - second - third, second, third];
}
function ledger(a, wid) {
  const receipts = all(a, "receipt", wid ? { competition_id: wid } : {}),
    outs = all(a, "outgoing", wid ? { competition_id: wid } : {}),
    carries = all(a, "carry");
  let prize = 0,
    refund = 0,
    operator = 0,
    game = 0;
  for (const r of receipts) {
    if (r.category === "game") game += r.amount;
    else {
      const entry = get(a, r.entry_id, "entry");
      if (r.category === "refund" || entry?.refund) refund += r.amount;
      else {
        prize += r.prize;
        operator += r.amount - r.prize;
      }
    }
  }
  for (const c of carries) {
    if (!wid || c.target === wid) prize += c.amount;
    if (!wid || c.competition_id === wid) prize -= c.amount;
  }
  for (const o of outs.filter((o) => o.status === "PAID")) {
    if (o.category === "prize") prize -= o.amount;
    else refund -= o.amount;
  }
  return {
    prize_liability: prize,
    refund_liability: refund,
    operator_revenue: operator,
    game_revenue: game,
  };
}
function board(a, wid) {
  const w = wid ? get(a, wid, "week") : current(a);
  requireValue(w, "Competition not found.");
  const plan = get(a, `plan:${w.id}`, "plan");
  const ranked = plan ? plan.rankings : ranking(a, w),
    pot = plan ? plan.pot : ledger(a, w.id).prize_liability,
    amounts = prizes(pot, w.config);
  return {
    competition: {
      id: w.id,
      starts_at: w.starts_at,
      ends_at: w.ends_at,
      status: w.status,
    },
    timezone: w.config.timezone,
    pot,
    prizes: amounts,
    awards_frozen: !!plan,
    paid_submissions: all(a, "receipt", { competition_id: w.id }).filter(
      (r) => r.category === "entry",
    ).length,
    unique_entrants: ranked.length,
    entry_price: w.config.leaderboard_price,
    entries_enabled:
      a.config.enabled &&
      a.config.leaderboard_enabled &&
      w.ends_at > clockNow() &&
      w.status === "OPEN",
    rankings: ranked.slice(0, 100).map((e, i) => ({
      position: i + 1,
      display_name: e.display_name,
      score: e.score,
      estimated_prize: amounts[i] || 0,
    })),
  };
}
function preview(a, run, p) {
  const w = current(a),
    b = board(a),
    ranked = ranking(a, w),
    existing = ranked.findIndex((e) => e.player_id === p.id),
    entry = get(a, `entry:${run.id}`, "entry");
  let reason = "";
  if (run.status !== "VERIFIED") reason = "This run must be verified first.";
  else if (run.competition_id !== w.id)
    reason = "This run belongs to a previous competition.";
  else if (entry?.disqualified || entry?.refund)
    reason = "This entry was disqualified.";
  else if (!run.paid && !w.config.allow_free_entries)
    reason = "Only paid runs can enter the cash leaderboard.";
  const position =
    existing >= 0 && ranked[existing].score >= run.authoritative_score
      ? existing + 1
      : 1 +
        ranked.filter(
          (e) => e.player_id !== p.id && e.score >= run.authoritative_score,
        ).length;
  return {
    eligible: !reason,
    reason,
    would_rank: position,
    current_position: existing >= 0 ? existing + 1 : null,
    top_three_threshold: ranked[2]?.score || 0,
    estimated_prize: b.prizes[position - 1] || 0,
    board: b,
  };
}
function entryView(a, e) {
  if (["PENDING", "CREATING"].includes(e.status) && e.expires_at <= clockNow())
    e = put(a, { ...e, status: "EXPIRED" });
  const receipts = all(a, "receipt", { run_id: e.run_id }).filter(
      (r) => r.entry_id === e.id && (r.category === "refund" || e.refund),
    ),
    refundAmount = receipts.reduce((n, r) => n + r.amount, 0),
    refunded = all(a, "outgoing", { run_id: e.run_id })
      .filter((o) => o.status === "PAID" && o.category === "refund")
      .reduce((n, o) => n + o.amount, 0);
  return {
    id: e.id,
    status: e.status,
    amount: e.amount,
    bolt11: e.bolt11,
    disqualified: e.disqualified,
    expires_at: e.expires_at,
    refund_amount: refundAmount,
    refunded_amount: refunded,
    refund_status:
      refunded >= refundAmount && refundAmount ? "PAID" : "PENDING",
  };
}
function createEntry(a, r, p) {
  const run = owned(a, r, p),
    check = preview(a, run, p);
  requireValue(
    check.eligible && check.board.entries_enabled,
    check.reason || "Leaderboard entries are paused.",
  );
  const w = current(a),
    key = `entry:${run.id}`,
    existing = get(a, key, "entry");
  if (existing && entryView(a, existing).status !== "EXPIRED")
    return entryView(a, existing);
  const dest = existing?.address || address(r.lightning_address);
  let e = put(a, {
    id: key,
    kind: "entry",
    run_id: run.id,
    player_id: p.id,
    competition_id: w.id,
    wallet_id: a.wallet_id,
    score: run.authoritative_score,
    address: dest,
    amount: w.config.leaderboard_price,
    prize: Math.floor(
      (w.config.leaderboard_price * w.config.prize_percentage) / 100,
    ),
    status: "CREATING",
    created_at: existing?.created_at || clockNow(),
    expires_at: Math.min(clockNow() + w.config.invoice_expiry, w.ends_at),
    disqualified: false,
    refund: false,
    bolt11: "",
    payment_hash: "",
    attempt: (existing?.attempt || 0) + 1,
  });
  const inv = wallet.createInvoicePublic({
    sourceId: a.id,
    amount: e.amount,
    memo: "SatsHole · weekly entry",
    extra: { kind: "entry", record_id: e.id, attempt: String(e.attempt) },
  });
  put(a, {
    id: `invoice:${inv.paymentHash}`,
    kind: "invoice",
    entry_id: e.id,
    run_id: e.run_id,
    competition_id: e.competition_id,
    amount: e.amount,
    payment_hash: inv.paymentHash,
    created_at: clockNow(),
  });
  e = put(a, {
    ...get(a, e.id, "entry"),
    status:
      get(a, e.id, "entry").status === "ENTRY_CREATED"
        ? "ENTRY_CREATED"
        : "PENDING",
    bolt11: inv.paymentRequest,
    payment_hash: inv.paymentHash,
  });
  return entryView(a, e);
}
export function recordPayment(raw) {
  return wrap(() => {
    const ev = parse(raw),
      payment = ev.payment || ev,
      extra = ev.extra || payment.extra || {},
      metadata = extra.extra_satsholewasm || {},
      arenaId = extra.source_id;
    const a = getArena(arenaId);
    requireValue(
      (ev.walletId || payment.wallet_id) === a.wallet_id,
      "Wrong wallet.",
    );
    requireValue(
      (ev.status || payment.status) === "success" &&
        (ev.pending ?? payment.pending) === false,
      "Payment is not settled.",
    );
    const hash = ev.paymentHash || payment.payment_hash;
    requireValue(
      typeof hash === "string" && hash.length === 64,
      "Invalid payment hash.",
    );
    const recorded = get(a, `receipt:${hash}`, "receipt");
    const record = get(a, metadata.record_id, metadata.kind);
    requireValue(record, "Unknown invoice.");
    const amount = Number(ev.amount ?? payment.amount) / 1000;
    requireValue(
      Number.isSafeInteger(amount) && amount === record.amount,
      "Wrong payment amount.",
    );
    if (recorded) {
      if (record.kind === "run" && !record.paid)
        put(a, {
          ...record,
          paid: true,
          payment_hash: hash,
          status: "READY",
          expires_at: clockNow() + record.config.ready_expiry,
        });
      if (
        record.kind === "entry" &&
        recorded.category === "entry" &&
        record.status !== "ENTRY_CREATED"
      )
        put(a, {
          ...record,
          status: "ENTRY_CREATED",
          accepted_at: recorded.created_at,
          accepted_hash: hash,
        });
      return { recorded: true };
    }
    if (record.kind === "run") {
      requireValue(
        !record.payment_hash || record.payment_hash === hash,
        "Wrong invoice hash.",
      );
      put(a, {
        id: `receipt:${hash}`,
        kind: "receipt",
        category: "game",
        payment_hash: hash,
        player_id: record.player_id,
        run_id: record.id,
        amount,
        created_at: clockNow(),
      });
      if (!record.paid) {
        put(a, {
          ...record,
          payment_hash: hash,
          bolt11: ev.bolt11 || record.bolt11,
          paid: true,
          status: "READY",
          expires_at: clockNow() + record.config.ready_expiry,
        });
      }
    } else if (record.kind === "entry") {
      const w = get(a, record.competition_id, "week");
      const prior = all(a, "receipt", { run_id: record.run_id }).some(
        (x) => x.category === "entry",
      );
      const accepted =
        !prior &&
        !record.refund &&
        !record.disqualified &&
        clockNow() < w.ends_at &&
        !get(a, `plan:${w.id}`, "plan");
      put(a, {
        id: `receipt:${hash}`,
        kind: "receipt",
        category: accepted ? "entry" : "refund",
        payment_hash: hash,
        entry_id: record.id,
        player_id: record.player_id,
        run_id: record.run_id,
        competition_id: w.id,
        amount,
        prize: accepted ? record.prize : 0,
        address: record.address,
        created_at: clockNow(),
      });
      if (accepted)
        put(a, {
          ...record,
          status: "ENTRY_CREATED",
          accepted_at: clockNow(),
          accepted_hash: hash,
        });
      else if (!prior) put(a, { ...record, status: "REFUND_PENDING" });
    }
    return { recorded: true };
  });
}
export function invokePublic(raw) {
  return wrap(() => {
    const r = parse(raw),
      a = getArena(r.arenaId);
    if (r.action === "session") return session(a, r);
    if (r.action === "leaderboard") return board(a, r.competition_id);
    if (r.action === "competitions")
      return all(a, "week").map((w) => ({
        id: w.id,
        starts_at: w.starts_at,
        ends_at: w.ends_at,
        status: w.status,
      }));
    const p = player(a, r);
    switch (r.action) {
      case "profile":
        p.display_name = cleanName(r.display_name);
        put(a, p);
        return { display_name: p.display_name };
      case "runs":
        return createRun(a, r, p);
      case "run-status":
        return runView(freshRun(a, owned(a, r, p)));
      case "start":
        return startRun(a, owned(a, r, p));
      case "finish":
        return finishRun(a, r, owned(a, r, p));
      case "verify":
        return verifyStep(a, owned(a, r, p));
      case "preview":
        return preview(a, owned(a, r, p), p);
      case "entries":
        return createEntry(a, r, p);
      case "entry-status":
        return entryView(a, owned(a, r, p, "entry"));
      default:
        throw Error("Unknown public operation.");
    }
  });
}
function audit(a, r, kind, target, apply) {
  requireValue(
    typeof r.reason === "string" &&
      r.reason.trim().length >= 3 &&
      r.reason.length <= 500,
    "Enter a reason of 3–500 characters.",
  );
  requireValue(
    typeof r.request_id === "string" &&
      /^[a-zA-Z0-9_-]{16,100}$/.test(r.request_id),
    "Action ID required.",
  );
  const key = `audit:${r.request_id}`,
    prior = get(a, key, "audit");
  const intent = JSON.stringify({
    kind,
    target,
    reason: r.reason,
    blocked: r.blocked,
    disqualified: r.disqualified,
    refund: r.refund,
    held: r.held,
    address: r.lightning_address,
  });
  if (prior) {
    requireValue(
      prior.intent === intent,
      "Action ID already used for another operation.",
    );
    if (prior.status === "APPLIED") return prior.result;
  }
  let e =
    prior ||
    put(a, {
      id: key,
      kind: "audit",
      operation: kind,
      target,
      intent,
      reason: r.reason,
      created_at: clockNow(),
      status: "PENDING",
      actor: "arena-owner:" + a.id,
    });
  const result = apply();
  put(a, { ...e, status: "APPLIED", result });
  return result;
}
function refunds(a) {
  for (const receipt of all(a, "receipt")) {
    const e = receipt.entry_id ? get(a, receipt.entry_id, "entry") : null;
    if (receipt.category !== "refund" && !e?.refund) continue;
    const key = `refund:${receipt.payment_hash}`;
    if (!get(a, key, "outgoing"))
      put(a, {
        id: key,
        kind: "outgoing",
        category: "refund",
        competition_id: receipt.competition_id,
        run_id: receipt.run_id,
        address: receipt.address,
        amount: receipt.amount,
        wallet_id: a.wallet_id,
        status: "READY",
        held: false,
        bolt11: "",
        payment_hash: "",
        attempted: false,
        created_at: clockNow(),
      });
  }
}
function prepare(a, wid) {
  current(a);
  const w = get(a, wid, "week");
  requireValue(
    w && w.ends_at + w.config.settlement_delay <= clockNow(),
    "The competition must close and finish its review delay first.",
  );
  let plan = get(a, `plan:${wid}`, "plan");
  if (!plan) {
    const ranked = ranking(a, w),
      pot = ledger(a, w.id).prize_liability,
      amounts = prizes(pot, w.config),
      winners = ranked
        .slice(0, 3)
        .map((e, i) => ({
          id: `prize:${wid}:${i + 1}`,
          position: i + 1,
          address: e.address,
          amount: amounts[i],
          player_id: e.player_id,
          display_name: e.display_name,
          score: e.score,
        }))
        .filter((x) => x.amount > 0);
    plan = put(a, {
      id: `plan:${wid}`,
      kind: "plan",
      competition_id: wid,
      rankings: ranked,
      pot,
      winners,
      carry_amount: pot - winners.reduce((s, w) => s + w.amount, 0),
      carry_to: w.config.undistributed_policy === "carry" ? current(a).id : wid,
      created_at: clockNow(),
    });
  }
  for (const winner of plan.winners) {
    if (!get(a, winner.id, "outgoing"))
      put(a, {
        ...winner,
        kind: "outgoing",
        category: "prize",
        competition_id: wid,
        wallet_id: a.wallet_id,
        status: "READY",
        held: false,
        bolt11: "",
        payment_hash: "",
        attempted: false,
        created_at: clockNow(),
      });
  }
  if (
    plan.carry_amount &&
    plan.carry_to !== wid &&
    !get(a, `carry:${wid}`, "carry")
  )
    put(a, {
      id: `carry:${wid}`,
      kind: "carry",
      competition_id: wid,
      target: plan.carry_to,
      amount: plan.carry_amount,
      created_at: clockNow(),
    });
  put(a, { ...w, status: "PAYING" });
  refunds(a);
  return plan;
}
function transfer(a, key, send) {
  let o = get(a, key, "outgoing");
  requireValue(o, "Payment not found.");
  if (o.status === "PAID") return o;
  if (!send)
    throw Error(
      "This host has no read-only outgoing status API. Inspect the saved payment hash in the LNbits wallet; retries reuse its original invoice.",
    );
  requireValue(!o.held, "This payment is held.");
  if (!o.bolt11) {
    requireValue(
      !o.attempted,
      "An attempted payment requires its original invoice.",
    );
    const fetched = wallet.fetchLnurl({
      walletId: a.wallet_id,
      lnurl: o.address,
      amount: o.amount,
      maxSat: o.amount,
      description: "SatsHole " + o.category,
    });
    requireValue(
      fetched.ok && fetched.paymentRequest,
      "Could not request payout invoice.",
    );
    const decoded = utils.lightning.decodeInvoice(fetched.paymentRequest);
    requireValue(
      decoded.valid &&
        Number(decoded.amountMsat) === o.amount * 1000 &&
        Number(decoded.expiresAt) > clockNow(),
      "Destination returned an invalid invoice.",
    );
    o = put(a, {
      ...o,
      bolt11: fetched.paymentRequest,
      payment_hash: decoded.paymentHash,
    });
  }
  if (o.attempted)
    requireValue(
      Number(utils.lightning.invoiceExpiry(o.bolt11)) > clockNow(),
      "Saved invoice expired; keep obligation held pending operator investigation.",
    );
  o = put(a, { ...o, attempted: true, status: "SENDING" });
  const payment = wallet.payInvoice({
    walletId: a.wallet_id,
    paymentRequest: o.bolt11,
    maxSat: BigInt(o.amount),
    description: "SatsHole " + o.category,
    extra: { obligation_id: o.id },
  });
  if (payment.success)
    requireValue(
      payment.paymentHash === o.payment_hash &&
        Math.abs(Number(payment.amountMsat)) === o.amount * 1000,
      "Outgoing receipt did not match the pinned invoice; obligation remains unresolved.",
    );
  o = put(a, {
    ...o,
    status: payment.success ? "PAID" : payment.pending ? "PENDING" : "RETRY",
    error: payment.error || "",
    fee_msat: Number(payment.feeMsat || 0),
    paid_at: payment.success ? clockNow() : null,
  });
  return o;
}
function operations(a) {
  current(a);
  refunds(a);
  return {
    competitions: all(a, "week").map((w) => ({
      ...w,
      plan: get(a, `plan:${w.id}`, "plan"),
    })),
    payments: all(a, "outgoing"),
  };
}
export function invokeAdmin(raw) {
  return wrap(() => {
    const r = parse(raw);
    if (r.action === "wallets") return { wallets: wallet.listUserWallets() };
    let a = adminArena();
    if (r.action === "settings")
      return {
        configured: !!a,
        wallet_id: a?.wallet_id || "",
        arena_id: a?.id || "",
        public_url: a ? `/ext/satsholewasm/arenas/${a.id}/play` : "",
        config: a?.config || { ...DEFAULTS, enabled: false },
      };
    if (r.action === "save-settings") {
      const config = configuration(r.config);
      requireValue(
        wallet.listUserWallets().some((w) => w.id === r.wallet_id),
        "Choose a wallet you own.",
      );
      requireValue(
        !a || r.wallet_id === a.wallet_id,
        "The receiving wallet cannot be changed.",
      );
      a = saveArena(
        a
          ? { ...a, config }
          : {
              id: id("arena"),
              wallet_id: r.wallet_id,
              name: "Bitcoin Borough",
              config,
              created_at: clockNow(),
            },
      );
      current(a);
      return { config: a.config, wallet_id: a.wallet_id, arena_id: a.id };
    }
    requireValue(a, "Configure the game first.");
    switch (r.action) {
      case "metrics":
        return {
          ...ledger(a),
          runs: all(a, "run").map(runView),
          current_week: ledger(a, current(a).id),
        };
      case "operations":
        return operations(a);
      case "review":
        return {
          runs: list(
            a,
            "run",
            r.competition_id ? { competition_id: r.competition_id } : {},
            25,
            Math.max(0, Number(r.page) || 0) * 25,
          ).map((x) => ({
            ...runView(x),
            player_id: x.player_id,
            competition_id: x.competition_id,
          })),
          audit: list(a, "audit", {}, 25),
          page: Number(r.page) || 0,
        };
      case "inspect": {
        const run = get(a, r.run_id, "run");
        requireValue(run, "Run not found.");
        return {
          ...run,
          run_token: undefined,
          player_id: run.player_id.slice(0, 12),
        };
      }
      case "export-replay": {
        const run = get(a, r.run_id, "run");
        requireValue(run && run.input_log !== null, "No committed replay.");
        return {
          version: run.game_version,
          map: run.map_version,
          seed: run.seed,
          config: run.config,
          inputs: JSON.parse(run.input_log),
        };
      }
      case "block-player":
        return audit(a, r, "block-player", r.player_id, () => {
          const p = get(a, r.player_id, "player");
          requireValue(p, "Player not found.");
          requireValue(typeof r.blocked === "boolean", "Invalid blocked flag.");
          return put(a, { ...p, blocked: r.blocked });
        });
      case "review-entry":
        return audit(a, r, "review-entry", r.submission_id, () => {
          const e = get(a, r.submission_id, "entry");
          requireValue(e, "Entry not found.");
          requireValue(
            !get(a, `plan:${e.competition_id}`, "plan"),
            "Prize plan already frozen.",
          );
          requireValue(
            !e.refund || r.refund,
            "An entry refund cannot be reversed.",
          );
          requireValue(
            typeof r.disqualified === "boolean" &&
              typeof r.refund === "boolean" &&
              (!r.refund || r.disqualified),
            "Invalid entry review.",
          );
          const result = put(a, {
            ...e,
            disqualified: r.disqualified,
            refund: e.refund || r.refund,
          });
          refunds(a);
          return result;
        });
      case "hold":
        return audit(a, r, "hold", r.payment_id, () => {
          const o = get(a, r.payment_id, "outgoing");
          requireValue(
            o && typeof r.held === "boolean",
            "Payment not found or invalid hold flag.",
          );
          return put(a, { ...o, held: r.held });
        });
      case "repair":
        return audit(a, r, "repair", r.payment_id, () => {
          const o = get(a, r.payment_id, "outgoing");
          requireValue(
            o && !o.attempted && o.status !== "PAID",
            "Attempted invoices cannot be replaced through this host.",
          );
          return put(a, {
            ...o,
            address: address(r.lightning_address),
            bolt11: "",
            payment_hash: "",
            held: true,
          });
        });
      case "pause":
        return audit(a, r, "pause", a.id, () => {
          saveArena({
            ...a,
            config: {
              ...a.config,
              enabled: false,
              leaderboard_enabled: false,
              automatic_payouts: false,
            },
          });
          return { paused: true };
        });
      case "prepare":
        return audit(a, r, "prepare", r.competition_id, () =>
          prepare(a, r.competition_id),
        );
      case "settle":
        return audit(a, r, "settle", r.competition_id, () => {
          const plan = prepare(a, r.competition_id);
          for (const o of all(a, "outgoing", {
            competition_id: r.competition_id,
          }))
            transfer(a, o.id, true);
          return plan;
        });
      case "retry":
        return audit(a, r, "retry", r.payment_id, () =>
          transfer(a, r.payment_id, true),
        );
      case "reconcile":
        return audit(a, r, "reconcile", r.payment_id, () =>
          transfer(a, r.payment_id, false),
        );
      default:
        throw Error("Unknown operator operation.");
    }
  });
}
