"use client";

/* app/documents/page.js — DIRECTION C
 *
 * Migrated 2026-08-24. Two things here are not cosmetic.
 *
 * 1. DELETE ORDER. It removed the storage object FIRST and the row second, checking
 *    neither result:
 *
 *      await sb.storage.from("studio-documents").remove([d.storage_path]);
 *      await sb.from("studio_documents").delete().eq("id", d.id);
 *
 *    If the second call failed, the file was gone and the row survived — a record that
 *    still looks like a filed verifikation with nothing behind it. That is the worse
 *    of the two possible half-states, and it is the one the old order produced.
 *
 *    Now the ROW goes first. If the object delete then fails, the file is merely
 *    orphaned in the bucket — which scripts/arkivera.mjs already detects and reports
 *    as "föräldralösa". Recoverable, and visible.
 *
 * 2. RETENTION. It computed issued_date + 7 × 365 days. Bokföringslagen 7 kap. 2 §
 *    counts to the end of the SEVENTH YEAR AFTER the financial year the document
 *    belongs to. For a document issued in March 2026 that is 2033-12-31, not
 *    2033-03-13 — the old arithmetic offered a delete button roughly ten months early,
 *    and drifted further with every leap year.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { readActiveOwnerId } from "@/lib/owner-client";
import { dateISO, num } from "@/lib/format";
import { reportErrorAsync } from "@/lib/report-error";

const inputCls =
  "w-full rounded-[var(--radius-ctl)] border border-border bg-surface px-3 py-2.5 text-[16px] text-ink " +
  "focus:border-border-firm focus:outline-none focus:ring-2 focus:ring-brand/25";

const TYPES = [
  ["contract", "Avtal"], ["registreringsbevis", "Registreringsbevis"],
  ["invoice_in", "Leverantörsfaktura"], ["bank_statement", "Kontoutdrag"],
  ["sie", "SIE-fil"], ["tax_filing", "Skattedeklaration"],
  ["id", "ID-handling"], ["other", "Annat"],
];
const TYPE_SV = Object.fromEntries(TYPES);

/** Bokföringslagen 7 kap. 2 §: to the end of the seventh year after the financial year. */
function retentionUntil(issuedISO) {
  const year = Number(String(issuedISO).slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return `${year + 7}-12-31`;
}

function fmtBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "—";
  const u = ["B", "kB", "MB", "GB"];
  let i = 0, x = v;
  while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
  /* Swedish decimal comma — this said "1.4 MB" with a dot on an otherwise Swedish page. */
  return `${num(x, { decimals: i === 0 ? 0 : 1 })} ${u[i]}`;
}

function Field({ label, hint, wide, children }) {
  return (
    <label className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="micro-label">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] leading-relaxed text-ink-3">{hint}</span>}
    </label>
  );
}

export default function DocumentsPage() {
  const sb = useMemo(() => browserClient(), []);
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const ownerId = readActiveOwnerId(user.id);
    const { data, error } = await sb
      .from("studio_documents").select("*")
      .eq("user_id", ownerId)
      .order("created_at", { ascending: false });
    if (error) {
      setErr("Kunde inte hämta arkivet.");
      reportErrorAsync(error, { scope: "ui/documents" });
      setList([]); return;
    }
    setList(data || []);
  }, [sb]);

  useEffect(() => { load(); }, [load]);

  async function upload(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const file = fileRef.current?.files?.[0];
    if (!file) { setErr("Välj en fil att ladda upp."); return; }
    setErr(""); setInfo(""); setBusy(true);

    let path = null;
    try {
      const { data: { user } } = await sb.auth.getUser();
      path = `${user.id}/${new Date().getFullYear()}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;

      const { error: upErr } = await sb.storage.from("studio-documents")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      const issued = f.get("issued_date") || new Date().toISOString().slice(0, 10);
      const { error } = await sb.from("studio_documents").insert({
        user_id: user.id,
        title: f.get("title"),
        doc_type: f.get("doc_type") || "other",
        category: f.get("category") || null,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        issued_date: issued,
        retention_until: retentionUntil(issued),
        notes: f.get("notes") || null,
        tags: String(f.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean),
      });

      /* The file is already in the bucket at this point. If the row fails, remove it
         again — otherwise every retry leaves another orphan behind. */
      if (error) {
        await sb.storage.from("studio-documents").remove([path]).catch(() => {});
        throw error;
      }

      form.reset();
      setAdding(false);
      setInfo("Dokumentet är arkiverat.");
      await load();
    } catch (e2) {
      setErr(e2.message || "Uppladdningen misslyckades.");
      reportErrorAsync(e2, { scope: "ui/documents-upload" });
    } finally { setBusy(false); }
  }

  async function open(d) {
    const { data, error } = await sb.storage.from("studio-documents")
      .createSignedUrl(d.storage_path, 300);
    if (error || !data?.signedUrl) {
      setErr("Filen gick inte att öppna. Den kan ha tagits bort ur lagringen.");
      reportErrorAsync(error || new Error("no signed url"), { scope: "ui/documents-open" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function del(d) {
    const until = d.retention_until;
    const stillRequired = until && new Date(until) >= new Date();

    if (stillRequired) {
      /* Refuse rather than warn. Bokföringslagen does not care that a dialog was
         confirmed, and this is the only copy outside the archive folder. */
      setErr(`”${d.title}” måste sparas till ${dateISO(until)} enligt bokföringslagen 7 kap. Det går inte att radera härifrån.`);
      return;
    }
    if (!confirm(`Radera ”${d.title}” permanent? Arkiveringstiden gick ut ${dateISO(until)}.`)) return;

    setErr(""); setBusy(true);
    try {
      /* ROW FIRST. See the header — the reverse order can leave a row that looks like
         a filed verifikation with no document behind it. */
      const { error } = await sb.from("studio_documents").delete().eq("id", d.id);
      if (error) { setErr(error.message); reportErrorAsync(error, { scope: "ui/documents-delete" }); return; }

      const { error: sErr } = await sb.storage.from("studio-documents").remove([d.storage_path]);
      if (sErr) {
        /* Not fatal, and not silent: arkivera.mjs lists orphans on its next run. */
        setInfo("Posten är borttagen, men själva filen ligger kvar i lagringen. Nästa arkivering listar den som föräldralös.");
        reportErrorAsync(sErr, { scope: "ui/documents-delete-object", level: "warn" });
      }
      await load();
    } finally { setBusy(false); }
  }

  const rows = (list || []).filter((d) => {
    if (!q.trim()) return true;
    const hay = `${d.title} ${d.category || ""} ${TYPE_SV[d.doc_type] || d.doc_type} ${(d.tags || []).join(" ")}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-medium tracking-[-0.015em]">Arkiv</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {list === null ? "Laddar…" : `${num((list || []).length)} dokument · sparas i sju år enligt bokföringslagen`}
          </p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="shrink-0 rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink">
            Lägg till
          </button>
        )}
      </div>

      {err && <p role="alert" className="rounded-[var(--radius-card)] border border-crit/35 bg-crit-bg px-4 py-3 text-[13px] leading-relaxed text-ink-2">{err}</p>}
      {info && <p role="status" className="rounded-[var(--radius-card)] border border-good/35 bg-good-bg px-4 py-3 text-[13px] leading-relaxed text-ink-2">{info}</p>}

      {adding && (
        <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Nytt dokument</h2>
          <form onSubmit={upload} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Titel" wide>
                <input className={inputCls} name="title" required autoFocus
                  placeholder="t.ex. Hyresavtal Drottninggatan 2026" />
              </Field>
              <Field label="Typ">
                <select className={inputCls} name="doc_type" defaultValue="contract">
                  {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="Kategori">
                <input className={inputCls} name="category" placeholder="Skatteverket, Bank, Försäkring…" />
              </Field>
              <Field label="Utgivningsdatum" hint="Styr hur länge dokumentet måste sparas.">
                <input className={inputCls} name="issued_date" type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)} />
              </Field>
              <Field label="Taggar" hint="Kommaseparerade.">
                <input className={inputCls} name="tags" placeholder="hyresavtal, 2026, kontor" />
              </Field>
              <Field label="Anteckningar" wide>
                <textarea className={inputCls} name="notes" rows={2} />
              </Field>
              <Field label="Fil" wide>
                <input ref={fileRef} className={inputCls} type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.csv,.sie,.txt" />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button type="submit" disabled={busy}
                className="rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink disabled:opacity-40">
                {busy ? "Laddar upp…" : "Ladda upp"}
              </button>
              <button type="button" onClick={() => { setAdding(false); setErr(""); }}
                className="rounded-[var(--radius-ctl)] border border-border-firm px-4 py-2.5 text-[14px] font-medium text-ink-2">
                Avbryt
              </button>
            </div>
          </form>
        </section>
      )}

      {(list || []).length > 0 && (
        <label className="flex flex-col gap-1.5">
          <span className="sr-only">Sök i arkivet</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Sök på titel, kategori eller tagg" className={inputCls} />
        </label>
      )}

      {list !== null && (list.length === 0 ? (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <div className="py-10 text-center">
            <p className="text-[14px] text-ink-2">Arkivet är tomt.</p>
            <p className="mx-auto mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-ink-3">
              Hit lägger du avtal, registreringsbevis, kontoutdrag och skattedeklarationer
              — allt som inte är ett kvitto men ändå ska finnas kvar om sju år.
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-[13.5px] text-ink-2">Inget matchar ”{q}”.</p>
          ) : (
            <div className="flex flex-col">
              {rows.map((d) => {
                const expired = d.retention_until && new Date(d.retention_until) < new Date();
                return (
                  <div key={d.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-border py-3.5 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink">{d.title}</p>
                      <p className="mt-0.5 font-mono text-[11.5px] text-ink-3">
                        {TYPE_SV[d.doc_type] || d.doc_type}
                        {d.category ? ` · ${d.category}` : ""}
                        {d.issued_date ? ` · ${dateISO(d.issued_date)}` : ""}
                        {` · ${fmtBytes(d.size_bytes)}`}
                      </p>
                      <p className={`mt-1 text-[11.5px] ${expired ? "text-ink-3" : "text-ink-2"}`}>
                        {expired
                          ? `Arkiveringstiden gick ut ${dateISO(d.retention_until)}`
                          : `Sparas till ${dateISO(d.retention_until)}`}
                      </p>
                      {d.tags?.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {d.tags.map((t) => (
                            <span key={t} className="rounded bg-raised px-2 py-0.5 font-mono text-[10.5px] text-ink-2">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => open(d)}
                        className="rounded-[var(--radius-ctl)] border border-border-firm px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink">
                        Öppna
                      </button>
                      <button onClick={() => del(d)} disabled={busy}
                        title={expired ? "Radera permanent" : "Skyddad av bokföringslagen"}
                        className={`rounded-[var(--radius-ctl)] border px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-40 ${
                          expired ? "border-border-firm text-crit" : "border-border text-ink-3"
                        }`}>
                        Ta bort
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
