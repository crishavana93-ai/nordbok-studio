/* lib/moms.js — the momsdeklaration engine.
 *
 * Computes every box on the Swedish VAT return from invoices and receipts.
 *
 * TWO RULES THIS FILE EXISTS TO ENFORCE
 *
 * 1. KONTANTMETODEN. The user is on bokslutsmetoden, so a transaction falls in the
 *    period the MONEY MOVED — `paid_at` on an invoice, `receipt_date` on a receipt —
 *    never the invoice date. Getting this wrong shifts revenue between quarters.
 *
 * 2. NO GUESSED KRONOR. A row in EUR or USD with no stored `total_sek` is NOT
 *    silently converted at today's rate and NOT quietly dropped. It lands in
 *    `warnings` and blocks the return from being marked file-ready. A VAT return is
 *    not the place to estimate.
 *
 * Source: Skatteverket, "Deklarera moms" (box numbering) and "Omräkning av valuta
 * under löpande år" (which rate applies).
 */

/* Deadlines: the 12th of the second month after the period ends, except August and
 * January which move to the 17th. Q4 lands in February of the following year. */
const Q_DEADLINE = [
  { m: 4, d: 12 },   // Q1 jan–mar → 12 maj
  { m: 7, d: 17 },   // Q2 apr–jun → 17 aug
  { m: 10, d: 12 },  // Q3 jul–sep → 12 nov
  { m: 1, d: 12 },   // Q4 okt–dec → 12 feb (next year)
];

/** The VAT quarter containing `today`, with its deadline and days remaining. */
export function vatQuarter(today = new Date()) {
  const y = today.getUTCFullYear();
  const q = Math.floor(today.getUTCMonth() / 3);
  const dl = Q_DEADLINE[q];
  const deadline = new Date(Date.UTC(q === 3 ? y + 1 : y, dl.m, dl.d));
  const iso = (d) => d.toISOString().slice(0, 10);
  return {
    key: `${y}Q${q + 1}`,
    label: `Q${q + 1} ${y}`,
    start: iso(new Date(Date.UTC(y, q * 3, 1))),
    end: iso(new Date(Date.UTC(y, q * 3 + 3, 0))),
    deadline: iso(deadline),
    daysLeft: Math.ceil((deadline - today) / 86400000),
  };
}

/** The four quarters of a year, for a period picker. */
export function quartersOf(year) {
  return [0, 1, 2, 3].map((q) => {
    const dl = Q_DEADLINE[q];
    const iso = (d) => d.toISOString().slice(0, 10);
    return {
      key: `${year}Q${q + 1}`,
      label: `Q${q + 1} ${year}`,
      start: iso(new Date(Date.UTC(year, q * 3, 1))),
      end: iso(new Date(Date.UTC(year, q * 3 + 3, 0))),
      deadline: iso(new Date(Date.UTC(q === 3 ? year + 1 : year, dl.m, dl.d))),
    };
  });
}

const EMPTY = {
  r05: 0, r06: 0, r07: 0, r08: 0,
  r10: 0, r11: 0, r12: 0,
  r20: 0, r21: 0, r22: 0, r23: 0, r24: 0,
  r30: 0, r31: 0, r32: 0,
  r35: 0, r36: 0, r37: 0, r38: 0, r39: 0, r40: 0, r41: 0, r42: 0,
  r48: 0, r49: 0,
};

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** SEK amount for a row, or null when it cannot be established without guessing. */
function sek(row, field) {
  const cur = row.currency || "SEK";
  if (cur === "SEK") return Number(row[field] || 0);
  const stored = row[`${field === "total" ? "total" : "vat"}_sek`];
  if (stored != null) return Number(stored);
  if (row.fx_rate) return r2(Number(row[field] || 0) * Number(row.fx_rate));
  return null; // caller must warn, never invent
}

/**
 * Compute the return for one period.
 *
 * @param {object[]} invoices  paid invoices, filtered on paid_at within the period
 * @param {object[]} receipts  receipts, filtered on receipt_date within the period
 * @returns {{rutor, warnings, unconverted, fileReady, lines}}
 */
export function computeMoms({ invoices = [], receipts = [], period }) {
  const r = { ...EMPTY };
  const warnings = [];
  const unconverted = [];
  const lines = { sales: [], purchases: [], input: [] };

  /* ── Sales (kontantmetoden: paid_at) ───────────────────────────────────── */
  for (const inv of invoices) {
    if (!inv.paid_at) continue;

    const net = sek(inv, "subtotal");
    const vat = sek(inv, "vat_amount");
    if (net === null || vat === null) {
      unconverted.push({ kind: "invoice", ref: inv.invoice_number, currency: inv.currency, amount: inv.total, date: inv.paid_at });
      continue;
    }

    // Exempt / out-of-scope sales sit in the 35–42 block, never in 05.
    if (inv.reverse_charge) {
      const eu = inv.buyer_country && inv.buyer_country !== "SE" && isEu(inv.buyer_country);
      if (eu) r.r39 = r2(r.r39 + net);        // services to EU taxable person
      else r.r40 = r2(r.r40 + net);           // other services supplied abroad
      lines.sales.push({ ref: inv.invoice_number, net, vat: 0, ruta: eu ? 39 : 40, date: inv.paid_at });
      continue;
    }
    if (inv.vat_exempt_note) {
      r.r42 = r2(r.r42 + net);
      lines.sales.push({ ref: inv.invoice_number, net, vat: 0, ruta: 42, date: inv.paid_at });
      continue;
    }

    // Domestic taxable sale — split by rate from the frozen breakdown when present.
    const bd = Array.isArray(inv.vat_breakdown) ? inv.vat_breakdown : null;
    if (bd) {
      for (const b of bd) {
        const bn = Number(b.net || 0), bv = Number(b.vat || 0);
        if (!bn) continue;
        r.r05 = r2(r.r05 + bn);
        if (b.rate === 25) r.r10 = r2(r.r10 + bv);
        else if (b.rate === 12) r.r11 = r2(r.r11 + bv);
        else if (b.rate === 6) r.r12 = r2(r.r12 + bv);
        lines.sales.push({ ref: inv.invoice_number, net: bn, vat: bv, rate: b.rate, ruta: 5, date: inv.paid_at });
      }
    } else {
      // No breakdown stored — infer the rate, and say so.
      r.r05 = r2(r.r05 + net);
      const rate = net ? Math.round((vat / net) * 100) : 0;
      if (rate === 25) r.r10 = r2(r.r10 + vat);
      else if (rate === 12) r.r11 = r2(r.r11 + vat);
      else if (rate === 6) r.r12 = r2(r.r12 + vat);
      else if (vat) {
        warnings.push(`Faktura ${inv.invoice_number}: momssatsen ${rate}% går inte att härleda till 25/12/6 %. Kontrollera raderna.`);
      }
      if (vat) warnings.push(`Faktura ${inv.invoice_number} saknar sparad momsuppdelning — satsen härleddes till ${rate} %.`);
      lines.sales.push({ ref: inv.invoice_number, net, vat, rate, ruta: 5, date: inv.paid_at });
    }
  }

  /* ── Purchases (kontantmetoden: receipt_date) ──────────────────────────── */
  for (const rc of receipts) {
    if (rc.is_business === false) continue;

    // studio_receipts has no `subtotal` column — derive the net from total - vat.
    // Do NOT reintroduce sek(rc,"subtotal"): it returns 0 rather than null, which
    // silently zeroed every reverse-charge base.
    const vat = sek(rc, "vat_amount");
    const tot = sek(rc, "total");
    const net = tot !== null && vat !== null ? r2(tot - vat) : null;

    if (tot === null) {
      unconverted.push({ kind: "receipt", ref: rc.vendor, currency: rc.currency, amount: rc.total, date: rc.receipt_date });
      continue;
    }

    switch (rc.vat_treatment) {
      case "rc_eu": {
        // Services from an EU supplier — self-account and deduct. Net zero.
        const base = net ?? tot;
        const out = r2(base * 0.25);
        r.r21 = r2(r.r21 + base);
        r.r30 = r2(r.r30 + out);
        if (rc.is_deductible !== false) r.r48 = r2(r.r48 + out);
        lines.purchases.push({ ref: rc.vendor, net: base, vat: out, ruta: 21, date: rc.receipt_date });
        break;
      }
      case "rc_non_eu": {
        const base = net ?? tot;
        const out = r2(base * 0.25);
        r.r22 = r2(r.r22 + base);
        r.r30 = r2(r.r30 + out);
        if (rc.is_deductible !== false) r.r48 = r2(r.r48 + out);
        lines.purchases.push({ ref: rc.vendor, net: base, vat: out, ruta: 22, date: rc.receipt_date });
        break;
      }
      case "domestic": {
        if (rc.is_deductible !== false && vat) {
          const share = rc.business_share == null ? 1 : Number(rc.business_share);
          const claim = r2(vat * share);
          r.r48 = r2(r.r48 + claim);
          lines.input.push({ ref: rc.vendor, vat: claim, share, ruta: 48, date: rc.receipt_date });
        }
        break;
      }
      case "oss_non_ded":
        // A foreign supplier charged Swedish VAT through OSS. It appears NOWHERE on
        // the return and can never be reclaimed from Skatteverket — only from the
        // supplier. Flag it so the leak stays visible.
        if (vat) {
          warnings.push(
            `${rc.vendor} (${rc.receipt_date}): ${vat.toFixed(2)} kr moms debiterad via OSS kan inte dras av. ` +
            `Lägg in ditt momsnummer hos leverantören så blir framtida köp omvänd betalningsskyldighet.`
          );
        }
        break;
      case "exempt":
        break;
      default:
        if (vat) {
          warnings.push(`${rc.vendor} (${rc.receipt_date}) saknar momsbehandling — beloppet är inte med i beräkningen.`);
        }
    }
  }

  /* ── Bottom line ───────────────────────────────────────────────────────── */
  const outgoing = r2(r.r10 + r.r11 + r.r12 + r.r30 + r.r31 + r.r32);
  r.r49 = r2(outgoing - r.r48);

  if (unconverted.length) {
    warnings.push(
      `${unconverted.length} post${unconverted.length > 1 ? "er" : ""} i utländsk valuta saknar SEK-omräkning ` +
      `och är inte medräknad${unconverted.length > 1 ? "e" : ""}. Kör omräkningen innan du deklarerar.`
    );
  }

  return {
    period,
    rutor: r,
    outgoing,
    warnings,
    unconverted,
    lines,
    /** Never file while something is unconverted — the figures would be understated. */
    fileReady: unconverted.length === 0,
  };
}

const EU = new Set(["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"]);
function isEu(c) { return EU.has(c); }
