/* =====================================================================
   TRADE-1.0 — Cross-Border Sale of Goods Playbook (Export / Import)
   Demonstration playbook for a Korean trading company. Fictional policy:
   NOT a legal standard and NOT legal advice. Thresholds live in `params`
   and are read by the rule engine, so editing them changes the review.
   ===================================================================== */
window.DEFAULT_PLAYBOOK = {
  id: "TRADE-1.0",
  name: "Cross-Border Sale of Goods Playbook",
  company: "Hanbit Global Trading Co., Ltd. (fictional)",
  effective: "2026-11-10",
  disclaimer:
    "Demonstration company policy. A playbook deviation is a business-policy finding, not a conclusion on legal validity or enforceability. Jurisdiction-specific questions require verification by qualified counsel.",
  positions: {
    seller: { label: "Export — we are the Seller", short: "Export (Seller)" },
    buyer: { label: "Import — we are the Buyer", short: "Import (Buyer)" }
  },
  approvers: {
    seller: ["Head of Legal", "CFO", "Head of Export Sales", "Compliance Officer", "Tax Lead"],
    buyer: ["Head of Legal", "CFO", "Procurement Director", "Customs & Trade Lead", "Compliance Officer", "Tax Lead"]
  },
  rules: [
    {
      id: "T01", category: "Delivery", title: "Incoterms® rule & named place", importance: "High",
      why: "The Incoterms rule allocates delivery point, transport cost, insurance, export/import clearance and the moment risk passes. A wrong rule silently shifts transit risk and foreign tax/customs exposure.",
      seller: {
        preferred: "FCA or FOB (Korean port/airport/CY), Incoterms® 2020, with a specific named place.",
        fallback: "CPT, CIP, CFR or CIF — Seller arranges carriage but risk still passes at origin.",
        escalation: "DAP, DPU or DDP (transit and destination risk; DDP adds foreign import VAT/duties) or EXW (we lose control of export clearance and VAT zero-rating evidence).",
        approver: "Head of Export Sales",
        params: { preferred: ["FCA", "FOB"], fallback: ["CPT", "CIP", "CFR", "CIF", "FAS"], escalate: ["EXW", "DAP", "DPU", "DDP"], requiredVersion: "2020" },
        model: "Delivery. The Goods shall be delivered FCA [named place of delivery, e.g. Busan New Port CY, Republic of Korea], Incoterms® 2020. In the event of any inconsistency between the Incoterms® rule and any other provision of this Agreement concerning delivery, transfer of risk or allocation of costs, the Incoterms® rule shall prevail unless this Agreement expressly provides otherwise by reference to this Clause."
      },
      buyer: {
        preferred: "DAP, DPU, CIP or CIF, Incoterms® 2020 — Seller carries transit risk or insures it.",
        fallback: "FCA, FOB, CPT, CFR or DDP — acceptable where our freight forwarder controls the shipment or customs set-up allows it.",
        escalation: "EXW (we would have to clear export in the Seller's country) or any rule without a named place.",
        approver: "Procurement Director",
        params: { preferred: ["DAP", "DPU", "CIP", "CIF"], fallback: ["FCA", "FOB", "CPT", "CFR", "DDP", "FAS"], escalate: ["EXW"], requiredVersion: "2020" },
        model: "Delivery. Seller shall deliver the Goods DAP [Buyer's facility, full address, Republic of Korea], Incoterms® 2020. Seller shall be responsible for export clearance, all export licences and all costs and risks of loss of or damage to the Goods until they are placed at Buyer's disposal at the named place, ready for unloading."
      }
    },
    {
      id: "T02", category: "Delivery", title: "Transfer of title & risk", importance: "High",
      why: "Title and risk must track the Incoterms rule and the payment structure. Retention of title protects an unpaid exporter; for an importer, paying before title passes is unsecured credit to the Seller.",
      seller: {
        preferred: "Risk passes per the Incoterms rule; title retained until payment in full.",
        fallback: "Title passes on shipment where payment is secured by a confirmed L/C or 100% advance.",
        escalation: "Risk or title passing only on Buyer's acceptance, arrival or installation, or no retention of title with deferred payment.",
        approver: "CFO",
        params: {},
        model: "Risk and Title. Risk of loss of or damage to the Goods shall pass to Buyer in accordance with the agreed Incoterms® 2020 rule. Title to the Goods shall remain with Seller until Seller has received payment in full of the Contract Price and all other sums due under this Agreement. Until title passes, Buyer shall hold the Goods as Seller's bailee, store them separately, keep them insured and identifiable as Seller's property."
      },
      buyer: {
        preferred: "Title passes on delivery (or earlier payment), free of liens; risk passes per the Incoterms rule.",
        fallback: "Seller's retention of title until full payment, provided advance payments are covered by a bank guarantee.",
        escalation: "Title retained after full payment, or risk passing before the Incoterms delivery point.",
        approver: "Head of Legal",
        params: {},
        model: "Title and Risk. Title to the Goods shall pass to Buyer upon the earlier of (a) delivery in accordance with the agreed Incoterms® 2020 rule, and (b) payment of the corresponding portion of the Contract Price, in each case free from all liens, charges and encumbrances. Risk shall pass in accordance with the agreed Incoterms® 2020 rule."
      }
    },
    {
      id: "T03", category: "Commercial", title: "Price, currency & taxes", importance: "Medium",
      why: "Currency drives FX exposure; tax allocation decides whether withholding tax or foreign VAT erodes margin. Price-adjustment rights move cost risk between the parties.",
      seller: {
        preferred: "Price in USD, EUR or KRW; foreign taxes for Buyer's account; tax gross-up on any withholding.",
        fallback: "Fixed price without escalation, if quote validity is short and raw-material exposure is hedged.",
        escalation: "Other currencies, or withholding tax without gross-up.",
        approver: "Tax Lead",
        params: { currencies: ["USD", "EUR", "KRW"] },
        model: "Price and Taxes. All prices are stated and payable in [USD]. Prices are exclusive of value added tax, customs duties and any other taxes, levies or charges imposed outside the Republic of Korea, all of which shall be borne by Buyer. If Buyer is required by law to withhold or deduct any tax from any payment, Buyer shall pay such additional amount as is necessary to ensure that Seller receives a net amount equal to the amount it would have received had no withholding or deduction been required, and shall deliver to Seller official tax receipts within thirty (30) days."
      },
      buyer: {
        preferred: "Fixed and firm price in USD, EUR or KRW; withholding per law/treaty without gross-up.",
        fallback: "Index-linked adjustment with a cap and documented evidence.",
        escalation: "Unilateral Seller price adjustment, other currencies, or a gross-up obligation on Buyer.",
        approver: "Procurement Director",
        params: { currencies: ["USD", "EUR", "KRW"] },
        model: "Price and Taxes. The Contract Price is fixed and firm in [USD] and shall not be subject to adjustment for any reason, including currency fluctuation or changes in the cost of raw materials, labour or freight. Buyer may withhold any tax required to be withheld under applicable law, including at any reduced rate available under an applicable tax treaty, and shall provide Seller with the corresponding withholding tax certificate. No gross-up shall apply."
      }
    },
    {
      id: "T04", category: "Payment", title: "Payment terms & payment security", importance: "Critical",
      why: "For an exporter, payment security is the single largest credit risk in a cross-border sale. For an importer, unsecured advance payments are credit extended to a foreign counterparty that is hard to recover.",
      seller: {
        preferred: "At least 30% T/T advance with balance before shipment, or an irrevocable L/C at sight (UCP 600), confirmed by a first-class bank.",
        fallback: "L/C usance up to 90 days, or open account up to 60 days covered by export credit insurance (e.g. K-SURE short-term cover) within an approved credit limit.",
        escalation: "Open account beyond 60 days, D/A terms, or no payment security.",
        approver: "CFO",
        params: { minAdvancePct: 30, maxLcUsanceDays: 90, maxOpenAccountDays: 60 },
        model: "Payment. Buyer shall pay (a) thirty percent (30%) of the Contract Price by telegraphic transfer within seven (7) days after the date of this Agreement; and (b) the balance by an irrevocable documentary letter of credit payable at sight, issued or confirmed by a first-class bank acceptable to Seller and subject to the Uniform Customs and Practice for Documentary Credits (UCP 600), which shall be received by Seller no later than thirty (30) days before the scheduled shipment date. Any amount not paid when due shall bear interest at [eight percent (8%)] per annum from the due date until the date of actual payment, and Seller may suspend performance until all overdue amounts are paid."
      },
      buyer: {
        preferred: "Advance payment no more than 20%, secured by an advance-payment bank guarantee; balance after delivery and Acceptance on 30+ day terms.",
        fallback: "Advance up to 20% without guarantee for an approved, established supplier.",
        escalation: "Advance payment above 20% of the Contract Price.",
        approver: "CFO",
        params: { maxAdvancePct: 20, minPaymentDays: 30 },
        model: "Payment. Buyer shall pay (a) twenty percent (20%) of the Contract Price as an advance payment within thirty (30) days after receipt of Seller's invoice and an advance payment bank guarantee for the same amount, issued by a first-class bank acceptable to Buyer and valid until delivery; (b) seventy percent (70%) within thirty (30) days after delivery and receipt of the complete shipping documents; and (c) ten percent (10%) within thirty (30) days after Acceptance."
      }
    },
    {
      id: "T05", category: "Delivery", title: "Delivery schedule & delay liquidated damages", importance: "High",
      why: "Delay damages are a pre-agreed price of lateness. Rate, cap and exclusivity decide whether delay is a bounded commercial cost or an open-ended claim.",
      seller: {
        preferred: "No more than 0.5% per full week, capped at 5% of the price of the delayed Goods, as Buyer's sole and exclusive remedy for delay.",
        fallback: "Cap up to 10%.",
        escalation: "Weekly rate above 0.5% (daily rates are converted ×7), cap above 10% or no cap.",
        approver: "Head of Export Sales",
        params: { maxWeeklyRate: 0.5, maxCap: 5, fallbackCap: 10 },
        model: "Delay. If delivery is delayed for reasons solely attributable to Seller, Seller shall pay to Buyer, as liquidated damages and not as a penalty, zero point five percent (0.5%) of the price of the delayed Goods for each full week of delay, up to a maximum of five percent (5%) of the price of the delayed Goods. Payment of such liquidated damages shall be Buyer's sole and exclusive remedy for delay in delivery."
      },
      buyer: {
        preferred: "At least 0.5% of the Contract Price per week, capped at no less than 10%, with a termination right once the cap is reached.",
        fallback: "Cap between 5% and 10% with a termination right.",
        escalation: "No delay LDs, rate below 0.5%/week, cap below 5%, or LDs as sole remedy without a termination right.",
        approver: "Procurement Director",
        params: { minWeeklyRate: 0.5, minCap: 10, fallbackMinCap: 5 },
        model: "Delay. If Seller fails to deliver the Goods by the Delivery Date, Seller shall pay to Buyer liquidated damages of zero point five percent (0.5%) of the Contract Price for each commenced week of delay, up to a maximum of ten percent (10%) of the Contract Price. Payment of liquidated damages shall not relieve Seller of its obligation to deliver. If the maximum amount is reached, Buyer may terminate this Agreement by written notice and recover all amounts paid for undelivered Goods."
      }
    },
    {
      id: "T06", category: "Quality", title: "Inspection, notice of defects & acceptance", importance: "Medium",
      why: "The inspection window and acceptance mechanism decide how long the deal stays open and when the warranty clock and final payment start.",
      seller: {
        preferred: "Inspection and written notice of non-conformity within 14 days after arrival; deemed acceptance on silence.",
        fallback: "Up to 30 days, with deemed acceptance.",
        escalation: "More than 30 days, open-ended rejection rights or no deemed acceptance.",
        approver: "Head of Export Sales",
        params: { maxDays: 14, fallbackDays: 30 },
        model: "Inspection. Buyer shall inspect the Goods within fourteen (14) days after their arrival at the named place of destination and shall notify Seller in writing of any non-conformity, with reasonable particulars, within that period. If no such notice is received within that period, the Goods shall be deemed accepted. Buyer shall not reject the Goods for minor non-conformities that do not materially affect their use."
      },
      buyer: {
        preferred: "At least 30 days to inspect/test; Acceptance only by written certificate; latent defects preserved.",
        fallback: "14–29 days, provided latent-defect and warranty rights survive.",
        escalation: "Less than 14 days, or deemed acceptance on a short clock.",
        approver: "Procurement Director",
        params: { minDays: 30, fallbackDays: 14 },
        model: "Inspection and Acceptance. Buyer shall have thirty (30) days after arrival of the Goods at the destination [or after completion of the site acceptance tests] to inspect and test the Goods. Acceptance shall occur only upon issue of Buyer's written acceptance certificate. Acceptance shall not prejudice Buyer's rights in respect of latent defects or Seller's warranty obligations."
      }
    },
    {
      id: "T07", category: "Quality", title: "Warranty — duration, trigger & remedies", importance: "High",
      why: "Duration and commencement trigger together decide real warranty exposure (a 24-month warranty from acceptance can run years after shipment). Exclusive remedies and disclaimers define the ceiling.",
      seller: {
        preferred: "12 months from bill of lading / shipment / delivery; repair, replace or refund as exclusive remedy; implied warranties disclaimed.",
        fallback: "Up to 18 months, or 12 months from acceptance/installation subject to a long-stop from shipment.",
        escalation: "More than 18 months, open remedies at law, or no disclaimer of implied warranties.",
        approver: "Head of Legal",
        params: { maxMonths: 12, fallbackMonths: 18, preferredTriggers: ["shipment", "bill of lading", "delivery"] },
        model: "Warranty. Seller warrants that the Goods will conform to the Specifications and be free from defects in materials and workmanship for twelve (12) months from the date of the bill of lading (the \"Warranty Period\"). Seller's sole obligation, and Buyer's exclusive remedy, for breach of this warranty shall be, at Seller's option, the repair or replacement of the defective Goods or a refund of the price paid for them. EXCEPT AS EXPRESSLY SET OUT IN THIS CLAUSE, SELLER GIVES NO OTHER WARRANTY, EXPRESS OR IMPLIED, INCLUDING ANY IMPLIED WARRANTY OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE."
      },
      buyer: {
        preferred: "24 months from Acceptance; no other provision may shorten it.",
        fallback: "18–23 months from Acceptance.",
        escalation: "Under 18 months, any trigger other than Acceptance, or a schedule/annex that shortens the period.",
        approver: "Head of Legal",
        params: { minMonths: 24, fallbackMinMonths: 18, requiredTrigger: "acceptance" },
        model: "Warranty. Seller warrants that the Goods shall be new, of satisfactory quality, fit for the purpose stated in the Specifications and free from defects in design, materials and workmanship for twenty-four (24) months from the date of Acceptance (the \"Warranty Period\"). Seller shall, at its own cost, promptly repair or replace any defective Goods, including all associated transport, customs and installation costs. No other provision of this Agreement or of any schedule shall shorten the Warranty Period."
      }
    },
    {
      id: "T08", category: "Risk allocation", title: "Limitation of liability", importance: "Critical",
      why: "The liability cap and the exclusion of indirect loss set the maximum downside of the contract. Indemnities, schedules and 'not subject to' carve-outs frequently override an otherwise compliant cap.",
      seller: {
        preferred: "Seller's aggregate liability capped at 100% of the Contract Price; mutual exclusion of indirect/consequential loss and lost profit; cap prevails over indemnities and schedules.",
        fallback: "Cap up to 150% of the Contract Price.",
        escalation: "Cap above 150%, uncapped Seller liability, carve-outs outside the cap, or no exclusion of indirect loss.",
        approver: "Head of Legal",
        params: { maxOwnCapPct: 100, fallbackOwnCapPct: 150 },
        model: "Limitation of Liability. Except for liability which cannot be limited or excluded under applicable law: (a) neither party shall be liable to the other for any indirect, incidental, special or consequential loss or damage, or for any loss of profit, revenue, business, contracts or goodwill; and (b) Seller's total aggregate liability arising out of or in connection with this Agreement, whether in contract, tort (including negligence), under any indemnity or otherwise, shall not exceed one hundred percent (100%) of the Contract Price. This Clause shall prevail over any other provision of this Agreement, including any schedule or annex."
      },
      buyer: {
        preferred: "Seller cap of at least 100% of the Contract Price (higher finite caps are fine); Buyer cap of 100%; standard carve-outs (fraud, wilful misconduct, IP, confidentiality, personal injury).",
        fallback: "Buyer cap up to 150%.",
        escalation: "Seller cap below 100% or tied to amounts paid; Buyer cap above 150%, uncapped Buyer liability or Buyer claims outside the cap (check indemnities and schedules).",
        approver: "Head of Legal",
        params: { minCounterCapPct: 100, maxOwnCapPct: 100, fallbackOwnCapPct: 150 },
        model: "Limitation of Liability. Except in the case of fraud, wilful misconduct, gross negligence, death or personal injury, breach of confidentiality or infringement of intellectual property rights, each party's total aggregate liability arising out of or in connection with this Agreement shall not exceed one hundred percent (100%) of the Contract Price. Neither party shall be liable for indirect or consequential loss. This Clause applies to all claims, including claims under any indemnity or schedule, and prevails over any inconsistent provision."
      }
    },
    {
      id: "T09", category: "Risk allocation", title: "Indemnities & IP infringement", importance: "High",
      why: "IP and product indemnities are classic cap-busters. An exporter should not indemnify infringement caused by the Buyer's own specifications; an importer needs the foreign Seller to stand behind the Goods it resells.",
      seller: {
        preferred: "Seller IP indemnity limited to Goods as delivered, excluding Buyer designs, modifications and combinations; subject to the liability cap; conduct-of-claims conditions.",
        fallback: "Uncapped IP indemnity limited to registered rights in the agreed territory.",
        escalation: "Indemnity for 'any and all claims' including Buyer-specified Goods, or indemnity outside the cap.",
        approver: "Head of Legal",
        params: {},
        model: "IP Indemnity. Seller shall defend Buyer against any third-party claim that the Goods, as delivered by Seller, infringe a patent, trademark or copyright registered in [the Territory], and shall pay damages finally awarded, provided that Buyer promptly notifies Seller in writing, gives Seller sole control of the defence and settlement, and provides reasonable cooperation. Seller shall have no liability for claims arising from (a) designs, specifications or instructions provided by Buyer, (b) modification of the Goods by anyone other than Seller, or (c) combination of the Goods with products not supplied by Seller. This Clause is subject to Clause [Limitation of Liability]."
      },
      buyer: {
        preferred: "Seller indemnifies for IP infringement and product-defect claims; Buyer indemnity limited to its own breach/negligence and subject to the cap.",
        fallback: "Seller IP indemnity subject to the general cap.",
        escalation: "No Seller IP indemnity, or a broad/unlimited Buyer indemnity in favour of Seller.",
        approver: "Head of Legal",
        params: {},
        model: "Indemnity. Seller shall indemnify, defend and hold harmless Buyer and its customers from and against all claims, losses, damages, costs and expenses (including reasonable legal fees) arising from (a) any actual or alleged infringement of third-party intellectual property rights by the Goods, and (b) death, personal injury or property damage caused by defects in the Goods. Buyer's indemnity obligations, if any, shall be limited to losses caused by Buyer's breach or negligence and shall be subject to Clause [Limitation of Liability]."
      }
    },
    {
      id: "T10", category: "Risk allocation", title: "Force majeure", importance: "Medium",
      why: "Cross-border supply chains are exposed to pandemics, sanctions, port closures and sub-supplier failure. The list of events, notice duty and exit right after prolonged FM determine who carries that disruption.",
      seller: {
        preferred: "Broad list incl. epidemic, sanctions/government action, export restrictions, strikes, material shortages and sub-supplier failure; termination right after prolonged FM.",
        fallback: "Standard list without sub-supplier failure.",
        escalation: "No FM clause, or a narrow list (acts of God only).",
        approver: "Head of Legal",
        params: { required: ["epidemic", "sanctions", "supply"] },
        model: "Force Majeure. Neither party shall be liable for any failure or delay in performing its obligations (other than payment obligations) caused by events beyond its reasonable control, including acts of God, epidemic or pandemic, war, terrorism, civil unrest, embargo, sanctions, export or import restrictions, acts of government, fire, flood, strikes or labour disputes, shortages of materials or energy, and failures of carriers or sub-suppliers. The affected party shall notify the other party within fourteen (14) days of the occurrence. If the event continues for more than one hundred and twenty (120) days, either party may terminate this Agreement by written notice without liability, save that Buyer shall pay for Goods delivered and costs incurred up to termination."
      },
      buyer: {
        preferred: "Defined events, prompt notice with evidence, mitigation duty, Buyer termination right if FM exceeds 90 days with refund of amounts paid for undelivered Goods.",
        fallback: "Termination right after 90–180 days.",
        escalation: "No FM clause, no termination right, or Seller's own supply-chain failures counted as FM.",
        approver: "Procurement Director",
        params: { maxFmDays: 90, fallbackFmDays: 180 },
        model: "Force Majeure. A party affected by an event beyond its reasonable control shall notify the other party within seven (7) days with reasonable evidence and use all reasonable efforts to mitigate its effects. Shortages of materials or labour and failures of Seller's sub-suppliers shall not constitute force majeure unless caused by an event that would itself qualify. If a force majeure event continues for more than ninety (90) days, Buyer may terminate this Agreement by written notice and Seller shall refund all amounts paid for undelivered Goods within thirty (30) days."
      }
    },
    {
      id: "T11", category: "Compliance", title: "Export control & sanctions", importance: "Critical",
      why: "Export control and sanctions breaches carry criminal and regulatory exposure independent of contract (e.g. Korea's Foreign Trade Act strategic-items regime, U.S. EAR re-export rules, UN/EU/US sanctions). The contract must allocate compliance duties and give a clean exit.",
      seller: {
        preferred: "Buyer compliance covenant (Korean, U.S., EU, UN regimes); no re-export to sanctioned destinations or prohibited end-uses; end-user/end-use statements on request; Seller right to suspend/terminate without liability.",
        fallback: "Compliance covenant and termination right without end-user statement mechanism.",
        escalation: "No export control/sanctions clause.",
        approver: "Compliance Officer",
        importance: "Critical",
        params: {},
        model: "Export Control and Sanctions. Buyer acknowledges that the Goods and any related software or technology may be subject to export control and sanctions laws and regulations, including the Foreign Trade Act of the Republic of Korea, the U.S. Export Administration Regulations, and sanctions administered by the United Nations, the European Union, the United States and the Republic of Korea. Buyer shall not, directly or indirectly, export, re-export, transfer or sell the Goods to any sanctioned country, person or entity, or for any prohibited end-use (including military or weapons of mass destruction-related uses), and shall provide end-user and end-use statements upon Seller's request. Seller may suspend performance or terminate this Agreement with immediate effect and without liability if performance would breach any such law or if Seller reasonably suspects a breach of this Clause by Buyer."
      },
      buyer: {
        preferred: "Seller warrants it is not a sanctioned person and Goods are not of sanctioned origin; Seller obtains export licences; Seller discloses export classification (ECCN / strategic item status); Buyer termination right.",
        fallback: "Sanctions warranty and licence obligation without classification disclosure.",
        escalation: "No sanctions/export-licence allocation.",
        approver: "Compliance Officer",
        importance: "High",
        params: {},
        model: "Export Control and Sanctions. Seller represents and warrants that neither Seller nor any of its owners, affiliates or sub-suppliers is a sanctioned person, and that the Goods do not originate, in whole or in part, from any sanctioned country or region. Seller shall obtain, at its own cost, all export licences and authorisations required for delivery and shall notify Buyer in writing of the export control classification of the Goods (including any ECCN and strategic-item status). Buyer may terminate this Agreement with immediate effect and without liability if Seller breaches this Clause."
      }
    },
    {
      id: "T12", category: "Compliance", title: "Customs, documents & rules of origin (FTA)", importance: "Medium",
      why: "Preferential tariff under an FTA depends on correct origin documents and cooperation in post-import origin verification. Errors trigger duty claw-back and penalties — usually for the importer.",
      seller: {
        preferred: "Standard shipping documents and a certificate of origin; preferential origin certification only where the Goods qualify; no liability for denial of preference absent wilful misstatement.",
        fallback: "Origin indemnity capped under the liability clause.",
        escalation: "Uncapped indemnity for duties/penalties if preferential origin is denied.",
        approver: "Head of Export Sales",
        params: {},
        model: "Documents and Origin. Seller shall provide the commercial invoice, packing list, transport document and a certificate of origin. Where Buyer requests a preferential certificate or statement of origin under an applicable free trade agreement, Seller shall provide it if the Goods qualify and shall reasonably cooperate with any origin verification, but Seller shall have no liability for the denial of preferential tariff treatment except where caused by Seller's wilful misstatement."
      },
      buyer: {
        preferred: "Full document set (commercial invoice, packing list, B/L or AWB, insurance certificate, certificate of origin incl. FTA preferential origin); Seller cooperation with Korea Customs Service origin verification; Seller indemnity for inaccurate origin/classification data.",
        fallback: "Document set and certificate of origin without verification cooperation.",
        escalation: "No certificate of origin obligation.",
        approver: "Customs & Trade Lead",
        params: {},
        model: "Documents and Origin. Seller shall deliver with each shipment the commercial invoice, packing list, bill of lading or air waybill, insurance certificate (where applicable) and a valid certificate of origin, including a preferential certificate or statement of origin under the applicable free trade agreement where the Goods qualify. Seller shall retain supporting origin records for at least five (5) years, cooperate with any origin verification by the Korea Customs Service or other competent authority, and indemnify Buyer for duties, penalties and costs arising from inaccurate origin or tariff classification information supplied by Seller."
      }
    },
    {
      id: "T13", category: "Law & disputes", title: "Governing law & CISG", importance: "High",
      why: "Governing law determines how every other clause is read. Korea is a CISG contracting state, so silence may import CISG rules on conformity, notice and remedies; the playbook requires an express decision.",
      seller: {
        preferred: "Laws of the Republic of Korea; CISG expressly excluded.",
        fallback: "Singapore law or English law (neutral, predictable commercial law); CISG expressly addressed.",
        escalation: "Counterparty's home law or any other law; CISG not addressed.",
        approver: "Head of Legal",
        params: { preferred: ["Korea"], fallback: ["Singapore", "England and Wales"] },
        model: "Governing Law. This Agreement and any non-contractual obligations arising out of or in connection with it shall be governed by and construed in accordance with the laws of the Republic of Korea, without regard to its conflict-of-laws rules. The United Nations Convention on Contracts for the International Sale of Goods (1980) shall not apply to this Agreement."
      },
      buyer: {
        preferred: "Laws of the Republic of Korea; CISG expressly excluded.",
        fallback: "Singapore law or English law; CISG expressly addressed.",
        escalation: "Counterparty's home law or any other law; CISG not addressed.",
        approver: "Head of Legal",
        params: { preferred: ["Korea"], fallback: ["Singapore", "England and Wales"] },
        model: "Governing Law. This Agreement and any non-contractual obligations arising out of or in connection with it shall be governed by and construed in accordance with the laws of the Republic of Korea, without regard to its conflict-of-laws rules. The United Nations Convention on Contracts for the International Sale of Goods (1980) shall not apply to this Agreement."
      }
    },
    {
      id: "T14", category: "Law & disputes", title: "Dispute resolution & enforcement", importance: "High",
      why: "Arbitral awards are enforceable in New York Convention states; foreign court judgments often are not. Forum choice decides whether a win can actually be collected.",
      seller: {
        preferred: "KCAB International arbitration seated in Seoul, English language.",
        fallback: "SIAC (Singapore), ICC or HKIAC arbitration at a neutral seat.",
        escalation: "Courts of the counterparty's country, other institutions, or no dispute clause.",
        approver: "Head of Legal",
        params: { preferred: ["KCAB"], fallback: ["SIAC", "ICC", "HKIAC"] },
        model: "Dispute Resolution. Any dispute, controversy or claim arising out of or in connection with this Agreement, including any question regarding its existence, validity or termination, shall be finally settled by arbitration administered by the Korean Commercial Arbitration Board (KCAB International) in accordance with the KCAB International Arbitration Rules in force at the time of the arbitration. The seat of arbitration shall be Seoul, Republic of Korea. The tribunal shall consist of [one (1) / three (3)] arbitrator(s) and the language of the arbitration shall be English. The award shall be final and binding on the parties."
      },
      buyer: {
        preferred: "KCAB International arbitration seated in Seoul, English language.",
        fallback: "SIAC (Singapore), ICC or HKIAC arbitration at a neutral seat.",
        escalation: "Courts of the counterparty's country, other institutions, or no dispute clause.",
        approver: "Head of Legal",
        params: { preferred: ["KCAB"], fallback: ["SIAC", "ICC", "HKIAC"] },
        model: "Dispute Resolution. Any dispute, controversy or claim arising out of or in connection with this Agreement, including any question regarding its existence, validity or termination, shall be finally settled by arbitration administered by the Korean Commercial Arbitration Board (KCAB International) in accordance with the KCAB International Arbitration Rules in force at the time of the arbitration. The seat of arbitration shall be Seoul, Republic of Korea. The tribunal shall consist of [one (1) / three (3)] arbitrator(s) and the language of the arbitration shall be English. The award shall be final and binding on the parties."
      }
    },
    {
      id: "T15", category: "Term & exit", title: "Termination & suspension", importance: "Medium",
      why: "Exit rights decide who can walk away and at what cost: a counterparty's termination for convenience strands work in progress; missing suspension rights force continued performance while unpaid.",
      seller: {
        preferred: "Mutual termination for uncured material breach (30-day cure) and insolvency; Seller suspension right on non-payment or late L/C; no Buyer termination for convenience.",
        fallback: "Buyer termination for convenience with payment for finished Goods, WIP, non-cancellable materials and reasonable profit.",
        escalation: "Buyer termination for convenience without compensation.",
        approver: "Head of Export Sales",
        params: {},
        model: "Termination and Suspension. Either party may terminate this Agreement by written notice if the other party (a) commits a material breach and fails to remedy it within thirty (30) days after written notice, or (b) becomes insolvent, enters into liquidation or makes an arrangement with its creditors. Seller may suspend delivery if Buyer fails to pay any amount when due or fails to open the letter of credit on time. Buyer shall have no right to terminate this Agreement for convenience; if such right is agreed, Buyer shall pay for all finished Goods, work in progress, non-cancellable materials and a reasonable profit margin."
      },
      buyer: {
        preferred: "Buyer termination for uncured breach (30-day cure), insolvency, and when delay LDs reach the cap; Buyer termination for convenience on fair terms; no Seller termination for convenience.",
        fallback: "No Buyer convenience right, provided delay and breach exits exist.",
        escalation: "Seller termination for convenience, or no Buyer exit for prolonged delay.",
        approver: "Procurement Director",
        params: {},
        model: "Termination. Buyer may terminate this Agreement by written notice (a) if Seller commits a material breach and fails to remedy it within thirty (30) days after written notice, (b) if delay liquidated damages reach the maximum amount, (c) upon Seller's insolvency, or (d) for convenience upon thirty (30) days' notice, in which case Buyer shall pay only for Goods delivered and documented non-cancellable costs incurred before termination. Seller shall have no right to terminate this Agreement for convenience."
      }
    },
    {
      id: "T16", category: "Document integrity", title: "Document set, precedence & incorporated terms", importance: "High",
      why: "Missing annexes cannot be reviewed; precedence clauses that let a schedule or purchase-order terms prevail can override every compliant main-body clause (battle of the forms).",
      seller: {
        preferred: "All referenced annexes supplied; main body prevails over annexes; Buyer's standard terms excluded; English text prevails.",
        fallback: "Annex prevails only for technical specifications.",
        escalation: "Missing annexes, Buyer's general terms incorporated, or annexes prevailing over commercial terms.",
        approver: "Head of Legal",
        params: {},
        model: "Entire Agreement and Precedence. This Agreement, together with its Schedules [list each Schedule], constitutes the entire agreement between the parties regarding its subject matter. In the event of any conflict, the following order of precedence shall apply: (1) the main body of this Agreement; (2) the Schedules; (3) any purchase order or order confirmation. Any terms and conditions printed on or referred to in any purchase order, order confirmation, invoice or other business form shall have no effect. This Agreement is executed in English, which shall prevail over any translation."
      },
      buyer: {
        preferred: "All referenced annexes supplied; main body prevails over annexes; Seller's standard terms excluded; English text prevails.",
        fallback: "Annex prevails only for technical specifications.",
        escalation: "Missing annexes, Seller's general terms incorporated, or annexes prevailing over commercial terms.",
        approver: "Head of Legal",
        params: {},
        model: "Entire Agreement and Precedence. This Agreement, together with its Schedules [list each Schedule], constitutes the entire agreement between the parties regarding its subject matter. In the event of any conflict, the following order of precedence shall apply: (1) the main body of this Agreement; (2) the Schedules; (3) any purchase order or order confirmation. Any terms and conditions printed on or referred to in any purchase order, order confirmation, invoice or other business form shall have no effect. This Agreement is executed in English, which shall prevail over any translation."
      }
    }
  ]
};
