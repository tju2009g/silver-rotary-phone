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

  // ---- Reference register (title + clause date only; no flow-down/when logic, so it never drives "missing clause" findings) ----
  // Batches 1-3 (DFARS/FAR, owner's GPT run, 2026-11-24). Tier "corroborated": each date equals the version cited in the D1 and/or D2
  // solicitation clause lists (a cited version cannot be newer than the current one, so no contradiction found), but the
  // acquisition.gov page itself was not opened by us. Entries with date null carry the unconfirmed claim in `claimedDate`.
  const REG = [
    ["252.203-7001", "Prohibition on Persons Convicted of Fraud or Other Defense Contract-Related Felonies", "JAN 2023"],
    ["252.203-7005", "Representation Relating to Compensation of Former DoD Officials", "SEP 2022"],
    ["252.204-7000", "Disclosure of Information", "OCT 2016"],
    ["252.204-7003", "Control of Government Personnel Work Product", "APR 1992"],
    ["252.204-7004", "Antiterrorism Awareness Training for Contractors", "JAN 2023"],
    ["252.204-7006", "Billing Instructions-Cost Vouchers", "MAY 2023"],
    ["252.204-7008", "Compliance with Safeguarding Covered Defense Information Controls", "OCT 2016"],
    ["252.204-7017", "Prohibition on the Acquisition of Covered Defense Telecommunications Equipment or Services-Representation", "MAY 2021"],
    ["252.204-7018", "Prohibition on the Acquisition of Covered Defense Telecommunications Equipment or Services", "JAN 2023"],
    ["252.204-7024", "Notice on the Use of the Supplier Performance Risk System", "MAR 2023"],
    ["252.209-7004", "Subcontracting with Firms that are Owned or Controlled by the Government of a Country that is a State Sponsor of Terrorism", "MAY 2019"],
    ["252.215-7002", "Cost Estimating System Requirements", "JAN 2025"],
    ["252.215-7013", "Supplies and Services Provided by Nontraditional Defense Contractors", "JAN 2023"],
    ["252.222-7006", "Restrictions on the Use of Mandatory Arbitration Agreements", "JAN 2023"],
    ["252.223-7006", "Prohibition on Storage, Treatment, and Disposal of Toxic or Hazardous Materials", "SEP 2014"],
    ["252.223-7008", "Prohibition of Hexavalent Chromium", "JAN 2023"],
    ["252.225-7012", "Preference for Certain Domestic Commodities", "APR 2022"],
    // Batch 2 (DFARS, GPT run 2026-11-24, all marked directly viewed); every date equals the newest base version cited in D1/D2.
    ["252.225-7055", "Representation Regarding Business Operations with the Maduro Regime", "MAY 2022"],
    ["252.225-7056", "Prohibition Regarding Business Operations with the Maduro Regime", "JAN 2023"],
    ["252.225-7059", "Prohibition on Certain Procurements from the Xinjiang Uyghur Autonomous Region-Representation", "JUN 2023"],
    ["252.225-7060", "Prohibition on Certain Procurements from the Xinjiang Uyghur Autonomous Region", "JUN 2023"],
    ["252.226-7001", "Utilization of Indian Organizations, Indian-Owned Economic Enterprises, and Native Hawaiian Small Business Concerns", "JAN 2023"],
    ["252.227-7039", "Patents-Reporting of Subject Inventions", "APR 1990"],
    ["252.232-7003", "Electronic Submission of Payment Requests and Receiving Reports", "DEC 2018"],
    ["252.232-7006", "Wide Area WorkFlow Payment Instructions", "JAN 2023"],
    ["252.232-7007", "Limitation of Governments Obligation", "APR 2014"],
    ["252.232-7010", "Levies on Contract Payments", "DEC 2006"],
    ["252.235-7010", "Acknowledgment of Support and Disclaimer", "MAY 1995"],
    ["252.235-7011", "Final Scientific or Technical Report", "DEC 2019"],
    ["252.239-7009", "Representation of Use of Cloud Computing", "SEP 2015"],
    ["252.243-7001", "Pricing of Contract Modifications", "DEC 1991"],
    ["252.243-7002", "Requests for Equitable Adjustment", "DEC 2022"],
    ["252.245-7003", "Contractor Property Management System Administration", "JAN 2025"],
    ["252.245-7005", "Management and Reporting of Government Property", "JAN 2024"],
    ["252.247-7023", "Transportation of Supplies by Sea", "OCT 2024"],
    // Batch 3 (FAR, GPT run 2026-11-24, directly viewed). 'corroborated' = equals newest base version cited in D1/D2;
    // 'gpt-viewed' = D1/D2 cite only older/no versions (no contradiction, no corroboration).
    // 2026-O0038 (DoD RFO) lists replacement text for 52.204-10/-13, 52.209-7/-9/-10/-13, 52.211-5 (dated 2026-02 in D1/D2): confirm which version applies.
    ["52.203-10", "Price or Fee Adjustment for Illegal or Improper Activity", "MAY 2014", null, null],
    ["52.203-11", "Certification and Disclosure Regarding Payments to Influence Certain Federal Transactions", "SEP 2024", null, null],
    ["52.203-18", "Prohibition on Contracting with Entities that Require Certain Internal Confidentiality Agreements or Statements-Representation", "JAN 2017", null, null],
    ["52.203-2", "Certificate of Independent Price Determination", "APR 1985", null, null],
    ["52.203-3", "Gratuities", "APR 1984", null, null],
    ["52.203-5", "Covenant Against Contingent Fees", "MAY 2014", null, null],
    ["52.203-6", "Restrictions on Subcontractor Sales to the Government", "JUN 2020", null, null],
    ["52.203-8", "Cancellation, Rescission, and Recovery of Funds for Illegal or Improper Activity", "MAY 2014", null, null],
    ["52.204-10", "Reporting Executive Compensation and First-Tier Subcontract Awards", "JUN 2020", null, null],
    ["52.204-13", "System for Award Management Maintenance", "OCT 2018", null, null],
    ["52.204-19", "Incorporation by Reference of Representations and Certifications", "DEC 2014", null, null],
    ["52.204-7", "System for Award Management", "NOV 2024", null, "gpt-viewed"],
    ["52.207-4", "Economic Purchase Quantity-Supplies", "AUG 1987", null, null],
    ["52.209-10", "Prohibition on Contracting with Inverted Domestic Corporations", "NOV 2015", null, null],
    ["52.209-13", "Violation of Arms Control Treaties or Agreements-Certification", "NOV 2021", null, null],
    ["52.209-6", "Protecting the Government's Interest When Subcontracting With Contractors Debarred, Suspended, Proposed for Debarment, or Voluntarily Excluded", "JAN 2025", null, "gpt-viewed"],
    ["52.209-7", "Information Regarding Responsibility Matters", "OCT 2018", null, null],
    ["52.209-9", "Updates of Publicly Available Information Regarding Responsibility Matters", "OCT 2018", null, null],
    ["52.211-5", "Material Requirements", "AUG 2000", null, null],
    ["52.213-1", "Fast Payment Procedure", "MAY 2006", null, "gpt-viewed"],
    // 252.204-7016 is a provision that D1/D2 only mention inside other clauses (no list row), so no corroboration; GPT
    // re-check on 2026-11-24 marked it directly viewed (DEC 2019) with the acquisition.gov page address.
    ["252.204-7016", "Covered Defense Telecommunications Equipment or Services-Representation", "DEC 2019"],
    // CONFLICT: GPT says JUN 2023 twice, but D1 cites OCT 2024 (newer). Either D1 or the page GPT saw is off; open the page to resolve. Left unverified.
    ["252.205-7000", "Provision of Information to Cooperative Agreement Holders", null, "JUN 2023 per GPT (viewed twice) vs OCT 2024 cited in D1 (D2 cites JUN 2023); unresolved"]
  ].filter(([id]) => !CLAUSES.some((c) => c.id === id)).map(([id, title, date, claimed, tier]) => ({
    id, auth: id.startsWith("252.") ? "DFARS" : "FAR", kind: "clause", title, topic: "reference", flowdown: "none", when: [],
    note: "Reference entry: title and date only (flow-down not assessed).", severity: "Medium",
    link: id.startsWith("252.") ? DFARS_PART : FAR_URL(id), currentDate: date, verified: !!date, tier: date ? (tier || "corroborated") : "unconfirmed", claimedDate: claimed || null
  }));
  CLAUSES.push(...REG);

  const byId = Object.fromEntries(CLAUSES.map((c) => [c.id, c]));

  const api = {
    meta: {
      version: "v0.1",
      compiledOn: "2026-11-22",
      datesVerifiedOn: "2026-11-24",
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
