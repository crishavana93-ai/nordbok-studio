"use client";

/* app/clients/page.js — DIRECTION C
 *
 * Migrated off the legacy stylesheet 2026-08-24. Four things changed beyond colour:
 *
 * 1. IT IS NOW SCOPED TO THE ACTIVE OWNER. The query was
 *    .select("*").eq("archived", false) with no user_id at all, relying on RLS. That
 *    was equivalent to an ownership check until 006 added revisor access — after which
 *    RLS legitimately returns BOTH owners' rows and the list silently merged two
 *    people's customers. lib/access.js documents this exact trap in its own header.
 *
 * 2. READ ERRORS ARE SHOWN. `const { data } = await ...` discarded the error, so a
 *    blocked read rendered as "Inga kunder ännu" — an empty table and a broken one
 *    looked identical.
 *
 * 3. SEARCH. There was no search input anywhere in this app. On a list that only
 *    grows, that is the difference between a tool and an archive.
 *
 * 4. THE TABLE BECAME CARDS ON A PHONE. A six-column table on a 390px screen scrolled
 *    sideways inside its card. This is a phone-first product.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { readActiveOwnerId } from "@/lib/owner-client";
import { COUNTRIES } from "@/lib/currency";
import { reportErrorAsync } from "@/lib/report-error";

const inputCls =
  "w-full rounded-[var(--radius-ctl)] border border-border bg-surface px-3 py-2.5 text-[16px] text-ink " +
  "focus:border-border-firm focus:outline-none focus:ring-2 focus:ring-brand/25";

function Field({ label, hint, required, wide, children }) {
  return (
    <label className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="micro-label">
        {label}{required && <span className="text-crit"> *</span>}
      </span>
      {children}
      {hint && <span className="text-[11.5px] leading-relaxed text-ink-3">{hint}</span>}
    </label>
  );
}

export default function ClientsPage() {
  const sb = useMemo(() => browserClient(), []);
  const [list, setList] = useState(null);        // null = not loaded yet, [] = genuinely empty
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const formRef = useRef(null);

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const ownerId = readActiveOwnerId(user.id);
    const { data, error } = await sb
      .from("studio_clients").select("*")
      .eq("user_id", ownerId)
      .eq("archived", false)
      .order("name");
    if (error) {
      setErr("Kunde inte hämta kunderna.");
      reportErrorAsync(error, { scope: "ui/clients" });
      setList([]);
      return;
    }
    setList(data || []);
  }, [sb]);

  useEffect(() => { load(); }, [load]);

  /* Bring a newly opened form into view — on a phone it otherwise opens above the
     fold and the button looks like it did nothing. */
  useEffect(() => {
    if (editing) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editing]);

  async function save(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const payload = Object.fromEntries(new FormData(e.currentTarget));
      payload.country_code = String(payload.country_code || "SE").toUpperCase();
      const { data: { user } } = await sb.auth.getUser();

      /* New customers are always filed under the signed-in user, never the owner
         being viewed — a revisor reading someone's books must not create records in
         them. Editing is separately prevented by RLS, which grants read only. */
      const isUpdate = Boolean(editing?.id);
      const { error } = isUpdate
        ? await sb.from("studio_clients").update(payload).eq("id", editing.id)
        : await sb.from("studio_clients").insert({ ...payload, user_id: user.id });

      if (error) {
        setErr(error.message.includes("row-level security")
          ? "Du har läsbehörighet till de här böckerna, inte skrivbehörighet."
          : error.message);
        reportErrorAsync(error, { scope: "ui/clients-save", context: { isUpdate } });
        return;
      }
      setEditing(null);
      await load();
    } finally { setBusy(false); }
  }

  const filtered = (list || []).filter((c) => {
    if (!q.trim()) return true;
    const hay = `${c.name} ${c.contact_person || ""} ${c.email || ""} ${c.org_nr || ""} ${c.address_city || ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-medium tracking-[-0.015em]">Kunder</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {list === null ? "Laddar…"
              : list.length === 0 ? "Inga kunder ännu"
              : `${list.length} ${list.length === 1 ? "kund" : "kunder"}`}
          </p>
        </div>
        {!editing && (
          <button onClick={() => setEditing({})}
            className="shrink-0 rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink">
            Ny kund
          </button>
        )}
      </div>

      {err && (
        <p role="alert" className="rounded-[var(--radius-card)] border border-crit/35 bg-crit-bg px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          {err}
        </p>
      )}

      {editing && (
        <section ref={formRef} className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">
            {editing.id ? `Ändra ${editing.name}` : "Ny kund"}
          </h2>

          <form onSubmit={save} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Namn" required wide>
                <input className={inputCls} name="name" required autoComplete="organization"
                  defaultValue={editing.name || ""} autoFocus />
              </Field>
              <Field label="Kontaktperson">
                <input className={inputCls} name="contact_person" autoComplete="name"
                  defaultValue={editing.contact_person || ""} />
              </Field>
              <Field label="E-post" hint="Hit skickas fakturan.">
                <input className={inputCls} name="email" type="email" inputMode="email" autoComplete="email"
                  defaultValue={editing.email || ""} />
              </Field>
              <Field label="Land">
                <select className={inputCls} name="country_code" defaultValue={editing.country_code || "SE"}>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Org-nr eller personnr">
                <input className={inputCls} name="org_nr" inputMode="numeric"
                  defaultValue={editing.org_nr || ""} />
              </Field>
              <Field label="VAT-nummer" wide
                hint="Krävs för omvänd betalningsskyldighet vid B2B inom EU — utan det måste du lägga på svensk moms.">
                <input className={inputCls} name="vat_number" placeholder="DE123456789"
                  defaultValue={editing.vat_number || ""} />
              </Field>

              <Field label="Adress" wide>
                <input className={inputCls} name="address_street" autoComplete="street-address"
                  defaultValue={editing.address_street || ""} />
              </Field>
              <Field label="Postnummer">
                <input className={inputCls} name="address_zip" inputMode="numeric" autoComplete="postal-code"
                  defaultValue={editing.address_zip || ""} />
              </Field>
              <Field label="Ort">
                <input className={inputCls} name="address_city" autoComplete="address-level2"
                  defaultValue={editing.address_city || ""} />
              </Field>

              <Field label="Fastighetsbeteckning" hint="Krävs på ROT-fakturor.">
                <input className={inputCls} name="fastighetsbeteckning"
                  defaultValue={editing.fastighetsbeteckning || ""} />
              </Field>
              <Field label="BRF org-nr" hint="Vid ROT i bostadsrätt.">
                <input className={inputCls} name="brf_org_nr" inputMode="numeric"
                  defaultValue={editing.brf_org_nr || ""} />
              </Field>

              <Field label="Anteckningar" wide>
                <textarea className={inputCls} name="notes" rows={2} defaultValue={editing.notes || ""} />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button type="submit" disabled={busy}
                className="rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink disabled:opacity-40">
                {busy ? "Sparar…" : "Spara"}
              </button>
              <button type="button" onClick={() => { setEditing(null); setErr(""); }} disabled={busy}
                className="rounded-[var(--radius-ctl)] border border-border-firm px-4 py-2.5 text-[14px] font-medium text-ink-2">
                Avbryt
              </button>
            </div>
          </form>
        </section>
      )}

      {list !== null && list.length > 0 && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="sr-only">Sök bland kunderna</span>
            <input
              type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Sök på namn, e-post, ort eller org-nr"
              className={inputCls}
            />
          </label>

          <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-[13.5px] text-ink-2">
                Ingen kund matchar ”{q}”.
              </p>
            ) : (
              <div className="flex flex-col">
                {filtered.map((c) => (
                  <button
                    key={c.id} onClick={() => setEditing(c)}
                    className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-border py-3 text-left last:border-b-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-ink">{c.name}</span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">
                        {[c.contact_person, c.email].filter(Boolean).join(" · ") || "Inga kontaktuppgifter"}
                      </span>
                      <span className="mt-1 block font-mono text-[11px] text-ink-3">
                        {[c.address_city, c.org_nr].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {c.country_code && c.country_code !== "SE" && (
                        <span className="rounded bg-raised px-2 py-0.5 font-mono text-[10.5px] font-medium text-ink-2">
                          {c.country_code}
                        </span>
                      )}
                      <span className="font-mono text-[11px] text-ink-3">Ändra</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {list !== null && list.length === 0 && !editing && (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <div className="py-10 text-center">
            <p className="text-[14px] text-ink-2">Inga kunder ännu.</p>
            <p className="mx-auto mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-ink-3">
              En kund behöver namn och adress innan en faktura till dem kan skickas —
              det är ett krav i mervärdesskattelagen, inte en app-regel.
            </p>
            <button onClick={() => setEditing({})}
              className="mt-4 rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink">
              Lägg till din första kund
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
