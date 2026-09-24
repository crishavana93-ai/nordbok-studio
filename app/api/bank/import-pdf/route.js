/* app/api/bank/import-pdf/route.js
 *
 * A bank statement PDF (Revolut first, but any bank) → archived verifikation + a
 * PROPOSED list of transactions. Nothing is written to studio_bank_tx here; the
 * page shows the proposal and the human presses "Importera". Same rule as the
 * receipt scanner: a machine reading never reaches the books unseen.
 *
 * The integrity check that makes this trustworthy is the balance proof. Every
 * statement prints an opening and a closing balance per currency. If
 *   opening + Σ(extracted amounts) ≠ closing
 * then a row was missed or misread, and the page says so before anything is
 * imported. That is a check a human would do by hand; the model is not trusted to
 * have done it.
 *
 * The PDF itself is stored in studio-documents as doc_type "bank_statement", so the
 * statement is archived (BFL 7 kap.) whether or not the rows are imported.
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireUser } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req) {
  try {
    const { sb, user } = await requireUser();
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY saknas på servern." }, { status: 500 });
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "Ingen fil." }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Bara PDF här. CSV läses med knappen bredvid." }, { status: 415 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_BYTES) {
      return NextResponse.json({ error: "Filen är större än 20 MB. Dela upp utdraget per månad." }, { status: 413 });
    }
    const sha = createHash("sha256").update(bytes).digest("hex");

    /* ── 1. Archive the statement (idempotent on the hash) ── */
    const { data: existing } = await sb.from("studio_documents")
      .select("id, title").eq("user_id", user.id).contains("tags", [`sha256:${sha}`]).maybeSingle();

    let documentId = existing?.id || null;
    if (!documentId) {
      const safe = (file.name || "kontoutdrag.pdf").replace(/[^\w.\-]+/g, "_");
      const path = `${user.id}/${new Date().getFullYear()}/bank/${Date.now()}-${safe}`;
      const { error: upErr } = await sb.storage.from("studio-documents")
        .upload(path, bytes, { contentType: "application/pdf", upsert: false });
      if (upErr) return NextResponse.json({ error: `Kunde inte arkivera PDF:en: ${upErr.message}` }, { status: 500 });
      const today = new Date().toISOString().slice(0, 10);
      const { data: doc, error: dErr } = await sb.from("studio_documents").insert({
        user_id: user.id,
        title: `Kontoutdrag – ${file.name || "PDF"}`,
        doc_type: "bank_statement",
        category: "Bank",
        storage_path: path,
        mime_type: "application/pdf",
        size_bytes: bytes.length,
        issued_date: today,
        retention_until: `${Number(today.slice(0, 4)) + 7}-12-31`,
        tags: [`sha256:${sha}`],
      }).select("id").single();
      if (dErr) {
        await sb.storage.from("studio-documents").remove([path]).catch(() => {});
        return NextResponse.json({ error: `Kunde inte spara dokumentet: ${dErr.message}` }, { status: 500 });
      }
      documentId = doc.id;
    }

    /* ── 2. Extract ── */
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_STATEMENT_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 16000,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } },
            { type: "text", text: PROMPT },
          ],
        }],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json({ error: `Läsningen misslyckades (${r.status}). PDF:en är arkiverad ändå.`, detail: t.slice(0, 300), document_id: documentId }, { status: 502 });
    }
    const j = await r.json();
    const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = safeParse(text);
    if (!parsed) {
      return NextResponse.json({ error: "Kunde inte tolka svaret. PDF:en är arkiverad ändå.", document_id: documentId }, { status: 502 });
    }

    const rows = (parsed.transactions || [])
      .map(clean)
      .filter(Boolean);

    return NextResponse.json({
      document_id: documentId,
      already_archived: !!existing,
      bank: String(parsed.bank || "").slice(0, 32) || null,
      account_holder: parsed.account_holder || null,
      period: parsed.period || null,
      balances: Array.isArray(parsed.balances) ? parsed.balances : [],
      proof: balanceProof(rows, parsed.balances),
      rows,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.slice(0, 10) : [],
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: e.status || 500 });
  }
}

const PROMPT = `Det här är ett kontoutdrag från en bank (ofta Revolut). Extrahera VARJE
transaktion. Svara ENDAST med JSON enligt schemat, ingen annan text.

{
  "bank": "<bankens namn, t.ex. Revolut>",
  "account_holder": "<kontohavare som det står>",
  "period": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
  "balances": [ { "currency": "SEK", "opening": <tal>, "closing": <tal> } ],
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "<texten på raden, ordagrant>",
      "counterparty": "<mottagare/avsändare om den står, annars null>",
      "reference": "<referens/meddelande om det står, annars null>",
      "amount": <tal med tecken: pengar UT är negativa, pengar IN positiva. Beloppet som ändrade saldot, INKLUSIVE avgift>,
      "fee": <avgiften som tal om den står separat, annars 0>,
      "currency": "<kontots valuta för raden: SEK, USD, EUR ...>",
      "original_amount": <belopp i ursprunglig valuta om det skiljer sig, annars null>,
      "original_currency": "<valuta för original_amount, annars null>"
    }
  ],
  "warnings": ["<ärliga förbehåll: sidor som saknas, oläsliga rader, rader du är osäker på>"]
}

Regler:
- Ta med ALLA rader på ALLA sidor och i ALLA valutasektioner. Hoppa inte över små belopp.
- Ta INTE med rader som är avvisade, återförda eller "pending/väntande" om utdraget
  markerar dem så — nämn dem i warnings i stället.
- Använd punkt som decimaltecken i JSON. Inga tusentalsavgränsare.
- Om ingående/utgående saldo inte står för en valuta, utelämna den valutan i balances.
- Hitta aldrig på något. Om du inte kan läsa ett fält, sätt null och skriv en varning.`;

function safeParse(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function clean(t) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(t?.date || "")) ? t.date : null;
  const amount = Number(t?.amount);
  if (!date || !Number.isFinite(amount)) return null;
  const fee = Number(t?.fee) || 0;
  const cur = String(t?.currency || "SEK").toUpperCase().slice(0, 3);
  const parts = [String(t.description || "").trim()];
  if (t.counterparty && !parts[0].includes(t.counterparty)) parts.push(t.counterparty);
  if (t.reference) parts.push(`ref ${t.reference}`);
  if (fee) parts.push(`avgift ${fee} ${cur}`);
  if (t.original_amount && t.original_currency && t.original_currency !== cur) {
    parts.push(`${t.original_amount} ${t.original_currency}`);
  }
  return {
    tx_date: date,
    description: parts.filter(Boolean).join(" · ").slice(0, 500),
    amount: Math.round(amount * 100) / 100,
    currency: cur,
  };
}

/* opening + Σ amounts should equal closing, per currency, to the öre. */
function balanceProof(rows, balances) {
  if (!Array.isArray(balances) || balances.length === 0) return { checked: false, results: [] };
  const results = balances.map((b) => {
    const cur = String(b.currency || "").toUpperCase();
    const sum = rows.filter((r) => r.currency === cur).reduce((a, r) => a + Math.round(r.amount * 100), 0);
    const opening = Math.round(Number(b.opening) * 100);
    const closing = Math.round(Number(b.closing) * 100);
    if (!Number.isFinite(opening) || !Number.isFinite(closing)) return { currency: cur, ok: null };
    const diff = opening + sum - closing;
    return { currency: cur, ok: diff === 0, diff: diff / 100 };
  });
  return { checked: true, ok: results.every((x) => x.ok !== false), results };
}
