#!/usr/bin/env node
/* scripts/importera-kvitton.mjs — attach the receipt PDFs to their bookings.
 *
 * The archive run on 2026-08-23 found 35 receipt rows and ZERO stored documents.
 * Every deduction rested on a row with nothing behind it. The PDFs existed the whole
 * time, in nordbok_pwa_v2/kvitton/ — they had simply never been imported.
 *
 * WHY THE MAP IS HARD-CODED RATHER THAN COMPUTED HERE
 * The pairing was worked out once, by reading all 36 PDFs and comparing them against
 * 003_seed_receipts.sql. Two traps made that non-obvious, and re-deriving them at
 * runtime with regex would be a good way to attach the wrong document to a booking:
 *
 *  1. Tre's PDFs carry the FAKTURERINGSDAG; the seed used the FÖRFALLODAG. They differ
 *     by roughly 25 days, so no date comparison lines them up. Both series are strictly
 *     monthly and 14 long, so they were paired in date order and every pair was then
 *     checked on amount. That check is what makes it safe: 690.33 appears seven times,
 *     but never twice in a row.
 *  2. Anthropic's Invoice-NLCLAITV-0007 and Receipt-2488-6214-0757 are the same
 *     €116.04 transaction. A row holds one document, so only the invoice is attached
 *     and the receipt is reported.
 *
 * SAFETY
 *   · dry run by default; nothing is written without --apply
 *   · a map entry must resolve to EXACTLY ONE row. Zero or several → skipped and named
 *   · a row that already has a document is left alone — re-runnable without duplicating
 *   · SHA-256 is computed before upload and stored, so the archive can later prove the
 *     file is unchanged since booking
 *
 * USAGE
 *   node scripts/importera-kvitton.mjs           visa vad som skulle hända
 *   node scripts/importera-kvitton.mjs --apply   gör det
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/* file · vendor · receipt_date (as seeded) · total · currency */
const MAP = [
  ['Mitt3/527087962421_260328_110445.pdf',              'Tre (Hi3G Access AB)', '2025-07-28',  690.33, 'SEK'],
  ['Mitt3/527182938326_260328_110351.pdf',              'Tre (Hi3G Access AB)', '2025-08-26',  692.33, 'SEK'],
  ['Mitt3/527306454325_260328_110327.pdf',              'Tre (Hi3G Access AB)', '2025-09-26',  690.33, 'SEK'],
  ['Mitt3/527401381126_260328_110304.pdf',              'Tre (Hi3G Access AB)', '2025-10-27',  949.33, 'SEK'],
  ['Mitt3/527496572522_260328_110240.pdf',              'Tre (Hi3G Access AB)', '2025-11-26',  690.33, 'SEK'],
  ['Mitt3/527592361028_260328_110220.pdf',              'Tre (Hi3G Access AB)', '2025-12-23',  752.33, 'SEK'],
  ['Mitt3/527706162924_260328_110202.pdf',              'Tre (Hi3G Access AB)', '2026-01-26',  750.33, 'SEK'],
  ['Mitt3/527801187420_260328_110127.pdf',              'Tre (Hi3G Access AB)', '2026-02-26',  690.33, 'SEK'],
  ['Mitt3/527895645929_260328_110057.pdf',              'Tre (Hi3G Access AB)', '2026-03-26',  690.33, 'SEK'],
  ['Mitt3/faktura-527990450621.pdf',                    'Tre (Hi3G Access AB)', '2026-04-27',  690.33, 'SEK'],
  ['Mitt3/faktura-528085567329.pdf',                    'Tre (Hi3G Access AB)', '2026-05-26', 1385.33, 'SEK'],
  ['Mitt3/faktura-528179592423.pdf',                    'Tre (Hi3G Access AB)', '2026-06-26',  708.04, 'SEK'],
  ['Mitt3/faktura-528273502724.pdf',                    'Tre (Hi3G Access AB)', '2026-07-27',  700.45, 'SEK'],
  ['Mitt3/faktura-528367744927.pdf',                    'Tre (Hi3G Access AB)', '2026-08-26',  690.33, 'SEK'],
  ['Antropic/Receipt-2471-7290-3226_260328_105652.pdf', 'Anthropic, PBC',       '2026-03-17',  112.50, 'EUR'],
  ['Antropic/Invoice-NLCLAITV-0007_260328_105453.pdf',  'Anthropic, PBC',       '2026-03-18',  116.04, 'EUR'],
  ['Antropic/Receipt-2257-1137-9136_260328_105626.pdf', 'Anthropic, PBC',       '2026-03-18',   25.00, 'EUR'],
  ['Antropic/Receipt-2257-7225-8728.pdf',               'Anthropic, PBC',       '2026-04-18',  225.00, 'EUR'],
  ['Antropic/Receipt-2715-2852-0543 (1).pdf',           'Anthropic, PBC',       '2026-05-18',  225.00, 'EUR'],
  ['Antropic/Receipt-2813-9453-0400.pdf',               'Anthropic, PBC',       '2026-06-18',  112.50, 'EUR'],
  ['Antropic/Receipt-2341-3637-3209.pdf',               'Anthropic, PBC',       '2026-07-21',  112.50, 'EUR'],
  ['Webflow/Webflow-in_0RTQUko2ZNzxqgUAVF4u7gAB.pdf',   'Webflow, Inc.',        '2025-05-27',   29.00, 'USD'],
  ['Webflow/Webflow-in_0RefGoo2ZNzxqgUAUoPDnRRU.pdf',   'Webflow, Inc.',        '2025-06-27',   29.00, 'USD'],
  ['Webflow/Webflow-in_0RpXZdo2ZNzxqgUAlhvEsFJv.pdf',   'Webflow, Inc.',        '2025-07-27',   29.00, 'USD'],
  ['Webflow/Webflow-in_0S0mLJo2ZNzxqgUAFCuumFKB.pdf',   'Webflow, Inc.',        '2025-08-27',   29.00, 'USD'],
  ['Webflow/Webflow-in_0SC17uo2ZNzxqgUAVa2lE6YH.pdf',   'Webflow, Inc.',        '2025-09-27',   29.00, 'USD'],
  ['Webflow/Webflow-in_0SMtQAo2ZNzxqgUAHPPTJ4Rg.pdf',   'Webflow, Inc.',        '2025-10-27',   29.00, 'USD'],
  ['Webflow/Webflow-in_0SY8C7o2ZNzxqgUAUgWpKk0b.pdf',   'Webflow, Inc.',        '2025-11-27',   29.00, 'USD'],
  ['Webflow/Webflow-in_0Sj0UQo2ZNzxqgUAdu041rYe.pdf',   'Webflow, Inc.',        '2025-12-27',   29.00, 'USD'],
  ['Webflow/Webflow-in_0SuFGUo2ZNzxqgUAj4GQEoS3.pdf',   'Webflow, Inc.',        '2026-01-27',   29.00, 'USD'],
  ['Webflow/Webflow-in_0T5U39o2ZNzxqgUAJj2cL21T.pdf',   'Webflow, Inc.',        '2026-02-27',   29.00, 'USD'],
  ['Webflow/Webflow-in_0TFdO5o2ZNzxqgUAdkdllv4e.pdf',   'Webflow, Inc.',        '2026-03-27',   29.00, 'USD'],
  ['Domain/namecheap-order-197762152.pdf',              'Namecheap',            '2026-03-23',   10.18, 'USD'],
];

/* Reported, never written. */
const SKIPPED = [
  ['Antropic/Receipt-2488-6214-0757_260328_105434.pdf',
   'samma €116,04-transaktion som Invoice-NLCLAITV-0007. En rad rymmer ett dokument.'],
  ['Plane tickets/Electronic_ticket.pdf',
   'Air France 2025-11-14, 11 511,00 SEK — INTE en affärsresa enligt Cris (2026-08-23). En privat resa är inte avdragsgill, varken i NE eller i ruta 48, så ingen rad skapas. PDF:en ligger kvar i kvitton/ som underlag ifall bedömningen ändras.'],
];

/* Rows that do not exist yet and that Cris has explicitly authorised.
 *
 * The seed skipped both Air France tickets, believing the PDFs showed no fare. They do:
 * "Totalcost/Montanttotal: SEK 12375.00". Cris confirmed on 2026-08-23 that this trip
 * was for business and the November one was not.
 *
 * Momsmässigt är internationell persontransport undantagen — det finns ingen moms att
 * återvinna, och datumet ligger dessutom före momsregistreringen 2026-04-29. Värdet
 * ligger i inkomstskatten: kostnaden hör hemma i NE-bilagan för 2026.
 */
const CREATE = [
  {
    file: 'Plane tickets/Electronic_ticket (1).pdf',
    vendor: 'Air France',
    receipt_date: '2026-01-15',
    total: 12375.00,
    currency: 'SEK',
    total_sek: 12375.00,
    vat_amount: 0,
    vat_sek: 0,
    vat_rate: 0,
    category: 'Affärsresor',
    description: 'Flygbiljett, affärsresa',
    vat_treatment: 'exempt',
    venture: 'turquino',
    is_business: true,
    is_deductible: true,
    business_share: 1.0,
  },
];

const KVITTON = path.resolve(process.cwd(), "..", "kvitton");

function die(m) { console.error("\n✗ " + m + "\n"); process.exit(1); }

async function env() {
  const f = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(f)) die("Hittar inte .env.local. Kör från studio-app/.");
  const o = {};
  for (const l of (await readFile(f, "utf8")).split("\n")) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return o;
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (!existsSync(KVITTON)) die(`Hittar inte ${KVITTON}`);

  const e = await env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY)
    die("NEXT_PUBLIC_SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY krävs i .env.local.");
  const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log(`\nNordbök — importerar kvitton  ${apply ? "(SKARPT)" : "(torrkörning — inget skrivs)"}\n`);

  let attached = 0, already = 0, failed = 0;

  for (const [rel, vendor, date, total, currency] of MAP) {
    const abs = path.join(KVITTON, rel);
    const name = rel.split("/").pop();
    if (!existsSync(abs)) { console.log(`  ✗ ${name} — filen saknas`); failed++; continue; }

    const { data: rows, error } = await sb
      .from("studio_receipts")
      .select("id, storage_path, vendor, receipt_date, total, currency")
      .eq("vendor", vendor).eq("receipt_date", date).eq("currency", currency);

    if (error) { console.log(`  ✗ ${name} — ${error.message}`); failed++; continue; }

    const hits = (rows || []).filter((r) => Math.abs(Number(r.total) - total) < 0.005);
    if (hits.length !== 1) {
      console.log(`  ✗ ${name} — ${hits.length} rader matchar ${vendor} ${date} ${total} ${currency}. Hoppar över.`);
      failed++; continue;
    }
    const row = hits[0];
    if (row.storage_path) { console.log(`  · ${name} — har redan ett dokument`); already++; continue; }

    const bytes = await readFile(abs);
    const hash = createHash("sha256").update(bytes).digest("hex");

    const { data: full } = await sb.from("studio_receipts").select("user_id").eq("id", row.id).single();
    const key = `${full.user_id}/${hash.slice(0, 2)}/${hash}.pdf`;

    if (!apply) { console.log(`  → ${name}  ⇒  ${vendor} ${date} ${total} ${currency}`); attached++; continue; }

    const up = await sb.storage.from("studio-receipts").upload(key, bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) { console.log(`  ✗ ${name} — uppladdning: ${up.error.message}`); failed++; continue; }

    const { error: uerr } = await sb.from("studio_receipts").update({
      storage_path: key, file_hash: hash, file_mime: "application/pdf",
      file_size: bytes.length, file_name: name, uploaded_at: new Date().toISOString(),
    }).eq("id", row.id).is("storage_path", null);   // never overwrite an existing document

    if (uerr) { console.log(`  ✗ ${name} — ${uerr.message}`); failed++; continue; }
    console.log(`  ✓ ${name}  ⇒  ${vendor} ${date}`);
    attached++;
  }

  console.log(`\n  ${apply ? "Kopplade" : "Skulle koppla"} ${attached} · redan gjorda ${already} · misslyckade ${failed}`);

  /* ── Rader som ska skapas ────────────────────────────────────────────── */
  let created = 0;
  for (const c of CREATE) {
    const abs = path.join(KVITTON, c.file);
    const name = c.file.split("/").pop();
    if (!existsSync(abs)) { console.log(`  ✗ ${name} — filen saknas`); failed++; continue; }

    const { data: dupes, error: derr } = await sb
      .from("studio_receipts").select("id, storage_path")
      .eq("vendor", c.vendor).eq("receipt_date", c.receipt_date);
    if (derr) { console.log(`  ✗ ${name} — ${derr.message}`); failed++; continue; }
    if ((dupes || []).length) { console.log(`  · ${name} — raden finns redan`); already++; continue; }

    const bytes = await readFile(abs);
    const hash = createHash("sha256").update(bytes).digest("hex");

    if (!apply) { console.log(`  + ${name}  ⇒  NY RAD ${c.vendor} ${c.receipt_date} ${c.total} ${c.currency}`); created++; continue; }

    /* Storage RLS keys every path on the owner's uuid, so the new row must carry the
     * same user_id as the existing ones. Every row in this table belongs to one person,
     * so borrowing it from any row is correct here — and it fails loudly if the table
     * is somehow empty rather than inserting an orphan. */
    const { data: owner, error: oerr } = await sb
      .from("studio_receipts").select("user_id").limit(1).maybeSingle();
    if (oerr || !owner?.user_id) { console.log(`  ✗ ${name} — hittar ingen user_id att ärva`); failed++; continue; }
    const key = `${owner.user_id}/${hash.slice(0, 2)}/${hash}.pdf`;

    const up = await sb.storage.from("studio-receipts").upload(key, bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) { console.log(`  ✗ ${name} — uppladdning: ${up.error.message}`); failed++; continue; }

    /* `file` is the local path, not a column — strip it rather than relying on
     * JSON.stringify quietly dropping an undefined. */
    const { file: _localPath, ...columns } = c;
    const { error: ierr } = await sb.from("studio_receipts").insert({
      user_id: owner.user_id, ...columns,
      storage_path: key, file_hash: hash, file_mime: "application/pdf",
      file_size: bytes.length, file_name: name, uploaded_at: new Date().toISOString(),
      source: "import", status: "confirmed",
    });
    if (ierr) { console.log(`  ✗ ${name} — ${ierr.message}`); failed++; continue; }
    console.log(`  + ${name}  ⇒  NY RAD ${c.vendor} ${c.receipt_date}`);
    created++;
  }
  if (created) console.log(`\n  ${apply ? "Skapade" : "Skulle skapa"} ${created} ny rad${created === 1 ? "" : "er"}`);

  console.log(`\nKräver ditt beslut (inget av detta rörs):`);
  for (const [f, why] of SKIPPED) console.log(`  · ${f.split("/").pop()}\n      ${why}`);

  if (!apply) console.log(`\nKör med --apply för att göra det på riktigt.\n`);
  else console.log(`\nKlart. Kör 'npm run arkiv' för att kontrollera att filerna går att hämta.\n`);
}

main().catch((e) => die(e?.stack || String(e)));
