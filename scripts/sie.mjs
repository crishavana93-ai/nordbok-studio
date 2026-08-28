/* scripts/sie.mjs — export the year as a SIE type 4 file.
 *
 *   npm run sie                 innevarande år, kontroll utan att skriva
 *   npm run sie -- --ar 2026    ett annat år
 *   npm run sie -- --skriv      skriv filen
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS
 * SIE is how bookkeeping leaves a Swedish accounting system. It is what a revisor
 * imports, what an agent files the NE-bilaga from, and what you hand to Fortnox or
 * Bokio if you ever leave. Until this existed the books were hostage to this app: the
 * word "SIE" appeared twice in the codebase, both times as a dropdown option, with no
 * generator behind either.
 *
 * THREE THINGS THE SPEC IS STRICT ABOUT, AND THAT ARE EASY TO GET WRONG
 *
 * 1. THE FILE IS CP437, NOT UTF-8. Codepage 437, IBM PC 8-bit extended ASCII. Write
 *    "Malmö" as UTF-8 and a revisor's software renders "MalmÃ¶" — or refuses the file.
 *    Node has no CP437 encoder, so there is one below.
 * 2. AMOUNTS USE A POINT, dates are YYYYMMDD, and at most two decimals. A Swedish
 *    decimal comma here breaks the parse, which is the opposite of every other number
 *    this app prints.
 * 3. EVERY VERIFIKAT MUST SUM TO ZERO. Double entry is not advisory. This script
 *    refuses to write a file containing an unbalanced verifikat rather than emit
 *    something a revisor has to debug.
 *
 * KONTANTMETODEN
 * Everything is booked on the date money moved — paid_at for invoices, receipt_date
 * for receipts — because that is the method this business reports on. An accrual
 * export would produce a different, also-correct file; it would just not match the
 * momsdeklarationer already filed.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/* ── CP437 ─────────────────────────────────────────────────────────────────
 * Only the characters above 0x7F need mapping; 0x00–0x7F is plain ASCII. This
 * covers the Latin-1 letters that turn up in Swedish bookkeeping — vendor names,
 * addresses, European suppliers. Anything unmappable becomes "?" rather than a
 * byte the reader will misinterpret as a different letter.
 */
const CP437 = {
  "Ç":128,"ü":129,"é":130,"â":131,"ä":132,"à":133,"å":134,"ç":135,"ê":136,"ë":137,
  "è":138,"ï":139,"î":140,"ì":141,"Ä":142,"Å":143,"É":144,"æ":145,"Æ":146,"ô":147,
  "ö":148,"ò":149,"û":150,"ù":151,"ÿ":152,"Ö":153,"Ü":154,"ø":155,"£":156,"Ø":157,
  "×":158,"ƒ":159,"á":160,"í":161,"ó":162,"ú":163,"ñ":164,"Ñ":165,"ª":166,"º":167,
  "¿":168,"®":169,"¬":170,"½":171,"¼":172,"¡":173,"«":174,"»":175,"ß":225,"µ":230,
  "±":241,"°":248,"·":250,"²":253,"€":63,
};
function toCp437(str) {
  const out = [];
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) { out.push(c); continue; }
    const mapped = CP437[ch];
    out.push(mapped == null ? 63 : mapped);   // 63 = "?"
  }
  return Buffer.from(out);
}

/* ── SIE field quoting ─────────────────────────────────────────────────────
 * Quotes only where needed, and escapes an embedded quote with a backslash as the
 * spec requires. A vendor called 5" Nails would otherwise end the field early. */
const fld = (v) => {
  const s = String(v ?? "");
  if (s === "") return '""';
  const needs = /[\s"{}]/.test(s);
  const esc = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return needs ? `"${esc}"` : esc;
};
const ymd = (d) => String(d).slice(0, 10).replace(/-/g, "");
/* Point decimal, max two places, no thousands separator. */
const amt = (n) => {
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};

/* ── BAS 2026, the subset a sole trader on kontantmetoden actually touches ── */
const ACC = {
  1930: "Företagskonto / affärskonto",
  2611: "Utgående moms på försäljning inom Sverige, 25 %",
  2621: "Utgående moms på försäljning inom Sverige, 12 %",
  2631: "Utgående moms på försäljning inom Sverige, 6 %",
  2614: "Utgående moms omvänd skattskyldighet, 25 %",
  2641: "Debiterad ingående moms",
  2645: "Beräknad ingående moms på förvärv från utlandet",
  3001: "Försäljning inom Sverige, 25 % moms",
  3002: "Försäljning inom Sverige, 12 % moms",
  3003: "Försäljning inom Sverige, 6 % moms",
  3231: "Försäljning av tjänster till annat EU-land",
  3305: "Försäljning av varor till annat EU-land",
  3540: "Faktureringsavgifter",
  4056: "Inköp av tjänster från annat EU-land, 25 %",
  4515: "Inköp av varor från annat EU-land, 25 %",
  4531: "Inköp av tjänster från land utanför EU",
  6991: "Övriga externa kostnader, avdragsgilla",
  6992: "Övriga externa kostnader, ej avdragsgilla",
};
const SALES_ACC = { 25: "3001", 12: "3002", 6: "3003" };
const OUT_VAT_ACC = { 25: "2611", 12: "2621", 6: "2631" };

export function buildSie({ settings, invoices, receipts, year, programVersion = "1.0" }) {
  const vers = [];
  const used = new Set(["1930"]);
  const warnings = [];
  /* Every source row must be accounted for: booked, or excluded with a stated
     reason. A silent drop in an accounting export is indistinguishable from
     a missing transaktion. */
  const excluded = [];
  /* YYYYMMDD is what the file wants; a human reading the report wants dashes. */
  const las = (v) => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;

  /* Ingående moms får dras av på förvärv i den momspliktiga verksamheten.
     Är registreringen daterad 2026-04-29 är avdrag på ett kvitto från februari
     felaktigt — om inte registreringen backdaterats. Bokföringen ändras inte
     på eget bevåg; den får bara inte passera obemärkt. */
  const regFrom = settings?.vat_registered_from ? ymd(settings.vat_registered_from) : null;
  const momsFore = [];

  const add = (acc, amount, text) => ({ acc: String(acc), amount, text });

  /* ── Sales. Booked when paid. ─────────────────────────────────────────── */
  let n = 0;
  for (const inv of invoices) {
    const invLabel = `${inv.invoice_number || String(inv.id).slice(0, 8)}`;
    if (!inv.paid_at) {
      excluded.push({ kind: "Faktura", label: invLabel, reason: inv.status === "cancelled"
        ? "makulerad — aldrig betald, ingen intäkt under kontantmetoden"
        : `obetald (status: ${inv.status || "okänd"}) — bokförs först vid betalning` });
      continue;
    }
    const d = ymd(inv.paid_at);
    if (!d.startsWith(String(year))) {
      excluded.push({ kind: "Faktura", label: invLabel, reason: `betald ${las(d)} — tillhör ett annat räkenskapsår` });
      continue;
    }

    /* Foreign-currency invoices only enter the books once converted — the same rule
       lib/moms.js applies. Guessing a rate here would put an invented number in
       someone else's accounting system. */
    const isSek = String(inv.currency || "SEK").toUpperCase() === "SEK";
    const gross = isSek ? Number(inv.total) : (inv.total_sek == null ? null : Number(inv.total_sek));
    const vat   = isSek ? Number(inv.vat_amount) : (inv.vat_sek == null ? null : Number(inv.vat_sek));
    if (gross == null || vat == null) {
      warnings.push(`Faktura ${inv.invoice_number || inv.id}: saknar SEK-omräkning, utelämnad ur filen.`);
      excluded.push({ kind: "Faktura", label: invLabel, reason: `${inv.currency} utan SEK-omräkning — kör backfill-fx`, allvarlig: true });
      continue;
    }
    const net = Math.round((gross - vat + Number.EPSILON) * 100) / 100;

    const trans = [add("1930", gross)];
    if (inv.reverse_charge) {
      const acc = inv.goods ? "3305" : "3231";
      trans.push(add(acc, -net));
      used.add(acc);
    } else {
      /* Split by rate when the frozen breakdown is there; otherwise infer one rate. */
      const rows = Array.isArray(inv.vat_breakdown) && inv.vat_breakdown.length
        ? inv.vat_breakdown
        : [{ rate: net ? Math.round((vat / net) * 100) : 25, net, vat }];
      for (const r of rows) {
        const rate = Number(r.rate);
        const sAcc = SALES_ACC[rate], vAcc = OUT_VAT_ACC[rate];
        if (!sAcc) { warnings.push(`Faktura ${inv.invoice_number}: momssats ${rate} % finns inte i BAS-mappningen.`); continue; }
        trans.push(add(sAcc, -Number(r.net)));
        used.add(sAcc);
        if (Number(r.vat)) { trans.push(add(vAcc, -Number(r.vat))); used.add(vAcc); }
      }
    }
    vers.push({
      series: "A", no: ++n, date: d,
      text: `Faktura ${inv.invoice_number || ""} ${inv.client_name || ""}`.trim(),
      trans,
    });
  }

  /* ── Purchases. Booked on the receipt date. ───────────────────────────── */
  for (const rc of receipts) {
    const rcLabel = `${rc.vendor || "Kvitto"} ${rc.receipt_date || ""}`.trim();
    if (rc.is_business === false) {
      excluded.push({ kind: "Kvitto", label: rcLabel, reason: "markerat som privat" });
      continue;
    }
    if (!rc.receipt_date) {
      excluded.push({ kind: "Kvitto", label: rcLabel, reason: "saknar datum — kan inte bokföras", allvarlig: true });
      continue;
    }
    const d = ymd(rc.receipt_date);
    if (!d.startsWith(String(year))) {
      excluded.push({ kind: "Kvitto", label: rcLabel, reason: `daterat ${las(d)} — tillhör ett annat räkenskapsår` });
      continue;
    }

    const isSek = String(rc.currency || "SEK").toUpperCase() === "SEK";
    const gross = isSek ? Number(rc.total) : (rc.total_sek == null ? null : Number(rc.total_sek));
    const vat   = isSek ? Number(rc.vat_amount || 0) : (rc.vat_sek == null ? 0 : Number(rc.vat_sek));
    if (gross == null) {
      warnings.push(`Kvitto ${rc.vendor} ${rc.receipt_date}: saknar SEK-omräkning, utelämnat.`);
      excluded.push({ kind: "Kvitto", label: rcLabel, reason: `${rc.currency} utan SEK-omräkning — kör backfill-fx`, allvarlig: true });
      continue;
    }

    const share = rc.business_share == null ? 1 : Number(rc.business_share);
    const deductible = rc.is_deductible !== false;
    const costAcc = String(rc.bas_account || (deductible ? "6991" : "6992"));
    const trans = [];

    /* Omvänd betalningsskyldighet betyder att leverantören INTE debiterat moms.
       Står det ändå ett momsbelopp på raden motsäger de två varandra, och den
       gamla koden bokförde motsägelsen rakt av: verifikatet gick inte ihop med
       exakt momsbeloppet, och hela filen vägrade skrivas med ett "diff" som inte
       sa vad som var fel. Nu namnges raden i stället. */
    if ((rc.vat_treatment === "rc_eu" || rc.vat_treatment === "rc_non_eu") && vat > 0) {
      excluded.push({
        kind: "Kvitto", label: rcLabel, allvarlig: true,
        reason: `markerad som omvänd betalningsskyldighet men har ${vat.toFixed(2).replace(".", ",")} kr moms — ` +
          `de kan inte båda stämma. Debiterade leverantören moms är behandlingen ` +
          `"oss_non_ded" (utländsk moms, ej avdragsgill). Gjorde den inte det ska momsbeloppet vara 0.`,
      });
      continue;
    }

    switch (rc.vat_treatment) {
      case "rc_eu":
      case "rc_non_eu": {
        /* Reverse charge: no VAT was paid to the supplier. Output VAT is calculated
           and an equal input VAT deducted, so the pair nets to nothing. */
        const base = Math.round((gross - vat + Number.EPSILON) * 100) / 100;
        const out = Math.round((base * 0.25 + Number.EPSILON) * 100) / 100;
        const pAcc = rc.vat_treatment === "rc_eu" ? "4056" : "4531";
        trans.push(add(pAcc, base), add("1930", -gross));
        if (deductible && out) { trans.push(add("2614", -out), add("2645", out)); used.add("2614"); used.add("2645"); }
        used.add(pAcc);
        break;
      }
      case "domestic": {
        const claim = deductible ? Math.round((vat * share + Number.EPSILON) * 100) / 100 : 0;
        if (claim && regFrom && d < regFrom) {
          momsFore.push({ label: rcLabel, datum: las(d), belopp: claim });
        }
        const cost = Math.round((gross - claim + Number.EPSILON) * 100) / 100;
        trans.push(add(costAcc, cost));
        if (claim) { trans.push(add("2641", claim)); used.add("2641"); }
        trans.push(add("1930", -gross));
        used.add(costAcc);
        break;
      }
      default: {
        /* exempt, oss_non_ded, or untreated: no Swedish input VAT to reclaim, so the
           whole amount is a cost. Untreated rows are flagged rather than guessed at. */
        if (!rc.vat_treatment) warnings.push(`Kvitto ${rc.vendor} ${rc.receipt_date}: ingen momsbehandling satt — bokförs som kostnad utan momsavdrag.`);
        trans.push(add(costAcc, gross), add("1930", -gross));
        used.add(costAcc);
      }
    }

    vers.push({
      series: "A", no: ++n, date: d,
      text: `${rc.vendor || "Kvitto"}${rc.category ? " – " + rc.category : ""}`,
      trans,
    });
  }

  /* ── What actually landed where ───────────────────────────────────────── */
  const perAccount = {};
  for (const v of vers) {
    for (const t of v.trans) {
      const a = perAccount[t.acc] || { belopp: 0, antal: 0 };
      a.belopp = Math.round((a.belopp + t.amount + Number.EPSILON) * 100) / 100;
      a.antal += 1;
      perAccount[t.acc] = a;
    }
  }

  /* ── Double entry is not advisory ─────────────────────────────────────── */
  const unbalanced = [];
  for (const v of vers) {
    const sum = Math.round(v.trans.reduce((a, t) => a + t.amount, 0) * 100) / 100;
    if (sum !== 0) unbalanced.push({ ver: `${v.series}${v.no}`, date: v.date, text: v.text, diff: sum });
  }

  /* ── Render ───────────────────────────────────────────────────────────── */
  const orgnr = String(settings?.org_nr || settings?.personnummer || "").replace(/\D/g, "");
  const orgFormatted = orgnr.length === 12 ? `${orgnr.slice(2, 8)}-${orgnr.slice(8)}`
                     : orgnr.length === 10 ? `${orgnr.slice(0, 6)}-${orgnr.slice(6)}` : orgnr;

  const L = [];
  L.push(`#FLAGGA 0`);
  L.push(`#PROGRAM ${fld("Nordbok Studio")} ${fld(programVersion)}`);
  L.push(`#FORMAT PC8`);
  L.push(`#GEN ${ymd(new Date().toISOString())}`);
  L.push(`#SIETYP 4`);
  L.push(`#ORGNR ${fld(orgFormatted)}`);
  L.push(`#FNAMN ${fld(settings?.business_name || "")}`);
  if (settings?.address_street) {
    L.push(`#ADRESS ${fld("")} ${fld(settings.address_street)} ${fld(`${settings.address_zip || ""} ${settings.address_city || ""}`.trim())} ${fld(settings.contact_email || "")}`);
  }
  L.push(`#RAR 0 ${year}0101 ${year}1231`);
  L.push(`#KPTYP ${fld("BAS2014")}`);
  L.push(`#VALUTA SEK`);

  for (const acc of [...used].sort()) L.push(`#KONTO ${acc} ${fld(ACC[acc] || "Konto " + acc)}`);

  for (const v of vers) {
    L.push(`#VER ${v.series} ${v.no} ${v.date} ${fld(v.text)}`);
    L.push("{");
    for (const t of v.trans) L.push(`\t#TRANS ${t.acc} {} ${amt(t.amount)}`);
    L.push("}");
  }

  /* CRLF: the format predates Unix line endings and readers still expect them. */
  const text = L.join("\r\n") + "\r\n";
  return { text, vers, warnings, unbalanced, excluded, perAccount, momsFore, regFrom, accounts: [...used].sort() };
}

/* ── CLI ───────────────────────────────────────────────────────────────── */
const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--skriv");
  const yi = args.indexOf("--ar");
  const year = yi > -1 ? Number(args[yi + 1]) : new Date().getFullYear();

  const env = {};
  for (const line of (await readFile(new URL("../.env.local", import.meta.url), "utf8")).split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const [{ data: settings }, { data: invoices }, { data: receipts }] = await Promise.all([
    sb.from("studio_settings").select("*").limit(1).maybeSingle(),
    sb.from("studio_invoices").select("*, studio_clients(name)"),
    sb.from("studio_receipts").select("*"),
  ]);

  const res = buildSie({
    settings,
    invoices: (invoices || []).map((i) => ({ ...i, client_name: i.studio_clients?.name })),
    receipts: receipts || [],
    year,
  });

  const nInv = (invoices || []).length;
  const nRc = (receipts || []).length;

  console.log(`\nNordbök — SIE ${year}\n`);
  console.log(`  Källrader        ${nInv} fakturor · ${nRc} kvitton`);
  console.log(`  Verifikat        ${res.vers.length}`);
  console.log(`  Ej bokförda      ${res.excluded.length}`);
  console.log(`  Konton           ${res.accounts.length}`);
  console.log(`  Obalanserade     ${res.unbalanced.length}`);

  if (res.excluded.length) {
    console.log(`\n  Rader som inte kom med:`);
    for (const e of res.excluded) {
      console.log(`    ${e.allvarlig ? "✗" : "·"} ${e.kind} ${e.label} — ${e.reason}`);
    }
    const allvarliga = res.excluded.filter((e) => e.allvarlig).length;
    if (allvarliga) console.log(`\n  ${allvarliga} av dem borde ha kommit med. Åtgärda innan du lämnar filen vidare.`);
  }

  if (!res.regFrom) {
    console.log(`\n  ! Momsregistreringsdatum saknas i inställningarna. Kör migration 014.`);
    console.log(`    Utan det kan avdrag för ingående moms före registreringen inte upptäckas.`);
  } else if (res.momsFore.length) {
    const summa = res.momsFore.reduce((a, m) => a + m.belopp, 0);
    const reg = `${res.regFrom.slice(0, 4)}-${res.regFrom.slice(4, 6)}-${res.regFrom.slice(6, 8)}`;
    console.log(`\n  ✗ Ingående moms dragen på ${res.momsFore.length} kvitton daterade före`);
    console.log(`    momsregistreringen ${reg} — totalt ${summa.toFixed(2).replace(".", ",")} kr:`);
    for (const m of res.momsFore) console.log(`        ${m.datum}  ${m.label}  ${m.belopp.toFixed(2).replace(".", ",")} kr`);
    console.log(`    Kontrollera registerutdraget: "Registrerad för mervärdesskatt från och med".`);
    console.log(`      · Står det ett tidigare datum — rätta vat_registered_from i inställningarna.`);
    console.log(`      · Var verksamheten skattebefriad under omsättningsgränsen fram till dess —`);
    console.log(`        då finns ingen avdragsrätt alls för perioden. Sätt is_deductible = false.`);
    console.log(`      · Var det förvärv inför starten, gjorda för verksamheten — då är avdraget`);
    console.log(`        riktigt (startåret eller året före). Låt raderna stå.`);
  }

  const kontoRader = Object.entries(res.perAccount).sort((a, b) => a[0].localeCompare(b[0]));
  if (kontoRader.length) {
    console.log(`\n  Kontofördelning:`);
    for (const [acc, v] of kontoRader) {
      const belopp = v.belopp.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
      console.log(`    ${acc}  ${String(v.antal).padStart(3)} rad${v.antal === 1 ? "" : "er"}  ${belopp.padStart(14)} kr`);
    }
    const catchAll = (res.perAccount["6991"]?.antal || 0) + (res.perAccount["6992"]?.antal || 0);
    const kostnadsrader = kontoRader
      .filter(([a]) => a.startsWith("4") || a.startsWith("5") || a.startsWith("6") || a.startsWith("7"))
      .reduce((s, [, v]) => s + v.antal, 0);
    if (kostnadsrader && catchAll / kostnadsrader > 0.5) {
      console.log(`\n  ! ${catchAll} av ${kostnadsrader} kostnadsrader hamnar på 6991/6992 (övriga externa kostnader).`);
      console.log(`    Filen är korrekt men grovhuggen — sätt bas_account på kvittona för en`);
      console.log(`    resultaträkning som går att läsa.`);
    }
  }
  for (const u of res.unbalanced) console.log(`    ✗ ${u.ver} ${u.date} ${u.text} — diff ${u.diff}`);
  for (const w of res.warnings) console.log(`    ! ${w}`);

  if (res.unbalanced.length) {
    console.error(`\n✗ ${res.unbalanced.length} verifikat balanserar inte. Ingen fil skrevs.\n`);
    process.exit(2);
  }
  if (!WRITE) {
    console.log(`\n✓ Filen går att skapa. Kör med --skriv för att spara den.\n`);
    process.exit(0);
  }

  const dir = path.join(process.env.HOME || ".", "Nordbok-arkiv");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `nordbok-${year}.se`);
  const bytes = toCp437(res.text);
  await writeFile(file, bytes);
  console.log(`\n✓ ${file}`);
  console.log(`  ${bytes.length} byte · CP437 · SHA-256 ${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}\n`);
}
