# Contract Review Pilot — Trade Edition

Browser app that reviews English **export / import sale-of-goods contracts** against a company playbook and returns issue-by-issue findings, escalation routing and English redlines.

Open `index.html` (works from GitHub Pages or locally; no build step).

## How it works
1. Choose position: **Export (we are Seller)** or **Import (we are Buyer)**.
2. Upload `.docx` / `.pdf` / `.txt` or paste text (parsed locally in the browser).
3. The rule engine (`engine.js`) segments clauses and schedules, extracts deal data, and evaluates 16 rules from `playbook.js` (TRADE-1.0): Incoterms, title/risk, price/tax, payment security, delay LDs, inspection, warranty, liability cap, indemnities/IP, force majeure, export control & sanctions, customs/FTA origin, governing law & CISG, disputes, termination, document integrity.
4. Each rule is marked Compliant / Fallback / Deviation / Missing / Review, routed to the playbook approver, with a model English clause.
5. Optional **Claude deep review** sends the clause-labelled contract and playbook to the Anthropic API (user's own key, structured JSON output) and renders in the same format.

Integrity checks: missing annexes (Not assessable), annex-prevails precedence, battle-of-forms, position mismatch, and embedded instructions in the document (reported, never followed).

## Customising the playbook
Edit thresholds in the **Playbook** tab (JSON `params`) or replace `playbook.js`. Bump the `id` when policy changes.

> TRADE-1.0, its company and approver roles are fictional demonstration policy. A playbook deviation is a policy finding, not a legal-enforceability conclusion.
