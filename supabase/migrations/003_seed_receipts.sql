-- 003_seed_receipts.sql
-- Loads the real receipts from /Recipts into studio_receipts.
--
-- WHY A SEED AND NOT OCR
-- These 30 documents were already parsed in full during the session that built this
-- system — vendor, date, gross, and the exact VAT each supplier states. Re-reading them
-- through OCR would be slower and would introduce errors into figures we already know
-- exactly. OCR is for the receipts that arrive from tomorrow onward.
--
-- FOREIGN CURRENCY IS DELIBERATELY LEFT UNCONVERTED
-- Rows in EUR and USD carry currency + total but NO total_sek. That is not an omission:
-- lib/moms.js will report them as `unconverted`, set fileReady = false, and refuse to
-- put a guessed figure on a VAT return. Run scripts/backfill-fx.mjs to fill them from
-- the ECB rate for each payment date, and the flags clear themselves.
--
-- DATE ASSUMPTION worth checking: Tre rows use förfallodag as receipt_date, on the
-- assumption autogiro pays on the due date. Under kontantmetoden the date that counts is
-- the date money actually left the account. If a payment cleared in a different month,
-- correct that row — it can move VAT between quarters.
--
-- Safe to re-run: the WHERE NOT EXISTS guard makes it idempotent.

do $$
declare
  v_user uuid;
begin
  select id into v_user from auth.users where email = 'guatabeycigars@gmail.com';
  if v_user is null then
    raise exception 'User not found — check the email address in this script.';
  end if;

  -- ── Tre (Hi3G Access AB) — Swedish supplier, domestic VAT ─────────────────
  -- Deduct ONLY the moms Tre states. Most of each bill is delbetalning on the
  -- handset, which carries no VAT. 25% of the gross would overclaim every month.
  insert into public.studio_receipts
    (user_id, vendor, receipt_date, total, vat_amount, currency, total_sek, vat_sek,
     category, vat_treatment, venture, is_business, is_deductible, business_share)
  select v_user, x.vendor, x.d::date, x.total, x.vat, 'SEK', x.total, x.vat,
         'Telefoni', 'domestic', 'turquino', true, true, 1.0
  from (values
    ('Tre (Hi3G Access AB)','2025-07-28', 690.33, 35.60),
    ('Tre (Hi3G Access AB)','2025-08-26', 692.33, 36.00),
    ('Tre (Hi3G Access AB)','2025-09-26', 690.33, 35.60),
    ('Tre (Hi3G Access AB)','2025-10-27', 949.33, 74.60),
    ('Tre (Hi3G Access AB)','2025-11-26', 690.33, 35.60),
    ('Tre (Hi3G Access AB)','2025-12-23', 752.33, 35.60),
    ('Tre (Hi3G Access AB)','2026-01-26', 750.33, 35.60),
    ('Tre (Hi3G Access AB)','2026-02-26', 690.33, 35.60),
    ('Tre (Hi3G Access AB)','2026-03-26', 690.33, 35.60),
    ('Tre (Hi3G Access AB)','2026-04-27', 690.33, 35.60),
    ('Tre (Hi3G Access AB)','2026-05-26',1385.33,174.60),
    ('Tre (Hi3G Access AB)','2026-06-26', 708.04, 39.14),
    ('Tre (Hi3G Access AB)','2026-07-27', 700.45, 37.62),
    ('Tre (Hi3G Access AB)','2026-08-26', 690.33, 35.60)
  ) as x(vendor, d, total, vat)
  where not exists (
    select 1 from public.studio_receipts r
    where r.user_id = v_user and r.vendor = x.vendor and r.receipt_date = x.d::date
  );

  -- ── Anthropic — US supplier ───────────────────────────────────────────────
  -- Charged 25% Swedish VAT through OSS because the VAT number on file was malformed
  -- (SE199309199090 — a personnummer, not a VAT number). That VAT is NOT reclaimable
  -- from Skatteverket, only from Anthropic. Corrected to SE930919909001 on 2026-08-21,
  -- so anything paid after that date should reverse-charge instead.
  insert into public.studio_receipts
    (user_id, vendor, receipt_date, total, vat_amount, currency,
     category, vat_treatment, venture, is_business, is_deductible)
  select v_user, 'Anthropic, PBC', x.d::date, x.total, x.vat, 'EUR',
         'IT-tjänster', 'oss_non_ded', 'turquino', true, true
  from (values
    ('2026-03-17', 112.50, 22.50),
    ('2026-03-18',  25.00,  5.00),
    ('2026-03-18', 116.04, 23.21),   -- NLCLAITV-0007; the "Receipt-2488" PDF is the same txn
    ('2026-04-18', 225.00, 45.00),
    ('2026-05-18', 225.00, 45.00),
    ('2026-06-18', 112.50, 22.50),
    ('2026-07-21', 112.50, 22.50)
  ) as x(d, total, vat)
  where not exists (
    select 1 from public.studio_receipts r
    where r.user_id = v_user and r.vendor = 'Anthropic, PBC'
      and r.receipt_date = x.d::date and r.total = x.total
  );

  -- ── Webflow — US supplier, correct VAT number, reverse charge ─────────────
  -- No VAT charged. Self-account 25% in ruta 22 + 30 and deduct it in 48. Net zero.
  -- Subscription cancelled after 2026-03-27.
  insert into public.studio_receipts
    (user_id, vendor, receipt_date, total, vat_amount, currency,
     category, vat_treatment, venture, is_business, is_deductible)
  select v_user, 'Webflow, Inc.', x.d::date, 29.00, 0, 'USD',
         'Webbhotell', 'rc_non_eu', 'turquino', true, true
  from (values
    ('2025-05-27'),('2025-06-27'),('2025-07-27'),('2025-08-27'),('2025-09-27'),
    ('2025-10-27'),('2025-11-27'),('2025-12-27'),('2026-01-27'),('2026-02-27'),
    ('2026-03-27')
  ) as x(d)
  where not exists (
    select 1 from public.studio_receipts r
    where r.user_id = v_user and r.vendor = 'Webflow, Inc.' and r.receipt_date = x.d::date
  );

  -- ── Zoho (Netherlands) — same OSS problem as Anthropic, still unfixed ─────
  insert into public.studio_receipts
    (user_id, vendor, receipt_date, total, vat_amount, currency,
     category, vat_treatment, venture, is_business, is_deductible)
  select v_user, 'Zoho Corporation B.V.', '2026-03-23'::date, 14.63, 2.93, 'EUR',
         'IT-tjänster', 'oss_non_ded', 'turquino', true, true
  where not exists (
    select 1 from public.studio_receipts r
    where r.user_id = v_user and r.vendor = 'Zoho Corporation B.V.'
  );

  -- ── Namecheap — US, no VAT charged, reverse charge ────────────────────────
  insert into public.studio_receipts
    (user_id, vendor, receipt_date, total, vat_amount, currency,
     category, vat_treatment, venture, is_business, is_deductible)
  select v_user, 'Namecheap', '2026-03-23'::date, 10.18, 0, 'USD',
         'Domän', 'rc_non_eu', 'turquino', true, true
  where not exists (
    select 1 from public.studio_receipts r
    where r.user_id = v_user and r.vendor = 'Namecheap'
  );

  -- ── Bolagsverket — myndighetsavgift, 0% moms ─────────────────────────────
  -- Deductible for income tax (BAS 6991: fees for CHANGING details are avdragsgilla;
  -- only new-registration fees are not). Nothing to reclaim in ruta 48.
  insert into public.studio_receipts
    (user_id, vendor, receipt_date, total, vat_amount, currency, total_sek, vat_sek,
     category, vat_treatment, venture, is_business, is_deductible)
  select v_user, 'Bolagsverket', '2026-08-21'::date, 1600.00, 0, 'SEK', 1600.00, 0,
         'Myndighetsavgift', 'exempt', 'turquino', true, true
  where not exists (
    select 1 from public.studio_receipts r
    where r.user_id = v_user and r.vendor = 'Bolagsverket' and r.receipt_date = '2026-08-21'
  );

end $$;

-- ── What landed, and what still needs a rate ────────────────────────────────
select vendor, currency, count(*) as antal,
       sum(total) as summa,
       count(*) filter (where currency <> 'SEK' and total_sek is null) as saknar_omrakning
from public.studio_receipts
group by vendor, currency
order by vendor;

-- NOT SEEDED — the two Air France tickets. The PDFs are itineraries with no fare
-- shown, so there is no amount to enter without inventing one. Find the card charge
-- or the booking confirmation and add them by hand. International passenger transport
-- is exempt, so vat_treatment = 'exempt' and there is no VAT to reclaim either way.
-- They are only deductible at all if each trip was genuinely for business.
