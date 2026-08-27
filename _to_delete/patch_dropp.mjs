import { readFile, writeFile } from "node:fs/promises";

const F = "components/receipts/ReceiptCapture.jsx";
let s = await readFile(F, "utf8");
const done = [];
function sub(name, a, b) {
  const c = s.split(a).length - 1;
  if (c !== 1) { console.error(`FAIL ${name}: found ${c}`); process.exit(1); }
  s = s.replace(a, b); done.push(name);
}

/* ── Vad som får laddas upp, på ett ställe ────────────────────────────────── */
sub("mimetyper",
`async function shrink(file) {`,
  [
    `/* Samma lista som route.js godtar. Att kontrollera här också är inte`,
    `   dubbelarbete: det ger ett begripligt besked innan filen skickas i väg. */`,
    `const OK_MIME = new Set([`,
    `  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf",`,
    `]);`,
    ``,
    `async function shrink(file) {`,
  ].join("\n"));

/* ── Dra och släpp, och klistra in ────────────────────────────────────────── */
sub("dropp-state",
`  const [previewMime, setPreviewMime] = useState(null);`,
`  const [previewMime, setPreviewMime] = useState(null);
  const [drarOver, setDrarOver] = useState(false);`);

sub("mottag",
`  async function upload(raw) {`,
  [
    `  /* En gemensam ingång för filväljaren, släppet och inklistringen. Den enda`,
    `     skillnaden mellan dem är hur filen kom hit. */`,
    `  function taEmot(fil) {`,
    `    if (!fil) return;`,
    `    if (!OK_MIME.has(fil.type)) {`,
    `      setErr(\`\${fil.name || "Filen"} är av typen \${fil.type || "okänd"}, som inte går att bokföra. Använd JPEG, PNG, HEIC eller PDF.\`);`,
    `      return;`,
    `    }`,
    `    upload(fil);`,
    `  }`,
    ``,
    `  /* Klistra in: en skärmdump i urklipp är det snabbaste sättet att få in ett`,
    `     kvitto som kom som bild i ett mejl. Lyssnaren sitter på fönstret och bara`,
    `     medan skärmen väntar på en fil. */`,
    `  useEffect(() => {`,
    `    if (stage !== "idle") return;`,
    `    const onPaste = (e) => {`,
    `      const filer = [...(e.clipboardData?.files || [])];`,
    `      if (!filer.length) return;`,
    `      e.preventDefault();`,
    `      taEmot(filer[0]);`,
    `    };`,
    `    window.addEventListener("paste", onPaste);`,
    `    return () => window.removeEventListener("paste", onPaste);`,
    `  }, [stage]);`,
    ``,
    `  async function upload(raw) {`,
  ].join("\n"));

/* ── Släppytan runt de två knapparna ──────────────────────────────────────── */
sub("dropzon",
`      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2.5">`,
  [
    `      <div`,
    `        className="flex flex-col gap-3"`,
    `        onDragOver={(e) => { e.preventDefault(); if (stage === "idle") setDrarOver(true); }}`,
    `        onDragLeave={(e) => { if (e.currentTarget === e.target) setDrarOver(false); }}`,
    `        onDrop={(e) => {`,
    `          e.preventDefault();`,
    `          setDrarOver(false);`,
    `          if (stage !== "idle") return;`,
    `          taEmot(e.dataTransfer?.files?.[0]);`,
    `        }}`,
    `      >`,
    `        <div className={\`grid grid-cols-2 gap-2.5 rounded-[var(--radius-card)] transition-colors \${`,
    `          drarOver ? "outline outline-2 outline-offset-4 outline-brand" : ""`,
    `        }\`}>`,
  ].join("\n"));

sub("hjälptext",
`        {stage === "uploading" && (
          <p className="text-center text-[13px] text-ink-3" role="status">Sparar och läser kvittot…</p>
        )}`,
  [
    `        {stage === "idle" && (`,
    `          <p className="text-center text-[12.5px] leading-relaxed text-ink-3">`,
    `            {drarOver`,
    `              ? "Släpp filen här."`,
    `              : "Du kan också dra hit en fil, eller klistra in en skärmdump med ⌘V."}`,
    `          </p>`,
    `        )}`,
    ``,
    `        {stage === "uploading" && (`,
    `          <p className="text-center text-[13px] text-ink-3" role="status">Sparar och läser kvittot…</p>`,
    `        )}`,
  ].join("\n"));

/* Filväljarna går genom samma kontroll som släppet. */
sub("cam-input",
`          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />`,
`          onChange={(e) => taEmot(e.target.files?.[0])} />
        <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden
          onChange={(e) => taEmot(e.target.files?.[0])} />`);

await writeFile(F, s, "utf8");
console.log("patched:", done.join(", "));
