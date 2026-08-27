/* ═════════════════════════════════════════════════════════════════════════════
   lib/avstamning.js — kopplar banktransaktioner till kvitton och fakturor
   ─────────────────────────────────────────────────────────────────────────────
   studio_bank_tx har haft kolumnerna matched_receipt och matched_invoice sedan
   första migrationen, och ingenting har någonsin satt dem. Bankvyn skrev rakt ut
   att "matchning inte är byggd ännu".

   Det är den saknade halvan av bokföringen. Bokföringslagen kräver en
   verifikation bakom varje affärshändelse; kontoutdraget är listan över vad som
   faktiskt hänt. En transaktion utan underlag är ett hål, och hålet syns bara om
   någon ställer de två listorna bredvid varandra.

   Den här filen föreslår — den beslutar inte. Ett förslag med poäng och skäl går
   att granska; en automatisk koppling som är fel är svårare att upptäcka än
   ingen koppling alls. Beloppet är ankaret: utan att beloppen möts blir det
   aldrig ett förslag, hur väl datum och namn än stämmer.
   ═════════════════════════════════════════════════════════════════════════════ */

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Belopp i kronor, eller null om raden inte gått att räkna om. */
function sek(rad, falt) {
  const val = String(rad.currency || "SEK").toUpperCase();
  if (val === "SEK") {
    const v = rad[falt];
    return v == null ? null : Number(v);
  }
  const kol = { total: "total_sek", vat_amount: "vat_sek" }[falt];
  if (kol && rad[kol] != null) return Number(rad[kol]);
  if (rad.fx_rate && rad[falt] != null) return r2(Number(rad[falt]) * Number(rad.fx_rate));
  return null;
}

const dagar = (a, b) => {
  if (!a || !b) return null;
  const t = (d) => Date.UTC(+String(d).slice(0, 4), +String(d).slice(5, 7) - 1, +String(d).slice(8, 10));
  return Math.round(Math.abs(t(a) - t(b)) / 86400000);
};

/** Ord ur en fritextbeskrivning, tillräckligt långa för att betyda något. */
function ord(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

/** Delar leverantörens namn någon igenkännbar bit med transaktionstexten? */
function namnTraff(namn, beskrivning) {
  const a = ord(namn), b = new Set(ord(beskrivning));
  return a.some((w) => b.has(w));
}

/* ── Poängsättning ───────────────────────────────────────────────────────────
   Beloppet först. Stämmer det inte finns ingen match — resten är då bara
   sammanträffanden. Därefter hur nära i tiden, och sist namnet.            */

function poangsatt({ txBelopp, txDatum, txText, kandidatBelopp, kandidatDatum, kandidatNamn }) {
  if (kandidatBelopp == null) return null;

  const diff = Math.abs(Math.abs(txBelopp) - Math.abs(kandidatBelopp));
  const relativt = Math.abs(kandidatBelopp) > 0 ? diff / Math.abs(kandidatBelopp) : 1;

  let poang = 0;
  const skal = [];

  if (diff <= 0.01) { poang += 55; skal.push("beloppet stämmer exakt"); }
  else if (diff <= 1) { poang += 45; skal.push("beloppet skiljer under en krona"); }
  else if (relativt <= 0.01) { poang += 28; skal.push("beloppet skiljer under en procent"); }
  else return null;   /* utan belopp ingen match */

  const d = dagar(txDatum, kandidatDatum);
  if (d === 0) { poang += 25; skal.push("samma datum"); }
  else if (d != null && d <= 3) { poang += 18; skal.push(`${d} dagars skillnad`); }
  else if (d != null && d <= 7) { poang += 10; skal.push(`${d} dagars skillnad`); }
  else if (d != null && d <= 14) { poang += 4; skal.push(`${d} dagars skillnad`); }
  else if (d != null && d > 45) { poang -= 15; skal.push(`${d} dagar isär — troligen inte samma affär`); }

  if (namnTraff(kandidatNamn, txText)) { poang += 20; skal.push("namnet förekommer i banktexten"); }

  return { poang, skal };
}

const sakerhet = (p) => (p >= 80 ? "säker" : p >= 60 ? "trolig" : "osäker");

/**
 * @param {object} p
 * @param {Array} p.transaktioner  studio_bank_tx
 * @param {Array} p.kvitton        studio_receipts
 * @param {Array} p.fakturor       studio_invoices
 * @param {number} [p.maxForslag=3]
 */
export function matchaTransaktioner({ transaktioner = [], kvitton = [], fakturor = [], maxForslag = 3 }) {
  /* Det som redan är kopplat får inte föreslås igen någon annanstans. */
  const upptagnaKvitton = new Set(transaktioner.map((t) => t.matched_receipt).filter(Boolean));
  const upptagnaFakturor = new Set(transaktioner.map((t) => t.matched_invoice).filter(Boolean));

  const okopplade = transaktioner.filter((t) => !t.matched_receipt && !t.matched_invoice);
  const rader = [];

  for (const t of okopplade) {
    /* En transaktion i främmande valuta jämförs inte mot kronbelopp. */
    if (String(t.currency || "SEK").toUpperCase() !== "SEK") {
      rader.push({ tx: t, forslag: [], varfor: "transaktionen är i annan valuta än kronor" });
      continue;
    }

    const belopp = Number(t.amount);
    const utgift = belopp < 0;
    const forslag = [];

    if (utgift) {
      for (const k of kvitton) {
        if (upptagnaKvitton.has(k.id)) continue;
        if (k.is_business === false) continue;
        const p = poangsatt({
          txBelopp: belopp, txDatum: t.tx_date, txText: t.description,
          kandidatBelopp: sek(k, "total"), kandidatDatum: k.receipt_date, kandidatNamn: k.vendor,
        });
        if (p) forslag.push({ typ: "kvitto", id: k.id, etikett: `${k.vendor || "Kvitto"} · ${k.receipt_date || "utan datum"}`, belopp: sek(k, "total"), ...p });
      }
    } else {
      for (const f of fakturor) {
        if (upptagnaFakturor.has(f.id)) continue;
        if (String(f.status) === "cancelled" || String(f.status) === "draft") continue;
        const p = poangsatt({
          txBelopp: belopp, txDatum: t.tx_date, txText: t.description,
          kandidatBelopp: sek(f, "total"),
          /* Betalningsdatum om det finns, annars förfallodagen. */
          kandidatDatum: (f.paid_at || f.due_date || "").slice(0, 10) || null,
          kandidatNamn: f.client_name,
        });
        if (p) forslag.push({ typ: "faktura", id: f.id, etikett: `${f.invoice_number || "Faktura"} · ${f.client_name || ""}`.trim(), belopp: sek(f, "total"), ...p });
      }
    }

    forslag.sort((a, b) => b.poang - a.poang);
    const topp = forslag.slice(0, maxForslag).map((f) => ({ ...f, sakerhet: sakerhet(f.poang) }));

    rader.push({
      tx: t,
      forslag: topp,
      varfor: topp.length ? null : (utgift ? "inget kvitto med det beloppet" : "ingen faktura med det beloppet"),
    });
  }

  const utanForslag = rader.filter((r) => !r.forslag.length);
  const sakra = rader.filter((r) => r.forslag[0]?.sakerhet === "säker");

  return {
    rader,
    antalOkopplade: okopplade.length,
    antalUtanForslag: utanForslag.length,
    antalSakra: sakra.length,
    /* Summan som saknar underlag — det är den siffran en revisor frågar om. */
    beloppUtanUnderlag: r2(utanForslag.reduce((a, r) => a + Math.abs(Number(r.tx.amount) || 0), 0)),
  };
}
