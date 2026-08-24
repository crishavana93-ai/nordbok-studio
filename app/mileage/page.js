"use client";

/* app/mileage/page.js — DIRECTION C
 *
 * Migrated 2026-08-24, with three fixes that are not about colour:
 *
 * 1. THE EV RATE WAS 0. The dropdown literally read "Företagsbil elbil (0 kr/mil)".
 *    Skatteverket's 2026 rate for a fully electric förmånsbil is 9,50 kr/mil. The
 *    constant is fixed, but the computed deduction is stored ON each row — so trips
 *    logged before today keep their zero. This page now offers to repair them.
 *
 * 2. NOT SCOPED TO THE OWNER, and the read error was discarded.
 *
 * 3. DELETING A TRIP IGNORED ITS ERROR, so a failed delete looked like a success.
 *
 * The körjournal is one of the first things Skatteverket asks for at a kontroll, and
 * the five required fields — datum, från, till, syfte, km — are enforced at save.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { readActiveOwnerId } from "@/lib/owner-client";
import { mileageDeduction, MILEAGE_2026 } from "@/lib/swedish-tax";
import { money, num, dateISO } from "@/lib/format";
import { reportErrorAsync } from "@/lib/report-error";

const inputCls =
  "w-full rounded-[var(--radius-ctl)] border border-border bg-surface px-3 py-2.5 text-[16px] text-ink " +
  "focus:border-border-firm focus:outline-none focus:ring-2 focus:ring-brand/25";

const VEHICLES = [
  ["private_car", "Privatbil i tjänsten", MILEAGE_2026.PRIVATE_CAR_BUSINESS],
  ["company_car_petrol", "Förmånsbil bensin/diesel", MILEAGE_2026.COMPANY_CAR_PETROL],
  ["company_car_ev", "Förmånsbil elbil", MILEAGE_2026.COMPANY_CAR_EV],
];
const rateFor = (type) => (VEHICLES.find((v) => v[0] === type) || VEHICLES[0])[2];

function Field({ label, hint, required, wide, children }) {
  return (
    <label className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-3" : ""}`}>
      <span className="micro-label">{label}{required && <span className="text-crit"> *</span>}</span>
      {children}
      {hint && <span className="text-[11.5px] leading-relaxed text-ink-3">{hint}</span>}
    </label>
  );
}

function Stat({ label, value, note }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <span className="micro-label">{label}</span>
      <span className="tnum text-[22px] font-medium tracking-[-0.02em]">{value}</span>
      {note && <span className="text-[11.5px] text-ink-3">{note}</span>}
    </div>
  );
}

const empty = (today) => ({
  trip_date: today, from_address: "", to_address: "", purpose: "",
  km: "", odo_start: "", odo_end: "", vehicle_reg: "", vehicle_type: "private_car", is_business: true,
});

export default function MileagePage() {
  const sb = useMemo(() => browserClient(), []);
  const today = new Date().toISOString().slice(0, 10);
  const [list, setList] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [t, setT] = useState(() => empty(today));

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const ownerId = readActiveOwnerId(user.id);
    const { data, error } = await sb
      .from("studio_trips").select("*")
      .eq("user_id", ownerId)
      .order("trip_date", { ascending: false })
      .limit(200);
    if (error) {
      setErr("Kunde inte hämta körjournalen.");
      reportErrorAsync(error, { scope: "ui/mileage" });
      setList([]); return;
    }
    setList(data || []);
  }, [sb]);

  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault(); setErr(""); setInfo(""); setBusy(true);
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("Inte inloggad.");
      if (!t.trip_date || !t.from_address || !t.to_address || !t.purpose || !Number(t.km)) {
        throw new Error("Skatteverket kräver datum, från, till, syfte och antal km. Utan dem duger inte körjournalen vid en kontroll.");
      }
      const rate_per_mil = rateFor(t.vehicle_type);
      const { error } = await sb.from("studio_trips").insert({
        ...t, user_id: user.id, km: Number(t.km),
        odo_start: t.odo_start ? Number(t.odo_start) : null,
        odo_end: t.odo_end ? Number(t.odo_end) : null,
        rate_per_mil,
        deduction: t.is_business ? mileageDeduction(t.km, rate_per_mil) : 0,
      });
      if (error) throw error;
      /* Keep vehicle and registration — the next trip is nearly always the same car. */
      setT({ ...empty(today), vehicle_reg: t.vehicle_reg, vehicle_type: t.vehicle_type });
      setShowForm(false);
      await load();
    } catch (e2) {
      setErr(e2.message);
      reportErrorAsync(e2, { scope: "ui/mileage-save" });
    } finally { setBusy(false); }
  }

  async function delTrip(x) {
    if (!confirm(`Ta bort resan ${dateISO(x.trip_date)} ${x.from_address} → ${x.to_address}?`)) return;
    setBusy(true);
    const { error } = await sb.from("studio_trips").delete().eq("id", x.id);
    if (error) { setErr(error.message); reportErrorAsync(error, { scope: "ui/mileage-delete" }); }
    else await load();
    setBusy(false);
  }

  /* Trips whose stored deduction was computed with the old 0 kr/mil EV rate. */
  const stale = (list || []).filter(
    (x) => x.is_business && x.vehicle_type === "company_car_ev" && Number(x.deduction) === 0 && Number(x.km) > 0
  );

  async function repairEv() {
    setBusy(true); setErr(""); setInfo("");
    let fixed = 0;
    for (const x of stale) {
      const rate = MILEAGE_2026.COMPANY_CAR_EV;
      const { error } = await sb.from("studio_trips")
        .update({ rate_per_mil: rate, deduction: mileageDeduction(x.km, rate) })
        .eq("id", x.id);
      if (error) { setErr(error.message); reportErrorAsync(error, { scope: "ui/mileage-repair" }); break; }
      fixed++;
    }
    if (fixed) setInfo(`${num(fixed)} elbilsresor räknades om till 9,50 kr/mil.`);
    await load();
    setBusy(false);
  }

  const rows = list || [];
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const ytd = rows.filter((x) => x.trip_date >= yearStart);
  const sumKm = ytd.reduce((a, x) => a + Number(x.km || 0), 0);
  const sumDed = ytd.reduce((a, x) => a + Number(x.deduction || 0), 0);

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-medium tracking-[-0.015em]">Körjournal</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {list === null ? "Laddar…" : `${num(rows.length)} resor · ${num(ytd.length)} i år`}
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)}
          className="shrink-0 rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink">
          {showForm ? "Stäng" : "Logga resa"}
        </button>
      </div>

      {err && <p role="alert" className="rounded-[var(--radius-card)] border border-crit/35 bg-crit-bg px-4 py-3 text-[13px] leading-relaxed text-ink-2">{err}</p>}
      {info && <p role="status" className="rounded-[var(--radius-card)] border border-good/35 bg-good-bg px-4 py-3 text-[13px] leading-relaxed text-ink-2">{info}</p>}

      {stale.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-warn/40 bg-warn-bg p-4">
          <p className="text-[13px] leading-relaxed text-ink-2">
            <span className="font-medium text-ink">
              {num(stale.length)} elbilsresor har avdrag 0 kr.
            </span>{" "}
            Appen använde tidigare 0 kr/mil för förmånsbil elbil. Skatteverkets sats är
            9,50 kr/mil. Beloppet ligger sparat på varje resa, så det rättas inte av sig självt.
          </p>
          <button onClick={repairEv} disabled={busy}
            className="mt-3 rounded-[var(--radius-ctl)] border border-border-firm bg-surface px-3.5 py-2 text-[13px] font-medium text-ink disabled:opacity-40">
            {busy ? "Räknar om…" : "Räkna om dem"}
          </button>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Resor i år" value={num(ytd.length)} />
        <Stat label="Sträcka i år" value={`${num(sumKm)} km`} note={`${num(sumKm / 10, { decimals: 1 })} mil`} />
        <Stat label="Avdrag i år" value={money(sumDed, { decimals: 0 }).text} note="25 kr/mil privatbil" />
      </div>

      {showForm && (
        <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <div>
            <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Ny resa</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
              Datum, från, till, syfte och km är de fem uppgifter Skatteverket kräver.
            </p>
          </div>
          <form onSubmit={save} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Datum" required>
                <input className={inputCls} type="date" value={t.trip_date} required
                  onChange={(e) => setT({ ...t, trip_date: e.target.value })} />
              </Field>
              <Field label="Antal km" required>
                <input className={inputCls} type="number" step="0.1" inputMode="decimal" value={t.km} required
                  onChange={(e) => setT({ ...t, km: e.target.value })} />
              </Field>
              <Field label="Reg-nummer">
                <input className={inputCls} value={t.vehicle_reg} placeholder="ABC123"
                  onChange={(e) => setT({ ...t, vehicle_reg: e.target.value.toUpperCase() })} />
              </Field>

              <Field label="Från" required>
                <input className={inputCls} value={t.from_address} required placeholder="Hem, Bredåkersvägen 7"
                  onChange={(e) => setT({ ...t, from_address: e.target.value })} />
              </Field>
              <Field label="Till" required>
                <input className={inputCls} value={t.to_address} required placeholder="Kund, Ystadsgatan 6"
                  onChange={(e) => setT({ ...t, to_address: e.target.value })} />
              </Field>
              <Field label="Syfte" required>
                <input className={inputCls} value={t.purpose} required placeholder="Kundmöte Scandic Ventures"
                  onChange={(e) => setT({ ...t, purpose: e.target.value })} />
              </Field>

              <Field label="Fordon" hint={`${num(rateFor(t.vehicle_type), { decimals: 2 })} kr/mil`}>
                <select className={inputCls} value={t.vehicle_type}
                  onChange={(e) => setT({ ...t, vehicle_type: e.target.value })}>
                  {VEHICLES.map(([v, l, r]) => (
                    <option key={v} value={v}>{l} — {num(r, { decimals: 2 })} kr/mil</option>
                  ))}
                </select>
              </Field>
              <Field label="Typ av resa">
                <select className={inputCls} value={t.is_business ? "1" : "0"}
                  onChange={(e) => setT({ ...t, is_business: e.target.value === "1" })}>
                  <option value="1">Tjänsteresa — avdragsgill</option>
                  <option value="0">Privat resa</option>
                </select>
              </Field>
              <Field label="Mätarställning" hint="Frivilligt, men stärker journalen.">
                <div className="flex gap-2">
                  <input className={inputCls} type="number" inputMode="numeric" placeholder="Start" value={t.odo_start}
                    onChange={(e) => setT({ ...t, odo_start: e.target.value })} />
                  <input className={inputCls} type="number" inputMode="numeric" placeholder="Slut" value={t.odo_end}
                    onChange={(e) => setT({ ...t, odo_end: e.target.value })} />
                </div>
              </Field>
            </div>

            {Number(t.km) > 0 && t.is_business && (
              <p className="rounded-[var(--radius-ctl)] bg-raised px-3.5 py-2.5 text-[13px] text-ink-2">
                Avdrag:{" "}
                <span className="font-medium text-ink">
                  {money(mileageDeduction(t.km, rateFor(t.vehicle_type)), { decimals: 2 }).text}
                </span>
              </p>
            )}

            <div>
              <button type="submit" disabled={busy}
                className="rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink disabled:opacity-40">
                {busy ? "Sparar…" : "Spara resa"}
              </button>
            </div>
          </form>
        </section>
      )}

      {list !== null && (rows.length === 0 ? (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <div className="py-10 text-center">
            <p className="text-[14px] text-ink-2">Inga resor loggade ännu.</p>
            <p className="mx-auto mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-ink-3">
              En körjournal är det första Skatteverket ber om när ett bilavdrag ifrågasätts.
              Logga resan samma dag — i efterhand blir syftet svårt att minnas.
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-col">
            {rows.map((x) => (
              <div key={x.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-border py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-ink">
                    {x.from_address} → {x.to_address}
                  </p>
                  <p className="mt-0.5 truncate text-[12.5px] text-ink-2">{x.purpose}</p>
                  <p className="mt-0.5 font-mono text-[11.5px] text-ink-3">
                    {dateISO(x.trip_date)} · {num(x.km)} km{x.vehicle_reg ? ` · ${x.vehicle_reg}` : ""}
                    {!x.is_business && " · privat"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tnum font-mono text-[13.5px] font-medium">
                    {money(x.deduction, { decimals: 2 }).text}
                  </span>
                  <button onClick={() => delTrip(x)} disabled={busy}
                    className="rounded-[var(--radius-ctl)] border border-border-firm px-2.5 py-1 font-mono text-[11px] font-medium text-ink-3 hover:text-crit disabled:opacity-40">
                    Ta bort
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
