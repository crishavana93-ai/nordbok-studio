import { ore, momsOf, sumOre } from "./kronor.js";
/* lib/invoice-compliance.js — Swedish invoice law, in code.
 *
 * WHY THIS EXISTS
 * An invoice from a momsregistrerad business must carry a specific set of fields
 * (ML 17 kap.). Miss one and the invoice is defective: your customer can be denied
 * their input-VAT deduction and will come back to you for a corrected copy. The
 * requirement that trips up almost everyone — and that this business is guaranteed
 * to hit — is that the taxable amount must be broken out PER VAT RATE, not shown
 * as one combined figure.
 *
 * This user publishes a magazine (6%) and sells accessories (25%). Any invoice
 * carrying both must show two separate beskattningsunderlag. The current template
 * shows a single `vat_amount`, which is not compliant for a mixed-rate invoice.
 *
 * Nothing here decides anything on its own. validateInvoice() returns errors and
 * warnings; the caller refuses to send while errors remain.
 */

export const VAT_RATES = [25, 12, 6, 0];

export const CATEGORY_VAT = {
  // 25% — the default for everything not specifically reduced
  web_development: 25,
  consulting: 25,
  design: 25,
  hosting: 25,
  advertising: 25,
  accessories: 25, // humidors, cutters, lighters — tobacco ACCESSORIES, not tobacco
  // 12% — food, hotel, restaurant
  food: 12,
  hotel: 12,
  restaurant: 12,
  // 6% — books, newspapers, periodicals, passenger transport, culture
  magazine: 6, // The Next Cigar — a periodical
  newspaper: 6,
  book: 6,
  passenger_transport: 6,
  culture: 6,
};

const EU_COUNTRIES = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU",
  "MT","NL","PL","PT","RO","SK","SI","ES","SE",
]);

/* ── VAT treatment ──────────────────────────────────────────────────────────
 * Replaces the old suggestVatRate(), which hardcoded 25% for every Swedish sale —
 * wrong by 19 points on every magazine invoice.
 *
 * Returns the rate to charge AND why, so the reason can be printed on the invoice
 * and stored on the row. "0%" with no stated legal ground is a defective invoice.
 */
export function vatTreatment({
  buyerCountry = "SE",
  buyerIsBusiness = false,
  buyerVatNumber = null,
  supplyType = "service", // 'service' | 'goods'
  category = null,
}) {
  const domesticRate = CATEGORY_VAT[category] ?? 25;

  if (buyerCountry === "SE") {
    return { rate: domesticRate, reverseCharge: false, reason: "domestic", note: null };
  }

  const hasVat = Boolean(buyerVatNumber && String(buyerVatNumber).trim());

  if (EU_COUNTRIES.has(buyerCountry)) {
    if (buyerIsBusiness && hasVat) {
      return {
        rate: 0,
        reverseCharge: true,
        reason: supplyType === "goods" ? "eu_b2b_goods" : "eu_b2b_service",
        note: supplyType === "goods"
          ? "Unionsintern försäljning. Omvänd betalningsskyldighet."
          : "Omvänd betalningsskyldighet — köparen redovisar moms enligt artikel 196 i mervärdesskattedirektivet.",
        requiresPeriodicSammanstallning: true,
      };
    }
    // B2C inside the EU. Digital/telecom/broadcast services and distance-sold goods
    // switch to the CUSTOMER's country rate once the EU-wide 10 000 EUR threshold is
    // passed, normally reported through OSS. Below it, Swedish VAT applies.
    return {
      rate: domesticRate,
      reverseCharge: false,
      reason: "eu_b2c",
      note: null,
      warning:
        "EU B2C: once total cross-border B2C sales pass 10 000 EUR/year you must charge the " +
        "customer's country rate and report through OSS. Confirm which side of the threshold you are on.",
    };
  }

  // Outside the EU — generally outside the scope of Swedish VAT.
  return {
    rate: 0,
    reverseCharge: false,
    reason: supplyType === "goods" ? "export" : "outside_scope",
    note: supplyType === "goods"
      ? "Export. Omsättning utanför EU, artikel 146 i mervärdesskattedirektivet."
      : "Omsättning utanför EU. Moms debiteras ej — tjänsten är omsatt utomlands.",
  };
}

/* ── Beskattningsunderlag per momssats ──────────────────────────────────────
 * THE legally required breakdown. One row per distinct rate present on the invoice.
 */
/* THE ONE INVOICE ENGINE.
 *
 * There used to be two. computeInvoice() in lib/swedish-tax.js computed VAT per LINE
 * and summed; this computed the net per RATE and took VAT once. The draft form stored
 * the first, /api/invoices/send recomputed with the second, and validateInvoice
 * refused any gap over 0,01 kr:
 *
 *   40 × 1 187,50 kr @ 25 %  →  form 11 875,20   send 11 875,00   → 422, forever
 *
 * A month of consulting hours became unsendable, with an error naming two numbers and
 * no action. Worse where the gap was UNDER an öre: the send rewrote the totals after
 * the email had gone, so the customer's copy and the books differed — and migration
 * 010 then froze the changed one.
 *
 * Per-rate is the authority because it is what the document itself must show:
 * beskattningsunderlag per momssats. computeInvoice() now calls this.
 *
 * @param {object} opts.reverse_charge  Omvänd betalningsskyldighet: the seller charges
 *   no Swedish VAT at all. This function had no notion of it, so a byggmoms invoice
 *   stored 0 and recomputed to 25 % and could never be sent.
 */
export function vatBreakdown(items = [], opts = {}) {
  const reverseCharge = Boolean(opts.reverse_charge);
  const byRate = new Map();

  for (const it of items) {
    const rate = Number(it.vat_rate ?? 0);
    const net = ore(Number(it.quantity || 0) * Number(it.unit_price || 0));
    const row = byRate.get(rate) || { rate, net: 0, vat: 0, gross: 0 };
    /* Sum the nets raw and round once per rate — rounding each line and then adding
       accumulates the error that made the two engines disagree in the first place. */
    row.net = row.net + net;
    byRate.set(rate, row);
  }

  const rows = [...byRate.values()]
    .map((r) => {
      const net = ore(r.net);
      const vat = reverseCharge ? 0 : momsOf(net, r.rate);
      return { ...r, net, vat, gross: ore(net + vat) };
    })
    .sort((a, b) => b.rate - a.rate);

  return {
    rows,
    subtotal: sumOre(rows.map((r) => r.net)),
    vatTotal: sumOre(rows.map((r) => r.vat)),
    total: sumOre(rows.map((r) => r.gross)),
    isMixedRate: rows.filter((r) => r.net !== 0).length > 1,
    reverseCharge,
  };
}

/* ── Validation — ML 17 kap. ────────────────────────────────────────────────
 * errors   → the invoice is defective; do not send.
 * warnings → legal but worth a second look.
 */
export function validateInvoice({ invoice, client, settings, items }) {
  const errors = [];
  const warnings = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };

  // --- Seller ---
  req(settings?.business_name, "Säljarens namn saknas (settings.business_name).");
  req(settings?.address_street && settings?.address_city, "Säljarens adress saknas.");
  req(settings?.org_nr || settings?.personnummer, "Säljarens organisationsnummer saknas.");
  req(settings?.vat_number, "Säljarens momsregistreringsnummer saknas — obligatoriskt när du är momsregistrerad.");

  if (settings?.vat_number && !/^SE\d{12}$/.test(String(settings.vat_number).replace(/\s/g, ""))) {
    errors.push(
      `Momsregistreringsnumret "${settings.vat_number}" har fel format. ` +
      "Ett svenskt momsnummer är SE + 10-siffrigt organisationsnummer + 01, t.ex. SE930919909001."
    );
  }

  // --- Invoice identity ---
  req(invoice?.invoice_number, "Fakturanummer saknas.");
  req(invoice?.issue_date, "Fakturadatum saknas.");
  req(invoice?.due_date, "Förfallodatum saknas.");

  // Required when the supply date differs from the invoice date.
  if (invoice?.supply_date && invoice.supply_date !== invoice.issue_date && !invoice.supply_date_shown) {
    warnings.push("Leveransdatum skiljer sig från fakturadatum och måste anges på fakturan.");
  }

  // --- Buyer ---
  req(client?.name, "Köparens namn saknas.");
  req(client?.address_street || client?.address_city, "Köparens adress saknas.");

  // --- Lines ---
  req(Array.isArray(items) && items.length > 0, "Fakturan saknar rader.");
  (items || []).forEach((it, i) => {
    const n = i + 1;
    if (!it.description) errors.push(`Rad ${n}: beskrivning saknas.`);
    if (it.vat_rate === null || it.vat_rate === undefined) errors.push(`Rad ${n}: momssats saknas.`);
    else if (!VAT_RATES.includes(Number(it.vat_rate))) {
      errors.push(`Rad ${n}: momssats ${it.vat_rate}% finns inte i Sverige (giltiga: 25, 12, 6, 0).`);
    }
  });

  /* --- Ändringsfaktura (what everyone still calls a kreditfaktura) ---
     Under the mervärdesskattelag in force since 2023-07-01 a correction must carry a
     SÄRSKILD OCH OTVETYDIG HÄNVISNING to the invoice it changes, plus what changed.
     Without both, it is not a valid correction and the original still stands. */
  if (invoice?.document_type === "credit_note") {
    req(invoice?.credit_of, "Ändringsfakturan saknar hänvisning till ursprungsfakturan.");
    req(invoice?.credit_reason, "Ändringsfakturan måste ange vad som har ändrats.");
    if (Number(invoice?.total) > 0) {
      errors.push("En ändringsfaktura får inte öka beloppet. Utfärda en ny faktura i stället.");
    }
  }

  /* --- Utländsk valuta: momsen måste ändå anges i kronor ---
     A Swedish business keeping its books in SEK may invoice in any currency, but the
     VAT amount must ALSO appear in kronor on the invoice. Nordbok issued EUR invoices
     with no kronor anywhere on them until this check existed. The rate must be the
     ECB's or the most recent average on the Swedish market, taken at the tax point. */
  const ccy = String(invoice?.currency || "SEK").toUpperCase();
  if (ccy !== "SEK" && !invoice?.reverse_charge && Number(invoice?.vat_amount) !== 0) {
    if (invoice?.doc_vat_sek == null || !invoice?.doc_fx_rate) {
      errors.push(
        `Fakturan är i ${ccy} men anger inte momsbeloppet i kronor. ` +
        "En faktura i utländsk valuta måste visa momsen även i SEK, med den kurs som användes."
      );
    }
  }

  // --- The breakdown ---
  /* The flag has to come through here too. Without it the validator recomputed 25 %
     on a reverse-charge invoice and compared it against the stored 0 — so the gate
     blocked the very invoices the engine merge had just fixed. Caught by the test,
     not by reading the diff. */
  const bd = vatBreakdown(items, { reverse_charge: invoice?.reverse_charge });
  if (bd.isMixedRate) {
    warnings.push(
      `Fakturan har ${bd.rows.length} olika momssatser (${bd.rows.map((r) => r.rate + "%").join(", ")}). ` +
      "Beskattningsunderlaget måste redovisas separat per momssats."
    );
  }

  // --- Zero-rate always needs a stated legal ground ---
  const hasZero = bd.rows.some((r) => r.rate === 0 && r.net !== 0);
  if (hasZero && !invoice?.reverse_charge && !invoice?.vat_exempt_note) {
    errors.push(
      "Fakturan har rader med 0% moms men anger ingen grund. " +
      "Vid omvänd betalningsskyldighet eller undantag måste hänvisningen skrivas ut på fakturan."
    );
  }
  if (invoice?.reverse_charge && client?.country_code !== "SE" && !client?.vat_number) {
    errors.push("Omvänd betalningsskyldighet kräver köparens momsregistreringsnummer på fakturan.");
  }

  // --- Totals must agree with the lines ---
  if (invoice?.subtotal != null && Math.abs(round2(invoice.subtotal) - bd.subtotal) > 0.01) {
    errors.push(`Delsumman (${invoice.subtotal}) stämmer inte med raderna (${bd.subtotal}).`);
  }
  if (invoice?.vat_amount != null && Math.abs(round2(invoice.vat_amount) - bd.vatTotal) > 0.01) {
    errors.push(`Momsbeloppet (${invoice.vat_amount}) stämmer inte med raderna (${bd.vatTotal}).`);
  }

  // --- Payment route ---
  if (!settings?.bankgiro && !settings?.iban && !settings?.plusgiro) {
    errors.push("Ingen betalningsuppgift angiven (bankgiro, IBAN eller plusgiro).");
  }

  // --- F-skatt ---
  if (!settings?.f_skatt_approved) {
    warnings.push(
      "F-skatt är inte markerad. Utan uppgift om godkänd F-skatt kan köparen bli skyldig " +
      "att göra skatteavdrag och betala arbetsgivaravgifter på fakturabeloppet."
    );
  }

  // --- EU B2B follow-on obligation ---
  if (invoice?.reverse_charge && client?.country_code && EU_COUNTRIES.has(client.country_code)) {
    warnings.push("EU B2B med omvänd betalningsskyldighet ska även tas upp i periodisk sammanställning.");
  }

  return { ok: errors.length === 0, errors, warnings, breakdown: bd };
}

/* Kept as a name so existing call sites keep working, but the arithmetic now comes
   from lib/kronor.js. The old body added Number.EPSILON, which is an absolute value
   and stops doing anything above ~2 — i.e. across the whole range of invoice amounts. */
function round2(n) { return ore(n); }
