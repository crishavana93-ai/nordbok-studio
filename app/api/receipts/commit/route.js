/* app/api/receipts/commit/route.js
 *
 * Writes the receipt row after a human has confirmed the numbers.
 *
 * Idempotent on the file hash: the same file can only ever become one receipt, no
 * matter how many times a flaky connection retries the request. This is the pattern
 * every state-changing endpoint in the app should follow — a double-tapped button
 * must not become a double deduction.
 *
 * Reglerna för VAD som är en giltig rad ligger i lib/kvitto-regler.js och inte här.
 * Sedan kvitton också går att rätta finns två vägar in i samma tabell, och regler
 * som står på två ställen glider isär tills den ena släpper igenom det den andra
 * stoppar. Motsägelsen "omvänd betalningsskyldighet med moms" tog fyra månader att
 * upptäcka just för att den bara kontrollerades i SIE-exporten.
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";
import { granskaKvitto, sekMotvarde } from "@/lib/kvitto-regler";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { sb, user } = await requireUser();
    const b = await req.json();

    /* ── Validate before touching the books ────────────────────────────────── */
    if (!b.storage_path || !b.file_hash) {
      return NextResponse.json({ error: "Filen saknas — ladda upp kvittot först." }, { status: 400 });
    }

    const { fel, rad } = granskaKvitto(b);
    if (fel.length) return NextResponse.json({ error: fel.join(" ") }, { status: 400 });

    /* ── Idempotency: one file, one receipt, forever ───────────────────────── */
    const { data: existing } = await sb
      .from("studio_receipts")
      .select("*")
      .eq("file_hash", b.file_hash)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ receipt: existing, replayed: true });
    }

    const row = {
      user_id: user.id,
      ...rad,
      // SEK rows are already in SEK. Foreign ones stay null on purpose so lib/moms.js
      // reports them as unconverted and blocks filing until scripts/backfill-fx.mjs runs.
      ...sekMotvarde(rad),
      storage_path: b.storage_path,
      file_hash: b.file_hash,
      file_mime: b.file_mime || null,
      file_size: b.file_size || null,
      file_name: b.file_name || null,
      uploaded_at: new Date().toISOString(),
      source: "capture",
      status: "confirmed",
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
