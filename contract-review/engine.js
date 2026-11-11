/* =====================================================================
   Rule engine — deterministic, runs fully in the browser.
   Pipeline: segment clauses -> extract deal metadata -> evaluate each
   playbook rule for the selected position -> integrity checks -> score.
   Contract text is treated strictly as data; embedded instructions are
   detected and reported, never followed.
   ===================================================================== */
(function (root) {
  "use strict";

  const STATUS_ORDER = ["Deviation", "Missing", "Review", "Fallback", "Compliant"];
  const worst = (list) => {
    for (const s of STATUS_ORDER) if (list.includes(s)) return s;
    return "Compliant";
  };

  const SELLER_ROLE = "seller|supplier|exporter|vendor|manufacturer";
  const BUYER_ROLE = "buyer|purchaser|importer|customer|distributor";
  const ROLE_RE = { seller: new RegExp(`\\b(${SELLER_ROLE})\\b`, "i"), buyer: new RegExp(`\\b(${BUYER_ROLE})\\b`, "i") };

  const NUMWORDS = {
    "one hundred and eighty": 180, "one hundred eighty": 180, "one hundred and twenty": 120, "one hundred twenty": 120,
    "one hundred and fifty": 150, "one hundred": 100, "forty-five": 45, "thirty-six": 36, "twenty-four": 24,
    "eighteen": 18, "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17, "nineteen": 19, "thirteen": 13,
    "twelve": 12, "eleven": 11, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "ninety": 90,
    "seventy": 70, "eighty": 80, "ten": 10, "nine": 9, "eight": 8, "seven": 7, "six": 6, "five": 5, "four": 4,
    "three": 3, "two": 2, "one": 1
  };
  const WORDS_ALT = Object.keys(NUMWORDS).sort((a, b) => b.length - a.length).map((w) => w.replace(/-/g, "[- ]")).join("|");

  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const short = (s, n = 230) => { s = norm(s); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
  const fmtNum = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const fmtPct = (n) => `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

  function sentences(t) {
    return norm(t).split(/(?<=[.;!?])\s+(?=[A-Z(“"])/).map((s) => s.trim()).filter(Boolean);
  }

  /** Durations in a unit; returns [{value, index, raw}] */
  function durations(s, unit) {
    const unitRe = unit === "months" ? "months?|years?" : unit === "days" ? "days?|business days?|working days?" : "weeks?";
    const re = new RegExp(`(?:(\\d+(?:\\.\\d+)?)\\)?|\\b(${WORDS_ALT}))\\s*(?:\\((\\d+(?:\\.\\d+)?)\\)\\s*)?(?:calendar\\s+|consecutive\\s+|full\\s+|business\\s+|working\\s+)?(${unitRe})\\b`, "gi");
    const out = [];
    let m;
    while ((m = re.exec(s))) {
      let v = m[3] ? parseFloat(m[3]) : m[1] ? parseFloat(m[1]) : NUMWORDS[m[2].toLowerCase().replace(/\s+/g, m[2].includes("-") ? "-" : " ")] ?? NUMWORDS[m[2].toLowerCase().replace(/ /g, "-")];
      if (v == null || isNaN(v)) continue;
      if (/^year/i.test(m[4])) v = v * 12;
      out.push({ value: v, index: m.index, raw: m[0], unit: m[4].toLowerCase() });
    }
    return out;
  }

  function percents(s) {
    const re = /(\d+(?:\.\d+)?)\s*(?:%|per\s?cent\b|percent\b)/gi;
    const out = [];
    let m;
    while ((m = re.exec(s))) out.push({ value: parseFloat(m[1]), index: m.index, raw: m[0] });
    // de-duplicate "thirty percent (30%)" style (word form has no digits, so only numerics land here)
    return out;
  }

  const CUR_MAP = { "US$": "USD", "$": "USD", "€": "EUR", "₩": "KRW", "£": "GBP", "¥": "JPY", "RMB": "CNY" };
  const CUR_CODES = "USD|EUR|KRW|GBP|JPY|CNY|RMB|AED|SGD|HKD|CHF|AUD|CAD|INR|VND|THB|IDR|MYR|SAR";
  function amounts(s) {
    const out = [];
    const re1 = new RegExp(`(${CUR_CODES}|US\\$|\\$|€|₩|£|¥)\\s?(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)(\\s?(?:million|mn)\\b)?`, "g");
    const re2 = new RegExp(`(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)(\\s?(?:million|mn))?\\s?(${CUR_CODES})\\b`, "g");
    let m;
    while ((m = re1.exec(s))) {
      let v = parseFloat(m[2].replace(/,/g, ""));
      if (m[3]) v *= 1e6;
      out.push({ currency: CUR_MAP[m[1]] || m[1].toUpperCase(), value: v, index: m.index, raw: m[0] });
    }
    while ((m = re2.exec(s))) {
      let v = parseFloat(m[1].replace(/,/g, ""));
      if (m[2]) v *= 1e6;
      const c = CUR_MAP[m[3]] || m[3];
      if (!out.some((o) => Math.abs(o.index - m.index) < 6)) out.push({ currency: c, value: v, index: m.index, raw: m[0] });
    }
    return out.sort((a, b) => a.index - b.index);
  }
  const money = (a) => `${a.currency} ${fmtNum(a.value)}`;

  /* ------------------------------------------------------------------ */
  /* Clause segmentation                                                 */
  /* ------------------------------------------------------------------ */
  function segment(text) {
    const lines = text.replace(/\r/g, "").replace(/ /g, " ").split("\n");
    const clauses = [];
    let annex = null;
    let seenNumbered = false;
    const topHeadings = {};
    let cur = { label: "Preamble", heading: "Preamble", body: [], annex: null, kind: "preamble" };
    const flush = () => {
      const t = norm(cur.body.join(" "));
      if (t || cur.kind !== "preamble") {
        cur.text = t;
        cur.id = "cl-" + clauses.length;
        clauses.push(cur);
      }
    };
    const start = (o) => { flush(); cur = Object.assign({ body: [] }, o); };

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let m;
      if (line.length < 140 && (m = line.match(/^(schedule|annex|appendix|exhibit|attachment)\s+([A-Z0-9]{1,3})\b\s*[.:\-–—]?\s*(.*)$/i)) && !/\b(shall|will|is|are|forms?)\b/i.test(m[3] || "")) {
        const type = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
        annex = `${type} ${m[2].toUpperCase()}`;
        start({ label: annex, heading: norm(m[3]) || annex, annex, kind: "annex-head" });
        seenNumbered = true;
        continue;
      }
      m = line.match(/^(?:(?:article|section|clause)\s+(\d{1,2}(?:\.\d{1,2})*)[.:)]?|(\d{1,2}(?:\.\d{1,2}){1,3})[.)]?|(\d{1,2})[.)])\s+(\S.*)$/i);
      if (m && !/^(?:\d+[.)]?\s*)?(%|per ?cent|days?|months?|years?|weeks?)\b/i.test(m[4])) {
        const num = m[1] || m[2] || m[3];
        let rest = m[4];
        const rootNum = num.split(".")[0];
        let heading = "", body = rest;
        const titled = rest.match(/^([A-Z][A-Za-z ,&/'’\-]{2,60}?)\.\s+(\S.*)$/);
        if (rest.length <= 80 && !/[.;:]$/.test(rest) && !/\b(shall|will|must|may)\b/.test(rest)) { heading = rest; body = ""; }
        else if (titled && titled[1].split(" ").length <= 7) { heading = titled[1]; body = titled[2]; }
        if (!num.includes(".") && heading) topHeadings[(annex || "") + rootNum] = heading;
        if (!heading) heading = topHeadings[(annex || "") + rootNum] || rest.split(" ").slice(0, 6).join(" ") + "…";
        const label = annex ? `${annex}, ¶${num}` : `Cl. ${num}`;
        start({ label, heading, annex, kind: "numbered", num });
        if (body) cur.body.push(body);
        seenNumbered = true;
        continue;
      }
      m = line.match(/^([A-Z]{1,2}\d{1,2}(?:\.\d{1,2})?)[.)]?\s+(\S.*)$/);
      if (m) {
        const label = annex && !m[1].startsWith(annex.split(" ")[1]) ? `${annex}, ${m[1]}` : annex ? `${annex}, ${m[1]}` : m[1];
        start({ label, heading: annex ? (clauses.find((c) => c.annex === annex && c.kind === "annex-head") || {}).heading || annex : m[1], annex, kind: "item", num: m[1] });
        cur.body.push(m[2]);
        continue;
      }
      if (seenNumbered && /^[A-Z][A-Z0-9 &,'’/\-]{3,70}$/.test(line) && line.split(" ").length <= 8 && !/[a-z]/.test(line)) {
        const h = line.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
        start({ label: h, heading: h, annex, kind: "heading" });
        continue;
      }
      cur.body.push(line);
    }
    flush();
    clauses.forEach((c) => { c.full = norm(`${c.heading} ${c.text}`); c.sents = sentences(c.text || c.heading); });
    return clauses;
  }

  /* ------------------------------------------------------------------ */
  /* Search helpers                                                      */
  /* ------------------------------------------------------------------ */
  function scoreClauses(clauses, headRe, bodyRe) {
    return clauses
      .map((c) => ({ c, s: (headRe && headRe.test(c.heading) ? 5 : 0) + (bodyRe ? (c.text.match(new RegExp(bodyRe.source, "gi")) || []).length : 0) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
  }
  /** all sentences matching re -> [{c, s}] */
  function find(clauses, re, filter) {
    const out = [];
    for (const c of clauses) for (const s of c.sents) if (re.test(s) && (!filter || filter.test(s))) out.push({ c, s });
    return out;
  }
  const uniqC = (arr) => { const seen = new Set(); return arr.filter((x) => { const c = x.c || x; if (seen.has(c.id)) return false; seen.add(c.id); return true; }).map((x) => x.c || x); };

  /** Which party a sentence speaks about */
  function subjectOf(s) {
    if (/\b(each|either|neither|both)\s+part(y|ies)\b|\bthe parties\b|\bparties'/i.test(s)) return "both";
    const sm = s.match(new RegExp(`\\b(${SELLER_ROLE})\\b`, "i"));
    const bm = s.match(new RegExp(`\\b(${BUYER_ROLE})\\b`, "i"));
    if (sm && !bm) return "seller";
    if (bm && !sm) return "buyer";
    if (sm && bm) return sm.index < bm.index ? "seller" : "buyer";
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Metadata                                                            */
  /* ------------------------------------------------------------------ */
  const ROLE_WORDS = "Seller|Buyer|Supplier|Purchaser|Exporter|Importer|Vendor|Customer|Manufacturer|Distributor";
  const roleSide = (r) => (new RegExp(`^(${SELLER_ROLE})$`, "i").test(r) ? "seller" : "buyer");

  function extractParties(text) {
    const parties = [];
    const add = (role, name) => {
      name = norm(name).replace(/^(?:.*\b(?:between|by and between)\s+)/i, "").replace(/^(?:and|&)\s+/i, "").replace(/[,;:]+$/, "").trim();
      const suf = name.match(/^(.*?\b(?:Co\.,?\s*Ltd\.?|Ltd\.|Ltd\b|LLC|Inc\.?|GmbH|FZE|FZCO|S\.A\.|SAS|Corporation|Corp\.?|Limited|PLC|B\.V\.|AG|Pte\.?\s*Ltd\.?|JSC))/);
      if (suf) name = suf[1];
      if (!name || name.length < 3) return;
      const side = roleSide(role);
      if (!parties.some((p) => p.side === side)) parties.push({ role: role[0].toUpperCase() + role.slice(1).toLowerCase(), side, name: short(name, 90) });
    };
    let m;
    const reA = new RegExp(`^\\s*(?:the\\s+)?(${ROLE_WORDS})\\s*[:\\-–]\\s*(.+)$`, "gim");
    while ((m = reA.exec(text))) add(m[1], m[2].split(/,\s*(?=[A-Z][a-z]+$)/)[0]);
    const reB = new RegExp(`([A-Z][A-Za-z0-9&.,'’\\- ]{2,90}?(?:Co\\.,?\\s*Ltd\\.?|Ltd\\.?|LLC|L\\.L\\.C\\.|Inc\\.?|GmbH|FZE|FZCO|S\\.A\\.|SAS|Corporation|Corp\\.?|Limited|PLC|B\\.V\\.|AG|Pte\\.?\\s*Ltd\\.?|Pty\\.?\\s*Ltd\\.?|JSC|K\\.K\\.))[^()]{0,160}?\\(\\s*(?:the\\s+|hereinafter\\s+(?:referred\\s+to\\s+as\\s+)?(?:the\\s+)?)?["“]?(${ROLE_WORDS})["”]?\\s*\\)`, "g");
    const flat = norm(text);
    while ((m = reB.exec(flat))) add(m[2], m[1]);
    return parties;
  }

  function extractMeta(text, clauses) {
    const flat = norm(text);
    const parties = extractParties(text);
    let price = null;
    for (const s of sentences(flat)) {
      if (/(contract price|total price|purchase price|total contract value|contract value|total amount|aggregate price)/i.test(s)) {
        const a = amounts(s);
        if (a.length) { price = a.sort((x, y) => y.value - x.value)[0]; break; }
      }
    }
    const all = amounts(flat);
    if (!price && all.length) price = all.slice().sort((x, y) => y.value - x.value)[0];
    const curCount = {};
    all.forEach((a) => (curCount[a.currency] = (curCount[a.currency] || 0) + 1));
    const incoterms = [...new Set((flat.match(/\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/g) || []))];
    return { parties, price, currencies: Object.keys(curCount), incoterms };
  }

  /* ------------------------------------------------------------------ */
  /* Rule evaluators                                                     */
  /* ------------------------------------------------------------------ */
  // Each returns {status, refs:[clause], quote, notes:[string], approver?, redline?:{action, location, original, proposed} | false}
  const E = {};

  E.T01 = (ctx, P) => {
    const hits = find(ctx.clauses, /\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/);
    if (!hits.length) {
      const del = scoreClauses(ctx.clauses, /deliver|shipment/i, /deliver|shipment/i)[0];
      return { status: "Missing", refs: del ? [del] : [], quote: del ? short(del.sents[0]) : "", notes: ["No Incoterms® rule found. Delivery point, cost split and risk transfer are undefined; default law will fill the gap unpredictably."] };
    }
    const terms = [...new Set(hits.map((h) => h.s.match(/\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/)[1]))];
    const h = hits[0];
    const term = terms[0];
    const notes = [];
    const st = [];
    if (terms.length > 1) { st.push("Review"); notes.push(`Multiple Incoterms rules appear (${terms.join(", ")}); confirm which governs each shipment.`); }
    if (P.preferred.includes(term)) { st.push("Compliant"); notes.push(`${term} is a preferred rule for this position.`); }
    else if (P.fallback.includes(term)) { st.push("Fallback"); notes.push(`${term} is a permitted fallback, not the preferred rule (${P.preferred.join("/")}).`); }
    else { st.push("Deviation"); notes.push(`${term} is outside negotiation authority for this position. ${ctx.side === "seller" ? (/^D/.test(term) ? "Seller would carry transit risk to destination" + (term === "DDP" ? " and foreign import duties/VAT" : "") + "." : "Seller loses control over export clearance and export-evidence documentation.") : "Buyer would have to handle export clearance in the Seller's country."}`); }
    const ver = (h.s.match(/incoterms\s*(?:®|\(r\))?\s*(\d{4})/i) || ctx.flat.match(/incoterms\s*(?:®|\(r\))?\s*(\d{4})/i) || [])[1];
    if (!ver) { st.push("Fallback"); notes.push("Incoterms version not stated — specify Incoterms® 2020."); }
    else if (ver !== P.requiredVersion) { st.push("Fallback"); notes.push(`Refers to Incoterms ${ver}; playbook requires Incoterms® ${P.requiredVersion} (e.g. 2010 has no DPU and different CIP insurance level).`); }
    const after = h.s.slice(h.s.indexOf(term) + term.length, h.s.indexOf(term) + term.length + 60);
    if (!/[A-Z][a-z]{2,}/.test(after.replace(/Incoterms/gi, ""))) { st.push("Review"); notes.push("Named place after the Incoterms rule could not be identified — the rule is incomplete without a precise named place."); }
    return { status: worst(st), refs: [h.c], quote: short(h.s), notes };
  };

  E.T02 = (ctx) => {
    const t = find(ctx.clauses, /\btitle\b/i, /(pass|transfer|vest|retain|remain|reserv|property)/i);
    const r = find(ctx.clauses, /\brisk\b/i, /(loss|pass|transfer|damage)/i);
    const refs = uniqC([...t, ...r]);
    const txt = [...t, ...r].map((x) => x.s).join(" ");
    const rot = /(retain|remain|reserv)\w*[^.]{0,80}\btitle\b|\btitle\b[^.]{0,120}\b(remain|retain)\w*[^.]{0,80}(until|unless)[^.]{0,80}(paid|payment)|\btitle\b[^.]{0,80}until[^.]{0,80}(paid|payment)/i.test(txt);
    const late = /(acceptance|accepted|installation|commissioning|arrival at (the )?buyer|receipt by (the )?buyer|buyer'?s? (warehouse|site|premises))/i;
    const riskLate = r.some((x) => late.test(x.s)) || t.some((x) => /\brisk\b/i.test(x.s) && late.test(x.s));
    const notes = [], st = [];
    if (!refs.length) return { status: "Missing", refs: [], quote: "", notes: ["No title or risk clause. Transfer will default to the Incoterms rule (risk only — Incoterms do not govern title) and governing law."] };
    if (ctx.side === "seller") {
      if (!rot) { st.push("Deviation"); notes.push("No retention of title — Seller loses its proprietary security before payment is received."); } else { st.push("Compliant"); notes.push("Retention of title until payment is present."); }
      if (riskLate) { st.push("Deviation"); notes.push("Risk (and/or title) passes only at Buyer's acceptance/arrival — later than the Incoterms delivery point, leaving transit and storage risk with Seller."); }
    } else {
      if (rot) { st.push("Fallback"); notes.push("Seller retains title until full payment — acceptable only if advance payments are secured by a bank guarantee."); } else st.push("Compliant");
      if (r.some((x) => /(signing|execution|order|before shipment|ex[- ]works)/i.test(x.s))) { st.push("Deviation"); notes.push("Risk appears to pass before the Incoterms delivery point."); }
      if (!t.length) { st.push("Review"); notes.push("Title transfer not addressed; Incoterms rules do not govern title."); }
    }
    return { status: worst(st), refs, quote: short((t[0] || r[0]).s), notes };
  };

  E.T03 = (ctx, P) => {
    const notes = [], st = [];
    const refs = [];
    const cur = ctx.meta.currencies;
    const pc = ctx.meta.price;
    if (!cur.length) { st.push("Review"); notes.push("No currency identified for the price."); }
    else {
      const bad = cur.filter((c) => !P.currencies.includes(c));
      if (bad.length) { st.push("Deviation"); notes.push(`Currency ${bad.join(", ")} is outside the approved list (${P.currencies.join(", ")}) — FX exposure requires CFO/treasury sign-off.`); }
      else { st.push("Compliant"); notes.push(`Price currency ${pc ? pc.currency : cur[0]} is approved.`); }
      if (cur.length > 1) { st.push("Review"); notes.push(`Multiple currencies referenced (${cur.join(", ")}).`); }
    }
    const priceHit = find(ctx.clauses, /(contract price|total price|purchase price)/i).find((x) => amounts(x.s).length) || find(ctx.clauses, /(contract price|total price|purchase price)/i)[0];
    if (priceHit) refs.push(priceHit.c);
    const wh = find(ctx.clauses, /withh?old|deduct[^.]{0,40}tax/i);
    const grossUp = /gross(ed)?[- ]?up|additional amount[^.]{0,80}(net|equal)|increase[^.]{0,60}(payment|amount)[^.]{0,80}(net|equal)/i.test(ctx.flat);
    const adj = find(ctx.clauses, /(adjust|escalat|revis|increase)\w*/i, /(price|contract price|cost)/i).filter((x) => !/not (be )?subject to (any )?adjustment|fixed and firm|shall not be (subject to )?adjust/i.test(x.s));
    const fixed = find(ctx.clauses, /fixed and firm|not (be )?subject to (any )?adjustment/i);
    wh.forEach((x) => refs.push(x.c)); adj.forEach((x) => refs.push(x.c));
    if (ctx.side === "seller") {
      if (wh.length && !grossUp) { st.push("Deviation"); notes.push("Buyer may withhold tax with no gross-up — foreign withholding tax comes straight out of Seller's margin. Tax Lead to confirm treaty rate and credit position."); }
      if (!wh.length && !/\btax(es)?\b/i.test(ctx.flat)) { st.push("Fallback"); notes.push("Taxes and duties outside Korea are not allocated."); }
      if (fixed.length && !adj.length) { st.push("Fallback"); notes.push("Price is fixed with no adjustment — confirm quote validity and raw-material/FX hedging."); fixed.forEach((x) => refs.push(x.c)); }
    } else {
      if (adj.length) { st.push("Deviation"); notes.push("Seller has a price-adjustment right — cost risk shifts back to Buyer after signing."); }
      if (grossUp) { st.push("Deviation"); notes.push("Buyer bears a tax gross-up obligation."); }
    }
    const r = uniqC(refs);
    const q = (adj[0] || wh[0] || priceHit || {}).s;
    return { status: worst(st), refs: r, quote: q ? short(q) : "", notes, approver: st.includes("Deviation") && /Currency/.test(notes.join()) ? "CFO" : undefined };
  };

  function advanceInfo(paySents, price) {
    // chunk sentences on commas (not thousands separators), semicolons and " and "
    const res = [];
    for (const x of paySents) {
      const chunks = x.s.split(/,(?!\d{3})|;|\band\b(?=\s+(?:the\s+)?(?:balance|remaining|\d|USD|EUR|KRW|[A-Z]{3}\s?\d))/);
      for (const ch of chunks) {
        if (/(on|upon|at|after|within[^,;]{0,25}(of|after))\s+(the\s+)?(signing|execution|signature|order|contract)|\bin advance\b|advance payment|down[- ]?payment|prepayment|\bdeposit\b/i.test(ch) && !/\bbalance\b/i.test(ch)) {
          const p = percents(ch)[0];
          const a = amounts(ch)[0];
          if (p) res.push({ pct: p.value, calc: `${fmtPct(p.value)} stated`, c: x.c, s: x.s });
          else if (a && price && a.currency === price.currency) res.push({ pct: (a.value / price.value) * 100, calc: `${money(a)} / ${money(price)} = ${fmtPct((a.value / price.value) * 100)}`, c: x.c, s: x.s });
          else if (a) res.push({ pct: null, calc: `${money(a)} (price base unknown)`, c: x.c, s: x.s });
        }
      }
    }
    return res;
  }

  E.T04 = (ctx, P) => {
    const pay = find(ctx.clauses, /\b(pay|payment|paid|letter of credit|L\/C|invoice|instal+ment|T\/T|telegraphic)\b/i).filter((x) => !/liabilit|liquidated|indemn|withh?old|\btitle\b|certificate|packing list|terminat/i.test(x.s));
    const payClauses = scoreClauses(ctx.clauses, /payment|terms of payment/i, /\bpay/i);
    const refs = uniqC([...(payClauses[0] ? [payClauses[0]] : []), ...pay]).slice(0, 4);
    if (!pay.length) return { status: "Missing", refs: [], quote: "", notes: ["No payment terms identified."] };
    const txt = pay.map((x) => x.s).join(" ");
    const notes = [], st = [];
    const lc = /letter of credit|\bL\/C\b|documentary credit/i.test(txt);
    const adv = advanceInfo(pay, ctx.meta.price);
    const advPct = adv.reduce((s, a) => s + (a.pct || 0), 0);
    const oaDays = [];
    pay.forEach((x) => {
      if (/(after|from|following|of)\s+(the\s+)?(date of\s+)?(invoice|bill of lading|B\/L|delivery|shipment|receipt|arrival|acceptance|buyer'?s acceptance)/i.test(x.s) && !/sight|letter of credit/i.test(x.s))
        durations(x.s, "days").forEach((d) => oaDays.push(d.value));
    });
    const maxOA = oaDays.length ? Math.max(...oaDays) : 0;
    const da = /documents against acceptance|\bD\/A\b/i.test(txt);
    const interest = /interest|late payment charge/i.test(ctx.flat);
    const quote = short((adv[0] || pay[0]).s);
    if (ctx.side === "seller") {
      if (lc) {
        const irrevocable = /irrevocable/i.test(txt);
        const ucp = /UCP\s*600/i.test(txt);
        const usance = /usance|days?\s+(after|from)\s+(sight|the date of (the )?(bill of lading|B\/L|shipment))/i.test(txt) ? Math.max(0, ...durations(txt, "days").map((d) => d.value)) : 0;
        if (!irrevocable) { st.push("Deviation"); notes.push("L/C is not stated to be irrevocable."); }
        else st.push("Compliant");
        if (usance > P.maxLcUsanceDays) { st.push("Deviation"); notes.push(`Usance L/C of ${usance} days exceeds ${P.maxLcUsanceDays}-day limit.`); }
        else if (usance > 0) { st.push("Fallback"); notes.push(`Usance L/C (${usance} days) is a fallback; prefer at sight.`); }
        if (!ucp) { st.push("Fallback"); notes.push("L/C should be expressly subject to UCP 600."); }
        if (!/confirm/i.test(txt)) notes.push("Consider requiring confirmation by a first-class bank given country/bank risk.");
      }
      if (adv.length) notes.push(`Advance: ${adv.map((a) => a.calc).join("; ")}.`);
      const coveredByAdvance = advPct >= 99.5;
      if (!lc && !coveredByAdvance) {
        if (da) { st.push("Deviation"); notes.push("D/A terms — Seller releases documents against a promise to pay."); }
        if (maxOA > P.maxOpenAccountDays) { st.push("Deviation"); notes.push(`Unsecured credit of ${maxOA} days exceeds the ${P.maxOpenAccountDays}-day open-account limit${advPct ? ` (only ${fmtPct(advPct)} secured by advance)` : ""}. CFO approval and export credit insurance cover (e.g. K-SURE) required.`); }
        else if (maxOA > 0) { st.push("Fallback"); notes.push(`Open account of ${maxOA} days is within the fallback limit but requires export credit insurance / approved credit limit.`); }
        if (advPct >= P.minAdvancePct && maxOA === 0) { st.push("Compliant"); }
        if (advPct < P.minAdvancePct && maxOA === 0 && !da) { st.push("Review"); notes.push(`Advance of ${fmtPct(advPct)} is below the ${P.minAdvancePct}% preferred level and the security for the balance is unclear.`); }
      }
      if (coveredByAdvance) { st.push("Compliant"); notes.push("100% payment in advance."); }
      if (!interest) { st.push("Fallback"); notes.push("No late-payment interest or suspension right."); }
    } else {
      if (adv.length) {
        const known = adv.filter((a) => a.pct != null);
        if (known.length) {
          notes.push(`Advance payment: ${known.map((a) => a.calc).join("; ")}.`);
          if (advPct > P.maxAdvancePct + 1e-9) { st.push("Deviation"); notes.push(`Advance of ${fmtPct(advPct)} exceeds the ${P.maxAdvancePct}% ceiling — CFO approval required. If reduced, rebalance later instalments so the total still equals the Contract Price.`); }
          else st.push("Compliant");
          if (advPct > 0 && !/guarantee|standby|\bbond\b|SBLC/i.test(ctx.flat)) { st.push("Fallback"); notes.push("Advance payment is not secured by an advance-payment bank guarantee."); }
        } else { st.push("Review"); notes.push(`Advance identified (${adv.map((a) => a.calc).join("; ")}) but the percentage cannot be computed.`); }
      } else st.push("Compliant");
      const shortDays = oaDays.filter((d) => d < P.minPaymentDays);
      if (shortDays.length) { st.push("Fallback"); notes.push(`Payment period of ${Math.min(...shortDays)} days is shorter than the ${P.minPaymentDays}-day standard.`); }
      if (lc) notes.push("Payment by L/C — factor bank charges and the documentary-compliance burden on Seller.");
    }
    return { status: worst(st), refs, quote, notes };
  };

  E.T05 = (ctx, P) => {
    const ld = find(ctx.clauses, /liquidated damages|delay damages|late delivery|penalt(y|ies)|for each (day|week)|per (day|week)/i).filter((x) => /deliver|delay|late|week|day/i.test(x.s));
    const notes = [], st = [];
    const pc = ctx.meta.price;
    if (!ld.length) {
      if (ctx.side === "seller") return { status: "Fallback", refs: [], quote: "", notes: ["No delay LD regime. Seller is exposed to general damages for delay (subject only to the liability cap). Propose capped LDs as the sole remedy for delay."], redline: { action: "Insert" } };
      return { status: "Missing", refs: [], quote: "", notes: ["No delay liquidated damages — Buyer would have to prove actual loss for late delivery."] };
    }
    const txt = ld.map((x) => x.s).join(" ");
    let rate = null, unit = null, cap = null;
    const rm = txt.match(/(\d+(?:\.\d+)?)\s*(?:%|per\s?cent|percent)\)?[^.;]{0,80}?(?:per|for each|each|for every)\s+(?:completed\s+|full\s+|commenced\s+|calendar\s+)?(day|week)/i);
    if (rm) { rate = parseFloat(rm[1]); unit = rm[2].toLowerCase(); }
    const cm = txt.match(/(?:cap(?:ped)?|maximum|not (?:to )?exceed|up to|limited to|aggregate)[^.;%]{0,60}?(\d+(?:\.\d+)?)\s*(?:%|per\s?cent|percent)/i);
    if (cm) cap = parseFloat(cm[1]);
    const weekly = rate != null ? (unit === "day" ? rate * 7 : rate) : null;
    const sole = /sole and exclusive remedy|sole remedy|exclusive remedy|in full (and final )?satisfaction/i.test(txt);
    const withoutPrej = /without prejudice|in addition to/i.test(txt);
    const term = /terminat/i.test(txt) || find(ctx.clauses, /terminat/i, /(delay|liquidated damages)/i).length > 0;
    if (rate != null) notes.push(`Rate: ${fmtPct(rate)} per ${unit}${unit === "day" ? ` (≈ ${fmtPct(weekly)} per week)` : ""}.`);
    if (cap != null) notes.push(`Cap: ${fmtPct(cap)}${pc ? ` (≈ ${pc.currency} ${fmtNum((pc.value * cap) / 100)})` : ""}.`);
    if (ctx.side === "seller") {
      if (weekly == null) { st.push("Review"); notes.push("LD rate could not be read."); }
      else if (weekly > P.maxWeeklyRate + 1e-9) { st.push("Deviation"); notes.push(`Weekly-equivalent rate ${fmtPct(weekly)} exceeds ${fmtPct(P.maxWeeklyRate)}.`); }
      else st.push("Compliant");
      if (cap == null) { st.push("Deviation"); notes.push("No cap on delay LDs."); }
      else if (cap > P.fallbackCap) { st.push("Deviation"); notes.push(`Cap ${fmtPct(cap)} exceeds the ${fmtPct(P.fallbackCap)} fallback ceiling.`); }
      else if (cap > P.maxCap) { st.push("Fallback"); notes.push(`Cap ${fmtPct(cap)} is above the preferred ${fmtPct(P.maxCap)} but within fallback.`); }
      if (!sole) { st.push(withoutPrej ? "Deviation" : "Fallback"); notes.push(withoutPrej ? "LDs are expressly 'without prejudice' to other remedies — Buyer can claim LDs and general damages." : "LDs are not stated to be the sole and exclusive remedy for delay."); }
      notes.push("LDs should count toward, not sit outside, the aggregate liability cap.");
    } else {
      if (weekly == null) { st.push("Review"); notes.push("LD rate could not be read."); }
      else if (weekly + 1e-9 < P.minWeeklyRate) { st.push("Deviation"); notes.push(`Weekly-equivalent rate ${fmtPct(weekly)} is below ${fmtPct(P.minWeeklyRate)}.`); }
      else st.push("Compliant");
      if (cap == null) notes.push("No stated cap (favourable to Buyer; confirm intent).");
      else if (cap + 1e-9 < P.fallbackMinCap) { st.push("Deviation"); notes.push(`Cap ${fmtPct(cap)} is below the ${fmtPct(P.fallbackMinCap)} floor.`); }
      else if (cap + 1e-9 < P.minCap) { st.push(sole && !term ? "Deviation" : "Fallback"); notes.push(`Cap ${fmtPct(cap)} is below the preferred ${fmtPct(P.minCap)}.`); }
      if (sole && !term) { st.push("Deviation"); notes.push("LDs are the sole and exclusive remedy and there is no termination right when the cap is reached — Buyer is locked into an indefinitely late delivery."); }
      else if (sole) { st.push("Fallback"); notes.push("LDs are the sole remedy for delay; termination right exists."); }
      notes.push("Delay LDs are not treated as an automatic override of the liability cap.");
    }
    return { status: worst(st), refs: uniqC(ld), quote: short(ld[0].s), notes };
  };

  E.T06 = (ctx, P) => {
    const ins = find(ctx.clauses, /\b(inspect|inspection|examin|acceptance test|site acceptance|reject|non-?conform|notice of defect|claims? (for|regarding) (quality|quantity|defect))/i);
    const deemed = find(ctx.clauses, /deemed\s+(to\s+(have\s+been|be)\s+)?accept/i);
    const notes = [], st = [];
    const refs = uniqC([...ins, ...deemed]);
    if (!ins.length) {
      if (ctx.side === "seller") return { status: "Fallback", refs: [], quote: "", notes: ["No inspection/notice period. Default rules (e.g. CISG Arts. 38–39 where applicable) allow notice within a 'reasonable time', with a long-stop of up to two years — insert a short notice period and deemed acceptance."] };
      return { status: "Missing", refs: [], quote: "", notes: ["No inspection or acceptance procedure for Buyer."] };
    }
    const days = [];
    ins.forEach((x) => durations(x.s, "days").forEach((d) => days.push(d.value)));
    const d = days.length ? Math.max(...days) : null;
    if (d != null) notes.push(`Inspection / notice window: ${d} days.`);
    if (ctx.side === "seller") {
      if (d == null) { st.push("Review"); notes.push("Inspection period not quantified."); }
      else if (d > P.fallbackDays) { st.push("Deviation"); notes.push(`${d} days exceeds the ${P.fallbackDays}-day fallback.`); }
      else if (d > P.maxDays) { st.push("Fallback"); notes.push(`${d} days is above the preferred ${P.maxDays} days.`); }
      else st.push("Compliant");
      if (!deemed.length) { st.push("Fallback"); notes.push("No deemed-acceptance mechanism — acceptance (and any acceptance-linked payment or warranty start) stays open."); }
      if (find(ctx.clauses, /may reject any/i).length) { st.push("Fallback"); notes.push("Unqualified rejection right — limit to material non-conformities."); }
    } else {
      if (d == null) { st.push("Review"); notes.push("Inspection period not quantified."); }
      else if (d < P.fallbackDays) { st.push("Deviation"); notes.push(`${d} days is below the ${P.fallbackDays}-day minimum.`); }
      else if (d < P.minDays) { st.push("Fallback"); notes.push(`${d} days is below the preferred ${P.minDays} days.`); }
      else st.push("Compliant");
      if (deemed.length) { st.push(d != null && d < P.minDays ? "Deviation" : "Fallback"); notes.push("Deemed acceptance applies — ensure latent defects and warranty survive acceptance."); }
    }
    return { status: worst(st), refs, quote: short((ins[0] || deemed[0]).s), notes };
  };

  const TRIG_RE = /(?:from|after|following|of|commencing (?:on|from))\s+(?:the\s+)?(?:date\s+of\s+(?:the\s+)?)?(?:buyer'?s\s+)?(delivery|shipment|bill of lading|B\/L|acceptance|installation|commissioning|arrival|taking[- ]over|invoice|completion|start[- ]up)/i;
  E.T07 = (ctx, P) => {
    const w = find(ctx.clauses, /\bwarrant(y|ies|s)?\b|guarantee period|defects? liability period/i);
    const notes = [], st = [];
    if (!w.length) return { status: "Missing", refs: [], quote: "", notes: ["No warranty clause found."] };
    const terms = [];
    w.forEach((x) => {
      const ds = durations(x.s, "months");
      if (!ds.length) return;
      const tg = (x.s.match(TRIG_RE) || [])[1];
      const override = /notwithstanding|in all circumstances|no later than|whichever (is )?(the )?(earlier|sooner|first)|shall expire/i.test(x.s);
      ds.forEach((d) => terms.push({ months: d.value, trigger: tg ? tg.toLowerCase().replace("b/l", "bill of lading") : "unspecified", c: x.c, s: x.s, override }));
    });
    const refs = uniqC([...terms.map((t) => t.c), ...w.filter((x) => /warrant|guarantee|defects/i.test(x.c.heading) && x.c.kind !== "annex-head").map((x) => x.c)]);
    const txt = w.map((x) => x.s).join(" ");
    if (!terms.length) { return { status: "Review", refs, quote: short(w[0].s), notes: ["Warranty period not quantified."] }; }
    terms.forEach((t) => notes.push(`${t.c.label}: ${t.months} months from ${t.trigger}${t.override ? " (override / long-stop language)" : ""}.`));
    const acceptanceLike = (tg) => /acceptance|installation|commissioning|taking[- ]over|completion|start[- ]up|arrival/.test(tg);
    if (ctx.side === "seller") {
      const longest = terms.reduce((a, b) => (b.months > a.months ? b : a));
      if (longest.months > P.fallbackMonths) { st.push("Deviation"); notes.push(`${longest.months} months exceeds the ${P.fallbackMonths}-month ceiling.`); }
      else if (longest.months > P.maxMonths) { st.push("Fallback"); notes.push(`${longest.months} months is above the preferred ${P.maxMonths} months.`); }
      else st.push("Compliant");
      if (acceptanceLike(longest.trigger) && !terms.some((t) => t.override)) { st.push(longest.months > P.maxMonths ? "Deviation" : "Fallback"); notes.push(`Warranty runs from ${longest.trigger}, not shipment — add a long-stop measured from the bill of lading date.`); }
      if (!/(sole|exclusive)[^.]{0,60}remed|sole obligation|repair,? (or )?replace/i.test(txt) || /all remedies available|in addition to|without prejudice/i.test(txt)) { st.push(/all remedies available|in addition to/i.test(txt) ? "Deviation" : "Fallback"); notes.push("Remedies are not limited to repair/replace/refund — Buyer keeps all remedies at law."); }
      if (!/merchantab|fitness for (a )?particular purpose|all other warranties|in lieu of|no other warrant/i.test(ctx.flat)) { st.push("Fallback"); notes.push("No disclaimer of implied warranties."); }
    } else {
      const shortest = terms.reduce((a, b) => (b.months < a.months ? b : a));
      if (shortest.months < P.fallbackMinMonths) { st.push("Deviation"); notes.push(`Effective period ${shortest.months} months (${shortest.c.label}) is below the ${P.fallbackMinMonths}-month floor.`); }
      else if (shortest.months < P.minMonths) { st.push("Fallback"); notes.push(`${shortest.months} months is a permitted fallback (preferred ${P.minMonths}).`); }
      else st.push("Compliant");
      const badTrig = terms.filter((t) => t.trigger !== P.requiredTrigger);
      if (badTrig.length) { st.push("Deviation"); notes.push(`Commencement trigger is ${[...new Set(badTrig.map((t) => t.trigger))].join(" / ")} rather than ${P.requiredTrigger} (${badTrig.map((t) => t.c.label).join(", ")}).`); }
      const ann = terms.filter((t) => t.c.annex || t.override);
      if (ann.length && terms.length > 1) { st.push("Deviation"); notes.push(`Conflicting warranty provisions: ${ann.map((t) => t.c.label).join(", ")} cut the main warranty. Revise both the main clause and the overriding provision so no earlier-expiry term survives.`); }
      if (/merchantab|fitness for (a )?particular purpose/i.test(txt) && /disclaim|no other|exclude/i.test(txt)) { st.push("Fallback"); notes.push("Implied warranties are disclaimed."); }
    }
    const worstT = ctx.side === "buyer" ? terms.reduce((a, b) => (b.months < a.months ? b : a)) : terms.reduce((a, b) => (b.months > a.months ? b : a));
    const rl = ctx.side === "buyer" && terms.length > 1 ? { action: "Replace", location: uniqC(terms).map((c) => c.label).join(" + "), original: terms.map((t) => `[${t.c.label}] ${short(t.s, 160)}`).join("\n"), proposed: null, extra: terms.filter((t) => t.c.annex || t.override).map((t) => `Delete ${t.c.label} in its entirety.`) } : undefined;
    return { status: worst(st), refs, quote: short(worstT.s), notes, redline: rl };
  };

  E.T08 = (ctx, P) => {
    const li = find(ctx.clauses, /\bliab(le|ility|ilities)\b/i);
    const notes = [], st = [];
    if (!li.length) return { status: "Missing", refs: [], quote: "", notes: ["No limitation of liability — both parties' exposure is uncapped."] };
    const caps = [];
    const unl = [];
    let indirect = false;
    li.forEach((x) => {
      const s = x.s;
      const subj = subjectOf(s);
      if (/indirect|consequential|loss of (profit|revenue|use|business|production)|special damages/i.test(s) && /(not|no)\s+(be\s+)?liab|neither party (shall|will) be liable|exclud|shall not be responsible|in no event/i.test(s)) indirect = true;
      if (/unlimited|uncapped|without (any )?limit|not (be )?subject to (the )?(limitation|clause \d+|cap|any limit)|shall not apply to|excluded from (the )?(cap|limitation)|outside (the )?(cap|limitation)/i.test(s)) unl.push({ subj, x });
      const capM = s.match(/(?:not exceed|limited to|capped at|maximum of|no more than|up to)\s+(?:an amount equal to\s+)?(?:(\d+(?:\.\d+)?)\s*(?:%|per\s?cent|percent)\)?\s*(?:of\s+)?(?:the\s+)?(total\s+)?(contract price|price|purchase price|contract value|value of (the )?contract|amounts? (actually )?paid[^.]{0,40}|fees paid[^.]{0,40})?|(the\s+)?(total\s+)?(amounts?|sums?|price)\s+(actually\s+)?(paid|received)[^.]{0,60})/i);
      if (capM) {
        const pct = capM[1] ? parseFloat(capM[1]) : null;
        const paid = /(amounts?|sums?|price|fees)\s+(actually\s+)?(paid|received)/i.test(capM[0]);
        caps.push({ subj: subj || "both", pct: paid && pct == null ? null : pct, paid, x });
      } else {
        const a = amounts(s);
        if (a.length && /not exceed|limited to|capped|maximum/i.test(s)) caps.push({ subj: subj || "both", abs: a[0], pct: ctx.meta.price && a[0].currency === ctx.meta.price.currency ? (a[0].value / ctx.meta.price.value) * 100 : null, x });
      }
      if (/(liable|liability) for (all|any and all) (losses|damages|claims)/i.test(s) && !/not exceed|limit/i.test(s)) unl.push({ subj, x, all: true });
    });
    const capFor = (side) => caps.filter((c) => c.subj === side || c.subj === "both");
    const descr = (c) => (c.paid ? "amounts paid" : c.pct != null ? `${fmtPct(c.pct)} of the Contract Price` : c.abs ? money(c.abs) : "an unquantified amount");
    caps.forEach((c) => notes.push(`${c.x.c.label}: ${c.subj === "both" ? "each party" : c.subj === "seller" ? "Seller" : "Buyer"} capped at ${descr(c)}.`));
    const our = ctx.side, their = ctx.side === "seller" ? "buyer" : "seller";
    const ourUnl = unl.filter((u) => u.subj === our || (u.subj === "both" && !u.all) || (u.subj == null && !u.all));
    if (our === "seller") {
      const c = capFor("seller");
      if (!c.length) { st.push("Deviation"); notes.push("No cap on Seller's liability."); }
      else {
        const v = c[0];
        if (v.pct == null && !v.paid) { st.push("Review"); }
        else if (v.paid || v.pct <= P.maxOwnCapPct) st.push("Compliant");
        else if (v.pct <= P.fallbackOwnCapPct) { st.push("Fallback"); notes.push(`Seller cap ${fmtPct(v.pct)} is within the ${fmtPct(P.fallbackOwnCapPct)} fallback.`); }
        else { st.push("Deviation"); notes.push(`Seller cap ${fmtPct(v.pct)} exceeds ${fmtPct(P.fallbackOwnCapPct)}.`); }
      }
      if (ourUnl.length) { st.push("Deviation"); notes.push(`Uncapped or carved-out Seller exposure: ${uniqC(ourUnl.map((u) => u.x)).map((c) => c.label).join(", ")}.`); }
      if (!indirect) { st.push("Deviation"); notes.push("No exclusion of indirect/consequential loss or lost profit" + (/loss of profit/i.test(li.map((x) => x.s).join(" ")) ? " — the contract expressly makes lost profit recoverable." : ".")); }
    } else {
      const sc = capFor("seller");
      if (!sc.length) notes.push("Seller liability is not capped (favourable to Buyer).");
      else {
        const v = sc[0];
        if (v.paid) { st.push("Deviation"); notes.push("Seller's cap is tied to amounts paid — exposure shrinks to zero early in the contract (e.g. before the advance is paid)."); }
        else if (v.pct != null && v.pct + 1e-9 < P.minCounterCapPct) { st.push("Deviation"); notes.push(`Seller cap ${fmtPct(v.pct)} is below ${fmtPct(P.minCounterCapPct)}.`); }
        else if (v.pct != null) st.push("Compliant");
        else st.push("Review");
      }
      const bc = capFor("buyer");
      if (!bc.length) { st.push("Fallback"); notes.push("Buyer's own liability is not capped — insert a mutual cap."); }
      else {
        const v = bc[0];
        if (v.pct != null && v.pct > P.fallbackOwnCapPct) { st.push("Deviation"); notes.push(`Buyer cap ${fmtPct(v.pct)} exceeds ${fmtPct(P.fallbackOwnCapPct)}.`); }
        else if (v.pct != null && v.pct > P.maxOwnCapPct) { st.push("Fallback"); notes.push(`Buyer cap ${fmtPct(v.pct)} is a permitted fallback.`); }
        else st.push("Compliant");
      }
      if (ourUnl.length) { st.push("Deviation"); notes.push(`Buyer liability outside the cap: ${uniqC(ourUnl.map((u) => u.x)).map((c) => c.label).join(", ")} — check indemnities and annexes.`); }
      if (!indirect) { st.push("Fallback"); notes.push("No mutual exclusion of indirect/consequential loss."); }
    }
    const theirUnl = unl.filter((u) => u.subj === their);
    if (theirUnl.length && our === "buyer") notes.push(`Seller exposure outside cap: ${uniqC(theirUnl.map((u) => u.x)).map((c) => c.label).join(", ")} (favourable).`);
    const refs = uniqC([...caps.map((c) => c.x), ...unl.map((u) => u.x)]);
    const extra = ourUnl.filter((u) => u.x.c.annex || /not (be )?subject to|shall not apply/i.test(u.x.s)).map((u) => `Delete or conform ${u.x.c.label} so it is subject to the limitation of liability.`);
    return { status: worst(st), refs: refs.length ? refs : uniqC(li).slice(0, 2), quote: short((caps[0] || unl[0] || { x: li[0] }).x.s), notes, redline: extra.length ? { extra } : undefined };
  };

  E.T09 = (ctx) => {
    const ind = find(ctx.clauses, /indemnif|hold harmless|\bdefend\b/i);
    const ip = find(ctx.clauses, /intellectual property|patent|trademark|copyright|infring/i);
    const refs = uniqC([...ind, ...ip]);
    const notes = [], st = [];
    const indemnitor = (s) => { const m = s.match(new RegExp(`\\b(${SELLER_ROLE}|${BUYER_ROLE})\\b\\s+(?:shall|will|agrees to|undertakes to)\\s+(?:defend,?\\s*)?(?:fully\\s+)?(?:indemnif|hold harmless|defend)`, "i")); return m ? roleSide(m[1]) : null; };
    const sInd = ind.filter((x) => indemnitor(x.s) === "seller");
    const bInd = ind.filter((x) => indemnitor(x.s) === "buyer");
    const sIP = sInd.filter((x) => /intellectual property|patent|trademark|copyright|infring/i.test(x.s));
    if (ctx.side === "seller") {
      if (!sInd.length && !ip.length) { st.push("Fallback"); notes.push("IP infringement not addressed — insert a limited IP indemnity with Buyer-design exclusions, or an express disclaimer."); }
      sIP.forEach((x) => {
        const broad = /any and all|all claims/i.test(x.s);
        const buyerSpec = /(specification|design|instruction|drawing)s?[^.]{0,60}(buyer|purchaser|customer)|(buyer|purchaser|customer)'?s?[^.]{0,30}(specification|design|instruction|drawing)/i.test(x.s);
        const includesSpec = /including[^.]{0,80}(buyer|purchaser)'?s? (specification|design)/i.test(x.s);
        if (includesSpec) { st.push("Deviation"); notes.push(`${x.c.label}: Seller indemnifies even for Goods made to Buyer's specifications — the opposite of the playbook exclusion.`); }
        else if (broad && !buyerSpec) { st.push("Deviation"); notes.push(`${x.c.label}: broad 'all claims' IP indemnity without Buyer-design/modification exclusions.`); }
        else if (!buyerSpec) { st.push("Fallback"); notes.push(`${x.c.label}: IP indemnity lacks the Buyer-design / modification / combination exclusions.`); }
        else st.push("Compliant");
      });
      sInd.filter((x) => !sIP.includes(x)).forEach((x) => { if (/any and all|all claims|all losses/i.test(x.s)) { st.push("Deviation"); notes.push(`${x.c.label}: broad Seller indemnity.`); } });
      if (sInd.length && !st.length) st.push("Compliant");
      if (!sInd.length && ip.length && !st.length) { st.push("Review"); notes.push("IP referenced without a clear indemnity allocation."); }
    } else {
      if (!sIP.length) { st.push("Deviation"); notes.push("No Seller IP infringement indemnity — Buyer (as importer/reseller in Korea) would face third-party IP claims alone."); }
      else { st.push("Compliant"); notes.push(`Seller IP indemnity present (${uniqC(sIP).map((c) => c.label).join(", ")}).`); }
      bInd.forEach((x) => { st.push(/all claims|any and all|unlimited|not subject/i.test(x.s) ? "Deviation" : "Fallback"); notes.push(`${x.c.label}: Buyer gives an indemnity to Seller${/unlimited|not subject/i.test(x.s) ? " — uncapped" : ""}.`); });
      if (!find(ctx.clauses, /(personal injury|death|property damage|product liability)/i).length) { st.push("Fallback"); notes.push("No product-liability indemnity from Seller."); }
    }
    return { status: worst(st.length ? st : ["Compliant"]), refs, quote: short(((sIP[0] || sInd[0] || bInd[0] || ip[0]) || {}).s || ""), notes };
  };

  E.T10 = (ctx, P) => {
    const fmC = scoreClauses(ctx.clauses, /force majeure/i, /force majeure|beyond (its|their) (reasonable )?control|act of god/i);
    const notes = [], st = [];
    if (!fmC.length) return { status: "Missing", refs: [], quote: "", notes: ["No force majeure clause — relief depends entirely on governing law (e.g. frustration/impossibility doctrines) and is narrow."] };
    const c = fmC[0];
    const t = c.full;
    const cats = {
      epidemic: /epidemic|pandemic|quarantine|disease/i.test(t),
      sanctions: /sanction|embargo|government|export (or import )?restriction|regulat/i.test(t),
      supply: /shortage|sub-?supplier|supplier|carrier|materials/i.test(t),
      war: /war|terror|hostilit|civil unrest/i.test(t),
      strike: /strike|labou?r/i.test(t)
    };
    const termDays = /terminat/i.test(t) ? durations(t, "days").map((d) => d.value).concat(durations(t, "months").map((d) => d.value * 30)) : [];
    const td = termDays.length ? Math.max(...termDays) : null;
    if (ctx.side === "seller") {
      const missing = P.required.filter((k) => !cats[k]);
      if (missing.length) { st.push(missing.length >= 2 ? "Deviation" : "Fallback"); notes.push(`Event list omits: ${missing.map((k) => ({ epidemic: "epidemic/pandemic", sanctions: "sanctions/government action/export restrictions", supply: "material shortages/sub-supplier failure" })[k]).join("; ")}.`); }
      else st.push("Compliant");
      if (td == null) { st.push("Fallback"); notes.push("No termination right after prolonged force majeure."); }
      if (/payment/i.test(t) === false) notes.push("Clarify whether payment obligations are excluded from FM relief.");
    } else {
      if (td == null) { st.push("Deviation"); notes.push("No Buyer termination right for prolonged force majeure."); }
      else if (td > P.fallbackFmDays) { st.push("Deviation"); notes.push(`Termination only after ${td} days (limit ${P.fallbackFmDays}).`); }
      else if (td > P.maxFmDays) { st.push("Fallback"); notes.push(`Termination after ${td} days — preferred ${P.maxFmDays} days.`); }
      else st.push("Compliant");
      if (cats.supply) { st.push("Fallback"); notes.push("Seller's material shortages / supplier failures qualify as force majeure — narrow to events that would themselves qualify."); }
      if (!/refund/i.test(t)) notes.push("Add refund of amounts paid for undelivered Goods on FM termination.");
    }
    return { status: worst(st), refs: [c], quote: short(c.sents[0] || c.heading), notes };
  };

  E.T11 = (ctx) => {
    const ex = find(ctx.clauses, /export control|export licen[cs]e|sanction|re-?export|end[- ]us(e|er)|embargo|strategic item|dual[- ]use|\bEAR\b|\bOFAC\b|ECCN|Foreign Trade Act/i).filter((x) => !/force majeure|beyond (its|their)/i.test(x.c.heading + " " + x.s) || /warrant|shall not|comply/i.test(x.s));
    const refs = uniqC(ex);
    const txt = ex.map((x) => x.s).join(" ");
    const notes = [], st = [];
    if (!ex.length) return { status: "Missing", refs: [], quote: "", notes: [ctx.side === "seller" ? "No export control or sanctions clause. Seller has no contractual end-use/re-export protection and no clean exit if a shipment becomes prohibited." : "No allocation of export licences or sanctions risk to Seller."] };
    const has = ctx.side === "seller"
      ? { "compliance covenant": /comply|compliance|shall not[^.]{0,60}(export|re-?export|transfer)/i.test(txt), "re-export / diversion restriction": /re-?export|resell|transfer|divert/i.test(txt), "end-user / end-use statement": /end[- ]us(e|er)/i.test(txt), "suspension / termination right": /suspend|terminat/i.test(txt) }
      : { "sanctions warranty": /sanction/i.test(txt) && /warrant|represent/i.test(txt), "export licences on Seller": /licen[cs]e/i.test(txt), "classification disclosure (ECCN / strategic item)": /ECCN|classification|strategic/i.test(txt), "Buyer termination right": /terminat/i.test(txt) };
    const missing = Object.keys(has).filter((k) => !has[k]);
    Object.keys(has).forEach((k) => notes.push(`${has[k] ? "✓" : "✗"} ${k}`));
    if (!missing.length) st.push("Compliant");
    else if (missing.length >= 3) st.push("Deviation");
    else st.push("Fallback");
    return { status: worst(st), refs, quote: short(ex[0].s), notes };
  };

  E.T12 = (ctx) => {
    const dc = find(ctx.clauses, /certificate of origin|preferential|free trade agreement|\bFTA\b|commercial invoice|packing list|bill of lading|air waybill|customs|origin verification|HS code|tariff classification/i);
    const refs = uniqC(dc);
    const txt = dc.map((x) => x.s).join(" ");
    const notes = [], st = [];
    if (ctx.side === "seller") {
      if (!dc.length) { st.push("Fallback"); notes.push("Documentary obligations not defined — specify the document set to avoid L/C discrepancies and customs disputes."); }
      else {
        const originIndem = dc.filter((x) => /(origin|preferential|free trade|FTA)/i.test(x.s) && /indemnif|liable|penalt|reimburse/i.test(x.s));
        if (originIndem.length) { st.push(/for any reason|all|any/i.test(originIndem[0].s) ? "Deviation" : "Fallback"); notes.push(`${originIndem[0].c.label}: Seller bears duties/penalties if preferential origin is denied${/for any reason/i.test(originIndem[0].s) ? " — for any reason, including causes on Buyer's side" : ""}.`); }
        else st.push("Compliant");
      }
    } else {
      const docs = { "commercial invoice": /commercial invoice/i, "packing list": /packing list/i, "transport document (B/L / AWB)": /bill of lading|air waybill|transport document|\bB\/L\b|\bAWB\b/i, "certificate of origin": /certificate of origin|origin certificate|statement of origin/i };
      Object.entries(docs).forEach(([k, re]) => notes.push(`${re.test(txt) ? "✓" : "✗"} ${k}`));
      const fta = /free trade agreement|\bFTA\b|preferential/i.test(txt);
      const verif = /verification|cooperat|retain[^.]{0,40}records/i.test(txt);
      notes.push(`${fta ? "✓" : "✗"} FTA preferential origin`, `${verif ? "✓" : "✗"} origin-verification cooperation / record retention`);
      if (!docs["certificate of origin"].test(txt)) st.push("Deviation");
      else if (!verif || !fta) st.push("Fallback");
      else st.push("Compliant");
      if (!/indemnif/i.test(txt)) { st.push("Fallback"); notes.push("No Seller indemnity for duties/penalties caused by inaccurate origin or classification data."); }
    }
    return { status: worst(st), refs, quote: dc[0] ? short(dc[0].s) : "", notes };
  };

  function lawOf(s) {
    const m = s.match(/(?:governed by|construed in accordance with|subject to)\s+(?:and construed in accordance with\s+)?(?:the\s+)?(?:substantive\s+)?(?:laws?|law)\s+of\s+(?:the\s+)?([A-Z][A-Za-z.'’]*(?:\s+(?:and|of|the|[A-Z][A-Za-z.'’]*))*)/) || s.match(/governed by\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+law/);
    if (!m) return null;
    const raw = m[1].split(/\s+and\s+the\b|\s+without\b|,/)[0].replace(/[.;:]+$/, "").replace(/\s+(and|of|the)$/i, "").trim();
    let n = raw;
    if (/korea/i.test(raw)) n = "Korea";
    else if (/england|english|wales/i.test(raw)) n = "England and Wales";
    else if (/singapore/i.test(raw)) n = "Singapore";
    else if (/new york/i.test(raw)) n = "New York";
    else if (/switzerland|swiss/i.test(raw)) n = "Switzerland";
    else if (/hong kong/i.test(raw)) n = "Hong Kong";
    return { raw, n };
  }
  E.T13 = (ctx, P) => {
    const g = find(ctx.clauses, /governed by|governing law|construed in accordance with/i);
    const notes = [], st = [];
    if (!g.length) return { status: "Missing", refs: [], quote: "", notes: ["No governing-law clause — the applicable law will be determined by conflict-of-laws rules of the forum, and CISG may apply by default."] };
    const law = g.map((x) => lawOf(x.s)).find(Boolean);
    if (!law) { st.push("Review"); notes.push("Governing law could not be read."); }
    else if (P.preferred.includes(law.n)) { st.push("Compliant"); notes.push(`Governing law: ${law.raw}.`); }
    else if (P.fallback.includes(law.n)) { st.push("Fallback"); notes.push(`Governing law: ${law.raw} — permitted neutral-law fallback.`); }
    else { st.push("Deviation"); notes.push(`Governing law: ${law.raw} — outside approved laws (${[...P.preferred, ...P.fallback].join(", ")}).`); }
    const cisg = find(ctx.clauses, /Convention on Contracts for the International Sale of Goods|\bCISG\b|Vienna Sales Convention/i);
    if (!cisg.length) { st.push("Fallback"); notes.push("CISG not addressed. Korea is a CISG contracting state; silence may import CISG rules on conformity, notice and avoidance. Make an express election."); }
    else if (/not apply|exclud|shall not govern/i.test(cisg[0].s)) notes.push("CISG expressly excluded ✓");
    else { st.push("Review"); notes.push("CISG expressly applies — confirm this is an informed choice."); }
    return { status: worst(st), refs: uniqC([...g, ...cisg]), quote: short(g[0].s), notes, meta: law };
  };

  const INSTITUTIONS = [
    ["KCAB", /\bKCAB\b|Korean Commercial Arbitration Board/i], ["SIAC", /\bSIAC\b|Singapore International Arbitration Cent/i], ["ICC", /\bICC\b|International Chamber of Commerce/i],
    ["HKIAC", /\bHKIAC\b|Hong Kong International Arbitration/i], ["LCIA", /\bLCIA\b|London Court of International Arbitration/i], ["DIAC", /\bDIAC\b|Dubai International Arbitration|Dubai Arbitration Cent/i],
    ["CIETAC", /\bCIETAC\b/i], ["JCAA", /\bJCAA\b/i], ["ICDR/AAA", /\bICDR\b|\bAAA\b|American Arbitration Association/i], ["VIAC", /\bVIAC\b/i], ["UNCITRAL", /UNCITRAL/i]
  ];
  E.T14 = (ctx, P) => {
    const d = find(ctx.clauses, /arbitrat|jurisdiction|courts? of|dispute/i);
    const notes = [], st = [];
    if (!d.length) return { status: "Missing", refs: [], quote: "", notes: ["No dispute-resolution clause — any party may sue in any court with jurisdiction; a foreign judgment may be difficult to enforce."] };
    const txt = d.map((x) => x.s).join(" ");
    const inst = (INSTITUTIONS.find(([, re]) => re.test(txt)) || [])[0];
    const arb = /arbitrat/i.test(txt);
    const court = (txt.match(/courts? of ([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?)/) || [])[1];
    const seat = (txt.match(/seat(?:ed)?(?:\s+of(?:\s+the)?\s+arbitration)?(?:\s+shall\s+be|\s+in|\s+at)?\s+([A-Z][a-z]+)/) || [])[1];
    const refs = uniqC(d);
    if (arb) {
      if (!inst) { st.push("Review"); notes.push("Arbitration without an identified institution (ad hoc?)."); }
      else if (P.preferred.includes(inst)) { st.push("Compliant"); notes.push(`${inst} arbitration${seat ? `, seat ${seat}` : ""}.`); }
      else if (P.fallback.includes(inst)) { st.push("Fallback"); notes.push(`${inst} arbitration${seat ? `, seat ${seat}` : ""} — permitted fallback.`); }
      else { st.push("Deviation"); notes.push(`${inst} arbitration${seat ? ` seated in ${seat}` : ""} is not on the approved list (${[...P.preferred, ...P.fallback].join(", ")}).`); }
      if (!seat) { st.push("Review"); notes.push("Seat of arbitration not identified."); }
      if (!/language/i.test(txt)) notes.push("Specify English as the language of the arbitration.");
    } else if (court) {
      if (/korea|seoul/i.test(court)) { st.push("Fallback"); notes.push(`Courts of ${court} — home forum, but a Korean judgment may be hard to enforce abroad; arbitration preferred (New York Convention).`); }
      else { st.push("Deviation"); notes.push(`Exclusive jurisdiction of the courts of ${court} — counterparty's home forum; prefer arbitration for neutral, enforceable outcomes.`); }
    } else { st.push("Review"); notes.push("Dispute mechanism unclear."); }
    return { status: worst(st), refs, quote: short(d[0].s), notes, meta: { inst, court, seat } };
  };

  E.T15 = (ctx) => {
    const t = find(ctx.clauses, /terminat|suspend|insolven|bankrupt|cure|remedy (it|the breach)/i);
    const notes = [], st = [];
    if (!t.length) return { status: "Missing", refs: [], quote: "", notes: ["No termination clause."] };
    const conv = t.filter((x) => /for convenience|without cause|for any reason|at any time[^.]{0,30}(without|for any)/i.test(x.s));
    const who = (x) => subjectOf(x.s.split(/terminat/i)[0]) || subjectOf(x.s);
    const theirSide = ctx.side === "seller" ? "buyer" : "seller";
    const theirConv = conv.filter((x) => who(x) === theirSide || who(x) === "both");
    const comp = /compensat|costs? incurred|work in progress|reasonable profit|pay for (all )?(goods|work)/i;
    const txt = t.map((x) => x.s).join(" ");
    theirConv.forEach((x) => {
      if (ctx.side === "seller" && comp.test(x.s)) { st.push("Fallback"); notes.push(`${x.c.label}: Buyer convenience termination with compensation.`); }
      else { st.push("Deviation"); notes.push(`${x.c.label}: ${theirSide === "buyer" ? "Buyer" : "Seller"} may terminate for convenience${comp.test(x.s) ? "" : " without compensation"}.`); }
    });
    if (!/cure|remed(y|ied) (it|the breach|such breach)|within \(?\d+\)? days/i.test(txt)) { st.push("Fallback"); notes.push("No cure period for breach."); }
    if (!/insolven|bankrupt|liquidat|receiver/i.test(txt)) { st.push("Fallback"); notes.push("No insolvency termination right."); }
    if (ctx.side === "seller" && !/suspend/i.test(ctx.flat)) { st.push("Fallback"); notes.push("No Seller right to suspend for non-payment / late L/C."); }
    if (ctx.side === "buyer" && !t.some((x) => /delay|liquidated damages|maximum/i.test(x.s)) && !find(ctx.clauses, /terminat/i, /delay|liquidated/i).length) { st.push("Fallback"); notes.push("No Buyer termination right for prolonged delay."); }
    if (!st.length) st.push("Compliant");
    const tr = t.filter((x) => /terminat|suspen|exit/i.test(x.c.heading));
    return { status: worst(st), refs: uniqC(tr.length ? tr : t), quote: short((theirConv[0] || t[0]).s), notes };
  };

  E.T16 = (ctx) => {
    const notes = [], st = [];
    const refs = [];
    const refRe = /\b(Schedule|Annex|Appendix|Exhibit|Attachment)\s+([A-Z0-9]{1,3})\b/gi;
    const referenced = new Map();
    let m;
    for (const c of ctx.clauses) {
      if (c.kind === "annex-head") continue;
      const t = c.text;
      refRe.lastIndex = 0;
      while ((m = refRe.exec(t))) {
        const k = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2].toUpperCase()}`;
        if (!referenced.has(k)) referenced.set(k, c);
      }
    }
    const present = new Set(ctx.clauses.filter((c) => c.kind === "annex-head").map((c) => c.annex));
    const missing = [...referenced.keys()].filter((k) => !present.has(k));
    ctx.missingAnnexes = missing;
    if (missing.length) { st.push("Missing"); notes.push(`Referenced but not supplied: ${missing.join(", ")}. Their content is Not assessable — the review cannot be completed and missing text is not presumed acceptable.`); missing.forEach((k) => refs.push(referenced.get(k))); }
    else if (referenced.size) { st.push("Compliant"); notes.push(`All referenced documents supplied (${[...referenced.keys()].join(", ")}).`); }
    const prec = find(ctx.clauses, /prevail|take precedence|shall govern in case of|in the event of (any )?(conflict|inconsistency)/i).filter((x) => !/incoterms/i.test(x.s));
    prec.forEach((x) => {
      const annexWins = /(schedule|annex|appendix|exhibit|purchase order|general terms|terms and conditions)s?[^.]{0,40}(shall\s+)?(prevail|take precedence)/i.test(x.s) || /(prevail|precedence)[^.]{0,30}over the main body/i.test(x.s);
      if (annexWins) { st.push("Deviation"); refs.push(x.c); notes.push(`${x.c.label}: annex / incorporated document prevails over the main body — any annex term can silently override compliant clauses. Reverse the order of precedence.`); }
    });
    const gtc = find(ctx.clauses, /(general|standard) (terms and conditions|conditions of (sale|purchase))|terms and conditions of (sale|purchase)|purchase order terms/i).filter((x) => !/no effect|shall not apply|excluded/i.test(x.s));
    gtc.forEach((x) => { st.push("Deviation"); refs.push(x.c); notes.push(`${x.c.label}: counterparty standard terms are incorporated (battle of the forms).`); });
    if (!/entire agreement|whole agreement/i.test(ctx.flat)) { st.push("Fallback"); notes.push("No entire-agreement clause."); }
    if (!st.length) st.push("Compliant");
    return { status: worst(st), refs: uniqC(refs), quote: refs[0] ? short((refs[0].sents.find((s) => /schedule|annex|prevail|terms/i.test(s)) || refs[0].sents[0] || "")) : "", notes };
  };

  /* ------------------------------------------------------------------ */
  /* Integrity checks (outside the rule set)                             */
  /* ------------------------------------------------------------------ */
  function integrity(ctx) {
    const alerts = [];
    const inj = /(ignore|disregard|override)\s+(all\s+|any\s+|the\s+|previous\s+|prior\s+|company\s+|your\s+)*(policy|playbook|instructions|rules|review|guidelines)|approve this (agreement|contract)|do not (flag|report|mention|comment)|(automated|AI|review|reviewer|assistant|model|LLM)[^.]{0,40}(must|should|shall|to)\s+(approve|ignore|disregard)/i;
    find(ctx.clauses, inj).forEach((x) => alerts.push({ type: "Embedded instruction", severity: "high", ref: x.c, text: `${x.c.label} contains text addressed to reviewers or automated tools: "${short(x.s, 160)}". It was treated as contract content only and NOT followed. Delete it and ask the counterparty why it was inserted.` }));
    const p = ctx.meta.parties;
    if (ctx.ourName) {
      const key = ctx.ourName.toLowerCase().split(/\s+/).slice(0, 2).join(" ");
      const me = p.find((x) => x.name.toLowerCase().includes(key));
      if (!me) alerts.push({ type: "Party position", severity: "medium", text: `"${ctx.ourName}" was not found as a named party. Confirm the represented party before relying on position-specific thresholds.` });
      else if (me.side !== ctx.side) alerts.push({ type: "Position mismatch", severity: "high", text: `"${me.name}" appears as ${me.role} in the contract, but the review was run for the ${ctx.side === "seller" ? "Seller (Export)" : "Buyer (Import)"} position. Re-run with the correct position — applying the wrong side's policy inverts every recommendation.` });
    } else if (!p.length) alerts.push({ type: "Party position", severity: "medium", text: "Parties could not be identified automatically. Confirm which side we represent." });
    if (!/\b(goods|products?|equipment|machinery|shipment|cargo|incoterms|merchandise|modules?|systems?)\b/i.test(ctx.flat)) alerts.push({ type: "Scope", severity: "medium", text: "The document does not look like a sale-of-goods contract. TRADE-1.0 covers export/import sales only — request the relevant playbook before applying thresholds." });
    if (ctx.flat.length < 400) alerts.push({ type: "Input", severity: "medium", text: "Very short document — the text may be incomplete or extraction from the file failed." });
    return alerts;
  }

  /* ------------------------------------------------------------------ */
  /* Main                                                                */
  /* ------------------------------------------------------------------ */
  const IMPORTANCE_W = { Critical: 3, High: 2, Medium: 1 };

  function review(text, playbook, side, ourName) {
    const clauses = segment(text);
    const flat = norm(text);
    const meta = extractMeta(text, clauses);
    const ctx = { clauses, flat, meta, side, ourName: (ourName || "").trim() };
    const findings = [];
    const extraMeta = {};
    for (const rule of playbook.rules) {
      const pos = rule[side];
      const fn = E[rule.id];
      if (!pos || !fn) continue;
      let r;
      try { r = fn(ctx, pos.params || {}); } catch (e) { r = { status: "Review", refs: [], quote: "", notes: ["Automatic check failed: " + e.message] }; }
      if (r.meta) extraMeta[rule.id] = r.meta;
      const importance = pos.importance || rule.importance;
      const status = r.status;
      let redline = null;
      if (status !== "Compliant") {
        const base = { action: status === "Missing" ? "Insert" : "Replace", location: (r.refs || []).length ? (status === "Missing" ? "Insert after " + r.refs[r.refs.length - 1].label : r.refs.map((c) => c.label).join(" + ")) : "New clause (insert after the related clause)", original: r.quote || "—", proposed: pos.model, extra: [] };
        if (rule.id === "T16" && status === "Missing" && !(ctx.missingAnnexes || []).length) base.action = "Insert";
        if (r.redline) Object.keys(r.redline).forEach((k) => { if (r.redline[k] != null) base[k] = r.redline[k]; });
        if (!base.proposed) base.proposed = pos.model;
        redline = base;
      }
      findings.push({
        ruleId: rule.id, issue: rule.title, category: rule.category, importance, status,
        refs: (r.refs || []).map((c) => ({ id: c.id, label: c.label })),
        refLabel: (r.refs || []).map((c) => c.label).join(", ") || "—",
        quote: r.quote || "",
        analysis: r.notes || [],
        recommendation: recommend(status, pos),
        approver: status === "Deviation" || status === "Missing" ? (r.approver || pos.approver) : status === "Fallback" ? "Within negotiator authority (record the concession)" : status === "Review" ? "Reviewer to confirm" : "—",
        redline, source: "rules"
      });
    }
    const alerts = integrity(ctx);
    const score = findings.reduce((s, f) => s + (f.status === "Deviation" ? 2 * IMPORTANCE_W[f.importance] : f.status === "Missing" ? 1.5 * IMPORTANCE_W[f.importance] : f.status === "Fallback" ? 0.5 : f.status === "Review" ? 0.5 : 0), 0) + alerts.filter((a) => a.severity === "high").length * 3;
    const critDev = findings.some((f) => (f.status === "Deviation" || f.status === "Missing") && f.importance === "Critical");
    const overall = critDev || score >= 18 ? "High" : score >= 7 ? "Medium" : "Low";
    const decisions = {};
    findings.filter((f) => f.status === "Deviation" || f.status === "Missing").forEach((f) => { (decisions[f.approver] = decisions[f.approver] || []).push(f.ruleId); });
    const law = extraMeta.T13, forum = extraMeta.T14;
    return {
      playbook: { id: playbook.id, name: playbook.name },
      side, ourName: ctx.ourName, clauses, findings, alerts, overall, score: Math.round(score * 10) / 10, decisions,
      meta: Object.assign({}, meta, { law: law ? law.raw : null, forum: forum ? (forum.inst ? `${forum.inst} arbitration${forum.seat ? ", " + forum.seat : ""}` : forum.court ? `Courts of ${forum.court}` : null) : null, missingAnnexes: ctx.missingAnnexes || [] }),
      engine: "rules", createdAt: new Date().toISOString()
    };
  }

  function recommend(status, pos) {
    switch (status) {
      case "Compliant": return "No change required. Preserve this wording in negotiation.";
      case "Fallback": return `Within negotiation authority. Open with the preferred position (${pos.preferred}) and concede only to: ${pos.fallback}`;
      case "Deviation": return `Outside playbook authority — push back to the preferred position (${pos.preferred}). If the counterparty refuses, escalate to ${pos.approver}. Escalation trigger: ${pos.escalation}`;
      case "Missing": return `Insert the playbook clause. Preferred: ${pos.preferred}`;
      default: return `Manual review required. Target position: ${pos.preferred}`;
    }
  }

  const api = { review, segment, extractMeta, durations, percents, amounts, sentences, STATUS_ORDER };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ReviewEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
