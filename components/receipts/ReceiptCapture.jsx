"use client";

import { safeJson } from "@/lib/safe-json";
import { reportErrorAsync } from "@/lib/report-error";

/* components/receipts/ReceiptCapture.jsx — DIRECTION A · KONTOR
 *
 * Camera-first receipt capture. Photo or PDF → stored and hashed → OCR suggests,
 * field by field, with its confidence and the text it read → you resolve anything
 * it was unsure about → the record is written.
 *
 * LAW 06 — SHOW THE CONFIDENCE NOBODY ELSE SHOWS
 * Bokio, Fortnox, Dinero, QuickBooks and Hubdoc all do the same thing: drop a guess
 * into an editable field and hope you check it. Not one says which value it doubts.
 * Here every field carries its own confidence and the literal characters it was read
 * from, and a field the model was unsure about cannot reach the books until a human
 * has either corrected it or explicitly said it is right.
 *
 * That last clause is the point. "Nothing reaches the books because a machine read
 * it" is only true if the UI can tell the difference between a value someone looked
 * at and a value someone scrolled past.
 *
 * `capture="environment"` opens the rear camera directly on a phone rather than the
 * photo library, which is the difference between "scan a receipt" being a two-tap
 * action in a car park and a chore you postpone.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { money } from "@/lib/format";

const TREATMENTS = [
  { v: "domestic",    label: "Svensk moms",              hint: "Momsen dras av i ruta 48" },
  { v: "rc_eu",       label: "Omvänd — EU",              hint: "Ruta 21 + 30, avdrag i 48. Netto 0" },
  { v: "rc_non_eu",   label: "Omvänd — utanför EU",      hint: "Ruta 22 + 30, avdrag i 48. Netto 0" },
  { v: "oss_non_ded", label: "OSS — ej avdragsgill",     hint: "Utländsk säljare som debiterat svensk moms. Kan inte återvinnas" },
  { v: "exempt",      label: "Undantagen",               hint: "T.ex. internationell persontransport, myndighetsavgift" },
];

const VENTURES = [
  { v: "turquino",       label: "Turquino Studios" },
  { v: "the_next_cigar", label: "The Next Cigar" },
  { v: "zamacharters",   label: "Zamacharters" },
  { v: "other",          label: "Övrigt" },
];

const CURRENCIES = ["SEK", "EUR", "USD", "GBP", "DKK", "NOK"];

/* Fields the OCR proposes AND the human can see and act on.
 *
 * Every key here must have a visible control below. `vat_rate` and `description` are
 * read by the model but have no input on this screen, so listing them would let an
 * unresolved field block the save button with nothing the user could do about it.
 * If you add a key here, add its control in the same commit. */
const OCR_FIELDS = ["vendor", "receipt_date", "total", "vat_amount", "currency", "category"];

/* Above SURE we accept the reading. Below CHECK we say we could not read it.
 * In between, it needs a human. These thresholds are the product. */
const SURE = 0.9;
const CHECK = 0.6;

const empty = {
  vendor: "", receipt_date: "", total: "", vat_amount: "", vat_rate: 25,
  currency: "SEK", category: "", description: "",
  vat_treatment: "", venture: "turquino", business_share: 1,
};

function band(c) {
  if (c == null) return "unknown";
  if (c >= SURE) return "sure";
  if (c >= CHECK) return "check";
  return "poor";
}

const BAND_UI = {
  sure:    { tone: "good", label: (c) => `${Math.round(c * 100)} %` },
  check:   { tone: "warn", label: (c) => `${Math.round(c * 100)} %` },
  poor:    { tone: "crit", label: (c) => (c == null ? "kunde inte läsa" : `${Math.round(c * 100)} %`) },
  unknown: { tone: "crit", label: () => "ingen avläsning" },
};

/* Phone photos run 3–8 MB; Vercel's serverless functions reject bodies over ~4.5 MB.
 * Downscale to 2000px on the long edge at q0.82 — a receipt stays perfectly legible
 * both to OCR and to a human reading it as a verifikation, and lands around 300–600 kB.
 * PDFs pass through untouched. */
/* Samma lista som route.js godtar. Att kontrollera här också är inte
   dubbelarbete: det ger ett begripligt besked innan filen skickas i väg. */
const OK_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf",
]);

async function shrink(file) {
  if (!file.type.startsWith("image/") || file.size < 900_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;   // a failed optimisation must never block the capture
  }
}

export default function ReceiptCapture({ onSaved }) {
  const [stage, setStage] = useState("idle");   // idle | uploading | review | saving
  const [preview, setPreview] = useState(null);
  const [previewMime, setPreviewMime] = useState(null);
  const [drarOver, setDrarOver] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [meta, setMeta] = useState(null);       // storage_path, file_hash, …
  const [form, setForm] = useState(empty);
  const [touched, setTouched] = useState({});   // fields the human edited
  const [agreed, setAgreed] = useState({});     // fields the human explicitly confirmed
  const [fields, setFields] = useState(null);   // per-field { value, confidence, read_as }
  const [flags, setFlags] = useState([]);
  const [avdrag, setAvdrag] = useState(null);
  const [err, setErr] = useState(null);
  /* "PDF sparad" är inte ett fel. Den låg i setErr och målades röd, så en
     lyckad uppladdning såg ut som ett haveri. Egen kanal för sådant. */
  const [info, setInfo] = useState(null);
  const [dupe, setDupe] = useState(null);
  const camRef = useRef(null);
  const fileRef = useRef(null);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setTouched((t) => ({ ...t, [k]: true }));
  };

  const confOf = (k) => fields?.[k]?.confidence ?? null;
  const resolved = (k) =>
    !fields || touched[k] || agreed[k] || band(confOf(k)) === "sure";

  /* Law 06's teeth: the save button counts what nobody has looked at. */
  const unresolved = useMemo(
    () => (fields ? OCR_FIELDS.filter((k) => !resolved(k)) : []),
    [fields, touched, agreed]
  );

  /* En gemensam ingång för filväljaren, släppet och inklistringen. Den enda
     skillnaden mellan dem är hur filen kom hit. */
  function taEmot(fil) {
    if (!fil) return;
    if (!OK_MIME.has(fil.type)) {
      setErr(`${fil.name || "Filen"} är av typen ${fil.type || "okänd"}, som inte går att bokföra. Använd JPEG, PNG, HEIC eller PDF.`);
      return;
    }
    upload(fil);
  }

  /* Klistra in: en skärmdump i urklipp är det snabbaste sättet att få in ett
     kvitto som kom som bild i ett mejl. Lyssnaren sitter på fönstret och bara
     medan skärmen väntar på en fil. */
  useEffect(() => {
    if (stage !== "idle") return;
    const onPaste = (e) => {
      const filer = [...(e.clipboardData?.files || [])];
      if (!filer.length) return;
      e.preventDefault();
      taEmot(filer[0]);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [stage]);

  async function upload(raw) {
    setErr(null); setInfo(null); setDupe(null); setStage("uploading");
    const f = await shrink(raw);
    /* Även PDF:er får en förhandsvisning. Att inte se filen man just laddat
       upp är att inte veta om något hände. */
    if (f.type.startsWith("image/") || f.type === "application/pdf") {
      setPreview(URL.createObjectURL(f));
      setPreviewMime(f.type);
    }

    const fd = new FormData();
    fd.append("file", f);

    try {
      /* Offline is the likely failure here, not a server bug — this is the screen
         used standing next to a car. Say that, instead of "Failed to fetch". */
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setErr("Du är offline. Kvittot laddas inte upp förrän du har täckning — behåll bilden i kamerarullen så länge.");
        setStage("idle"); return;
      }
      const res = await fetch("/api/receipts/upload", { method: "POST", body: fd });
      const { ok, data: j, error } = await safeJson(res);

      if (!ok) {
        setErr(error || "Uppladdningen misslyckades.");
        reportErrorAsync(new Error(error || "upload failed"), { scope: "ui/receipt-upload" });
        setStage("idle"); return;
      }
      if (j.duplicate) { setDupe(j); setStage("idle"); return; }

      setMeta({
        storage_path: j.storage_path, file_hash: j.file_hash,
        file_mime: j.file_mime, file_size: j.file_size, file_name: j.file_name,
      });

      const s = j.suggestions;
      if (s && j.ocr_error) setInfo(`Tolkningen är ofullständig: ${j.ocr_error}`);
      if (s) {
        setFields(s.fields || null);
        setFlags(s.flags || []);
        setAvdrag(j.avdrag || null);
        setForm({
          ...empty,
          vendor: s.vendor || "",
          receipt_date: s.receipt_date || "",
          total: s.total ?? "",
          vat_amount: s.vat_amount ?? "",
          vat_rate: s.vat_rate ?? 25,
          currency: s.currency || "SEK",
          category: s.category || "",
          description: s.description || "",
          vat_treatment: s.vat_treatment || "",
          venture: "turquino",
          business_share: 1,
        });
      } else {
        setFields(null);
        setFlags([]);
        setAvdrag(null);
        setForm({ ...empty });
        if (j.ocr_error) {
          /* Tekniskt, men det är hela poängen: utan det går det inte att veta om
             filen var för stor, om nyckeln saknas eller om PDF:en är låst. */
          setInfo(`Filen är sparad, men den gick inte att tolka automatiskt — fyll i uppgifterna för hand. Orsak: ${j.ocr_error}`);
          reportErrorAsync(new Error(j.ocr_error), { scope: "ui/receipt-ocr", level: "warn" });
        } else if (j.note) {
          setInfo(j.note);
        }
      }
      setTouched({}); setAgreed({});
      setStage("review");
    } catch (e) {
      setErr(e.message || "Nätverksfel."); setStage("idle");
    }
  }

  async function save() {
    if (!form.vendor || !form.receipt_date || form.total === "") {
      setErr("Leverantör, datum och belopp måste fyllas i."); return;
    }
    if (!form.vat_treatment) {
      setErr("Välj momsbehandling — den avgör vad som hamnar i ruta 48."); return;
    }
    if (unresolved.length) {
      setErr("Kontrollera de markerade fälten först. Rätta värdet eller tryck Stämmer.");
      return;
    }

    setStage("saving"); setErr(null);
    try {
      const res = await fetch("/api/receipts/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": meta.file_hash },
        body: JSON.stringify({
          ...meta, ...form,
          total: Number(form.total),
          vat_amount: form.vat_amount === "" ? 0 : Number(form.vat_amount),
        }),
      });
      const { ok, data: j, error } = await safeJson(res);
      if (!ok) {
        setErr(error || "Kunde inte spara.");
        reportErrorAsync(new Error(error || "commit failed"), {
          scope: "ui/receipt-commit", context: { has_file: Boolean(meta?.storage_path) },
        });
        setStage("review"); return;
      }

      reset();
      onSaved?.(j.receipt);
    } catch (e) {
      /* The image is already uploaded at this point — say so, or the user assumes
         the photo is lost and takes it again, producing a duplicate. */
      setErr("Kvittobilden är uppladdad men uppgifterna kunde inte sparas. Prova igen — bilden laddas inte upp på nytt.");
      reportErrorAsync(e, { scope: "ui/receipt-commit" });
      setStage("review");
    }
  }

  function reset() {
    setStage("idle"); setMeta(null); setForm(empty);
    setTouched({}); setAgreed({}); setFields(null); setFlags([]);
    setErr(null); setInfo(null); setDupe(null); setZoom(false); setPreviewMime(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  }

  const fieldProps = (k) => ({
    k, form, set, agreed, setAgreed,
    cell: fields?.[k] ?? null,
    resolved: resolved(k),
  });

  /* ── Capture ──────────────────────────────────────────────────────────── */
  if (stage === "idle" || stage === "uploading") {
    return (
      <div
        className="flex flex-col gap-3"
        onDragOver={(e) => { e.preventDefault(); if (stage === "idle") setDrarOver(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDrarOver(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDrarOver(false);
          if (stage !== "idle") return;
          taEmot(e.dataTransfer?.files?.[0]);
        }}
      >
        <div className={`grid grid-cols-2 gap-2.5 rounded-[var(--radius-card)] transition-colors ${
          drarOver ? "outline outline-2 outline-offset-4 outline-brand" : ""
        }`}>
          <button
            onClick={() => camRef.current?.click()}
            disabled={stage === "uploading"}
            className="flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-[var(--radius-card)]
                       border border-border bg-surface text-ink disabled:opacity-50"
          >
            <Icon d="cam" />
            <span className="text-[13.5px] font-medium">Fotografera</span>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={stage === "uploading"}
            className="flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-[var(--radius-card)]
                       border border-border bg-surface text-ink disabled:opacity-50"
          >
            <Icon d="file" />
            <span className="text-[13.5px] font-medium">Ladda upp PDF</span>
          </button>
        </div>

        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => taEmot(e.target.files?.[0])} />
        <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden
          onChange={(e) => taEmot(e.target.files?.[0])} />

        {stage === "idle" && (
          <p className="text-center text-[12.5px] leading-relaxed text-ink-3">
            {drarOver
              ? "Släpp filen här."
              : "Du kan också dra hit en fil, eller klistra in en skärmdump med ⌘V."}
          </p>
        )}

        {stage === "uploading" && (
          <p className="text-center text-[13px] text-ink-3" role="status">Sparar och läser kvittot…</p>
        )}

        {dupe && (
          <div className="rounded-[var(--radius-ctl)] bg-warn-bg px-4 py-3 text-[13px] text-ink-2">
            <strong className="font-medium text-warn">Redan sparat.</strong> {dupe.message} Samma fil
            har laddats upp tidigare, så inget nytt kvitto skapades.
          </div>
        )}

        {err && <p className="rounded-[var(--radius-ctl)] bg-crit-bg px-4 py-3 text-[13px] text-ink-2">{err}</p>}
        {info && <p className="rounded-[var(--radius-ctl)] border border-border bg-raised px-4 py-3 text-[13px] text-ink-2">{info}</p>}

        <p className="text-[12.5px] leading-relaxed text-ink-3">
          Sedan 1 juli 2024 får du slänga papperskvitton när de digitaliserats — bilden blir
          då själva verifikationen. Vi sparar den och en kontrollsumma, så att den går att
          bevisa oförändrad.
        </p>
      </div>
    );
  }

  /* ── Review — the confidence pass ─────────────────────────────────────── */
  const totalNum = Number(form.total);
  const totalShown = money(Number.isFinite(totalNum) ? totalNum : 0, {
    decimals: 2, currency: form.currency || "SEK",
  });

  return (
    <div className="flex flex-col gap-4">

      {/* What we read, and how sure we are. The hero of this screen is the total. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        {preview && (
          <button
            onClick={() => setZoom((z) => !z)}
            className="shrink-0 self-start overflow-hidden rounded-[var(--radius-ctl)] border border-border bg-raised"
            aria-label={zoom ? "Förminska kvittot" : "Förstora kvittot"}
          >
            {previewMime === "application/pdf" ? (
              <object
                data={preview}
                type="application/pdf"
                aria-label="Det uppladdade kvittot"
                className={`block ${zoom ? "h-[520px] w-full" : "h-[130px] w-[96px]"}`}
              >
                {/* Vissa mobilwebbläsare vägrar rita PDF inline. Då en länk
                    i stället för en tom ruta. */}
                <a href={preview} target="_blank" rel="noreferrer"
                  className="flex h-[130px] w-[96px] items-center justify-center px-2 text-center text-[11px] leading-tight text-ink-2 underline">
                  Öppna PDF
                </a>
              </object>
            ) : (
              <img
                src={preview}
                alt="Det uppladdade kvittot"
                className={`object-contain transition-[height,width] ${
                  zoom ? "max-h-[520px] w-full" : "h-[130px] w-[96px]"
                }`}
              />
            )}
          </button>
        )}

        <div className="min-w-0 flex-1">
          <span className="micro-label">Totalt inkl. moms</span>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="tnum text-[clamp(30px,8vw,38px)] font-medium leading-none tracking-[-0.028em]"
              lang="sv-SE" aria-label={totalShown.spoken}>
              {totalShown.text}
            </span>
            <ConfChip c={confOf("total")} resolved={resolved("total")} />
          </div>
          {fields?.total?.read_as && (
            <p className="mt-2 font-mono text-[11.5px] leading-relaxed text-ink-3">
              läst från ”{fields.total.read_as}”
            </p>
          )}
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
            {unresolved.length === 0
              ? "Allt är avläst med hög säkerhet. Kontrollera ändå att det stämmer."
              : `${unresolved.length} ${unresolved.length === 1 ? "fält" : "fält"} behöver din blick. Rätta värdet eller tryck Stämmer.`}
          </p>
        </div>
      </div>

      {/* Vad som får dras av. Fälten ovan är avläsning; det här är bedömningen. */}
      {avdrag && (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13.5px] font-medium text-ink">Avdrag</h3>
            <span className={`rounded px-2 py-0.5 font-mono text-[10.5px] font-medium ${
              avdrag.avdragsgill === "ja" ? "bg-good-bg text-good"
              : avdrag.avdragsgill === "nej" ? "bg-crit-bg text-crit"
              : "bg-warn-bg text-warn"
            }`}>
              {avdrag.avdragsgill === "ja" ? "avdragsgill"
                : avdrag.avdragsgill === "nej" ? "ej avdragsgill" : "delvis avdragsgill"}
            </span>
          </div>

          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
            <dt className="micro-label pt-0.5">Kostnad</dt>
            <dd className="tnum font-mono text-ink-2">
              {avdrag.kostnad_avdrag == null ? "beror på antal personer" : `${avdrag.kostnad_avdrag} kr`}
            </dd>
            <dt className="micro-label pt-0.5">Moms att dra</dt>
            <dd className="tnum font-mono text-ink-2">
              {avdrag.moms_avdrag == null ? "beror på antal personer" : `${avdrag.moms_avdrag} kr`}
            </dd>
          </dl>

          {avdrag.skal.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-ink-2">
              {avdrag.skal.map((r, i) => <li key={i}>· {r}</li>)}
            </ul>
          )}

          {avdrag.varningar.map((v, i) => (
            <div
              key={i}
              className={`mt-3 rounded-[var(--radius-ctl)] border p-3 ${
                v.allvar === "hog" ? "border-crit/35 bg-crit-bg" : "border-warn/35 bg-warn-bg"
              }`}
            >
              <p className="text-[13px] font-medium leading-relaxed text-ink">{v.text}</p>
              {v.atgard && (
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{v.atgard}</p>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Law 05 — Granska. The model's own honest caveats, verbatim. */}
      {flags.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-warn/35 bg-warn-bg p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-warn">Granska</span>
            <h3 className="text-[13.5px] font-medium text-warn">Det här såg konstigt ut</h3>
          </div>
          <ul className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-ink-2">
            {flags.map((f, i) => <li key={i}>· {f}</li>)}
          </ul>
        </section>
      )}

      <Field label="Leverantör" {...fieldProps("vendor")} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Datum (betalning)" type="date" {...fieldProps("receipt_date")} />
        <Select label="Valuta" opts={CURRENCIES.map((c) => ({ v: c, label: c }))} {...fieldProps("currency")} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Totalt inkl. moms" type="number" step="0.01" {...fieldProps("total")} />
        <Field label="Varav moms" type="number" step="0.01" {...fieldProps("vat_amount")} />
      </div>

      <Select label="Momsbehandling" placeholder="Välj…"
        opts={TREATMENTS.map((t) => ({ v: t.v, label: t.label }))} {...fieldProps("vat_treatment")} />
      {form.vat_treatment && (
        <p className="-mt-2 text-[12px] text-ink-3">
          {TREATMENTS.find((t) => t.v === form.vat_treatment)?.hint}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Select label="Verksamhet" opts={VENTURES.map((v) => ({ v: v.v, label: v.label }))} {...fieldProps("venture")} />
        <Field label="Andel affär (0–1)" type="number" step="0.05" min="0" max="1" {...fieldProps("business_share")} />
      </div>

      <Field label="Kategori" {...fieldProps("category")} />

      {err && <p className="rounded-[var(--radius-ctl)] bg-crit-bg px-4 py-3 text-[13px] text-ink-2">{err}</p>}
      {info && <p className="rounded-[var(--radius-ctl)] border border-border bg-raised px-4 py-3 text-[13px] text-ink-2">{info}</p>}

      <div className="flex gap-2.5">
        <button
          onClick={save}
          disabled={stage === "saving" || unresolved.length > 0}
          className="flex-1 rounded-[var(--radius-ctl)] bg-brand px-4 py-3 text-[14px] font-semibold text-brand-ink disabled:opacity-40"
        >
          {stage === "saving"
            ? "Sparar…"
            : unresolved.length > 0
              ? `Kontrollera ${unresolved.length} fält först`
              : "Bekräfta och spara"}
        </button>
        <button onClick={reset} disabled={stage === "saving"}
          className="rounded-[var(--radius-ctl)] border border-border-firm px-4 py-3 text-[14px] font-medium text-ink-2">
          Avbryt
        </button>
      </div>

      <p className="text-[12px] leading-relaxed text-ink-3">
        Procenttalet är modellens egen säkerhet på just det fältet, inte en gissning om
        kvittot i stort. Ingen siffra bokförs för att en maskin läste den — bara för att
        du höll med om det den läste.
      </p>
    </div>
  );
}

/* ── Bits ───────────────────────────────────────────────────────────────── */

function ConfChip({ c, resolved }) {
  if (resolved && c != null && c >= SURE) {
    return (
      <span className="rounded bg-good-bg px-1.5 py-0.5 font-mono text-[10px] font-medium text-good">
        {BAND_UI.sure.label(c)}
      </span>
    );
  }
  if (resolved) {
    return (
      <span className="rounded bg-good-bg px-1.5 py-0.5 font-mono text-[10px] font-medium text-good">
        bekräftad
      </span>
    );
  }
  const b = band(c);
  const ui = BAND_UI[b];
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${
        ui.tone === "good" ? "bg-good-bg text-good" : ui.tone === "warn" ? "bg-warn-bg text-warn" : "bg-crit-bg text-crit"
      }`}
    >
      {ui.label(c)}
    </span>
  );
}

function Shell({ label, k, cell, resolved, agreed, setAgreed, children }) {
  const needs = cell && !resolved;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="micro-label">{label}</span>
        {cell && <ConfChip c={cell.confidence} resolved={resolved} />}
        {needs && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setAgreed((a) => ({ ...a, [k]: true })); }}
            className="rounded border border-border-firm px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-2 hover:text-ink"
          >
            Stämmer
          </button>
        )}
      </span>
      {children}
      {needs && cell.read_as && (
        <span className="font-mono text-[11px] leading-relaxed text-ink-3">läst från ”{cell.read_as}”</span>
      )}
    </label>
  );
}

function Field({ label, k, form, set, cell, resolved, agreed, setAgreed, ...rest }) {
  const needs = cell && !resolved;
  return (
    <Shell label={label} k={k} cell={cell} resolved={resolved} agreed={agreed} setAgreed={setAgreed}>
      <input
        value={form[k] ?? ""}
        onChange={set(k)}
        aria-invalid={needs || undefined}
        className={`rounded-[var(--radius-ctl)] border bg-surface px-3 py-2.5 text-[16px] text-ink ${
          needs ? "border-warn" : "border-border"
        }`}
        {...rest}
      />
    </Shell>
  );
}

function Select({ label, k, form, set, cell, resolved, agreed, setAgreed, opts, placeholder }) {
  const needs = cell && !resolved;
  return (
    <Shell label={label} k={k} cell={cell} resolved={resolved} agreed={agreed} setAgreed={setAgreed}>
      <select
        value={form[k] ?? ""}
        onChange={set(k)}
        className={`rounded-[var(--radius-ctl)] border bg-surface px-3 py-2.5 text-[16px] text-ink ${
          needs ? "border-warn" : "border-border"
        }`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {opts.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </Shell>
  );
}

function Icon({ d }) {
  const paths = {
    cam: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" className="size-7 text-ink-2" aria-hidden="true">
      {paths[d]}
    </svg>
  );
}
