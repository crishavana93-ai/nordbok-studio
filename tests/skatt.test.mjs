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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
