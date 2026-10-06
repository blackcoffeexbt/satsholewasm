const bridge = window.SatsHoleBridge;
let contextPromise,
  tokenPromise,
  arenaId,
  playerToken = "";
async function context() {
  if (!contextPromise)
    contextPromise = bridge.send({ action: "context" }).then((c) => {
      arenaId =
        c.routeParams?.arenaId ||
        c.pathParams?.arenaId ||
        c.path_params?.arenaId;
      const match = (c.path || c.url || "").match(/arenas\/([^/]+)/);
      arenaId = arenaId || match?.[1];
      if (!arenaId)
        throw Error("Open the public arena link from the operator page.");
      return c;
    });
  await contextPromise;
  if (!tokenPromise)
    tokenPromise = bridge
      .send({ action: "storage.session.get", key: "player." + arenaId })
      .then((r) => (playerToken = r.value || ""));
  await tokenPromise;
}
export async function request(
  path,
  body,
  method = body === undefined ? "GET" : "POST",
) {
  await context();
  const url = new URL(path, "https://arena.invalid"),
    parts = url.pathname.split("/").filter(Boolean),
    data = {
      ...(body || {}),
      ...Object.fromEntries(url.searchParams),
      player_token: playerToken,
    };
  if (parts[0] === "session") data.action = "session";
  else if (parts[0] === "profile") data.action = "profile";
  else if (parts[0] === "leaderboard" || parts[0] === "competitions")
    data.action = parts[0];
  else if (parts[0] === "runs") {
    data.run_id = parts[1];
    data.action =
      parts.length === 1
        ? "runs"
        : parts[2] === "leaderboard-preview"
        ? "preview"
        : parts[2] || "run-status";
  } else if (parts[0] === "entries") {
    data.submission_id = parts[1];
    data.action = parts[1] ? "entry-status" : "entries";
  } else throw Error("Unknown game request.");
  const result = await bridge.request(
    "/api/v1/ext/satsholewasm/arenas/" + encodeURIComponent(arenaId) + "/call",
    { method: "POST", body: data },
  );
  if (result.player_token) {
    playerToken = result.player_token;
    await bridge.send({
      action: "storage.session.set",
      key: "player." + arenaId,
      value: playerToken,
    });
  }
  return result;
}
export class GameSession {
  constructor() {
    this.info = null;
    this.run = null;
    this.token = null;
    this.poll = null;
  }
  async init() {
    this.info = await request("/session", {});
    return this.info;
  }
  async prepare(free) {
    const existing = this.info?.runs.find(
      (r) => r.status === "READY" || r.status === "WAITING_PAYMENT",
    );
    this.run = existing || (await request("/runs", { free }));
    return this.run;
  }
  async start() {
    const data = await request("/runs/" + this.run.id + "/start", {});
    this.token = data.run_token;
    return data;
  }
  async status() {
    this.run = await request("/runs/" + this.run.id);
    return this.run;
  }
  async finish(inputs) {
    let result = await request("/runs/" + this.run.id + "/finish", {
      run_token: this.token,
      inputs,
    });
    while (result.status === "VERIFYING") {
      await new Promise((resolve) => setTimeout(resolve, 10));
      result = await request("/runs/" + this.run.id + "/verify", {});
    }
    return result;
  }
}
