/* lib/i18n.js — Swedish and English, without restructuring the app.
 *
 * WHY NOT next-intl
 * The standard library wants a [locale] route segment, which would rewrite every URL
 * and every link in the app. For a single-user tool with two languages and no SEO
 * requirement, that's a large migration buying nothing. This is ~80 lines, stores the
 * choice in a cookie, and works identically in Server and Client Components.
 *
 * WHAT STAYS IN SWEDISH, ALWAYS
 * Tax terms have no honest English equivalent and translating them makes the app less
 * accurate, not more accessible: momsdeklaration, ruta 05, F-skatt, egenavgifter,
 * NE-bilaga, kontantmetoden, omvänd betalningsskyldighet, verifikation. English users
 * get a gloss on first use, never a substitute. A translated "VAT return box 5" is a
 * phrase you cannot type into Skatteverket's search.
 */

"use client";

import { createContext, useContext, useMemo } from "react";

export const LOCALES = ["sv", "en"];
export const DEFAULT_LOCALE = "sv";
export const LOCALE_COOKIE = "nordbok_locale";

const DICT = {
  sv: {
    "common.loading": "Laddar…",
    "common.cancel": "Avbryt",
    "common.save": "Spara",
    "common.confirm": "Bekräfta",
    "common.delete": "Ta bort",
    "common.edit": "Ändra",
    "common.close": "Stäng",
    "common.showTable": "Visa tabell",
    "common.hideTable": "Dölj tabell",
    "common.all": "Alla",

    "nav.dashboard": "Översikt",
    "nav.invoices": "Fakturor",
    "nav.receipts": "Kvitton",
    "nav.vat": "Moms",
    "nav.more": "Mer",
    "nav.finance": "Finans",
    "nav.clients": "Kunder",
    "nav.bank": "Bank",
    "nav.mileage": "Körjournal",
    "nav.travel": "Affärsresor",
    "nav.archive": "Arkiv",
    "nav.deadlines": "Deadlines",
    "nav.assistant": "Assistent",
    "nav.settings": "Inställningar",

    "dash.vatPeriod": "Moms",
    "dash.toPay": "att betala",
    "dash.toReclaim": "att få tillbaka",
    "dash.daysLeft": "{n} dagar kvar",
    "dash.period": "Period",
    "dash.due": "Senast",
    "dash.method": "Metod",
    "dash.cashMethod": "Kontantmetoden",
    "dash.revenue": "Intäkter {year}",
    "dash.costs": "Kostnader {year}",
    "dash.unpaid": "Obetalda fakturor",
    "dash.noInvoiceYet": "Ingen faktura utfärdad ännu",
    "dash.nothingOutstanding": "Inga utestående",
    "dash.allConverted": "Alla poster omräknade",
    "dash.needsConversion": "{n} poster väntar på omräkning",
    "dash.oneReturn": "En momsdeklaration för hela verksamheten",

    "receipts.title": "Kvitton",
    "receipts.add": "Nytt kvitto",
    "receipts.empty": "Inga kvitton ännu — lägg till ditt första.",
    "receipts.date": "Datum",
    "receipts.vendor": "Leverantör",
    "receipts.treatment": "Momsbehandling",
    "receipts.vat": "Moms",
    "receipts.total": "Total",
    "receipts.missing": "Saknas",
    "receipts.noRate": "kurs saknas",
    "receipts.hasFile": "Kvittobild sparad",
    "receipts.needsFx": "{n} poster i utländsk valuta saknar SEK-omräkning och räknas inte med i momsdeklarationen.",
    "receipts.untreated": "{n} kvitton saknar momsbehandling och hamnar inte i ruta 48.",

    "inv.title": "Fakturor",
    "inv.new": "Ny faktura",
    "inv.number": "Fakturanummer",
    "inv.client": "Kund",
    "inv.issued": "Datum",
    "inv.due": "Förfaller",
    "inv.status": "Status",
    "inv.send": "Skicka faktura",
  },

  en: {
    "common.loading": "Loading…",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.confirm": "Confirm",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.close": "Close",
    "common.showTable": "Show table",
    "common.hideTable": "Hide table",
    "common.all": "All",

    "nav.dashboard": "Overview",
    "nav.invoices": "Invoices",
    "nav.receipts": "Receipts",
    "nav.vat": "VAT",
    "nav.more": "More",
    "nav.finance": "Finance",
    "nav.clients": "Clients",
    "nav.bank": "Bank",
    "nav.mileage": "Mileage",
    "nav.travel": "Travel",
    "nav.archive": "Archive",
    "nav.deadlines": "Deadlines",
    "nav.assistant": "Assistant",
    "nav.settings": "Settings",

    // "moms" is kept — it's the word on the form you file
    "dash.vatPeriod": "Moms (VAT)",
    "dash.toPay": "to pay",
    "dash.toReclaim": "to reclaim",
    "dash.daysLeft": "{n} days left",
    "dash.period": "Period",
    "dash.due": "Due",
    "dash.method": "Method",
    "dash.cashMethod": "Kontantmetoden (cash basis)",
    "dash.revenue": "Revenue {year}",
    "dash.costs": "Costs {year}",
    "dash.unpaid": "Unpaid invoices",
    "dash.noInvoiceYet": "No invoice issued yet",
    "dash.nothingOutstanding": "Nothing outstanding",
    "dash.allConverted": "All entries converted",
    "dash.needsConversion": "{n} entries awaiting conversion",
    "dash.oneReturn": "One momsdeklaration for the whole business",

    "receipts.title": "Receipts",
    "receipts.add": "New receipt",
    "receipts.empty": "No receipts yet — add your first.",
    "receipts.date": "Date",
    "receipts.vendor": "Supplier",
    "receipts.treatment": "VAT treatment",
    "receipts.vat": "VAT",
    "receipts.total": "Total",
    "receipts.missing": "Missing",
    "receipts.noRate": "no rate",
    "receipts.hasFile": "Receipt image stored",
    "receipts.needsFx": "{n} entries in foreign currency have no SEK conversion and are excluded from the VAT return.",
    "receipts.untreated": "{n} receipts have no VAT treatment and won't reach ruta 48.",

    "inv.title": "Invoices",
    "inv.new": "New invoice",
    "inv.number": "Invoice number",
    "inv.client": "Client",
    "inv.issued": "Issued",
    "inv.due": "Due",
    "inv.status": "Status",
    "inv.send": "Send invoice",
  },
};

const Ctx = createContext(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }) {
  const value = LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Translate. Falls back to Swedish, then to the key itself — never to blank. */
export function translate(locale, key, vars) {
  const l = LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  let s = DICT[l]?.[key] ?? DICT[DEFAULT_LOCALE]?.[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function useT() {
  const locale = useContext(Ctx);
  return useMemo(
    () => ({
      locale,
      t: (key, vars) => translate(locale, key, vars),
      /** Money in the row's own currency, formatted for the reader's locale. */
      money: (amount, currency = "SEK", opts = {}) =>
        new Intl.NumberFormat(locale === "en" ? "en-GB" : "sv-SE", {
          style: "currency",
          currency,
          minimumFractionDigits: opts.decimals ?? 0,
          maximumFractionDigits: opts.decimals ?? 0,
        }).format(Number(amount) || 0),
      date: (d) =>
        d ? new Date(d).toLocaleDateString(locale === "en" ? "en-GB" : "sv-SE") : "—",
    }),
    [locale]
  );
}

/** Set the locale and reload. Cookie, not localStorage — the server needs to read it. */
export function setLocale(locale) {
  if (!LOCALES.includes(locale)) return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}
