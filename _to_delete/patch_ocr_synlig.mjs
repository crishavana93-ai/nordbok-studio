import { readFile, writeFile } from "node:fs/promises";

const done = [];
async function sub(file, name, a, b) {
  const s = await readFile(file, "utf8");
  const c = s.split(a).length - 1;
  if (c !== 1) { console.error(`FAIL ${file} / ${name}: found ${c}`); process.exit(1); }
  await writeFile(file, s.replace(a, b), "utf8");
  done.push(`${file.split("/").pop()}:${name}`);
}

const R = "app/api/receipts/upload/route.js";
const C = "components/receipts/ReceiptCapture.jsx";

/* ═══ 1. Loggen på servern ════════════════════════════════════════════════════
   ocr() kastar med Anthropics riktiga status och svarskropp. Den fångades i en
   variabel och skickades vidare — men ingen skrev ut den, så den fanns inte i
   Vercels logg heller. Ett fel som ingen kan se är ett fel som inte går att laga. */
await sub(R, "logga-ocr-fel",
`    } catch (e) {
      ocrError = e.message || String(e);
    }`,
`    } catch (e) {
      ocrError = e.message || String(e);
      console.error(\`[kvitto] tolkning misslyckades · \${file.type} · \${bytes.length} byte · \${ocrError}\`);
    }`);

/* ═══ 2. Och i gränssnittet ═══════════════════════════════════════════════════
   En misslyckad tolkning såg exakt ut som en tolkning som aldrig gjordes: tomt
   formulär, ingen förklaring. Nu står det vad som hände. */
await sub(C, "visa-ocr-fel",
`        if (j.note) setInfo(j.note);`,
`        if (j.ocr_error) {
          /* Tekniskt, men det är hela poängen: utan det går det inte att veta om
             filen var för stor, om nyckeln saknas eller om PDF:en är låst. */
          setInfo(\`Filen är sparad, men den gick inte att tolka automatiskt — fyll i uppgifterna för hand. Orsak: \${j.ocr_error}\`);
          reportErrorAsync(new Error(j.ocr_error), { scope: "ui/receipt-ocr", level: "warn" });
        } else if (j.note) {
          setInfo(j.note);
        }`);

/* Även när tolkningen lyckas kan enskilda fält ha fallerat; ett tyst fel där är
   samma problem i mindre skala. */
await sub(C, "fel-även-vid-träff",
`      const s = j.suggestions;
      if (s) {`,
`      const s = j.suggestions;
      if (s && j.ocr_error) setInfo(\`Tolkningen är ofullständig: \${j.ocr_error}\`);
      if (s) {`);

console.log("patched:\n  " + done.join("\n  "));
