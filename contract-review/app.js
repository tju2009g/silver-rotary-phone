/* UI controller: input handling, rendering, exports and the optional Claude review. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } }
  };

  const STATUSES = ["Deviation", "Missing", "Review", "Fallback", "Compliant"];
  const state = { side: "seller", pbSide: "seller", playbook: null, report: null, filter: null, fileName: "" };

  /* ---------------- Playbook ---------------- */
  function loadPlaybook() {
    const saved = store.get("crp.playbook");
    if (saved) { try { const p = JSON.parse(saved); if (p && Array.isArray(p.rules)) return p; } catch (e) { /* ignore corrupt copy */ } }
    return JSON.parse(JSON.stringify(window.DEFAULT_PLAYBOOK));
  }
  state.playbook = loadPlaybook();

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 1800);
  }

  /* ---------------- Tabs ---------------- */
  function show(view) {
    $$(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === view)));
    $$(".view").forEach((v) => (v.hidden = v.id !== "view-" + view));
    window.scrollTo({ top: 0 });
  }
  $$(".tab").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));

  /* ---------------- Position ---------------- */
  function setSide(side) {
    state.side = side;
    $$("[data-side]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.side === side)));
  }
  $$("[data-side]").forEach((b) => b.addEventListener("click", () => { setSide(b.dataset.side); if (state.report) run(); }));
  $("#ourName").value = store.get("crp.ourName") || "";
  $("#ourName").addEventListener("change", (e) => store.set("crp.ourName", e.target.value));

  /* ---------------- File input ---------------- */
  const loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("Could not load " + src.split("/").slice(-2).join("/") + " (offline?) — paste the text instead."));
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  async function readDocx(buf) {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js");
    const r = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return r.value;
  }
  async function readPdf(buf) {
    const base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
    await loadScript(base + "pdf.min.js");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.js";
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      let lastY = null, line = "";
      for (const it of tc.items) {
        const y = it.transform ? it.transform[5] : null;
        if (lastY != null && y != null && Math.abs(y - lastY) > 2) { out += line.trimEnd() + "\n"; line = ""; }
        line += it.str + (it.hasEOL ? "" : "");
        if (it.hasEOL) { out += line.trimEnd() + "\n"; line = ""; lastY = null; continue; }
        lastY = y;
      }
      out += line.trimEnd() + "\n\n";
    }
    return out;
  }
  async function handleFile(f) {
    if (!f) return;
    const st = $("#fileStatus");
    st.innerHTML = `<span class="spinner"></span> Reading ${esc(f.name)}…`;
    try {
      const name = f.name.toLowerCase();
      let text;
      if (name.endsWith(".docx")) text = await readDocx(await f.arrayBuffer());
      else if (name.endsWith(".pdf")) text = await readPdf(await f.arrayBuffer());
      else if (name.endsWith(".doc")) throw new Error("Legacy .doc is not supported — save as .docx or PDF.");
      else text = await f.text();
      if (!text || text.trim().length < 50) throw new Error("No readable text found (scanned PDF? run OCR first).");
      $("#contractText").value = text;
      state.fileName = f.name;
      st.textContent = `Loaded ${f.name} · ${text.trim().split(/\s+/).length.toLocaleString()} words`;
      run();
    } catch (e) {
      st.textContent = "⚠ " + e.message;
    }
  }
  const drop = $("#drop");
  drop.addEventListener("click", () => $("#file").click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#file").click(); } });
  $("#file").addEventListener("change", (e) => handleFile(e.target.files[0]));
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));

  $$("[data-sample]").forEach((b) => b.addEventListener("click", () => {
    const s = window.SAMPLES[b.dataset.sample];
    $("#contractText").value = s.text;
    $("#ourName").value = s.ourName;
    state.fileName = s.title;
    $("#fileStatus").textContent = `Sample loaded: ${s.title}`;
    setSide(s.position);
    run();
  }));

  /* ---------------- Run ---------------- */
  function run() {
    const text = $("#contractText").value;
    if (!text.trim()) { toast("Upload or paste a contract first"); return; }
    state.report = window.ReviewEngine.review(text, state.playbook, state.side, $("#ourName").value);
    state.report.docName = state.fileName || "Pasted contract";
    state.filter = null;
    renderReport();
    renderClauses();
  }
  $("#runBtn").addEventListener("click", run);

  /* ---------------- Render: report ---------------- */
  const rulesById = () => Object.fromEntries(state.playbook.rules.map((r) => [r.id, r]));

  function renderReport() {
    const R = state.report;
    const el = $("#report");
    if (!R) return;
    const pos = state.playbook.positions[R.side];
    const counts = Object.fromEntries(STATUSES.map((s) => [s, R.findings.filter((f) => f.status === s).length]));
    const us = R.meta.parties.find((p) => p.side === R.side);
    const them = R.meta.parties.find((p) => p.side !== R.side);
    const price = R.meta.price ? `${R.meta.price.currency} ${Number(R.meta.price.value).toLocaleString("en-US")}` : R.meta.priceText || "Not identified";
    const escal = R.findings.filter((f) => f.status === "Deviation" || f.status === "Missing").length;
    const outcome = R.outcome || (escal ? `Not ready for signature on current terms: ${escal} issue${escal > 1 ? "s" : ""} outside playbook authority or missing, ${counts.Fallback} within negotiator fallback authority.` : counts.Fallback ? `No escalations. ${counts.Fallback} fallback concession${counts.Fallback > 1 ? "s" : ""} to record.` : "No playbook triggers detected. Read the full text before signature.");
    const filtered = state.filter ? R.findings.filter((f) => f.status === state.filter) : R.findings;
    const decs = Object.entries(R.decisions || {});
    el.innerHTML = `
      <div class="rep-head">
        <div>
          <h2>${esc(R.docName)}</h2>
          <div class="sub">${esc(pos ? pos.label : R.side)} · Playbook ${esc(R.playbook.id)} · ${R.engine === "ai" ? `Claude review (${esc(R.model || "")})` : "Rule engine"} · ${new Date(R.createdAt).toLocaleString()}</div>
        </div>
        <div class="row no-print">
          <span class="risk ${esc(R.overall)}">Overall risk: ${esc(R.overall)}</span>
          <button class="btn sm" id="mdBtn" type="button">Export .md</button>
          <button class="btn sm" id="printBtn" type="button">Print / PDF</button>
        </div>
      </div>
      <p style="padding:0 18px" class="hint">${esc(outcome)}</p>
      <dl class="snap">
        <div><dt>We act for</dt><dd>${esc(us ? `${us.name} (${us.role})` : R.ai && R.ai.represented_party ? R.ai.represented_party : pos.short)}</dd></div>
        <div><dt>Counterparty</dt><dd>${esc(them ? `${them.name} (${them.role})` : R.ai && R.ai.counterparty ? R.ai.counterparty : "Not identified")}</dd></div>
        <div><dt>Contract price</dt><dd>${esc(price)}</dd></div>
        <div><dt>Incoterms</dt><dd>${esc((R.meta.incoterms || []).join(", ") || R.meta.incotermText || "None found")}</dd></div>
        <div><dt>Governing law</dt><dd>${esc(R.meta.law || "Not identified")}</dd></div>
        <div><dt>Disputes</dt><dd>${esc(R.meta.forum || "Not identified")}</dd></div>
        <div><dt>Document set</dt><dd>${R.clauses.length} sections${R.meta.missingAnnexes && R.meta.missingAnnexes.length ? ` · <span style="color:var(--mis)">missing ${esc(R.meta.missingAnnexes.join(", "))}</span>` : " · complete"}</dd></div>
      </dl>
      ${R.alerts.length ? `<div class="section"><h3>Integrity alerts</h3>${R.alerts.map((a) => `<div class="alert ${a.severity === "high" ? "" : "medium"}"><b>${esc(a.type)}</b>${esc(a.text)}</div>`).join("")}</div>` : ""}
      <div class="section">
        <h3>Scoreboard</h3>
        <div class="score" role="group" aria-label="Filter by status">
          ${STATUSES.map((s) => `<button type="button" data-filter="${s}" aria-pressed="${state.filter === s}"><div class="n" style="color:var(--${{ Compliant: "ok", Fallback: "fb", Deviation: "dev", Missing: "mis", Review: "rev" }[s]})">${counts[s]}</div><div class="t">${s}</div></button>`).join("")}
        </div>
      </div>
      ${decs.length ? `<div class="section"><h3>Decisions required (escalation recommendations)</h3><div class="dec">${decs.map(([who, ids]) => `<div class="dec-row"><strong>${esc(who)}</strong><div>${ids.map((id) => `<span class="chip" data-jump="${esc(id)}">${esc(id)}</span>`).join("")}</div></div>`).join("")}</div><p class="hint" style="margin-top:8px">Recommendations only — no approval has been requested, granted or recorded.</p></div>` : ""}
      <div class="ihead"><span>Rule</span><span>Issue</span><span>Clause</span><span>Status</span><span>Route to</span></div>
      <div class="issues">${filtered.map(issueHtml).join("") || `<div class="empty"><p>No findings with this status.</p></div>`}</div>
      ${state.filter ? `<div class="section no-print"><button class="btn sm" data-filter="" type="button">Show all ${R.findings.length} rules</button></div>` : ""}
    `;
    $$("[data-filter]", el).forEach((b) => b.addEventListener("click", () => { state.filter = b.dataset.filter && state.filter !== b.dataset.filter ? b.dataset.filter : null; renderReport(); }));
    $$("[data-jump]", el).forEach((b) => b.addEventListener("click", () => { state.filter = null; renderReport(); const d = $(`#iss-${b.dataset.jump}`); if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "center" }); } }));
    $$("[data-clause]", el).forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); jumpClause(b.dataset.clause); }));
    $$("[data-copy]", el).forEach((b) => b.addEventListener("click", () => {
      const f = R.findings.find((x) => x.ruleId === b.dataset.copy);
      const txt = f && f.redline ? f.redline.proposed : "";
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast("Proposed clause copied"), () => toast("Copy failed — select the text manually"));
    }));
    $("#mdBtn").addEventListener("click", downloadMd);
    $("#printBtn").addEventListener("click", () => { $$(".issue", el).forEach((d) => (d.open = true)); window.print(); });
  }

  function issueHtml(f) {
    const refs = (f.refs || []).length ? f.refs.map((r) => (r.id ? `<button class="linkref" data-clause="${esc(r.id)}">${esc(r.label)}</button>` : esc(r.label))).join(", ") : esc(f.refLabel || "—");
    const rl = f.redline && f.redline.action !== "None" && f.redline.proposed ? `
      <div class="redline">
        <div class="rl-h"><span><b>${esc(f.redline.action)}</b> · ${esc(f.redline.location)}</span><button class="btn sm no-print" data-copy="${esc(f.ruleId)}" type="button">Copy proposed text</button></div>
        <div class="rl-grid">
          <div><h4>Original</h4><span class="${f.redline.action === "Insert" ? "" : "del"}">${esc(f.redline.action === "Insert" ? "(no corresponding provision)" : f.redline.original || "—")}</span></div>
          <div><h4>Proposed (English)</h4><span class="ins">${esc(f.redline.proposed)}</span></div>
        </div>
        ${(f.redline.extra || []).length ? `<div class="rl-extra"><b>Also:</b> ${f.redline.extra.map(esc).join(" ")}</div>` : ""}
      </div>` : "";
    return `<details class="issue" id="iss-${esc(f.ruleId)}">
      <summary>
        <span class="rid">${esc(f.ruleId)}</span>
        <span class="ttl">${esc(f.issue)}<br><span class="imp ${esc(f.importance)}">${esc(f.category)} · ${esc(f.importance)}</span></span>
        <span class="ref">${esc(f.refLabel || "—")}</span>
        <span class="stc"><span class="st ${esc(f.status)}">${esc(f.status)}</span></span>
        <span class="apr">${esc(f.approver)}</span>
      </summary>
      <div class="ibody">
        ${f.quote ? `<div><h4>Clause · ${refs}</h4><div class="quote">“${esc(f.quote)}”</div></div>` : `<div><h4>Clause</h4><span class="hint">${refs === "—" ? "No corresponding provision found." : refs}</span></div>`}
        <div><h4>Analysis</h4><ul>${(f.analysis || []).map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>
        <div><h4>Recommendation</h4><p>${esc(f.recommendation)}</p></div>
        ${rl}
      </div>
    </details>`;
  }

  /* ---------------- Render: clauses ---------------- */
  function renderClauses() {
    const R = state.report;
    if (!R) return;
    const byClause = {};
    R.findings.forEach((f) => (f.refs || []).forEach((r) => { if (r.id) (byClause[r.id] = byClause[r.id] || []).push(f); }));
    $("#clauseCount").textContent = `${R.clauses.length} sections`;
    $("#clauses").innerHTML = R.clauses.map((c) => `
      <div class="clause ${c.annex ? "annex" : ""}" id="${esc(c.id)}">
        <div class="cl-h"><span class="cl-l">${esc(c.label)}</span><span class="cl-t">${esc(c.heading)}</span>
          <span class="tags">${(byClause[c.id] || []).map((f) => `<span class="st ${esc(f.status)}" title="${esc(f.issue)}">${esc(f.ruleId)}</span>`).join("")}</span></div>
        ${c.text ? `<p>${esc(c.text)}</p>` : ""}
      </div>`).join("");
  }
  function jumpClause(id) {
    show("contract");
    const el = document.getElementById(id);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
  }

  /* ---------------- Markdown export ---------------- */
  function downloadMd() {
    const R = state.report;
    const pos = state.playbook.positions[R.side];
    const line = (s) => String(s || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    let md = `# Contract Review — ${R.docName}\n\n`;
    md += `- **Position:** ${pos.label}\n- **Playbook:** ${R.playbook.id} (${R.playbook.name})\n- **Engine:** ${R.engine === "ai" ? "Claude review (" + (R.model || "") + ")" : "Rule engine"}\n- **Generated:** ${new Date(R.createdAt).toLocaleString()}\n- **Overall risk:** ${R.overall}\n`;
    const price = R.meta.price ? `${R.meta.price.currency} ${Number(R.meta.price.value).toLocaleString("en-US")}` : R.meta.priceText || "n/a";
    md += `- **Parties:** ${(R.meta.parties || []).map((p) => `${p.name} (${p.role})`).join("; ") || "n/a"}\n- **Price:** ${price}\n- **Incoterms:** ${(R.meta.incoterms || []).join(", ") || R.meta.incotermText || "n/a"}\n- **Governing law:** ${R.meta.law || "n/a"}\n- **Disputes:** ${R.meta.forum || "n/a"}\n- **Missing documents:** ${(R.meta.missingAnnexes || []).join(", ") || "none"}\n\n`;
    if (R.outcome) md += `> ${R.outcome}\n\n`;
    if (R.alerts.length) md += `## Integrity alerts\n\n${R.alerts.map((a) => `- **${a.type}:** ${a.text}`).join("\n")}\n\n`;
    const decs = Object.entries(R.decisions || {});
    if (decs.length) md += `## Decisions required\n\n${decs.map(([w, ids]) => `- **${w}:** ${ids.join(", ")}`).join("\n")}\n\n_Escalation recommendations only — no approval has been obtained._\n\n`;
    md += `## Review table\n\n| Rule | Issue | Clause | Status | Route to |\n|---|---|---|---|---|\n`;
    R.findings.forEach((f) => (md += `| ${f.ruleId} | ${line(f.issue)} | ${line(f.refLabel)} | ${f.status} | ${line(f.approver)} |\n`));
    md += `\n## Findings and English redlines\n`;
    R.findings.forEach((f) => {
      md += `\n### ${f.ruleId} — ${f.issue} · **${f.status}**\n\n`;
      if (f.quote) md += `> ${f.refLabel}: "${f.quote}"\n\n`;
      (f.analysis || []).forEach((a) => (md += `- ${a}\n`));
      md += `\n**Recommendation:** ${f.recommendation}\n`;
      if (f.redline && f.redline.action !== "None" && f.redline.proposed) {
        md += `\n**${f.redline.action}** — ${f.redline.location}\n\n`;
        if (f.redline.action !== "Insert") md += `_Original:_ ${f.redline.original}\n\n`;
        md += `_Proposed:_\n\n> ${f.redline.proposed}\n`;
        (f.redline.extra || []).forEach((x) => (md += `\n- ${x}`));
        md += "\n";
      }
    });
    md += `\n---\n_${state.playbook.disclaimer}_\n`;
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `review-${R.playbook.id}-${R.side}-${(R.docName || "contract").replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------------- Playbook view ---------------- */
  function renderPlaybook() {
    const P = state.playbook;
    $("#pbBadge").textContent = P.id;
    $("#pbMeta").innerHTML = `<b>${esc(P.id)}</b> · ${esc(P.name)}<br>${esc(P.company)} · effective ${esc(P.effective)}<br><span>${esc(P.disclaimer)}</span>`;
    $$("[data-pbside]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pbside === state.pbSide)));
    const side = state.pbSide;
    $("#pbRules").innerHTML = P.rules.map((r) => {
      const s = r[side] || {};
      return `<div class="pb-rule">
        <h4><span class="mono" style="color:var(--muted)">${esc(r.id)}</span>${esc(r.title)}<span class="imp ${esc(s.importance || r.importance)}">${esc(r.category)} · ${esc(s.importance || r.importance)}</span></h4>
        <p class="why">${esc(r.why)}</p>
        <div class="pb-tiers">
          <div class="p"><b>Preferred</b>${esc(s.preferred)}</div>
          <div class="f"><b>Fallback (negotiator)</b>${esc(s.fallback)}</div>
          <div class="e"><b>Escalate → ${esc(s.approver)}</b>${esc(s.escalation)}</div>
        </div>
        <details><summary>Model clause (English)</summary><div class="model">${esc(s.model)}</div></details>
      </div>`;
    }).join("");
    $("#pbJson").value = JSON.stringify(P, null, 2);
  }
  $$("[data-pbside]").forEach((b) => b.addEventListener("click", () => { state.pbSide = b.dataset.pbside; renderPlaybook(); }));
  function applyPlaybook(p, msg) {
    if (!p || !Array.isArray(p.rules) || !p.id) throw new Error("Playbook must have an id and a rules array.");
    p.rules.forEach((r) => { if (!r.id || !r.seller || !r.buyer) throw new Error(`Rule ${r.id || "?"} needs id, seller and buyer sections.`); });
    state.playbook = p;
    store.set("crp.playbook", JSON.stringify(p));
    renderPlaybook();
    if (state.report && state.report.engine === "rules") run();
    $("#pbMsg").textContent = msg;
    toast(msg);
  }
  $("#pbApply").addEventListener("click", () => { try { applyPlaybook(JSON.parse($("#pbJson").value), `Applied playbook ${JSON.parse($("#pbJson").value).id}`); } catch (e) { $("#pbMsg").textContent = "⚠ " + e.message; } });
  $("#pbReset").addEventListener("click", () => { store.del("crp.playbook"); applyPlaybook(JSON.parse(JSON.stringify(window.DEFAULT_PLAYBOOK)), "Reset to default TRADE-1.0"); });
  $("#pbDownload").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state.playbook, null, 2)], { type: "application/json" }));
    a.download = `playbook-${state.playbook.id}.json`; a.click();
  });
  $("#pbUploadBtn").addEventListener("click", () => $("#pbUpload").click());
  $("#pbUpload").addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; try { const p = JSON.parse(await f.text()); applyPlaybook(p, `Loaded playbook ${p.id}`); } catch (err) { $("#pbMsg").textContent = "⚠ " + err.message; } });

  /* ---------------- Claude deep review ---------------- */
  // Two connection modes, same prompt (ai-spec.js):
  //  - "service": the Contract Review Wise server holds the Anthropic key; users enter an access code.
  //  - "key": the browser calls the Anthropic API directly with the user's own key.
  const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.2.0/+esm";
  const API_BASE = String((window.CRW_CONFIG || {}).apiBase || "").replace(/\/+$/, "");
  const spin = (t) => `<span class="spinner"></span> ${esc(t)}`;

  function setAiMode(m) {
    if (m === "service" && !API_BASE) m = "key";
    state.aiMode = m;
    store.set("crp.aiMode", m);
    $$("[data-aimode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.aimode === m)));
    $("#aiService").hidden = m !== "service";
    $("#aiKey").hidden = m !== "key";
  }
  $$("[data-aimode]").forEach((b) => b.addEventListener("click", () => setAiMode(b.dataset.aimode)));
  if (!API_BASE) {
    const sb = $('[data-aimode="service"]');
    sb.disabled = true;
    sb.title = "Review service not configured (set apiBase in config.js)";
  }
  setAiMode(API_BASE ? store.get("crp.aiMode") || "service" : "key");

  function showQuota(q, client) {
    const el = $("#quota");
    if (!q) { el.textContent = ""; return; }
    el.textContent = `${client ? client + " · " : ""}${q.used} review${q.used === 1 ? "" : "s"} this month${q.limit != null ? ` of ${q.limit}` : ""}`;
  }
  async function refreshQuota() {
    const code = $("#accessCode").value.trim();
    if (!API_BASE || !code) { showQuota(null); return; }
    try {
      const r = await fetch(API_BASE + "/api/me", { headers: { Authorization: "Bearer " + code } });
      const d = await r.json();
      if (!r.ok) { $("#quota").textContent = "⚠ " + (d.error || "Access code not accepted"); return; }
      state.clientName = d.client;
      showQuota({ used: d.reviews_used, limit: d.monthly_reviews }, d.client);
    } catch (e) { $("#quota").textContent = "⚠ Review service unreachable."; }
  }
  $("#accessCode").addEventListener("change", refreshQuota);

  async function aiViaService(text, model, st) {
    const code = $("#accessCode").value.trim();
    if (!code) { $("#accessCode").focus(); throw new Error("Enter your access code."); }
    if ($("#rememberCode").checked) store.set("crp.code", code); else store.del("crp.code");
    st.innerHTML = spin("Connecting to the review service…");
    let res;
    try {
      res = await fetch(API_BASE + "/api/review", {
        method: "POST",
        headers: { Authorization: "Bearer " + code, "Content-Type": "application/json" },
        body: JSON.stringify({ side: state.side, text, playbook: state.playbook, model, ourName: $("#ourName").value, docName: state.fileName || "Pasted contract" })
      });
    } catch (e) { throw new Error("Could not reach the review service — check your connection."); }
    if (!res.ok) {
      let msg = "";
      try { msg = (await res.json()).error; } catch (e) { /* non-JSON error body */ }
      throw new Error(msg || `Review service error ${res.status}.`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", result = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.type === "start") st.innerHTML = spin("Claude is reviewing…");
        else if (ev.type === "progress") st.innerHTML = spin(`Claude is drafting findings… ${ev.chars.toLocaleString()} chars`);
        else if (ev.type === "error") throw new Error(ev.message);
        else if (ev.type === "result") result = ev;
      }
    }
    if (!result) throw new Error("The review stopped before finishing — retry.");
    showQuota(result.quota, state.clientName);
    return result;
  }

  async function aiViaKey(base, model, st) {
    const key = $("#apiKey").value.trim();
    if (!key) { $("#apiKey").focus(); throw new Error("Enter an Anthropic API key."); }
    if ($("#rememberKey").checked) store.set("crp.key", key); else store.del("crp.key");
    st.innerHTML = spin("Loading SDK…");
    let Anthropic;
    try {
      ({ default: Anthropic } = await import(SDK_URL));
      const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
      const { body, beta } = window.AISpec.buildRequest(state.playbook, state.side, base.clauses, { model, ourName: $("#ourName").value, docName: state.fileName || "Pasted contract" });
      const stream = beta ? client.beta.messages.stream(body) : client.messages.stream(body);
      let chars = 0;
      st.innerHTML = spin("Claude is reviewing…");
      stream.on("text", (d) => { chars += d.length; st.innerHTML = spin(`Claude is drafting findings… ${chars.toLocaleString()} chars`); });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") throw new Error("Claude declined this request" + (msg.stop_details && msg.stop_details.explanation ? `: ${msg.stop_details.explanation}` : "."));
      if (msg.stop_reason === "max_tokens") throw new Error("Response was cut off (max tokens). Try a shorter document.");
      const data = JSON.parse(msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
      return { data, model: msg.model, usage: msg.usage };
    } catch (e) {
      if (Anthropic && e instanceof Anthropic.AuthenticationError) throw new Error("Invalid API key.");
      if (Anthropic && e instanceof Anthropic.PermissionDeniedError) throw new Error("This key cannot use the selected model.");
      if (Anthropic && e instanceof Anthropic.RateLimitError) throw new Error("Rate limited — wait a moment and retry.");
      if (Anthropic && e instanceof Anthropic.BadRequestError) throw new Error("Request rejected: " + e.message);
      if (Anthropic && e instanceof Anthropic.APIConnectionError) throw new Error("Could not reach the Anthropic API (network or CORS).");
      if (Anthropic && e instanceof Anthropic.APIError) throw new Error(`API error ${e.status}: ${e.message}`);
      if (e instanceof SyntaxError) throw new Error("Could not parse Claude's response.");
      throw e;
    }
  }

  async function runAI() {
    const btn = $("#aiBtn"), st = $("#aiStatus");
    const text = $("#contractText").value;
    st.className = "ai-status";
    if (!text.trim()) { toast("Upload or paste a contract first"); return; }
    const base = window.ReviewEngine.review(text, state.playbook, state.side, $("#ourName").value);
    const model = $("#model").value;
    btn.disabled = true;
    try {
      const out = state.aiMode === "service" ? await aiViaService(text, model, st) : await aiViaKey(base, model, st);
      state.report = fromAI(out.data, base, out.model || model);
      state.report.docName = state.fileName || "Pasted contract";
      state.filter = null;
      renderReport(); renderClauses();
      const u = out.usage;
      st.textContent = `Done — ${u ? `${(u.input_tokens + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)).toLocaleString()} in / ${u.output_tokens.toLocaleString()} out tokens` : "complete"}. Re-run the rule engine any time to compare.`;
    } catch (e) {
      st.className = "ai-status err";
      st.textContent = e.message || String(e);
    } finally {
      btn.disabled = false;
    }
  }
  $("#aiBtn").addEventListener("click", runAI);
  if (store.get("crp.key")) { $("#apiKey").value = store.get("crp.key"); $("#rememberKey").checked = true; }
  if (store.get("crp.code")) { $("#accessCode").value = store.get("crp.code"); $("#rememberCode").checked = true; refreshQuota(); }

  function fromAI(d, base, model) {
    const rules = rulesById();
    const byLabel = Object.fromEntries(base.clauses.map((c) => [c.label.toLowerCase(), c]));
    const findRef = (lab) => {
      const k = String(lab).toLowerCase().trim();
      const c = byLabel[k] || byLabel["cl. " + k.replace(/^(clause|cl\.?|section|article)\s*/, "")] || null;
      return c ? { id: c.id, label: c.label } : { label: lab };
    };
    const findings = d.findings.map((f) => {
      const r = rules[f.rule_id] || {};
      const pos = r[base.side] || {};
      return {
        ruleId: f.rule_id, issue: r.title || f.rule_id, category: r.category || "", importance: pos.importance || r.importance || "Medium",
        status: f.status, refs: f.clause_refs.map(findRef), refLabel: f.clause_refs.join(", ") || "—", quote: f.quote, analysis: f.analysis,
        recommendation: f.recommendation, approver: f.approver,
        redline: f.redline && f.redline.action !== "None" ? { action: f.redline.action, location: f.redline.location, original: f.redline.original, proposed: f.redline.proposed, extra: f.redline.also || [] } : null,
        source: "ai"
      };
    }).sort((a, b) => a.ruleId.localeCompare(b.ruleId));
    const decisions = {};
    (d.summary.decisions_required || []).forEach((x) => (decisions[x.approver] = x.rule_ids));
    const s = d.summary;
    return Object.assign({}, base, {
      findings, decisions, overall: s.overall_risk, outcome: s.outcome, engine: "ai", model,
      alerts: (d.integrity_alerts || []).map((t) => ({ type: "Claude", severity: /instruction|ignore|approve|mismatch/i.test(t) ? "high" : "medium", text: t })),
      ai: s,
      meta: Object.assign({}, base.meta, { law: s.governing_law || base.meta.law, forum: s.dispute_forum || base.meta.forum, incotermText: s.incoterm, priceText: s.contract_price, missingAnnexes: s.missing_documents && s.missing_documents.length ? s.missing_documents : base.meta.missingAnnexes }),
      createdAt: new Date().toISOString()
    });
  }

  renderPlaybook();
})();
