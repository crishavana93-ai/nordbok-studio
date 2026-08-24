#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   momsstatus.mjs — vilka momsperioder som är lämnade och vilka som inte är det

     npm run momsstatus
     npm run momsstatus -- --lamnad 2026-Q2 --belopp -430,50
     npm run momsstatus -- --angra 2026-Q2

   Skriver ingenting utan --lamnad eller --angra.

   Att markera en period som lämnad här ersätter inte att lämna den hos
   Skatteverket. Det är en anteckning om att du har gjort det, så att appen
   slutar påminna — och så att den kan påminna när du inte har.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFile } from "node:fs/promises";
import { momsStatus, kvartal, deadlineForKvartal } from "../lib/moms-status.js";

const kr = (n) =>
  (n == null ? "—" :
    Math.abs(Number(n)).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ")
    + " kr" + (Number(n) < 0 ? " tillbaka" : ""));

const MARK = { "lämnad": "✓", "försenad": "✗", "brådskande": "!", "öppen": "·", "pågående": "…" };

const args = process.argv.slice(2);
const flagga = (namn) => { const i = args.indexOf(namn); return i > -1 ? args[i + 1] : null; };
const LAMNAD = flagga("--lamnad");
const ANGRA = flagga("--angra");
const BELOPP = flagga("--belopp");

const env = {};
for (const rad of (await readFile(new URL("../.env.local", import.meta.url), "utf8")).split("\n")) {
  const m = rad.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const [{ data: settings, error: e1 }, { data: lamnade, error: e2 }] = await Promise.all([
  sb.from("studio_settings").select("*").limit(1).maybeSingle(),
  sb.from("studio_moms_perioder").select("*").order("period_start"),
]);

if (e1) { console.error(`\n✗ Kunde inte läsa inställningarna: ${e1.message}\n`); process.exit(1); }
if (e2) {
  console.error(`\n✗ Kunde inte läsa momsperioderna: ${e2.message}`);
  console.error(`  Har migration 015_moms_perioder.sql körts?\n`);
  process.exit(1);
}

const idag = new Date().toISOString().slice(0, 10);

/* ── Skriva: markera en period som lämnad, eller ångra ────────────────────── */
if (ANGRA) {
  const { error } = await sb.from("studio_moms_perioder").delete().eq("period_key", ANGRA).eq("user_id", settings.user_id);
  if (error) { console.error(`\n✗ ${error.message}\n`); process.exit(1); }
  console.log(`\n✓ ${ANGRA} är inte längre markerad som lämnad.\n`);
}

if (LAMNAD) {
  const m = String(LAMNAD).match(/^(\d{4})-Q([1-4])$/);
  if (!m) { console.error(`\n✗ Ange perioden som t.ex. 2026-Q2.\n`); process.exit(1); }
  const q = kvartal(Number(m[1]), Number(m[2]));
  const rad = {
    user_id: settings.user_id,
    period_key: q.key,
    period_start: q.start,
    period_end: q.end,
    deadline: deadlineForKvartal(q.ar, q.kv),
    belopp: BELOPP == null ? null : Number(String(BELOPP).replace(",", ".")),
  };
  const { error } = await sb.from("studio_moms_perioder").insert(rad).select("period_key").maybeSingle();
  if (error) {
    console.error(`\n✗ ${error.message}`);
    if (String(error.message).includes("duplicate")) console.error(`  ${q.key} är redan markerad som lämnad. Kör --angra först om det var fel.`);
    console.error();
    process.exit(1);
  }
  console.log(`\n✓ ${q.key} markerad som lämnad${rad.belopp != null ? ` · ${kr(rad.belopp)}` : ""}.\n`);
}

/* ── Läsa om och visa ────────────────────────────────────────────────────── */
const { data: aktuella } = await sb.from("studio_moms_perioder").select("*").order("period_start");
const s = momsStatus({
  registreradFrom: settings?.vat_registered_from,
  avregistreradFrom: settings?.vat_dereg_from,
  idag,
  lamnade: aktuella || [],
});

console.log(`\nMomsdeklarationer — ${settings?.business_name || "verksamheten"}\n`);

if (s.saknarRegistreringsdatum) {
  console.log("  ✗ Momsregistreringsdatum saknas i inställningarna. Kör migration 014.");
  console.log("    Utan det går det inte att veta vilken period som var den första.\n");
  process.exit(1);
}

console.log(`  Registrerad för moms från ${settings.vat_registered_from} · kvartalsredovisning\n`);

for (const p of s.perioder) {
  const rad = [
    ` ${MARK[p.status] || " "} `,
    p.key.padEnd(9),
    `${p.start} – ${p.end}`.padEnd(26),
    `senast ${p.deadline}`.padEnd(19),
    p.status.padEnd(12),
  ].join("");
  const svans = p.status === "försenad" ? `${p.dagar_forsenad} dagar sen · förseningsavgift ${p.forseningsavgift} kr`
    : p.status === "brådskande" ? `${p.dagar_till_deadline} dagar kvar`
    : p.status === "lämnad" ? `${String(p.lamnad_at).slice(0, 10)}${p.belopp != null ? " · " + kr(p.belopp) : ""}`
    : "";
  console.log(rad + svans);
}

if (s.forsenade.length) {
  const avgift = s.forsenade.reduce((a, p) => a + p.forseningsavgift, 0);
  console.log(`\n  ✗ ${s.forsenade.length} deklaration${s.forsenade.length === 1 ? "" : "er"} är försenad${s.forsenade.length === 1 ? "" : "e"}.`);
  console.log(`    Förseningsavgiften är 625 kr per utebliven deklaration och tas ut`);
  console.log(`    även om deklarationen visar noll eller ett belopp att få tillbaka.`);
  console.log(`    Sammanlagt ${avgift} kr om ingen av dem lämnas.`);
  console.log(`\n    Lämna dem på skatteverket.se, och kör sedan:`);
  for (const p of s.forsenade) console.log(`      npm run momsstatus -- --lamnad ${p.key}`);
} else if (s.nasta && s.nasta.status !== "pågående") {
  console.log(`\n  Nästa: ${s.nasta.key}, senast ${s.nasta.deadline} (${s.nasta.dagar_till_deadline} dagar kvar).`);
} else {
  console.log(`\n  ✓ Ingenting förfallet.`);
}
console.log();
