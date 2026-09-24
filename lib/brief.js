/* lib/brief.js — "what should I do this week", as rules, not vibes.
 *
 * Pure: no IO, no dates read from the clock except `today`, which is passed in.
 * Used by the weekly email (lib/digest.js) and the in-app /brief page, so both say
 * exactly the same thing.
 *
 * Two severities, as everywhere in the app (Law 05):
 *   atgarda — something is wrong or a deadline is close; blocks a clean return
 *   granska — worth a look; nothing breaks if it waits a week
 *
 * Every item says what to do in the imperative and links to where it is done.
 */

import { quartersOf } from "./moms.js";
import { isForwarder, progress } from "./frakt.js";

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const kr = (n) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

export function buildAdvice({ today = new Date(), bankTx = [], receipts = [], invoices = [], tasks = [], settings = null } = {}) {
  const out = [];
  const t0 = today.getTime();
  const days = (isoDate) => Math.ceil((new Date(isoDate + "T00:00:00Z").getTime() - t0) / DAY);

  /* 1. Moms: every quarter whose deadline is still ahead and within 45 days. That
        catches the quarter that just ENDED, which is the one actually due — the
        current quarter's deadline is months away. */
  const y = today.getUTCFullYear();
  for (const q of [...quartersOf(y - 1), ...quartersOf(y)]) {
    const d = days(q.deadline);
    if (d < 0 || d > 45 || q.end >= iso(today)) continue;
    out.push({
      sev: d <= 14 ? "atgarda" : "granska",
      title: `Lämna momsdeklarationen för ${q.label} senast ${q.deadline}`,
      detail: `${d} dagar kvar. Sen deklaration kostar 625 kr i förseningsavgift även om du ska få pengar tillbaka. Gäller om du inte redan lämnat den.`,
      href: `/moms?period=${q.key}`,
    });
  }

  /* 2. Money out with no evidence behind it. */
  const unmatched = bankTx.filter((t) => Number(t.amount) < 0 && !t.matched_receipt && !t.matched_invoice);
  if (unmatched.length) {
    const big = [...unmatched].sort((a, b) => Number(a.amount) - Number(b.amount)).slice(0, 5);
    const byCur = {};
    for (const t of unmatched) byCur[t.currency || "SEK"] = (byCur[t.currency || "SEK"] || 0) + Math.abs(Number(t.amount));
    out.push({
      sev: unmatched.length > 5 || big.some((t) => Math.abs(t.amount) >= 10000) ? "atgarda" : "granska",
      title: `${unmatched.length} utbetalningar saknar kvitto eller faktura`,
      detail: `Totalt ${Object.entries(byCur).map(([c, v]) => `${kr(v)} ${c}`).join(" + ")}. Utan underlag inget avdrag och ingen ingående moms. Största: ${big.map((t) => `${t.tx_date} ${String(t.description || "").slice(0, 32)} ${kr(t.amount)} ${t.currency || "SEK"}`).join("; ")}.`,
      href: "/bank",
    });
  }

  /* 2b. Freight/forwarder payments with an incomplete document checklist. */
  const frakt = bankTx.filter((t) => Number(t.amount) < 0 && (isForwarder(t.description) || String(t.category || "").startsWith("frakt:")))
    .map((t) => ({ t, p: progress(t) })).filter(({ p }) => p.saknas.length);
  if (frakt.length) {
    out.push({
      sev: "atgarda",
      title: frakt.length === 1 ? "En betalning till speditör saknar underlag" : `${frakt.length} betalningar till speditör saknar underlag`,
      detail: frakt.slice(0, 3).map(({ t, p }) => `${t.tx_date} ${String(t.description || "").slice(0, 28)}: saknar ${p.saknas.slice(0, 2).join(", ").toLowerCase()}${p.saknas.length > 2 ? " m.fl." : ""}`).join("; ").replace(/\.$/, "") + ".",
      href: "/bank",
    });
  }

  /* 3. Foreign-currency payments: the reverse-charge trap. */
  const foreign = unmatched.filter((t) => (t.currency || "SEK") !== "SEK");
  if (foreign.length) {
    out.push({
      sev: "granska",
      title: `${foreign.length} betalningar i utländsk valuta — kontrollera momsen`,
      detail: "Köper du tjänster från ett EU-land blir det omvänd moms (ruta 21, 30 och 48); utanför EU ruta 22. Leverantören ska ha ditt momsnummer på fakturan, annars får du utländsk moms som inte kan dras av i Sverige.",
      href: "/bank",
    });
  }

  /* 4. No statement imported lately — the rest of this list is then blind. */
  const lastImport = bankTx.reduce((m, t) => (t.imported_at && t.imported_at > m ? t.imported_at : m), "");
  if (!lastImport || t0 - new Date(lastImport).getTime() > 14 * DAY) {
    out.push({
      sev: "granska",
      title: "Lägg in senaste kontoutdraget",
      detail: lastImport
        ? `Senaste importen var ${lastImport.slice(0, 10)}. Revolut: Konto → Kontoutdrag → PDF, för både privat- och Pro-kontot om du betalar företagskostnader från båda.`
        : "Inget kontoutdrag importerat ännu. Utan det kan appen inte se vilka betalningar som saknar underlag.",
      href: "/bank",
    });
  }

  /* 5. Receipts waiting for a human. */
  const review = receipts.filter((r) => r.status === "review");
  if (review.length) {
    out.push({ sev: "granska", title: `${review.length} kvitton väntar på granskning`, detail: "Ett kvitto blir en verifikation först när du bekräftat beloppen.", href: "/receipts" });
  }

  /* 6. Customers who owe you. */
  const overdue = invoices.filter((i) => ["sent", "overdue"].includes(i.status) && i.due_date && days(i.due_date) < 0);
  if (overdue.length) {
    out.push({
      sev: "atgarda",
      title: `${overdue.length} fakturor är förfallna`,
      detail: `Totalt ${kr(overdue.reduce((a, i) => a + Number(i.total || 0), 0))} kr. Skicka en påminnelse — dröjsmålsränta är referensränta + 8 procentenheter.`,
      href: "/invoices",
    });
  }

  /* 7. Settings that make other things silently wrong. */
  if (settings && !settings.vat_number) {
    out.push({ sev: "atgarda", title: "Momsnumret saknas i Inställningar", detail: "Utan det räknas moms och fakturor fel.", href: "/settings" });
  }

  /* 8. Calendar-driven reminders. */
  const m = today.getUTCMonth();   // 0 = jan
  const dom = today.getUTCDate();
  const fDay = m === 0 || m === 7 ? 17 : 12;
  if (fDay - dom >= 0 && fDay - dom <= 7) {
    out.push({ sev: "granska", title: `F-skatten dras den ${fDay}:e`, detail: "Se till att skattekontot täcker månadens preliminärskatt.", href: "/deadlines" });
  }
  if (m === 9 || m === 10) {
    out.push({ sev: "granska", title: "Stäm av preliminärskatten inför årsskiftet", detail: "Går året mycket bättre eller sämre än du uppskattade? Lämna en ny preliminär inkomstdeklaration så slipper du kostnadsränta eller onödigt stor inbetalning.", href: "/finansiering" });
  }
  if (m === 11) {
    out.push({ sev: "granska", title: "Förbered bokslutet", detail: "Vid årsskiftet ska obetalda kund- och leverantörsfakturor bokas på rätt år, och lager inventeras. Samla alla underlag för året nu.", href: "/documents" });
  }
  if (m >= 2 && m <= 4) {
    out.push({ sev: m === 4 ? "atgarda" : "granska", title: "Inkomstdeklaration med NE-bilaga i maj", detail: "Deklarationen för förra året ska in i början av maj. Resultatet i appen är underlaget till NE-bilagan.", href: "/finansiering" });
  }

  /* 9. Open deadlines the user entered themselves, due within 14 days. */
  for (const t of tasks.filter((x) => x.status === "open" && x.due_at && new Date(x.due_at).getTime() - t0 <= 14 * DAY).slice(0, 5)) {
    out.push({ sev: t.priority === "high" ? "atgarda" : "granska", title: t.title, detail: `Senast ${String(t.due_at).slice(0, 10)}.`, href: "/deadlines" });
  }

  return out.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === "atgarda" ? -1 : 1));
}
