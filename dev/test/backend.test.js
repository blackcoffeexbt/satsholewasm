import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8")
  .replace(/^import .*\n/, "")
  .replace(/export function /g, "function ");
const timezones = readFileSync(
  new URL("../src/timezones.js", import.meta.url),
  "utf8",
);
const engine = readFileSync(
  new URL("../../static/js/engine-city-7.js", import.meta.url),
  "utf8",
);
function harness() {
  const tables = new Map();
  let stamp = 1791288000,
    sequence = 0,
    paymentCalls = 0;
  const storage = {
    get(t, id) {
      return structuredClone(tables.get(t)?.get(id) || null);
    },
    set(t, row) {
      if (!tables.has(t)) tables.set(t, new Map());
      tables.get(t).set(row.id, structuredClone(row));
    },
    delete(t, id) {
      tables.get(t)?.delete(id);
    },
    getPaginated(t, o = {}) {
      let rows = [...(tables.get(t)?.values() || [])].filter((r) =>
        Object.entries(o.filters || {}).every(([k, v]) => r[k] === v),
      );
      if (o.sortBy)
        rows.sort(
          (a, b) => (a[o.sortBy] - b[o.sortBy]) * (o.descending ? -1 : 1),
        );
      return {
        data: structuredClone(
          rows.slice(o.offset || 0, (o.offset || 0) + (o.limit || 25)),
        ),
        total: rows.length,
      };
    },
  };
  const system = {
    now: () => stamp,
    id: (prefix) => prefix + "_" + ++sequence,
    log() {},
  };
  const utils = {
    lightning: {
      randomSecretAndHash: () => ({
        secret: (++sequence).toString(16).padStart(64, "0"),
      }),
      decodeInvoice: (bolt) => ({
        valid: true,
        paymentHash: "f".repeat(64),
        amountMsat: Number(bolt.split(":")[1]) * 1000,
        expiresAt: stamp + 1000,
      }),
      invoiceExpiry: () => stamp + 1000,
    },
  };
  const wallet = {
    listUserWallets: () => [{ id: "wallet-1", name: "Game" }],
    createInvoicePublic: (input) => ({
      paymentHash: (++sequence).toString(16).padStart(64, "0"),
      paymentRequest: "ln:" + input.amount,
    }),
    fetchLnurl: (input) => ({ ok: true, paymentRequest: "ln:" + input.amount }),
    payInvoice: (input) => {
      paymentCalls++;
      return {
        success: true,
        feeMsat: 10,
        paymentHash: "f".repeat(64),
        amountMsat: Number(input.paymentRequest.split(":")[1]) * 1000,
      };
    },
  };
  function boot() {
    const c = vm.createContext({
      storage,
      system,
      wallet,
      utils,
      Intl,
      Date,
      console,
    });
    vm.runInContext(timezones + "\n" + engine + "\n" + source, c);
    return c;
  }
  let c = boot();
  function call(name, r) {
    const result = JSON.parse(c[name](JSON.stringify(r)));
    if (!result.ok) throw Error(result.error);
    return result.data;
  }
  return {
    call,
    tables,
    storage,
    setTime: (t) => (stamp = t),
    time: () => stamp,
    restart: () => (c = boot()),
    paymentCalls: () => paymentCalls,
  };
}
function setup(h, config = {}) {
  h.call("invokeAdmin", {
    action: "save-settings",
    wallet_id: "wallet-1",
    config: { duration: 10, ai_count: 1, free_runs: 3, ...config },
  });
  const a = h.call("invokeAdmin", { action: "settings" }).arena_id;
  const s = h.call("invokePublic", { arenaId: a, action: "session" });
  return {
    a,
    s,
    p: (r) =>
      h.call("invokePublic", {
        arenaId: a,
        player_token: s.player_token,
        ...r,
      }),
    admin: (r) => h.call("invokeAdmin", r),
  };
}
function receipt(h, a, record, hash, kind, amount) {
  return h.call("recordPayment", {
    walletId: "wallet-1",
    status: "success",
    pending: false,
    paymentHash: hash,
    amount: amount * 1000,
    extra: { source_id: a, extra_satsholewasm: { record_id: record, kind } },
  });
}
test("single-use start, hidden seed, immutable replay, restartable checkpoints and engine parity", () => {
  const h = harness(),
    { p, s } = setup(h);
  assert.equal(s.free_remaining, 3);
  const run = p({ action: "runs", free: true });
  assert.equal(run.seed, undefined);
  const start = p({ action: "start", run_id: run.id });
  assert.throws(
    () => p({ action: "start", run_id: run.id }),
    /already started/,
  );
  h.setTime(h.time() + 10);
  let result = p({
    action: "finish",
    run_id: run.id,
    run_token: start.run_token,
    inputs: [
      [0, 100, 0],
      [50, 0, 100],
    ],
  });
  assert.equal(result.status, "VERIFYING");
  h.restart();
  assert.throws(
    () =>
      p({
        action: "finish",
        run_id: run.id,
        run_token: start.run_token,
        inputs: [],
      }),
    /different result/,
  );
  while (result.status === "VERIFYING")
    result = p({ action: "verify", run_id: run.id });
  const context = vm.createContext({});
  vm.runInContext(engine, context);
  assert.equal(
    result.authoritative_score,
    context.SatsHoleEngine.replay(start.seed, start.config, [
      [0, 100, 0],
      [50, 0, 100],
    ]).score,
  );
  assert.equal(result.status, "VERIFIED");
  assert.equal(p({ action: "session" }).free_remaining, 2);
});
test("identity required, run ownership and private storage projection", () => {
  const h = harness(),
    { a, p } = setup(h);
  const run = p({ action: "runs", free: true });
  const other = h.call("invokePublic", { arenaId: a, action: "session" });
  assert.throws(
    () =>
      h.call("invokePublic", {
        arenaId: a,
        action: "start",
        run_id: run.id,
        player_token: other.player_token,
      }),
    /not found/,
  );
  assert.throws(
    () =>
      h.call("invokePublic", { arenaId: a, action: "start", run_id: run.id }),
    /session required/,
  );
  assert.throws(() => p({ action: "settle" }), /Unknown public/);
  assert.equal(
    p({ action: "run-status", run_id: run.id }).run_token,
    undefined,
  );
});
test("paid attempt binds hash, amount and wallet; receipt idempotency and late payment credit", () => {
  const h = harness(),
    { a, p, admin } = setup(h);
  const run = p({ action: "runs", free: false });
  const record = JSON.parse(h.tables.get("records").get(run.id).payload);
  h.setTime(h.time() + 700);
  assert.equal(p({ action: "run-status", run_id: run.id }).status, "EXPIRED");
  assert.throws(
    () => receipt(h, a, run.id, record.payment_hash, "run", 24),
    /amount/,
  );
  receipt(h, a, run.id, record.payment_hash, "run", 25);
  receipt(h, a, run.id, record.payment_hash, "run", 25);
  assert.equal(p({ action: "run-status", run_id: run.id }).status, "READY");
  assert.equal(admin({ action: "metrics" }).game_revenue, 25);
});
test("entry accounting, duplicate refund, cutoff, frozen allocation and invoice reuse", () => {
  const h = harness(),
    { a, p, admin, s } = setup(h, {
      leaderboard_enabled: true,
      allow_free_entries: true,
    });
  const run = p({ action: "runs", free: true });
  const row = JSON.parse(h.tables.get("records").get(run.id).payload);
  h.storage.set("records", {
    ...h.tables.get("records").get(run.id),
    status: "VERIFIED",
    payload: JSON.stringify({
      ...row,
      status: "VERIFIED",
      authoritative_score: 500,
    }),
  });
  const entry = p({
    action: "entries",
    run_id: run.id,
    lightning_address: "test@example.com",
  });
  const entryRow = JSON.parse(h.tables.get("records").get(entry.id).payload);
  receipt(h, a, entry.id, entryRow.payment_hash, "entry", 250);
  receipt(h, a, entry.id, entryRow.payment_hash, "entry", 250);
  receipt(h, a, entry.id, "d".repeat(64), "entry", 250);
  let metrics = admin({ action: "metrics" });
  assert.equal(metrics.prize_liability, 200);
  assert.equal(metrics.refund_liability, 250);
  assert.equal(metrics.operator_revenue, 50);
  const board = p({ action: "leaderboard" });
  assert.equal(board.rankings[0].score, 500);
  h.setTime(board.competition.ends_at + 3601);
  admin({
    action: "prepare",
    competition_id: board.competition.id,
    reason: "Reviewed weekly winners",
    request_id: "prepare-request-0001",
  });
  const plan = admin({ action: "operations" }).competitions.find(
    (w) => w.id === board.competition.id,
  ).plan;
  assert.equal(plan.winners[0].amount, 140);
  assert.equal(plan.carry_amount, 60);
  assert.throws(
    () =>
      admin({
        action: "review-entry",
        submission_id: entry.id,
        reason: "Bad entry",
        request_id: "review-request-0001",
        disqualified: true,
        refund: true,
      }),
    /frozen/,
  );
  admin({
    action: "retry",
    payment_id: plan.winners[0].id,
    reason: "Pay verified winner",
    request_id: "payout-request-0001",
  });
  admin({
    action: "retry",
    payment_id: plan.winners[0].id,
    reason: "Pay verified winner again",
    request_id: "payout-request-0002",
  });
  assert.equal(h.paymentCalls(), 1);
  assert.equal(
    p({ action: "leaderboard", competition_id: board.competition.id }).pot,
    200,
  );
  assert.equal(s.player_token.length, 64);
});
test("DST weekly close, validation, pauses and audited idempotency", () => {
  const h = harness(),
    { p, admin } = setup(h, { timezone: "Europe/London" });
  h.setTime(Date.parse("2026-10-24T12:00:00Z") / 1000);
  const b = p({ action: "leaderboard" });
  assert.equal(
    new Date(b.competition.ends_at * 1000).toISOString(),
    "2026-10-25T21:00:00.000Z",
  );
  admin({
    action: "pause",
    reason: "Operator maintenance",
    request_id: "pause-request-000001",
  });
  assert.throws(() => p({ action: "runs", free: true }), /paused/);
  assert.throws(
    () =>
      admin({
        action: "pause",
        reason: "Different reason",
        request_id: "pause-request-000001",
      }),
    /already used/,
  );
  assert.throws(
    () =>
      admin({
        action: "save-settings",
        wallet_id: "wallet-1",
        config: { automatic_payouts: true },
      }),
    /scheduler/,
  );
  assert.throws(
    () => p({ action: "profile", display_name: "<script>" }),
    /markup/,
  );
});

test("hashed player identity matches SHA-256 and receipt projection recovers interrupted event", () => {
  const h = harness(),
    { a, s, p, admin } = setup(h);
  const hash = createHash("sha256").update(s.player_token).digest("hex");
  assert.equal(JSON.parse(h.tables.get("records").get(hash).payload).id, hash);
  assert.equal(h.tables.get("records").has(s.player_token), false);
  const run = p({ action: "runs", free: false });
  const row = JSON.parse(h.tables.get("records").get(run.id).payload);
  receipt(h, a, run.id, row.payment_hash, "run", 25);
  const wrapper = h.tables.get("records").get(run.id);
  h.storage.set("records", {
    ...wrapper,
    status: "WAITING_PAYMENT",
    payload: JSON.stringify({
      ...JSON.parse(wrapper.payload),
      paid: false,
      status: "WAITING_PAYMENT",
    }),
  });
  receipt(h, a, run.id, row.payment_hash, "run", 25);
  assert.equal(p({ action: "run-status", run_id: run.id }).status, "READY");
  assert.equal(admin({ action: "metrics" }).game_revenue, 25);
});
test("full entry refund conserves receipt allocation and retry action ID is bound to intent", () => {
  const h = harness(),
    { a, p, admin } = setup(h, {
      leaderboard_enabled: true,
      allow_free_entries: true,
    });
  const run = p({ action: "runs", free: true });
  const row = JSON.parse(h.tables.get("records").get(run.id).payload);
  h.storage.set("records", {
    ...h.tables.get("records").get(run.id),
    status: "VERIFIED",
    payload: JSON.stringify({
      ...row,
      status: "VERIFIED",
      authoritative_score: 500,
    }),
  });
  const entry = p({
    action: "entries",
    run_id: run.id,
    lightning_address: "test@example.com",
  });
  const e = JSON.parse(h.tables.get("records").get(entry.id).payload);
  receipt(h, a, entry.id, e.payment_hash, "entry", 250);
  const request = {
    action: "review-entry",
    submission_id: entry.id,
    disqualified: true,
    refund: true,
    reason: "Invalid entry reviewed",
    request_id: "entry-refund-request01",
  };
  admin(request);
  admin(request);
  const m = admin({ action: "metrics" });
  assert.equal(m.prize_liability, 0);
  assert.equal(m.operator_revenue, 0);
  assert.equal(m.refund_liability, 250);
  assert.throws(() => admin({ ...request, refund: false }), /already used/);
  assert.throws(
    () =>
      admin({
        ...request,
        request_id: "entry-refund-request02",
        disqualified: false,
        refund: false,
      }),
    /cannot be reversed/,
  );
});
