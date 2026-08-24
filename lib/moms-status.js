/* ═════════════════════════════════════════════════════════════════════════════
   lib/moms-status.js — vilka momsperioder som är lämnade och vilka som inte är det
   ─────────────────────────────────────────────────────────────────────────────
   Bakgrunden: appen visste när deadlinen var — 17 augusti 2026 stod i
   lib/seed-deadlines.js — men den visste aldrig om något faktiskt hade lämnats.
   getMomsPeriod() räknade fram `filed` ur `receipts.every(r => r.locked_at)`, och
   kolumnen locked_at finns inte på studio_receipts. Uttrycket blev alltså alltid
   false, ingen kunde agera på det, och en missad momsdeklaration passerade utan
   ett ord. Förseningsavgiften är 625 kr och tas ut även på en nolldeklaration.

   Att något är lämnat är ett faktum, inte en slutsats. Det registreras i
   studio_moms_perioder (migration 015) och läses härifrån.

   REDOVISNINGSPERIODEN ÄR INGET MAN GISSAR. Den här filen kunde först bara
   kvartal, därför att kvartal var vad jag antog. Skatteverket bestämmer den vid
   registreringen, och för en ny verksamhet under 1 Mkr är helår minst lika
   vanligt. Skillnaden är inte kosmetisk: samma verksamhet är antingen sju dagar
   försenad eller har åtta månader kvar. Perioden läses därför ur
   settings.vat_period_type (migration 016) och antas aldrig.

   Rent räknande, inga databasanrop: allt går att testa.
   ═════════════════════════════════════════════════════════════════════════════ */

import { nastaBankdag } from "./helgdagar.js";

const pad = (n) => String(n).padStart(2, "0");
const sistaDagen = (ar, manad) => new Date(Date.UTC(ar, manad, 0)).getUTCDate();

export const PERIODTYPER = ["manad", "kvartal", "helar"];

/* ── Perioder ──────────────────────────────────────────────────────────────── */

/** Kvartalet ett datum tillhör. */
export function kvartalAv(isoDate) {
  const y = +String(isoDate).slice(0, 4);
  const m = +String(isoDate).slice(5, 7);
  return { ar: y, kv: Math.floor((m - 1) / 3) + 1 };
}

export function kvartal(ar, kv) {
  const forsta = (kv - 1) * 3 + 1;
  const sista = forsta + 2;
  return {
    key: `${ar}-Q${kv}`, typ: "kvartal", ar, kv, nr: kv,
    start: `${ar}-${pad(forsta)}-01`,
    end: `${ar}-${pad(sista)}-${pad(sistaDagen(ar, sista))}`,
  };
}

export function manad(ar, m) {
  return {
    key: `${ar}-${pad(m)}`, typ: "manad", ar, nr: m,
    start: `${ar}-${pad(m)}-01`,
    end: `${ar}-${pad(m)}-${pad(sistaDagen(ar, m))}`,
  };
}

export function helar(ar) {
  return { key: `${ar}`, typ: "helar", ar, nr: 1, start: `${ar}-01-01`, end: `${ar}-12-31` };
}

/** Perioden ett datum tillhör, för en given typ. */
export function periodAv(typ, isoDate) {
  const y = +String(isoDate).slice(0, 4);
  const m = +String(isoDate).slice(5, 7);
  if (typ === "manad") return manad(y, m);
  if (typ === "helar") return helar(y);
  return kvartal(y, Math.floor((m - 1) / 3) + 1);
}

/** Nästa period efter en given. */
export function nastaPeriod(p) {
  if (p.typ === "manad") return p.nr === 12 ? manad(p.ar + 1, 1) : manad(p.ar, p.nr + 1);
  if (p.typ === "helar") return helar(p.ar + 1);
  return p.nr === 4 ? kvartal(p.ar + 1, 1) : kvartal(p.ar, p.nr + 1);
}

/* ── Deadlines ─────────────────────────────────────────────────────────────── */

/**
 * Sista dag att lämna momsdeklaration för en period.
 *
 *   kvartal            12:e i andra månaden efter kvartalets slut; augusti → 17:e
 *   månad, < 40 Mkr    12:e i andra månaden efter; januari och augusti → 17:e
 *   månad, ≥ 40 Mkr    26:e i månaden efter; december → 27:e
 *   helår utan EU-handel   12 maj året efter
 *   helår med EU-handel    26 februari året efter
 *
 * Infaller dagen på lördag, söndag eller helgdag flyttas den till nästa bankdag.
 *
 * @param {object} period            från kvartal()/manad()/helar()
 * @param {object} [opts]
 * @param {boolean} [opts.euHandel]  påverkar bara helår
 * @param {boolean} [opts.storOmsattning]  omsättning ≥ 40 Mkr, påverkar bara månad
 */
export function deadlineFor(period, opts = {}) {
  const { ar, nr, typ } = period;

  if (typ === "helar") {
    return nastaBankdag(opts.euHandel ? `${ar + 1}-02-26` : `${ar + 1}-05-12`);
  }

  if (typ === "manad") {
    if (opts.storOmsattning) {
      /* 26:e i månaden EFTER perioden; december har 27:e. */
      const m = nr === 12 ? 1 : nr + 1;
      const y = nr === 12 ? ar + 1 : ar;
      return nastaBankdag(`${y}-${pad(m)}-${pad(nr === 12 ? 27 : 26)}`);
    }
    /* 12:e i ANDRA månaden efter; januari och augusti har 17:e. */
    const rullande = nr + 2;
    const m = ((rullande - 1) % 12) + 1;
    const y = ar + Math.floor((rullande - 1) / 12);
    return nastaBankdag(`${y}-${pad(m)}-${pad(m === 1 || m === 8 ? 17 : 12)}`);
  }

  /* Kvartal: Q1→maj, Q2→augusti, Q3→november, Q4→februari året efter. */
  const m = [5, 8, 11, 2][nr - 1];
  const y = nr === 4 ? ar + 1 : ar;
  return nastaBankdag(`${y}-${pad(m)}-${pad(m === 8 ? 17 : 12)}`);
}

/** Kvar för bakåtkompatibilitet och för att kvartal är det vanligaste fallet. */
export function deadlineForKvartal(ar, kv) {
  return deadlineFor(kvartal(ar, kv));
}

/* ── Status ────────────────────────────────────────────────────────────────── */

/**
 * @param {object} p
 * @param {string} p.registreradFrom   settings.vat_registered_from
 * @param {string} [p.avregistreradFrom]
 * @param {string} p.idag              "YYYY-MM-DD"
 * @param {string} [p.periodTyp]       'manad' | 'kvartal' | 'helar'
 * @param {boolean} [p.euHandel]
 * @param {boolean} [p.storOmsattning]
 * @param {Array}  [p.lamnade]         rader ur studio_moms_perioder
 * @param {number} [p.varningsdagar=14]
 */
export function momsStatus({
  registreradFrom,
  avregistreradFrom = null,
  idag,
  periodTyp = null,
  euHandel = false,
  storOmsattning = false,
  lamnade = [],
  varningsdagar = 14,
}) {
  if (!registreradFrom) {
    return { perioder: [], forsenade: [], nasta: null, saknarRegistreringsdatum: true };
  }
  /* Utan känd redovisningsperiod vore varje deadline ett antagande. Hellre
     ingenting än en röd varning byggd på en gissning. */
  if (!periodTyp) {
    return { perioder: [], forsenade: [], nasta: null, saknarPeriodTyp: true };
  }
  if (!PERIODTYPER.includes(periodTyp)) {
    return { perioder: [], forsenade: [], nasta: null, okandPeriodTyp: periodTyp };
  }

  const opts = { euHandel, storOmsattning };
  const lamnadPer = new Map();
  for (const r of lamnade) if (r?.period_key) lamnadPer.set(r.period_key, r);

  const forsta = periodAv(periodTyp, registreradFrom);
  const sistaMojliga = periodAv(periodTyp, avregistreradFrom || idag);
  const nuvarande = periodAv(periodTyp, idag);
  const slut = avregistreradFrom && sistaMojliga.end < nuvarande.end ? sistaMojliga : nuvarande;

  const perioder = [];
  let p = forsta;
  for (let vakt = 0; vakt < 600 && p.start <= slut.start; vakt++) {
    const deadline = deadlineFor(p, opts);
    const rad = lamnadPer.get(p.key) || null;
    const periodenSlut = idag > p.end;
    const dagarTill = dagarMellan(idag, deadline);

    let status;
    if (rad) status = "lämnad";
    else if (!periodenSlut) status = "pågående";
    else if (dagarTill < 0) status = "försenad";
    else if (dagarTill <= varningsdagar) status = "brådskande";
    else status = "öppen";

    perioder.push({
      key: p.key, typ: p.typ, ar: p.ar, nr: p.nr, start: p.start, end: p.end,
      deadline,
      status,
      dagar_till_deadline: dagarTill,
      dagar_forsenad: dagarTill < 0 ? -dagarTill : 0,
      lamnad_at: rad?.lamnad_at || null,
      belopp: rad?.belopp ?? null,
      /* Avgiften tas ut per utebliven deklaration, även om den visar noll
         eller ett återbetalningsbelopp. */
      forseningsavgift: dagarTill < 0 && !rad ? 625 : 0,
    });

    p = nastaPeriod(p);
  }

  const forsenade = perioder.filter((x) => x.status === "försenad");
  const nasta = perioder.find((x) => x.status === "brådskande" || x.status === "öppen")
             || perioder.find((x) => x.status === "pågående")
             || null;

  return { perioder, forsenade, nasta, periodTyp };
}

function dagarMellan(fran, till) {
  const a = Date.UTC(+fran.slice(0, 4), +fran.slice(5, 7) - 1, +fran.slice(8, 10));
  const b = Date.UTC(+till.slice(0, 4), +till.slice(5, 7) - 1, +till.slice(8, 10));
  return Math.round((b - a) / 86400000);
}
