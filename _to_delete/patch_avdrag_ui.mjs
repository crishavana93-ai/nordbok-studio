import { readFile, writeFile } from "node:fs/promises";

const F = "components/receipts/ReceiptCapture.jsx";
let s = await readFile(F, "utf8");
const done = [];
function sub(name, a, b) {
  const c = s.split(a).length - 1;
  if (c !== 1) { console.error(`FAIL ${name}: found ${c}`); process.exit(1); }
  s = s.replace(a, b); done.push(name);
}

/* Bedömningen placeras FÖRE granskningsrutan. Det som kostar pengar ska läsas
   först; att modellen tvekat om ett fält är mindre viktigt än att leverantören
   debiterat moms som inte går att få tillbaka. */
sub("avdragspanel",
`      {/* Law 05 — Granska. The model's own honest caveats, verbatim. */}`,
  [
    `      {/* Vad som får dras av. Fälten ovan är avläsning; det här är bedömningen. */}`,
    `      {avdrag && (`,
    `        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4">`,
    `          <div className="flex flex-wrap items-baseline justify-between gap-2">`,
    `            <h3 className="text-[13.5px] font-medium text-ink">Avdrag</h3>`,
    `            <span className={\`rounded px-2 py-0.5 font-mono text-[10.5px] font-medium \${`,
    `              avdrag.avdragsgill === "ja" ? "bg-good-bg text-good"`,
    `              : avdrag.avdragsgill === "nej" ? "bg-crit-bg text-crit"`,
    `              : "bg-warn-bg text-warn"`,
    `            }\`}>`,
    `              {avdrag.avdragsgill === "ja" ? "avdragsgill"`,
    `                : avdrag.avdragsgill === "nej" ? "ej avdragsgill" : "delvis avdragsgill"}`,
    `            </span>`,
    `          </div>`,
    ``,
    `          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">`,
    `            <dt className="micro-label pt-0.5">Kostnad</dt>`,
    `            <dd className="tnum font-mono text-ink-2">`,
    `              {avdrag.kostnad_avdrag == null ? "beror på antal personer" : \`\${avdrag.kostnad_avdrag} kr\`}`,
    `            </dd>`,
    `            <dt className="micro-label pt-0.5">Moms att dra</dt>`,
    `            <dd className="tnum font-mono text-ink-2">`,
    `              {avdrag.moms_avdrag == null ? "beror på antal personer" : \`\${avdrag.moms_avdrag} kr\`}`,
    `            </dd>`,
    `          </dl>`,
    ``,
    `          {avdrag.skal.length > 0 && (`,
    `            <ul className="mt-3 flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-ink-2">`,
    `              {avdrag.skal.map((r, i) => <li key={i}>· {r}</li>)}`,
    `            </ul>`,
    `          )}`,
    ``,
    `          {avdrag.varningar.map((v, i) => (`,
    `            <div`,
    `              key={i}`,
    `              className={\`mt-3 rounded-[var(--radius-ctl)] border p-3 \${`,
    `                v.allvar === "hog" ? "border-crit/35 bg-crit-bg" : "border-warn/35 bg-warn-bg"`,
    `              }\`}`,
    `            >`,
    `              <p className="text-[13px] font-medium leading-relaxed text-ink">{v.text}</p>`,
    `              {v.atgard && (`,
    `                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{v.atgard}</p>`,
    `              )}`,
    `            </div>`,
    `          ))}`,
    `        </section>`,
    `      )}`,
    ``,
    `      {/* Law 05 — Granska. The model's own honest caveats, verbatim. */}`,
  ].join("\n"));

await writeFile(F, s, "utf8");
console.log("patched:", done.join(", "));
