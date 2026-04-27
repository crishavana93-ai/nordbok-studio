# Reseavdrag — Cheatsheet for enskild firma (2026)

_Sources: Skatteverket SKV 282 utgåva 09 (Bokföring, bokslut och deklaration), SKV 304 (Traktamente), Mervärdesskattelagen, Inkomstskattelagen kap. 12._

## When can you deduct a trip?

A flight (or any business trip) is deductible only when **all four** of these are true:

1. The trip serves the business — kundmöte, leverantörsbesök, mässa, fortbildning, marknadsundersökning.
2. It happens **outside the tjänstgöringsort** (your regular workplace area, generally >50 km radius).
3. The trip is documented — purpose, who you met, dates.
4. Receipts exist and are stored 7 years (Bokföringslagen 7 kap §2).

Mixing private days into a business trip is allowed but *only the business portion* is deductible. If a 4-day trip has 2 business days + 2 leisure days, deduct 50% of the shared costs (flight, hotel for non-business nights = private).

## What's deductible — full table

| Expense | Deductible % | BAS-konto | NE-rad | Notes |
|---|---|---|---|---|
| Flight ticket | 100% | 5800 Resekostnader | R5 | VAT only if Swedish carrier with SE VAT on invoice |
| Train ticket (SJ, Vy, MTR) | 100% | 5800 | R5 | 6% VAT |
| Hotel | 100% | 5830 Logi | R5 | 12% VAT |
| Conference / event registration | 100% | 7611 Fortbildning | R5 | 25% VAT |
| Taxi / Bolt / Uber | 100% | 5800 | R5 | 6% VAT (taxi) |
| Hire car | 100% | 5615 Leasing personbil | R5 | 25% VAT (50% deductible if mixed-use) |
| Fuel for hire car / business car | 100% | 5611 Drivmedel | R5 | 25% VAT |
| Parking (airport, kund) | 100% | 5800 | R5 | 25% VAT |
| Baggage fee, in-flight wifi | 100% | 5800 | R5 | Treat as flight cost |
| Visa / passport renewal | 100% if business-driven | 5800 | R5 | Document the trip linking it to the visa |
| **Meals — yourself** | Use **traktamente** schablon | 7321 (egen) | — | See traktamente below |
| **Meals — with client (representation)** | 50% of cost, max 60 kr/person + VAT | 6071 | R5 | Names of attendees required |
| Alcohol on rep meals | **0% (not deductible)** | — | — | Since 2017 |
| Family ticket / non-business travelers | 0% | — | — | Even if they were on the same trip |

## Traktamente (per-diem) — 2026 rates

You take **either** receipts for your meals **or** the schablon traktamente — not both.

**Inrikes (Sweden):**
- Hel dag (avresa före 12, hemkomst efter 19) : **290 kr/dag**
- Halv dag (avresa efter 12 eller hemkomst före 19) : **145 kr/dag**
- Avdrag for free meals: -90 kr för lunch/middag, -36 kr för frukost

**Utrikes (sample 2026 — full list at skatteverket.se SKV 304):**
| Country | kr/dag |
|---|---|
| Germany (Berlin/Frankfurt) | 549 |
| United Kingdom | 561 |
| USA | 700 |
| France | 549 |
| Norway | 643 |
| Spain | 462 |
| Italy | 543 |
| Switzerland | 826 |

If your actual meals cost less than the schablon, you still claim the full schablon. If they cost more, you can either claim the schablon OR claim 100% of receipts (you have to pick one method per trip).

## Required per-trip log (audit trail)

Skatteverket can ask up to 6 years later. Keep this for every trip:

```
Datum:     2026-04-28 → 2026-04-30
Destination: Berlin, Tyskland
Syfte:     Kundmöte Acme GmbH (avtalsförhandling) + mässa CeBIT 2026
Kontakter: Hans Müller (CEO Acme), Lisa Becker (CTO Acme)
Boenden:   Scandic Berlin Potsdamer Platz, 28-30 apr (2 nätter)
Färdmedel: SAS SK639 STO-BER, retur SK642 BER-STO
Bilagor:   boarding-pass-SK639.pdf, scandic-faktura-2026-04-30.pdf, ticket-CeBIT.pdf
```

Inside Nordbok Studio: paste this block into the **Beskrivning** field of each related receipt, OR save it as a single document in `/documents` with `doc_type = "trip_log"`.

## Workflow inside Nordbok Studio

1. **Receipts** — snap every receipt the moment you get it. Claude vision auto-files SAS, Lufthansa, Scandic, Elite Hotels, OKQ8, SJ to the right BAS-konto.
2. **Mileage** — if you drove to/from the airport, log the trip with vehicle reg-nr, syfte, km. 25 kr/mil for privatbil i tjänsten (2026).
3. **Documents** — upload boarding passes and conference confirmations to `/documents` with tags `["resa", "2026-04-berlin", "acme"]`.
4. **Assistant** — ask the assistant: *"vilka resekostnader har jag YTD?"* and it pulls totals across BAS 5800/5830/5841/5611.

## Common mistakes Skatteverket flags

1. No purpose written → trip disallowed entirely.
2. Receipts in foreign currency without exchange rate at time of purchase. (App stores `fx_rate_to_sek` — fill it in.)
3. Combined private/business trip claimed as 100% — split the cost based on days.
4. Representation > 60 kr/person — only 60 kr/person + VAT is deductible.
5. Alcohol on representation receipts — separate it out and don't claim the alcohol portion.
6. Trip < 50 km from regular workplace and < 6 hours — usually disallowed (it's a normal work day).

## VAT (moms) recovery on travel

You can reclaim **ingående moms** on:
- Domestic flights (6% VAT)
- Trains (6% VAT)
- Domestic hotels (12% VAT)
- Domestic taxis (6% VAT)
- Conference fees in SE (25% VAT)
- Hire cars in SE (limit: 50% recoverable if used for both private and business)

You **cannot** reclaim moms on:
- International flights (typically 0% VAT)
- Hotels abroad (no SE moms — recover via that country's tax authority if amount is large; otherwise treat as full cost expense)
- Restaurant meals at representation (50% rule applies separately to the cost, full VAT recovery up to the 60 kr/person cap)

## Quick decision tree

```
Did I leave my normal workplace area for business?
├── No → Not a tjänsteresa. No deduction.
└── Yes → Did I document purpose + contacts?
        ├── No → Fix it now or lose the deduction.
        └── Yes → Deduct flight, hotel, transport 100%.
                   Pick: traktamente schablon OR receipted meals (not both).
                   Representation: split cost / attendees, cap at 60 kr/person.
                   Save receipts 7 years.
```
