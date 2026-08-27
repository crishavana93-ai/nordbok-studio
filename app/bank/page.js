"use client";

/* app/bank/page.js — DIRECTION C
 *
 * Migrated 2026-08-24. Beyond colour: scoped to the active owner (the query had no
 * user_id and merged two people's accounts once revisor access existed), read and
 * write errors are surfaced instead of discarded, and the import now reports how many
 * rows it SKIPPED — importing 40 of 52 and mentioning only the 40 is how a
 * reconciliation goes quietly wrong.
 *
 * Amounts go through lib/format.js like everywhere else. The local Intl formatter here
 * rounded to whole kronor, which on a ledger you reconcile against a bank statement
 * loses the öre that make the two disagree.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { matchaTransaktioner } from "@/lib/avstamning";
import { browserClient } from "@/lib/supabase";
import { readActiveOwnerId } from "@/lib/owner-client";
import { money, num, dateISO } from "@/lib/format";
import { reportErrorAsync } from "@/lib/report-error";

const LIMIT = 500;

export default function BankPage() {
  const sb = useMemo(() => browserClient(), []);
  const [txs, setTxs] = useState(null);
  const [kvitton, setKvitton] = useState([]);
  const [fakturor, setFakturor] = useState([]);
  const [kopplar, setKopplar] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    /* Scoped to the active owner. The query had no user_id at all — fine until 006
       added revisor access, after which RLS legitimately returns both owners' rows and
       this ledger interleaved two people's bank accounts with nothing saying so. */
    const ownerId = readActiveOwnerId(user.id);
    const { data, error } = await sb
      .from("studio_bank_tx").select("*")
      .eq("user_id", ownerId)
      .order("tx_date", { ascending: false })
      .limit(LIMIT + 1);
    if (error) {
      setErr("Kunde inte hämta transaktionerna.");
      reportErrorAsync(error, { scope: "ui/bank" });
      setTxs([]); return;
    }
    setTxs(data || []);

    /* Underlagen som transaktionerna ska matchas mot. Utan dem har
       avstämningen ingenting att jämföra med. */
    const [kv, fk] = await Promise.all([
      sb.from("studio_receipts")
        .select("id, vendor, receipt_date, total, total_sek, vat_sek, currency, fx_rate, is_business")
        .eq("user_id", ownerId)
        .order("receipt_date", { ascending: false })
        .limit(500),
      sb.from("studio_invoices")
        .select("id, invoice_number, status, paid_at, due_date, total, total_sek, vat_sek, currency, fx_rate, studio_clients(name)")
        .eq("user_id", ownerId)
        .order("issue_date", { ascending: false })
        .limit(500),
    ]);
    if (kv.error) reportErrorAsync(kv.error, { scope: "ui/bank-kvitton" });
    if (fk.error) reportErrorAsync(fk.error, { scope: "ui/bank-fakturor" });
    setKvitton(kv.data || []);
    setFakturor((fk.data || []).map((f) => ({ ...f, client_name: f.studio_clients?.name })));
  }, [sb]);

  useEffect(() => { load(); }, [load]);

  async function importCsv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(""); setInfo(""); setBusy(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) throw new Error("Filen är tom, eller så känner vi inte igen formatet.");
      const { data: { user } } = await sb.auth.getUser();

      const parsed = rows.map(normalizeRow);
      const inserts = parsed
        .filter((r) => r && r.amount != null && r.tx_date)
        .map((r) => ({ ...r, user_id: user.id, bank: file.name.split(".")[0].slice(0, 32) }));

      if (inserts.length === 0) {
        throw new Error("Ingen rad gick att tolka. Vi läser Swedbank, SEB, Handelsbanken, Nordea och Revolut — kolla att exporten har kolumner för datum, text och belopp.");
      }
      const { error } = await sb.from("studio_bank_tx").insert(inserts);
      if (error) throw error;

      /* Say what was skipped. Importing 40 of 52 rows and reporting only the 40 is how
         a reconciliation quietly goes wrong. */
      const skipped = rows.length - inserts.length;
      setInfo(skipped > 0
        ? `Importerade ${inserts.length} transaktioner. ${skipped} rader hoppades över — de saknade datum eller belopp.`
        : `Importerade ${inserts.length} transaktioner.`);
      await load();
    } catch (e2) {
      setErr(e2.message);
      reportErrorAsync(e2, { scope: "ui/bank-import" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /* Kolumnerna matched_receipt och matched_invoice har funnits sedan första
     migrationen utan att någonsin sättas. Det här är det som sätter dem. */
  async function koppla(txId, forslag) {
    setKopplar(txId); setErr(""); setInfo("");
    const falt = forslag.typ === "kvitto" ? "matched_receipt" : "matched_invoice";
    const { error } = await sb
      .from("studio_bank_tx")
      .update({ [falt]: forslag.id })
      .eq("id", txId)
      .select("id")
      .maybeSingle();
    if (error) setErr(`Kunde inte koppla: ${error.message}`);
    else { setInfo(`Kopplad till ${forslag.etikett}.`); await load(); }
    setKopplar(null);
  }

  async function frankoppla(t) {
    setKopplar(t.id); setErr(""); setInfo("");
    const { error } = await sb
      .from("studio_bank_tx")
      .update({ matched_receipt: null, matched_invoice: null })
      .eq("id", t.id)
      .select("id")
      .maybeSingle();
    if (error) setErr(`Kunde inte ta bort kopplingen: ${error.message}`);
    else await load();
    setKopplar(null);
  }

  /* Förslagen räknas om varje gång något av de tre underlagen ändras. */
  const avstamning = useMemo(
    () => matchaTransaktioner({ transaktioner: txs || [], kvitton, fakturor }),
    [txs, kvitton, fakturor]
  );
  const forslagFor = (id) => avstamning.rader.find((r) => r.tx.id === id);

  const truncated = (txs || []).length > LIMIT;
  const rows = (txs || []).slice(0, LIMIT);

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-medium tracking-[-0.015em]">Bank</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {txs === null ? "Laddar…" : rows.length === 0 ? "Inga transaktioner ännu" : `${num(rows.length)} transaktioner`}
          </p>
        </div>
        <div className="shrink-0">
          <input ref={fileRef} type="file" accept=".csv,.txt" hidden onChange={importCsv} />
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            className="rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink disabled:opacity-40">
            {busy ? "Importerar…" : "Importera CSV"}
          </button>
        </div>
      </div>

      {err && (
        <p role="alert" className="rounded-[var(--radius-card)] border border-crit/35 bg-crit-bg px-4 py-3 text-[13px] leading-relaxed text-ink-2">{err}</p>
      )}
      {info && (
        <p role="status" className="rounded-[var(--radius-card)] border border-good/35 bg-good-bg px-4 py-3 text-[13px] leading-relaxed text-ink-2">{info}</p>
      )}

      {rows.length === 0 && txs !== null && (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <div className="py-8 text-center">
            <p className="text-[14px] text-ink-2">Inga transaktioner ännu.</p>
            <p className="mx-auto mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-ink-3">
              Exportera kontoutdraget från din bank som CSV och lägg in det här. Vi läser
              Swedbank, SEB, Handelsbanken, Nordea och Revolut.
            </p>
          </div>
        </section>
      )}

      {avstamning.antalOkopplade > 0 && (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Avstämning</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
            Bokföringslagen vill ha en verifikation bakom varje affärshändelse. Kontoutdraget
            är listan över vad som faktiskt hänt — det som saknar underlag är ett hål.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Ruta etikett="Okopplade" varde={avstamning.antalOkopplade} />
            <Ruta etikett="Säkra förslag" varde={avstamning.antalSakra} />
            <Ruta
              etikett="Saknar underlag"
              varde={avstamning.antalUtanForslag}
              not={avstamning.beloppUtanUnderlag > 0
                ? `${money(avstamning.beloppUtanUnderlag, { decimals: 0 }).text} utan kvitto`
                : null}
              attn={avstamning.antalUtanForslag > 0}
            />
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-col">
            {rows.map((t) => {
              const inbound = Number(t.amount) >= 0;
              const m = money(t.amount, { decimals: 2, currency: t.currency || "SEK" });
              return (
                <div key={t.id} className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-border py-3 last:border-b-0">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] text-ink">{t.description || "—"}</span>
                    <span className="mt-0.5 block font-mono text-[11.5px] text-ink-3">
                      {dateISO(t.tx_date)}{t.bank ? ` · ${t.bank}` : ""}
                    </span>
                    {(t.matched_receipt || t.matched_invoice) && (
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="inline-block rounded bg-good-bg px-2 py-0.5 font-mono text-[10.5px] font-medium text-good">
                          {t.matched_receipt ? "matchad mot kvitto" : "matchad mot faktura"}
                        </span>
                        <button type="button" onClick={() => frankoppla(t)} disabled={kopplar === t.id}
                          className="text-[11.5px] text-ink-3 underline underline-offset-2 hover:text-ink disabled:opacity-60">
                          ta bort kopplingen
                        </button>
                      </span>
                    )}

                    {!t.matched_receipt && !t.matched_invoice && (() => {
                      const rad = forslagFor(t.id);
                      if (!rad) return null;
                      if (!rad.forslag.length) {
                        return (
                          <span className="mt-1.5 block text-[11.5px] leading-relaxed text-crit">
                            Saknar underlag — {rad.varfor}.
                          </span>
                        );
                      }
                      return (
                        <span className="mt-2 flex flex-col gap-1.5">
                          {rad.forslag.map((fs) => (
                            <span key={fs.typ + fs.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <button
                                type="button"
                                onClick={() => koppla(t.id, fs)}
                                disabled={kopplar === t.id}
                                className="rounded-[var(--radius-ctl)] border border-border-firm px-2.5 py-1 text-[12px] font-medium hover:bg-raised disabled:opacity-60"
                              >
                                {kopplar === t.id ? "Kopplar…" : "Koppla"}
                              </button>
                              <span className="min-w-0 text-[12.5px] text-ink-2">{fs.etikett}</span>
                              <span className={`font-mono text-[10.5px] ${fs.sakerhet === "säker" ? "text-good" : "text-ink-3"}`}>
                                {fs.sakerhet} · {fs.skal.join(", ")}
                              </span>
                            </span>
                          ))}
                        </span>
                      );
                    })()}
                  </span>
                  <span className={`tnum shrink-0 font-mono text-[14px] font-medium ${inbound ? "text-good" : "text-ink"}`}
                        lang="sv-SE" aria-label={m.spoken}>
                    {inbound ? "+" : ""}{m.text}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {truncated && (
        <p className="rounded-[var(--radius-card)] border border-warn/40 bg-warn-bg px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          Visar de {num(LIMIT)} senaste transaktionerna. Du har fler.
        </p>
      )}

      <p className="px-1 pb-2 text-[12px] leading-relaxed text-ink-3">
        Förslagen bygger på belopp först, sedan datum och namn — ett förslag utan
        matchande belopp visas aldrig, hur väl resten än stämmer. Appen kopplar
        aldrig något åt dig: en felaktig koppling är svårare att upptäcka än ingen.
        Automatisk banksynk via PSD2 kommer senare.
      </p>
    </div>
  );
}

/* Naive CSV parser supporting common Swedish bank exports. */
function Ruta({ etikett, varde, not, attn }) {
  return (
    <div className={`flex flex-col gap-1 rounded-[var(--radius-card)] border p-3.5 ${attn ? "border-crit/35 bg-crit-bg" : "border-border bg-raised"}`}>
      <span className="micro-label">{etikett}</span>
      <span className="tnum text-[22px] font-medium leading-none">{varde}</span>
      {not && <span className="text-[11.5px] leading-relaxed text-ink-2">{not}</span>}
    </div>
  );
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  // Detect separator
  const sep = lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
  return lines.slice(1).map((l) => {
    const cols = splitCsvLine(l, sep);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] || "").replace(/^"|"$/g, "").trim(); });
    return obj;
  });
}
function splitCsvLine(line, sep) {
  const out = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === sep && !inQ) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function normalizeRow(r) {
  const dateKeys = ["bokföringsdag", "bokforingsdag", "datum", "transaktionsdatum", "valutadag", "date"];
  const descKeys = ["text", "beskrivning", "meddelande", "specifikation", "narrative", "description"];
  const amtKeys = ["belopp", "amount", "summa"];
  const date = parseDate(firstKey(r, dateKeys));
  const desc = firstKey(r, descKeys) || "";
  const amount = parseNumber(firstKey(r, amtKeys));
  if (!date || amount == null) return null;
  return { tx_date: date, description: desc, amount };
}
function firstKey(obj, keys) { for (const k of keys) if (obj[k] != null && obj[k] !== "") return obj[k]; return ""; }
function parseDate(s) {
  const m = String(s).match(/(\d{4})[-/.](\d{2})[-/.](\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function parseNumber(s) {
  if (s == null || s === "") return null;
  const t = String(s).replace(/\s/g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
