/* lib/laget.js — the three sentences at the top of Hem.
 *
 * Deterministic, not a language model: the home screen must say the same
 * thing every time for the same books, load in milliseconds, and never invent
 * a figure. It reads what the other engines computed (resultat, skatt, moms,
 * brief) and puts it into plain Swedish. The assistant page is where the
 * model talks; this is where the app does.
 */

import { money, daysPhrase } from "./format.js";

const kr = (n) => money(Math.round(Number(n) || 0), { decimals: 0 }).text;
const amt = (t) => `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(Math.abs(Number(t.amount) || 0))} ${t.currency || "SEK"}`;
/* SUMUP *CIGARR and CLASQUIN T.I. INTERCARGO are not how a person says a name. */
const namn = (t) => {
  const raw = String(t.description || "").split(" · ")[0].trim();
  if (raw !== raw.toUpperCase()) return raw;
  return raw.toLowerCase().replace(/(^|[\s.\-])([a-zåäö])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b([A-Z])\.([A-Z])\./g, "$1.$2.");
};

export { namn as vendorName };

export function laget({ resultat, skatt, kvar, moms, quarter, unmatchedOut = [], overdueInvoices = 0, year }) {
  const s = [];

  /* Sentence 1: the money. */
  if (resultat.intakter > 0) {
    s.push(`Du har fått in ${kr(resultat.intakter)} i år och lagt ${kr(resultat.kostnader)} på kostnader.`);
    if (resultat.overskott > 0) {
      s.push(`Av det som är kvar är cirka ${kr(skatt.total)} skatt, så räkna med ${kr(kvar)} som dina.`);
    } else {
      s.push(`Kostnaderna är större än intäkterna, så det finns inget överskott att skatta på ännu.`);
    }
  } else if (resultat.kostnader > 0) {
    s.push(`Inga betalda fakturor syns i appen för ${year} ännu, men ${kr(resultat.kostnader)} i kostnader. Har du fått betalt via Revolut-länkar behöver de läggas in som fakturor, annars ser året ut som en förlust.`);
  } else {
    s.push(`Appen har inga siffror för ${year} ännu. Lägg in ett kontoutdrag så börjar den räkna.`);
  }

  /* Sentence 2: moms. */
  const r49 = Number(moms?.rutor?.r49 || 0);
  const q = quarter;
  if (q) {
    s.push(r49 === 0
      ? `Momsen för ${q.label} står på noll just nu och ska lämnas senast ${q.deadline}.`
      : r49 < 0
        ? `Momsen för ${q.label} ger ${kr(-r49)} tillbaka. Lämna den senast ${q.deadline}, ${daysPhrase(q.daysLeft)}.`
        : `Momsen för ${q.label} är ${kr(r49)} att betala, senast ${q.deadline}, ${daysPhrase(q.daysLeft)}.`);
  }

  /* Sentence 3: the biggest hole. */
  if (unmatchedOut.length) {
    const big = unmatchedOut[0];
    const rest = unmatchedOut.length - 1;
    s.push(`${unmatchedOut.length === 1 ? "En betalning" : `${unmatchedOut.length} betalningar`} saknar kvitto eller faktura${rest > 0 ? `, den största ${namn(big)} på ${amt(big)}` : `: ${namn(big)}, ${amt(big)}`}. Utan underlag inget avdrag.`);
  } else if (overdueInvoices > 0) {
    s.push(`${overdueInvoices === 1 ? "En kund" : `${overdueInvoices} kunder`} har inte betalat i tid.`);
  }

  return s;
}
