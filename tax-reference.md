# Tax Reference — TIS Global Trading Model
Verified against Nigeria Tax Act 2025 (Act No. 7, Gazette 26 Jun 2025, commencement 1 Jan 2026)
and Nigeria Tax Administration Act 2025. Only provisions used by the model are included.
Every citation below was confirmed against the actual statute text.

---

## VAT — Chapter Six (s.143–157)

| Item | Treatment | Section |
|---|---|---|
| VAT rate | 7.5% on value of all taxable supplies | s.147 |
| Charge of VAT | VAT on all taxable supplies in Nigeria, subject to exemptions in Part IV Ch.8 | s.144 |
| Input VAT (definition) | VAT paid by a taxable person on supplies to it = "input VAT" | s.151(2) |
| Output VAT (definition) | VAT collected by taxable person = "output VAT" | s.153(2) |
| Input VAT recoverability | Input tax (incl. services & fixed assets) deductible from output tax only to the extent incurred for the purpose of making taxable supplies | s.155(4) |
| Apportionment (mixed use) | Where input tax relates to BOTH taxable and non-taxable supplies, only the proportion relating to taxable supplies is deductible | s.155(4) proviso (a) |
| Deduction time limit | Input tax deductible within 5 years of the tax period incurred | s.155(4) proviso (b) |
| Excess input VAT | Carry forward as credit, or refund on request | s.155(1)(b), 155(2) |

### CRITICAL CORRECTION to prior spec
- Prior spec cited "s.186(n) excludes oil & gas" to justify standard-rating domestic gasoil. This citation is WRONG.
  - s.186 = list of zero-rated supplies. s.186(n) = "exported goods excluding oil and gas" — concerns EXPORTS, not domestic gasoil.
- Correct reasoning for domestic gasoil (AGO/diesel) sold via DAP-to-tank-farm / STS / depot:
  - NOT exempt — s.185 exempts only "oil and gas exports" (185(a)) and "crude petroleum oil and feed gas" (185(b)); refined gasoil for domestic sale is not listed.
  - NOT zero-rated — s.186 zero-rates basic food, medical, exports-excluding-oil&gas, etc.; domestic gasoil is not listed.
  - Therefore domestic gasoil = standard-rated at 7.5% (s.147). Conclusion unchanged; citation corrected.
- Action: treat domestic gasoil as standard-rated, output VAT 7.5%, input VAT on freight & services recoverable per s.155(4). Cite s.147 + s.155(4) + absence from s.185/s.186, NOT s.186(n).

---

## Surcharge (Fossil Fuel) — Chapter Seven (s.158–161)

| Item | Treatment | Section |
|---|---|---|
| Rate | 5% on chargeable fossil fuel products provided/produced in Nigeria | s.158 |
| Chargeable transaction | The supply, sale or payment — whichever occurs first | s.159(1) |
| Base | Computed on the retail price of all chargeable fossil fuel products | s.159(2) |
| Commencement | Minister sets effective date by Official Gazette order; Service collects monthly | s.160(1)–(2) |
| Exemptions | Clean/renewable energy; household kerosene; cooking gas; CNG | s.161(1)(a)–(d) |
- Gasoil NOT exempt (confirmed). Build surcharge as toggle, default OFF, commencementGazetted:false.

---

## Withholding Tax on Freight
- Spec cites "TAA 2025 s.51 + WHT regs" at 5%.
- NOT yet verified against the Nigeria Tax Administration Act text — section/rate unconfirmed.
- Action: build session must confirm the WHT-on-freight rate and section against the attached Nigeria Tax Administration Act 2025 before relying on it. Treat as status: CONFIRM. WHT remains a COST (deducted at source), not recoverable.

---

## Non-NTA levies (maritime — confirm rates with NIMASA/regulator)
- NIMASA 2% cabotage surcharge — COST (status: CONFIRM)
- NIMASA 3% gross freight levy — COST (status: CONFIRM)
- SPOMO / CVFF 2% — COST (status: CONFIRM)
- Marine insurance ICC(A) 0.125% — COST (commercial rate, not statutory)

---

## VAT-services base (cost line 13) — configurable
- Statute does not define a "services bucket"; it taxes the value of each taxable service supplied (s.147, value per s.148).
- Model: servicesBucket = explicit named list of service cost-line IDs, summed at runtime; VAT services = 7.5% × bucket.
- Default composition (professional/agency services): SGS inspection (15) + port agency (16) + collateral manager (24).
- VAT on services is recoverable input VAT (s.155(4)) → goes in the recoverable-VAT timing block, not all-in cost.
- Print bucket composition + sum; status: "CONFIRM which service lines are VAT-able per s.147/s.155(4)."

---

## Summary of changes vs prior spec
1. s.186(n) reasoning removed — it is about exports, not domestic standard-rating. Use s.147 + non-listing in s.185/s.186.
2. Recoverability anchored correctly to s.155(4) and proviso (a) for apportionment.
3. Surcharge fully verified (s.158–161) — prior spec was correct here.
4. WHT on freight flagged unverified pending the TAA 2025 text.
