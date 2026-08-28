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

/* ── 1. Läs av om kvittot är ställt till företaget ─────────────────────────── */
await sub(R, "import",
`import { suggestBasAccount } from "@/lib/swedish-tax";`,
`import { suggestBasAccount } from "@/lib/swedish-tax";
import { bedomAvdrag } from "@/lib/avdrag";`);

await sub(R, "prompt-fält",
`    "description":    { "value": "<vad som köptes, kort>", "confidence": 0.0-1.0, "read_as": "<varuraderna>" }`,
`    "description":    { "value": "<vad som köptes, kort>", "confidence": 0.0-1.0, "read_as": "<varuraderna>" },
    "buyer_vat_number": { "value": "<KÖPARENS momsnummer om det står på kvittot, annars null>", "confidence": 0.0-1.0, "read_as": "<raden du läste det från>" }`);

await sub(R, "prompt-regel",
`REGLER`,
`REGLER
- buyer_vat_number är KÖPARENS nummer, inte säljarens. Ett svenskt ser ut som
  SE följt av 12 siffror. Står bara säljarens nummer på kvittot: sätt null.
  Skillnaden avgör om utländsk moms debiterats i onödan, så gissa inte.`);

/* ── 2. Bedöm avdraget och skicka med det ──────────────────────────────────── */
await sub(R, "bedomning",
`    if (suggestions) {
      const bas = suggestBasAccount(suggestions.vendor || "", suggestions.description || "");
      suggestions.bas_account = bas.account;
      suggestions.ne_row = bas.ne;
      suggestions.category = suggestions.category || bas.label;
      suggestions.vat_treatment = guessTreatment(suggestions);
    }`,
  [
    `    let avdrag = null;`,
    `    if (suggestions) {`,
    `      const bas = suggestBasAccount(suggestions.vendor || "", suggestions.description || "");`,
    `      suggestions.bas_account = bas.account;`,
    `      suggestions.ne_row = bas.ne;`,
    `      suggestions.category = suggestions.category || bas.label;`,
    `      suggestions.vat_treatment = guessTreatment(suggestions);`,
    ``,
    `      /* Fälten är inte frågan. Frågan är vad som får dras av — och om en`,
    `         utländsk leverantör debiterat sin egen moms för att den inte vet att`,
    `         köparen är ett momsregistrerat företag. Den momsen är förlorad, och`,
    `         syns inte som ett fel någonstans annars. */`,
    `      const { data: inst } = await sb`,
    `        .from("studio_settings")`,
    `        .select("vat_number, vat_registered_from")`,
    `        .eq("user_id", user.id)`,
    `        .maybeSingle();`,
    `      avdrag = bedomAvdrag(suggestions, {`,
    `        egetMomsnummer: inst?.vat_number || null,`,
    `        momsregistrerad: !!inst?.vat_registered_from,`,
    `      });`,
    `    }`,
  ].join("\n"));

await sub(R, "svar",
`      suggestions,          // null when OCR failed — the form still works`,
`      suggestions,          // null when OCR failed — the form still works
      avdrag,               // bedömningen: vad som får dras av, och varför`);

/* ── 3. Visa bedömningen ───────────────────────────────────────────────────── */
await sub(C, "state",
`  const [flags, setFlags] = useState([]);`,
`  const [flags, setFlags] = useState([]);
  const [avdrag, setAvdrag] = useState(null);`);

await sub(C, "ta-emot-avdrag",
`        setFields(s.fields || null);
        setFlags(s.flags || []);`,
`        setFields(s.fields || null);
        setFlags(s.flags || []);
        setAvdrag(j.avdrag || null);`);

await sub(C, "nollställ",
`        setFields(null);
        setFlags([]);`,
`        setFields(null);
        setFlags([]);
        setAvdrag(null);`);

console.log("patched:\n  " + done.join("\n  "));
