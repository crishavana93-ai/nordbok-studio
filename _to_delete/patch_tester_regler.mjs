import { readFile, writeFile } from "node:fs/promises";

const F = "tests/skatt.test.mjs";
let s = await readFile(F, "utf8");
function sub(name, a, b) {
  const c = s.split(a).length - 1;
  if (c !== 1) { console.error(`FAIL ${name}: hittade ${c}`); process.exit(1); }
  s = s.replace(a, b);
}

sub("import",
`import { bedomAvdrag, REPRESENTATION } from "../lib/avdrag.js";`,
`import { bedomAvdrag, REPRESENTATION } from "../lib/avdrag.js";
import { granskaKvitto, sekMotvarde, RATTNINGSBARA } from "../lib/kvitto-regler.js";`);

const nya = [
  ``,
  `/* ── kvitto-regler: motsägelserna som annars upptäcks i SIE-exporten ──────── */`,
  `console.log('\\n── kvitto-regler ──');`,
  `const bas = { vendor: "Anthropic", receipt_date: "2026-08-21", total: 1244.53, currency: "SEK" };`,
  ``,
  `/* Den här raden låg fyra månader i databasen och fälldes först av SIE-exporten,`,
  `   med ett "diff" som inte sa vad som var fel. Nu ska den aldrig komma in. */`,
  `chk("rc_eu med moms avvisas",`,
  `    granskaKvitto({ ...bas, vat_treatment: "rc_eu", vat_amount: 243.38 }).fel.length > 0, true);`,
  `chk("rc_non_eu med moms avvisas",`,
  `    granskaKvitto({ ...bas, vat_treatment: "rc_non_eu", vat_amount: 243.38 }).fel.length > 0, true);`,
  `chk("rc_eu utan moms går igenom",`,
  `    granskaKvitto({ ...bas, vat_treatment: "rc_eu", vat_amount: 0 }).fel.length, 0);`,
  `chk("oss_non_ded utan moms avvisas",`,
  `    granskaKvitto({ ...bas, vat_treatment: "oss_non_ded", vat_amount: 0 }).fel.length > 0, true);`,
  `chk("oss_non_ded med moms går igenom",`,
  `    granskaKvitto({ ...bas, vat_treatment: "oss_non_ded", vat_amount: 243.38 }).fel.length, 0);`,
  ``,
  `chk("moms större än totalen avvisas",`,
  `    granskaKvitto({ ...bas, vat_treatment: "domestic", vat_amount: 2000 }).fel.length > 0, true);`,
  `chk("negativ moms avvisas",`,
  `    granskaKvitto({ ...bas, vat_treatment: "domestic", vat_amount: -5 }).fel.length > 0, true);`,
  `chk("okänd behandling avvisas",`,
  `    granskaKvitto({ ...bas, vat_treatment: "hittepå", vat_amount: 0 }).fel.length > 0, true);`,
  `chk("datum måste vara YYYY-MM-DD",`,
  `    granskaKvitto({ ...bas, receipt_date: "21/8 2026", vat_treatment: "exempt" }).fel.length > 0, true);`,
  `chk("andel utanför 0–1 avvisas",`,
  `    granskaKvitto({ ...bas, vat_treatment: "exempt", business_share: 1.5 }).fel.length > 0, true);`,
  ``,
  `/* is_deductible sattes tidigare på två ställen och hann gå isär. Den härleds nu. */`,
  `chk("oss_non_ded är inte avdragsgill",`,
  `    granskaKvitto({ ...bas, vat_treatment: "oss_non_ded", vat_amount: 243.38 }).rad.is_deductible, false);`,
  `chk("domestic är avdragsgill",`,
  `    granskaKvitto({ ...bas, vat_treatment: "domestic", vat_amount: 249 }).rad.is_deductible, true);`,
  ``,
  `/* En rad i främmande valuta får medvetet null, så att lib/moms.js rapporterar`,
  `   den som oomräknad i stället för att tyst räkna med ett gammalt SEK-belopp. */`,
  `chk("SEK räknas om till sig själv",`,
  `    sekMotvarde({ currency: "SEK", total: 178, vat_amount: 35.6 }), { total_sek: 178, vat_sek: 35.6 });`,
  `chk("EUR lämnas oomräknad",`,
  `    sekMotvarde({ currency: "EUR", total: 112.5, vat_amount: 0 }), { total_sek: null, vat_sek: null });`,
  ``,
  `/* Underlaget får aldrig gå att byta ut i efterhand — då bevisar hashen ingenting. */`,
  `chk("file_hash är inte rättningsbar", RATTNINGSBARA.includes("file_hash"), false);`,
  `chk("storage_path är inte rättningsbar", RATTNINGSBARA.includes("storage_path"), false);`,
  `chk("is_deductible sätts inte för hand", RATTNINGSBARA.includes("is_deductible"), false);`,
  ``,
  `console.log(\`\\n\${pass} passed, \${fail} failed\`);`,
].join("\n");

sub("nya-tester", "console.log(`\\n${pass} passed, ${fail} failed`);", nya);

await writeFile(F, s, "utf8");
console.log("tester tillagda");
