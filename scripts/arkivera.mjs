#!/usr/bin/env node
/* scripts/arkivera.mjs — the 7-year archive you hold yourself.
 *
 * WHY THIS EXISTS
 * Bokföringslagen 7 kap. requires verifikationer to be kept for seven years. Since
 * 2024-07-01 a paper receipt may be destroyed once digitised, which means for this
 * business THE IMAGE IS THE LEGAL RECORD. Those images currently live in one
 * free-tier Supabase project with no backups configured, and free-tier projects pause
 * on inactivity. That is a single point of failure holding a statutory record.
 *
 * This script pulls everything out into a plain folder you own: every table as JSON
 * and as Swedish-Excel CSV, every stored file under a human-readable name, and a
 * manifest that proves integrity.
 *
 * IT IS ALSO A TEST, AND THAT IS HALF THE POINT.
 * Nobody has ever verified the receipt images are retrievable. For each row this
 * re-downloads the file and recomputes SHA-256, comparing it to the `file_hash`
 * recorded when the receipt was booked. Four outcomes, and they mean different things:
 *
 *   ok                 file present, hash matches what was booked
 *   HASH_MISMATCH      file present but CHANGED since booking — the verifikation is
 *                      no longer the document that was booked. Serious.
 *   MISSING_IN_STORAGE row points at a file that is not there — the deduction has no
 *                      evidence behind it. Serious.
 *   no_file            row never had a file (the 35 seeded receipts). Expected, but
 *                      counted, because a verifikation without an image is a gap you
 *                      should know the size of.
 *
 * Exits non-zero if anything is serious, so it is safe to schedule.
 *
 * USAGE
 *   node scripts/arkivera.mjs                    → ~/Nordbok-arkiv/<datum>
 *   node scripts/arkivera.mjs --out /Volumes/USB → somewhere else
 *   node scripts/arkivera.mjs --no-files         → data only, skip the downloads
 *
 * Self-contained on purpose: package.json has no "type":"module", so this cannot
 * import lib/*.js. Do not add such an import — it will fail at runtime, not at build.
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

/* ── Tables. Order matters only for readability. ─────────────────────────── */
const TABLES = [
  "studio_settings", "studio_clients", "studio_invoices", "studio_invoice_items",
  "studio_invoice_series", "studio_receipts", "studio_documents", "studio_bank_tx",
  "studio_trips", "studio_business_trips", "studio_tasks", "studio_notif_prefs",
  "studio_venture_identity", "studio_assistant_log", "fx_rates",
  /* Added after an audit found them missing. studio_memberships is who may read these
     books; studio_invoice_number_gaps explains every hole in the invoice series. An
     archive without the second one cannot answer "where is 2026-0001" at a kontroll. */
  "studio_memberships", "studio_invoice_number_gaps",
  /* Tillagd 2026-08-24. studio_moms_perioder är beviset på vilka
     momsdeklarationer som faktiskt lämnats. Utan den kan ett återställt arkiv
     inte svara på om en period är redovisad — och frånvaron av en rad är hela
     tabellens innebörd. */
  "studio_moms_perioder",
];

const BUCKETS = ["studio-receipts", "studio-documents"];

/* ── Env, read by hand. No dotenv dependency for a script that must still run
 *    in five years when node_modules has rotted. ──────────────────────────── */
async function loadEnv() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) die(`Hittar inte .env.local i ${process.cwd()}. Kör skriptet från studio-app/.`);
  const out = {};
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function die(msg) { console.error("\n✗ " + msg + "\n"); process.exit(1); }
const pad = (n) => String(n).padStart(2, "0");
function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

/* ── CSV for a Swedish accountant: semicolon separator, comma decimals, BOM so
 *    Excel opens it as UTF-8 instead of mojibake. JSON alongside keeps fidelity. ── */
function toCsv(rows) {
  if (!rows.length) return "﻿";
  const cols = [...rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set())];
  const cell = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return String(v).replace(".", ",");
    if (typeof v === "object") v = JSON.stringify(v);
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(r[c])).join(";"))].join("\r\n") + "\r\n";
}

/* Human-readable, sortable, collision-proof: 2026-08-18_cigar-federation_1240.00_a1b2c3.jpg
 * An archive nobody can navigate is not an archive. */
function slug(s) {
  return String(s || "okand").toLowerCase()
    .replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/é/g, "e")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "okand";
}
function receiptFileName(r, ext) {
  const amt = Number(r.total);
  const money = Number.isFinite(amt) ? amt.toFixed(2) : "0.00";
  return `${r.receipt_date || "utan-datum"}_${slug(r.vendor)}_${money}${r.currency && r.currency !== "SEK" ? r.currency : ""}_${String(r.file_hash || r.id).slice(0, 8)}${ext}`;
}

async function main() {
  const args = process.argv.slice(2);
  const outFlag = args.indexOf("--out");
  const skipFiles = args.includes("--no-files");
  const baseDir = outFlag > -1 ? args[outFlag + 1] : path.join(os.homedir(), "Nordbok-arkiv");
  const root = path.join(baseDir, `nordbok-arkiv-${today()}`);

  const env = await loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) die("NEXT_PUBLIC_SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY måste finnas i .env.local.");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  console.log(`\nNordbök — arkivering ${today()}`);
  console.log(`Mål: ${root}\n`);
  await mkdir(path.join(root, "data"), { recursive: true });

  /* ── 1 · Tables ───────────────────────────────────────────────────────── */
  const manifest = {
    skapad: new Date().toISOString(),
    projekt: url.replace(/^https?:\/\//, "").split(".")[0],
    tabeller: {},
    filer: {
      kontrollerade: 0, ok: 0, saknas: [], hash_avvikelse: [], utan_fil: [], foraldralosa: [],
      /* THE MAP. Every archived file, with the bucket and storage path it came from and
       * the hash it had. Without this, restoring means re-implementing receiptFileName()
       * and slug() exactly -- an archive readable only by the program that wrote it is
       * not an archive. With it, any tool can put the files back.
       *
       * Låg utanför `filer` fram till 2026-08-28. Kommentaren ovan sköt nyckeln ur
       * objektet den hörde till, så skrivningen på rad 228 träffade undefined och
       * arkiveringen kraschade på första filen — varje gång, sedan den skrevs.
       * aterstall.mjs har hela tiden läst filer.karta. */
      karta: [],
    },
    /* Deductible rows with no verifikation behind them. This is the money at risk. */
    exponering: { poster: 0, belopp_sek: 0, moms_sek: 0 },
    allvarliga_fel: 0,
  };
  const receipts = [];

  for (const t of TABLES) {
    const { data, error } = await sb.from(t).select("*");
    if (error) {
      console.log(`  ${t.padEnd(26)} ✗ ${error.message}`);
      manifest.tabeller[t] = { rader: null, fel: error.message };
      continue;
    }
    const rows = data || [];
    await writeFile(path.join(root, "data", `${t}.json`), JSON.stringify(rows, null, 2), "utf8");
    await writeFile(path.join(root, "data", `${t}.csv`), toCsv(rows), "utf8");
    manifest.tabeller[t] = { rader: rows.length };
    console.log(`  ${t.padEnd(26)} ${String(rows.length).padStart(5)} rader`);
    if (t === "studio_receipts") receipts.push(...rows);
  }

  /* ── 2 · Files, and the integrity check nobody has ever run ───────────── */
  if (!skipFiles) {
    console.log("\nVerifikationer — hämtar och kontrollerar…");
    const seen = new Set();

    for (const r of receipts) {
      if (!r.storage_path) {
        /* A count is not the number that matters. What matters is how much deducted
         * moms is resting on rows with no document behind them — that is the figure
         * that would be questioned at a kontroll. */
        /* The moms at risk is what actually reached ruta 48 -- not every ore of VAT
         * on the row. An exempt myndighetsavgift and an OSS purchase both deduct
         * NOTHING there, so counting their VAT here invents an exposure that does not
         * exist. Mirrors the switch in lib/moms.js; see aterstall.mjs for the reasoning. */
        const beloppSek = Number(r.total_sek ?? (r.currency === "SEK" ? r.total : null)) || 0;
        const vatSek = Number(r.vat_sek ?? (r.currency === "SEK" ? r.vat_amount : null)) || 0;
        const momsSek =
          r.is_deductible === false ? 0
          : r.vat_treatment === "domestic"
            ? vatSek * (r.business_share == null ? 1 : Number(r.business_share))
          : (r.vat_treatment === "rc_eu" || r.vat_treatment === "rc_non_eu")
            ? Math.max(beloppSek - vatSek, 0) * 0.25
          : 0;
        const avdragsgill = r.is_deductible !== false;
        manifest.filer.utan_fil.push({
          id: r.id, vendor: r.vendor, datum: r.receipt_date,
          belopp_sek: beloppSek, moms_sek: momsSek, avdragsgill,
          behandling: r.vat_treatment || null,
        });
        if (avdragsgill) {
          manifest.exponering.poster++;
          manifest.exponering.belopp_sek += beloppSek;
          manifest.exponering.moms_sek += momsSek;
        }
        continue;
      }
      manifest.filer.kontrollerade++;
      seen.add(r.storage_path);

      const { data: blob, error } = await sb.storage.from("studio-receipts").download(r.storage_path);
      if (error || !blob) {
        manifest.filer.saknas.push({ id: r.id, vendor: r.vendor, datum: r.receipt_date, path: r.storage_path, fel: error?.message });
        manifest.allvarliga_fel++;
        console.log(`  ✗ SAKNAS  ${r.receipt_date} ${r.vendor}`);
        continue;
      }

      const bytes = Buffer.from(await blob.arrayBuffer());
      const hash = createHash("sha256").update(bytes).digest("hex");

      if (r.file_hash && hash !== r.file_hash) {
        manifest.filer.hash_avvikelse.push({
          id: r.id, vendor: r.vendor, datum: r.receipt_date, path: r.storage_path,
          bokford_hash: r.file_hash, nuvarande_hash: hash,
        });
        manifest.allvarliga_fel++;
        console.log(`  ✗ ÄNDRAD  ${r.receipt_date} ${r.vendor} — filen är inte den som bokfördes`);
      } else {
        manifest.filer.ok++;
      }

      const year = String(r.receipt_date || "").slice(0, 4) || "utan-datum";
      const ext = path.extname(r.storage_path) || ".bin";
      const dir = path.join(root, "verifikationer", year);
      await mkdir(dir, { recursive: true });
      const namn = receiptFileName(r, ext);
      await writeFile(path.join(dir, namn), bytes);
      manifest.filer.karta.push({
        bucket: "studio-receipts", storage_path: r.storage_path,
        arkivfil: path.posix.join("verifikationer", year, namn),
        sha256: hash, tabell: "studio_receipts", rad_id: r.id,
      });
    }

    /* ── Documents ──────────────────────────────────────────────────────────
     * studio-documents was in BUCKETS from the start but nothing ever downloaded from
     * it: the loop above walks `receipts` only. So Arkiv -- contracts,
     * registreringsbevis, incoming invoices, bank statements -- was described in the
     * archive as table rows while the actual files stayed in a bucket with no backup.
     * Found by reading the script rather than by trusting its summary line. */
    const documents = [];
    {
      const { data } = await sb.from("studio_documents").select("*");
      documents.push(...(data || []));
    }
    if (documents.length) console.log("\nDokument — hämtar…");
    for (const d of documents) {
      if (!d.storage_path) continue;
      manifest.filer.kontrollerade++;
      seen.add(d.storage_path);
      const { data: blob, error } = await sb.storage.from("studio-documents").download(d.storage_path);
      if (error || !blob) {
        manifest.filer.saknas.push({ id: d.id, vendor: d.title, datum: d.issued_date, path: d.storage_path, fel: error?.message });
        manifest.allvarliga_fel++;
        console.log(`  ✗ SAKNAS  ${d.issued_date || "—"} ${d.title}`);
        continue;
      }
      const bytes = Buffer.from(await blob.arrayBuffer());
      const hash = createHash("sha256").update(bytes).digest("hex");
      manifest.filer.ok++;
      const year = String(d.issued_date || d.created_at || "").slice(0, 4) || "utan-datum";
      const ext = path.extname(d.storage_path) || ".bin";
      const dir = path.join(root, "dokument", year);
      await mkdir(dir, { recursive: true });
      const namn = `${d.issued_date || "utan-datum"}_${slug(d.doc_type)}_${slug(d.title)}_${String(d.id).slice(0, 8)}${ext}`;
      await writeFile(path.join(dir, namn), bytes);
      manifest.filer.karta.push({
        bucket: "studio-documents", storage_path: d.storage_path,
        arkivfil: path.posix.join("dokument", year, namn),
        sha256: hash, tabell: "studio_documents", rad_id: d.id,
      });
    }

    /* Orphans: files in the bucket no row points at. Not fatal, but they are
       either a failed commit or a deleted row, and both are worth seeing. */
    for (const bucket of BUCKETS) {
      const { data: top } = await sb.storage.from(bucket).list("", { limit: 1000 });
      for (const folder of top || []) {
        if (folder.id) continue;
        const { data: sub } = await sb.storage.from(bucket).list(folder.name, { limit: 1000 });
        for (const d2 of sub || []) {
          if (d2.id) continue;
          const { data: files } = await sb.storage.from(bucket).list(`${folder.name}/${d2.name}`, { limit: 1000 });
          for (const f of files || []) {
            const p = `${folder.name}/${d2.name}/${f.name}`;
            if (!seen.has(p)) manifest.filer.foraldralosa.push({ bucket, path: p });
          }
        }
      }
    }
  }

  /* ── 3 · Manifest + a readme a human can act on ───────────────────────── */
  await writeFile(path.join(root, "MANIFEST.json"), JSON.stringify(manifest, null, 2), "utf8");

  const f = manifest.filer;
  const x = manifest.exponering;
  x.belopp_sek = Math.round(x.belopp_sek * 100) / 100;
  x.moms_sek = Math.round(x.moms_sek * 100) / 100;
  /* Claiming a deduction with no document behind it is exactly the risk this archive
   * exists to surface. It stays serious until the underlag is attached. */
  if (x.poster > 0) manifest.allvarliga_fel++;

  const sv = (n) => new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  await writeFile(path.join(root, "LÄS-MIG.txt"),
`NORDBÖK STUDIO — ARKIV ${today()}

Vad det här är
--------------
En fullständig kopia av bokföringsunderlaget: alla tabeller som JSON och CSV,
och alla kvittobilder. Bilderna ÄR verifikationerna — sedan 1 juli 2024 får
papperskvitton slängas när de digitaliserats, och då är bilden originalet.

Enligt bokföringslagen 7 kap. ska räkenskapsinformation bevaras i sju år.
Spara den här mappen på minst två ställen, varav ett inte är samma dator.

Innehåll
--------
  data/                  varje tabell som .json (exakt) och .csv (öppnas i Excel)
  verifikationer/<år>/   kvittobilderna, döpta datum_leverantör_belopp_hash
  dokument/<år>/         avtal, registreringsbevis, kontoutdrag m.m.
  MANIFEST.json          räkning, integritetskontroll och filer.karta —
                         kartan som gör att arkivet kan läsas tillbaka

Kontroll av äkthet
------------------
Varje bild hämtades och kontrollsummerades (SHA-256) mot det värde som
sparades när kvittot bokfördes. Stämmer de överens är bilden bevisligen
oförändrad sedan den bokfördes.

  Kontrollerade filer      ${f.kontrollerade}
  Oförändrade              ${f.ok}
  Saknas i lagringen       ${f.saknas.length}
  Ändrade sedan bokföring  ${f.hash_avvikelse.length}
  Rader helt utan fil      ${f.utan_fil.length}
  Filer utan rad           ${f.foraldralosa.length}

${f.saknas.length || f.hash_avvikelse.length
  ? "⚠ ALLVARLIGT: se MANIFEST.json. En post utan giltig verifikation kan inte\n  försvaras vid en kontroll — åtgärda innan nästa deklaration."
  : "Inga saknade eller ändrade filer."}

${x.poster
  ? `⚠ AVDRAG UTAN UNDERLAG

  ${x.poster} avdragsgilla poster saknar bild. Tillsammans står de för
  ${sv(x.belopp_sek)} kr i kostnader och ${sv(x.moms_sek)} kr i ingående moms
  som dragits av i ruta 48.

  Enligt bokföringslagen 4 kap. 3 § ska varje affärshändelse verifieras. Ett
  avdrag utan underlag kan underkännas vid en kontroll, och då återförs momsen.

  Åtgärd: fotografera kvittona och koppla dem till posterna. Har du kvar
  originalen på papper eller som PDF räcker det att digitalisera dem nu.`
  : "Alla avdragsgilla poster har underlag."}

${f.utan_fil.length
  ? `Obs: ${f.utan_fil.length} poster har ingen bild alls. De lades in som data (t.ex.\nfrån den ursprungliga inläsningen) och saknar underlag. Det är inte ett fel i\narkivet, men det är en lucka i bokföringen.`
  : ""}
`, "utf8");

  console.log(`\n  Kontrollerade ${f.kontrollerade} · oförändrade ${f.ok} · saknas ${f.saknas.length} · ändrade ${f.hash_avvikelse.length} · utan fil ${f.utan_fil.length} · föräldralösa ${f.foraldralosa.length}`);
  if (x.poster) {
    console.log(`\n  ⚠ ${x.poster} avdragsgilla poster utan underlag`);
    console.log(`     ${sv(x.belopp_sek)} kr kostnader · ${sv(x.moms_sek)} kr ingående moms i ruta 48`);
  }
  console.log(`\n✓ Arkiv skrivet: ${root}`);
  if (manifest.allvarliga_fel) {
    console.error(`\n✗ ${manifest.allvarliga_fel} allvarliga avvikelser. Se MANIFEST.json.\n`);
    process.exit(2);
  }
  console.log("");
}

main().catch((e) => die(e?.stack || e?.message || String(e)));
