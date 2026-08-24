/* ═════════════════════════════════════════════════════════════════════════════
   lib/moms-status.js — vilka momsperioder som är lämnade och vilka som inte är det
   ─────────────────────────────────────────────────────────────────────────────
   Bakgrunden: appen visste när deadlinen var — 17 augusti 2026 stod i
   lib/seed-deadlines.js — men den visste aldrig om något faktiskt hade lämnats.
   getMomsPeriod() räknade fram `filed` ur `receipts.every(r => r.locked_at)`, och
   kolumnen locked_at finns inte på studio_receipts. Uttrycket blev alltså alltid
   false, ingen kunde agera på det, och en missad första momsdeklaration passerade
   utan ett ord. Förseningsavgiften är 625 kr och tas ut även på en nolldeklaration.

   Att något är lämnat är ett faktum, inte en slutsats. Det registreras därför i
   studio_moms_perioder (migration 015) och läses härifrån.

   Rent räknande, inga databasanrop: allt går att testa.
   ═════════════════════════════════════════════════════════════════════════════ */

import { nastaBankdag } from "./helgdagar.js";

const pad = (n) => String(n).padStart(2, "0");

/** Kvartalet ett datum tillhör. */
export function kvartalAv(isoDate) {
  const y = +String(isoDate).slice(0, 4);
  const m = +String(isoDate).slice(5, 7);
  return { ar: y, kv: Math.floor((m - 1) / 3) + 1 };
}

/** Kvartalets gränser och nyckel. */
export function kvartal(ar, kv) {
  const forstaManad = (kv - 1) * 3 + 1;
  const sistaManad = forstaManad + 2;
  const sistaDagen = new Date(Date.UTC(ar, sistaManad, 0)).getUTCDate();
  return {
    key: `${ar}-Q${kv}`,
    ar, kv,
    start: `${ar}-${pad(forstaManad)}-01`,
    end: `${ar}-${pad(sistaManad)}-${pad(sistaDagen)}`,
  };
}

/**
 * Sista dag att lämna momsdeklaration för ett kvartal vid kvartalsredovisning.
 *
 * Huvudregeln är den 12:e i den andra månaden efter kvartalets slut. Augusti är
 * undantaget: där använder Skatteverket den 17:e. Infaller dagen på en lördag,
 * söndag eller helgdag flyttas den till nästa bankdag.
 *
 *   Q1 → 12 maj      Q3 → 12 november
 *   Q2 → 17 augusti  Q4 → 12 februari året efter
 */
export function deadlineForKvartal(ar, kv) {
  /* Andra månaden efter kvartalets slut. Q4 hamnar i februari nästa år. */
  const manad = [5, 8, 11, 2][kv - 1];
  const deadlineAr = kv === 4 ? ar + 1 : ar;
  const dag = manad === 8 ? 17 : 12;
  return nastaBankdag(`${deadlineAr}-${pad(manad)}-${pad(dag)}`);
}

/**
 * @param {object} p
 * @param {string} p.registreradFrom   settings.vat_registered_from, "YYYY-MM-DD"
 * @param {string} [p.avregistreradFrom]
 * @param {string} p.idag              "YYYY-MM-DD"
 * @param {Array}  [p.lamnade]         rader ur studio_moms_perioder
 * @param {number} [p.varningsdagar=14] hur tidigt en deadline blir "brådskande"
 * @returns {{perioder: Array, forsenade: Array, nasta: object|null}}
 */
export function momsStatus({ registreradFrom, avregistreradFrom = null, idag, lamnade = [], varningsdagar = 14 }) {
  if (!registreradFrom) {
    return { perioder: [], forsenade: [], nasta: null, saknarRegistreringsdatum: true };
  }

  const lamnadPer = new Map();
  for (const r of lamnade) if (r?.period_key) lamnadPer.set(r.period_key, r);

  const fran = kvartalAv(registreradFrom);
  const nu = kvartalAv(idag);
  const slut = avregistreradFrom ? kvartalAv(avregistreradFrom) : nu;

  const perioder = [];
  let { ar, kv } = fran;
  /* Till och med innevarande kvartal — det pågående tas med så att man ser att
     det finns, inte bara det som redan gått ut. */
  while (ar < nu.ar || (ar === nu.ar && kv <= nu.kv)) {
    if (ar > slut.ar || (ar === slut.ar && kv > slut.kv)) break;

    const q = kvartal(ar, kv);
    const deadline = deadlineForKvartal(ar, kv);
    const lamnadRad = lamnadPer.get(q.key) || null;
    const periodenSlut = idag > q.end;
    const dagarTill = dagarMellan(idag, deadline);

    let status;
    if (lamnadRad) status = "lämnad";
    else if (!periodenSlut) status = "pågående";
    else if (dagarTill < 0) status = "försenad";
    else if (dagarTill <= varningsdagar) status = "brådskande";
    else status = "öppen";

    perioder.push({
      ...q,
      deadline,
      status,
      dagar_till_deadline: dagarTill,
      dagar_forsenad: dagarTill < 0 ? -dagarTill : 0,
      lamnad_at: lamnadRad?.lamnad_at || null,
      belopp: lamnadRad?.belopp ?? null,
      /* Avgiften tas ut per utebliven deklaration, även om den visar noll
         eller ett återbetalningsbelopp. */
      forseningsavgift: dagarTill < 0 && !lamnadRad ? 625 : 0,
    });

    kv += 1;
    if (kv > 4) { kv = 1; ar += 1; }
  }

  const forsenade = perioder.filter((p) => p.status === "försenad");
  const nasta = perioder.find((p) => p.status === "brådskande" || p.status === "öppen")
             || perioder.find((p) => p.status === "pågående")
             || null;

  return { perioder, forsenade, nasta };
}

function dagarMellan(fran, till) {
  const a = Date.UTC(+fran.slice(0, 4), +fran.slice(5, 7) - 1, +fran.slice(8, 10));
  const b = Date.UTC(+till.slice(0, 4), +till.slice(5, 7) - 1, +till.slice(8, 10));
  return Math.round((b - a) / 86400000);
}
