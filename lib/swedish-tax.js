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
  COMPANY_CAR_EV:           0,   // 0 kr/mil — no deduction
};

/* ─── ROT/RUT 2026 ─── */
export const ROTRUT_2026 = {
  ROT_MAX_PER_YEAR: 50000,
  RUT_MAX_PER_YEAR: 75000,        // combined ROT+RUT cap
  SUBSIDY_RATE:     0.50,         // customer's deduction = 50% of arbetskostnad
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

/** Compute totals for an invoice given line items. */
export function computeInvoice(items = [], opts = {}) {
  const lines = items.map((it) => {
    const qty = Number(it.quantity || 0);
    const unit = Number(it.unit_price || 0);
    const subtotal = +(qty * unit).toFixed(2);
    const vatRate = Number(it.vat_rate ?? 25);
    const vat = +(subtotal * vatRate / 100).toFixed(2);
    return { ...it, _subtotal: subtotal, _vat: vat, _total: +(subtotal + vat).toFixed(2) };
  });
  const subtotal = +lines.reduce((a, l) => a + l._subtotal, 0).toFixed(2);
  const vat_amount = opts.reverse_charge ? 0 : +lines.reduce((a, l) => a + l._vat, 0).toFixed(2);

  // ROT/RUT subsidy = 50% of arbetskostnad; arbetskostnad = sum(subtotal) of ROT/RUT lines
  let rot_amount = 0, rut_amount = 0;
  if (opts.rot_rut_type === "ROT" || opts.rot_rut_type === "RUT") {
    const arbetskostnad = +lines
      .filter((l) => l.rot_rut_hours && Number(l.rot_rut_hours) > 0)
      .reduce((a, l) => a + l._subtotal + l._vat, 0)
      .toFixed(2);
    const subsidy = +(arbetskostnad * ROTRUT_2026.SUBSIDY_RATE).toFixed(2);
    if (opts.rot_rut_type === "ROT") rot_amount = Math.min(subsidy, ROTRUT_2026.ROT_MAX_PER_YEAR);
    else rut_amount = Math.min(subsidy, ROTRUT_2026.RUT_MAX_PER_YEAR);
  }

  const total = +(subtotal + vat_amount - rot_amount - rut_amount).toFixed(2);
  return { lines, subtotal, vat_amount, rot_amount, rut_amount, total };
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
