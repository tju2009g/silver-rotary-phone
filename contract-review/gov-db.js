/* =====================================================================
   Clause DB v0 — US federal procurement (FAR / DFARS), DRAFT.
   Metadata only (identity, flow-down class, topic, own-words note).
   No regulation text is reproduced; every entry links to the official source.

   STATUS: clause dates checked 2026-11-23 against owner-supplied acquisition.gov
   reference packs (FAC 2026-01, DFARS Change 5/7/2026). Not yet checked: agency
   class deviations and RFO changes. `currentDate` is null for any entry that is
   not verified; the engine then reports "version not verified" instead of guessing.

   The FAR is in the middle of the Revolutionary FAR Overhaul (RFO): agencies apply
   class deviations now, formal rulemaking is ongoing. Clause text and dates can differ
   by agency and may change again — see `rfo` below.
   ===================================================================== */
(function (root) {
  "use strict";

  // Verified against official text supplied by the owner (acquisition.gov PDFs, 2026-11-23)
  const VERIFIED = {
    "52.204-21": "NOV 2021", "252.204-7012": "MAY 2024",            // official clause text (owner-supplied PDFs)
    // Owner's reference pack (acquisition.gov check, FAC 2026-01 / DFARS Change 5/7/2026), 2026-11-23:
    "252.227-7013": "AUG 2025", "252.227-7014": "AUG 2025", "252.227-7015": "JAN 2025",
    "52.204-25": "NOV 2021", "52.204-23": "DEC 2023", "52.222-50": "OCT 2025", "52.244-6": "OCT 2025",
    "252.204-7020": "NOV 2023", "252.204-7021": "NOV 2025",
    // Owner's second reference pack, 2026-11-23:
    "52.244-2": "JUN 2020", "52.232-40": "MAR 2023", "52.249-2": "APR 2012",
    "252.227-7017": "JAN 2025", "252.227-7037": "JAN 2025", "252.246-7007": "JAN 2023", "252.246-7008": "JAN 2023",
    // Owner's third reference pack (17 clauses), 2026-11-23. 252.225-7048 was confirmed from secondary
    // sources (the pack could not open its official page), so treat that one as lower confidence.
    "52.204-27": "JUN 2023", "52.203-19": "JAN 2017", "52.203-13": "NOV 2021", "52.215-8": "OCT 1997",
    "52.212-4": "NOV 2023", "52.243-1": "AUG 1987", "52.233-1": "MAY 2014", "52.211-11": "SEP 2000",
    "52.246-2": "AUG 1996", "52.249-8": "APR 1984", "52.227-14": "MAY 2014", "52.227-11": "MAY 2014",
    "252.227-7018": "AUG 2025", "252.225-7048": "JUN 2013", "252.239-7010": "JAN 2023",
    "252.203-7002": "DEC 2022", "252.244-7000": "NOV 2023",
    // Third pack, single directly-opened clause (owner's GPT register, 2026-11-23):
    "252.203-7000": "SEP 2011"
  };
  const FAR_URL = (n) => "https://www.acquisition.gov/far/" + n;
  const DFARS_PART = "https://www.acquisition.gov/dfars/part-252-solicitation-provisions-and-contract-clauses";

  // flowdown: "required" = prime must include in subcontracts (confirm threshold/condition);
  //           "conditional" = only when the stated condition applies; "none" = not a flow-down clause.
  // when: tags the engine uses to decide whether the clause is expected for a given document.
  const C = (id, auth, kind, title, topic, flowdown, when, note, severity) => ({
    id, auth, kind, title, topic, flowdown, when: when || [], note, severity: severity || "High",
    link: auth === "FAR" ? FAR_URL(id) : DFARS_PART,
    currentDate: VERIFIED[id] || null, verified: !!VERIFIED[id]
  });

  const CLAUSES = [
    // ---- Safeguarding / supply-chain security ----
    C("52.204-21", "FAR", "clause", "Basic Safeguarding of Covered Contractor Information Systems", "cyber", "conditional", ["fci"], "Basic safeguarding for systems holding federal contract information; flows down where a subcontractor may hold such information."),
    C("52.204-23", "FAR", "clause", "Prohibition on Contracting for Hardware, Software, and Services Developed or Provided by Kaspersky Lab Covered Entities", "supply-chain", "required", ["federal"], "Covered-vendor prohibition; flows down to subcontracts."),
    C("52.204-25", "FAR", "clause", "Prohibition on Contracting for Certain Telecommunications and Video Surveillance Services or Equipment", "supply-chain", "required", ["federal"], "Section 889 covered-equipment prohibition; flows down to all subcontracts including commercial."),
    C("52.204-27", "FAR", "clause", "Prohibition on a ByteDance Covered Application", "supply-chain", "required", ["federal"], "Covered-application prohibition; flows down to subcontracts. Confirm applicability."),
    C("52.203-19", "FAR", "clause", "Prohibition on Requiring Certain Internal Confidentiality Agreements or Statements", "ethics", "required", ["federal"], "Bars confidentiality agreements that restrict reporting waste, fraud or abuse; flows down."),
    C("52.222-50", "FAR", "clause", "Combating Trafficking in Persons", "labor", "required", ["federal"], "Trafficking-in-persons compliance; flows down to subcontracts."),
    C("52.203-13", "FAR", "clause", "Contractor Code of Business Ethics and Conduct", "ethics", "conditional", ["federal", "large"], "Ethics program and disclosure duties; flow-down depends on subcontract value and period of performance (confirm current thresholds)."),

    // ---- Structure / precedence / commercial ----
    C("52.215-8", "FAR", "clause", "Order of Precedence — Uniform Contract Format", "precedence", "none", ["federal"], "Sets the order in which conflicting contract parts are resolved; subcontract precedence language should not undercut flowed-down clauses.", "Medium"),
    C("52.212-4", "FAR", "clause", "Contract Terms and Conditions — Commercial Products and Commercial Services", "commercial", "none", ["commercial"], "Baseline terms for commercial acquisitions; check how it interacts with additional negotiated terms."),
    C("52.244-6", "FAR", "clause", "Subcontracts for Commercial Products and Commercial Services", "flowdown", "none", ["commercial"], "Lists which clauses flow down to commercial subcontracts."),
    C("52.244-2", "FAR", "clause", "Subcontracts", "flowdown", "none", ["federal"], "Consent and advance-notification requirements for subcontracting, where the prime contract includes it.", "Medium"),

    // ---- Money / change / termination / disputes ----
    C("52.232-40", "FAR", "clause", "Providing Accelerated Payments to Small Business Subcontractors", "payment", "required", ["small"], "Accelerated payment to small-business subcontractors; flows down. Interacts with pay-when-paid terms."),
    C("52.249-2", "FAR", "clause", "Termination for Convenience of the Government (Fixed-Price)", "termination", "none", ["fixed-price"], "Government termination-for-convenience settlement framework; subcontract termination terms should be able to follow it."),
    C("52.249-8", "FAR", "clause", "Default (Fixed-Price Supply and Service)", "termination", "none", ["fixed-price"], "Default termination framework; excess reprocurement cost exposure."),
    C("52.243-1", "FAR", "clause", "Changes — Fixed-Price", "changes", "none", ["fixed-price"], "Equitable adjustment for directed changes.", "Medium"),
    C("52.233-1", "FAR", "clause", "Disputes", "disputes", "none", ["federal"], "Contract Disputes Act process; subcontractors have no direct standing, so claims pass through the prime.", "Medium"),
    C("52.211-11", "FAR", "clause", "Liquidated Damages — Supplies, Services, or Research and Development", "ld", "none", ["federal"], "Prime-level delay damages that primes often try to pass down in full.", "Medium"),
    C("52.246-2", "FAR", "clause", "Inspection of Supplies — Fixed-Price", "quality", "none", ["fixed-price"], "Government inspection and acceptance regime for supplies.", "Medium"),

    // ---- Data rights / IP (civilian) ----
    C("52.227-14", "FAR", "clause", "Rights in Data — General", "data-rights", "conditional", ["civilian", "tech-data"], "Default data-rights allocation in civilian contracts; check marking and license scope."),
    C("52.227-11", "FAR", "clause", "Patent Rights — Ownership by the Contractor", "data-rights", "conditional", ["civilian", "tech-data"], "Invention reporting and ownership; subcontract assignment language should respect it."),

    // ---- DFARS: cyber ----
    C("252.204-7012", "DFARS", "clause", "Safeguarding Covered Defense Information and Cyber Incident Reporting", "cyber", "required", ["dod", "cui"], "Controls for covered defense information and rapid cyber-incident reporting; flows down to subcontracts handling such information."),
    C("252.204-7020", "DFARS", "clause", "NIST SP 800-171 DoD Assessment Requirements", "cyber", "required", ["dod", "cui"], "Assessment and score-submission requirements; flows down."),
    C("252.204-7021", "DFARS", "clause", "Contractor Compliance with the Cybersecurity Maturity Model Certification Level Requirements", "cyber", "required", ["dod", "cui"], "CMMC level requirement; flow-down and applicability depend on the phase-in and the solicitation. Confirm current status."),

    // ---- DFARS: data rights ----
    C("252.227-7013", "DFARS", "clause", "Rights in Technical Data — Other Than Commercial Products and Commercial Services", "data-rights", "required", ["dod", "tech-data"], "Technical-data license rights by funding source; flows down. Central to protecting privately funded data."),
    C("252.227-7014", "DFARS", "clause", "Rights in Other Than Commercial Computer Software and Other Than Commercial Computer Software Documentation", "data-rights", "required", ["dod", "tech-data"], "Software license rights by funding source; flows down."),
    C("252.227-7015", "DFARS", "clause", "Technical Data — Commercial Products and Commercial Services", "data-rights", "conditional", ["dod", "tech-data", "commercial"], "Technical data for commercial items."),
    C("252.227-7017", "DFARS", "provision", "Identification and Assertion of Use, Release, or Disclosure Restrictions", "data-rights", "none", ["dod", "tech-data"], "Pre-award assertions table for restricted data; missing assertions can forfeit restrictions."),
    C("252.227-7037", "DFARS", "clause", "Validation of Asserted Restrictions—Technical Data", "data-rights", "required", ["dod", "tech-data"], "Marking-validation process; unmarked or wrongly marked data can lose protection."),
    C("252.227-7018", "DFARS", "clause", "Rights in Other Than Commercial Technical Data and Computer Software — SBIR/STTR Program", "data-rights", "conditional", ["dod", "tech-data", "sbir"], "Special data-rights regime for SBIR/STTR awards."),

    // ---- DFARS: supply chain / export / other ----
    C("252.225-7048", "DFARS", "clause", "Export-Controlled Items", "export", "conditional", ["dod"], "Export-control compliance; flows down to all subcontracts."),
    C("252.246-7007", "DFARS", "clause", "Contractor Counterfeit Electronic Part Detection and Avoidance System", "counterfeit", "conditional", ["dod", "electronic"], "Counterfeit electronic parts program; flow-down applies to covered contractors."),
    C("252.246-7008", "DFARS", "clause", "Sources of Electronic Parts", "counterfeit", "conditional", ["dod", "electronic"], "Approved sourcing for electronic parts; flows down."),
    C("252.239-7010", "DFARS", "clause", "Cloud Computing Services", "cyber", "conditional", ["dod", "cloud"], "Requirements when cloud services are used for DoD data; flows down where applicable."),
    C("252.203-7000", "DFARS", "clause", "Requirements Relating to Compensation of Former DoD Officials", "ethics", "none", ["dod"], "Restricts hiring or compensating certain former DoD officials; no express subcontract flow-down in paragraphs (a)–(c).", "Low"),
    C("252.203-7002", "DFARS", "clause", "Requirement to Inform Employees of Whistleblower Rights", "ethics", "required", ["dod"], "Whistleblower-rights notice; flows down.", "Medium"),
    C("252.244-7000", "DFARS", "clause", "Subcontracts for Commercial Products or Commercial Services", "flowdown", "required", ["dod", "commercial"], "DoD list of flow-down clauses for commercial subcontracts.", "Medium")
  ];

  const byId = Object.fromEntries(CLAUSES.map((c) => [c.id, c]));

  const api = {
    meta: {
      version: "v0.1",
      compiledOn: "2026-11-22",
      datesVerifiedOn: "2026-11-23",
      verification: "Clause dates verified 2026-11-23 (FAC 2026-01 / DFARS Change 5/7/2026). Class deviations: 13 DoD/GSA entries recorded from a partial register (affected clause numbers not yet mapped) — confirm before client use.",
      rfo: "Revolutionary FAR Overhaul in progress: agency class deviations apply now; formal notice-and-comment rulemaking is ongoing. Clause text and dates may differ by agency and may change."
    },
    clauses: CLAUSES,
    // DoD / GSA class deviations from the owner's 2026-11-23 register. PARTIAL: issue/effective dates are as
    // recorded there ("unknown" = not confirmed); the clause numbers each one changes are NOT yet mapped.
    deviations: [
      { no: "2026-O0038", agency: "DoD", issued: "2026-01-20", effective: "2026-02-01", scope: "Use RFO replacement text for FAR Part 52 clauses/provisions", source: "https://www.acq.osd.mil/dpap/dars/classdev/DFARS_RFO/Part-52/2026-O0038_TAB_A_Deviation_Memo_Part_52.pdf" },
      { no: "2025-O0003", agency: "DoD", issued: "2025-03-04", effective: null, scope: "Restoring Merit-Based Opportunity in Federal Contracts", source: "https://www.acq.osd.mil/dpap/policy/policyvault/USA000368-25-DPCAP.pdf" },
      { no: "2026-O0037", agency: "DoD", issued: "2026-07-24 (Rev 1)", effective: null, scope: "RFO Part 19 / DFARS 219" },
      { no: "2026-O0025", agency: "DoD", issued: "2026-09-03 (Rev 3)", effective: null, scope: "RFO Part 40 / DFARS 240" },
      { no: "2026-O0034", agency: "DoD", issued: "2026-08-05 (Rev 1)", effective: null, scope: "RFO Part 43 / DFARS 243" },
      { no: "2026-O0015", agency: "DoD", issued: "2026-07-29 (Rev 1)", effective: null, scope: "RFO Part 44 / DFARS 244" },
      { no: "2026-O0046", agency: "DoD", issued: "2026-09-09 (Rev 1)", effective: null, scope: "RFO Part 45 / DFARS 245" },
      { no: "2026-O0003", agency: "DoD", issued: "2026-08-24 (Rev 1)", effective: "immediate", scope: "RFO Part 5 / DFARS 205", source: "https://www.acq.osd.mil/dpap/dars/classdev/DFARS_RFO/Part-205/2026-O0003_Rev_1_TAB_A_Deviation_Memo.pdf" },
      { no: "2026-O0050", agency: "DoD", issued: "2026-03-06", effective: null, scope: "RFO Part 42 / DFARS 242" },
      { no: "RFO-2025-38", agency: "GSA", issued: null, effective: "2025-11-03", scope: "FAR Part 38 removed; managed under GSAR 538" },
      { no: "RFO-2025-46", agency: "GSA", issued: null, effective: null, scope: "RFO model text for FAR Part 46" },
      { no: "RFO-2025-42", agency: "GSA", issued: null, effective: null, scope: "RFO model text for FAR Part 42" },
      { no: "RFO-2025-34", agency: "GSA", issued: "2025-04-21", effective: null, scope: "RFO model text for FAR Part 34" }
    ],
    byId,
    // Citation pattern: FAR 52.xxx-x and DFARS 252.xxx-xxxx
    ID_RE: /\b(?:(FAR|DFARS)\s*)?(252\.\d{3}-\d{4}|52\.\d{3}-\d{1,2})\b/g
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FAR_DB = api;
})(typeof window !== "undefined" ? window : globalThis);
