/* scripts/backfill-fx.mjs — fill SEK amounts on foreign-currency rows.
 *
 *   cd ~/Downloads/nordbok_pwa_v2/studio-app
 *   node scripts/backfill-fx.mjs           # dry run
 *   node scripts/backfill-fx.mjs --write   # commit
 *
 * Run it in a SECOND terminal window — the first one is busy running the dev server.
 *
 * SELF-CONTAINED ON PURPOSE. It does not import lib/fx.js: package.json has no
 * "type": "module", so plain Node would treat that file as CommonJS and the import
 * would fail. The ECB logic is duplicated here rather than making a config change that
 * could ripple through the Next build.
 *
 * Rows it cannot price stay untouched and get listed at the end. lib/moms.js keeps
 * reporting them as unconverted and keeps fileReady false — a gap you can see beats a
 * number someone invented.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

/* Tar både --skriv och --write. Alla andra skript i projektet skriver bara med
   --skriv, och att just det här kräver engelska betyder att den som skriver
   --skriv får en torrkörning som ser ut som en riktig körning. */
const WRITE = process.argv.includes("--write") || process.argv.includes("--skriv");
const LOOKBACK = 10; // ECB publishes on TARGET business days only
const ECB = "https://data-api.ecb.europa.eu/service/data/EXR";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const kr = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const shift = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

const cache = new Map();

async function series(cur, from, to) {
  const key = `${cur}|${from}|${to}`;
  if (cache.has(key)) return cache.get(key);

  const res = await fetch(`${ECB}/D.${cur}.EUR.SP00.A?startPeriod=${from}&endPeriod=${to}&format=csvdata`, {
    headers: { Accept: "text/csv" },
  });
  if (!res.ok) throw new Error(`ECB ${res.status} for ${cur}`);

  const lines = (await res.text()).trim().split("\n");
  if (lines.length < 2) return [];

  const head = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const iT = head.indexOf("TIME_PERIOD"), iV = head.indexOf("OBS_VALUE");
  if (iT === -1 || iV === -1) throw new Error("ECB response shape changed");

  const rows = lines.slice(1)
    .map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")))
    .map((c) => ({ date: c[iT], value: Number(c[iV]) }))
    .filter((r) => r.date && Number.isFinite(r.value))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  cache.set(key, rows);
  return rows;
}

const onOrBefore = (rows, d) => rows.find((r) => r.date <= d) || null;

/** SEK per 1 unit of `cur` on `date`. Throws rather than guessing. */
async function sekRate(cur, date) {
  if (cur === "SEK") return { rate: 1, rateDate: date };
  const from = shift(date, -LOOKBACK);

  if (cur === "EUR") {
    const row = onOrBefore(await series("SEK", from, date), date);
    if (!row) throw new Error(`no ECB SEK/EUR within ${LOOKBACK} days of ${date}`);
    return { rate: row.value, rateDate: row.date };
  }

  const [sekRows, curRows] = await Promise.all([series("SEK", from, date), series(cur, from, date)]);
  const s = onOrBefore(sekRows, date), c = onOrBefore(curRows, date);
  if (!s || !c || !c.value) throw new Error(`no ECB observation for ${cur} near ${date}`);

  // Both legs must come from the same publication date or the cross-rate is inconsistent.
  const day = s.date < c.date ? s.date : c.date;
  const s2 = onOrBefore(sekRows, day), c2 = onOrBefore(curRows, day);
  if (!s2 || !c2 || !c2.value) throw new Error(`could not align ECB legs for ${cur} on ${day}`);

  return { rate: s2.value / c2.value, rateDate: day };
}

const failures = [];
let done = 0;

async function run(table, dateCol) {
  const { data, error } = await sb.from(table).select("*").neq("currency", "SEK").is("total_sek", null).order(dateCol);
  if (error) throw error;

  if (!data?.length) { console.log(`\n${table}: nothing to convert.`); return; }
  console.log(`\n${table}: ${data.length} rows\n`);

  for (const row of data) {
    const date = row[dateCol];
    const label = `${row.vendor || row.invoice_number || row.id} ${date}`.padEnd(36);
    if (!date) { failures.push({ label, why: "no payment date" }); console.log(`  ${label}SKIPPED — no payment date`); continue; }

    try {
      const { rate, rateDate } = await sekRate(row.currency, date);
      const totalSek = r2(Number(row.total || 0) * rate);
      const vatSek = r2(Number(row.vat_amount || 0) * rate);

      console.log(`  ${label}${row.currency} ${kr.format(row.total)}  →  ${kr.format(totalSek)} kr   1 ${row.currency} = ${rate.toFixed(4)} SEK (ECB, ${rateDate})`);

      if (WRITE) {
        const { error: e } = await sb.from(table)
          .update({ total_sek: totalSek, vat_sek: vatSek, fx_rate: rate, fx_source: "ecb", fx_date: rateDate })
          .eq("id", row.id);
        if (e) throw e;
      }
      done++;
    } catch (e) {
      failures.push({ label, why: e.message });
      console.log(`  ${label}SKIPPED — ${e.message}`);
    }
  }
}

await run("studio_receipts", "receipt_date");
await run("studio_invoices", "paid_at");

console.log(`\n${done} row${done === 1 ? "" : "s"} ${WRITE ? "written" : "would be written"}${failures.length ? `, ${failures.length} skipped` : ""}.`);
if (failures.length) {
  console.log("\nLeft flagged rather than guessed:");
  for (const f of failures) console.log(`  ${f.label} — ${f.why}`);
}
if (!WRITE && done) console.log("\nDry run. Re-run with --write to commit.");
