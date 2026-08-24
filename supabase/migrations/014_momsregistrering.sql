-- ═══════════════════════════════════════════════════════════════════════════
-- 014 — Momsregistreringsdatum
--
-- lib/moms-period.js has been reading settings.vat_registered_from since it was
-- written. The column never existed, so the read has always returned undefined
-- and every check built on it has silently passed.
--
-- The date matters. Ingående moms får dras av på förvärv som görs i den
-- momspliktiga verksamheten. Är du registrerad från 2026-04-29 och drar moms
-- på ett kvitto från februari, är avdraget felaktigt om inte registreringen
-- backdaterats. Skatteverket kan kräva tillbaka beloppet med ränta.
--
-- Two dates, because they are not the same thing:
--   vat_registered_from — the date Skatteverket registered you (what appears on
--                          the registerutdrag). Input VAT before this date is
--                          not deductible unless registration was backdated.
--   fiscal_year_start   — for an enskild firma this is always 1 January, but
--                          storing it stops the SIE export from assuming.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.studio_settings
  add column if not exists vat_registered_from date,
  add column if not exists vat_dereg_from      date;

comment on column public.studio_settings.vat_registered_from is
  'Datum då Skatteverket registrerade verksamheten för moms. Ingående moms på '
  'förvärv före detta datum är som huvudregel inte avdragsgill. Läses av '
  'lib/moms-period.js och scripts/sie.mjs.';

comment on column public.studio_settings.vat_dereg_from is
  'Datum för avregistrering, om sådan skett. Null = fortfarande registrerad.';

-- ── Cris registrerades 2026-04-29. Sätts här så att kontrollerna får något
--    att arbeta mot. Ändra datumet om registerutdraget säger något annat.
update public.studio_settings
   set vat_registered_from = date '2026-04-29'
 where vat_registered_from is null;

-- ── An avregistrering that precedes the registrering is always a typo, and so
--    is a date from before Skatteverket existed in its current form. Refuse
--    both at the database rather than discovering them i en momsdeklaration.
--    (current_date cannot appear here — CHECK expressions must be IMMUTABLE.)
alter table public.studio_settings
  drop constraint if exists studio_settings_momsdatum_rimliga;

alter table public.studio_settings
  add constraint studio_settings_momsdatum_rimliga
  check (
    (vat_registered_from is null or vat_registered_from >= date '1969-01-01')
    and (vat_dereg_from is null or vat_registered_from is null
         or vat_dereg_from >= vat_registered_from)
  ) not valid;

alter table public.studio_settings
  validate constraint studio_settings_momsdatum_rimliga;
