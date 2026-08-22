# Dashboard port — setup

Six new files plus one CSS import. Nothing existing is overwritten; the new dashboard
lives beside the old one until you swap the route.

## 1. Install

```bash
cd ~/Downloads/nordbok_pwa_v2/studio-app

npm i tailwindcss @tailwindcss/postcss postcss
npm i recharts motion vaul @number-flow/react
```

Tailwind v4 is CSS-first — no `tailwind.config.js`. Create `postcss.config.mjs`:

```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

## 2. Wire the CSS

`app/tokens.css` is already in place. In `app/layout.js`, import in this order:

```js
import "./tailwind.css";   // see below
import "./tokens.css";
import "./globals.css";    // your existing styles — last, so they still win
```

Create `app/tailwind.css` containing exactly:

```css
@import "tailwindcss";
```

Order matters. Tailwind first, tokens second, your existing CSS last. That way nothing
you already built changes appearance, and you migrate screen by screen.

## 3. Fonts

In `app/layout.js`, inside `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
<link rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" />
```

## 4. Files

| Path | What |
|---|---|
| `lib/moms.js` | The VAT engine — every ruta, kontantmetoden, no guessed kronor |
| `lib/dashboard-data.js` | One server-side read; monthly series, tiles, flags |
| `app/tokens.css` | Design tokens, light + dark, Tailwind v4 |
| `components/dashboard/DashboardClient.jsx` | Interactive shell — filter, hero, tiles |
| `components/dashboard/MonthlyChart.jsx` | Recharts, stacked area + netto line |
| `components/dashboard/MomsSheet.jsx` | Vaul drawer, box-by-box drill-down |
| `app/dashboard/page.jsx` | Server Component |

## 5. Schema

`002_invoice_series.sql` is already run. One more column is needed for the phone
apportionment the engine reads:

```sql
alter table public.studio_receipts
  add column if not exists business_share numeric default 1
    check (business_share >= 0 and business_share <= 1);

comment on column public.studio_receipts.business_share is
  'Business-use fraction for mixed-use costs. 1 = fully business. Applied to input VAT in ruta 48.';
```

## 6. Backfill before the numbers mean anything

The engine is only as good as `vat_treatment`. Untagged receipts are excluded from
ruta 48 and reported as a flag, by design — better a visible gap than a silent
wrong number.

```sql
-- Swedish suppliers
update studio_receipts set vat_treatment = 'domestic'
  where vendor ilike '%tre%' or vendor ilike '%hi3g%';

-- Foreign suppliers that charged Swedish VAT via OSS — never deductible
update studio_receipts set vat_treatment = 'oss_non_ded'
  where vendor ilike '%anthropic%' and receipt_date < '2026-08-21';

-- After the VAT number was corrected, Anthropic should reverse-charge
update studio_receipts set vat_treatment = 'rc_non_eu'
  where vendor ilike '%anthropic%' and receipt_date >= '2026-08-21';

update studio_receipts set vat_treatment = 'rc_non_eu'
  where vendor ilike '%webflow%' or vendor ilike '%namecheap%';

update studio_receipts set vat_treatment = 'oss_non_ded'
  where vendor ilike '%zoho%';

-- International passenger transport is exempt
update studio_receipts set vat_treatment = 'exempt'
  where vendor ilike '%air france%' or category = 'flight';
```

## 7. Run

```bash
npm run dev
```

Then `http://localhost:3001/dashboard`.

**What you should see with your real data:** hero showing the Q3 figure, `Intäkter 0 kr`
flagged in warning ink, the cost line rising from April, and a warning that the
Anthropic receipts carry OSS VAT that can't be reclaimed.

**If the hero reads 0 and the sheet is empty**, `vat_treatment` is still null on every
receipt — run the backfill above.

## 8. Then

The old dashboard is untouched at its original route. When you're happy, point the nav
at `/dashboard` and delete the old one. Every subsequent screen follows this pattern:
server component fetches → client shell renders → tokens do the styling.
