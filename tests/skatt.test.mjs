/* tests/skatt.test.mjs — the first tests in this project.
 *
 *   npm test
 *
 * Plain Node, no framework, no build step: these must still run in five years when
 * the toolchain has moved on. Every case here is a bug that reached production and
 * cost something — a wrong momsdeklaration, or kronor that never came back.
 *
 * Add a case here BEFORE fixing the next one.
 */
import { computeMoms } from "../lib/moms.js";
import { computeInvoice, ROTRUT_2026 } from "../lib/swedish-tax.js";
import { validateInvoice, vatBreakdown } from "../lib/invoice-compliance.js";
import { ore, krona, momsOf } from "../lib/kronor.js";
import { dayStartUTC, periodBoundsUTC, withinPeriod } from "../lib/tid.js";
import { authorizeCron, MIN_SECRET_LENGTH } from "../lib/cron-auth.js";
import { pathPolicy } from "../lib/path-policy.js";
import { beraknaSkatt, grundavdrag2026, SKATT_2026 } from "../lib/skatt-2026.js";
import { beraknaResultat } from "../lib/resultat.js";
import { paskdagen, arBankdag, nastaBankdag } from "../lib/helgdagar.js";
import { momsStatus, deadlineForKvartal, deadlineFor, kvartal, manad, helar, nastaPeriod } from "../lib/moms-status.js";
let pass=0, fail=0;
const chk=(n,got,want)=>{const ok=JSON.stringify(got)===JSON.stringify(want);console.log(ok?'  PASS':'  FAIL',n,ok?'':`\n      got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);ok?pass++:fail++;};

console.log('\n── moms: EUR invoice, net €1000 / moms €250, rate 11.20 ──');
const eur={paid_at:'2026-05-02',invoice_number:'2026-0009',currency:'EUR',subtotal:1000,vat_amount:250,total:1250,total_sek:14000,vat_sek:2800};
let m=computeMoms({invoices:[eur],receipts:[]});
chk('ruta 05 = net in SEK', m.rutor.r05, 11200);
chk('ruta 10 = moms in SEK', m.rutor.r10, 2800);
chk('ruta 49 = to pay',      m.rutor.r49, 2800);
chk('not flagged unconverted', m.unconverted.length, 0);

console.log('── same invoice in SEK, must be identical ──');
const sek={paid_at:'2026-05-02',invoice_number:'2026-0010',currency:'SEK',subtotal:11200,vat_amount:2800,total:14000};
let m2=computeMoms({invoices:[sek],receipts:[]});
chk('ruta 05 matches EUR path', m2.rutor.r05, m.rutor.r05);
chk('ruta 10 matches EUR path', m2.rutor.r10, m.rutor.r10);

console.log('── unconverted EUR invoice must BLOCK, not silently zero ──');
const bad={paid_at:'2026-05-02',invoice_number:'2026-0011',currency:'EUR',subtotal:1000,vat_amount:250,total:1250};
let m3=computeMoms({invoices:[bad],receipts:[]});
chk('lands in unconverted', m3.unconverted.length, 1);
chk('fileReady false',      m3.fileReady, false);
chk('nothing invented in 05', m3.rutor.r05, 0);

console.log('── null amounts must not become 0 kr silently ──');
const nul={paid_at:'2026-05-02',invoice_number:'2026-0012',currency:'SEK',subtotal:null,vat_amount:null,total:12500};
chk('flagged, not zeroed', computeMoms({invoices:[nul],receipts:[]}).unconverted.length, 1);

console.log('── ROT/RUT rates ──');
chk('ROT_RATE', ROTRUT_2026.ROT_RATE, 0.30);
chk('RUT_RATE', ROTRUT_2026.RUT_RATE, 0.50);
const line=(price,hours)=>({description:'Arbete',quantity:1,unit_price:price,vat_rate:25,rot_rut_hours:hours});
const rot=computeInvoice([line(80000,100)],{rot_rut_type:'ROT'});
chk('ROT on 100 000 inkl moms = 30 000', rot.rot_amount, 30000);
const rut=computeInvoice([line(80000,100)],{rot_rut_type:'RUT'});
chk('RUT on 100 000 inkl moms = 50 000', rut.rut_amount, 50000);

console.log('── the annual ceiling is per customer per year, not per invoice ──');
const big=computeInvoice([line(400000,300)],{rot_rut_type:'ROT'});
chk('rot capped at 50 000', big.rot_amount, 50000);
chk('shortfall reported', big.rot_rut_capped?.shortfall, 100000);
const used=computeInvoice([line(80000,100)],{rot_rut_type:'ROT',rotRutUsedThisYear:{rot:40000,rut:0}});
chk('only 10 000 left of the rot ceiling', used.rot_amount, 10000);
const shared=computeInvoice([line(80000,100)],{rot_rut_type:'RUT',rotRutUsedThisYear:{rot:50000,rut:20000}});
chk('combined 75k ceiling binds rut', shared.rut_amount, 5000);
chk('reason names the combined cap', shared.rot_rut_capped?.reason, 'combined_75k');

console.log("\n── one engine: the draft and the send route must agree ──");
/* Each of these produced a permanent 422 before the engines were merged. */
const seller = { business_name:"Turquino Studios", address_street:"Bredåkersvägen 7", address_city:"Malmö",
                 personnummer:"199309199090", vat_number:"SE930919909001", bankgiro:"123-4567" };
const buyer  = { name:"Scandic Ventures", address_street:"Ystadsgatan 6", address_city:"Malmö", country_code:"SE" };

function agrees(label, items, opts = {}) {
  const drafted = computeInvoice(items, opts);
  const sent    = vatBreakdown(items, { reverse_charge: opts.reverse_charge });
  chk(`${label} · subtotal`, drafted.subtotal, sent.subtotal);
  chk(`${label} · moms`,     drafted.vat_amount, sent.vatTotal);
  const v = validateInvoice({
    invoice: { ...drafted, invoice_number:"2026-0100", issue_date:"2026-08-24", due_date:"2026-09-23",
               currency:"SEK", reverse_charge: opts.reverse_charge || false },
    client: buyer, settings: seller, items,
  });
  const totalsErr = v.errors.filter((e) => e.includes("stämmer inte med raderna"));
  chk(`${label} · gate lets it through`, totalsErr, []);
}

agrees("40 konsulttimmar à 1 187,50",
  Array.from({length:40},(_,i)=>({description:`Timme ${i+1}`,quantity:1,unit_price:1187.50,vat_rate:25})));

agrees("10 annonsplatser à 1 249,90 @ 6 %",
  Array.from({length:10},(_,i)=>({description:`Annons ${i+1}`,quantity:1,unit_price:1249.90,vat_rate:6})));

agrees("byggmoms, omvänd betalningsskyldighet",
  [{description:"Byggarbete",quantity:120,unit:"tim",unit_price:750,vat_rate:25}], { reverse_charge:true });

agrees("blandad moms: tidning 6 % + tillbehör 25 %",
  [{description:"Tidning",quantity:200,unit_price:49.90,vat_rate:6},
   {description:"Tillbehör",quantity:12,unit_price:349.50,vat_rate:25}]);

console.log("\n── reverse charge really is zero, not 25 % ──");
chk("moms = 0", computeInvoice([{description:"x",quantity:120,unit_price:750,vat_rate:25}],{reverse_charge:true}).vat_amount, 0);
chk("total = net", computeInvoice([{description:"x",quantity:120,unit_price:750,vat_rate:25}],{reverse_charge:true}).total, 90000);

console.log("\n── öre rounding (four broken copies replaced) ──");
chk("8,54 @ 25 % = 2,14",  momsOf(8.54, 25), 2.14);
chk("50,66 × 0,75 = 38,00", ore(50.66 * 0.75), 38);
chk("negatives symmetric",  ore(-2.135), -2.14);
chk("whole kronor for ruta", krona(213.74), 214);

console.log("\n── quarter boundaries in Stockholm time ──");
/* Every one of these payments used to fall out of BOTH quarters, or into the wrong one. */
chk("1 Jan starts at 31 Dec 23:00Z (CET)",  dayStartUTC("2026-01-01"), "2025-12-31T23:00:00.000Z");
chk("1 Jul starts at 30 Jun 22:00Z (CEST)", dayStartUTC("2026-07-01"), "2026-06-30T22:00:00.000Z");

const Q1 = ["2026-01-01", "2026-03-31"], Q2 = ["2026-04-01", "2026-06-30"];
chk("31 mar 14:32 Sthlm is Q1", withinPeriod("2026-03-31T12:32:00.000Z", ...Q1), true);
chk("31 mar 14:32 Sthlm is not Q2", withinPeriod("2026-03-31T12:32:00.000Z", ...Q2), false);
chk("31 mar 23:59 Sthlm is still Q1", withinPeriod("2026-03-31T21:59:00.000Z", ...Q1), true);
chk("1 apr 00:30 Sthlm is Q2, not Q1", withinPeriod("2026-03-31T22:30:00.000Z", ...Q1), false);
chk("1 apr 00:30 Sthlm is Q2", withinPeriod("2026-03-31T22:30:00.000Z", ...Q2), true);

/* No gaps, no overlaps, across the whole Swedish year. */
const QS = [Q1, Q2, ["2026-07-01","2026-09-30"], ["2026-10-01","2026-12-31"]];
let gaps = 0, overlaps = 0;
for (let t = new Date(dayStartUTC("2026-01-01")).getTime();
         t < new Date(dayStartUTC("2027-01-01")).getTime(); t += 37 * 60 * 1000) {
  const hits = QS.filter((q) => withinPeriod(new Date(t).toISOString(), ...q)).length;
  if (hits === 0) gaps++;
  if (hits > 1) overlaps++;
}
chk("no instant falls between quarters", gaps, 0);
chk("no instant falls in two quarters", overlaps, 0);


/* ── cron-vakten ────────────────────────────────────────────────────────────
   Den gamla vakten lät requesten passera när CRON_SECRET saknades. Rutten kör
   som service_role över samtliga användare, så en bortglömd miljövariabel gjorde
   ett internt jobb till en anonym endpoint. Testet finns för att ingen ska
   återinföra det mönstret. */
console.log("\n── cron-vakten: felar stängt ──");
const REQ = (h) => ({ headers: { get: (n) => (n.toLowerCase() === "authorization" ? h : null) } });
const HEM = "x".repeat(43);
chk("utan CRON_SECRET: nekas",           authorizeCron(REQ(`Bearer ${HEM}`), undefined).ok, false);
chk("utan CRON_SECRET: 503, inte 401",   authorizeCron(REQ(`Bearer ${HEM}`), undefined).status, 503);
chk("tom CRON_SECRET: nekas",            authorizeCron(REQ("Bearer "), "").ok, false);
chk("för kort CRON_SECRET: 503",         authorizeCron(REQ("Bearer kort"), "kort").status, 503);
chk(`${MIN_SECRET_LENGTH} tecken duger`, authorizeCron(REQ("Bearer " + "c".repeat(MIN_SECRET_LENGTH)), "c".repeat(MIN_SECRET_LENGTH)).ok, true);
chk("ett tecken kortare nekas",          authorizeCron(REQ("Bearer " + "c".repeat(MIN_SECRET_LENGTH - 1)), "c".repeat(MIN_SECRET_LENGTH - 1)).status, 503);
chk("rätt header släpps igenom",         authorizeCron(REQ(`Bearer ${HEM}`), HEM).ok, true);
chk("fel header: 401",                   authorizeCron(REQ("Bearer " + "y".repeat(43)), HEM).status, 401);
chk("ingen header: 401",                 authorizeCron(REQ(null), HEM).status, 401);
chk("prefix av hemligheten: 401",        authorizeCron(REQ("Bearer " + "x".repeat(42)), HEM).status, 401);
chk("saknat ord Bearer: 401",            authorizeCron(REQ(HEM), HEM).status, 401);
chk("trasig request kraschar inte",      authorizeCron(undefined, HEM).status, 401);


/* ── middleware: vilka vägar får omdirigeras ────────────────────────────────
   Middlewaren omdirigerade varje /api-anrop utan sessionskaka till /login.
   Vercels cron har ingen sessionskaka, så jobben studsade på dörren med 307
   och kördes aldrig. Samma omdirigering gav fetch() en HTML-sida i stället för
   JSON — det är där \"Unexpected token <\" kom ifrån. */
console.log("\n── middleware: /api omdirigeras aldrig ──");
chk("cron/digest sköter sig själv",   pathPolicy("/api/cron/digest"), "self-guarded");
chk("cron/push-due sköter sig själv", pathPolicy("/api/cron/push-due"), "self-guarded");
chk("invoices/send sköter sig själv", pathPolicy("/api/invoices/send"), "self-guarded");
chk("api/auth är öppen",              pathPolicy("/api/auth/callback"), "public");
chk("/api/authz är INTE api/auth",    pathPolicy("/api/authz/secret"), "self-guarded");
chk("startsidan är öppen",            pathPolicy("/"), "public");
chk("/login är öppen",                pathPolicy("/login"), "public");
chk("/loginsomething är skyddad",     pathPolicy("/loginsomething"), "protected");
chk("/dashboard är skyddad",          pathPolicy("/dashboard"), "protected");
chk("/settings är skyddad",           pathPolicy("/settings"), "protected");
chk("tom väg är skyddad",             pathPolicy(""), "protected");


/* ── grundavdrag 2026 mot Skatteverkets publicerade punkter ───────────────── */
console.log("\n── grundavdrag 2026 ──");
for (const [ink, vantat] of [[25100,25100],[83500,30100],[133500,40100],[161000,45600],
                             [184900,45600],[234000,40600],[340000,30000],[440000,20000],
                             [466000,17400],[900000,17400]]) {
  chk(`${ink} kr ger ${vantat} kr`, grundavdrag2026(ink), vantat);
}
chk("aldrig under golvet 17 400", grundavdrag2026(5e6) >= 17400, true);

/* ── egenavgifter: rätt bas, rätt underlag, nedsättning ───────────────────── */
console.log("\n── skatt 2026: överskott 300 000 kr ──");
const sk = beraknaSkatt(300000, { kommunalskatt: 0.3242 });
chk("schablonavdrag = 25 % AV ÖVERSKOTTET", sk.schablonavdrag, 75000);
chk("avgiftsunderlag = överskott - schablon", sk.avgiftsunderlag, 225000);
chk("nedsättning 7,5 % takad vid 15 000", sk.nedsattning, 15000);
chk("egenavgifter", sk.egenavgifter, Math.round(225000 * 0.2897 - 15000));
chk("grundavdrag vid 225 000", sk.grundavdrag, 41500);
chk("ingen statlig skatt vid 300 000", sk.statligskatt, 0);
chk("totalen understiger gamla 156 900", sk.total_skatt < 156900, true);
chk("jobbskatteavdraget flaggas som ej medräknat", sk.jobbskatteavdrag_ej_medraknat, true);
chk("reducerad avgift: schablon 10 %", beraknaSkatt(300000,{reduceradAvgift:true}).schablonavdrag, 30000);
chk("reducerad avgift: ingen nedsättning", beraknaSkatt(300000,{reduceradAvgift:true}).nedsattning, 0);
chk("litet överskott: ingen nedsättning", beraknaSkatt(20000).nedsattning, 0);
chk("noll in, noll ut", beraknaSkatt(0).total_skatt, 0);
chk("negativt in, noll ut", beraknaSkatt(-5000).total_skatt, 0);

/* Nedsättningen har en verklig tröskel vid 40 000 kr underlag: precis över den
   faller avgiften med 3 000 kr. Det är lagens trappsteg, inte ett räknefel —
   testet finns för att ingen ska "jämna ut" det. */
chk("trappsteget vid underlag 40 000 finns",
    beraknaSkatt(53400).total_skatt < beraknaSkatt(53300).total_skatt, true);
let ejMonoton = 0, forra = -1;
for (let v = 54000; v <= 1200000; v += 500) { const t = beraknaSkatt(v).total_skatt; if (t < forra) ejMonoton++; forra = t; }
chk("ovanför trappsteget är skatten monoton", ejMonoton, 0);

/* ── överskottet: kontantmetoden, netto, rätt år ──────────────────────────── */
console.log("\n── resultat: bara betalt är intäkt ──");
const RES = beraknaResultat({
  invoices: [
    { invoice_number: "2026-0002", status: "sent", paid_at: null, currency: "SEK", subtotal: 10000 },
    { invoice_number: "2026-0009", status: "cancelled", paid_at: "2026-06-01", currency: "SEK", subtotal: 9999 },
    { invoice_number: "2025-0001", status: "paid", paid_at: "2025-06-01", currency: "SEK", subtotal: 7777 },
    { invoice_number: "2026-0004", status: "paid", paid_at: "2026-06-01", currency: "SEK", subtotal: 5000 },
  ],
  receipts: [
    { vendor: "Telia", receipt_date: "2026-03-01", currency: "SEK", total: 1250, vat_amount: 250, vat_treatment: "domestic" },
    { vendor: "Gammalt", receipt_date: "2025-11-01", currency: "SEK", total: 600, vat_amount: 120, vat_treatment: "domestic" },
    { vendor: "Privat", receipt_date: "2026-03-02", currency: "SEK", total: 900, vat_amount: 180, is_business: false },
  ],
  trips: [{ trip_date: "2026-02-01", deduction: 250 }, { trip_date: "2025-02-01", deduction: 999 }],
  year: 2026,
});
chk("obetald faktura är inte intäkt", RES.intakter, 5000);
chk("makulerad räknas inte", RES.intakter < 9999, true);
chk("förra årets faktura räknas inte", RES.intakter < 7777, true);
chk("kostnad netto efter avdragen moms", RES.kostnader, 1000);
chk("förra årets kvitto räknas inte", RES.kostnader, 1000);
chk("privat kvitto räknas inte", RES.kostnader, 1000);
chk("milersättning bara i år", RES.milersattning, 250);
chk("överskott", RES.overskott, 3750);
chk("tre obetalda fakturor ger noll överskott",
    beraknaResultat({ invoices: [{ status: "sent", paid_at: null, currency: "SEK", subtotal: 99999 }], year: 2026 }).overskott, 0);
chk("ej momsregistrerad: momsen är en kostnad",
    beraknaResultat({ receipts: [{ receipt_date: "2026-03-01", currency: "SEK", total: 1250, vat_amount: 250, vat_treatment: "domestic" }], year: 2026, momsregistrerad: false }).kostnader, 1250);


/* ── bankdagar: en deadline på en helgdag flyttas fram ─────────────────────── */
console.log("\n── helgdagar och bankdagar ──");
chk("påskdagen 2025", paskdagen(2025), "2025-04-20");
chk("påskdagen 2026", paskdagen(2026), "2026-04-05");
chk("påskdagen 2027", paskdagen(2027), "2027-03-28");
chk("17 aug 2026 är bankdag", arBankdag("2026-08-17"), true);
chk("1 maj är det inte", arBankdag("2026-05-01"), false);
chk("Kristi himmelsfärd 2026 är det inte", arBankdag("2026-05-14"), false);
chk("midsommarafton 2026 är det inte", arBankdag("2026-06-19"), false);
chk("lördag flyttas till måndag", nastaBankdag("2026-08-15"), "2026-08-17");
chk("juldagen flyttas till 28 dec", nastaBankdag("2026-12-25"), "2026-12-28");

/* ── momsdeklarationens deadlines ──────────────────────────────────────────── */
console.log("\n── momsdeklaration: deadlines ──");
chk("Q1 2026 senast 12 maj", deadlineForKvartal(2026, 1), "2026-05-12");
chk("Q2 2026 senast 17 augusti", deadlineForKvartal(2026, 2), "2026-08-17");
chk("Q3 2026 senast 12 november", deadlineForKvartal(2026, 3), "2026-11-12");
chk("Q4 2026 senast 12 februari 2027", deadlineForKvartal(2026, 4), "2027-02-12");
chk("Q4 2027: 12 feb är lördag, flyttas", deadlineForKvartal(2027, 4), "2028-02-14");
chk("Q2 slutar 30 juni", kvartal(2026, 2).end, "2026-06-30");

/* Den missade deklarationen som föranledde hela filen: registrerad 2026-04-29,
   Q2 skulle ha lämnats senast 17 augusti, och den 24:e var ingenting lämnat. */
console.log("\n── momsdeklaration: status ──");
const MS = momsStatus({ registreradFrom: "2026-04-29", idag: "2026-08-24", periodTyp: "kvartal", lamnade: [] });
chk("första perioden är Q2 2026", MS.perioder[0].key, "2026-Q2");
chk("Q2 är försenad", MS.perioder[0].status, "försenad");
chk("sju dagar sen", MS.perioder[0].dagar_forsenad, 7);
chk("förseningsavgift 625 kr", MS.perioder[0].forseningsavgift, 625);
chk("Q3 pågår fortfarande", MS.perioder[1].status, "pågående");
chk("en försenad period", MS.forsenade.length, 1);
chk("lämnad period är inte försenad",
    momsStatus({ registreradFrom: "2026-04-29", idag: "2026-08-24", periodTyp: "kvartal",
                 lamnade: [{ period_key: "2026-Q2", lamnad_at: "2026-08-14T10:00:00Z" }] }).forsenade.length, 0);
chk("på deadlinedagen är man i tid", momsStatus({ registreradFrom: "2026-04-29", idag: "2026-08-17", periodTyp: "kvartal" }).forsenade.length, 0);
chk("dagen efter är man sen", momsStatus({ registreradFrom: "2026-04-29", idag: "2026-08-18", periodTyp: "kvartal" }).forsenade.length, 1);
chk("utan registreringsdatum: ingen gissning", momsStatus({ registreradFrom: null, idag: "2026-08-24", periodTyp: "kvartal" }).saknarRegistreringsdatum, true);
chk("avregistrering avslutar serien",
    momsStatus({ registreradFrom: "2026-01-01", avregistreradFrom: "2026-04-01", idag: "2026-12-01", periodTyp: "kvartal" }).perioder.length, 2);


/* ── redovisningsperioden avgör allt ───────────────────────────────────────
   Samma verksamhet, samma dag, samma data — tre olika besked beroende på
   vilken period Skatteverket satt. Därför gissas den aldrig. */
console.log("\n── redovisningsperiod: månad, kvartal, helår ──");
chk("månad jan 2026 → 12 mars", deadlineFor(manad(2026, 1)), "2026-03-12");
chk("månad jun 2026 → 17 augusti", deadlineFor(manad(2026, 6)), "2026-08-17");
chk("månad nov 2026 → 18 jan 2027 (17:e söndag)", deadlineFor(manad(2026, 11)), "2027-01-18");
chk("månad ≥40 Mkr: jan → 26 februari", deadlineFor(manad(2026, 1), { storOmsattning: true }), "2026-02-26");
chk("månad ≥40 Mkr: mars → 27 april (26:e söndag)", deadlineFor(manad(2026, 3), { storOmsattning: true }), "2026-04-27");
chk("helår utan EU-handel → 12 maj året efter", deadlineFor(helar(2026)), "2027-05-12");
chk("helår med EU-handel → 26 februari", deadlineFor(helar(2026), { euHandel: true }), "2027-02-26");
chk("februari skottår", manad(2028, 2).end, "2028-02-29");
chk("nästa efter december", nastaPeriod(manad(2026, 12)).key, "2027-01");
chk("nästa efter Q4", nastaPeriod(kvartal(2026, 4)).key, "2027-Q1");

const BAS = { registreradFrom: "2026-04-29", idag: "2026-08-24", lamnade: [] };
chk("kvartal: en försenad", momsStatus({ ...BAS, periodTyp: "kvartal" }).forsenade.length, 1);
chk("helår: ingen försenad", momsStatus({ ...BAS, periodTyp: "helar" }).forsenade.length, 0);
chk("månad: tre försenade", momsStatus({ ...BAS, periodTyp: "manad" }).forsenade.map((p) => p.key), ["2026-04", "2026-05", "2026-06"]);
chk("utan periodtyp: ingen varning", momsStatus({ ...BAS }).saknarPeriodTyp, true);
chk("utan periodtyp: noll perioder", momsStatus({ ...BAS }).perioder.length, 0);
chk("okänd periodtyp fångas", momsStatus({ ...BAS, periodTyp: "vecka" }).okandPeriodTyp, "vecka");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
