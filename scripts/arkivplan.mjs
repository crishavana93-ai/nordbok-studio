#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   arkivplan.mjs — får arkiveringen att ske utan att någon kommer ihåg den

     npm run arkivplan                  status: när arkiverades det senast?
     npm run arkivplan -- --installera  lägg upp ett månatligt jobb på den här datorn
     npm run arkivplan -- --avinstallera ta bort det

   VARFÖR JOBBET LIGGER HÄR OCH INTE I MOLNET

   Arkivet ska skydda mot att Supabase-projektet försvinner. Ett schemalagt jobb
   som kör i samma moln, och skriver till samma projekt, skyddar mot ingenting —
   det ser bara ut att göra det. Vercels funktioner har dessutom ingen disk som
   överlever anropet, så det finns ingenstans att lägga filerna.

   Arkivet hör hemma på en dator du äger. Det här skriptet lägger upp jobbet där.

   Sju års räkenskapsinformation, enligt bokföringslagen 7 kap. 2 §, ska kunna
   visas upp till utgången av det sjunde året efter räkenskapsåret. För det du
   bokför 2026 betyder det 31 december 2033.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readdir, stat, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

const kor = promisify(execFile);

const ETIKETT = "se.nordbok.arkiv";
const ARKIVROT = path.join(os.homedir(), "Nordbok-arkiv");
const PLIST = path.join(os.homedir(), "Library", "LaunchAgents", `${ETIKETT}.plist`);
/* Två gånger i månaden. Ett arkiv som är en månad gammalt kan sakna en hel
   momsperiods kvitton; två veckor är en rimlig övre gräns för hur mycket
   arbete som får gå förlorat. */
const DAGAR = [1, 15];
const TIMME = 9;
const VARNA_EFTER_DAGAR = 20;

const projektrot = path.resolve(new URL("..", import.meta.url).pathname);
const args = process.argv.slice(2);

/* ── Hur gammalt är det senaste arkivet? ──────────────────────────────────── */
export async function senasteArkiv(rot = ARKIVROT) {
  if (!existsSync(rot)) return null;
  const poster = await readdir(rot, { withFileTypes: true });
  const mappar = poster.filter((p) => p.isDirectory() && /^\d{4}-\d{2}-\d{2}/.test(p.name));
  if (!mappar.length) return null;

  let senast = null;
  for (const m of mappar) {
    const full = path.join(rot, m.name);
    const s = await stat(full);
    if (!senast || s.mtimeMs > senast.mtimeMs) senast = { namn: m.name, sokvag: full, mtimeMs: s.mtimeMs };
  }
  if (!senast) return null;
  senast.alderDagar = Math.floor((Date.now() - senast.mtimeMs) / 86400000);
  return senast;
}

function plistInnehall() {
  /* Körs genom ett inloggningsskal så att node och npm hittas via PATH —
     absoluta sökvägar till node bryts av varje uppgradering. */
  const kommando = `cd ${JSON.stringify(projektrot)} && npm run arkiv`;
  const kalender = DAGAR.map((d) =>
    `      <dict>
        <key>Day</key><integer>${d}</integer>
        <key>Hour</key><integer>${TIMME}</integer>
        <key>Minute</key><integer>0</integer>
      </dict>`
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${ETIKETT}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>${kommando.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
${kalender}
  </array>
  <!-- Missades tiden för att datorn var avstängd: kör så snart den vaknar. -->
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>${path.join(ARKIVROT, "arkiv.log")}</string>
  <key>StandardErrorPath</key><string>${path.join(ARKIVROT, "arkiv.log")}</string>
</dict>
</plist>
`;
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */
const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const senast = await senasteArkiv();
  const installerat = existsSync(PLIST);

  if (args.includes("--avinstallera")) {
    if (!installerat) { console.log("\nInget jobb är installerat.\n"); process.exit(0); }
    try { await kor("launchctl", ["unload", PLIST]); } catch { /* redan urlastat */ }
    await unlink(PLIST);
    console.log(`\n✓ Det schemalagda jobbet är borttaget.`);
    console.log(`  Arkiven i ${ARKIVROT} ligger kvar.\n`);
    process.exit(0);
  }

  if (args.includes("--installera")) {
    if (process.platform !== "darwin") {
      console.error(`\n✗ Det här installerar ett launchd-jobb och fungerar bara på macOS.`);
      console.error(`  På annat system: lägg "cd ${projektrot} && npm run arkiv" i din egen schemaläggare.\n`);
      process.exit(1);
    }
    await mkdir(path.dirname(PLIST), { recursive: true });
    await mkdir(ARKIVROT, { recursive: true });
    await writeFile(PLIST, plistInnehall(), "utf8");
    try { await kor("launchctl", ["unload", PLIST]); } catch { /* fanns inte förut */ }
    await kor("launchctl", ["load", PLIST]);

    console.log(`\n✓ Arkiveringen är schemalagd på den här datorn.`);
    console.log(`  Kör den ${DAGAR.join(" och ")} varje månad klockan ${String(TIMME).padStart(2, "0")}:00.`);
    console.log(`  Är datorn avstängd då körs den när den vaknar.`);
    console.log(`\n  Arkiv:  ${ARKIVROT}`);
    console.log(`  Logg:   ${path.join(ARKIVROT, "arkiv.log")}`);
    console.log(`  Jobbet: ${PLIST}`);
    console.log(`\n  Ta bort med: npm run arkivplan -- --avinstallera\n`);
    process.exit(0);
  }

  /* ── Status ────────────────────────────────────────────────────────────── */
  console.log(`\nArkivering — Nordbök Studio\n`);
  console.log(`  Schemalagt jobb   ${installerat ? "ja · " + ETIKETT : "NEJ"}`);

  if (!senast) {
    console.log(`  Senaste arkiv     inget ännu`);
    console.log(`\n  ✗ Det finns inget arkiv alls. Sju års räkenskapsinformation vilar just nu`);
    console.log(`    på att ett enda Supabase-projekt fortsätter existera och betalas.`);
    console.log(`\n    Kör:  npm run arkiv`);
    console.log(`    Sedan: npm run arkivplan -- --installera\n`);
    process.exit(1);
  }

  const d = senast.alderDagar;
  console.log(`  Senaste arkiv     ${senast.namn} · ${d} dygn gammalt`);
  console.log(`  Ligger i          ${senast.sokvag}`);

  if (d > VARNA_EFTER_DAGAR) {
    console.log(`\n  ✗ Äldre än ${VARNA_EFTER_DAGAR} dygn. Allt du bokfört sedan dess finns bara i molnet.`);
    console.log(`    Kör:  npm run arkiv\n`);
    process.exit(1);
  }

  if (!installerat) {
    console.log(`\n  ! Arkivet är färskt, men ingenting ser till att det förblir det.`);
    console.log(`    Kör:  npm run arkivplan -- --installera\n`);
    process.exit(0);
  }

  console.log(`\n  ✓ Arkivet är aktuellt och sköter sig själv.\n`);
}
