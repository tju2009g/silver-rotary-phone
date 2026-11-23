/* =====================================================================
   Gov engine — deterministic US federal (FAR / DFARS) subcontract review.
   Pipeline: segment (shared with the trade engine) -> extract FAR/DFARS citations
   (+ dates, deviations) -> detect signals (DoD, CUI, tech data ...) -> evaluate the
   GOV-1.0 rules for the chosen position -> integrity -> score.
   Output has the same shape as ReviewEngine.review, so the existing UI renders it.
   Contract text is data: embedded instructions are reported, never followed.
   ===================================================================== */
(function (root) {
  "use strict";

  const RE = typeof require !== "undefined" ? require("./engine.js") : root.ReviewEngine;
  const DB = typeof require !== "undefined" ? require("./gov-db.js") : root.FAR_DB;

  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const short = (s, n = 230) => { s = norm(s); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const MONTHS = "JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC";
  const HOURWORDS = { "twelve": 12, "twenty-four": 24, "twenty four": 24, "forty-eight": 48, "forty eight": 48, "seventy-two": 72, "seventy two": 72, "ninety-six": 96, "ninety six": 96 };

  /* ---------------- citations ---------------- */
  function extractCites(clauses) {
    const out = [];
    clauses.forEach((c) => {
      const text = c.text || "";
      const re = new RegExp(DB.ID_RE.source, "g");
      const hits = [];
      let m;
      while ((m = re.exec(text))) hits.push({ id: m[2], auth: m[1] || (m[2].startsWith("252.") ? "DFARS" : "FAR"), idx: m.index, end: re.lastIndex });
      hits.forEach((h, i) => {
        const win = text.slice(h.end, Math.min(h.end + 170, hits[i + 1] ? hits[i + 1].idx : text.length));
        const d = win.match(new RegExp(`\\(\\s*(${MONTHS})[A-Z]*\\.?\\s*(\\d{4})\\s*\\)`, "i"));
        const ym = d ? null : win.match(/(?:^|[\s.])((?:19|20)\d{2})-(0[1-9]|1[0-2])(?=\s|$)/);
        const dev = win.match(/\(\s*(?:class\s+)?deviation[^)]{0,70}\)/i) || win.match(/class deviation[^.;,)]{0,50}/i);
        out.push({ id: h.id, auth: h.auth, clause: c, date: d ? `${d[1].slice(0, 3).toUpperCase()} ${d[2]}` : ym ? `${MONTHS.split("|")[parseInt(ym[2], 10) - 1]} ${ym[1]}` : null, deviation: dev ? norm(dev[0]) : null });
      });
    });
    return out;
  }

  function distinct(cites) {
    const map = new Map();
    cites.forEach((c) => {
      const cur = map.get(c.id);
      if (!cur) map.set(c.id, { id: c.id, auth: c.auth, dates: c.date ? [c.date] : [], deviation: c.deviation, clauses: [c.clause] });
      else {
        if (c.date && !cur.dates.includes(c.date)) cur.dates.push(c.date);
        if (c.deviation && !cur.deviation) cur.deviation = c.deviation;
        if (!cur.clauses.includes(c.clause)) cur.clauses.push(c.clause);
      }
    });
    return [...map.values()].map((d) => Object.assign(d, { db: DB.byId[d.id] || null }));
  }

  /* ---------------- signals ---------------- */
  function signals(flat, ids) {
    const federal = /\bFAR\b|Federal Acquisition Regulation|prime contract|government contract|Contracting Officer|federal (?:government|agency|contract)/i.test(flat) || [...ids].some((i) => /^(252\.|52\.)/.test(i));
    const dod = /\bDFARS\b|\bDoD\b|Department of Defense|\bDCMA\b|Defense (?:Logistics|Contract|Federal)|\b252\.\d{3}-\d{4}\b/i.test(flat);
    const cui = /covered defense information|\bCDI\b|controlled unclassified information|\bCUI\b|NIST\s*SP\s*800-171|\bCMMC\b|\bITAR\b|export[- ]controlled/i.test(flat);
    return {
      federal, dod, cui,
      civilian: federal && !dod,
      fci: federal && /(information system|federal contract information|\bFCI\b|network|cloud|data)/i.test(flat),
      electronic: /electronic (?:parts?|components?)|printed circuit|semiconductor|microelectronic/i.test(flat),
      cloud: /cloud (?:computing|service)|\bSaaS\b|\bIaaS\b|\bPaaS\b/i.test(flat),
      "tech-data": /technical data|computer software|source code|rights in data|intellectual property|\binventions?\b/i.test(flat),
      small: /small[- ]business/i.test(flat),
      commercial: /commercial (?:product|item|service)/i.test(flat),
      "fixed-price": /fixed[- ]price/i.test(flat),
      sbir: /\bSBIR\b|\bSTTR\b/i.test(flat)
    };
  }
  const expected = (sig) => DB.clauses.filter((c) => c.when.length && c.when.every((t) => sig[t]));

  /* ---------------- helpers ---------------- */
  const sentOf = (c) => c.sents || [];
  function firstMatch(ctx, re, clauseFilter) {
    for (const c of ctx.clauses) {
      if (clauseFilter && !clauseFilter(c)) continue;
      for (const s of sentOf(c)) if (re.test(s)) return { clause: c, sentence: s };
    }
    return null;
  }
  function allMatches(ctx, re) {
    const out = [];
    ctx.clauses.forEach((c) => sentOf(c).forEach((s) => { if (re.test(s)) out.push({ clause: c, sentence: s }); }));
    return out;
  }
  const refsOf = (ms) => { const seen = new Set(); const out = []; ms.forEach((m) => { if (m && !seen.has(m.clause.id)) { seen.add(m.clause.id); out.push(m.clause); } }); return out; };
  const hoursIn = (s) => {
    const m = s.match(/(?:within|no later than|not later than)\s+(?:(\d+)|(twelve|twenty[- ]four|forty[- ]eight|seventy[- ]two|ninety[- ]six))\s*(?:\(\d+\)\s*)?hours?/i);
    if (!m) return null;
    return m[1] ? parseInt(m[1], 10) : HOURWORDS[m[2].toLowerCase()] ?? null;
  };
  const roleSide = (role) => (/sub|seller|supplier|vendor/i.test(role) ? "seller" : /prime|contractor|buyer|purchaser/i.test(role) ? "buyer" : null);

  /* ---------------- rules ---------------- */
  const E = {};

  E.G01 = (ctx) => {
    const { ids, sig, side } = ctx;
    const exp = expected(sig).filter((c) => c.flowdown === "required");
    const missing = exp.filter((c) => !ids.has(c.id));
    const cited = exp.filter((c) => ids.has(c.id));
    const blanketRe = /(?:all|each|every)\s+(?:of\s+)?(?:the\s+)?(?:terms|clauses|provisions|conditions|requirements)[^.]{0,100}(?:prime[- ]contract|prime|contract (?:no|number)|master contract)[^.]{0,100}(?:incorporated|flow(?:s|ed)?[- ]?down|apply|bind|binding)|flow(?:s|ed)?[- ]?down[^.]{0,80}\ball\b/i;
    const blanket = firstMatch(ctx, blanketRe);
    const listed = ctx.cites.length >= 3;
    const undated = exp.filter((c) => ids.has(c.id) && !(ctx.distinctMap.get(c.id) || { dates: [] }).dates.length);
    const notes = [];
    notes.push(`${ctx.cites.length} FAR/DFARS citation(s) found, ${ids.size} distinct.`);
    if (!sig.federal) notes.push("No federal-procurement signals found; flow-down expectations were not applied.");
    if (exp.length) notes.push(`Clause DB expects ${exp.length} required flow-down clause(s) for the detected signals (${["federal", "dod", "cui", "civilian", "electronic", "tech-data"].filter((k) => sig[k]).join(", ")}).`);
    if (missing.length) notes.push("Not cited: " + missing.map((c) => c.id).join(", ") + ".");
    if (blanket) notes.push("Blanket incorporation language found.");
    notes.push("Confirm each expected clause against the prime contract's Section I and its thresholds — Clause DB v0 is unverified.");
    const refs = refsOf([blanket].concat(ctx.cites.slice(0, 6).map((c) => ({ clause: c.clause }))));
    const quote = blanket ? short(blanket.sentence) : (ctx.cites[0] ? short(sentOf(ctx.cites[0].clause).find((s) => s.includes(ctx.cites[0].id)) || "") : "");
    let status;
    if (!sig.federal && !ctx.cites.length) status = "Review";
    else if (side === "buyer") status = missing.length ? "Deviation" : undated.length ? "Fallback" : exp.length ? "Compliant" : "Review";
    else status = blanket && !listed ? "Deviation" : blanket ? "Fallback" : listed ? "Compliant" : "Review";
    return { status, refs, quote, notes, meta: { expected: exp.map((c) => c.id), missing: missing.map((c) => c.id), cited: cited.map((c) => c.id), blanket: !!blanket } };
  };

  E.G02 = (ctx) => {
    const list = ctx.distinct;
    if (!list.length) return { status: "Review", refs: [], quote: "", notes: ["No FAR/DFARS clause citations found — currency cannot be assessed."] };
    const stale = [], unknown = [], undated = [], unverified = [];
    list.forEach((d) => {
      if (!d.db) unknown.push(d);
      else if (!d.dates.length) undated.push(d);
      else if (d.db.verified && d.db.currentDate && !d.dates.includes(d.db.currentDate)) stale.push(d);
      else if (!d.db.verified) unverified.push(d);
    });
    const dev = list.filter((d) => d.deviation).length || /class deviation|\bRFO\b|FAR Overhaul/i.test(ctx.flat);
    const notes = [];
    if (stale.length) notes.push("Cited date differs from the verified current date: " + stale.map((d) => `${d.id} cited ${d.dates.join("/")} vs ${d.db.currentDate}`).join("; ") + ". An older date can be correct if it matches the prime contract in force at award — compare against the prime contract before accepting or changing it.");
    if (unknown.length) notes.push("Not in Clause DB v0 (manual check): " + unknown.map((d) => d.id).join(", ") + ".");
    if (undated.length) notes.push("Cited without a date: " + undated.map((d) => d.id).join(", ") + ".");
    if (unverified.length) notes.push(`${unverified.length} dated clause(s) could not be compared — the DB has no verified current date for them: ${unverified.map((d) => `${d.id} (${d.dates.join("/")})`).join(", ")}.`);
    notes.push(dev ? "A class deviation / overhaul reference appears in the document." : "No class deviation is named. The FAR is being overhauled through agency class deviations — confirm which text applies.");
    notes.push(DB.meta.rfo);
    const refs = [...new Set(list.flatMap((d) => d.clauses))].slice(0, 8);
    const quote = short(ctx.cites[0] ? (sentOf(ctx.cites[0].clause).find((s) => s.includes(ctx.cites[0].id)) || "") : "");
    let status;
    if (stale.length || unknown.length || undated.length) status = "Review";
    else if (unverified.length || !dev) status = "Fallback";
    else status = "Compliant";
    return { status, refs, quote, notes };
  };

  E.G03 = (ctx) => {
    const { side, ids } = ctx;
    const pre = allMatches(ctx, /order of precedence|in the event of (?:any |a )?(?:conflict|inconsistency|discrepancy)|take[s]? precedence|\bprevail|supersede[s]?|control[s]? over/i);
    const notes = [];
    if (!pre.length) {
      notes.push("No order-of-precedence language found.");
      return { status: ids.size ? "Missing" : "Review", refs: [], quote: "", notes };
    }
    const primeOverrides = pre.find((m) => /(prime[- ]contract|prime'?s? (?:terms|general terms|purchase order)|purchase order terms|PO terms)[^.]{0,120}(?:prevail|take precedence|supersede|control)/i.test(m.sentence));
    const subOverrides = pre.find((m) => /(this (?:subcontract|agreement)|negotiated terms|subcontract terms)[^.]{0,100}(?:prevail|take precedence|override|supersede|control)[^.]{0,140}(?:flow[- ]?down|FAR|DFARS|incorporated clauses|mandatory|prime[- ]contract)/i.test(m.sentence));
    const distinctSubjects = new Set(pre.map((m) => m.clause.id));
    const refs = refsOf(pre);
    const quote = short(pre[0].sentence);
    let status = "Compliant";
    if (side === "seller") {
      if (primeOverrides) { status = "Deviation"; notes.push("Prime-contract or purchase-order terms are made to override the negotiated subcontract terms."); }
    } else if (subOverrides) { status = "Deviation"; notes.push("Subcontract terms are made to override flowed-down mandatory clauses."); }
    if (status === "Compliant" && distinctSubjects.size > 1 && pre.length > 2) { status = "Review"; notes.push(`Precedence language appears in ${distinctSubjects.size} places — check that the rules agree.`); }
    if (status === "Compliant") notes.push("A precedence rule is present and no policy trigger was detected.");
    const q = (status === "Deviation" ? short((primeOverrides || subOverrides).sentence) : quote);
    return { status, refs: status === "Deviation" ? refsOf([primeOverrides || subOverrides]) : refs, quote: q, notes };
  };

  E.G04 = (ctx) => {
    const { side, ids, sig } = ctx;
    const ipClauses = ctx.clauses.filter((c) => /252\.227|52\.227|technical data|rights in data|intellectual property|work made for hire|work[- ]product|\bassign/i.test(c.text || ""));
    const assign = firstMatch(ctx, /(?:hereby\s+)?assign[s]?\b[^.]{0,200}(?:all right|title|interest|intellectual property|inventions?|technical data|software|deliverables|work product)|works? made for hire|all (?:intellectual property|IP)[^.]{0,120}(?:vest|belong|owned)/i);
    const unlimited = firstMatch(ctx, /unlimited rights/i);
    const carve = ipClauses.some((c) => /(pre-?existing|background)\s+(?:IP|intellectual property|technology|data|inventions)|developed (?:exclusively |solely )?at private expense|privately[- ]funded|\blimited rights|\brestricted rights|excluded from/i.test(c.text || ""));
    const assertion = /252\.227-7017|\bassert(?:ion|ions|s)?\b|restrictive marking|\bmark(?:ing|s|ed)?\b|legend/i.test(ctx.flat);
    const drCited = ["252.227-7013", "252.227-7014", "252.227-7015", "252.227-7018", "52.227-14", "52.227-11"].filter((i) => ids.has(i));
    const dodTech = sig.dod && sig["tech-data"];
    const notes = [];
    if (drCited.length) notes.push("Data-rights clauses cited: " + drCited.join(", ") + ".");
    if (assign) notes.push("Assignment / work-made-for-hire language found.");
    if (unlimited) notes.push("'Unlimited rights' language found.");
    notes.push(carve ? "A background-IP / private-expense / restricted-rights carve-out is present." : "No background-IP / private-expense carve-out found.");
    notes.push(assertion ? "Assertion or marking process referenced." : "No assertion / marking process found.");
    const hit = assign || unlimited;
    const refs = refsOf([assign, unlimited]).concat(ipClauses.filter((c) => !(assign && assign.clause === c) && !(unlimited && unlimited.clause === c)).slice(0, 3));
    const quote = hit ? short(hit.sentence) : ipClauses[0] ? short(sentOf(ipClauses[0])[0] || "") : "";
    let status;
    if (side === "seller") {
      if (hit && !carve) status = "Deviation";
      else if (dodTech && !assertion && !drCited.length) status = "Missing";
      else if (dodTech && !assertion) status = "Deviation";
      else if (hit && carve) status = "Fallback";
      else if ((drCited.length || carve) && assertion) status = "Compliant";
      else if (!ipClauses.length && sig["tech-data"]) status = "Missing";
      else status = ipClauses.length ? "Review" : "Review";
    } else {
      if (dodTech && !drCited.some((i) => /252\.227-701[34]/.test(i))) status = "Deviation";
      else if (!assertion && sig["tech-data"]) status = "Fallback";
      else if (drCited.length || ipClauses.length) status = "Compliant";
      else status = "Review";
    }
    return { status, refs, quote, notes };
  };

  E.G05 = (ctx, p) => {
    const { side, ids, sig } = ctx;
    if (!sig.dod && !sig.cui) return { status: "Compliant", refs: [], quote: "", notes: ["No defense-data signals (DFARS, DoD, CUI, CDI, NIST SP 800-171, CMMC) found — not triggered."] };
    const has7012 = ids.has("252.204-7012");
    const level = /\bCMMC\b|252\.204-7021|NIST\s*SP\s*800-171|252\.204-7020/i.test(ctx.flat);
    const rep = allMatches(ctx, /(?:report|notif)[^.]{0,160}hours?/i).map((m) => Object.assign({ hours: hoursIn(m.sentence) }, m)).find((m) => m.hours != null);
    const capRe = /(shall not exceed|limited to|capped at|aggregate liability)[^.]{0,200}(?:contract|price|fees|amounts?|\d+\s*%|times)/i;
    const cyberInd = firstMatch(ctx, /(?:cyber|data breach|security (?:incident|breach))[^.]{0,200}(?:indemnif|reimburse|liable|hold harmless)/i);
    const uncapped = cyberInd && !capRe.test(cyberInd.sentence) && !ctx.capFound;
    const notes = [];
    notes.push(`Signals: ${[sig.dod && "DoD", sig.cui && "CUI/CDI/CMMC"].filter(Boolean).join(", ")}.`);
    notes.push(has7012 ? "DFARS 252.204-7012 is cited." : "DFARS 252.204-7012 is not cited.");
    notes.push(level ? "A CMMC / NIST SP 800-171 level or assessment clause is referenced." : "No CMMC / NIST SP 800-171 level identified.");
    if (rep) notes.push(`Incident-reporting clock: ${rep.hours} hours.`);
    if (cyberInd) notes.push(uncapped ? "Cyber indemnity found with no cap." : "Cyber indemnity found.");
    const refs = refsOf([rep, cyberInd]).concat(ctx.clauses.filter((c) => /252\.204-70(12|20|21)/.test(c.text || "")).slice(0, 2));
    const quote = rep ? short(rep.sentence) : cyberInd ? short(cyberInd.sentence) : "";
    let status;
    if (side === "seller") {
      if (!has7012 && sig.cui) status = "Deviation";
      else if (rep && rep.hours < 24) { status = "Deviation"; notes.push("Reporting clock is shorter than 24 hours."); }
      else if (uncapped) status = "Deviation";
      else if (!level) status = "Review";
      else status = "Compliant";
    } else {
      if (!has7012 && sig.cui) status = "Deviation";
      else if (rep && rep.hours > (p.reportHours || 72)) { status = "Deviation"; notes.push(`Reporting clock is longer than the prime's own ${p.reportHours || 72}-hour deadline.`); }
      else if (!rep) status = "Fallback";
      else status = level ? "Compliant" : "Review";
    }
    return { status, refs, quote, notes };
  };

  E.G06 = (ctx, p) => {
    const { side } = ctx;
    const NEG = /\b(?:not|never|nor|no)\b[^.]{0,40}(?:condition|contingen|depend)|regardless of|irrespective of/i;
    const pwp = allMatches(ctx, /pay(?:ment)?[- ]when[- ]paid|pay[- ]if[- ]paid|condition(?:ed)? (?:up)?on (?:the )?(?:prime|contractor)'?s? receipt|after (?:prime|contractor)(?: contractor)? receives? (?:corresponding )?payment from the government|receipt of (?:corresponding )?payment from the government/i).find((m) => !NEG.test(m.sentence)) || null;
    const pay = firstMatch(ctx, /(?:pay|payment)[^.]{0,160}(?:invoice|receipt)/i) || firstMatch(ctx, /\bnet\s*\d{2,3}\b/i);
    let days = null;
    if (pay) {
      const d = RE.durations(pay.sentence, "days");
      const n = pay.sentence.match(/\bnet\s*(\d{2,3})\b/i);
      days = d.length ? d[0].value : n ? parseInt(n[1], 10) : null;
    }
    const sb = ctx.sig.small && !ctx.ids.has("52.232-40");
    const notes = [];
    if (pwp) notes.push("Payment is contingent on the prime's receipt of government payment (enforceability varies by state — verify).");
    if (days != null) notes.push(`Payment term: ${days} days from invoice.`); else if (pay) notes.push("Payment term stated without a day count.");
    if (!pay && !pwp) notes.push("No payment-timing language found.");
    if (sb) notes.push("Small-business signals present but FAR 52.232-40 (accelerated payment) is not cited.");
    const refs = refsOf([pwp, pay]);
    const quote = pwp ? short(pwp.sentence) : pay ? short(pay.sentence) : "";
    let status;
    if (!pay && !pwp) status = "Missing";
    else if (side === "seller") {
      if (pwp) status = "Deviation";
      else if (days == null) status = "Review";
      else if (days > p.maxDays) status = "Deviation";
      else if (days > p.fallbackDays) status = "Review";
      else if (days > p.preferredDays) status = "Fallback";
      else status = "Compliant";
    } else {
      if (sb) status = "Fallback";
      else if (pwp) status = "Compliant";
      else if (days == null) status = "Review";
      else if (days >= p.preferredDays) status = "Compliant";
      else if (days >= p.fallbackDays) status = "Fallback";
      else status = "Deviation";
    }
    return { status, refs, quote, notes };
  };

  E.G07 = (ctx) => {
    const { side } = ctx;
    const tc = ctx.clauses.filter((c) => /terminat\w*[^.]{0,80}convenience|convenience[^.]{0,40}terminat/i.test(c.text || ""));
    const any = firstMatch(ctx, /terminat[^.]{0,60}(?:at any time|for any reason|without cause)/i);
    if (!tc.length && !any) {
      return { status: side === "buyer" ? "Missing" : "Compliant", refs: [], quote: "", notes: [side === "buyer" ? "No termination-for-convenience right found — the prime may need a matching right if the prime contract has one." : "No termination-for-convenience clause found against us."] };
    }
    const text = (tc.map((c) => c.text).join(" ") + " " + (any ? any.sentence : ""));
    const recovery = /(costs? incurred|reasonable costs?|settlement expenses?|work (?:performed|completed|in progress)|payment for (?:conforming )?work)/i.test(text);
    const profit = /reasonable profit|profit on (?:the )?work/i.test(text);
    const noPay = /no (?:liability|obligation|compensation)|shall not be (?:liable|entitled)|without (?:liability|compensation|payment)/i.test(text);
    const antic = /anticipat\w+ profits?|lost profits?/i.test(text);
    const notes = [recovery ? "Recovery language found." : "No recovery language found.", profit ? "Reasonable profit on work performed is covered." : "No profit on work performed is stated.", antic ? "Anticipatory / lost profit is addressed." : "Anticipatory profit is not addressed."];
    if (noPay) notes.push("'No liability / no compensation' wording found.");
    const refs = tc.length ? tc : refsOf([any]);
    const quote = short(tc.length ? (sentOf(tc[0]).find((s) => /convenience/i.test(s)) || "") : any.sentence);
    let status;
    if (side === "seller") status = noPay || !recovery ? "Deviation" : profit ? "Compliant" : "Fallback";
    else status = recovery ? "Compliant" : "Review";
    return { status, refs, quote, notes };
  };

  E.G08 = (ctx) => {
    const { side, ids } = ctx;
    const pass = firstMatch(ctx, /sponsor|pass[- ]through|present (?:the )?claim|on behalf of subcontractor|liquidating agreement/i);
    const waiver = firstMatch(ctx, /(?:waive|release)[^.]{0,120}(?:claims?|damages)[^.]{0,140}(?:government|prime|contracting officer|delay|disruption)|no (?:claim|damages)[^.]{0,60}(?:delay|disruption)/i);
    const bar = firstMatch(ctx, /(?:no|not)[^.]{0,40}(?:pass[- ]through|sponsor)/i);
    const binding = firstMatch(ctx, /bound by[^.]{0,80}(?:outcome|decision|determination)|final (?:decision|outcome)[^.]{0,60}bind/i);
    const notes = [];
    if (pass) notes.push("Pass-through / sponsorship language found.");
    if (waiver) notes.push("A waiver of delay / disruption claims was found.");
    if (bar) notes.push("Language barring pass-through or sponsorship found.");
    if (ids.has("52.233-1")) notes.push("FAR 52.233-1 (Disputes) is cited.");
    const refs = refsOf([waiver, bar, pass]);
    const quote = short((waiver || bar || pass || { sentence: "" }).sentence);
    let status;
    if (side === "seller") status = waiver || bar ? "Deviation" : pass ? "Compliant" : "Review";
    else status = pass && binding ? "Compliant" : pass ? "Fallback" : "Missing";
    return { status, refs, quote, notes };
  };

  E.G09 = (ctx, p) => {
    const { side } = ctx;
    const unlimited = firstMatch(ctx, /unlimited liability|without limit(?:ation)?|uncapped|no (?:limit|cap)\b|liability shall not be limited/i);
    const conseq = firstMatch(ctx, /(?:including|including without limitation|including but not limited to)[^.]{0,80}(?:loss of profit|lost profit|consequential|indirect)|liable for[^.]{0,100}(?:consequential|loss of profit)/i);
    const exclusion = firstMatch(ctx, /(?:not|neither)[^.]{0,80}liable[^.]{0,100}(?:consequential|indirect|loss of profit)/i);
    const cap = firstMatch(ctx, /(?:shall not exceed|limited to|capped at|aggregate liability[^.]{0,120}(?:exceed|limited))[^.]{0,200}(?:contract (?:price|value)|subcontract (?:price|value)|amounts? (?:paid|payable)|fees|price|\d+(?:\.\d+)?\s*%|\$|USD)/i);
    const mult = cap ? (cap.sentence.match(/(\d+(?:\.\d+)?|two|three|four|five)\s*(?:times|x)\b/i) || [])[1] : null;
    const multN = mult ? ({ two: 2, three: 3, four: 4, five: 5 }[String(mult).toLowerCase()] || parseFloat(mult)) : null;
    const ld = firstMatch(ctx, /liquidated damages[^.]{0,200}\d+(?:\.\d+)?\s*(?:%|percent)/i);
    const ldCap = ld && /(?:maximum|cap|not exceed|up to)/i.test(ld.sentence);
    ctx.capFound = !!cap;
    const notes = [];
    if (cap) notes.push("A liability cap was found" + (multN ? ` (${multN}× multiple).` : "."));
    if (unlimited) notes.push("Unlimited / uncapped liability wording found.");
    if (conseq && !exclusion) notes.push("Loss of profit or consequential loss is recoverable.");
    if (exclusion) notes.push("Consequential / indirect loss is excluded.");
    if (ld) notes.push(ldCap ? "Liquidated damages are stated with a cap." : "Liquidated damages are stated without a cap.");
    if (!cap && !unlimited) notes.push("No liability cap found.");
    const refs = refsOf([unlimited, conseq, cap, ld]);
    const quote = short((unlimited || conseq || cap || ld || { sentence: "" }).sentence);
    let status;
    if (side === "seller") {
      if (unlimited || (conseq && !exclusion)) status = "Deviation";
      else if (ld && !ldCap) status = "Deviation";
      else if (cap) status = multN && multN > p.fallbackMultiple ? "Deviation" : multN && multN > 1 ? "Fallback" : exclusion ? "Compliant" : "Fallback";
      else status = "Missing";
    } else {
      if (unlimited) status = "Compliant";
      else if (cap) status = /(?:except|excluding|does not apply|carve)/i.test(cap.sentence) ? "Compliant" : "Fallback";
      else status = "Review";
    }
    return { status, refs, quote, notes };
  };

  E.G10 = (ctx) => {
    const defined = new Set(ctx.clauses.map((c) => (c.annex || "").toUpperCase()).filter(Boolean));
    const refs = new Map();
    const re = /\b(Exhibit|Attachment|Appendix|Annex|Schedule)\s+([A-Z0-9]{1,3})\b/g;
    let m;
    while ((m = re.exec(ctx.flat))) {
      const label = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2].toUpperCase()}`.toUpperCase();
      if (!refs.has(label)) refs.set(label, `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2].toUpperCase()}`);
    }
    const missing = [...refs.keys()].filter((k) => !defined.has(k)).map((k) => refs.get(k));
    const sowRef = /\b(Statement of Work|SOW|Performance Work Statement|PWS)\b/.test(ctx.flat);
    const sowDef = ctx.clauses.some((c) => /statement of work|\bSOW\b|performance work statement|\bPWS\b/i.test(c.heading || "")) || [...defined].some((a) => false);
    if (sowRef && !sowDef && !missing.length) missing.push("Statement of Work");
    ctx.missingAnnexes = missing;
    const notes = missing.length ? ["Referenced but not supplied: " + missing.join(", ") + ". Matters they control are Not assessable."] : ["Every referenced attachment appears in the supplied text."];
    return { status: missing.length ? "Missing" : "Compliant", refs: [], quote: "", notes, redline: missing.length ? { action: "Insert", location: "Document set", original: "—" } : null };
  };

  /* ---------------- integrity ---------------- */
  function integrity(ctx) {
    const alerts = [];
    if (/ignore (?:the )?(?:playbook|previous|above|instructions)|approve (?:this|the) (?:contract|subcontract|document)|do not (?:flag|report)|you (?:must|should) (?:approve|mark)/i.test(ctx.flat)) {
      alerts.push({ severity: "high", type: "Embedded instruction", text: "The document contains text that tries to steer the review. It was reported, not followed." });
    }
    if (ctx.ourName) {
      const m = ctx.flat.match(new RegExp(escRe(ctx.ourName) + '[^"“]{0,160}["“]([A-Za-z ]{3,30})["”]', "i"));
      const side = m ? roleSide(m[1]) : null;
      if (side && side !== ctx.side) alerts.push({ severity: "high", type: "Position mismatch", text: `${ctx.ourName} appears as "${m[1]}", but the review position is ${ctx.side === "seller" ? "Subcontractor" : "Prime"}.` });
    }
    if (!ctx.cites.length && ctx.sig.federal) alerts.push({ severity: "medium", type: "No clause citations", text: "Federal signals were found but no FAR/DFARS clause number was cited." });
    return alerts;
  }

  /* ---------------- main ---------------- */
  const IMPORTANCE_W = { Critical: 3, High: 2, Medium: 1 };
  function recommend(status, pos) {
    switch (status) {
      case "Compliant": return "No change required. Preserve this wording in negotiation.";
      case "Fallback": return `Within negotiation authority. Open with the preferred position (${pos.preferred}) and concede only to: ${pos.fallback}`;
      case "Deviation": return `Outside playbook authority — push back to the preferred position (${pos.preferred}). If the counterparty refuses, escalate to ${pos.approver}. Escalation trigger: ${pos.escalation}`;
      case "Missing": return `Insert the playbook clause. Preferred: ${pos.preferred}`;
      default: return `Manual review required. Target position: ${pos.preferred}`;
    }
  }

  function parties(flat) {
    const out = [];
    const re = /([A-Z][A-Za-z0-9&.,'’\- ]{2,60}?(?:Inc\.?|LLC|L\.L\.C\.|Corp\.?|Corporation|Ltd\.?|Co\.|Company|LP|LLP))[^"“]{0,200}?["“](Prime Contractor|Subcontractor|Prime|Seller|Buyer)["”]/g;
    let m;
    while ((m = re.exec(flat))) {
      const name = norm(m[1]).replace(/^.*\b(?:between|and)\s+/i, "");
      if (!out.some((p) => p.role === m[2])) out.push({ name, role: m[2], side: roleSide(m[2]) });
    }
    return out;
  }

  function review(text, playbook, side, ourName) {
    const clauses = RE.segment(text);
    const flat = norm(text);
    const cites = extractCites(clauses);
    const dist = distinct(cites);
    const ids = new Set(dist.map((d) => d.id));
    const sig = signals(flat, ids);
    const ctx = { clauses, flat, side, ourName: (ourName || "").trim(), cites, distinct: dist, distinctMap: new Map(dist.map((d) => [d.id, d])), ids, sig, capFound: false };
    const order = ["G09", "G01", "G02", "G03", "G04", "G05", "G06", "G07", "G08", "G10"]; // G09 first: it sets capFound for G05
    const byId = Object.fromEntries(playbook.rules.map((r) => [r.id, r]));
    const results = {};
    order.forEach((id) => {
      const rule = byId[id]; const pos = rule && rule[side]; const fn = E[id];
      if (!rule || !pos || !fn) return;
      try { results[id] = fn(ctx, pos.params || {}); } catch (e) { results[id] = { status: "Review", refs: [], quote: "", notes: ["Automatic check failed: " + e.message] }; }
    });
    const findings = [];
    playbook.rules.forEach((rule) => {
      const pos = rule[side]; const r = results[rule.id];
      if (!pos || !r) return;
      const importance = pos.importance || rule.importance;
      const status = r.status;
      let redline = null;
      if (status !== "Compliant") {
        const base = { action: status === "Missing" ? "Insert" : "Replace", location: (r.refs || []).length ? (status === "Missing" ? "Insert after " + r.refs[r.refs.length - 1].label : r.refs.map((c) => c.label).join(" + ")) : "New clause (insert after the related clause)", original: r.quote || "—", proposed: pos.model, extra: [] };
        if (r.redline) Object.keys(r.redline).forEach((k) => { if (r.redline[k] != null) base[k] = r.redline[k]; });
        redline = base;
      }
      findings.push({
        ruleId: rule.id, issue: rule.title, category: rule.category, importance, status,
        refs: (r.refs || []).map((c) => ({ id: c.id, label: c.label })),
        refLabel: (r.refs || []).map((c) => c.label).join(", ") || "—",
        quote: r.quote || "", analysis: r.notes || [],
        recommendation: recommend(status, pos),
        approver: status === "Deviation" || status === "Missing" ? pos.approver : status === "Fallback" ? "Within negotiator authority (record the concession)" : status === "Review" ? "Reviewer to confirm" : "—",
        redline, source: "rules"
      });
    });
    const alerts = integrity(ctx);
    const score = findings.reduce((s, f) => s + (f.status === "Deviation" ? 2 * IMPORTANCE_W[f.importance] : f.status === "Missing" ? 1.5 * IMPORTANCE_W[f.importance] : f.status === "Fallback" ? 0.5 : f.status === "Review" ? 0.5 : 0), 0) + alerts.filter((a) => a.severity === "high").length * 3;
    const critDev = findings.some((f) => (f.status === "Deviation" || f.status === "Missing") && f.importance === "Critical");
    const overall = critDev || score >= 18 ? "High" : score >= 7 ? "Medium" : "Low";
    const decisions = {};
    findings.filter((f) => f.status === "Deviation" || f.status === "Missing").forEach((f) => { (decisions[f.approver] = decisions[f.approver] || []).push(f.ruleId); });
    const law = (flat.match(/governed by[^.]{0,80}laws? of (?:the )?(?:State of |Commonwealth of )?([A-Z][A-Za-z ]{2,30})/) || [])[1];
    const forum = (flat.match(/(?:courts?|arbitration)[^.]{0,30}(?:of|in|located in)\s+[A-Z][^.]{2,70}/) || [])[0];
    const g01 = results.G01 && results.G01.meta;
    return {
      mode: "gov",
      playbook: { id: playbook.id, name: playbook.name },
      side, ourName: ctx.ourName, clauses, findings, alerts, overall, score: Math.round(score * 10) / 10, decisions,
      meta: { parties: parties(flat), price: null, priceText: "n/a (see subcontract price)", incoterms: [], law: law ? `State of ${law}` : null, forum: forum ? norm(forum) : null, missingAnnexes: ctx.missingAnnexes || [] },
      gov: {
        dbVersion: DB.meta.version, dbVerification: DB.meta.verification,
        signals: Object.keys(sig).filter((k) => sig[k]),
        cites: dist.map((d) => ({ id: d.id, auth: d.auth, dates: d.dates, deviation: d.deviation, inDb: !!d.db, verified: !!(d.db && d.db.verified), flowdown: d.db ? d.db.flowdown : null })),
        flowdown: g01 || null
      },
      engine: "rules", createdAt: new Date().toISOString()
    };
  }

  const api = { review, extractCites, signals, expected };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GovEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
