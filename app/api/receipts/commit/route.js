/* app/api/receipts/commit/route.js
 *
 * Writes the receipt row after a human has confirmed the numbers.
 *
 * Idempotent on the file hash: the same file can only ever become one receipt, no
 * matter how many times a flaky connection retries the request. This is the pattern
 * every state-changing endpoint in the app should follow — a double-tapped button
 * must not become a double deduction.
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

const TREATMENTS = new Set(["domestic", "rc_eu", "rc_non_eu", "oss_non_ded", "exempt"]);
const VENTURES = new Set(["turquino", "the_next_cigar", "zamacharters", "skattenavigator", "cruiseshuttle", "ifmba", "other"]);

export async function POST(req) {
  try {
    const { sb, user } = await requireUser();
    const b = await req.json();

    /* ── Validate before touching the books ────────────────────────────────── */
    const errors = [];
    if (!b.storage_path || !b.file_hash) errors.push("Filen saknas — ladda upp kvittot först.");
    if (!b.vendor?.trim()) errors.push("Leverantör saknas.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.receipt_date || "")) errors.push("Datum måste vara YYYY-MM-DD.");
    if (!Number.isFinite(Number(b.total))) errors.push("Belopp saknas.");
    if (!TREATMENTS.has(b.vat_treatment)) errors.push("Ogiltig momsbehandling.");
    if (b.venture && !VENTURES.has(b.venture)) errors.push("Ogiltig verksamhet.");

    const share = b.business_share == null ? 1 : Number(b.business_share);
    if (!(share >= 0 && share <= 1)) errors.push("Andel affär måste vara mellan 0 och 1.");

    const total = Number(b.total);
    const vat = Number(b.vat_amount || 0);
    if (vat > total) errors.push("Momsbeloppet kan inte vara större än totalen.");

    // A foreign supplier charging Swedish VAT is the expensive mistake. Don't block it —
    // it's a real thing that happens — but never let it silently become deductible.
    if (b.vat_treatment === "oss_non_ded" && vat === 0) {
      errors.push("OSS-behandling förutsätter att säljaren debiterat moms. Kontrollera beloppet.");
    }

    if (errors.length) return NextResponse.json({ error: errors.join(" ") }, { status: 400 });

    /* ── Idempotency: one file, one receipt, forever ───────────────────────── */
    const { data: existing } = await sb
      .from("studio_receipts")
      .select("*")
      .eq("file_hash", b.file_hash)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ receipt: existing, replayed: true });
    }

    const row = {
      user_id: user.id,
      vendor: b.vendor.trim(),
      receipt_date: b.receipt_date,
      total,
      vat_amount: vat,
      vat_rate: b.vat_rate == null ? null : Number(b.vat_rate),
      currency: (b.currency || "SEK").toUpperCase(),
      category: b.category?.trim() || null,
      description: b.description?.trim() || null,
      bas_account: b.bas_account || null,
      ne_row: b.ne_row || null,
      vat_treatment: b.vat_treatment,
      venture: b.venture || null,
      business_share: share,
      is_business: true,
      is_deductible: b.vat_treatment !== "oss_non_ded",
      storage_path: b.storage_path,
      file_hash: b.file_hash,
      file_mime: b.file_mime || null,
      file_size: b.file_size || null,
      file_name: b.file_name || null,
      uploaded_at: new Date().toISOString(),
      source: "capture",
      status: "confirmed",
      // SEK rows are already in SEK. Foreign ones stay null on purpose so lib/moms.js
      // reports them as unconverted and blocks filing until scripts/backfill-fx.mjs runs.
      ...((b.currency || "SEK").toUpperCase() === "SEK"
        ? { total_sek: total, vat_sek: vat }
        : {}),
    };

    const { data, error } = await sb.from("studio_receipts").insert(row).select().single();

    if (error) {
      // The unique index on (user_id, file_hash) is the last line of defence against
      // a race between two concurrent commits of the same file.
      if (error.code === "23505") {
        const { data: dup } = await sb.from("studio_receipts").select("*").eq("file_hash", b.file_hash).maybeSingle();
        return NextResponse.json({ receipt: dup, replayed: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const needsFx = data.currency !== "SEK";
    return NextResponse.json({
      receipt: data,
      needs_fx: needsFx,
      note: needsFx
        ? `Sparat i ${data.currency}. Kör omräkningen innan du deklarerar — beloppet räknas inte med förrän det finns en SEK-kurs.`
        : null,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: e.status || 500 });
  }
}
