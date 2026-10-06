(async function () {
  const $ = (id) => document.getElementById(id),
    bridge = window.SatsHoleBridge;
  let config = {},
    page = 0,
    configured = false;
  const tabs = Array.from(
    document.querySelectorAll('.admin-tabs [role="tab"]'),
  );
  function selectTab(selected, focus = false) {
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      $(tab.getAttribute("aria-controls")).hidden = !active;
    }
    if (focus) selected.focus();
  }
  tabs.forEach((tab, index) => {
    tab.onclick = () => selectTab(tab);
    tab.onkeydown = (event) => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft")
        next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(tabs[next], true);
    };
  });
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
  const groups = [
    [
      "Official play",
      "Availability and the cost of an official attempt.",
      ["enabled", "game_price", "free_runs"],
    ],
    [
      "City rules",
      "Set the length and difficulty of each game.",
      ["duration", "ai_count", "competitor_aggression", "death_penalty"],
    ],
    [
      "Attempt expiry",
      "How long players have to pay and start their purchased run.",
      ["invoice_expiry", "ready_expiry"],
    ],
    [
      "Leaderboard entries",
      "Choose which official runs can enter the weekly competition.",
      [
        "leaderboard_enabled",
        "allow_free_entries",
        "leaderboard_price",
        "prize_percentage",
      ],
    ],
    [
      "Prize allocation",
      "Podium shares must total 100%.",
      [
        "first_percentage",
        "second_percentage",
        "third_percentage",
        "undistributed_policy",
        "settlement_delay",
      ],
    ],
    [
      "Weekly schedule",
      "Closing times follow the selected timezone, including daylight saving.",
      ["timezone", "close_weekday", "close_hour", "close_minute"],
    ],
  ];
  const choices = {
    competitor_aggression: [
      "Passive",
      "Timid",
      "Cautious",
      "Reserved",
      "Balanced",
      "Assertive",
      "Aggressive",
      "Fierce",
      "Ruthless",
      "Relentless",
    ].map((n, i) => [i + 1, `${i + 1} · ${n}`]),
    close_weekday: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ].map((n, i) => [i, n]),
    undistributed_policy: [
      ["carry", "Carry forward to the next week"],
      ["hold", "Hold for operator review"],
    ],
  };
  const limits = {
    game_price: [1, 100000],
    free_runs: [0, 100],
    duration: [10, 300],
    ai_count: [0, 16],
    death_penalty: [0, 100],
    invoice_expiry: [60, 3600],
    ready_expiry: [300, 86400],
    leaderboard_price: [1, 1000000],
    prize_percentage: [0, 100],
    first_percentage: [0, 100],
    second_percentage: [0, 100],
    third_percentage: [0, 100],
    settlement_delay: [60, 604800],
    close_hour: [0, 23],
    close_minute: [0, 59],
  };
  labels.close_weekday = "Closing day";
  labels.competitor_aggression = "Opponent difficulty";
  labels.undistributed_policy = "Unclaimed podium shares";
  labels.timezone = "Timezone";
  const fieldHelp = {
    enabled:
      "Allow players to request new official attempts. Turning this off leaves practice available.",
    game_price:
      "Price of one paid attempt. Paying to play does not include a leaderboard entry.",
    free_runs:
      "Introductory official attempts allowed per player session. Unlimited practice is separate.",
    duration:
      "Length of an official game, measured from the moment the player presses START.",
    ai_count:
      "Number of computer-controlled rival holes in the city. Set to 0 for solo play.",
    competitor_aggression:
      "Higher levels make opponents faster, improve their growth and reactions, and increase pursuit. Level 5 is Balanced.",
    death_penalty:
      "Percentage of the player’s current score lost when another hole consumes them.",
    invoice_expiry:
      "How long an unpaid play invoice remains available in the game. A valid late payment still grants the purchased attempt.",
    ready_expiry:
      "Time allowed to press START after an attempt becomes ready. Leaving after START forfeits the attempt.",
    leaderboard_enabled:
      "Allow eligible verified scores to purchase a weekly entry. Existing accepted entries remain on the board.",
    allow_free_entries:
      "Allow introductory official runs to buy leaderboard entry. Practice scores are never eligible.",
    leaderboard_price:
      "Separate payment required to enter one verified run in the weekly competition.",
    prize_percentage:
      "Share of each accepted entry payment added to the prize pool. The remainder is operator revenue.",
    first_percentage: "First place’s share of the weekly prize pool.",
    second_percentage: "Second place’s share of the weekly prize pool.",
    third_percentage:
      "Third place’s share of the weekly prize pool. All three podium shares must total 100%.",
    undistributed_policy:
      "When a podium position has no recipient, carry its share to the next week or retain it as an outstanding liability.",
    settlement_delay:
      "Minimum time after the weekly close before the operator can freeze a prize plan and send payments.",
    timezone:
      "IANA timezone name, for example Europe/London or America/New_York. The weekly close follows local daylight-saving changes.",
    close_weekday:
      "Day of the week when entries close. Payment must be confirmed by the extension before the cutoff.",
    close_hour:
      "Hour in the selected timezone, using the 24-hour clock: 0 is midnight and 21 is 9 pm.",
    close_minute: "Minute within the closing hour, from 0 to 59.",
  };
  function fields() {
    const box = $("fields");
    box.replaceChildren();
    for (const [title, description, keys] of groups) {
      const section = document.createElement("fieldset");
      section.className = "settings-section";
      const legend = document.createElement("legend");
      legend.textContent = title;
      const help = document.createElement("p");
      help.className = "section-help";
      help.textContent = description;
      const grid = document.createElement("div");
      grid.className =
        "field-grid" + (title === "Prize allocation" ? " prize-grid" : "");
      section.append(legend, help, grid);
      for (const key of keys) {
        const label = document.createElement("label");
        label.className = "field";
        const caption = document.createElement("span");
        caption.textContent = labels[key];
        const input = document.createElement(choices[key] ? "select" : "input");
        input.id = "setting-" + key;
        if (typeof config[key] === "boolean") {
          input.type = "checkbox";
          input.checked = config[key];
          label.classList.add("toggle-field");
          label.append(input, caption);
        } else {
          if (choices[key])
            for (const [value, text] of choices[key]) {
              const option = document.createElement("option");
              option.value = value;
              option.textContent = text;
              input.append(option);
            }
          else input.type = typeof config[key] === "number" ? "number" : "text";
          input.value = config[key];
          input.dataset.numeric = String(typeof config[key] === "number");
          if (limits[key]) {
            input.min = limits[key][0];
            input.max = limits[key][1];
            input.step = 1;
          }
          input.required = true;
          label.append(caption, input);
          if (key === "timezone") label.classList.add("wide-field");
        }
        if (fieldHelp[key]) {
          const hint = document.createElement("small");
          hint.id = "help-" + key;
          hint.className = "field-help";
          hint.textContent = fieldHelp[key];
          input.setAttribute("aria-describedby", hint.id);
          if (input.type === "checkbox") caption.append(hint);
          else label.append(hint);
        }
        grid.append(label);
      }
      box.append(section);
    }
  }
  function metrics(data) {
    const box = $("metrics");
    box.replaceChildren();
    for (const [key, title] of [
      ["game_revenue", "Game revenue"],
      ["operator_revenue", "Leaderboard revenue"],
      ["prize_liability", "Prizes outstanding"],
      ["refund_liability", "Refunds outstanding"],
    ]) {
      const card = document.createElement("div");
      card.className = "metric-card";
      const caption = document.createElement("span");
      caption.textContent = title;
      const amount = document.createElement("strong");
      amount.textContent = Number(data[key] || 0).toLocaleString() + " sats";
      card.append(caption, amount);
      box.append(card);
    }
  }
  async function load() {
    const s = await call("settings");
    configured = s.configured;
    config = s.config;
    if (s.wallet_id) $("wallet").value = s.wallet_id;
    $("wallet").disabled = configured;
    fields();
    const publicPath =
      s.public_url ||
      (s.arena_id
        ? `/ext/satsholewasm/arenas/${encodeURIComponent(s.arena_id)}/play`
        : "");
    const publicUrl = publicPath
      ? new URL(publicPath, window.location.href).href
      : "";
    $("public-link").value = publicUrl;
    $("copy-public-link").disabled = $("open-public-link").disabled =
      !publicUrl;
    $("share-help").textContent = publicUrl
      ? "Share this link so anyone can play without an LNbits account."
      : "Choose a receiving wallet and save settings to create your public game link.";
    $("share-status").textContent = "";
    $("copy-public-link").onclick = async () => {
      try {
        await navigator.clipboard.writeText(publicUrl);
        $("share-status").textContent = "Game link copied.";
      } catch {
        $("public-link").focus();
        $("public-link").select();
        $("share-status").textContent =
          "Link selected. Copy it with Ctrl+C or Command+C.";
      }
    };
    $("open-public-link").onclick = () =>
      bridge
        .send({ action: "navigation.open_new_tab", url: publicUrl })
        .catch(error);
    if (!configured) return;
    const m = await call("metrics");
    metrics(m);
    const o = await call("operations");
    $("operations").replaceChildren();
    if (!o.competitions.length && !o.payments.length)
      $("operations").textContent =
        "No competitions or payments to review yet.";
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
    $("audit").textContent = review.audit.length
      ? JSON.stringify(review.audit, null, 2)
      : "No operator actions recorded yet.";
    $("runs").replaceChildren();
    $("previous").disabled = page === 0;
    $("next").disabled = review.runs.length < 25;
    if (!review.runs.length)
      $("runs").textContent = "No runs on this page yet.";
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
  async function saveSettings() {
    if (!$("settings").reportValidity()) return;
    const button = $("save-settings");
    if (button.disabled) return;
    button.disabled = true;
    try {
      for (const key of Object.keys(labels)) {
        const input = $("setting-" + key);
        config[key] =
          input.type === "checkbox"
            ? input.checked
            : input.type === "number" || input.dataset.numeric === "true"
            ? Number(input.value)
            : input.value;
      }
      await call("save-settings", { wallet_id: $("wallet").value, config });
      await load();
      $("error").textContent =
        "Settings saved. Financial and game rules apply to the next competition.";
    } catch (e) {
      error(e);
    } finally {
      button.disabled = false;
    }
  }
  $("save-settings").onclick = saveSettings;
  $("settings").onsubmit = (event) => event.preventDefault();
  $("settings").onkeydown = (event) => {
    if (event.key === "Enter" && event.target.tagName === "INPUT") {
      event.preventDefault();
      saveSettings();
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
  async function applyEntryReview() {
    const f = $("review-entry");
    if (!f.reportValidity()) return;
    const button = $("apply-entry-review");
    if (button.disabled) return;
    button.disabled = true;
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
    } finally {
      button.disabled = false;
    }
  }
  $("apply-entry-review").onclick = applyEntryReview;
  $("review-entry").onsubmit = (event) => event.preventDefault();
  $("review-entry").onkeydown = (event) => {
    if (event.key === "Enter" && event.target.tagName === "INPUT") {
      event.preventDefault();
      applyEntryReview();
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
