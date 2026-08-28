/* ═════════════════════════════════════════════════════════════════════════════
   lib/handelser.js — vad som faktiskt har hänt, i ordning
   ─────────────────────────────────────────────────────────────────────────────
   Översikten visade nyckeltal och ett diagram: sant, men det svarar inte på
   "vad har jag gjort och vad händer nu". Den frågan besvaras av en tidslinje,
   och den fanns ingenstans i appen.

   Mönstret är lånat från Revolut och liknande — hemskärmen är en lista över
   händelser, inte en instrumentpanel. Två saker lånas INTE:

   1. Oändlig scroll utan gränser. Bokföring lever i månader, kvartal och
      räkenskapsår. En ström som ignorerar periodgränser döljer just det som
      betyder något, så raderna grupperas per månad.
   2. Färg som beröm. Grönt och rött betyder här pengar in och pengar ut —
      ingenting annat. Att fira att en siffra stiger hör inte hemma i ett
      program vars nästa skärm är en momsdeklaration.

   Rent räknande, inga databasanrop.
   ═════════════════════════════════════════════════════════════════════════════ */

const MANAD = [
  "januari", "februari", "mars", "april", "maj", "juni",
  "juli", "augusti", "september", "oktober", "november", "december",
];

const dag = (v) => String(v || "").slice(0, 10);

/** Belopp i kronor, eller null om raden inte är omräknad. */
function sek(rad, falt) {
  const val = String(rad.currency || "SEK").toUpperCase();
  if (val === "SEK") { const v = rad[falt]; return v == null ? null : Number(v); }
  const kol = { total: "total_sek", vat_amount: "vat_sek" }[falt];
  if (kol && rad[kol] != null) return Number(rad[kol]);
  if (rad.fx_rate && rad[falt] != null) return Number(rad[falt]) * Number(rad.fx_rate);
  return null;
}

/**
 * @param {object} p
 * @param {Array} [p.fakturor]
 * @param {Array} [p.kvitton]
 * @param {Array} [p.resor]
 * @param {Array} [p.momsPerioder]
 * @param {string} p.idag           "YYYY-MM-DD"
 * @param {number} [p.max=60]
 */
export function byggFlode({ fakturor = [], kvitton = [], resor = [], momsPerioder = [], idag, max = 60 }) {
  const h = [];

  for (const f of fakturor) {
    const belopp = sek(f, "total");
    const kund = f.client_name || f.studio_clients?.name || "";

    if (f.paid_at) {
      h.push({
        typ: "betalning", datum: dag(f.paid_at),
        rubrik: `Betalning · ${f.invoice_number || "faktura"}`,
        under: kund, belopp, riktning: "in", lank: f.id ? `/invoices/${f.id}` : null,
      });
    }
    if (f.status === "sent" || f.status === "overdue") {
      h.push({
        typ: "faktura", datum: dag(f.issue_date),
        rubrik: `Faktura skickad · ${f.invoice_number || ""}`.trim(),
        under: kund, belopp, riktning: "vantar", lank: f.id ? `/invoices/${f.id}` : null,
        /* Det som väntar på pengar ska synas som just det. */
        obetald: true, forfaller: dag(f.due_date) || null,
      });
    }
    if (f.status === "draft") {
      h.push({
        typ: "utkast", datum: dag(f.issue_date),
        rubrik: "Utkast", under: kund || "ingen kund vald",
        belopp, riktning: "ingen", lank: f.id ? `/invoices/${f.id}` : null,
      });
    }
  }

  for (const k of kvitton) {
    if (!k.receipt_date) continue;
    h.push({
      typ: "kvitto", datum: dag(k.receipt_date),
      rubrik: k.vendor || "Kvitto",
      under: k.category || "",
      belopp: sek(k, "total"), riktning: "ut",
      lank: "/receipts",
      privat: k.is_business === false,
    });
  }

  for (const r of resor) {
    if (!r.trip_date) continue;
    h.push({
      typ: "resa", datum: dag(r.trip_date),
      rubrik: r.purpose || "Resa",
      under: [r.from_address, r.to_address].filter(Boolean).join(" → "),
      belopp: r.deduction == null ? null : Number(r.deduction),
      riktning: "avdrag", lank: "/mileage",
    });
  }

  for (const m of momsPerioder) {
    if (!m.lamnad_at) continue;
    h.push({
      typ: "moms", datum: dag(m.lamnad_at),
      rubrik: `Momsdeklaration lämnad · ${m.period_key}`,
      under: "", belopp: m.belopp == null ? null : Number(m.belopp),
      riktning: Number(m.belopp) < 0 ? "in" : "ut", lank: "/moms",
    });
  }

  /* Nyast först. Vid samma datum går pengar före papper — betalningen är det
     som faktiskt hände den dagen. */
  const rang = { betalning: 0, moms: 1, kvitto: 2, faktura: 3, resa: 4, utkast: 5 };
  h.sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : (rang[a.typ] ?? 9) - (rang[b.typ] ?? 9)));

  const synliga = h.slice(0, max);

  /* Gruppera per månad. Periodgränsen är inte dekoration — den är den enhet
     bokföringen faktiskt räknas i. */
  const grupper = [];
  for (const post of synliga) {
    const nyckel = post.datum.slice(0, 7);
    let g = grupper.find((x) => x.nyckel === nyckel);
    if (!g) {
      const [ar, mm] = nyckel.split("-");
      g = { nyckel, etikett: `${MANAD[Number(mm) - 1] || nyckel} ${ar}`, poster: [], in: 0, ut: 0 };
      grupper.push(g);
    }
    g.poster.push(post);
    if (post.belopp != null) {
      /* Beloppet lagras med tecken (en momsåterbetalning är negativ), men
         riktningen bärs redan av `riktning`. Adderas tecknet också blir en
         återbetalning ett negativt "in", vilket ingen läser rätt. */
      const storlek = Math.abs(post.belopp);
      if (post.riktning === "in") g.in += storlek;
      else if (post.riktning === "ut") g.ut += storlek;
    }
  }
  for (const g of grupper) {
    g.in = Math.round(g.in * 100) / 100;
    g.ut = Math.round(g.ut * 100) / 100;
  }

  return {
    grupper,
    antal: h.length,
    fler: h.length > synliga.length,
    obetalda: h.filter((x) => x.obetald).length,
  };
}
