# Swedish invoice/tax/receipt market — Research 2026
_For the Nordbok Studio build · April 2026_

## TL;DR
Bokio (freemium leader, 3.4★ iOS), Fortnox (enterprise standard, accountant-trusted), Visma/Spiris (legacy, 1.5★ Trustpilot post-rebrand), and Speedledger (bank-direct) own the Swedish bookkeeping market. None of them combine first-class körjournal + receipt OCR + Swedish-compliant ROT/RUT invoicing + a daily-use mobile UX. Driversnote is the highest-rated app in the market (4.8★ iOS) and proves Swedes will pay for excellence in a single-purpose tool — but its isolation from invoicing is a gap. Receipt OCR APIs (Mindee, Klippa, Veryfi) are mature; for our scale, Mindee at $0.05–0.10/receipt is right. Tink (open banking) is enterprise-priced and slow to onboard; for v1 we ship CSV import and reach for Nordigen's free PSD2 tier in v1.5.

## Competitor scorecard

| Company | Cheapest tier | EF support | OCR | Bank feed | Körjournal | ROT/RUT | Mobile | Weakness |
|---|---|---|---|---|---|---|---|---|
| Bokio | 299 kr/mo + 89 for invoicing | ✅ | basic AI | Tink | ❌ | ❌ | 3.4★ | OCR weak; invoicing add-on; aging mobile |
| Fortnox | 99 kr accounting / 198 starter | ✅ | ❌ | direct (SEB, Swed, Nordea, Handelsb) | ❌ | ✅ | 4.0★ | overkill for micro EF; price creep |
| Spiris (Visma) | ~399 kr | ✅ | ❌ | direct | ❌ | unclear | 2.67★ | rebrand chaos; archaic UI; 1.5★ Trustpilot |
| Speedledger | ~199 kr | ✅ | photo only | direct (10 banks via Open Payments) | ❌ | ❌ | 4.2★ | photo ≠ OCR; invoicing limited |
| Zervant | £8.99 (~100 kr) | minimal | ❌ | ❌ | ❌ | ❌ | n/a (web) | invoice-only; no SE-specific |
| Mynt / Pleo | 250–350 kr (card-based) | weak | ✅ via card | ✅ | ❌ | ❌ | 4.0★ | corporate-card first; not for cash-based EF |
| Driversnote | 99–199 kr/yr | ✅ | n/a | ❌ | ✅ Skatteverket-compliant GPS | ❌ | 4.8★ | single-purpose; doesn't talk to accounting tools |

## Compliance must-knows

**F-skatt invoice fields (mandatory):** "Godkänd för F-skatt", personnummer (or org-nr), momsregistreringsnummer if registered, invoice number + date, buyer name + address, line-item description, price + VAT (25/12/6/0%), total, payment terms. Archive 7 years (Bokföringslagen).

**Körjournal required fields per trip (Skatteverket):** datum, från-adress, till-adress, syfte, körda mil eller mätarställning, registreringsnummer. 2026 rates: 25 kr/mil privatbil i tjänsten, 12 kr/mil företagsbil bensin/diesel, 0 kr/mil elbil. Entries must be made contemporaneously, not retroactively.

**ROT/RUT 2026:** ROT max 50,000 kr/år, RUT max 75,000 kr (combined cap 75k). Subsidy = 50% of arbetskostnad (labor only). Invoice must show: customer's personnummer, fastighetsbeteckning (villa) or BRF-org-nr (apartment), arbetstimmar split per VAT rate, total work cost.

**OSS VAT threshold:** B2C distance sales to other EU countries — register for OSS once you exceed €10,000 (~99,680 kr/year). Charge customer's country VAT, file quarterly with Skatteverket.

## Build vs buy

| Component | Pick for v1 | Why | Cost |
|---|---|---|---|
| Receipt OCR | **Claude vision (anthropic) → upgrade to Mindee at scale** | We already have an Anthropic key. Claude does receipts well, costs roughly $0.005–0.02 per scan, no minimum, no separate vendor account. Switch to Mindee Starter ($50/mo, 500 receipts) when volume crosses ~500/mo. | <$10/mo to start |
| Bank feed | **CSV import, Nordigen later** | Tink wants enterprise contracts; CSV from Swedbank/SEB/Handelsbanken/Nordea/Revolut covers 95% of need. Add Nordigen free tier in v1.5. | $0 |
| Invoice email | **Resend** | Already integrated. Best DX. 3,000 emails/mo free. | $0 |
| PDF | **Browser print → CSS-styled HTML** | No server-side PDF lib needed; Save-as-PDF from Chrome works perfectly and keeps the bundle tiny. Add `@react-pdf/renderer` in v1.5 if you need automatic attach-as-PDF in emails. | $0 |
| Auth | **Supabase Auth** | Already in use. Cookies + middleware = clean SSR. | $0 |

## Where the gap is (and what we're building)

1. **Micro-EF pricing cliff.** Bokio = 388 kr/mo for basic invoicing. Fortnox = 198 kr but overkill. **Nordbok at 99 kr/mo (or even free for personal use) hits the underserved 1–3-invoice/week segment.**
2. **Körjournal + invoicing in one app.** Driversnote is beloved but isolated. Bokio has neither. Owning the körjournal field gives us a reason to ship a mobile-first PWA.
3. **Opinionated ROT/RUT flow.** Walk the user through "is this a villa or BRF?" → auto-fill the right Skatteverket fields → validate before sending. Today's tools just give you a textbox.
4. **Swedish receipt OCR moat.** ICA, Willys, Systembolaget, OKQ8 — feed 500 of these through Claude vision to bench accuracy. Mindee has EU training, not Swedish-specific.
5. **An assistant that actually knows your books.** Plug a Claude conversation into the user's Supabase rows (RLS-scoped) and answer "what's my deductible YTD" in seconds. None of Bokio/Fortnox/Spiris ship anything like this.

## Recommended pricing (v1)

- Free: 5 invoices/mo, 20 receipts/mo, körjournal manual.
- Standard 99 kr/mo: unlimited invoices/receipts, ROT/RUT templates, körjournal, CSV bank import, Skatteverket export, email digest.
- Pro 199 kr/mo: AI assistant, automatic OCR (Mindee), bank feed sync, multi-vehicle körjournal, priority support.

Undercut Bokio (299), beat Fortnox on simplicity, deliver Driversnote-level mobile UX.

## Sources

Skatteverket (F-skatt, körjournal, ROT/RUT, OSS), Bokio + Fortnox + Spiris + Speedledger pricing pages, Driversnote 2026 mileage rate page, Mindee/Klippa/Veryfi pricing pages, Tink pricing, Nordigen documentation, App Store rating pages for each app cited.
