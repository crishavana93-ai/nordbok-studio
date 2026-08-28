import { readFile, writeFile } from "node:fs/promises";

const F = "app/receipts/page.js";
let s = await readFile(F, "utf8");
const done = [];
function sub(name, a, b) {
  const c = s.split(a).length - 1;
  if (c !== 1) { console.error(`FAIL ${name}: hittade ${c}`); process.exit(1); }
  s = s.replace(a, b); done.push(name);
}

sub("import",
`import ReceiptCapture from "@/components/receipts/ReceiptCapture";`,
`import ReceiptCapture from "@/components/receipts/ReceiptCapture";
import KvittoRattelse from "@/components/receipts/KvittoRattelse";`);

sub("state",
`  const [expanded, setExpanded] = useState(null);`,
`  const [expanded, setExpanded] = useState(null);
  /* Vilket kvitto som rättas just nu. Ett i taget — två öppna formulär mot samma
     tabell är ett sätt att skriva över sin egen ändring utan att märka det. */
  const [rattar, setRattar] = useState(null);`);

/* Stäng rättelseformuläret när raden fälls ihop. */
sub("stang-vid-hopfallning",
`                    onClick={() => setExpanded(isOpen ? null : r.id)}`,
`                    onClick={() => { setExpanded(isOpen ? null : r.id); setRattar(null); }}`);

/* Dubblerad etikett: "Verifikation" stod på både filen och hashen. */
sub("etikett-kontrollsumma",
`                      <dt className="micro-label pt-0.5">Verifikation</dt>
                      <dd className="break-all font-mono text-[11px] text-ink-3">`,
`                      <dt className="micro-label pt-0.5">Kontrollsumma</dt>
                      <dd className="break-all font-mono text-[11px] text-ink-3">`);

/* Knappen, och formuläret. Formuläret ligger FÖRE detaljlistan så att det inte
   hamnar under en lång rad fält på en telefon. */
sub("rattelse-block",
`                  {/* Law 08 — density one tap down. Law 04 — the evidence is here. */}
                  {isOpen && (`,
`                  {isOpen && rattar === r.id && (
                    <KvittoRattelse
                      kvitto={r}
                      onAvbryt={() => setRattar(null)}
                      onSparad={() => { setRattar(null); load(); }}
                    />
                  )}

                  {/* Law 08 — density one tap down. Law 04 — the evidence is here. */}
                  {isOpen && (`);

sub("rattelse-knapp",
`                      {r.uploaded_at && (<>
                        <dt className="micro-label pt-0.5">Sparad</dt>
                        <dd className="text-ink-2">{dateProse(r.uploaded_at)}</dd>
                      </>)}
                    </dl>`,
`                      {r.uploaded_at && (<>
                        <dt className="micro-label pt-0.5">Sparad</dt>
                        <dd className="text-ink-2">{dateProse(r.uploaded_at)}</dd>
                      </>)}

                      <dt className="micro-label pt-0.5">Rätta</dt>
                      <dd>
                        <button
                          type="button"
                          onClick={() => setRattar(rattar === r.id ? null : r.id)}
                          className="underline underline-offset-2 text-ink-2 hover:text-ink"
                        >
                          {rattar === r.id ? "Stäng formuläret" : "Ändra uppgifterna"}
                        </button>
                      </dd>
                    </dl>`);

await writeFile(F, s, "utf8");
console.log("patchat:", done.join(", "));
