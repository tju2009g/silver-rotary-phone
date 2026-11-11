/* =====================================================================
   Contract Review Wise — review API (Cloudflare Worker).
   - The Anthropic API key lives only here (secret ANTHROPIC_API_KEY).
   - Clients authenticate with an access code (only its SHA-256 is stored).
   - The prompt is built server-side from the shared spec; callers send
     only contract text, playbook, side and model — the endpoint cannot be
     used as a general-purpose Claude proxy.
   - Every review is logged to D1 with tokens and estimated cost.
   ===================================================================== */
import Anthropic from "@anthropic-ai/sdk";
import AISpec from "../../ai-spec.js";
import Engine from "../../engine.js";
import { costUsd } from "./pricing.js";

const MAX_TEXT = 300_000;
const MAX_PLAYBOOK = 150_000;
const MAX_BODY = MAX_TEXT + MAX_PLAYBOOK + 20_000;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* ---------------- helpers ---------------- */
function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const h = { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" };
  if (origin && (allowed.includes(origin) || allowed.includes("*"))) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
const json = (obj, status, headers) => new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return "crw_" + btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const bearer = (req) => (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
const monthStart = (d = new Date()) => `${d.toISOString().slice(0, 7)}-01T00:00:00.000Z`;
function nextMonth(ym) { const [y, m] = ym.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; }

async function readJson(req, limit) {
  const len = Number(req.headers.get("Content-Length") || 0);
  if (len > limit) throw new HttpError(413, "Request too large.");
  const text = await req.text();
  if (text.length > limit) throw new HttpError(413, "Request too large.");
  try { return JSON.parse(text); } catch (e) { throw new HttpError(400, "Body must be JSON."); }
}

async function authClient(req, env) {
  const code = bearer(req);
  if (!code) throw new HttpError(401, "Access code required.");
  const row = await env.DB.prepare("SELECT * FROM clients WHERE code_hash = ?").bind(await sha256(code)).first();
  if (!row) throw new HttpError(401, "Invalid access code.");
  if (!row.active) throw new HttpError(403, "This access code has been disabled.");
  return row;
}
async function authAdmin(req, env) {
  if (!env.ADMIN_TOKEN) throw new HttpError(503, "Admin console is disabled (ADMIN_TOKEN not set).");
  const given = bearer(req);
  if (!given || (await sha256(given)) !== (await sha256(env.ADMIN_TOKEN))) throw new HttpError(401, "Invalid admin token.");
}

async function monthReviews(env, clientId) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM usage WHERE client_id = ? AND status = 'ok' AND ts >= ?").bind(clientId, monthStart()).first();
  return r ? Number(r.n) : 0;
}

function errMessage(e) {
  if (e instanceof HttpError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return "The service's Anthropic API key is invalid. Contact the operator.";
  if (e instanceof Anthropic.PermissionDeniedError) return "The service's API key cannot use this model. Contact the operator.";
  if (e instanceof Anthropic.RateLimitError) return "The service is rate limited — retry in a minute.";
  if (e instanceof Anthropic.BadRequestError) return "Claude rejected the request: " + e.message;
  if (e instanceof Anthropic.APIConnectionError) return "Could not reach the Anthropic API — retry.";
  if (e instanceof Anthropic.APIError) return `Claude API error ${e.status}. Retry later.`;
  if (e instanceof SyntaxError) return "Could not parse Claude's response.";
  return "Review failed.";
}

/* ---------------- router ---------------- */
export async function handle(request, env, ctx, deps = {}) {
  const url = new URL(request.url);
  const cors = corsHeaders(request.headers.get("Origin"), env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const p = url.pathname.replace(/\/+$/, "");
    if (p === "/api/health" && request.method === "GET") return json({ ok: true, service: "contract-review-wise" }, 200, cors);
    if (p === "/api/me" && request.method === "GET") {
      const c = await authClient(request, env);
      return json({ client: c.name, month: monthStart().slice(0, 7), reviews_used: await monthReviews(env, c.id), monthly_reviews: c.monthly_reviews }, 200, cors);
    }
    if (p === "/api/review" && request.method === "POST") return await review(request, env, ctx, deps, cors);
    if (p.startsWith("/api/admin/")) return await admin(request, env, p, url, cors);
    return json({ error: "Not found." }, 404, cors);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status, cors);
    console.error(e);
    return json({ error: "Internal error." }, 500, cors);
  }
}

/* ---------------- review ---------------- */
async function review(request, env, ctx, deps, cors) {
  const client = await authClient(request, env);
  const b = await readJson(request, MAX_BODY);
  const side = b.side;
  if (side !== "seller" && side !== "buyer") throw new HttpError(400, "side must be 'seller' or 'buyer'.");
  if (typeof b.text !== "string" || b.text.trim().length < 50) throw new HttpError(400, "Contract text is missing or too short.");
  if (b.text.length > MAX_TEXT) throw new HttpError(413, `Contract text exceeds ${MAX_TEXT.toLocaleString("en-US")} characters.`);
  if (JSON.stringify(b.playbook || null).length > MAX_PLAYBOOK) throw new HttpError(413, "Playbook too large.");
  let playbook;
  try { playbook = AISpec.validatePlaybook(b.playbook); } catch (e) { throw new HttpError(400, e.message); }
  const model = AISpec.MODELS.includes(b.model) ? b.model : AISpec.DEFAULT_MODEL;
  const ourName = String(b.ourName || "").slice(0, 120);
  const docName = String(b.docName || "Contract").slice(0, 120);

  const used = await monthReviews(env, client.id);
  if (client.monthly_reviews != null && used >= client.monthly_reviews) throw new HttpError(429, `Monthly review limit reached (${client.monthly_reviews}). Contact your provider to raise it.`);

  const clauses = Engine.segment(b.text);
  const { body: req, beta } = AISpec.buildRequest(playbook, side, clauses, { model, ourName, docName });
  const anthropic = deps.anthropic || new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const enc = new TextEncoder();
  const send = (o) => w.write(enc.encode(JSON.stringify(o) + "\n"));

  const job = (async () => {
    const started = Date.now();
    let msg = null, status = "ok", error = null;
    try {
      await send({ type: "start", model: req.model });
      const stream = beta ? anthropic.beta.messages.stream(req) : anthropic.messages.stream(req);
      let chars = 0, last = 0;
      stream.on("text", (d) => { chars += d.length; if (chars - last >= 1500) { last = chars; send({ type: "progress", chars }).catch(() => {}); } });
      msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") throw new HttpError(422, "Claude declined this request.");
      if (msg.stop_reason === "max_tokens") throw new HttpError(422, "Response was cut off (max tokens). Try a shorter document.");
      const data = JSON.parse(msg.content.filter((x) => x.type === "text").map((x) => x.text).join(""));
      const limit = client.monthly_reviews;
      await send({
        type: "result", data, model: msg.model,
        usage: { input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens, cache_read_input_tokens: msg.usage.cache_read_input_tokens || 0, cache_creation_input_tokens: msg.usage.cache_creation_input_tokens || 0 },
        quota: { used: used + 1, limit }
      });
    } catch (e) {
      status = "error";
      error = errMessage(e);
      if (!(e instanceof HttpError)) console.error(e);
      await send({ type: "error", message: error }).catch(() => {});
    } finally {
      const u = (msg && msg.usage) || {};
      try {
        await env.DB.prepare(
          "INSERT INTO usage (ts, client_id, model, side, playbook_id, doc_name, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status, error, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(new Date().toISOString(), client.id, (msg && msg.model) || req.model, side, String(playbook.id).slice(0, 60), docName,
          u.input_tokens || 0, u.output_tokens || 0, u.cache_read_input_tokens || 0, u.cache_creation_input_tokens || 0,
          msg ? costUsd(msg.model || req.model, u) : 0, status, error, Date.now() - started).run();
      } catch (e) { console.error("usage log failed", e); }
      await w.close().catch(() => {});
    }
  })();
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job);
  return new Response(readable, { status: 200, headers: { ...cors, "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

/* ---------------- admin ---------------- */
async function admin(request, env, p, url, cors) {
  await authAdmin(request, env);
  const DB = env.DB;
  const ms = monthStart();

  if (p === "/api/admin/clients" && request.method === "GET") {
    const { results } = await DB.prepare(
      `SELECT c.id, c.name, c.code_hint, c.monthly_reviews, c.active, c.created_at,
        COALESCE(SUM(CASE WHEN u.status = 'ok' THEN 1 ELSE 0 END), 0) AS month_reviews,
        COALESCE(SUM(u.cost_usd), 0) AS month_cost_usd,
        COALESCE(SUM(CASE WHEN u.status = 'error' THEN 1 ELSE 0 END), 0) AS month_errors
       FROM clients c LEFT JOIN usage u ON u.client_id = c.id AND u.ts >= ?
       GROUP BY c.id ORDER BY c.id`
    ).bind(ms).all();
    return json({ month: ms.slice(0, 7), clients: results }, 200, cors);
  }

  if (p === "/api/admin/clients" && request.method === "POST") {
    const b = await readJson(request, 10_000);
    const name = String(b.name || "").trim().slice(0, 120);
    if (!name) throw new HttpError(400, "name is required.");
    const limit = b.monthly_reviews === null || b.monthly_reviews === "" || b.monthly_reviews === undefined ? null : Math.max(0, parseInt(b.monthly_reviews, 10));
    if (limit !== null && isNaN(limit)) throw new HttpError(400, "monthly_reviews must be a number or empty.");
    const code = newCode();
    const r = await DB.prepare("INSERT INTO clients (name, code_hash, code_hint, monthly_reviews, active, created_at) VALUES (?, ?, ?, ?, 1, ?)")
      .bind(name, await sha256(code), code.slice(-4), limit, new Date().toISOString()).run();
    return json({ id: r.meta && r.meta.last_row_id, name, monthly_reviews: limit, code, note: "Give this code to the client now. It is not stored and cannot be shown again." }, 201, cors);
  }

  let m = p.match(/^\/api\/admin\/clients\/(\d+)$/);
  if (m && request.method === "POST") {
    const b = await readJson(request, 10_000);
    const sets = [], vals = [];
    if (b.name !== undefined) { sets.push("name = ?"); vals.push(String(b.name).trim().slice(0, 120)); }
    if (b.active !== undefined) { sets.push("active = ?"); vals.push(b.active ? 1 : 0); }
    if (b.monthly_reviews !== undefined) { const v = b.monthly_reviews === null || b.monthly_reviews === "" ? null : parseInt(b.monthly_reviews, 10); if (v !== null && isNaN(v)) throw new HttpError(400, "monthly_reviews must be a number or empty."); sets.push("monthly_reviews = ?"); vals.push(v); }
    if (!sets.length) throw new HttpError(400, "Nothing to update.");
    const r = await DB.prepare(`UPDATE clients SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, Number(m[1])).run();
    if (!r.meta || !r.meta.changes) throw new HttpError(404, "Client not found.");
    return json({ ok: true }, 200, cors);
  }

  m = p.match(/^\/api\/admin\/clients\/(\d+)\/rotate$/);
  if (m && request.method === "POST") {
    const code = newCode();
    const r = await DB.prepare("UPDATE clients SET code_hash = ?, code_hint = ? WHERE id = ?").bind(await sha256(code), code.slice(-4), Number(m[1])).run();
    if (!r.meta || !r.meta.changes) throw new HttpError(404, "Client not found.");
    return json({ code, note: "The previous code no longer works. This code is not stored and cannot be shown again." }, 200, cors);
  }

  if (p === "/api/admin/usage" && request.method === "GET") {
    const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") || "") ? url.searchParams.get("month") : ms.slice(0, 7);
    const { results } = await DB.prepare(
      `SELECT u.id, u.ts, c.name AS client, u.model, u.side, u.playbook_id, u.doc_name, u.input_tokens, u.output_tokens,
        u.cache_read_tokens, u.cache_write_tokens, u.cost_usd, u.status, u.error, u.duration_ms
       FROM usage u JOIN clients c ON c.id = u.client_id
       WHERE u.ts >= ? AND u.ts < ? ORDER BY u.ts`
    ).bind(`${month}-01T00:00:00.000Z`, `${nextMonth(month)}-01T00:00:00.000Z`).all();
    if (url.searchParams.get("format") === "csv") {
      const cols = ["id", "ts", "client", "model", "side", "playbook_id", "doc_name", "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "cost_usd", "status", "error", "duration_ms"];
      const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const csv = [cols.join(","), ...results.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
      return new Response(csv, { status: 200, headers: { ...cors, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="crw-usage-${month}.csv"`, "Cache-Control": "no-store" } });
    }
    return json({ month, rows: results }, 200, cors);
  }

  throw new HttpError(404, "Not found.");
}
