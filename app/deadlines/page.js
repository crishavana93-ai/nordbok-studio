"use client";
import { useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { buildTaxYearDeadlines } from "@/lib/seed-deadlines";

export default function DeadlinesPage() {
  const sb = useMemo(() => browserClient(), []);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const { data } = await sb.from("studio_tasks").select("*").eq("status", "open").order("due_at");
    setList(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function seed() {
    setErr("");
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const tasks = buildTaxYearDeadlines(new Date().getFullYear(), user.id);
    const { error } = await sb.from("studio_tasks").insert(tasks);
    if (error) setErr(error.message);
    load();
  }

  async function markDone(id) {
    await sb.from("studio_tasks").update({ status: "done", done_at: new Date().toISOString() }).eq("id", id);
    load();
  }

  async function snooze(id, days = 7) {
    const t = list.find((x) => x.id === id);
    if (!t) return;
    const newDue = new Date(new Date(t.due_at).getTime() + days * 86400000).toISOString();
    await sb.from("studio_tasks").update({ status: "snoozed", due_at: newDue }).eq("id", id);
    load();
  }

  async function addManual(e) {
    e.preventDefault(); setErr("");
    const f = new FormData(e.currentTarget);
    const payload = Object.fromEntries(f);
    const { data: { user } } = await sb.auth.getUser();
    payload.user_id = user.id;
    payload.due_at = new Date(payload.due_at).toISOString();
    payload.category = payload.category || "manual";
    payload.priority = payload.priority || "normal";
    const { error } = await sb.from("studio_tasks").insert(payload);
    if (error) return setErr(error.message);
    e.currentTarget.reset();
    load();
  }

  function daysUntil(d) {
    return Math.round((new Date(d) - new Date()) / 86400000);
  }

  return (
    <>
      <div className="spread" style={{ marginBottom: 18 }}>
        <h1 className="h1">Deadlines & påminnelser</h1>
        {list.length === 0 && !loading && (
          <button className="btn" onClick={seed}>Importera Skatteverket-deadlines</button>
        )}
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 className="h2" style={{ marginTop: 0 }}>Lägg till påminnelse</h2>
        <form onSubmit={addManual}>
          <div className="grid-3">
            <div className="field"><label className="label">Titel</label><input className="input" name="title" required /></div>
            <div className="field"><label className="label">Datum & tid</label><input className="input" name="due_at" type="datetime-local" required /></div>
            <div className="field"><label className="label">Prioritet</label>
              <select className="select" name="priority"><option value="normal">Normal</option><option value="high">Hög</option><option value="low">Låg</option></select>
            </div>
            <div className="field" style={{ gridColumn: "span 3" }}><label className="label">Beskrivning</label><textarea className="textarea" name="description" rows={2}></textarea></div>
          </div>
          <button className="btn btn-sm" type="submit">+ Lägg till</button>
        </form>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="empty">Laddar...</div> : list.length === 0 ? (
          <div className="empty">Inga öppna deadlines. Klicka "Importera Skatteverket-deadlines" för att lägga in moms-deklarationer, NE-bilaga, F-skatt månadsbetalningar.</div>
        ) : (
          <table className="table">
            <thead><tr><th>När</th><th>Titel</th><th>Kategori</th><th>Prio</th><th></th></tr></thead>
            <tbody>
              {list.map((t) => {
                const d = daysUntil(t.due_at);
                const tone = d < 0 ? "badge-overdue" : d <= 7 ? "badge-review" : "badge-draft";
                return (
                  <tr key={t.id}>
                    <td>
                      <div>{new Date(t.due_at).toLocaleDateString("sv-SE")}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        <span className={`badge ${tone}`}>{d < 0 ? `${-d} dagar sen` : d === 0 ? "idag" : `om ${d} dagar`}</span>
                      </div>
                    </td>
                    <td>
                      <strong>{t.title}</strong>
                      {t.description && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{t.description}</div>}
                    </td>
                    <td className="muted">{t.category}</td>
                    <td><span className={`badge ${t.priority === "high" ? "badge-overdue" : t.priority === "low" ? "badge-draft" : "badge-sent"}`}>{t.priority}</span></td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => snooze(t.id, 7)}>+7d</button>
                      <button className="btn btn-sm" onClick={() => markDone(t.id)} style={{ marginLeft: 6 }}>Klar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
