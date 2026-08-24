-- ═══════════════════════════════════════════════════════════════════════════
-- 016 — Redovisningsperiod för moms
--
-- lib/moms-status.js kunde bara kvartal, därför att kvartal var vad jag antog
-- när jag skrev den. Skatteverket bestämmer redovisningsperioden vid
-- registreringen, och för en nystartad verksamhet under 1 Mkr är helår minst
-- lika vanligt som kvartal.
--
-- Skillnaden är inte kosmetisk. Med registrering 2026-04-29 och samma data
-- säger appen den 24 augusti 2026 antingen
--
--     kvartal → Q2 är sju dagar försenad, 625 kr i förseningsavgift
--     helår   → första deklarationen ska lämnas 12 maj 2027, ingenting är fel
--     månad   → tre perioder är försenade, 1 875 kr
--
-- Samma verksamhet, samma dag, tre helt olika besked. En röd varning byggd på
-- ett antagande är värre än ingen varning alls, eftersom den lär användaren att
-- ignorera varningar.
--
-- Kolumnen får därför INGET default. Är den null visar appen att perioden är
-- okänd och ber om den, i stället för att gissa.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.studio_settings
  add column if not exists vat_period_type    text,
  add column if not exists vat_eu_trade       boolean not null default false,
  add column if not exists vat_large_turnover boolean not null default false;

alter table public.studio_settings
  drop constraint if exists studio_settings_vat_period_type_check;
alter table public.studio_settings
  add constraint studio_settings_vat_period_type_check
  check (vat_period_type is null or vat_period_type in ('manad', 'kvartal', 'helar'));

comment on column public.studio_settings.vat_period_type is
  'Redovisningsperiod för moms enligt Skatteverkets beslut: manad, kvartal '
  'eller helar. Står på momsregistreringsbeviset. Null = okänd — appen gissar '
  'inte, den frågar.';

comment on column public.studio_settings.vat_eu_trade is
  'Bedriver EU-handel och lämnar periodisk sammanställning. Påverkar bara '
  'helårsmoms: med EU-handel 26 februari, utan 12 maj året efter.';

comment on column public.studio_settings.vat_large_turnover is
  'Omsättning minst 40 Mkr. Påverkar bara månadsmoms: då gäller 26:e i månaden '
  'efter perioden i stället för 12:e i andra månaden.';
