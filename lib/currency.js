/* Currency + locale helpers — for SE-based business that invoices US/UK/EU clients. */

export const CURRENCIES = [
  { code: "SEK", symbol: "kr",  label: "Svenska kronor",  locale: "sv-SE" },
  { code: "EUR", symbol: "€",   label: "Euro",            locale: "de-DE" },
  { code: "USD", symbol: "$",   label: "US Dollar",       locale: "en-US" },
  { code: "GBP", symbol: "£",   label: "British Pound",   locale: "en-GB" },
  { code: "NOK", symbol: "kr",  label: "Norske kroner",   locale: "nb-NO" },
  { code: "DKK", symbol: "kr",  label: "Danske kroner",   locale: "da-DK" },
  { code: "CHF", symbol: "CHF", label: "Swiss Franc",     locale: "de-CH" },
];

export const CURRENCY_BY_CODE = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]));

/** ISO 3166-1 alpha-2 → ISO 4217 default currency mapping (used to suggest currency when user picks a country). */
export const COUNTRY_TO_CURRENCY = {
  SE: "SEK", US: "USD", GB: "GBP",
  DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", IE: "EUR", FI: "EUR", PT: "EUR",
  GR: "EUR", LU: "EUR", SK: "EUR", SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR", MT: "EUR", CY: "EUR", HR: "EUR",
  NO: "NOK", DK: "DKK", CH: "CHF",
};

/** EU member states — drives reverse-charge and OSS logic. */
export const EU_COUNTRIES = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU",
  "MT","NL","PL","PT","RO","SK","SI","ES","SE",
]);

/** Default VAT rate for SE-issued invoices to a customer in `country`. Used to suggest the rate. */
export function suggestVatRate({ country = "SE", isBusiness = false, vatNumber = null }) {
  if (country === "SE") return 25;
  if (EU_COUNTRIES.has(country)) {
    // B2B with valid VAT number → reverse-charge → 0% with note on invoice
    if (isBusiness && vatNumber) return 0;
    // B2C in EU → seller's country VAT (until OSS threshold), then customer-country VAT
    return 25;
  }
  // Outside EU → out-of-scope; 0%
  return 0;
}

/** Should the invoice be flagged as reverse-charge to that EU B2B customer? */
export function isReverseChargeCandidate({ country = "SE", vatNumber = null }) {
  return country !== "SE" && EU_COUNTRIES.has(country) && !!vatNumber;
}

/** Country list for select dropdowns. ISO 3166-1 alpha-2 sorted by name. */
export const COUNTRIES = [
  { code: "SE", name: "Sverige" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Tyskland (Germany)" },
  { code: "FR", name: "Frankrike (France)" },
  { code: "ES", name: "Spanien (Spain)" },
  { code: "IT", name: "Italien (Italy)" },
  { code: "NL", name: "Nederländerna" },
  { code: "BE", name: "Belgien" },
  { code: "AT", name: "Österrike" },
  { code: "IE", name: "Irland" },
  { code: "FI", name: "Finland" },
  { code: "PT", name: "Portugal" },
  { code: "DK", name: "Danmark" },
  { code: "NO", name: "Norge" },
  { code: "CH", name: "Schweiz" },
  { code: "PL", name: "Polen" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "JP", name: "Japan" },
  { code: "AE", name: "UAE" },
  { code: "SG", name: "Singapore" },
];

/** Format a money amount in the given currency, choosing locale automatically. */
export function fmtMoney(amount, currency = "SEK", opts = {}) {
  const c = CURRENCY_BY_CODE[currency] || CURRENCY_BY_CODE.SEK;
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(c.locale, {
      style: "currency",
      currency: c.code,
      minimumFractionDigits: opts.fractionDigits ?? 2,
      maximumFractionDigits: opts.fractionDigits ?? 2,
    }).format(n);
  } catch {
    return `${n.toFixed(opts.fractionDigits ?? 2)} ${c.code}`;
  }
}

/** Format a number without currency symbol, locale-aware. */
export function fmtNumber(n, locale = "sv-SE", opts = {}) {
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: opts.fractionDigits ?? 0,
      maximumFractionDigits: opts.fractionDigits ?? 0,
    }).format(Number(n) || 0);
  } catch {
    return String(Math.round(Number(n) || 0));
  }
}

/** Format a date in user's preferred locale. Default to sv-SE for back-office consistency. */
export function fmtDate(d, locale = "sv-SE") {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return String(d);
  }
}
