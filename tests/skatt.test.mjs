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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
