"use client";
import { useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase";

export default function ClientsPage() {
  const sb = useMemo(() => browserClient(), []);
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    const { data } = await sb.from("studio_clients").select("*").eq("archived", false).order("name");
    setList(data || []);
  }
  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault(); setErr("");
    const f = new FormData(e.currentTarget);
    const payload = Object.fromEntries(f);
    if (!payload.country_code) payload.country_code = "SE";
    payload.country_code = String(payload.country_code).toUpperCase();
    const { data: { user } } = await sb.auth.getUser();
    payload.user_id = user.id;
    const isUpdate = editing && editing.id;
    const q = isUpdate ? sb.from("studio_clients").update(payload).eq("id", editing.id) : sb.from("studio_clients").insert(payload);
    const { error } = await q;
    if (error) return setErr(error.message);
    setEditing(null);
    load();
  }

  return (
    <>
      <div className="spread" style={{ marginBottom: 18 }}>
        <h1 className="h1">Kunder</h1>
        <button className="btn" onClick={() => setEditing({})}>+ Ny kund</button>
      </div>

      {editing && (
        <div className="card" style={{ marginBottom: 18 }}>
          {err && <div className="alert alert-error">{err}</div>}
          <form onSubmit={save}>
            <div className="grid-2">
              <div className="field"><label className="label">Namn *</label><input className="input" name="name" required defaultValue={editing.name || ""} /></div>
              <div className="field"><label className="label">Kontaktperson</label><input className="input" name="contact_person" defaultValue={editing.contact_person || ""} /></div>
              <div className="field"><label className="label">E-post</label><input className="input" name="email" type="email" defaultValue={editing.email || ""} /></div>
              <div className="field"><label className="label">Org-nr / Personnr</label><input className="input" name="org_nr" defaultValue={editing.org_nr || ""} /></div>
              <div className="field"><label className="label">VAT-nr (EU)</label><input className="input" name="vat_number" placeholder="SE...01 / DE..." defaultValue={editing.vat_number || ""} /></div>
              <div className="field"><label className="label">Land</label><input className="input" name="country_code" maxLength={2} defaultValue={editing.country_code || "SE"} /></div>
              <div className="field" style={{ gridColumn: "span 2" }}><label className="label">Adress</label><input className="input" name="address_street" defaultValue={editing.address_street || ""} /></div>
              <div className="field"><label className="label">Postnr</label><input className="input" name="address_zip" defaultValue={editing.address_zip || ""} /></div>
              <div className="field"><label className="label">Ort</label><input className="input" name="address_city" defaultValue={editing.address_city || ""} /></div>
              <div className="field"><label className="label">Fastighetsbeteckning (ROT)</label><input className="input" name="fastighetsbeteckning" defaultValue={editing.fastighetsbeteckning || ""} /></div>
              <div className="field"><label className="label">BRF org-nr (RUT/lägenhet)</label><input className="input" name="brf_org_nr" defaultValue={editing.brf_org_nr || ""} /></div>
              <div className="field" style={{ gridColumn: "span 2" }}><label className="label">Anteckningar</label><textarea className="textarea" name="notes" rows={2} defaultValue={editing.notes || ""}></textarea></div>
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" type="button" onClick={() => setEditing(null)}>Avbryt</button>
              <button className="btn" type="submit">Spara</button>
            </div>
          </form>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {list.length === 0 ? <div className="empty">Inga kunder ännu.</div> : (
          <table className="table">
            <thead><tr><th>Namn</th><th>Kontakt</th><th>E-post</th><th>Land</th><th>Org/Pers-nr</th><th></th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.contact_person || "—"}</td>
                  <td>{c.email || "—"}</td>
                  <td>{c.country_code}</td>
                  <td className="muted">{c.org_nr || "—"}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>Redigera</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
