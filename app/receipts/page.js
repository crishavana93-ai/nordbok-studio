"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { browserClient } from "@/lib/supabase";

const fmt = (n) => new Intl.NumberFormat("sv-SE").format(Math.round(Number(n) || 0));

export default function ReceiptsPage() {
  const sb = useMemo(() => browserClient(), []);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [draft, setDraft] = useState(null); // OCR draft pending review
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const { data } = await sb.from("studio_receipts").select("*").order("receipt_date", { ascending: false }).limit(200);
    setList(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function handleFile(file) {
    if (!file) return;
    setErr(""); setScanning(true);
    try {
      const dataUri = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });
      const r = await fetch("/api/receipts/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: dataUri }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "OCR misslyckades");
      setDraft({
        ...j,
        _file: file,
        _dataUri: dataUri,
        is_business: true,
        is_deductible: true,
        payment_method: "card",
      });
    } catch (e) { setErr(e.message); }
    finally { setScanning(false); }
  }

  async function saveDraft() {
    if (!draft) return;
    setErr("");
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return setErr("Inte inloggad");

    // Upload original file to Supabase storage (receipts bucket)
    let storage_path = null;
    try {
      const ext = (draft._file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/${new Date().getFullYear()}/${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from("studio-receipts").upload(path, draft._file, { upsert: false });
      if (!upErr) storage_path = path;
    } catch {}

    const insert = {
      user_id: user.id,
      receipt_date: draft.receipt_date || new Date().toISOString().slice(0, 10),
      vendor: draft.vendor || "",
      total: Number(draft.total) || 0,
      vat_amount: draft.vat_amount != null ? Number(draft.vat_amount) : null,
      vat_rate: draft.vat_rate != null ? Number(draft.vat_rate) : null,
      currency: draft.currency || "SEK",
      category: draft.category || null,
      bas_account: draft.bas_account || null,
      ne_row: draft.ne_row || null,
      payment_method: draft.payment_method,
      description: draft.description || null,
      storage_path,
      ocr_raw: draft,
      ocr_confidence: draft.confidence ?? null,
      is_business: draft.is_business,
      is_deductible: draft.is_deductible,
      source: "scan",
      status: "approved",
    };
    const { error } = await sb.from("studio_receipts").insert(insert);
    if (error) return setErr(error.message);
    setDraft(null);
    load();
  }

  return (
    <>
      <div className="spread" style={{ marginBottom: 18 }}>
        <h1 className="h1">Kvitton</h1>
        <div className="row">
          <button className="btn" onClick={() => cameraRef.current?.click()}>Scanna med kamera</button>
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Ladda upp bild</button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
          <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
        </div>
      </div>

      {scanning && <div className="alert alert-info">Läser kvitto med AI...</div>}
      {err && <div className="alert alert-error">{err}</div>}

      {draft && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="spread" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600 }}>Granska — AI-tolkning ({Math.round((draft.confidence || 0) * 100)}% säker)</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>Avbryt</button>
          </div>
          <div className="grid-2">
            <div>
              {draft._dataUri && <img src={draft._dataUri} alt="kvitto" style={{ maxWidth: "100%", borderRadius: 9, border: "1px solid var(--line)" }} />}
            </div>
            <div>
              <div className="grid-2">
                <div className="field"><label className="label">Leverantör</label><input className="input" value={draft.vendor || ""} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} /></div>
                <div className="field"><label className="label">Datum</label><input className="input" type="date" value={draft.receipt_date || ""} onChange={(e) => setDraft({ ...draft, receipt_date: e.target.value })} /></div>
                <div className="field"><label className="label">Belopp (totalt)</label><input className="input num" type="number" step="0.01" value={draft.total || 0} onChange={(e) => setDraft({ ...draft, total: e.target.value })} /></div>
                <div className="field"><label className="label">Moms</label><input className="input num" type="number" step="0.01" value={draft.vat_amount ?? ""} onChange={(e) => setDraft({ ...draft, vat_amount: e.target.value })} /></div>
                <div className="field"><label className="label">Momssats</label>
                  <select className="select" value={draft.vat_rate ?? 25} onChange={(e) => setDraft({ ...draft, vat_rate: Number(e.target.value) })}>
                    <option value={25}>25%</option><option value={12}>12%</option><option value={6}>6%</option><option value={0}>0%</option>
                  </select>
                </div>
                <div className="field"><label className="label">Kategori</label><input className="input" value={draft.category || ""} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></div>
                <div className="field"><label className="label">BAS-konto</label><input className="input" value={draft.bas_account || ""} onChange={(e) => setDraft({ ...draft, bas_account: e.target.value })} /></div>
                <div className="field"><label className="label">NE-rad</label><input className="input" value={draft.ne_row || ""} onChange={(e) => setDraft({ ...draft, ne_row: e.target.value })} /></div>
              </div>
              <div className="field"><label className="label">Beskrivning</label><textarea className="textarea" rows={2} value={draft.description || ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
              <div className="row" style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13 }}><input type="checkbox" checked={draft.is_business} onChange={(e) => setDraft({ ...draft, is_business: e.target.checked })} /> Företagskostnad</label>
                <label style={{ fontSize: 13 }}><input type="checkbox" checked={draft.is_deductible} onChange={(e) => setDraft({ ...draft, is_deductible: e.target.checked })} /> Avdragsgill</label>
              </div>
              <button className="btn" onClick={saveDraft} style={{ width: "100%", justifyContent: "center" }}>Spara kvitto</button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="empty">Laddar...</div> : list.length === 0 ? (
          <div className="empty">Inga kvitton ännu — scanna ditt första.</div>
        ) : (
          <div className="table-wrap">
            <table className="table table-stack">
              <thead><tr><th>Datum</th><th>Leverantör</th><th>Kategori</th><th>BAS</th><th className="num">Moms</th><th className="num">Total</th><th>Status</th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Datum">{r.receipt_date}</td>
                    <td data-label="Leverantör">{r.vendor}</td>
                    <td data-label="Kategori" className="muted">{r.category}</td>
                    <td data-label="BAS" className="muted">{r.bas_account}</td>
                    <td data-label="Moms" className="num">{fmt(r.vat_amount)}</td>
                    <td data-label="Total" className="num">{fmt(r.total)} {r.currency || "SEK"}</td>
                    <td data-label="Status"><span className={`badge badge-${r.status === "approved" ? "paid" : "review"}`}>{r.status}</span></td>
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
