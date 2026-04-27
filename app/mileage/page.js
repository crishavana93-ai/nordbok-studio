"use client";
import { useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { mileageDeduction, MILEAGE_2026 } from "@/lib/swedish-tax";

const fmt = (n) => new Intl.NumberFormat("sv-SE").format(Math.round(Number(n) || 0));

export default function MileagePage() {
  const sb = useMemo(() => browserClient(), []);
  const [list, setList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [t, setT] = useState({
    trip_date: today, from_address: "", to_address: "", purpose: "",
    km: "", odo_start: "", odo_end: "", vehicle_reg: "", vehicle_type: "private_car", is_business: true,
  });

  async function load() {
    const { data } = await sb.from("studio_trips").select("*").order("trip_date", { ascending: false }).limit(200);
    setList(data || []);
  }
  useEffect(() => { load(); }, []);

  function rateFor(type) {
    return type === "company_car_petrol" ? MILEAGE_2026.COMPANY_CAR_PETROL : type === "company_car_ev" ? MILEAGE_2026.COMPANY_CAR_EV : MILEAGE_2026.PRIVATE_CAR_BUSINESS;
  }

  async function save(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("Inte inloggad");
      // Skatteverket required: date, from, to, purpose, km
      if (!t.trip_date || !t.from_address || !t.to_address || !t.purpose || !Number(t.km)) {
        throw new Error("Skatteverket kräver: datum, från, till, syfte och km.");
      }
      const rate_per_mil = rateFor(t.vehicle_type);
      const deduction = t.is_business ? mileageDeduction(t.km, rate_per_mil) : 0;
      const insert = { ...t, user_id: user.id, km: Number(t.km),
        odo_start: t.odo_start ? Number(t.odo_start) : null,
        odo_end: t.odo_end ? Number(t.odo_end) : null,
        rate_per_mil, deduction };
      const { error } = await sb.from("studio_trips").insert(insert);
      if (error) throw error;
      setT({ trip_date: today, from_address: "", to_address: "", purpose: "", km: "", odo_start: "", odo_end: "", vehicle_reg: t.vehicle_reg, vehicle_type: t.vehicle_type, is_business: true });
      setShowForm(false);
      load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function delTrip(id) {
    if (!confirm("Ta bort?")) return;
    await sb.from("studio_trips").delete().eq("id", id);
    load();
  }

  // YTD totals
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const ytd = list.filter((x) => x.trip_date >= yearStart);
  const sumKm = ytd.reduce((a, x) => a + Number(x.km || 0), 0);
  const sumDed = ytd.reduce((a, x) => a + Number(x.deduction || 0), 0);

  return (
    <>
      <div className="spread" style={{ marginBottom: 18 }}>
        <h1 className="h1">Körjournal</h1>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>{showForm ? "Stäng" : "+ Logga resa"}</button>
      </div>

      <div className="grid-3" style={{ marginBottom: 18 }}>
        <div className="stat"><div className="stat-label">Resor i år</div><div className="stat-value">{ytd.length}</div></div>
        <div className="stat"><div className="stat-label">Sträcka YTD</div><div className="stat-value">{fmt(sumKm)} km</div><div className="stat-delta">{fmt(sumKm / 10)} mil</div></div>
        <div className="stat"><div className="stat-label">Avdrag YTD</div><div className="stat-value">{fmt(sumDed)} kr</div><div className="stat-delta">25 kr/mil privatbil 2026</div></div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          {err && <div className="alert alert-error">{err}</div>}
          <form onSubmit={save}>
            <div className="grid-3">
              <div className="field"><label className="label">Datum *</label><input className="input" type="date" value={t.trip_date} onChange={(e) => setT({ ...t, trip_date: e.target.value })} required /></div>
              <div className="field"><label className="label">Från *</label><input className="input" value={t.from_address} onChange={(e) => setT({ ...t, from_address: e.target.value })} placeholder="Hem, Vasagatan 1, Stockholm" required /></div>
              <div className="field"><label className="label">Till *</label><input className="input" value={t.to_address} onChange={(e) => setT({ ...t, to_address: e.target.value })} placeholder="Kund, Drottninggatan 10, Sthlm" required /></div>
              <div className="field" style={{ gridColumn: "span 3" }}><label className="label">Syfte *</label><input className="input" value={t.purpose} onChange={(e) => setT({ ...t, purpose: e.target.value })} placeholder="Kundmöte med Acme AB" required /></div>
              <div className="field"><label className="label">Antal km *</label><input className="input num" type="number" step="0.1" value={t.km} onChange={(e) => setT({ ...t, km: e.target.value })} required /></div>
              <div className="field"><label className="label">Mätare start</label><input className="input num" type="number" value={t.odo_start} onChange={(e) => setT({ ...t, odo_start: e.target.value })} /></div>
              <div className="field"><label className="label">Mätare slut</label><input className="input num" type="number" value={t.odo_end} onChange={(e) => setT({ ...t, odo_end: e.target.value })} /></div>
              <div className="field"><label className="label">Reg-nummer</label><input className="input" value={t.vehicle_reg} onChange={(e) => setT({ ...t, vehicle_reg: e.target.value.toUpperCase() })} placeholder="ABC123" /></div>
              <div className="field"><label className="label">Fordon</label>
                <select className="select" value={t.vehicle_type} onChange={(e) => setT({ ...t, vehicle_type: e.target.value })}>
                  <option value="private_car">Privatbil i tjänsten (25 kr/mil)</option>
                  <option value="company_car_petrol">Företagsbil bensin/diesel (12 kr/mil)</option>
                  <option value="company_car_ev">Företagsbil elbil (0 kr/mil)</option>
                </select>
              </div>
              <div className="field"><label className="label">Typ</label>
                <select className="select" value={t.is_business ? "1" : "0"} onChange={(e) => setT({ ...t, is_business: e.target.value === "1" })}>
                  <option value="1">Tjänsteresa (avdragsgill)</option><option value="0">Privat resa</option>
                </select>
              </div>
            </div>
            <button className="btn" type="submit" disabled={busy} style={{ marginTop: 8 }}>{busy ? "Sparar..." : "Spara resa"}</button>
          </form>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {list.length === 0 ? (
          <div className="empty">Inga resor ännu.</div>
        ) : (
          <table className="table">
            <thead><tr><th>Datum</th><th>Resa</th><th>Syfte</th><th>Reg</th><th className="num">Km</th><th className="num">Avdrag</th><th></th></tr></thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.id}>
                  <td>{x.trip_date}</td>
                  <td>{x.from_address} → {x.to_address}</td>
                  <td className="muted">{x.purpose}</td>
                  <td className="muted">{x.vehicle_reg || "—"}</td>
                  <td className="num">{x.km}</td>
                  <td className="num">{fmt(x.deduction)} kr</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => delTrip(x.id)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
