"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { browserClient } from "@/lib/supabase";

const fmt = (n) => new Intl.NumberFormat("sv-SE").format(Math.round(Number(n) || 0));

export default function BankPage() {
  const sb = useMemo(() => browserClient(), []);
  const [txs, setTxs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const fileRef = useRef(null);

  async function load() {
    const { data } = await sb.from("studio_bank_tx").select("*").order("tx_date", { ascending: false }).limit(500);
    setTxs(data || []);
  }
  useEffect(() => { load(); }, []);

  async function importCsv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(""); setInfo(""); setBusy(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) throw new Error("Tom fil eller okänt format.");
      const { data: { user } } = await sb.auth.getUser();
      const inserts = rows
        .map((r) => normalizeRow(r))
        .filter((r) => r && r.amount != null && r.tx_date)
        .map((r) => ({ ...r, user_id: user.id, bank: file.name.split(".")[0].slice(0, 32) }));
      if (inserts.length === 0) throw new Error("Ingen rad kunde tolkas. Stöder Swedbank, SEB, Handelsbanken, Nordea, Revolut.");
      const { error } = await sb.from("studio_bank_tx").insert(inserts);
      if (error) throw error;
      setInfo(`Importerade ${inserts.length} transaktioner.`);
      load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <>
      <div className="spread" style={{ marginBottom: 18 }}>
        <h1 className="h1">Bank</h1>
        <div className="row">
          <input ref={fileRef} type="file" accept=".csv,.txt" hidden onChange={importCsv} />
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? "Importerar..." : "Importera CSV"}</button>
        </div>
      </div>

      {err && <div className="alert alert-error">{err}</div>}
      {info && <div className="alert alert-ok">{info}</div>}

      <div className="alert alert-info" style={{ marginBottom: 14 }}>
        <strong>Steg 1 — manuell CSV-import (gratis).</strong> Exportera dina kontoutdrag från din bank (Swedbank, SEB, Handelsbanken, Nordea, Revolut) och dra hit. Vi tolkar de flesta CSV-format automatiskt.
        <br />
        <strong>Steg 2 — automatisk synk (kommande).</strong> PSD2 / Open Banking via Tink eller Nordigen — kommer i v1.5.
      </div>

      <div className="card" style={{ padding: 0 }}>
        {txs.length === 0 ? <div className="empty">Inga transaktioner ännu.</div> : (
          <div className="table-wrap">
            <table className="table table-stack">
              <thead><tr><th>Datum</th><th>Beskrivning</th><th>Bank</th><th className="num">Belopp</th><th>Matchad</th></tr></thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Datum">{t.tx_date}</td>
                    <td data-label="Beskrivning">{t.description}</td>
                    <td data-label="Bank" className="muted">{t.bank}</td>
                    <td data-label="Belopp" className="num" style={{ color: Number(t.amount) >= 0 ? "var(--ok)" : "var(--error)" }}>{fmt(t.amount)} {t.currency || "kr"}</td>
                    <td data-label="Matchad">{t.matched_receipt ? "kvitto" : t.matched_invoice ? "faktura" : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* Naive CSV parser supporting common Swedish bank exports. */
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
