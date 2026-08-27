import { readFile, writeFile } from "node:fs/promises";

const F = "app/bank/page.js";
let s = await readFile(F, "utf8");
const done = [];
function sub(name, a, b) {
  const c = s.split(a).length - 1;
  if (c !== 1) { console.error(`FAIL ${name}: found ${c}`); process.exit(1); }
  s = s.replace(a, b); done.push(name);
}

sub("import",
`import { useCallback, useEffect, useMemo, useRef, useState } from "react";`,
`import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { matchaTransaktioner } from "@/lib/avstamning";`);

/* ── Hämta även kvitton och fakturor: utan dem finns inget att matcha mot ──── */
sub("state",
`  const [txs, setTxs] = useState(null);`,
`  const [txs, setTxs] = useState(null);
  const [kvitton, setKvitton] = useState([]);
  const [fakturor, setFakturor] = useState([]);
  const [kopplar, setKopplar] = useState(null);`);

sub("ladda-underlag",
`    setTxs(data || []);
  }, [sb]);`,
  [
    `    setTxs(data || []);`,
    ``,
    `    /* Underlagen som transaktionerna ska matchas mot. Utan dem har`,
    `       avstämningen ingenting att jämföra med. */`,
    `    const [kv, fk] = await Promise.all([`,
    `      sb.from("studio_receipts")`,
    `        .select("id, vendor, receipt_date, total, total_sek, vat_sek, currency, fx_rate, is_business")`,
    `        .eq("user_id", ownerId)`,
    `        .order("receipt_date", { ascending: false })`,
    `        .limit(500),`,
    `      sb.from("studio_invoices")`,
    `        .select("id, invoice_number, status, paid_at, due_date, total, total_sek, vat_sek, currency, fx_rate, studio_clients(name)")`,
    `        .eq("user_id", ownerId)`,
    `        .order("issue_date", { ascending: false })`,
    `        .limit(500),`,
    `    ]);`,
    `    if (kv.error) reportErrorAsync(kv.error, { scope: "ui/bank-kvitton" });`,
    `    if (fk.error) reportErrorAsync(fk.error, { scope: "ui/bank-fakturor" });`,
    `    setKvitton(kv.data || []);`,
    `    setFakturor((fk.data || []).map((f) => ({ ...f, client_name: f.studio_clients?.name })));`,
    `  }, [sb]);`,
  ].join("\n"));

/* ── Kopplingen ───────────────────────────────────────────────────────────── */
sub("koppla-funktion",
`  const truncated = (txs || []).length > LIMIT;`,
  [
    `  /* Kolumnerna matched_receipt och matched_invoice har funnits sedan första`,
    `     migrationen utan att någonsin sättas. Det här är det som sätter dem. */`,
    `  async function koppla(txId, forslag) {`,
    `    setKopplar(txId); setErr(""); setInfo("");`,
    `    const falt = forslag.typ === "kvitto" ? "matched_receipt" : "matched_invoice";`,
    `    const { error } = await sb`,
    `      .from("studio_bank_tx")`,
    `      .update({ [falt]: forslag.id })`,
    `      .eq("id", txId)`,
    `      .select("id")`,
    `      .maybeSingle();`,
    `    if (error) setErr(\`Kunde inte koppla: \${error.message}\`);`,
    `    else { setInfo(\`Kopplad till \${forslag.etikett}.\`); await load(); }`,
    `    setKopplar(null);`,
    `  }`,
    ``,
    `  async function frankoppla(t) {`,
    `    setKopplar(t.id); setErr(""); setInfo("");`,
    `    const { error } = await sb`,
    `      .from("studio_bank_tx")`,
    `      .update({ matched_receipt: null, matched_invoice: null })`,
    `      .eq("id", t.id)`,
    `      .select("id")`,
    `      .maybeSingle();`,
    `    if (error) setErr(\`Kunde inte ta bort kopplingen: \${error.message}\`);`,
    `    else await load();`,
    `    setKopplar(null);`,
    `  }`,
    ``,
    `  /* Förslagen räknas om varje gång något av de tre underlagen ändras. */`,
    `  const avstamning = useMemo(`,
    `    () => matchaTransaktioner({ transaktioner: txs || [], kvitton, fakturor }),`,
    `    [txs, kvitton, fakturor]`,
    `  );`,
    `  const forslagFor = (id) => avstamning.rader.find((r) => r.tx.id === id);`,
    ``,
    `  const truncated = (txs || []).length > LIMIT;`,
  ].join("\n"));

/* ── Sammanfattningen överst ──────────────────────────────────────────────── */
sub("sammanfattning",
`      {rows.length > 0 && (`,
  [
    `      {avstamning.antalOkopplade > 0 && (`,
    `        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">`,
    `          <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Avstämning</h2>`,
    `          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">`,
    `            Bokföringslagen vill ha en verifikation bakom varje affärshändelse. Kontoutdraget`,
    `            är listan över vad som faktiskt hänt — det som saknar underlag är ett hål.`,
    `          </p>`,
    `          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">`,
    `            <Ruta etikett="Okopplade" varde={avstamning.antalOkopplade} />`,
    `            <Ruta etikett="Säkra förslag" varde={avstamning.antalSakra} />`,
    `            <Ruta`,
    `              etikett="Saknar underlag"`,
    `              varde={avstamning.antalUtanForslag}`,
    `              not={avstamning.beloppUtanUnderlag > 0`,
    `                ? \`\${money(avstamning.beloppUtanUnderlag, { decimals: 0 }).text} utan kvitto\``,
    `                : null}`,
    `              attn={avstamning.antalUtanForslag > 0}`,
    `            />`,
    `          </div>`,
    `        </section>`,
    `      )}`,
    ``,
    `      {rows.length > 0 && (`,
  ].join("\n"));

/* ── Förslagen under varje transaktion ────────────────────────────────────── */
sub("rad",
`                    {(t.matched_receipt || t.matched_invoice) && (
                      <span className="mt-1 inline-block rounded bg-good-bg px-2 py-0.5 font-mono text-[10.5px] font-medium text-good">
                        {t.matched_receipt ? "matchad mot kvitto" : "matchad mot faktura"}
                      </span>
                    )}`,
  [
    `                    {(t.matched_receipt || t.matched_invoice) && (`,
    `                      <span className="mt-1 flex flex-wrap items-center gap-2">`,
    `                        <span className="inline-block rounded bg-good-bg px-2 py-0.5 font-mono text-[10.5px] font-medium text-good">`,
    `                          {t.matched_receipt ? "matchad mot kvitto" : "matchad mot faktura"}`,
    `                        </span>`,
    `                        <button type="button" onClick={() => frankoppla(t)} disabled={kopplar === t.id}`,
    `                          className="text-[11.5px] text-ink-3 underline underline-offset-2 hover:text-ink disabled:opacity-60">`,
    `                          ta bort kopplingen`,
    `                        </button>`,
    `                      </span>`,
    `                    )}`,
    ``,
    `                    {!t.matched_receipt && !t.matched_invoice && (() => {`,
    `                      const rad = forslagFor(t.id);`,
    `                      if (!rad) return null;`,
    `                      if (!rad.forslag.length) {`,
    `                        return (`,
    `                          <span className="mt-1.5 block text-[11.5px] leading-relaxed text-crit">`,
    `                            Saknar underlag — {rad.varfor}.`,
    `                          </span>`,
    `                        );`,
    `                      }`,
    `                      return (`,
    `                        <span className="mt-2 flex flex-col gap-1.5">`,
    `                          {rad.forslag.map((fs) => (`,
    `                            <span key={fs.typ + fs.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">`,
    `                              <button`,
    `                                type="button"`,
    `                                onClick={() => koppla(t.id, fs)}`,
    `                                disabled={kopplar === t.id}`,
    `                                className="rounded-[var(--radius-ctl)] border border-border-firm px-2.5 py-1 text-[12px] font-medium hover:bg-raised disabled:opacity-60"`,
    `                              >`,
    `                                {kopplar === t.id ? "Kopplar…" : "Koppla"}`,
    `                              </button>`,
    `                              <span className="min-w-0 text-[12.5px] text-ink-2">{fs.etikett}</span>`,
    `                              <span className={\`font-mono text-[10.5px] \${fs.sakerhet === "säker" ? "text-good" : "text-ink-3"}\`}>`,
    `                                {fs.sakerhet} · {fs.skal.join(", ")}`,
    `                              </span>`,
    `                            </span>`,
    `                          ))}`,
    `                        </span>`,
    `                      );`,
    `                    })()}`,
  ].join("\n"));

/* ── Den gamla brasklappen är inte sann längre ────────────────────────────── */
sub("brasklapp",
`      <p className="px-1 pb-2 text-[12px] leading-relaxed text-ink-3">
        Matchning mot kvitton och fakturor är inte byggd ännu — kolumnen visar bara vad
        som redan är kopplat. Automatisk banksynk via PSD2 kommer senare.
      </p>`,
  [
    `      <p className="px-1 pb-2 text-[12px] leading-relaxed text-ink-3">`,
    `        Förslagen bygger på belopp först, sedan datum och namn — ett förslag utan`,
    `        matchande belopp visas aldrig, hur väl resten än stämmer. Appen kopplar`,
    `        aldrig något åt dig: en felaktig koppling är svårare att upptäcka än ingen.`,
    `        Automatisk banksynk via PSD2 kommer senare.`,
    `      </p>`,
  ].join("\n"));

/* ── Liten ruta för sammanfattningen ──────────────────────────────────────── */
sub("ruta-komponent",
`function parseCsv(text) {`,
  [
    `function Ruta({ etikett, varde, not, attn }) {`,
    `  return (`,
    `    <div className={\`flex flex-col gap-1 rounded-[var(--radius-card)] border p-3.5 \${attn ? "border-crit/35 bg-crit-bg" : "border-border bg-raised"}\`}>`,
    `      <span className="micro-label">{etikett}</span>`,
    `      <span className="tnum text-[22px] font-medium leading-none">{varde}</span>`,
    `      {not && <span className="text-[11.5px] leading-relaxed text-ink-2">{not}</span>}`,
    `    </div>`,
    `  );`,
    `}`,
    ``,
    `function parseCsv(text) {`,
  ].join("\n"));

await writeFile(F, s, "utf8");
console.log("patched:", done.join(", "));
