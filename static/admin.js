(async function () {
  const $ = (id) => document.getElementById(id),
    bridge = window.SatsHoleBridge;
  let config = {},
    page = 0,
    configured = false;
  const labels = {
    enabled: "Accept official games",
    game_price: "Game price (sats)",
    free_runs: "Introductory free attempts per session",
    duration: "Game duration (seconds)",
    ai_count: "AI opponents",
    competitor_aggression: "Opponent aggression (1–10)",
    death_penalty: "Death score penalty (%)",
    invoice_expiry: "Invoice acceptance window (seconds)",
    ready_expiry: "Ready attempt expiry (seconds)",
    leaderboard_enabled: "Accept paid leaderboard entries",
    leaderboard_price: "Entry price (sats)",
    prize_percentage: "Prize contribution (%)",
    first_percentage: "First prize (%)",
    second_percentage: "Second prize (%)",
    third_percentage: "Third prize (%)",
    allow_free_entries: "Allow introductory runs onto paid leaderboard",
    timezone: "Competition IANA timezone",
    close_weekday: "Closing day (0 Monday – 6 Sunday)",
    close_hour: "Closing hour",
    close_minute: "Closing minute",
    settlement_delay: "Winner review delay (seconds)",
    undistributed_policy: "Missing podium recipients (carry or hold)",
  };
  async function call(action, data = {}) {
    return bridge.request("/api/v1/ext/satsholewasm/admin/call", {
      method: "POST",
      body: { action, ...data },
    });
  }
  async function act(action, data) {
    const reason = prompt(
      "Reason for this operator action (at least 3 characters)",
    );
    if (!reason) return;
    const request_id = crypto.randomUUID();
    await call(action, { ...data, reason, request_id });
    await load();
  }
  function error(e) {
    $("error").textContent = e.message || String(e);
  }
  function button(text, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.onclick = async () => {
      b.disabled = true;
      try {
        await fn();
      } catch (e) {
        error(e);
      } finally {
        b.disabled = false;
      }
    };
    return b;
  }
  function item(text) {
    const d = document.createElement("div");
    d.className = "item";
    const p = document.createElement("p");
    p.textContent = text;
    d.append(p);
    return d;
  }
  function fields() {
    const box = $("fields");
    box.replaceChildren();
    for (const [key, label] of Object.entries(labels)) {
      const l = document.createElement("label");
      l.textContent = label;
      const input = document.createElement("input");
      input.id = "setting-" + key;
      input.type =
        typeof config[key] === "boolean"
          ? "checkbox"
          : typeof config[key] === "number"
          ? "number"
          : "text";
      if (input.type === "checkbox") input.checked = config[key];
      else input.value = config[key];
      l.append(input);
      box.append(l);
    }
  }
  async function load() {
    const s = await call("settings");
    configured = s.configured;
    config = s.config;
    if (s.wallet_id) $("wallet").value = s.wallet_id;
    $("wallet").disabled = configured;
    fields();
    $("public-link").replaceChildren();
    if (s.public_url) {
      const a = document.createElement("a");
      a.textContent = "Open public game";
      a.href = s.public_url;
      a.onclick = (e) => {
        e.preventDefault();
        bridge
          .send({ action: "navigation.open_new_tab", url: s.public_url })
          .catch(error);
      };
      $("public-link").append(a, document.createTextNode(" · " + s.public_url));
    }
    if (!configured) return;
    const m = await call("metrics");
    $("metrics").textContent = JSON.stringify(m, null, 2);
    const o = await call("operations");
    $("operations").replaceChildren();
    for (const w of o.competitions) {
      const d = item(
        `Week ending ${new Date(w.ends_at * 1000).toLocaleString()} · ${
          w.status
        }`,
      );
      d.append(
        button("Freeze prize plan", () =>
          act("prepare", { competition_id: w.id }),
        ),
        button("Pay prizes and refunds", () =>
          act("settle", { competition_id: w.id }),
        ),
      );
      $("operations").append(d);
    }
    for (const p of o.payments) {
      const d = item(
        `${p.category} · ${p.amount} sats · ${p.address} · ${p.status}${
          p.held ? " · HELD" : ""
        }`,
      );
      d.append(
        button("Retry saved invoice", () => act("retry", { payment_id: p.id })),
        button(p.held ? "Release hold" : "Hold", () =>
          act("hold", { payment_id: p.id, held: !p.held }),
        ),
      );
      if (!p.attempted)
        d.append(
          button("Repair destination", async () => {
            const lightning_address = prompt("New Lightning Address");
            if (lightning_address)
              await act("repair", { payment_id: p.id, lightning_address });
          }),
        );
      $("operations").append(d);
    }
    const review = await call("review", { page });
    $("audit").textContent = JSON.stringify(review.audit, null, 2);
    $("runs").replaceChildren();
    for (const r of review.runs) {
      const d = item(
        `${r.id} · ${r.status} · score ${
          r.authoritative_score ?? "unverified"
        }`,
      );
      d.append(
        button("Inspect", async () => {
          $("inspection").textContent = JSON.stringify(
            await call("inspect", { run_id: r.id }),
            null,
            2,
          );
        }),
        button("Export replay", async () => {
          const replay = await call("export-replay", { run_id: r.id });
          $("replay").hidden = false;
          $("replay").value = JSON.stringify(replay);
          $("replay").select();
        }),
        button("Block player", () =>
          act("block-player", { player_id: r.player_id, blocked: true }),
        ),
        button("Unblock player", () =>
          act("block-player", { player_id: r.player_id, blocked: false }),
        ),
      );
      $("runs").append(d);
    }
  }
  $("settings").onsubmit = async (e) => {
    e.preventDefault();
    try {
      for (const key of Object.keys(labels)) {
        const input = $("setting-" + key);
        config[key] =
          input.type === "checkbox"
            ? input.checked
            : input.type === "number"
            ? Number(input.value)
            : input.value;
      }
      await call("save-settings", { wallet_id: $("wallet").value, config });
      await load();
      $("error").textContent =
        "Settings saved. Financial and game rules apply to the next competition.";
    } catch (e) {
      error(e);
    }
  };
  $("refresh").onclick = () => load().catch(error);
  $("previous").onclick = () => {
    page = Math.max(0, page - 1);
    load().catch(error);
  };
  $("next").onclick = () => {
    page++;
    load().catch(error);
  };
  $("pause").onclick = () => act("pause", {}).catch(error);
  $("review-entry").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await call("review-entry", {
        submission_id: f.elements.submission_id.value,
        reason: f.elements.reason.value,
        disqualified: f.elements.disqualified.checked,
        refund: f.elements.refund.checked,
        request_id: crypto.randomUUID(),
      });
      await load();
    } catch (e) {
      error(e);
    }
  };
  try {
    const w = await call("wallets");
    for (const wallet of w.wallets) {
      const option = document.createElement("option");
      option.value = wallet.id;
      option.textContent = wallet.name;
      $("wallet").append(option);
    }
    await load();
  } catch (e) {
    error(e);
  }
})();
