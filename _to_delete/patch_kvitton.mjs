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

/* ═══ 1. PDF:er lästes aldrig. Det var ett medvetet undantag, inte ett fel i
        modellen — Claude läser PDF via ett document-block precis som en bild. ═══ */

await sub(R, "skip-villkoret",
`    if (!wantOcr || file.type === "application/pdf" || !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        ...base,
        suggestions: null,
        note: file.type === "application/pdf"
          ? "PDF sparad. Fyll i uppgifterna manuellt."
          : !process.env.ANTHROPIC_API_KEY
            ? "Filen är sparad. OCR är inte konfigurerad — fyll i uppgifterna manuellt."
            : null,
      });
    }`,
  [
    `    /* En PDF gick tidigare aldrig till tolkning: villkoret här hoppade över`,
    `       den och svarade "Fyll i uppgifterna manuellt". Det var en gräns någon`,
    `       skrivit in, inte en gräns i modellen — Claude läser PDF genom ett`,
    `       document-block lika gärna som en bild. Enda kvarvarande skälet att`,
    `       hoppa över är en fil som är för stor att skicka. */`,
    `    const PDF_MAX = 10 * 1024 * 1024;`,
    `    const forStorPdf = file.type === "application/pdf" && bytes.length > PDF_MAX;`,
    ``,
    `    if (!wantOcr || forStorPdf || !process.env.ANTHROPIC_API_KEY) {`,
    `      return NextResponse.json({`,
    `        ...base,`,
    `        suggestions: null,`,
    `        note: forStorPdf`,
    `          ? \`PDF:en är \${Math.round(bytes.length / 1048576)} MB och för stor att tolka automatiskt. Den är sparad — fyll i uppgifterna för hand.\``,
    `          : !process.env.ANTHROPIC_API_KEY`,
    `            ? "Filen är sparad. Automatisk tolkning är inte konfigurerad — fyll i uppgifterna för hand."`,
    `            : null,`,
    `      });`,
    `    }`,
  ].join("\n"));

await sub(R, "document-block",
`          { type: "image", source: { type: "base64", media_type: mime, data: bytes.toString("base64") } },`,
  [
    `          /* En PDF skickas som document, en bild som image. Samma modell,`,
    `             samma prompt, samma svar — bara olika omslag. */`,
    `          mime === "application/pdf"`,
    `            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }`,
    `            : { type: "image", source: { type: "base64", media_type: mime, data: bytes.toString("base64") } },`,
  ].join("\n"));

/* ═══ 2. Ett meddelande som inte är ett fel visades i felrutan. ═══════════════ */

await sub(C, "info-state",
`  const [err, setErr] = useState(null);`,
`  const [err, setErr] = useState(null);
  /* "PDF sparad" är inte ett fel. Den låg i setErr och målades röd, så en
     lyckad uppladdning såg ut som ett haveri. Egen kanal för sådant. */
  const [info, setInfo] = useState(null);`);

await sub(C, "nollställ-info",
`    setErr(null); setDupe(null); setStage("uploading");`,
`    setErr(null); setInfo(null); setDupe(null); setStage("uploading");`);

await sub(C, "note-som-info",
`        if (j.note) setErr(j.note);`,
`        if (j.note) setInfo(j.note);`);

/* ═══ 3. PDF:en syntes inte. Preview sattes bara för bilder. ══════════════════ */

await sub(C, "preview-pdf",
`    if (f.type.startsWith("image/")) setPreview(URL.createObjectURL(f));`,
  [
    `    /* Även PDF:er får en förhandsvisning. Att inte se filen man just laddat`,
    `       upp är att inte veta om något hände. */`,
    `    if (f.type.startsWith("image/") || f.type === "application/pdf") {`,
    `      setPreview(URL.createObjectURL(f));`,
    `      setPreviewMime(f.type);`,
    `    }`,
  ].join("\n"));

await sub(C, "previewMime-state",
`  const [preview, setPreview] = useState(null);`,
`  const [preview, setPreview] = useState(null);
  const [previewMime, setPreviewMime] = useState(null);`);

await sub(C, "rendera-pdf",
`            <img
              src={preview}
              alt="Det uppladdade kvittot"
              className={\`object-contain transition-[height,width] \${
                zoom ? "max-h-[520px] w-full" : "h-[130px] w-[96px]"
              }\`}
            />`,
  [
    `            {previewMime === "application/pdf" ? (`,
    `              <object`,
    `                data={preview}`,
    `                type="application/pdf"`,
    `                aria-label="Det uppladdade kvittot"`,
    `                className={\`block \${zoom ? "h-[520px] w-full" : "h-[130px] w-[96px]"}\`}`,
    `              >`,
    `                {/* Vissa mobilwebbläsare vägrar rita PDF inline. Då en länk`,
    `                    i stället för en tom ruta. */}`,
    `                <a href={preview} target="_blank" rel="noreferrer"`,
    `                  className="flex h-[130px] w-[96px] items-center justify-center px-2 text-center text-[11px] leading-tight text-ink-2 underline">`,
    `                  Öppna PDF`,
    `                </a>`,
    `              </object>`,
    `            ) : (`,
    `              <img`,
    `                src={preview}`,
    `                alt="Det uppladdade kvittot"`,
    `                className={\`object-contain transition-[height,width] \${`,
    `                  zoom ? "max-h-[520px] w-full" : "h-[130px] w-[96px]"`,
    `                }\`}`,
    `              />`,
    `            )}`,
  ].join("\n"));

/* Informationsrutan bredvid felrutan, på båda ställena där fel visas. */
const ERR_RAD = `        {err && <p className="rounded-[var(--radius-ctl)] bg-crit-bg px-4 py-3 text-[13px] text-ink-2">{err}</p>}`;
const INFO_RAD = [
  ERR_RAD,
  `        {info && <p className="rounded-[var(--radius-ctl)] border border-border bg-raised px-4 py-3 text-[13px] text-ink-2">{info}</p>}`,
].join("\n");
await sub(C, "info-ruta-1", ERR_RAD, INFO_RAD);

const ERR_RAD2 = `      {err && <p className="rounded-[var(--radius-ctl)] bg-crit-bg px-4 py-3 text-[13px] text-ink-2">{err}</p>}`;
const INFO_RAD2 = [
  ERR_RAD2,
  `      {info && <p className="rounded-[var(--radius-ctl)] border border-border bg-raised px-4 py-3 text-[13px] text-ink-2">{info}</p>}`,
].join("\n");
await sub(C, "info-ruta-2", ERR_RAD2, INFO_RAD2);

await sub(C, "nollställ-vid-reset",
`    setErr(null); setDupe(null); setZoom(false);`,
`    setErr(null); setInfo(null); setDupe(null); setZoom(false); setPreviewMime(null);`);

console.log("patched:\n  " + done.join("\n  "));
