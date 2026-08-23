/* lib/seller.js — who the invoice is FROM. One authority, used everywhere.
 *
 * WHY THIS IS NOT INLINE IN THE TEMPLATE
 * The seller block is the field a customer's bookkeeper checks first, and the one
 * that decides whether their avdrag for ingaende moms survives a review. It was
 * previously `settings.business_name` interpolated straight into three different
 * files -- the on-screen invoice, the print/PDF template and the email subject --
 * which is three chances to disagree. They now all call this.
 *
 * THE RULE (Skatteverket, faktureringsreglerna)
 * The seller's name is the LEGAL name: the foretagsnamn registered at Bolagsverket,
 * or, if none is registered, the person's own first and last name. A trade name may
 * be shown ALONGSIDE it. It may never stand in its place.
 *
 * A sarskilt foretagsnamn (what used to be called a bifirma) is registered, so it may
 * head the invoice -- but it must be shown together with the name of the business as
 * a whole, so that it does not read as an independent entity. Hence `subLine`.
 *
 * An unregistered brand gets `brandLine` and nothing else. It never touches the header.
 */

/** @typedef {{ name_type?: string, display_name?: string, from_email?: string, reply_to?: string, invoice_footer?: string }} Venture */

const LEGAL_TYPES = new Set(["primary", "sarskilt"]);

/**
 * @param {{ settings?: object, venture?: Venture|null, lang?: 'sv'|'en' }} args
 * @returns {{
 *   headerName: string,      // the big name at the top -- always a legal name
 *   subLine: string|null,    // "en del av X", only for a sarskilt foretagsnamn
 *   brandLine: string|null,  // "Avser: X", for an unregistered brand
 *   legalName: string|null,
 *   fromEmail: string|null,  // envelope sender, before the Resend fallback
 *   replyTo: string|null,
 *   footer: string|null,
 *   warning: string|null,    // set when the app had to fall back, so the UI can say so
 * }}
 */
export function sellerIdentity({ settings, venture, lang = "sv" } = {}) {
  const en = lang === "en";
  const legalName = (settings?.business_name || "").trim() || null;
  const baseEmail = (settings?.from_email || "").trim() || null;

  const v = venture || null;
  const vName = (v?.display_name || "").trim() || null;
  const vEmail = (v?.from_email || "").trim() || null;

  const fromEmail = vEmail || baseEmail || null;
  const replyTo = (v?.reply_to || settings?.contact_email || "").trim() || null;
  const footer = (v?.invoice_footer || settings?.invoice_footer || "").trim() || null;

  /* No venture chosen, or the venture is the registered main name: the header is
     simply the legal name. */
  if (!v || !vName || v.name_type === "primary") {
    return {
      headerName: (v?.name_type === "primary" ? vName : null) || legalName || "",
      subLine: null,
      brandLine: null,
      legalName, fromEmail, replyTo, footer,
      warning: legalName ? null
        : en ? "No registered business name set — the invoice has no seller."
             : "Inget företagsnamn angivet — fakturan saknar säljare.",
    };
  }

  /* Registered sarskilt foretagsnamn: both names, always together. */
  if (v.name_type === "sarskilt") {
    return {
      headerName: vName,
      subLine: legalName ? (en ? `a business name of ${legalName}` : `en del av ${legalName}`) : null,
      brandLine: null,
      legalName, fromEmail, replyTo, footer,
      warning: legalName ? null
        : en ? "A särskilt företagsnamn must be shown together with the main business name, which is not set."
             : "Ett särskilt företagsnamn måste visas tillsammans med verksamhetens huvudnamn, som saknas.",
    };
  }

  /* Unregistered brand. The header stays legal; the brand becomes a reference line. */
  return {
    headerName: legalName || "",
    subLine: null,
    brandLine: en ? `Regarding: ${vName}` : `Avser: ${vName}`,
    legalName, fromEmail, replyTo, footer,
    warning: legalName ? null
      : en ? "No registered business name set — an unregistered brand cannot be the seller."
           : "Inget registrerat företagsnamn angivet — ett oregistrerat varumärke kan inte vara säljare.",
  };
}

/** True when this venture may legally head an invoice on its own. */
export function isLegalName(venture) {
  return Boolean(venture && LEGAL_TYPES.has(venture.name_type));
}

export const VENTURE_KEYS = [
  "the_next_cigar", "turquino", "skattenavigator",
  "zamacharters", "cruiseshuttle", "ifmba", "other",
];

export const NAME_TYPES = [
  { value: "primary",  sv: "Registrerat företagsnamn (huvudnamn)", en: "Registered business name (primary)" },
  { value: "sarskilt", sv: "Särskilt företagsnamn (f.d. bifirma)", en: "Särskilt företagsnamn (secondary)" },
  { value: "brand",    sv: "Varumärke — inte registrerat",          en: "Brand — not registered" },
];
