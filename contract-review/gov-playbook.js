/* =====================================================================
   GOV-1.0 — US Federal Subcontract Playbook (DEMONSTRATION).
   Positions reuse the engine's two keys:
     seller = we are the SUBCONTRACTOR (we deliver to a prime)
     buyer  = we are the PRIME / higher-tier (we issue the subcontract)
   Fictional policy for a small federal subcontractor / prime: NOT a legal standard
   and NOT legal advice. Thresholds live in `params`; edit them in the Playbook tab.
   ===================================================================== */
window.GOV_PLAYBOOK = {
  id: "GOV-1.0",
  name: "US Federal Subcontract Playbook (FAR / DFARS)",
  company: "Demonstration policy — small federal subcontractor / prime (fictional)",
  effective: "2026-11-22",
  disclaimer:
    "Demonstration policy. A playbook deviation is a business-policy finding, not a conclusion on legal validity or enforceability. The Clause DB is a draft and unverified; confirm clause text, dates and agency class deviations at acquisition.gov. Not legal advice.",
  positions: {
    seller: { label: "Subcontract — we are the Subcontractor", short: "Subcontractor" },
    buyer: { label: "Subcontract — we are the Prime / higher-tier", short: "Prime" }
  },
  approvers: {
    seller: ["Head of Legal", "CFO", "Program Manager", "CISO", "Contracts Manager"],
    buyer: ["Head of Legal", "CFO", "Subcontracts Manager", "CISO", "Compliance Officer"]
  },
  rules: [
    {
      id: "G01", category: "Flow-down", title: "Flow-down completeness & transparency", importance: "High",
      why: "A prime that omits required flow-down clauses carries the compliance gap; a subcontractor bound by a blanket 'all prime clauses' reference is bound to terms it has never seen. Required clauses depend on agency, subject matter and value — the checker compares what the document cites with what the Clause DB expects for the signals it detects.",
      seller: {
        importance: "High",
        preferred: "An explicit list of flowed-down clauses (with dates), and a copy of the prime Section I / relevant clauses supplied with the subcontract.",
        fallback: "Blanket incorporation by reference, but only together with a supplied prime-contract clause list and a duty on the prime to notify changes.",
        escalation: "Blanket 'all terms of the prime contract' incorporation with no clause list and no copy supplied.",
        approver: "Contracts Manager",
        params: {},
        model: "Flow-down. Attachment [__] lists every FAR and DFARS clause incorporated into this Subcontract, with clause date and any applicable agency class deviation. Prime Contractor shall provide Subcontractor a copy of the applicable prime-contract clauses before signature and shall notify Subcontractor in writing of any change to the flowed-down clauses. Where a flowed-down clause refers to 'the Government' or 'the Contracting Officer', it refers to Prime Contractor solely for the purpose of this Subcontract unless the clause expressly provides otherwise."
      },
      buyer: {
        importance: "Critical",
        preferred: "Every clause the Clause DB marks as required for the detected signals is cited, with date, in a flow-down attachment.",
        fallback: "Required clauses cited by number but without dates, to be completed before signature.",
        escalation: "One or more required flow-down clauses absent.",
        approver: "Subcontracts Manager",
        params: {},
        model: "Flow-down. The clauses listed in Attachment [__] are incorporated by reference and flow down to Subcontractor in the form and with the dates stated there, including any agency class deviation. Subcontractor shall include the clauses required by their terms in each lower-tier subcontract."
      }
    },
    {
      id: "G02", category: "Currency", title: "Clause currency & class-deviation watch", importance: "High",
      why: "The FAR is being rewritten through agency class deviations while formal rulemaking continues. A clause cited without a date, with an old date, or without the applicable deviation can carry different text than the one the parties think they signed. Dates the Clause DB has not verified are reported as unverified, never assumed.",
      seller: {
        importance: "High",
        preferred: "Every cited clause shows its date, and any agency deviation is named.",
        fallback: "Dates shown but deviation status not stated, or dates not yet verified in the Clause DB.",
        escalation: "A cited clause date differs from the verified current date. Clauses cited without a date, or missing from the Clause DB, go to manual review.",
        approver: "Contracts Manager",
        params: {},
        model: "Clause versions. Each FAR and DFARS clause in Attachment [__] is incorporated in the version identified by its date, as modified by any class deviation identified in the same Attachment. If the applicable version of a clause changes during performance, the Parties shall agree in writing whether the change applies and any equitable adjustment before it takes effect."
      },
      buyer: {
        importance: "High",
        preferred: "Every cited clause shows its date, and any agency deviation is named.",
        fallback: "Dates shown but deviation status not stated, or dates not yet verified in the Clause DB.",
        escalation: "A cited clause date differs from the verified current date. Clauses cited without a date, or missing from the Clause DB, go to manual review.",
        approver: "Subcontracts Manager",
        params: {},
        model: "Clause versions. Each FAR and DFARS clause in Attachment [__] is incorporated in the version identified by its date, as modified by any class deviation identified in the same Attachment."
      }
    },
    {
      id: "G03", category: "Structure", title: "Order of precedence", importance: "High",
      why: "If subcontract terms override flowed-down clauses, required protections can be diluted; if flowed-down clauses are silent on a commercial point, the subcontract terms must govern it. Precedence has to be explicit and consistent with FAR 52.215-8-style ordering.",
      seller: {
        importance: "High",
        preferred: "Flowed-down mandatory clauses prevail over other subcontract terms; negotiated commercial terms prevail over general boilerplate.",
        fallback: "Single clear precedence order that places negotiated terms above prime-contract general terms.",
        escalation: "Precedence clause makes the prime contract or the prime's purchase-order terms override negotiated terms, or precedence is contradictory.",
        approver: "Head of Legal",
        params: {},
        model: "Order of precedence. In the event of conflict: (1) mandatory flowed-down FAR/DFARS clauses to the extent required by their terms; (2) the negotiated terms of this Subcontract and its schedules; (3) the Statement of Work; (4) Prime Contractor's general terms. Nothing in a lower-ranked document reduces a right granted by a higher-ranked one."
      },
      buyer: {
        importance: "High",
        preferred: "Mandatory flowed-down clauses rank first; no subcontract term can reduce a required protection.",
        fallback: "Single clear order that ranks required clauses above commercial terms.",
        escalation: "Precedence clause lets subcontractor terms override a required flow-down, or precedence is contradictory.",
        approver: "Head of Legal",
        params: {},
        model: "Order of precedence. Mandatory flowed-down FAR/DFARS clauses prevail over any conflicting term of this Subcontract to the extent required by their terms; otherwise this Subcontract and its schedules prevail over the Statement of Work."
      }
    },
    {
      id: "G04", category: "IP & data", title: "Data rights & intellectual property", importance: "Critical",
      why: "Technical-data and software rights follow who paid for development and how data is marked. Broad assignment, 'unlimited rights' for everything, or no assertion and marking process can strip a subcontractor's privately funded IP. The prime's flow-down must pass on the Government's rights without taking more than the prime needs.",
      seller: {
        importance: "Critical",
        preferred: "Prime receives only the rights the Government requires under the flowed-down data-rights clauses; subcontractor keeps ownership and background IP; assertion and marking process stated.",
        fallback: "Broader license to the prime for performance of this contract only, with background IP and privately funded data expressly excluded.",
        escalation: "Assignment of IP or 'work made for hire' without a background-IP or private-expense carve-out; 'unlimited rights' for all deliverables; or no assertion/marking process where DoD technical data is involved.",
        approver: "Head of Legal",
        params: {},
        model: "Data rights. Subcontractor retains all right, title and interest in Background IP and in data and software developed exclusively at private expense. Prime Contractor receives only the license rights that the Government is entitled to under the data-rights clauses listed in Attachment [__], and may use them solely for performance of the prime contract. Subcontractor may assert restrictions on a Subcontractor Assertions Table delivered before signature and shall mark restricted data as the flowed-down clauses require. Prime Contractor shall not challenge or release restricted data except as those clauses require, and shall give Subcontractor notice of any validation request."
      },
      buyer: {
        importance: "High",
        preferred: "Subcontract passes on the Government's rights as required, requires assertions and marking, and keeps the prime able to deliver to the Government.",
        fallback: "License to the prime sufficient for performance and for the Government's required rights.",
        escalation: "Subcontract grants the prime less than the Government is entitled to, or has no marking and assertion process.",
        approver: "Head of Legal",
        params: {},
        model: "Data rights. Subcontractor grants Prime Contractor, for delivery to the Government, at least the license rights the Government is entitled to under the data-rights clauses in Attachment [__]. Subcontractor shall deliver an assertions table before signature and shall mark all data and software delivered under restriction as those clauses require."
      }
    },
    {
      id: "G05", category: "Cyber", title: "Cybersecurity, CUI & CMMC", importance: "Critical",
      why: "DoD subcontracts that touch covered defense information bring safeguarding, rapid incident reporting and certification duties. A missing safeguarding clause is a compliance gap for the prime; an uncapped cyber indemnity or an impossible reporting clock is a financial gap for the subcontractor.",
      seller: {
        importance: "Critical",
        preferred: "Cyber clauses cited, incident-reporting duty stated with a workable clock, CMMC or NIST SP 800-171 level identified, and cyber liability capped.",
        fallback: "Cyber clauses cited with level identified, cap higher than the general cap but stated.",
        escalation: "Defense data is involved but no safeguarding clause is cited; level not identified; or uncapped cyber indemnity.",
        approver: "CISO",
        params: { reportHours: 72 },
        model: "Cybersecurity. Where Subcontractor handles covered defense information, DFARS 252.204-7012 and the level requirements identified in Attachment [__] apply. Subcontractor shall report a cyber incident to Prime Contractor within the time required by the flowed-down clause. Subcontractor's aggregate liability for security incidents is limited to [__] times the fees paid under this Subcontract."
      },
      buyer: {
        importance: "Critical",
        preferred: "Safeguarding, assessment and certification clauses flowed down; incident-reporting duty to the prime no later than the prime's own deadline; level identified.",
        fallback: "Clauses flowed down; level to be confirmed before access to protected data is granted.",
        escalation: "Defense data is involved but safeguarding clause absent, or reporting duty missing or later than the prime's own deadline.",
        approver: "CISO",
        params: { reportHours: 72 },
        model: "Cybersecurity. DFARS 252.204-7012, 252.204-7020 and 252.204-7021 (as applicable) flow down to Subcontractor. Subcontractor shall report any cyber incident affecting covered defense information to Prime Contractor in time for Prime Contractor to meet its own reporting deadline, and in any event within [__] hours of discovery."
      }
    },
    {
      id: "G06", category: "Payment", title: "Payment terms & pay-when-paid", importance: "High",
      why: "Payment contingent on the prime's own receipt of government payment shifts government credit and timing risk to the subcontractor, and its enforceability varies by state. Accelerated payment duties for small-business subcontractors also interact with such terms.",
      seller: {
        importance: "High",
        preferred: "Payment within 30 days of a proper invoice, not conditioned on the prime's receipt of government payment.",
        fallback: "Payment within 45 days; any contingency limited to disputed government rejections and capped at 60 days.",
        escalation: "Pay-when-paid or pay-if-paid, or payment terms longer than 60 days.",
        approver: "CFO",
        params: { preferredDays: 30, fallbackDays: 45, maxDays: 60 },
        model: "Payment. Prime Contractor shall pay each undisputed invoice within thirty (30) days after receipt. Payment is not conditioned on Prime Contractor's receipt of payment from the Government. Where a flowed-down clause requires accelerated payment to small-business subcontractors, Prime Contractor shall comply with it for this Subcontract."
      },
      buyer: {
        importance: "High",
        preferred: "Payment tied to the prime's receipt of government payment where state law permits, with a long-stop date.",
        fallback: "Payment within 45 days of proper invoice.",
        escalation: "Payment terms shorter than the prime's own cycle with no contingency, or accelerated-payment flow-down missing where the subcontractor is a small business.",
        approver: "CFO",
        params: { preferredDays: 45, fallbackDays: 30, maxDays: 30 },
        model: "Payment. Prime Contractor shall pay each undisputed invoice within forty-five (45) days after receipt, or, if later, within [__] days after Prime Contractor receives corresponding payment from the Government, but in no event later than [__] days after receipt of the invoice."
      }
    },
    {
      id: "G07", category: "Termination", title: "Termination for convenience flow-through", importance: "High",
      why: "A prime that can be terminated for convenience by the Government needs a matching right against its subcontractors, and a subcontractor needs a settlement that covers incurred cost and reasonable profit on work done. Without a matching clause the prime can be left paying a subcontractor for work the Government will not pay for.",
      seller: {
        importance: "High",
        preferred: "Termination for convenience settles incurred cost, reasonable profit on work performed, and settlement expenses, and is payable within a fixed period of notice.",
        fallback: "Incurred cost and settlement expenses only, no profit, but payment time limited.",
        escalation: "Termination for convenience with no recovery language, 'no liability' wording, or a right to terminate at any time with no payment for work done.",
        approver: "Head of Legal",
        params: {},
        model: "Termination for convenience. If Prime Contractor terminates for convenience, Subcontractor shall be paid for conforming work performed through the termination date, its reasonable costs incurred in connection with the termination, and reasonable profit on work performed, in each case without anticipatory profit on unperformed work, within [__] days after submitting its settlement proposal."
      },
      buyer: {
        importance: "High",
        preferred: "Termination for convenience clause matching the Government's right, settlement limited to incurred cost and reasonable profit on work done, no anticipatory profit.",
        fallback: "Matching right with settlement terms to be agreed in a schedule.",
        escalation: "No termination-for-convenience right in a subcontract under a prime contract that has one.",
        approver: "Head of Legal",
        params: {},
        model: "Termination for convenience. Prime Contractor may terminate this Subcontract in whole or in part for convenience, including where the Government terminates the prime contract. Subcontractor shall be paid for work performed through termination and its reasonable termination costs, and no anticipatory profit on unperformed work."
      }
    },
    {
      id: "G08", category: "Disputes", title: "Disputes & claim pass-through", importance: "Medium",
      why: "A subcontractor has no direct standing against the Government, so government-caused delay and change claims must pass through the prime. A subcontract that bars pass-through or waives such claims leaves the subcontractor absorbing government risk.",
      seller: {
        importance: "Medium",
        preferred: "Prime sponsors subcontractor claims against the Government in good faith and keeps the subcontractor informed.",
        fallback: "Prime passes through claims on request, with subcontractor bearing reasonable pursuit costs.",
        escalation: "Waiver of claims for government-caused delay or change, or a bar on pass-through claims.",
        approver: "Head of Legal",
        params: {},
        model: "Disputes. Where a dispute under this Subcontract arises from an act or omission of the Government, Prime Contractor shall, at Subcontractor's request, present Subcontractor's claim to the Government (sponsorship), keep Subcontractor informed, and share any recovery attributable to Subcontractor's claim."
      },
      buyer: {
        importance: "Medium",
        preferred: "Subcontractor claims against the Government pass through the prime and bind the subcontractor to the outcome; prime sponsors only meritorious claims.",
        fallback: "Pass-through at the prime's discretion with subcontractor bearing pursuit costs.",
        escalation: "No pass-through mechanism and no binding-outcome clause.",
        approver: "Head of Legal",
        params: {},
        model: "Disputes. Subcontractor claims arising from Government acts or omissions shall be presented through Prime Contractor, and Subcontractor shall be bound by the final outcome of the Government's decision, at Subcontractor's pursuit cost."
      }
    },
    {
      id: "G09", category: "Risk", title: "Liability, indemnity & damages", importance: "High",
      why: "Primes often flow down the full exposure they face to the Government. A subcontractor whose liability is uncapped, or includes consequential loss, can lose more than the whole subcontract is worth.",
      seller: {
        importance: "High",
        preferred: "Aggregate liability capped at the amounts paid or payable under the subcontract; consequential loss excluded; liquidated damages capped.",
        fallback: "Cap at twice the amounts paid or payable; consequential loss excluded.",
        escalation: "Unlimited or uncapped liability, loss-of-profit or consequential loss recoverable against us, or full flow-down of the prime's liquidated damages without a cap.",
        approver: "CFO",
        params: { fallbackMultiple: 2 },
        model: "Limitation of liability. Each party's aggregate liability under this Subcontract is limited to the amounts paid or payable under it. Neither party is liable for indirect, consequential or loss-of-profit damages. Liquidated damages for delay, if any, are Prime Contractor's sole remedy for delay and are capped at [__]% of the Subcontract price."
      },
      buyer: {
        importance: "High",
        preferred: "Subcontractor liability not capped below the prime's own exposure for subcontractor-caused failures; indemnity for subcontractor's breach of flowed-down clauses.",
        fallback: "Cap at the greater of the subcontract price and a stated minimum, with carve-outs for compliance and IP.",
        escalation: "Subcontractor liability capped below the prime's exposure with no carve-outs.",
        approver: "CFO",
        params: { fallbackMultiple: 2 },
        model: "Liability. Subcontractor shall indemnify Prime Contractor for losses arising from Subcontractor's breach of the flowed-down clauses or its infringement of third-party IP. Other liability is limited to [__] times the Subcontract price."
      }
    },
    {
      id: "G10", category: "Integrity", title: "Document integrity — referenced attachments", importance: "Medium",
      why: "Subcontracts commonly depend on an SOW or attachments that define scope, price and the flow-down list. A referenced attachment that was not supplied means the review cannot assess the matters it controls.",
      seller: {
        importance: "Medium",
        preferred: "Every referenced attachment is supplied with the subcontract.",
        fallback: "Non-essential attachments to follow, none that control scope, price or flow-down.",
        escalation: "A referenced SOW or attachment that controls scope, price or flow-down is not supplied.",
        approver: "Contracts Manager",
        params: {},
        model: "Documents. The following attachments form part of this Subcontract and are attached on signature: [list]. A reference to a document that is not attached is of no effect until the document is provided and the Parties confirm it in writing."
      },
      buyer: {
        importance: "Medium",
        preferred: "Every referenced attachment is supplied with the subcontract.",
        fallback: "Non-essential attachments to follow, none that control scope, price or flow-down.",
        escalation: "A referenced SOW or attachment that controls scope, price or flow-down is not supplied.",
        approver: "Subcontracts Manager",
        params: {},
        model: "Documents. All attachments referred to in this Subcontract are attached on signature."
      }
    }
  ]
};
