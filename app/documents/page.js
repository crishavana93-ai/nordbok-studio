"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { browserClient } from "@/lib/supabase";

const fmtBytes = (n) => {
  const u = ["B", "kB", "MB", "GB"]; let i = 0; let v = Number(n);
  while (v > 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
};

export default function DocumentsPage() {
  const sb = useMemo(() => browserClient(), []);
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  async function load() {
    const { data } = await sb.from("studio_documents").select("*").order("created_at", { ascending: false });
    setList(data || []);
  }
  useEffect(() => { load(); }, []);

  async function upload(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = fileRef.current?.files?.[0];
    if (!file) return setErr("Välj en fil att ladda upp.");
    setErr(""); setBusy(true);
    try {
      const { data: { user } } = await sb.auth.getUser();
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `${user.id}/${new Date().getFullYear()}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error: upErr } = await sb.storage.from("studio-documents").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const issued = f.get("issued_date") || new Date().toISOString().slice(0, 10);
      const retention = new Date(new Date(issued).getTime() + 7 * 365 * 86400000).toISOString().slice(0, 10);
      const insert = {
        user_id: user.id,
        title: f.get("title"),
        doc_type: f.get("doc_type") || "other",
        category: f.get("category") || null,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        issued_date: issued,
        retention_until: retention,
        notes: f.get("notes") || null,
        tags: (f.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean),
      };
      const { error } = await sb.from("studio_documents").insert(insert);
      if (error) throw error;
      e.target.reset();
      load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function getUrl(path) {
    const { data } = await sb.storage.from("studio-documents").createSignedUrl(path, 300);
    return data?.signedUrl;
  }

  async function open(d) {
    const url = await getUrl(d.storage_path);
    if (url) window.open(url, "_blank");
  }

  async function del(d) {
    if (!confirm(`Radera "${d.title}"? Bokföringsregler kräver 7 års arkivering — bekräfta att du vet vad du gör.`)) return;
    await sb.storage.from("studio-documents").remove([d.storage_path]);
    await sb.from("studio_documents").delete().eq("id", d.id);
    load();
  }

  return (
    <>
      <div className="spread" style={{ marginBottom: 18 }}>
        <h1 className="h1">Arkiv (kontorsvalv)</h1>
        <span className="muted">Bokföringslagen kräver 7 års arkivering</span>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 className="h2" style={{ marginTop: 0 }}>Ladda upp dokument</h2>
        {err && <div className="alert alert-error">{err}</div>}
        <form onSubmit={upload}>
          <div className="grid-2">
            <div className="field"><label className="label">Titel</label><input className="input" name="title" required placeholder="t.ex. Hyresavtal Drottninggatan 2026" /></div>
            <div className="field"><label className="label">Typ</label>
              <select className="select" name="doc_type">
                <option value="contract">Avtal</option>
                <option value="registreringsbevis">Registreringsbevis</option>
                <option value="invoice_in">Leverantörsfaktura</option>
                <option value="bank_statement">Kontoutdrag</option>
                <option value="sie">SIE-fil</option>
                <option value="tax_filing">Skattedeklaration</option>
                <option value="id">ID-handling</option>
                <option value="other">Annat</option>
              </select>
            </div>
            <div className="field"><label className="label">Kategori</label><input className="input" name="category" placeholder="Skatteverket, Bank, Försäkring..." /></div>
            <div className="field"><label className="label">Utgivningsdatum</label><input className="input" name="issued_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
            <div className="field" style={{ gridColumn: "span 2" }}><label className="label">Taggar (kommaseparerade)</label><input className="input" name="tags" placeholder="hyresavtal, 2026, kontor" /></div>
            <div className="field" style={{ gridColumn: "span 2" }}><label className="label">Anteckningar</label><textarea className="textarea" name="notes" rows={2}></textarea></div>
            <div className="field" style={{ gridColumn: "span 2" }}><label className="label">Fil</label><input ref={fileRef} className="input" type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.csv,.sie,.txt" /></div>
          </div>
          <button className="btn" type="submit" disabled={busy}>{busy ? "Laddar upp..." : "Ladda upp"}</button>
        </form>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {list.length === 0 ? <div className="empty">Inga dokument ännu.</div> : (
          <table className="table">
            <thead><tr><th>Titel</th><th>Typ</th><th>Kategori</th><th>Utgivet</th><th>Spara t.o.m.</th><th>Storlek</th><th></th></tr></thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.title}</strong>{d.tags?.length > 0 && <div style={{ marginTop: 2 }}>{d.tags.map((t) => <span key={t} className="tag-chip" style={{ marginRight: 4 }}>{t}</span>)}</div>}</td>
                  <td className="muted">{d.doc_type}</td>
                  <td className="muted">{d.category || "—"}</td>
                  <td>{d.issued_date}</td>
                  <td>{d.retention_until}</td>
                  <td className="muted num">{fmtBytes(d.size_bytes)}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => open(d)}>Öppna</button> <button className="btn btn-ghost btn-sm" onClick={() => del(d)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
