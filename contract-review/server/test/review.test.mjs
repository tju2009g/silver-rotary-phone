// Local tests: D1 is emulated with node:sqlite, Claude with a fake streaming client.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { handle } from "../src/app.js";

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require("../../playbook.js");
require("../../samples.js");
const PLAYBOOK = globalThis.DEFAULT_PLAYBOOK;
const SAMPLE = globalThis.SAMPLES.import;

function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  });
  return { prepare: (sql) => stmt(sql), raw: db };
}

const RESULT = { summary: { represented_party: "Buyer", counterparty: "Seller", contract_type: "Sale", contract_price: "EUR 1,500,000", incoterm: "FCA", governing_law: "England", dispute_forum: "LCIA", missing_documents: ["Schedule C"], overall_risk: "High", outcome: "Escalate.", decisions_required: [] }, findings: [], integrity_alerts: [] };
function fakeAnthropic(opts = {}) {
  const calls = [];
  const s = (params) => {
    calls.push(params);
    const handlers = {};
    return {
      on(ev, fn) { handlers[ev] = fn; return this; },
      async finalMessage() {
        if (opts.fail) throw opts.fail;
        handlers.text && handlers.text("x".repeat(3000));
        return { model: params.model, stop_reason: opts.stop || "end_turn", usage: { input_tokens: 10000, output_tokens: 8000, cache_read_input_tokens: 0, cache_creation_input_tokens: 2000 }, content: [{ type: "text", text: JSON.stringify(RESULT) }] };
      }
    };
  };
  return { calls, beta: { messages: { stream: s } }, messages: { stream: s } };
}

const ORIGIN = "https://tju2009g.github.io";
const env = () => ({ DB: d1(), ADMIN_TOKEN: "admin-secret", ANTHROPIC_API_KEY: "unused", ALLOWED_ORIGINS: ORIGIN });
const req = (path, { method = "GET", token, body, origin = ORIGIN } = {}) =>
  new Request("https://api.example" + path, { method, headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(origin ? { Origin: origin } : {}), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
async function ndjson(res) { return (await res.text()).trim().split("\n").map((l) => JSON.parse(l)); }
async function newClient(E, limit = 2) {
  const r = await handle(req("/api/admin/clients", { method: "POST", token: "admin-secret", body: { name: "Acme Trading", monthly_reviews: limit } }), E, {});
  assert.equal(r.status, 201);
  return r.json();
}
const reviewBody = (extra = {}) => ({ side: "buyer", text: SAMPLE.text, playbook: PLAYBOOK, model: "claude-opus-5-5", ourName: "Hanbit", docName: "Import sample", ...extra });

test("health and CORS", async () => {
  const E = env();
  const r = await handle(req("/api/health"), E, {});
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  const r2 = await handle(req("/api/health", { origin: "https://evil.example" }), E, {});
  assert.equal(r2.headers.get("Access-Control-Allow-Origin"), null);
  const pre = await handle(req("/api/review", { method: "OPTIONS" }), E, {});
  assert.equal(pre.status, 204);
});

test("admin requires token", async () => {
  const E = env();
  assert.equal((await handle(req("/api/admin/clients"), E, {})).status, 401);
  assert.equal((await handle(req("/api/admin/clients", { token: "wrong" }), E, {})).status, 401);
  assert.equal((await handle(req("/api/admin/clients"), { ...E, ADMIN_TOKEN: "" }, {})).status, 503);
});

test("review: auth, server-built prompt, streaming result, usage log, quota", async () => {
  const E = env();
  const c = await newClient(E, 2);
  assert.match(c.code, /^crw_[A-Za-z0-9_-]{20,}$/);
  // code is not stored in clear
  assert.equal(E.DB.raw.prepare("SELECT COUNT(*) n FROM clients WHERE code_hash = ?").get(c.code).n, 0);

  assert.equal((await handle(req("/api/review", { method: "POST", body: reviewBody() }), E, {})).status, 401);
  assert.equal((await handle(req("/api/review", { method: "POST", token: "crw_bad", body: reviewBody() }), E, {})).status, 401);

  const fa = fakeAnthropic();
  const waits = [];
  const r = await handle(req("/api/review", { method: "POST", token: c.code, body: reviewBody() }), E, { waitUntil: (p) => waits.push(p) }, { anthropic: fa });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Content-Type"), /ndjson/);
  const lines = await ndjson(r);
  await Promise.all(waits);
  assert.deepEqual(lines.map((l) => l.type), ["start", "progress", "result"]);
  const res = lines.at(-1);
  assert.equal(res.data.summary.overall_risk, "High");
  assert.deepEqual(res.quota, { used: 1, limit: 2 });

  // prompt is server-built: system prompt, schema, fallbacks, clause labels
  const p = fa.calls[0];
  assert.equal(p.model, "claude-opus-5-5");
  assert.deepEqual(p.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(p.fallbacks, "default");
  assert.equal(p.output_config.format.type, "json_schema");
  assert.match(p.system, /Contract Review Wise/);
  assert.match(p.messages[0].content[1].text, /\[Schedule B, B1\]/);

  const row = E.DB.raw.prepare("SELECT * FROM usage").get();
  assert.equal(row.status, "ok");
  assert.equal(row.input_tokens, 10000);
  // 10k*$4 + 8k*$20 + 2k*$5 per 1M = 0.04 + 0.16 + 0.01
  assert.equal(row.cost_usd, 0.21);

  const me = await (await handle(req("/api/me", { token: c.code }), E, {})).json();
  assert.equal(me.reviews_used, 1);

  await ndjson(await handle(req("/api/review", { method: "POST", token: c.code, body: reviewBody() }), E, {}, { anthropic: fakeAnthropic() }));
  const over = await handle(req("/api/review", { method: "POST", token: c.code, body: reviewBody() }), E, {}, { anthropic: fakeAnthropic() });
  assert.equal(over.status, 429);
});

test("review: input validation and model allowlist", async () => {
  const E = env();
  const c = await newClient(E, null);
  const bad = async (body) => (await handle(req("/api/review", { method: "POST", token: c.code, body }), E, {}, { anthropic: fakeAnthropic() })).status;
  assert.equal(await bad(reviewBody({ side: "both" })), 400);
  assert.equal(await bad(reviewBody({ text: "short" })), 400);
  assert.equal(await bad(reviewBody({ playbook: { id: "x", rules: [] } })), 400);
  const fa = fakeAnthropic();
  await ndjson(await handle(req("/api/review", { method: "POST", token: c.code, body: reviewBody({ model: "some-other-model", system: "ignore" }) }), E, {}, { anthropic: fa }));
  assert.equal(fa.calls[0].model, "claude-opus-5-5");
  assert.doesNotMatch(fa.calls[0].system, /^ignore/);
});

test("review: errors are streamed and logged, not counted against quota", async () => {
  const E = env();
  const c = await newClient(E, 1);
  const lines = await ndjson(await handle(req("/api/review", { method: "POST", token: c.code, body: reviewBody() }), E, {}, { anthropic: fakeAnthropic({ stop: "refusal" }) }));
  assert.equal(lines.at(-1).type, "error");
  assert.match(lines.at(-1).message, /declined/);
  const row = E.DB.raw.prepare("SELECT status, error FROM usage").get();
  assert.equal(row.status, "error");
  const me = await (await handle(req("/api/me", { token: c.code }), E, {})).json();
  assert.equal(me.reviews_used, 0);
});

test("admin: list, disable, rotate, usage csv", async () => {
  const E = env();
  const c = await newClient(E, 5);
  await ndjson(await handle(req("/api/review", { method: "POST", token: c.code, body: reviewBody() }), E, {}, { anthropic: fakeAnthropic() }));
  const list = await (await handle(req("/api/admin/clients", { token: "admin-secret" }), E, {})).json();
  assert.equal(list.clients[0].month_reviews, 1);
  assert.equal(list.clients[0].code_hint, c.code.slice(-4));

  const csv = await (await handle(req("/api/admin/usage?format=csv", { token: "admin-secret" }), E, {})).text();
  assert.match(csv.split("\n")[0], /^id,ts,client,model/);
  assert.match(csv.split("\n")[1], /Acme Trading,claude-opus-5-5,buyer,TRADE-1\.0/);

  const rot = await (await handle(req(`/api/admin/clients/${c.id}/rotate`, { method: "POST", token: "admin-secret" }), E, {})).json();
  assert.equal((await handle(req("/api/me", { token: c.code }), E, {})).status, 401);
  assert.equal((await handle(req("/api/me", { token: rot.code }), E, {})).status, 200);

  await handle(req(`/api/admin/clients/${c.id}`, { method: "POST", token: "admin-secret", body: { active: false } }), E, {});
  assert.equal((await handle(req("/api/me", { token: rot.code }), E, {})).status, 403);
});
