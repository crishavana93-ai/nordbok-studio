/* ═════════════════════════════════════════════════════════════════════════════
   lib/resultat.js — överskottet av näringsverksamheten, räknat en gång
   ─────────────────────────────────────────────────────────────────────────────
   lib/digest.js och app/api/assistant/route.js räknade var för sig så här:

     const revenue = inv.reduce((a, i) => a + Number(i.subtotal || 0), 0);
     const sumExpenses = rec.filter(r => r.is_business && r.is_deductible)
                            .reduce((a, r) => a + Number(r.total || 0), 0);
     const profit = revenue - sumExpenses - tripDed;

   Fyra fel i tre rader:

   1. INTÄKTEN RÄKNAS PÅ ALLA FAKTUROR. Utkast, makulerade och obetalda med.
      Under kontantmetoden uppstår intäkten när betalningen kommer, ingen
      annanstans. Just nu har du tre obetalda fakturor och noll intäkt — men de
      här raderna påstår att du tjänat pengar och lägger skatt på dem.

   2. KOSTNADEN RÄKNAS BRUTTO. `total` är inklusive moms. Är du
      momsregistrerad får du tillbaka ingående moms, så den är ingen kostnad.
      Att dra av bruttot överdriver kostnaden och underskattar skatten.

   3. INGEN PERIOD. Alla rader någonsin räknas, oavsett räkenskapsår. Dina
      fjorton kvitton från 2025 låg med i 2026 års vinst.

   4. VALUTA IGNORERAS. En faktura i EUR adderades som om beloppet vore kronor.

   Härifrån räknas det på ett ställe, med samma regler som SIE-exporten:
   intäkt när den betalas, kostnad netto efter avdragen moms, allt inom året,
   allt i kronor.
   ═════════════════════════════════════════════════════════════════════════════ */

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const ar = (d) => String(d || "").slice(0, 4);

/** Belopp i kronor, eller null om raden är i främmande valuta utan omräkning. */
function sek(row, field) {
  const cur = String(row.currency || "SEK").toUpperCase();
  if (cur === "SEK") {
    const v = row[field];
    return v == null ? null : Number(v);
  }
  const col = { total: "total_sek", vat_amount: "vat_sek" }[field];
  if (col && row[col] != null) return Number(row[col]);
  if (field === "subtotal") {
    const t = sek(row, "total"), v = sek(row, "vat_amount");
    return t == null || v == null ? null : r2(t - v);
  }
  if (row.fx_rate && row[field] != null) return r2(Number(row[field]) * Number(row.fx_rate));
  return null;
}

/**
 * @param {object} p
 * @param {Array}  p.invoices
 * @param {Array}  p.receipts
 * @param {Array}  [p.trips]        körjournalrader med .deduction
 * @param {number} p.year
 * @param {boolean} [p.momsregistrerad=true]  false ⇒ ingående moms är en kostnad
 */
export function beraknaResultat({ invoices = [], receipts = [], trips = [], year, momsregistrerad = true }) {
  const y = String(year || new Date().getFullYear());
  const oraknade = [];

  /* ── Intäkter: kontantmetoden. Betald, i år, netto. ──────────────────── */
  let intakter = 0;
  for (const inv of invoices) {
    if (!inv.paid_at) continue;                       // obetald ⇒ ingen intäkt än
    if (String(inv.status) === "cancelled") continue; // makulerad betalas inte
    if (ar(inv.paid_at) !== y) continue;
    const netto = sek(inv, "subtotal");
    if (netto == null) { oraknade.push(`Faktura ${inv.invoice_number || inv.id}: ${inv.currency} utan omräkning`); continue; }
    intakter = r2(intakter + netto);
  }

  /* ── Kostnader: netto efter den moms som faktiskt får dras av. ───────── */
  let kostnader = 0;
  for (const rc of receipts) {
    if (rc.is_business === false) continue;
    if (rc.is_deductible === false) continue;
    if (!rc.receipt_date || ar(rc.receipt_date) !== y) continue;
    const brutto = sek(rc, "total");
    if (brutto == null) { oraknade.push(`Kvitto ${rc.vendor || "?"} ${rc.receipt_date}: ${rc.currency} utan omräkning`); continue; }

    const andel = rc.business_share == null ? 1 : Number(rc.business_share);
    /* Avdragen moms är ingen kostnad. Omvänd skattskyldighet och OSS ger
       ingen svensk ingående moms att dra, så där är hela beloppet kostnad. */
    const drarMoms = momsregistrerad && (rc.vat_treatment === "domestic" || rc.vat_treatment == null);
    const moms = drarMoms ? (sek(rc, "vat_amount") || 0) * andel : 0;
    kostnader = r2(kostnader + (brutto * andel - moms));
  }

  /* ── Milersättning enligt körjournalen. ──────────────────────────────── */
  let milersattning = 0;
  for (const t of trips) {
    if (t.is_business === false) continue;
    if (t.trip_date && ar(t.trip_date) !== y) continue;
    milersattning = r2(milersattning + Number(t.deduction || 0));
  }

  const overskott = r2(intakter - kostnader - milersattning);

  return {
    ar: Number(y),
    intakter,
    kostnader: r2(kostnader),
    milersattning,
    overskott,
    /* Rader som inte gick att räkna på — tystnad här vore samma fel som förut. */
    oraknade,
  };
}
