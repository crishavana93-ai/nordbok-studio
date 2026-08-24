#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   kontera.mjs — sätter BAS-konto på kvitton som saknar det
   ───────────────────────────────────────────────────────────────────────────
   Varför: SIE-exporten visade att 18 av 22 kostnadsrader hamnade på 6991
   "Övriga externa kostnader". Filen är laglig men resultaträkningen går inte
   att läsa — en revisor ser en klumpsumma i stället för en verksamhet.

   Skriver ingenting utan --skriv. Utan flaggan skrivs bara förslaget ut.

     node scripts/kontera.mjs            förslag
     node scripts/kontera.mjs --skriv    verkställ
     node scripts/kontera.mjs --alla     även rader som redan har konto
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFile } from "node:fs/promises";

/* ── Kategori → konto ────────────────────────────────────────────────────────
   Kategorin sätts av kvittoskannern och är renare än fritext. Den vinner
   därför över nyckelordsgissningen. Konton enligt BAS 2026.                */
export const KATEGORI_KONTO = {
  "telefoni":          { konto: "6212", namn: "Mobiltelefon",              ne: "R5" },
  "tele/it":           { konto: "6212", namn: "Mobiltelefon",              ne: "R5" },
  "mobil":             { konto: "6212", namn: "Mobiltelefon",              ne: "R5" },
  "bredband":          { konto: "6230", namn: "Datakommunikation",         ne: "R5" },
  "internet":          { konto: "6230", namn: "Datakommunikation",         ne: "R5" },
  "it-tjänster":       { konto: "6540", namn: "IT-tjänster",               ne: "R5" },
  "it-tjanster":       { konto: "6540", namn: "IT-tjänster",               ne: "R5" },
  "webbhotell":        { konto: "6540", namn: "IT-tjänster",               ne: "R5" },
  "domän":             { konto: "6540", namn: "IT-tjänster",               ne: "R5" },
  "doman":             { konto: "6540", namn: "IT-tjänster",               ne: "R5" },
  "programvara":       { konto: "6540", namn: "IT-tjänster",               ne: "R5" },
  "kontorsmateriel":   { konto: "6110", namn: "Kontorsmateriel",           ne: "R5" },
  "förbrukning":       { konto: "5410", namn: "Förbrukningsinventarier",   ne: "R5" },
  "resor":             { konto: "5800", namn: "Resekostnader",             ne: "R5" },
  "affärsresor":       { konto: "5800", namn: "Resekostnader",             ne: "R5" },
  "affarsresor":       { konto: "5800", namn: "Resekostnader",             ne: "R5" },
  "tjänsteresa":       { konto: "5800", namn: "Resekostnader",             ne: "R5" },
  "flyg":              { konto: "5800", namn: "Resekostnader",             ne: "R5" },
  "tåg":               { konto: "5800", namn: "Resekostnader",             ne: "R5" },
  "taxi":              { konto: "5800", namn: "Resekostnader",             ne: "R5" },
  "hotell":            { konto: "5830", namn: "Logi vid tjänsteresa",      ne: "R5" },
  "logi":              { konto: "5830", namn: "Logi vid tjänsteresa",      ne: "R5" },
  "drivmedel":         { konto: "5611", namn: "Drivmedel personbil",       ne: "R5" },
  "representation":    { konto: "6071", namn: "Representation, avdragsgill",ne: "R5" },
  "utbildning":        { konto: "7611", namn: "Fortbildning",              ne: "R5" },
  "försäkring":        { konto: "6310", namn: "Företagsförsäkringar",      ne: "R5" },
  "bank":              { konto: "6570", namn: "Bankkostnader",             ne: "R5" },
  "porto":             { konto: "6250", namn: "Porto",                     ne: "R5" },
  "konsult":           { konto: "6550", namn: "Konsultarvoden",            ne: "R5" },
  "redovisning":       { konto: "6530", namn: "Redovisningstjänster",      ne: "R5" },
  "marknadsföring":    { konto: "5900", namn: "Reklam och PR",             ne: "R5" },
  /* Myndighetsavgifter har inget eget BAS-konto. 6991 är rätt plats och
     inte en gissning — den lämnas därför medvetet kvar där.              */
  "myndighetsavgift":  { konto: "6991", namn: "Övriga externa kostnader",  ne: "R5" },
};

/* ── Leverantör → konto, för rader där kategorin saknas ──────────────────── */
const LEVERANTOR_KONTO = [
  [/^(tre|hi3g|telia|tele2|comviq|telenor|halebop)/i, "6212"],
  [/^(anthropic|openai|github|vercel|supabase|zoho|google|microsoft|adobe|figma|notion|slack|webflow|namecheap|cloudflare|aws|amazon web)/i, "6540"],
  [/^(bolagsverket|skatteverket|patent)/i, "6991"],
  [/^(sj|sl|flixbus|norwegian|sas|air france|klm|lufthansa|finnair|ryanair|easyjet|british airways|iberia|turkish|emirates|swiss|austrian|brussels airlines|vueling|wizz)/i, "5800"],
  [/^(scandic|elite|nordic choice|booking|airbnb)/i, "5830"],
  [/^(okq8|circle k|preem|shell|ingo|st1)/i, "5611"],
];

const KONTONAMN = {
  "5410": "Förbrukningsinventarier", "5611": "Drivmedel personbil",
  "5800": "Resekostnader", "5830": "Logi vid tjänsteresa", "5900": "Reklam och PR",
  "6071": "Representation, avdragsgill", "6110": "Kontorsmateriel",
  "6212": "Mobiltelefon", "6230": "Datakommunikation", "6250": "Porto",
  "6310": "Företagsförsäkringar", "6530": "Redovisningstjänster",
  "6540": "IT-tjänster", "6550": "Konsultarvoden", "6570": "Bankkostnader",
  "6991": "Övriga externa kostnader, avdragsgilla",
  "6992": "Övriga externa kostnader, ej avdragsgilla", "7611": "Fortbildning",
};

/** Föreslå konto. Returnerar null hellre än att gissa fel — ett felaktigt
 *  specifikt konto är sämre än ett ärligt samlingskonto. */
export function foreslaKonto(rc) {
  const kat = String(rc.category || "").trim().toLowerCase();
  if (kat && KATEGORI_KONTO[kat]) {
    return { ...KATEGORI_KONTO[kat], kalla: `kategori "${rc.category}"` };
  }
  const lev = String(rc.vendor || "").trim();
  for (const [re, konto] of LEVERANTOR_KONTO) {
    if (re.test(lev)) return { konto, namn: KONTONAMN[konto], ne: "R5", kalla: `leverantör "${lev}"` };
  }
  /* Ej avdragsgillt hamnar på 6992 oavsett vad raden handlar om. */
  if (rc.is_deductible === false) {
    return { konto: "6992", namn: KONTONAMN["6992"], ne: "—", kalla: "ej avdragsgill" };
  }
  return null;
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const args = process.argv.slice(2);
  const SKRIV = args.includes("--skriv");
  const ALLA = args.includes("--alla");

  const env = {};
  for (const line of (await readFile(new URL("../.env.local", import.meta.url), "utf8")).split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await sb
    .from("studio_receipts")
    .select("id, receipt_date, vendor, category, total, currency, bas_account, ne_row, is_deductible, is_business")
    .order("receipt_date", { ascending: true });

  if (error) { console.error(`\n✗ Kunde inte läsa kvitton: ${error.message}\n`); process.exit(1); }

  const kandidater = (data || []).filter((r) => r.is_business !== false && (ALLA || !r.bas_account));
  const forslag = [];
  const oklara = [];

  for (const rc of kandidater) {
    const f = foreslaKonto(rc);
    if (!f) { oklara.push(rc); continue; }
    if (rc.bas_account === f.konto) continue;
    forslag.push({ rc, f });
  }

  console.log(`\nKontering — ${kandidater.length} kvitton utan konto\n`);

  if (!forslag.length && !oklara.length) {
    console.log("  Inget att göra. Alla kvitton har ett konto.\n");
    process.exit(0);
  }

  /* Gruppera per konto så att mönstret syns i stället för 36 lösa rader. */
  const perKonto = new Map();
  for (const p of forslag) {
    const k = p.f.konto;
    if (!perKonto.has(k)) perKonto.set(k, []);
    perKonto.get(k).push(p);
  }

  for (const konto of [...perKonto.keys()].sort()) {
    const rader = perKonto.get(konto);
    console.log(`  ${konto}  ${KONTONAMN[konto] || ""}   ${rader.length} kvitton`);
    const perLev = new Map();
    for (const p of rader) {
      const v = p.rc.vendor || "okänd";
      perLev.set(v, (perLev.get(v) || 0) + 1);
    }
    for (const [lev, n] of [...perLev.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`        ${String(n).padStart(2)} × ${lev}`);
    }
    console.log();
  }

  if (oklara.length) {
    console.log(`  Kan inte avgöras automatiskt — ${oklara.length} kvitton:`);
    for (const r of oklara) {
      console.log(`        ${r.receipt_date || "utan datum"}  ${r.vendor || "okänd"}  (kategori: ${r.category || "saknas"})`);
    }
    console.log(`  De lämnas på 6991. Sätt kategori på kvittot och kör om.\n`);
  }

  if (!SKRIV) {
    console.log(`✓ ${forslag.length} rader skulle ändras. Kör med --skriv för att verkställa.\n`);
    process.exit(0);
  }

  let ok = 0, fel = 0;
  for (const { rc, f } of forslag) {
    const { error: e } = await sb
      .from("studio_receipts")
      .update({ bas_account: f.konto, ne_row: rc.ne_row || f.ne })
      .eq("id", rc.id)
      .select("id")
      .maybeSingle();
    if (e) { fel++; console.error(`  ✗ ${rc.vendor} ${rc.receipt_date}: ${e.message}`); }
    else ok++;
  }

  console.log(`\n✓ ${ok} kvitton konterade${fel ? `, ${fel} misslyckades` : ""}.`);
  console.log(`  Kör "npm run sie" igen för att se den nya kontofördelningen.\n`);
  if (fel) process.exit(1);
}
