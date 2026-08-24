/* ═════════════════════════════════════════════════════════════════════════════
   lib/helgdagar.js — svenska helgdagar och bankdagar
   ─────────────────────────────────────────────────────────────────────────────
   Behövs för att en deklarations- eller betalningsdag som infaller på en lördag,
   söndag eller helgdag flyttas fram till nästa vardag. Utan den här filen är
   varje deadline i appen en gissning som råkar stämma de flesta år.

   Datum hanteras som "YYYY-MM-DD"-strängar rakt igenom. Ingen Date-aritmetik med
   lokal tidzon, eftersom en helgdag är ett kalenderdatum och inte ett ögonblick.
   ═════════════════════════════════════════════════════════════════════════════ */

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** Påskdagen enligt den anonyma gregorianska algoritmen. Returnerar "YYYY-MM-DD". */
export function paskdagen(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

const dagar = (isoDate, n) => {
  const t = Date.UTC(+isoDate.slice(0, 4), +isoDate.slice(5, 7) - 1, +isoDate.slice(8, 10)) + n * 86400000;
  const d = new Date(t);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

/** Veckodag 0=söndag … 6=lördag, räknat i UTC så ingen sommartid stör. */
export function veckodag(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/** Lördagen i ett givet intervall — midsommar och alla helgons dag definieras så. */
function lordagenMellan(year, month, fromDay, toDay) {
  for (let d = fromDay; d <= toDay; d++) {
    const s = iso(year, month, d);
    if (veckodag(s) === 6) return s;
  }
  return null;
}

/**
 * Alla dagar under året då Skatteverkets förfallodagar flyttas fram.
 * Utöver de röda dagarna tas julafton, midsommarafton och nyårsafton med:
 * de är inte helgdagar men bankerna är stängda, och en betalning som ska vara
 * bokförd på skattekontot hinner inte fram.
 */
export function helgdagar(year) {
  const pask = paskdagen(year);
  const lista = [
    iso(year, 1, 1),            // nyårsdagen
    iso(year, 1, 6),            // trettondedag jul
    dagar(pask, -2),            // långfredagen
    pask,                       // påskdagen
    dagar(pask, 1),             // annandag påsk
    iso(year, 5, 1),            // första maj
    dagar(pask, 39),            // Kristi himmelsfärdsdag
    dagar(pask, 49),            // pingstdagen
    iso(year, 6, 6),            // nationaldagen
    lordagenMellan(year, 6, 19, 25),  // midsommarafton (fredagen) → se nedan
    lordagenMellan(year, 6, 20, 26),  // midsommardagen
    lordagenMellan(year, 10, 31, 31) || lordagenMellan(year, 11, 1, 6), // alla helgons dag
    iso(year, 12, 24),          // julafton — bankfri
    iso(year, 12, 25),          // juldagen
    iso(year, 12, 26),          // annandag jul
    iso(year, 12, 31),          // nyårsafton — bankfri
  ].filter(Boolean);

  /* Midsommarafton är fredagen före midsommardagen. Raden ovan gav en lördag;
     den korrigeras här hellre än att skrivas som ett svårläst uttryck. */
  const midsommardagen = lordagenMellan(year, 6, 20, 26);
  if (midsommardagen) lista.push(dagar(midsommardagen, -1));

  return [...new Set(lista)].sort();
}

const cache = new Map();
function helgdagsSet(year) {
  if (!cache.has(year)) cache.set(year, new Set(helgdagar(year)));
  return cache.get(year);
}

/** Är datumet en bankdag? Lördag, söndag och helgdag är det inte. */
export function arBankdag(isoDate) {
  const v = veckodag(isoDate);
  if (v === 0 || v === 6) return false;
  return !helgdagsSet(+isoDate.slice(0, 4)).has(isoDate);
}

/** Datumet självt om det är en bankdag, annars nästa bankdag efter det. */
export function nastaBankdag(isoDate) {
  let d = isoDate;
  for (let i = 0; i < 30; i++) {
    if (arBankdag(d)) return d;
    d = dagar(d, 1);
  }
  return d; // ska aldrig hända; 30 dagar i rad utan bankdag finns inte
}

export { dagar as plusDagar };
