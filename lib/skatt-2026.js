/* ═════════════════════════════════════════════════════════════════════════════
   lib/skatt-2026.js — inkomstskatt för enskild firma, inkomstår 2026
   ─────────────────────────────────────────────────────────────────────────────
   Ersätter estimateTax() i lib/swedish-tax.js, som räknade fel på tre sätt:

     1. eg = överskott × 28,97 %.  Fel underlag. Egenavgifter tas ut på
        överskottet EFTER schablonavdraget, inte före.
     2. schablon = eg × 25 %.  Fel bas. Schablonavdraget är 25 % av
        ÖVERSKOTTET, inte 25 % av egenavgifterna. På 300 000 kr blev
        avdraget 21 728 kr i stället för 75 000 kr.
     3. beskattningsbar = överskott − eg + schablon.  Man drar av
        schablonavdraget, inte de faktiska egenavgifterna. Här drogs bådadera,
        delvis, i fel ordning.

   Nettoeffekten på 300 000 kr överskott: den gamla funktionen sa ~157 000 kr
   skatt. Rätt siffra ligger nära 97 000 kr. Den bad alltså om att sätta undan
   drygt 60 % för mycket.

   Dessutom saknades nedsättningen av egenavgifter helt, och konstanterna var
   2025 års (skiktgräns 625 800, grundavdrag hårdkodat till 16 100).

   ── Vad som INTE räknas här ─────────────────────────────────────────────────
   JOBBSKATTEAVDRAGET. Det är en skattereduktion på arbetsinkomst, och aktiv
   näringsinkomst räknas som arbetsinkomst — så du får det. Formeln beror på
   prisbasbelopp, kommunalskattesats och ålder, och 2026 års regler är
   omarbetade; Skatteverket publicerar den i SKV 425. Jag vägrar gissa den och
   skriva in en påhittad siffra i ett bokföringsprogram.

   Följden är att siffran härifrån är ett TAK. Din verkliga skatt blir lägre,
   ofta med 20 000–30 000 kr vid medelinkomst. För "hur mycket ska jag lägga
   undan" är ett tak rätt håll att ha fel åt.

   Allmän pensionsavgift (7 %) räknas heller inte, eftersom den motsvaras av en
   lika stor skattereduktion och tar ut sig själv.

   Källor: Skatteverket, Belopp och procent inkomstår 2026; Skatteverket,
   Egenavgifter och särskild löneskatt.
   ═════════════════════════════════════════════════════════════════════════════ */

export const SKATT_2026 = {
  /* Egenavgifter, aktiv näringsverksamhet, född 1959 eller senare. */
  EGENAVGIFTER: 0.2897,
  /* Född 1938–1958, eller pensionär: bara ålderspensionsavgift. */
  EGENAVGIFTER_REDUCERAD: 0.1021,

  /* Schablonavdrag för egenavgifter — procent av överskottet FÖRE avdraget.
     Ingen takbelopp i kronor; taket är procentsatsen. */
  SCHABLON: 0.25,
  SCHABLON_REDUCERAD: 0.10,

  /* Nedsättning av egenavgifter: 7,5 % av underlaget, högst 15 000 kr per år,
     och bara om underlaget överstiger 40 000 kr. Gäller full avgift. */
  NEDSATTNING_PCT: 0.075,
  NEDSATTNING_MAX: 15000,
  NEDSATTNING_MIN_UNDERLAG: 40000,

  /* Statlig inkomstskatt: 20 % på beskattningsbar förvärvsinkomst över
     skiktgränsen. Brytpunkten (660 400) är samma gräns uttryckt före
     grundavdrag och används inte i räkningen — den är till för att prata om. */
  SKIKTGRANS: 643000,
  BRYTPUNKT: 660400,
  STATLIG: 0.20,

  /* Genomsnittlig kommunal skattesats i riket ligger nära 32,4 %.
     Malmö 2026 är 32,42 % (kommun + Region Skåne). Sätt din egen. */
  KOMMUNALSKATT_DEFAULT: 0.3242,
};

/* ── Grundavdrag 2026 ────────────────────────────────────────────────────────
   Trappan, uttryckt i kronor i stället för prisbasbelopp så att den går att
   läsa och kontrollera mot Skatteverkets publicerade punkter:

     inkomst < 25 100        grundavdrag = inkomst   (man beskattas inte alls)
     25 100 – 58 500         25 100                  (platå)
     58 500 – 161 000        25 100 + 20 % över 58 500
     161 000 – 184 900       45 600                  (maxplatå)
     184 900 – 466 000       45 600 − 10 % över 184 900
     över 466 000            17 400                  (golv)

   Avrundas nedåt till hela hundratal, vilket är vad de publicerade punkterna
   visar (234 000 → 40 600, inte 40 700).
   ────────────────────────────────────────────────────────────────────────── */
export function grundavdrag2026(fastställdInkomst) {
  const i = Math.max(0, Number(fastställdInkomst) || 0);
  let ga;
  if (i < 25100)       ga = i;
  else if (i <= 58500) ga = 25100;
  else if (i <= 161000) ga = 25100 + 0.20 * (i - 58500);
  else if (i <= 184900) ga = 45600;
  else if (i <= 466000) ga = 45600 - 0.10 * (i - 184900);
  else                  ga = 17400;
  /* Golvet gäller även om trappan skulle räkna lägre. */
  if (i >= 25100) ga = Math.max(17400, ga);
  return Math.floor(ga / 100) * 100;
}

/**
 * Beräkna inkomstskatt och egenavgifter på ett överskott av näringsverksamhet.
 *
 * @param {number} overskott  överskottet före schablonavdrag (R-raden på NE)
 * @param {object} [opts]
 * @param {number} [opts.kommunalskatt]  t.ex. 0.3242 för Malmö
 * @param {boolean} [opts.reduceradAvgift]  född 1938–1958 eller pensionär
 * @param {number} [opts.ovrigTjansteinkomst]  lön eller pension vid sidan om,
 *        som påverkar grundavdraget och skiktgränsen
 */
export function beraknaSkatt(overskott, opts = {}) {
  const k = SKATT_2026;
  const vinst = Math.max(0, Number(overskott) || 0);
  const kommunSats = Number(opts.kommunalskatt ?? k.KOMMUNALSKATT_DEFAULT);
  const reducerad = !!opts.reduceradAvgift;
  const ovrig = Math.max(0, Number(opts.ovrigTjansteinkomst) || 0);

  /* 1. Schablonavdrag — procent av överskottet före avdraget. */
  const schablon = Math.round(vinst * (reducerad ? k.SCHABLON_REDUCERAD : k.SCHABLON));

  /* 2. Underlaget för egenavgifter är överskottet efter schablonavdraget. */
  const underlag = Math.max(0, vinst - schablon);

  /* 3. Egenavgifter, med nedsättning där den gäller. */
  const avgiftBrutto = underlag * (reducerad ? k.EGENAVGIFTER_REDUCERAD : k.EGENAVGIFTER);
  const nedsattning = (!reducerad && underlag > k.NEDSATTNING_MIN_UNDERLAG)
    ? Math.min(underlag * k.NEDSATTNING_PCT, k.NEDSATTNING_MAX)
    : 0;
  const egenavgifter = Math.max(0, Math.round(avgiftBrutto - nedsattning));

  /* 4. Fastställd förvärvsinkomst = näringsöverskottet efter schablonavdrag,
        plus eventuell tjänsteinkomst vid sidan om. */
  const faststalld = underlag + ovrig;

  /* 5. Grundavdrag, sedan beskattningsbar förvärvsinkomst. */
  const ga = grundavdrag2026(faststalld);
  const beskattningsbar = Math.max(0, faststalld - ga);

  /* 6. Kommunal och statlig inkomstskatt. */
  const kommunalskatt = Math.round(beskattningsbar * kommunSats);
  const statligskatt = beskattningsbar > k.SKIKTGRANS
    ? Math.round((beskattningsbar - k.SKIKTGRANS) * k.STATLIG)
    : 0;

  const total = egenavgifter + kommunalskatt + statligskatt;

  return {
    overskott: vinst,
    schablonavdrag: schablon,
    avgiftsunderlag: underlag,
    egenavgifter,
    nedsattning: Math.round(nedsattning),
    fastastalld_inkomst: faststalld,
    grundavdrag: ga,
    beskattningsbar_inkomst: beskattningsbar,
    kommunalskatt,
    statligskatt,
    total_skatt: total,
    /* Andel av överskottet som bör läggas undan. */
    andel_av_overskott: vinst ? Math.round((total / vinst) * 1000) / 10 : 0,
    /* Sagt rakt ut, så att inget lager längre upp låtsas att detta är exakt. */
    jobbskatteavdrag_ej_medraknat: true,
    ar_ett_tak: true,
    kommunalskattesats: kommunSats,
  };
}
