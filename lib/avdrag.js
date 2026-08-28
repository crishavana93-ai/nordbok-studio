/* ═════════════════════════════════════════════════════════════════════════════
   lib/avdrag.js — vad av ett kvitto som faktiskt får dras av
   ─────────────────────────────────────────────────────────────────────────────
   Skannern läste av fält och lämnade bedömningen till användaren. Men fälten är
   inte frågan. Frågan är "får jag dra av det här, hur mycket, och blev jag
   fakturerad som företag eller som privatperson" — och det är där pengarna
   finns.

   Den dyraste av dem är den tystaste: en utländsk leverantör som saknar ditt
   momsnummer debiterar sitt eget lands moms. Den momsen är inte avdragsgill i
   Sverige. Den syns inte som ett fel någonstans — kvittot ser komplett ut, och
   beloppet försvinner varje månad tills någon upptäcker det.

   Filen bedömer, den beslutar inte. Där den inte kan veta — hur många personer
   som satt vid bordet, hur stor andel som är privat — säger den det i stället
   för att räkna fram en siffra som ser exakt ut.

   Källor: Skatteverket, Avdrag för moms vid representation; Skatteverket,
   Köpa varor eller tjänster till företaget.
   ═════════════════════════════════════════════════════════════════════════════ */

const EU = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU",
  "MT","NL","PL","PT","RO","SK","SI","ES","SE",
]);

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/* Representation. Underlaget är högst 300 kr exkl. moms per person och tillfälle.
   Livsmedelsmomsen är 6 % sedan 2026-04-01, så momsavdraget för mat utan alkohol
   är högst 18 kr per person. Ingår alkohol får schablonen 33 kr per person
   användas. För inkomstskatten är måltider inte avdragsgilla alls — bara enklare
   förtäring upp till 60 kr per person. */
export const REPRESENTATION = {
  UNDERLAG_PER_PERSON: 300,
  MOMS_MAT_PER_PERSON: 18,
  SCHABLON_MED_ALKOHOL: 33,
  ENKLARE_FORTARING_PER_PERSON: 60,
};

const ORD = (s) => String(s || "").toLowerCase();
const nagot = (text, ord) => ord.some((o) => text.includes(o));

/**
 * @param {object} k                     avläst kvitto
 * @param {string} [k.vendor]
 * @param {string} [k.vendor_country]    ISO-landskod
 * @param {string} [k.buyer_vat_number]  köparens momsnummer om det står på kvittot
 * @param {number} [k.total]             brutto
 * @param {number} [k.vat_amount]
 * @param {string} [k.category]
 * @param {string} [k.description]
 * @param {number} [k.business_share]
 * @param {object} [opts]
 * @param {string} [opts.egetMomsnummer] settings.vat_number
 * @param {boolean} [opts.momsregistrerad=true]
 */
export function bedomAvdrag(k = {}, opts = {}) {
  const land = String(k.vendor_country || "").toUpperCase();
  const brutto = k.total == null ? null : Number(k.total);
  const moms = k.vat_amount == null ? 0 : Number(k.vat_amount);
  const text = ORD(`${k.category} ${k.description} ${k.vendor}`);
  const andel = k.business_share == null ? 1 : Number(k.business_share);
  const momsregistrerad = opts.momsregistrerad !== false;

  const skal = [];
  const varningar = [];
  let avdragsgill = "ja";
  let momsAvdrag = 0;
  let behandling = null;

  /* ── 1. Sådant som aldrig är avdragsgillt ──────────────────────────────── */
  if (nagot(text, ["böter", "bot ", "parkeringsanmärkning", "kontrollavgift", "förseningsavgift", "straffavgift"])) {
    return klart({
      avdragsgill: "nej", momsAvdrag: 0, behandling: "exempt",
      skal: ["Böter och sanktionsavgifter är aldrig avdragsgilla, varken som kostnad eller moms."],
      varningar: [], brutto, andel,
    });
  }

  /* ── 2. Fakturerad som privatperson eller som företag? ─────────────────── */
  const utlandsk = land && land !== "SE";
  const harKoparmoms = !!String(k.buyer_vat_number || "").trim();

  if (utlandsk && moms > 0) {
    /* En utländsk leverantör som debiterat moms har gjort det för att den inte
       vet att köparen är ett momsregistrerat företag. Den momsen får inte dras
       av i en svensk momsdeklaration. */
    behandling = "oss_non_ded";
    avdragsgill = "delvis";
    momsAvdrag = 0;
    skal.push("Hela beloppet inklusive den utländska momsen är en kostnad — kostnaden är avdragsgill.");
    varningar.push({
      allvar: "hog",
      text: `${k.vendor || "Leverantören"} har debiterat ${r2(moms)} i utländsk moms. Den är inte avdragsgill i Sverige.`,
      atgard: opts.egetMomsnummer
        ? `Lägg in ditt momsnummer ${opts.egetMomsnummer} hos leverantören, så faktureras du utan moms och redovisar den själv i stället.`
        : "Lägg in ditt momsnummer hos leverantören, så faktureras du utan moms och redovisar den själv i stället.",
      belopp: r2(moms),
    });
  } else if (utlandsk) {
    behandling = EU.has(land) ? "rc_eu" : "rc_non_eu";
    skal.push(
      EU.has(land)
        ? "Omvänd betalningsskyldighet: leverantören inom EU fakturerar utan moms och du redovisar både utgående och ingående moms själv. De tar ut varandra."
        : "Förvärv av tjänst från land utanför EU: du redovisar både utgående och ingående moms själv. De tar ut varandra."
    );
    if (harKoparmoms) skal.push("Ditt momsnummer står på underlaget — leverantören har fakturerat rätt.");
    else varningar.push({
      allvar: "lag",
      text: "Ditt momsnummer syns inte på underlaget. Ingen moms är debiterad, så inget har gått förlorat — men kontrollera att det ligger inne hos leverantören.",
      atgard: null,
    });
  } else {
    behandling = moms > 0 ? "domestic" : "exempt";
    if (momsregistrerad && moms > 0) {
      momsAvdrag = r2(moms * andel);
      skal.push(andel < 1
        ? `Svensk moms, avdragsgill till den del inköpet används i verksamheten (${Math.round(andel * 100)} %).`
        : "Svensk moms är avdragsgill i sin helhet.");
    } else if (!momsregistrerad && moms > 0) {
      momsAvdrag = 0;
      skal.push("Verksamheten är inte momsregistrerad, så ingen ingående moms får dras av — hela beloppet är en kostnad.");
    }
  }

  /* ── 3. Representation och måltider ────────────────────────────────────── */
  if (nagot(text, ["representation", "restaurang", "lunch", "middag", "måltid", "bar ", "krog"])) {
    avdragsgill = "delvis";
    momsAvdrag = null;   /* går inte att räkna utan antal personer */
    skal.push(
      "Måltider vid representation är inte avdragsgilla för inkomstskatten — bara enklare " +
      `förtäring upp till ${REPRESENTATION.ENKLARE_FORTARING_PER_PERSON} kr per person.`
    );
    varningar.push({
      allvar: "medel",
      text: "Momsavdraget vid representation beror på hur många personer som deltog — det går inte att läsa ur kvittot.",
      atgard:
        `Underlaget är högst ${REPRESENTATION.UNDERLAG_PER_PERSON} kr exkl. moms per person och tillfälle. ` +
        `Utan alkohol blir momsavdraget högst ${REPRESENTATION.MOMS_MAT_PER_PERSON} kr per person ` +
        `(livsmedelsmomsen är 6 % sedan 2026-04-01). Ingår alkohol får schablonen ` +
        `${REPRESENTATION.SCHABLON_MED_ALKOHOL} kr per person användas. Anteckna vilka som deltog och varför.`,
    });
  }

  /* ── 4. Personbil ──────────────────────────────────────────────────────── */
  if (nagot(text, ["leasing", "billeasing", "hyrbil", "personbil"])) {
    varningar.push({
      allvar: "medel",
      text: "Personbil: momsen på leasingavgiften är avdragsgill till hälften, och vid köp av personbil inte alls.",
      atgard: "Halvera momsavdraget om det här är en leasad personbil.",
    });
    if (momsAvdrag) momsAvdrag = r2(momsAvdrag / 2);
  }

  /* ── 5. Privat andel ───────────────────────────────────────────────────── */
  if (andel < 1) {
    avdragsgill = avdragsgill === "nej" ? "nej" : "delvis";
    skal.push(`Bara ${Math.round(andel * 100)} % räknas som verksamhetens — resten är privat och dras inte av.`);
  }

  return klart({ avdragsgill, momsAvdrag, behandling, skal, varningar, brutto, andel });
}

function klart({ avdragsgill, momsAvdrag, behandling, skal, varningar, brutto, andel }) {
  /* Kostnadsavdraget är bruttot minus den moms som faktiskt dras av, gånger
     verksamhetens andel. Är momsavdraget okänt är kostnaden det också. */
  let kostnad = null;
  if (brutto != null && momsAvdrag != null) {
    kostnad = avdragsgill === "nej" ? 0 : r2(brutto * andel - momsAvdrag);
  }
  return {
    avdragsgill,
    moms_avdrag: momsAvdrag == null ? null : r2(momsAvdrag),
    kostnad_avdrag: kostnad,
    behandling,
    skal,
    varningar,
    /* Summan som riskerar att gå förlorad om varningarna inte åtgärdas. */
    pa_spel: r2(varningar.reduce((a, v) => a + (v.belopp || 0), 0)),
  };
}
