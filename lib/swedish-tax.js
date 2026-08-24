import { vatBreakdown } from "./invoice-compliance.js";
import { ore, momsOf } from "./kronor.js";
/* ═════════════════════════════════════════════════════════════════════════════
   Swedish tax / accounting helpers — 2026 income year (deklaration 2027)
   Sources: Skatteverket SKV 433, Bokföringslagen, Mervärdesskattelagen,
            BAS-kontoplan 2026, Driversnote (mileage rates).
   ═════════════════════════════════════════════════════════════════════════════ */

/* ─── Constants for income year 2025 (filed 2026) ─── */
export const TAX_2025 = {
  EGENAVGIFTER:        0.2897,   // sole-trader social fees
  EGENAVGIFTER_REDUCED:0.1021,   // age 66+
  SCHABLONAVDRAG_PCT:  0.25,     // 25% schablon on egenavgifter (max 50,600 kr/yr)
  SCHABLONAVDRAG_MAX:  50600,
  STATLIG_SKATT_RATE:  0.20,     // statlig skatt above brytpunkt
  SKIKTGRANS:          625800,   // skiktgräns (after grundavdrag)
  BRYTPUNKT:           643100,   // brytpunkt (before grundavdrag)
  PERIODISERINGSFOND_PCT: 0.30,  // max 30% of resultat for EF
  RANTEFORDELNING_RATE:0.0796,   // SLR (1.96%) + 6%
  MOMS_THRESHOLD:      120000,   // momsbefrielse limit
  ISK_FRIBELOPP_2025:  0,        // 0 SEK for tax year 2025; 300,000 from 2026
};

/* ─── 2026 mileage rates (driversnote / skatteverket) ─── */
export const MILEAGE_2026 = {
  PRIVATE_CAR_BUSINESS:    25,   // kr/mil for private car used for business
  COMPANY_CAR_PETROL:      12,   // kr/mil reimbursement
  /* 9,50 kr/mil, not 0. This was 0 with the comment "no deduction", which is simply
   * wrong: Skatteverket's 2026 rate for a fully electric förmånsbil is 9,50 kr/mil
   * (petrol/diesel 12 kr, private car 25 kr). Because app/mileage/page.js stores the
   * computed `deduction` ON the row, every EV trip logged before 2026-08-24 has a
   * persisted 0 and is not repaired by fixing this constant. */
  COMPANY_CAR_EV:        9.50,   // kr/mil — helelektrisk förmånsbil
};

/* ─── ROT/RUT 2026 ───────────────────────────────────────────────────────────
 * ROT AND RUT ARE NOT THE SAME PERCENTAGE. They were, briefly: the rot rate was
 * raised to 50 % as a temporary measure for 2025 and expired. Skatteverket's
 * current wording for rotarbete is "du får dra av högst 30 procent". Rut stayed
 * at 50 %.
 *
 * A single shared SUBSIDY_RATE of 0.50 lived here until 2026-08-24 and applied to
 * both. On a 100 000 kr arbetskostnad that deducted 50 000 kr from the customer
 * while Skatteverket pays out 30 000 — and under fakturamodellen the customer has
 * already paid, so the 20 000 kr difference is money the business never sees again.
 * Never collapse these two constants again, whatever they happen to be equal to.
 *
 * The ceiling is per PERSON per YEAR and is shared: 75 000 kr of rot + rut
 * combined, of which at most 50 000 kr may be rot. It is not a per-invoice limit,
 * which is why computeInvoice() takes what the customer has already used.
 * ─────────────────────────────────────────────────────────────────────────── */
export const ROTRUT_2026 = {
  ROT_RATE: 0.30,                 // rotarbete: 30 % of arbetskostnaden inkl. moms
  RUT_RATE: 0.50,                 // rutarbete: 50 %
  ROT_MAX_PER_YEAR: 50000,        // of the combined ceiling, at most this may be rot
  COMBINED_MAX_PER_YEAR: 75000,   // rot + rut together, per person per year
};

/* ─── OSS threshold ─── */
export const OSS_THRESHOLD_SEK = 99680; // ≈ €10,000

/* ─── VAT rates (mervärdesskatt) ─── */
export const VAT_RATES = [25, 12, 6, 0];

/* ═════════════════════════════════════════════════════════════════════════════
   F-skatt / personnummer / orgnr / VAT-number validation
   ═════════════════════════════════════════════════════════════════════════════ */

/** Luhn / Mod-10 algorithm used by personnummer and orgnummer. */
export function luhn10(digits) {
  const s = String(digits).replace(/\D/g, "");
  if (!s.length) return false;
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    let d = parseInt(s[s.length - 1 - i], 10);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Validate a Swedish personnummer (YYYYMMDD-XXXX or YYMMDD-XXXX). */
export function validPersonnummer(s) {
  if (!s) return false;
  const t = String(s).replace(/\D/g, "");
  if (t.length !== 10 && t.length !== 12) return false;
  return luhn10(t.slice(-10));
}

/** Validate a Swedish organisationsnummer (10 digits). */
export function validOrgNr(s) {
  if (!s) return false;
  const t = String(s).replace(/\D/g, "");
  return t.length === 10 && luhn10(t);
}

/** Build VAT-number from personnummer or orgnr — "SE" + 12 digits + "01". */
export function buildVatNumber(pnrOrOrg) {
  const t = String(pnrOrOrg || "").replace(/\D/g, "").slice(-10);
  if (!t || t.length !== 10) return null;
  return `SE${t}01`;
}

/* ═════════════════════════════════════════════════════════════════════════════
   OCR (Optical Character Recognition? No — Sweden's Bankgiro reference number)
   The customer types this number when paying via Bankgiro. Format: 2-25 digits
   with a Mod-10 check digit on the right. We use 7 digits + check.
   ═════════════════════════════════════════════════════════════════════════════ */

/** Generate an OCR reference number with Mod-10 check digit. */
export function generateOcrNumber(seed) {
  // 7-digit seed (zero-padded), then Mod-10 check digit appended
  const n = String(seed).replace(/\D/g, "").slice(-7).padStart(7, "0");
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let d = parseInt(n[i], 10);
    // weights alternate 2,1,2,1... starting from leftmost (ascii bankgiro)
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return `${n}${check}`;
}

/* ═════════════════════════════════════════════════════════════════════════════
   Invoice math
   ═════════════════════════════════════════════════════════════════════════════ */

/** Compute totals for an invoice given line items.
 *
 * THE TOTALS COME FROM vatBreakdown(), NOT FROM HERE.
 * This function used to compute VAT per line and sum it, while /api/invoices/send
 * recomputed per rate with vatBreakdown() and then refused any disagreement over
 * 0,01 kr. On 40 lines of 1 187,50 kr the two differed by exactly 0,20 kr and the
 * invoice could never be sent. Reverse charge was worse: 0 here against 25 % there,
 * so a byggmoms invoice was permanently unsendable.
 *
 * What remains here is what the FORM needs and the breakdown does not carry: per-line
 * decoration for the table, and ROT/RUT, which is not a VAT question at all.
 */
export function computeInvoice(items = [], opts = {}) {
  const bd = vatBreakdown(items, { reverse_charge: opts.reverse_charge });

  /* Per-line figures for display only. They are allowed to differ from the invoice
     total by a rounding step — that is inherent to showing both — so nothing
     downstream may sum them. Sum bd.subtotal / bd.vatTotal instead. */
  const lines = items.map((it) => {
    const qty = Number(it.quantity || 0);
    const unit = Number(it.unit_price || 0);
    const subtotal = ore(qty * unit);
    const vatRate = Number(it.vat_rate ?? 25);
    const vat = opts.reverse_charge ? 0 : momsOf(subtotal, vatRate);
    return { ...it, _subtotal: subtotal, _vat: vat, _total: ore(subtotal + vat) };
  });

  const subtotal = bd.subtotal;
  const vat_amount = bd.vatTotal;

  /* ROT/RUT. The base is arbetskostnaden INKLUSIVE moms — that part was always
   * right. What was wrong was the rate, and treating the annual ceiling as if it
   * applied to one invoice.
   *
   * opts.rotRutUsedThisYear is what this CUSTOMER has already had granted in the
   * calendar year. Pass it and the remaining allowance is respected; omit it and
   * we fall back to the full ceiling and say so via `rot_rut_capped`, because a
   * silent over-deduction is the failure that costs money. */
  let rot_amount = 0, rut_amount = 0, rot_rut_capped = null;
  if (opts.rot_rut_type === "ROT" || opts.rot_rut_type === "RUT") {
    const isRot = opts.rot_rut_type === "ROT";
    const arbetskostnad = +lines
      .filter((l) => l.rot_rut_hours && Number(l.rot_rut_hours) > 0)
      .reduce((a, l) => a + l._subtotal + l._vat, 0)
      .toFixed(2);

    const rate = isRot ? ROTRUT_2026.ROT_RATE : ROTRUT_2026.RUT_RATE;
    const earned = +(arbetskostnad * rate).toFixed(2);

    const usedRot = Number(opts.rotRutUsedThisYear?.rot) || 0;
    const usedRut = Number(opts.rotRutUsedThisYear?.rut) || 0;

    /* Two ceilings bind at once: the shared 75 000, and — for rot only — 50 000. */
    const combinedLeft = Math.max(ROTRUT_2026.COMBINED_MAX_PER_YEAR - usedRot - usedRut, 0);
    const rotLeft = Math.max(ROTRUT_2026.ROT_MAX_PER_YEAR - usedRot, 0);
    const allowed = isRot ? Math.min(combinedLeft, rotLeft) : combinedLeft;

    const granted = Math.min(earned, allowed);
    if (granted < earned) {
      rot_rut_capped = {
        earned, granted, shortfall: +(earned - granted).toFixed(2),
        reason: isRot && rotLeft < combinedLeft ? "rot_50k" : "combined_75k",
        knownUsage: Boolean(opts.rotRutUsedThisYear),
      };
    }
    if (isRot) rot_amount = granted; else rut_amount = granted;
  }

  const total = +(subtotal + vat_amount - rot_amount - rut_amount).toFixed(2);
  return { lines, subtotal, vat_amount, rot_amount, rut_amount, rot_rut_capped, total, breakdown: bd.rows };
}

/* ═════════════════════════════════════════════════════════════════════════════
   BAS-kontoplan suggestions for receipts (Klass 4–8 most relevant for EF)
   ═════════════════════════════════════════════════════════════════════════════ */

export const BAS_CATEGORIES = [
  // konto, label, NE row
  { account: "5410", label: "Förbrukningsinventarier",       ne: "R5",  keywords: ["dator", "tangentbord", "skärm", "kontor", "verktyg"] },
  { account: "5611", label: "Drivmedel personbil",          ne: "R5",  keywords: ["okq8", "circle", "preem", "shell", "ingo", "drivmedel", "bensin", "diesel"] },
  { account: "5615", label: "Leasingavgifter personbil",    ne: "R5",  keywords: ["leasing", "audi", "volvo", "mercedes", "billån"] },
  { account: "5800", label: "Resekostnader",                 ne: "R5",  keywords: ["sl", "sj", "flyg", "tåg", "hotell", "scandic", "elite", "first"] },
  { account: "5830", label: "Logi i samband med tjänsteresa",ne: "R5",  keywords: ["hotell", "airbnb", "booking"] },
  { account: "5841", label: "Måltider, externa",            ne: "R5",  keywords: ["restaurang", "max", "espresso", "lunch", "middag"] },
  { account: "6071", label: "Representation, avdragsgill",  ne: "R5",  keywords: ["representation", "kund"] },
  { account: "6212", label: "Mobiltelefon",                  ne: "R5",  keywords: ["telia", "tele2", "tre", "comviq", "mobil"] },
  { account: "6230", label: "Internet/datakommunikation",    ne: "R5",  keywords: ["bredband", "internet", "fiber", "openinfra"] },
  { account: "6250", label: "Porto",                         ne: "R5",  keywords: ["postnord", "frakt", "schenker", "dhl", "ups"] },
  { account: "6540", label: "IT-tjänster",                   ne: "R5",  keywords: ["github", "vercel", "supabase", "openai", "anthropic", "aws", "google cloud", "azure", "saas"] },
  { account: "6550", label: "Konsultarvoden",                ne: "R5",  keywords: ["konsult", "advokat", "redovisning"] },
  { account: "6981", label: "Föreningsavgifter, avdragsgilla",ne: "R5", keywords: ["medlem", "förening"] },
  { account: "7010", label: "Lön till arbetstagare",         ne: "R6",  keywords: ["lön", "salary"] },
  { account: "7611", label: "Fortbildning",                  ne: "R5",  keywords: ["kurs", "utbildning", "udemy", "coursera", "konferens"] },
  { account: "8910", label: "Skatt och avgift",              ne: "—",   keywords: ["skatteverket", "f-skatt", "moms"] },
];

/** Suggest a BAS account from vendor + description text. */
export function suggestBasAccount(vendor = "", description = "") {
  const text = `${vendor} ${description}`.toLowerCase();
  for (const c of BAS_CATEGORIES) {
    if (c.keywords.some((k) => text.includes(k))) return c;
  }
  return BAS_CATEGORIES[0]; // fallback: Förbrukningsinventarier
}

/* ═════════════════════════════════════════════════════════════════════════════
   Mileage / körjournal helper
   ═════════════════════════════════════════════════════════════════════════════ */

/** Compute deductible mileage in SEK. km is kilometers; rate is kr/mil (1 mil = 10 km). */
export function mileageDeduction(km, rate = MILEAGE_2026.PRIVATE_CAR_BUSINESS) {
  return +((Number(km) / 10) * Number(rate)).toFixed(2);
}

/** Validate a trip has all Skatteverket-required fields. */
export function validTrip(t) {
  return !!(t && t.trip_date && t.from_address && t.to_address && t.purpose && t.km > 0);
}

/* ═════════════════════════════════════════════════════════════════════════════
   Quick income/tax estimate for an EF (used on dashboard)
   ═════════════════════════════════════════════════════════════════════════════ */

/** Rough estimate: net profit -> approximate total tax (kommunalskatt assumed 32%). */
export function estimateTax(netProfitSek, opts = {}) {
  const k = TAX_2025;
  const eg = netProfitSek * k.EGENAVGIFTER;
  const schablon = Math.min(eg * k.SCHABLONAVDRAG_PCT, k.SCHABLONAVDRAG_MAX);
  const taxableIncome = Math.max(0, netProfitSek - eg + schablon);
  const grundavdrag = 16100; // simplified — actual depends on income bracket
  const ti = Math.max(0, taxableIncome - grundavdrag);
  const kommun = ti * (opts.kommunalskatt ?? 0.32);
  const statlig = ti > k.SKIKTGRANS ? (ti - k.SKIKTGRANS) * k.STATLIG_SKATT_RATE : 0;
  return {
    egenavgifter: +eg.toFixed(0),
    schablonavdrag: +schablon.toFixed(0),
    kommunalskatt: +kommun.toFixed(0),
    statligskatt: +statlig.toFixed(0),
    total_tax: +(eg + kommun + statlig).toFixed(0),
    taxable_income: +ti.toFixed(0),
  };
}
