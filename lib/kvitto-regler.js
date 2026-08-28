/* ═════════════════════════════════════════════════════════════════════════════
   lib/kvitto-regler.js — vad som är ett giltigt kvitto, på ett enda ställe
   ─────────────────────────────────────────────────────────────────────────────
   Reglerna låg tidigare inne i commit-routen. Så länge det bara gick att skapa
   kvitton spelade det ingen roll. I samma stund som det också går att rätta dem
   finns två vägar in i samma tabell, och två uppsättningar regler som glider
   isär tills den ena släpper igenom det den andra stoppar.

   Motsägelsen som gjorde det här nödvändigt: en rad var markerad som omvänd
   betalningsskyldighet — leverantören debiterar då ingen moms — och bar ändå
   243,38 kr moms. Ingenting stoppade den vid inskrivningen. Den upptäcktes
   först flera månader senare av SIE-exporten, som vägrade skriva filen och
   angav ett "diff" som inte sa vad som var fel.

   En regel som bara finns i exporten är en regel som upptäcks för sent.
   ═════════════════════════════════════════════════════════════════════════════ */

export const BEHANDLINGAR = new Set([
  "domestic",     // svensk moms, avdragsgill
  "rc_eu",        // omvänd betalningsskyldighet, EU
  "rc_non_eu",    // förvärv av tjänst från land utanför EU
  "oss_non_ded",  // leverantören debiterade utländsk moms — ej avdragsgill
  "exempt",       // undantagen eller momsfri
]);

export const VERKSAMHETER = new Set([
  "turquino", "the_next_cigar", "zamacharters", "skattenavigator",
  "cruiseshuttle", "ifmba", "other",
]);

/* Vad en rättelse får röra. Bilden, hashen och ägaren står inte med — och det
   är hela poängen med dem. Bokföringslagen 7 kap. 1 § kräver att underlaget är
   bevarat i den form det hade när det kom in; går filen att byta ut i efterhand
   bevisar kontrollsumman ingenting. */
export const RATTNINGSBARA = [
  "vendor", "receipt_date", "total", "vat_amount", "vat_rate", "currency",
  "category", "description", "bas_account", "ne_row", "vat_treatment",
  "venture", "business_share", "is_business", "payment_method",
];

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const kr = (n) => Number(n).toFixed(2).replace(".", ",");

/**
 * Granskar en HEL kvittorad — inte en delmängd. Vid rättelse ska anroparen
 * slå ihop den befintliga raden med ändringarna först, annars bedöms momsen
 * mot en behandling som kanske inte gäller längre.
 *
 * @param {object} rad
 * @returns {{ fel: string[], rad: object }}
 */
export function granskaKvitto(rad = {}) {
  const fel = [];

  const vendor = String(rad.vendor || "").trim();
  if (!vendor) fel.push("Leverantör saknas.");

  const datum = String(rad.receipt_date || "");
  if (!DATUM.test(datum)) fel.push("Datum måste vara YYYY-MM-DD.");
  else if (Number.isNaN(Date.parse(`${datum}T12:00:00Z`))) fel.push(`${datum} är inget riktigt datum.`);

  const total = Number(rad.total);
  if (!Number.isFinite(total)) fel.push("Belopp saknas.");

  const moms = rad.vat_amount == null || rad.vat_amount === "" ? 0 : Number(rad.vat_amount);
  if (!Number.isFinite(moms)) fel.push("Momsbeloppet är inte ett tal.");

  const behandling = rad.vat_treatment;
  if (!BEHANDLINGAR.has(behandling)) fel.push("Ogiltig momsbehandling.");

  if (rad.venture && !VERKSAMHETER.has(rad.venture)) fel.push("Ogiltig verksamhet.");

  const andel = rad.business_share == null || rad.business_share === "" ? 1 : Number(rad.business_share);
  if (!(andel >= 0 && andel <= 1)) fel.push("Andel affär måste vara mellan 0 och 1.");

  const valuta = String(rad.currency || "SEK").toUpperCase();
  if (!/^[A-Z]{3}$/.test(valuta)) fel.push("Valutan ska vara en trebokstavskod, till exempel SEK eller EUR.");

  if (Number.isFinite(total) && Number.isFinite(moms)) {
    if (moms > total) fel.push("Momsbeloppet kan inte vara större än totalen.");
    if (moms < 0) fel.push("Momsbeloppet kan inte vara negativt.");
  }

  /* ── De två motsägelserna ─────────────────────────────────────────────────
     Båda är par av påståenden som inte kan vara sanna samtidigt. Ingen av dem
     syns som ett fel i någon summa; de ser ut som kompletta rader ända tills
     något längre fram vägrar räkna på dem. */

  // Leverantören debiterade moms — men raden säger att den inte gjorde det.
  if ((behandling === "rc_eu" || behandling === "rc_non_eu") && Number.isFinite(moms) && moms > 0) {
    fel.push(
      `Omvänd betalningsskyldighet betyder att leverantören inte debiterat någon moms, ` +
      `men raden bär ${kr(moms)} kr moms. Debiterade leverantören moms är behandlingen ` +
      `"OSS — ej avdragsgill". Gjorde den inte det ska momsbeloppet vara 0.`
    );
  }

  // ...och tvärtom: en behandling som förutsätter debiterad moms, utan belopp.
  if (behandling === "oss_non_ded" && Number.isFinite(moms) && moms === 0) {
    fel.push("OSS-behandling förutsätter att säljaren debiterat moms. Kontrollera beloppet.");
  }

  if (fel.length) return { fel, rad: null };

  /* ── Normalisering ────────────────────────────────────────────────────────
     Härledda fält räknas fram här och skrivs aldrig av anroparen. is_deductible
     har gått fel förut just för att den sattes på två ställen. */
  const ren = {
    vendor,
    receipt_date: datum,
    total,
    vat_amount: moms,
    vat_rate: rad.vat_rate == null || rad.vat_rate === "" ? null : Number(rad.vat_rate),
    currency: valuta,
    category: rad.category?.trim() || null,
    description: rad.description?.trim() || null,
    bas_account: rad.bas_account || null,
    ne_row: rad.ne_row || null,
    vat_treatment: behandling,
    venture: rad.venture || null,
    business_share: andel,
    payment_method: rad.payment_method || null,
    is_business: rad.is_business === false ? false : true,
    is_deductible: behandling !== "oss_non_ded",
  };

  return { fel: [], rad: ren };
}

/**
 * SEK-motvärdet. En rad i SEK är redan omräknad. En rad i främmande valuta får
 * medvetet null, så att lib/moms.js rapporterar den som oomräknad och blockerar
 * deklarationen tills backfill-fx hämtat ECB-kursen för betalningsdagen.
 *
 * Vid rättelse är det viktigare än vid inskrivning: ändras beloppet eller datumet
 * på en valutarad är den gamla omräkningen inte längre sann, och en kvarstående
 * total_sek är då tyst fel i stället för synligt saknad.
 */
export function sekMotvarde(rad) {
  return rad.currency === "SEK"
    ? { total_sek: rad.total, vat_sek: rad.vat_amount }
    : { total_sek: null, vat_sek: null };
}
