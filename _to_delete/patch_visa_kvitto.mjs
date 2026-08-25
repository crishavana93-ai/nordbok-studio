import { readFile, writeFile } from "node:fs/promises";

const F = "app/receipts/page.js";
let s = await readFile(F, "utf8");
const done = [];
function sub(name, a, b) {
  const c = s.split(a).length - 1;
  if (c !== 1) { console.error(`FAIL ${name}: found ${c}`); process.exit(1); }
  s = s.replace(a, b); done.push(name);
}

/* ── En knapp som hämtar en signerad länk och öppnar filen ─────────────────── */
sub("öppnaKvitto",
`  const sb = useMemo(() => browserClient(), []);`,
  [
    `  const sb = useMemo(() => browserClient(), []);`,
    ``,
    `  /* Sedan 1 juli 2024 ÄR kvittobilden verifikationen. Filen laddades upp till`,
    `     Storage och visades sedan aldrig igen — det gick alltså inte att titta på`,
    `     sina egna verifikationer. Hinken är privat, så länken måste signeras.`,
    `     Den är giltig i en minut och skapas först när någon ber om den. */`,
    `  const [oppnar, setOppnar] = useState(null);`,
    `  const [filFel, setFilFel] = useState(null);`,
    ``,
    `  async function oppnaKvitto(rad) {`,
    `    if (!rad?.storage_path) return;`,
    `    setOppnar(rad.id); setFilFel(null);`,
    `    try {`,
    `      const { data, error } = await sb.storage`,
    `        .from("studio-receipts")`,
    `        .createSignedUrl(rad.storage_path, 60);`,
    `      if (error || !data?.signedUrl) throw error || new Error("Ingen länk kom tillbaka.");`,
    `      window.open(data.signedUrl, "_blank", "noopener,noreferrer");`,
    `    } catch (e) {`,
    `      setFilFel(\`Kunde inte öppna filen: \${e.message || "okänt fel"}\`);`,
    `    } finally {`,
    `      setOppnar(null);`,
    `    }`,
    `  }`,
  ].join("\n"));

/* ── Raden i detaljvyn ────────────────────────────────────────────────────── */
sub("rad-i-dl",
`                      <dt className="micro-label pt-0.5">Moms</dt>`,
  [
    `                      <dt className="micro-label pt-0.5">Verifikation</dt>`,
    `                      <dd className="text-ink-2">`,
    `                        {r.storage_path ? (`,
    `                          <button`,
    `                            type="button"`,
    `                            onClick={() => oppnaKvitto(r)}`,
    `                            disabled={oppnar === r.id}`,
    `                            className="underline underline-offset-2 hover:text-ink disabled:opacity-60"`,
    `                          >`,
    `                            {oppnar === r.id ? "Öppnar…" : \`Visa \${r.file_mime === "application/pdf" ? "PDF" : "kvitto"}\`}`,
    `                          </button>`,
    `                        ) : (`,
    `                          <span className="text-crit">Ingen fil — kvittot saknar underlag</span>`,
    `                        )}`,
    `                      </dd>`,
    ``,
    `                      <dt className="micro-label pt-0.5">Moms</dt>`,
  ].join("\n"));

await writeFile(F, s, "utf8");
console.log("patched:", done.join(", "));
