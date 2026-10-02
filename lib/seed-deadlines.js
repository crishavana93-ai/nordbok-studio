/* ═════════════════════════════════════════════════════════════════════════════
   lib/seed-deadlines.js — de skattedatum som läggs in i uppgiftslistan
   ─────────────────────────────────────────────────────────────────────────────
   Den här filen la in fyra kvartalsvisa momsdeklarationer oavsett vad
   verksamheten faktiskt har för redovisningsperiod. Sedan migration 016 står den
   i settings.vat_period_type, och två källor som säger olika saker om samma
   deadline är värre än en enda ungefärlig — det är den synligaste av dem man
   litar på, och det var den hårdkodade.

   Nu härleds momsdatumen ur lib/moms-status.js, samma funktion som bannern och
   npm run momsstatus använder. Är redovisningsperioden inte satt läggs inga
   momsrader in alls; i stället läggs en uppgift in om att ta reda på den.

   Tre andra fel som satt här samtidigt:

   1. INGEN HÄNSYN TILL HELGER. Alla datum skrevs rakt av. 2 maj 2026 är en
      lördag, 17 januari 2027 en söndag. Skatteverkets datum flyttas till nästa
      bankdag; det gör de här nu också.

   2. F-SKATTEN LÅG FEL I JANUARI OCH AUGUSTI. Förfallodagen på skattekontot är
      den 12:e — utom i januari och augusti, då den är den 17:e. Alla tolv
      månader låg på den 12:e.

   3. KONTROLLUPPGIFTER 31 JANUARI. En enskild firma utan anställda lämnar inga
      kontrolluppgifter för löner; sedan 2019 sker det via arbetsgivar-
      deklaration på individnivå, och bara om man betalar ut ersättning. Raden
      var en påminnelse om något som aldrig skulle hända, varje år. Borttagen.

   Periodisk sammanställning läggs inte in ännu — dess datum har jag inte
   kontrollerat mot Skatteverket, och en gissning här vore precis det problem
   filen just blivit av med.
   ═════════════════════════════════════════════════════════════════════════════ */

import { nastaBankdag } from "./helgdagar.js";
import { momsStatus } from "./moms-status.js";

const pad = (n) => String(n).padStart(2, "0");

const MANADSNAMN = [
  "januari", "februari", "mars", "april", "maj", "juni",
  "juli", "augusti", "september", "oktober", "november", "december",
];

const PERIODNAMN = { manad: "månadsmoms", kvartal: "kvartalsmoms", helar: "årsmoms" };

/**
 * Uppgifter att lägga in för ett år.
 *
 * @param {number} year
 * @param {string} userId
 * @param {object} [settings]  studio_settings — avgör vilka momsdatum som gäller
 */
export function buildTaxYearDeadlines(year, userId, settings = null) {
  const mk = (date, title, category = "tax_deadline", priority = "high", description = "", extra = {}) => {
    /* Varje datum genom bankdagskalendern. Ett förfallodatum på en lördag är
       inte ett förfallodatum. */
    const d = nastaBankdag(date);
    return {
      user_id: userId, title, description,
      due_at: new Date(`${d}T08:00:00+01:00`).toISOString(),
      remind_at: new Date(new Date(`${d}T08:00:00+01:00`).getTime() - 7 * 86400000).toISOString(),
      category, priority, source: "system",
      ...extra,
    };
  };

  /* Hela kartan över skyldigheter för en enskild firma, inte bara moms och
     F-skatt. Varje rad säger vad som krävs och vad det kostar att missa den —
     det är skillnaden mellan en kalender och en guide. Datum som Skatteverket
     ännu inte publicerat är markerade "kontrollera". */
  const uppgifter = [
    mk(`${year}-02-12`, "Fyllnadsinbetalning — kvarskatt över 30 000 kr",
       "tax_deadline", "normal",
       `Räknar du med mer än 30 000 kr i kvarskatt för ${year - 1}? Betala in överskjutande del till skattekontot senast i dag, ` +
       "annars löper kostnadsränta (2,5 %) från den 13 februari. Gäller inte om preliminärskatten redan täcker."),
    mk(`${year}-05-02`, "Inkomstdeklaration 1 + NE-bilaga",
       "tax_deadline", "high",
       `Deklarera ${year - 1} med NE-bilaga (SKV 2161). Underlag: förenklat årsbokslut, resultatet i appen, lagervärde, egenavgifter. ` +
       "Förseningsavgift 1 250 kr, upp till 3 750 kr. Skattetillägg 40 % på oredovisad inkomst."),
    mk(`${year}-05-02`, "Fyllnadsinbetalning — resterande kvarskatt",
       "tax_deadline", "normal",
       `Kvarskatt upp till 30 000 kr för ${year - 1} betalas senast i dag för att slippa kostnadsränta. Betala till skattekontot.`),
    mk(`${year}-09-12`, "Slutlig skatt — kontrollera skattekontot",
       "tax_deadline", "normal",
       `Slutskattebeskedet för ${year - 1} kom i juni eller augusti. Eventuell kvarskatt förfaller ungefär 90 dagar efter beskedet. ` +
       "Efter förfallodagen 17,5 % kostnadsränta, därefter Kronofogden. Kontrollera datumet på beskedet."),
    mk(`${year}-11-30`, `Ny preliminär inkomstdeklaration för ${year + 1}`,
       "tax_deadline", "normal",
       `Skatteverket räknar nästa års F-skatt på förra årets resultat med påslag. Blir ${year + 1} tydligt bättre eller sämre: ` +
       "lämna en preliminär inkomstdeklaration (SKV 4314) så att månadsbeloppet stämmer. Annars kvarskatt med ränta, eller onödigt hög inbetalning hela året."),
    mk(`${year}-12-31`, "Bokslut — periodisera obetalda fakturor",
       "filing", "high",
       "Även med kontantmetoden ska alla obetalda kund- och leverantörsfakturor per 31 december bokföras på det år de hör till (BFL 5 kap. 2 §, K1 p. 4.8). " +
       "Belopp under 5 000 kr får lämnas."),
    mk(`${year}-12-31`, "Bokslut — inventera lagret",
       "filing", "normal",
       "Räkna varulagret fysiskt den 31 december och skriv under listan. Lager under 5 000 kr får kostnadsföras direkt. " +
       "Värdera till lägst av anskaffningsvärde och nettoförsäljningsvärde, eller 97 %-schablonen. Gäller bara om du håller varor för försäljning."),
    mk(`${year}-12-31`, "Bokslut — inventarier och fondval",
       "filing", "normal",
       "Inköp under ett halvt prisbasbelopp (29 600 kr för 2026) kostnadsförs direkt, större skrivs av. " +
       "Ta ställning till periodiseringsfond (högst 30 % av resultatet), räntefördelning och expansionsfond — det styr årets skatt. Stäm av med Skatteverkets vägledning."),
  ];

  /* ── Moms: ur den faktiska redovisningsperioden ──────────────────────────── */
  uppgifter.push(...momsuppgifter(year, userId, settings, mk));

  /* ── F-skatt: skattekontots förfallodag är den 12:e, utom januari och
        augusti då den är den 17:e. ─────────────────────────────────────────── */
  for (let m = 0; m < 12; m++) {
    const dag = (m === 0 || m === 7) ? 17 : 12;
    uppgifter.push(mk(
      `${year}-${pad(m + 1)}-${pad(dag)}`,
      `Betala F-skatt — ${MANADSNAMN[m]}`,
      "tax_deadline", "high",
      "Debiterad preliminärskatt till Skatteverkets bankgiro 5050-1055. Betalningen måste vara bokförd på skattekontot senast på förfallodagen — det räcker inte att den skickas samma dag. Ingen förseningsavgift, men 17,5 % kostnadsränta på det som saknas.",
      { recurring_rule: "FREQ=MONTHLY", remind_at: new Date(new Date(`${nastaBankdag(`${year}-${pad(m + 1)}-${pad(dag)}`)}T08:00:00+01:00`).getTime() - 3 * 86400000).toISOString() },
    ));
  }

  return uppgifter;
}

/** Momsdeklarationerna för året, enligt verksamhetens redovisningsperiod. */
function momsuppgifter(year, userId, settings, mk) {
  const typ = settings?.vat_period_type;
  const registrerad = settings?.vat_registered_from;

  /* Inte momsregistrerad: inga momsdeklarationer att påminna om. */
  if (!registrerad) return [];

  if (!typ) {
    return [mk(
      `${year}-01-15`,
      "Ta reda på din redovisningsperiod för moms",
      "tax_deadline", "high",
      "Står på momsregistreringsbeviset under \"Redovisningsperiod\": månad, kvartal eller helår. " +
      "Utan den kan appen inte säga när momsdeklarationen ska lämnas, och lägger därför inte in några " +
      "momsdatum alls. Ange den under Inställningar → Moms och redovisning.",
    )];
  }

  /* Samma funktion som bannern och npm run momsstatus. En källa, inte tre. */
  const { perioder } = momsStatus({
    registreradFrom: registrerad,
    avregistreradFrom: settings?.vat_dereg_from,
    periodTyp: typ,
    euHandel: !!settings?.vat_eu_trade,
    storOmsattning: !!settings?.vat_large_turnover,
    /* Sista dagen på året, så att årets alla perioder kommer med — även de
       vars deadline ligger i januari eller februari året efter. */
    idag: `${year}-12-31`,
  });

  return perioder
    .filter((p) => p.ar === year)
    .map((p) => mk(
      p.deadline,
      `Momsdeklaration ${p.key}`,
      "tax_deadline", "high",
      `Perioden ${p.start} – ${p.end} (${PERIODNAMN[typ] || typ}). ` +
      "Deklarationen ska lämnas även om den visar noll eller ett belopp att få tillbaka — " +
      "förseningsavgiften är 625 kr per utebliven deklaration.",
    ));
}
