/* app/api/receipts/upload/route.js
 *
 * Takes a photo or PDF, stores it, and returns OCR *suggestions*. It deliberately
 * does NOT create the receipt row — that happens in /api/receipts/commit after the
 * user has looked at the numbers.
 *
 * THE RULE THIS ROUTE EXISTS TO ENFORCE
 * An OCR figure never reaches the books unseen. This endpoint hands back a proposal;
 * the human turns it into a record. In an accounting app the difference between
 * "the machine read 1 385,33" and "I confirmed 1 385,33" is the whole ballgame.
 *
 * It also hashes the file before anything else, which gives us two things:
 * duplicate detection (the same receipt photographed twice is one deduction, not two)
 * and proof the image hasn't changed since it was booked — required now that paper
 * receipts may be destroyed once digitised.
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireUser } from "@/lib/supabase-server";
import { suggestBasAccount } from "@/lib/swedish-tax";

export const runtime = "nodejs";          // needs node:crypto
export const maxDuration = 60;            // OCR on a large photo isn't instant

const MAX_BYTES = 15 * 1024 * 1024;
const OK_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf",
]);

export async function POST(req) {
  try {
    const { sb, user } = await requireUser();

    const form = await req.formData();
    const file = form.get("file");
    const wantOcr = form.get("ocr") !== "false";

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "Ingen fil bifogad." }, { status: 400 });
    }
    if (!OK_MIME.has(file.type)) {
      return NextResponse.json(
        { error: `Filtypen ${file.type || "okänd"} stöds inte. Använd JPEG, PNG, HEIC eller PDF.` },
        { status: 415 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_BYTES) {
      return NextResponse.json({ error: "Filen är större än 15 MB." }, { status: 413 });
    }

    /* ── Hash first — it decides whether we do any work at all ─────────────── */
    const hash = createHash("sha256").update(bytes).digest("hex");

    const { data: existing } = await sb
      .from("studio_receipts")
      .select("id, vendor, receipt_date, total, currency, storage_path")
      .eq("file_hash", hash)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        duplicate: true,
        receipt: existing,
        message: `Det här kvittot finns redan: ${existing.vendor} ${existing.receipt_date}.`,
      });
    }

    /* ── Store it ──────────────────────────────────────────────────────────── */
    const ext = (file.name?.split(".").pop() || "bin").toLowerCase().slice(0, 5);
    const path = `${user.id}/${hash.slice(0, 2)}/${hash}.${ext}`;

    const { error: upErr } = await sb.storage
      .from("studio-receipts")
      .upload(path, bytes, { contentType: file.type, upsert: true });

    if (upErr) {
      return NextResponse.json({ error: `Uppladdning misslyckades: ${upErr.message}` }, { status: 502 });
    }

    const base = {
      storage_path: path,
      file_hash: hash,
      file_mime: file.type,
      file_size: bytes.length,
      file_name: file.name || null,
    };

    /* ── OCR is a suggestion layer, and it is allowed to fail ──────────────── */
    /* En PDF gick tidigare aldrig till tolkning: villkoret här hoppade över
       den och svarade "Fyll i uppgifterna manuellt". Det var en gräns någon
       skrivit in, inte en gräns i modellen — Claude läser PDF genom ett
       document-block lika gärna som en bild. Enda kvarvarande skälet att
       hoppa över är en fil som är för stor att skicka. */
    const PDF_MAX = 10 * 1024 * 1024;
    const forStorPdf = file.type === "application/pdf" && bytes.length > PDF_MAX;

    if (!wantOcr || forStorPdf || !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        ...base,
        suggestions: null,
        note: forStorPdf
          ? `PDF:en är ${Math.round(bytes.length / 1048576)} MB och för stor att tolka automatiskt. Den är sparad — fyll i uppgifterna för hand.`
          : !process.env.ANTHROPIC_API_KEY
            ? "Filen är sparad. Automatisk tolkning är inte konfigurerad — fyll i uppgifterna för hand."
            : null,
      });
    }

    let suggestions = null;
    let ocrError = null;
    try {
      suggestions = await ocr(bytes, file.type);
    } catch (e) {
      ocrError = e.message || String(e);
    }

    if (suggestions) {
      const bas = suggestBasAccount(suggestions.vendor || "", suggestions.description || "");
      suggestions.bas_account = bas.account;
      suggestions.ne_row = bas.ne;
      suggestions.category = suggestions.category || bas.label;
      suggestions.vat_treatment = guessTreatment(suggestions);
    }

    return NextResponse.json({
      ...base,
      suggestions,          // null when OCR failed — the form still works
      ocr_error: ocrError,  // shown quietly; never blocks the user
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: e.status || 500 });
  }
}

/* ── Claude vision ──────────────────────────────────────────────────────────
 * PER-FIELD confidence, not one score for the whole receipt.
 *
 * Every competitor in this category — Bokio, Fortnox, Dinero, QuickBooks, Hubdoc —
 * drops a single guess into an editable field and hopes the user checks it. None of
 * them says which value it is unsure about. That is the whole opening, and it is why
 * this route asks for a confidence AND the literal characters read for each field.
 *
 * `read_as` matters as much as the number. "1 240,00" read from a line that actually
 * says "SUMMA INKL DRICKS" is a different fact from the same number read from
 * "ATT BETALA", and only the human can tell which one belongs in the books.
 *
 * We do NOT ask for bounding boxes. Vision models place them unreliably, and a
 * highlight drawn over the wrong part of a receipt is worse than no highlight — it
 * manufactures confidence instead of reporting it.
 */

const FIELD_KEYS = [
  "vendor", "vendor_country", "receipt_date", "total",
  "vat_amount", "vat_rate", "currency", "category", "description",
];

async function ocr(bytes, mime) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_OCR_MODEL || "claude-haiku-4-5",
      max_tokens: 1600,
      messages: [{
        role: "user",
        content: [
          /* En PDF skickas som document, en bild som image. Samma modell,
             samma prompt, samma svar — bara olika omslag. */
          mime === "application/pdf"
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }
            : { type: "image", source: { type: "base64", media_type: mime, data: bytes.toString("base64") } },
          {
            type: "text",
            text:
`Läs det här kvittot. Svara ENDAST med JSON, inget annat.

För VARJE fält ska du ange tre saker: värdet, hur säker du är, och exakt vilken
text på kvittot du läste värdet från.

{
  "fields": {
    "vendor":         { "value": "<leverantörens namn>", "confidence": 0.0-1.0, "read_as": "<texten du läste>" },
    "vendor_country": { "value": "<ISO-landskod, t.ex. SE, US, NL>", "confidence": 0.0-1.0, "read_as": "<adress eller momsnummer du drog slutsatsen från>" },
    "receipt_date":   { "value": "YYYY-MM-DD", "confidence": 0.0-1.0, "read_as": "<datumet som det står på kvittot>" },
    "total":          { "value": <tal>, "confidence": 0.0-1.0, "read_as": "<raden du läste totalen från, med etiketten>" },
    "vat_amount":     { "value": <tal>, "confidence": 0.0-1.0, "read_as": "<raden du läste momsen från>" },
    "vat_rate":       { "value": <25 | 12 | 6 | 0>, "confidence": 0.0-1.0, "read_as": "<t.ex. 'MOMS 25%'>" },
    "currency":       { "value": "<SEK | EUR | USD | ...>", "confidence": 0.0-1.0, "read_as": "<valutatecken eller kod>" },
    "category":       { "value": "<kort svensk kategori>", "confidence": 0.0-1.0, "read_as": "<varuraderna>" },
    "description":    { "value": "<vad som köptes, kort>", "confidence": 0.0-1.0, "read_as": "<varuraderna>" }
  },
  "flags": ["<kort varning på svenska, en per problem — tom lista om inget>"]
}

REGLER
- Kan du inte läsa ett fält säkert: sätt "value" till null och "confidence" till din
  faktiska säkerhet. Gissa aldrig ett belopp för att fylla ett fält.
- Läs momsbeloppet exakt som det står. Räkna INTE ut det själv. Står det ingen moms,
  sätt value till null — inte 0.
- Står det "Reverse charge" eller "omvänd betalningsskyldighet": vat_amount = 0.
- confidence ska vara ärlig. 0.95+ endast för text som är skarp och otvetydig.
  Blekt termopapper, handskrift eller en avklippt rad ska ge under 0.6.

LÄGG TILL EN FLAGGA när något av detta gäller — det här är felen som kostar pengar:
- totalen ser ut att inkludera dricks eller avrundning
- kvittot verkar fortsätta på en sida till
- beloppen går inte ihop (moms + netto ≠ total)
- texten är blek, suddig eller delvis oläsbar
- flera momssatser förekommer på samma kvitto
- leverantörsnamnet är en betalterminalsträng (t.ex. "SUMUP *CIGARR") snarare än ett
  riktigt företagsnamn — skriv då det riktiga namnet i value om du kan sluta dig till det`,
          },
        ],
      }],
    }),
  });

  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);

  const j = await r.json();
  const text = j.content?.find((b) => b.type === "text")?.text || "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("OCR-svaret gick inte att tolka.");
  const parsed = JSON.parse(m[0]);

  return normalise(parsed);
}

/* The model is asked for a shape; it is not trusted to return one. This flattens
 * `fields` to the top level so /api/receipts/commit and every existing caller keep
 * working unchanged, while `fields` rides along for the UI that shows confidence. */
function normalise(parsed) {
  const raw = parsed?.fields && typeof parsed.fields === "object" ? parsed.fields : parsed || {};
  const fields = {};
  const out = {};

  for (const k of FIELD_KEYS) {
    const cell = raw[k];
    const isCell = cell && typeof cell === "object" && !Array.isArray(cell);
    const value = isCell ? cell.value : cell;
    const c = isCell ? Number(cell.confidence) : NaN;

    out[k] = value === undefined ? null : value;
    fields[k] = {
      value: out[k],
      // No confidence reported is not the same as high confidence. Treat it as unknown.
      confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : null,
      read_as: isCell && typeof cell.read_as === "string" ? cell.read_as.slice(0, 120) : null,
    };
  }

  out.fields = fields;
  out.flags = Array.isArray(parsed?.flags)
    ? parsed.flags.filter((f) => typeof f === "string" && f.trim()).slice(0, 6)
    : [];

  // Kept for anything still reading a single number. It is the WEAKEST field, not an
  // average — a receipt is only as trustworthy as the value you are least sure of.
  const scores = FIELD_KEYS.map((k) => fields[k].confidence).filter((n) => n != null);
  out.confidence = scores.length ? Math.min(...scores) : null;

  return out;
}

/* A first guess at VAT treatment from the vendor's country. Always a suggestion —
 * getting this wrong is what cost ~5 000 kr/year on the Anthropic subscription. */
const EU = new Set(["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES"]);

function guessTreatment(s) {
  const c = (s.vendor_country || "").toUpperCase();
  const chargedVat = Number(s.vat_amount) > 0;

  if (!c || c === "SE") return chargedVat ? "domestic" : null;

  // A foreign supplier that charged Swedish VAT did so through OSS — that VAT is not
  // reclaimable, and it usually means our VAT number is missing from their billing profile.
  if (chargedVat) return "oss_non_ded";

  return EU.has(c) ? "rc_eu" : "rc_non_eu";
}
