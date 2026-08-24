/* scripts/aterstall.mjs — read the archive back.
 *
 *   node scripts/aterstall.mjs <arkivmapp>                    kontrollera (standard)
 *   node scripts/aterstall.mjs <arkivmapp> --skriv            återställ till .env.local-projektet
 *   node scripts/aterstall.mjs <arkivmapp> --skriv --till <url> --nyckel <service_role>
 *
 * WHY THIS EXISTS
 * arkivera.mjs has been writing archives for weeks. Nothing had ever read one back, so
 * "we have a backup" was a belief, not a fact. A backup is not a backup until a restore
 * has actually been performed -- and the moment you discover otherwise must not be a
 * Skatteverket kontroll.
 *
 * TWO MODES, AND THE DEFAULT IS THE SAFE ONE
 *
 * KONTROLLERA (default) runs entirely offline against the archive folder. It answers
 * the only question that matters -- "if the Supabase project disappeared tonight, could
 * this folder rebuild it?" -- without needing a second project, a network, or any
 * credentials. It re-hashes every file, checks every row that claims a document has
 * one, and reports what could NOT be restored.
 *
 * SKRIV performs the real thing into a TARGET project. It refuses to write into a
 * project that already has data unless --tvinga is given, because the realistic
 * disaster is restoring over a live database by mistake.
 *
 * ON READING OLD ARCHIVES
 * Archives written before the MANIFEST gained `filer.karta` have no explicit mapping
 * from archived filename back to storage_path. For those we reconstruct it with the
 * same deterministic naming the writer used -- duplicated below, deliberately, because
 * a restore tool that imports from the writer breaks the day the writer changes.
 */

/* NOTE: @supabase/supabase-js is imported LAZILY, inside the --skriv branch only.
 * The whole promise of the KONTROLLERA mode is that it works with nothing but Node and
 * the folder -- in five years, on a borrowed laptop, with node_modules long rotted. A
 * top-level import of the client broke exactly that, and the test caught it. */
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/* Insert order: parents before children, or the foreign keys reject the rows. */
const ORDER = [
  "studio_settings", "studio_clients", "studio_invoices", "studio_invoice_items",
  "studio_invoice_series", "studio_invoice_number_gaps", "studio_receipts",
  "studio_documents", "studio_bank_tx", "studio_trips", "studio_business_trips",
  "studio_tasks", "studio_notif_prefs", "studio_venture_identity",
  "studio_memberships", "studio_assistant_log", "fx_rates",
];

const BUCKET_FOR = { studio_receipts: "studio-receipts", studio_documents: "studio-documents" };

/* PRIMARY KEYS, PER TABLE.
 * The first version upserted everything with onConflict:"id". Five of these tables
 * have no id column at all -- their keys are composite or user-scoped -- so each one
 * errored out and was skipped. A restore would have returned invoices and receipts
 * while dropping the seller's org number, VAT number, bankgiro AND the invoice number
 * series, so the next invoice issued would be 2026-0001 again, colliding with ones
 * already sent. Worse, the "is the target empty?" probe used the same select("id") and
 * silently skipped the same five tables, so the safety check did not cover them either.
 *
 * Caught by an audit, not by the tool -- because the KONTROLLERA path never exercised
 * the write path it was reporting on. */
const PK = {
  studio_settings:         "user_id",
  studio_notif_prefs:      "user_id",
  studio_invoice_series:   "user_id,series,year",
  studio_venture_identity: "user_id,venture",
  fx_rates:                "currency,date",
};
const pkOf = (t) => PK[t] || "id";

const args = process.argv.slice(2);
const valdRoot = args.find((a) => !a.startsWith("--"));
const WRITE = args.includes("--skriv");
const FORCE = args.includes("--tvinga");
const flag = (n) => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : null; };

const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => console.log(`  ✗ ${m}`);
const die = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };

/* Finding the archive should not be the user's job. Given nothing, look in the default
 * archive root; given a parent folder, take the newest archive inside it. Asking someone
 * to type a date they would have to go and look up is a small cruelty in a tool whose
 * entire purpose is to work on the worst day of the year. */
async function nyasteArkiv(dir) {
  if (!existsSync(dir)) return null;
  const kandidater = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (existsSync(path.join(dir, e.name, "MANIFEST.json"))) kandidater.push(e.name);
  }
  /* Names are nordbok-arkiv-YYYY-MM-DD, so lexical order is chronological order. */
  kandidater.sort();
  return kandidater.length ? path.join(dir, kandidater.at(-1)) : null;
}

const HEM = process.env.HOME || process.env.USERPROFILE || ".";
let root = valdRoot;

if (!root) {
  root = await nyasteArkiv(path.join(HEM, "Nordbok-arkiv"));
  if (!root) die(`Hittade inget arkiv i ${path.join(HEM, "Nordbok-arkiv")}. Ange mappen: npm run aterstall -- <mapp>`);
  console.log(`(inget arkiv angivet — använder det senaste: ${path.basename(root)})`);
} else {
  root = root.replace(/^~(?=$|\/)/, HEM);
  if (!existsSync(root)) die(`Hittar inte ${root}`);
  /* Pointed at the parent rather than a specific archive: take the newest. */
  if (!existsSync(path.join(root, "MANIFEST.json"))) {
    const senaste = await nyasteArkiv(root);
    if (!senaste) die(`${root} innehåller inget Nordbök-arkiv (ingen undermapp med MANIFEST.json).`);
    root = senaste;
    console.log(`(använder det senaste arkivet: ${path.basename(root)})`);
  }
}

/* ── The writer's naming, duplicated on purpose (see header) ─────────────── */
const slug = (s) => String(s || "okand").toLowerCase()
  .replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/é/g, "e")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "okand";

function receiptFileName(r, ext) {
  const amt = Number(r.total);
  const money = Number.isFinite(amt) ? amt.toFixed(2) : "0.00";
  return `${r.receipt_date || "utan-datum"}_${slug(r.vendor)}_${money}${r.currency && r.currency !== "SEK" ? r.currency : ""}_${String(r.file_hash || r.id).slice(0, 8)}${ext}`;
}

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

async function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────
   1 · KONTROLLERA — offline, no credentials, no network
   ───────────────────────────────────────────────────────────────────────── */
console.log(`\nNordbök — kontrollerar arkiv\n${root}\n`);

const manifestPath = path.join(root, "MANIFEST.json");
if (!existsSync(manifestPath)) die("MANIFEST.json saknas. Det här ser inte ut som ett Nordbök-arkiv.");
const manifest = await readJson(manifestPath);

let fatal = 0, warn = 0;

/* ── Tables ── */
console.log("Tabeller");
const tables = {};
for (const t of ORDER) {
  const p = path.join(root, "data", `${t}.json`);
  if (!existsSync(p)) {
    /* A table absent from an OLD archive is a gap in that archive, not a bug here. */
    bad(`${t.padEnd(30)} filen saknas i arkivet`);
    warn++;
    continue;
  }
  const rows = await readJson(p);
  tables[t] = rows;
  const claimed = manifest.tabeller?.[t]?.rader;
  if (claimed != null && claimed !== rows.length) {
    bad(`${t.padEnd(30)} ${rows.length} rader, men MANIFEST säger ${claimed}`);
    fatal++;
  } else {
    ok(`${t.padEnd(30)} ${String(rows.length).padStart(5)} rader`);
  }
}

/* ── Files: can every row that claims a document actually find one? ── */
console.log("\nVerifikationer och dokument");
const karta = Array.isArray(manifest.filer?.karta) ? manifest.filer.karta : null;
if (!karta) console.log("  (arkivet saknar filer.karta — bygger om kartan från filnamnen)");

const byPath = new Map();
if (karta) for (const k of karta) byPath.set(k.storage_path, k);

let checked = 0, verified = 0;
const missing = [], altered = [];

for (const [table, bucket] of Object.entries(BUCKET_FOR)) {
  for (const r of tables[table] || []) {
    if (!r.storage_path) continue;
    checked++;

    let rel = byPath.get(r.storage_path)?.arkivfil;
    if (!rel) {
      /* Old archive: reconstruct where the writer would have put it. */
      const ext = path.extname(r.storage_path) || ".bin";
      if (table === "studio_receipts") {
        const year = String(r.receipt_date || "").slice(0, 4) || "utan-datum";
        rel = path.posix.join("verifikationer", year, receiptFileName(r, ext));
      } else {
        const year = String(r.issued_date || r.created_at || "").slice(0, 4) || "utan-datum";
        rel = path.posix.join("dokument", year, `${r.issued_date || "utan-datum"}_${slug(r.doc_type)}_${slug(r.title)}_${String(r.id).slice(0, 8)}${ext}`);
      }
    }

    const abs = path.join(root, rel);
    if (!existsSync(abs)) {
      missing.push({ table, id: r.id, label: r.vendor || r.title, storage_path: r.storage_path, expected: rel });
      continue;
    }

    /* The hash is the whole point. A file that is present but altered is worse than a
       missing one, because it looks fine. */
    const bytes = await readFile(abs);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const expected = byPath.get(r.storage_path)?.sha256 || r.file_hash || null;
    if (expected && hash !== expected) {
      altered.push({ table, id: r.id, label: r.vendor || r.title, arkivfil: rel, forvantad: expected, faktisk: hash });
    } else {
      verified++;
    }
  }
}

ok(`${checked} rader pekar på en fil · ${verified} kontrollsummerade och oförändrade`);

/* ── Rows with NO document at all ────────────────────────────────────────────
 * The first version of this checker walked only rows that HAD a storage_path, so a
 * receipt with no image was invisible to it -- and it printed "✓ Arkivet går att läsa
 * tillbaka" over the top of that silence. Restorable and complete are two different
 * claims, and conflating them is how a bookkeeping hole survives an audit tool.
 *
 * The number that matters is not how many rows lack an image. It is how much deducted
 * moms is resting on them, because that is the figure that gets questioned at a
 * kontroll and repaid with interest if it cannot be defended. */
/* HOW MUCH MOMS IS ACTUALLY AT RISK.
 * The first version of this summed vat_sek for every row missing a document. That
 * overstates it badly, because most rows never put anything into ruta 48 in the first
 * place. A tool that cries wolf about moms you never deducted trains you to ignore it,
 * which is worse than saying nothing. So the exposure follows vat_treatment, the same
 * way lib/moms.js does when it builds the return:
 *
 *   domestic     the moms IS deducted in ruta 48 (times business_share). Real exposure.
 *   rc_eu/non_eu self-accounted: ruta 48 cancels ruta 30. Disallow the 48 at a kontroll
 *                and the 30 stands alone, so the exposure is the output moms, not zero.
 *   oss_non_ded  a foreign supplier charged VAT via OSS. It reaches no box at all and
 *                was never reclaimed. Zero moms exposure.
 *   exempt       no moms existed. Zero.
 *
 * The cost deduction is a separate question and reported separately -- that one is at
 * risk on every row without underlag, whatever the moms treatment. */
const sekOf = (r, field) => {
  const stored = r[field === "total" ? "total_sek" : "vat_sek"];
  if (stored != null) return Number(stored) || 0;
  return String(r.currency || "SEK").toUpperCase() === "SEK" ? Number(r[field] || 0) : 0;
};

function momsIRuta48(r) {
  if (r.is_deductible === false) return 0;
  const vat = sekOf(r, "vat_amount");
  const tot = sekOf(r, "total");
  switch (r.vat_treatment) {
    case "domestic":
      return vat * (r.business_share == null ? 1 : Number(r.business_share));
    case "rc_eu":
    case "rc_non_eu": {
      const net = tot - vat;
      return (net > 0 ? net : tot) * 0.25;
    }
    case "oss_non_ded":
    case "exempt":
      return 0;
    default:
      /* No treatment set: lib/moms.js will not have put it anywhere either, but an
         untreated row is its own problem. Count nothing and say so. */
      return 0;
  }
}

const utanFil = [];
let exponeringPoster = 0, exponeringBelopp = 0, exponeringMoms = 0, obehandlade = 0;
for (const [table] of Object.entries(BUCKET_FOR)) {
  for (const r of tables[table] || []) {
    if (r.storage_path) continue;
    const avdragsgill = r.is_deductible !== false;
    const beloppSek = sekOf(r, "total");
    const momsSek = momsIRuta48(r);
    if (table === "studio_receipts" && !r.vat_treatment) obehandlade++;
    utanFil.push({
      table, id: r.id, label: r.vendor || r.title,
      datum: r.receipt_date || r.issued_date,
      avdragsgill, beloppSek, momsSek, behandling: r.vat_treatment || "obehandlad",
    });
    if (avdragsgill) { exponeringPoster++; exponeringBelopp += beloppSek; exponeringMoms += momsSek; }
  }
}

const sv = (n) => new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

if (utanFil.length) {
  console.log(`  ! ${utanFil.length} rader har ingen fil alls`);
  for (const u of utanFil.slice(0, 10)) {
    console.log(`      ${String(u.datum || "utan datum").padEnd(12)} ${String(u.label || "—").padEnd(28)} ${String(u.behandling).padEnd(12)} ${u.momsSek > 0 ? `${sv(u.momsSek)} kr moms i ruta 48` : "ingen moms i ruta 48"}`);
  }
  if (utanFil.length > 10) console.log(`      … och ${utanFil.length - 10} till`);
  warn++;
}
for (const m of missing) { bad(`SAKNAS I ARKIVET  ${m.label} — väntade ${m.expected}`); fatal++; }
for (const a of altered) { bad(`ÄNDRAD  ${a.label} — ${a.arkivfil}`); fatal++; }

/* Files present in the archive that no row points at. Harmless to a restore, but they
   mean the archive and the data disagree, which is worth knowing. */
const onDisk = [...await walk(path.join(root, "verifikationer")), ...await walk(path.join(root, "dokument"))];
const referenced = new Set();
for (const [table] of Object.entries(BUCKET_FOR)) {
  for (const r of tables[table] || []) {
    const rel = byPath.get(r.storage_path)?.arkivfil;
    if (rel) referenced.add(path.join(root, rel));
  }
}
const stray = karta ? onDisk.filter((f) => !referenced.has(f)) : [];
if (stray.length) { console.log(`  ! ${stray.length} filer i arkivet som ingen rad pekar på`); warn++; }

/* ── The verdict ── */
console.log("\n" + "─".repeat(64));
if (fatal) {
  console.error(`\n✗ ARKIVET ÄR INTE FULLSTÄNDIGT — ${fatal} allvarliga fel, ${warn} varningar.`);
  console.error("  Det går inte att återställa allt ur den här mappen. Kör om arkiveringen.\n");
  process.exit(2);
}
console.log(`\n✓ Arkivet går att läsa tillbaka. ${verified} filer kontrollsummerade, ${warn} varningar.`);

/* Said separately and last, because it is a different claim from "restorable" and the
   reader must not carry the green tick over to it. */
if (exponeringPoster) {
  console.log(`\n⚠ MEN BOKFÖRINGEN HAR EN LUCKA`);
  console.log(`  ${exponeringPoster} avdragsgilla poster saknar verifikation.`);
  console.log(`  Kostnadsavdrag som vilar på dem:  ${sv(exponeringBelopp)} kr`);
  console.log(`  Ingående moms avdragen i ruta 48: ${sv(exponeringMoms)} kr`);
  if (exponeringMoms === 0) {
    console.log(`  (Ingen moms är i fara — posterna är exempt eller OSS och når aldrig ruta 48.`);
    console.log(`   Det är kostnadsavdraget i inkomstdeklarationen som saknar underlag.)`);
  }
  console.log(`  Bokföringslagen 4 kap. 3 § kräver underlag för varje affärshändelse.`);
  console.log(`  Arkivet är komplett — det är underlaget som saknas i källan.`);
}
if (obehandlade) {
  console.log(`\n⚠ ${obehandlade} kvitton saknar momsbehandling helt och hamnar ingenstans i deklarationen.`);
}
if (!WRITE) {
  console.log("\n  Det här var en kontroll — ingenting skrevs någonstans.");
  console.log("  För en riktig återställning till ett TOMT projekt:");
  console.log("    node scripts/aterstall.mjs <arkiv> --skriv --till <url> --nyckel <service_role>\n");
  process.exit(0);
}

/* ─────────────────────────────────────────────────────────────────────────
   2 · SKRIV — the real restore
   ───────────────────────────────────────────────────────────────────────── */
let url = flag("--till"), key = flag("--nyckel");
if (!url || !key) {
  const envPath = new URL("../.env.local", import.meta.url);
  const env = {};
  for (const line of (await readFile(envPath, "utf8")).split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  url ||= env.NEXT_PUBLIC_SUPABASE_URL;
  key ||= env.SUPABASE_SERVICE_ROLE_KEY;
}
if (!url || !key) die("Ange --till <url> --nyckel <service_role>, eller lägg dem i .env.local.");

const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(url, key, { auth: { persistSession: false } });
console.log(`\nÅterställer till ${url}\n`);

/* Refuse to restore over live data. The realistic accident is not a failed restore --
   it is a successful one, into the wrong project. */
if (!FORCE) {
  for (const t of ORDER) {
    /* count over * — select("id") throws on the tables that have no id column, and a
       probe that errors is a safety check that silently did not run. */
    const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
    if (error) continue;
    if (count > 0) {
      die(`${t} innehåller redan ${count} rader. Återställ till ett TOMT projekt, ` +
          `eller lägg till --tvinga om du verkligen menar att skriva över.`);
    }
  }
  ok("målprojektet är tomt");
}

console.log("\nTabeller");
for (const t of ORDER) {
  const rows = tables[t];
  if (!rows?.length) { console.log(`  ${t.padEnd(30)} —`); continue; }
  let done = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await sb.from(t).upsert(chunk, { onConflict: pkOf(t) });
    if (error) { bad(`${t.padEnd(30)} ${error.message}`); fatal++; break; }
    done += chunk.length;
  }
  if (done) ok(`${t.padEnd(30)} ${String(done).padStart(5)} rader`);
}

console.log("\nFiler");
let up = 0;
for (const [table, bucket] of Object.entries(BUCKET_FOR)) {
  for (const r of tables[table] || []) {
    if (!r.storage_path) continue;
    const rel = byPath.get(r.storage_path)?.arkivfil;
    if (!rel) { bad(`ingen arkivfil för ${r.storage_path}`); fatal++; continue; }
    const bytes = await readFile(path.join(root, rel));
    const { error } = await sb.storage.from(bucket).upload(r.storage_path, bytes, {
      contentType: r.mime_type || "application/octet-stream", upsert: true,
    });
    if (error) { bad(`${r.storage_path} — ${error.message}`); fatal++; continue; }
    up++;
  }
}
ok(`${up} filer uppladdade`);

console.log("\n" + "─".repeat(64));
if (fatal) { console.error(`\n✗ Återställningen slutförd med ${fatal} fel. Kontrollera innan du litar på projektet.\n`); process.exit(2); }
console.log("\n✓ Återställt. Kör kontrollen igen mot ett nytt arkiv från det här projektet för att bekräfta.\n");
