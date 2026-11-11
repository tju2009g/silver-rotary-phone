// Runs the Worker handler on Node for local end-to-end testing (no Cloudflare account needed).
// D1 is emulated with node:sqlite; Claude is faked unless ANTHROPIC_API_KEY is set.
//   node test/local-server.mjs            -> http://localhost:8787 (fake Claude)
import http from "node:http";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { handle } from "../src/app.js";

const db = new DatabaseSync(process.env.DB_FILE || ":memory:");
db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  first: async () => db.prepare(sql).get(...args) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...args) }),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
});
const env = {
  DB: { prepare: (sql) => stmt(sql) },
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || "local-admin",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || "http://localhost:8080,null"
};

function fakeClaude() {
  const s = (params) => {
    const h = {};
    return {
      on(ev, fn) { h[ev] = fn; return this; },
      async finalMessage() {
        for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 150)); h.text && h.text("y".repeat(1600)); }
        const rules = JSON.parse(params.messages[0].content[0].text.replace(/^<playbook>\n|\n<\/playbook>$/g, "")).rules;
        const data = {
          summary: { represented_party: "Local test party", counterparty: "Counterparty", contract_type: "Sale of goods", contract_price: "n/a", incoterm: "n/a", governing_law: "n/a", dispute_forum: "n/a", missing_documents: [], overall_risk: "Medium", outcome: "Fake Claude result from the local test server.", decisions_required: [{ approver: "Head of Legal", rule_ids: ["T08"] }] },
          findings: rules.map((r) => ({ rule_id: r.id, clause_refs: ["Cl. 1"], quote: "test", status: r.id === "T08" ? "Deviation" : "Compliant", analysis: ["Fake analysis."], recommendation: "n/a", approver: r.id === "T08" ? "Head of Legal" : "—", redline: { action: "None", location: "", original: "", proposed: "", also: [] } })),
          integrity_alerts: []
        };
        return { model: params.model, stop_reason: "end_turn", usage: { input_tokens: 12000, output_tokens: 9000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, content: [{ type: "text", text: JSON.stringify(data) }] };
      }
    };
  };
  return { beta: { messages: { stream: s } }, messages: { stream: s } };
}
const deps = env.ANTHROPIC_API_KEY ? {} : { anthropic: fakeClaude() };

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, body: ["GET", "HEAD", "OPTIONS"].includes(req.method) ? undefined : body });
  const waits = [];
  const response = await handle(request, env, { waitUntil: (p) => waits.push(p) }, deps);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) for await (const chunk of response.body) res.write(chunk);
  res.end();
  await Promise.all(waits);
}).listen(Number(process.env.PORT || 8787), () => console.log(`Contract Review Wise local server on http://localhost:${process.env.PORT || 8787} (${deps.anthropic ? "fake Claude" : "real Claude"}) · admin token: ${env.ADMIN_TOKEN}`));
