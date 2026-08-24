#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   momsstatus.mjs — vilka momsperioder som är lämnade och vilka som inte är det

     npm run momsstatus
     npm run momsstatus -- --lamnad 2026-Q2 --belopp -430,50
     npm run momsstatus -- --angra 2026-Q2

   Skriver ingenting utan --lamnad eller --angra.

   Att markera en period som lämnad här ersätter inte att lämna den hos
   Skatteverket. Det är en anteckning om att du gjort det, så att appen slutar
   påminna — och så att den kan påminna när du inte har.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFile } from "node:fs/promises";
import { momsStatus, deadlineFor, kvartal, manad, helar } from "../lib/moms-status.js";

const kr = (n) =>
  (n == null ? "—" :
    Math.abs(Number(n)).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ")
    + " kr" + (Number(n) < 0 ? " tillbaka" : ""));

const MARK = { "lämnad": "✓", "försenad": "✗", "brådskande": "!", "öppen": "·", "pågående": "…" };
const NAMN = { manad: "månadsvis", kvartal: "kvartalsvis", helar: "helår" };

const args = process.argv.slice(2);
const flagga = (n) => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : null; };
const LAMNAD = flagga("--lamnad");
const ANGRA = flagga("--angra");
const BELOPP = flagga("--belopp");

/** "2026-Q2" | "2026-04" | "2026" → periodobjekt, eller null. */
function tolkaPeriod(key) {
  let m;
  if ((m = /^(\d{4})-Q([1-4])$/.exec(key))) return kvartal(+m[1], +m[2]);
  if ((m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key))) return manad(+m[1], +m[2]);
  if ((m = /^(\d{4})$/.exec(key))) return helar(+m[1]);
  return null;
}

const env = {};
for (const rad of (await readFile(new URL("../.env.local", import.meta.url), "utf8")).split("\n")) {
  const m = rad.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: settings, error: e1 } = await sb.from("studio_settings").select("*").limit(1).maybeSingle();
if (e1) { console.error(`\n✗ Kunde inte läsa inställningarna: ${e1.message}\n`); process.exit(1); }

const opts = {
  euHandel: !!settings?.vat_eu_trade,
  storOmsattning: !!settings?.vat_large_turnover,
};

/* ── Skriva ──────────────────────────────────────────────────────────────── */
if (ANGRA) {
  const { error } = await sb.from("studio_moms_perioder").delete()
    .eq("period_key", ANGRA).eq("user_id", settings.user_id);
  if (error) { console.error(`\n✗ ${error.message}\n`); process.exit(1); }
  console.log(`\n✓ ${ANGRA} är inte längre markerad som lämnad.\n`);
}

if (LAMNAD) {
  const p = tolkaPeriod(LAMNAD);
  if (!p) { console.error(`\n✗ Ange perioden som 2026-Q2, 2026-04 eller 2026.\n`); process.exit(1); }
  const { error } = await sb.from("studio_moms_perioder").insert({
    user_id: settings.user_id,
    period_key: p.key,
    period_start: p.start,
    period_end: p.end,
    deadline: deadlineFor(p, opts),
    belopp: BELOPP == null ? null : Number(String(BELOPP).replace(",", ".")),
  }).select("period_key").maybeSingle();
  if (error) {
    console.error(`\n✗ ${error.message}`);
    if (String(error.message).includes("duplicate")) {
      console.error(`  ${p.key} är redan markerad som lämnad. Kör --angra ${p.key} först om det var fel.`);
    }
    console.error();
    process.exit(1);
  }
  console.log(`\n✓ ${p.key} markerad som lämnad${BELOPP != null ? ` · ${kr(Number(String(BELOPP).replace(",", ".")))}` : ""}.\n`);
}

/* ── Läsa och visa ───────────────────────────────────────────────────────── */
const { data: lamnade, error: e2 } = await sb.from("studio_moms_perioder").select("*").order("period_start");
if (e2) {
  console.error(`\n✗ Kunde inte läsa momsperioderna: ${e2.message}`);
  console.error(`  Har migration 015_moms_perioder.sql körts?\n`);
  process.exit(1);
}

const s = momsStatus({
  registreradFrom: settings?.vat_registered_from,
  avregistreradFrom: settings?.vat_dereg_from,
  periodTyp: settings?.vat_period_type,
  idag: new Date().toISOString().slice(0, 10),
  lamnade: lamnade || [],
  ...opts,
});

console.log(`\nMomsdeklarationer — ${settings?.business_name || "verksamheten"}\n`);

if (s.saknarRegistreringsdatum) {
  console.log("  ✗ Momsregistreringsdatum saknas. Kör migration 014.");
  console.log("    Utan det går det inte att veta vilken period som var den första.\n");
  process.exit(1);
}

/* Det viktigaste felmeddelandet i filen: hellre tyst än rödmålad gissning. */
if (s.saknarPeriodTyp || s.okandPeriodTyp) {
  console.log(`  Registrerad för moms från ${settings.vat_registered_from}.\n`);
  console.log("  ? Redovisningsperioden är okänd, så ingen deadline kan räknas ut.");
  console.log("    Den står på momsregistreringsbeviset under \"Redovisningsperiod\".");
  console.log("    Samma dag och samma data ger helt olika besked beroende på vilken");
  console.log("    det är, så appen gissar inte.\n");
  console.log("    Sätt den i Supabase SQL editor:\n");
  console.log("      update studio_settings set vat_period_type = 'helar';   -- eller 'kvartal' / 'manad'");
  console.log("      update studio_settings set vat_eu_trade = true;         -- bara om du lämnar periodisk sammanställning\n");
  process.exit(0);
}

console.log(`  Registrerad för moms från ${settings.vat_registered_from} · ${NAMN[s.periodTyp] || s.periodTyp}`);
if (s.periodTyp === "helar") console.log(`  EU-handel: ${opts.euHandel ? "ja — deklaration 26 februari" : "nej — deklaration 12 maj året efter"}`);
console.log();

for (const p of s.perioder) {
  const svans =
    p.status === "försenad" ? `${p.dagar_forsenad} dagar sen · förseningsavgift ${p.forseningsavgift} kr`
    : p.status === "brådskande" ? `${p.dagar_till_deadline} dagar kvar`
    : p.status === "lämnad" ? `${String(p.lamnad_at).slice(0, 10)}${p.belopp != null ? " · " + kr(p.belopp) : ""}`
    : "";
  console.log(
    ` ${MARK[p.status] || " "} ` +
    p.key.padEnd(9) +
    `${p.start} – ${p.end}`.padEnd(26) +
    `senast ${p.deadline}`.padEnd(19) +
    p.status.padEnd(12) +
    svans
  );
}

if (s.forsenade.length) {
  const avgift = s.forsenade.reduce((a, p) => a + p.forseningsavgift, 0);
  const flera = s.forsenade.length !== 1;
  console.log(`\n  ✗ ${s.forsenade.length} deklaration${flera ? "er" : ""} är försenad${flera ? "e" : ""}.`);
  console.log(`    Förseningsavgiften är 625 kr per utebliven deklaration och tas ut även`);
  console.log(`    om deklarationen visar noll eller ett belopp att få tillbaka.`);
  console.log(`    Sammanlagt ${avgift} kr om ingen av dem lämnas.`);
  console.log(`\n    Lämna dem på skatteverket.se, och kör sedan:`);
  for (const p of s.forsenade) console.log(`      npm run momsstatus -- --lamnad ${p.key}`);
} else if (s.nasta && s.nasta.status !== "pågående") {
  console.log(`\n  Nästa: ${s.nasta.key}, senast ${s.nasta.deadline} (${s.nasta.dagar_till_deadline} dagar kvar).`);
} else if (s.nasta) {
  console.log(`\n  ✓ Ingenting förfallet. ${s.nasta.key} pågår, ska lämnas senast ${s.nasta.deadline}.`);
} else {
  console.log(`\n  ✓ Ingenting förfallet.`);
}
console.log();
