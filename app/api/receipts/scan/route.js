import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";
import { suggestBasAccount } from "@/lib/swedish-tax";

/** Receipt OCR via Claude vision.
 *  Body: { image_base64: "data:image/jpeg;base64,..." }
 *  Returns: { vendor, receipt_date, total, vat_amount, vat_rate, currency, category, bas_account, ne_row, raw }
 */
export async function POST(req) {
  try {
    await requireUser(); // 401 if not signed in — protects API tokens
    const { image_base64 } = await req.json();
    if (!image_base64) return NextResponse.json({ error: "Missing image_base64" }, { status: 400 });
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY saknas" }, { status: 500 });

    const m = String(image_base64).match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!m) return NextResponse.json({ error: "Invalid base64 data URI" }, { status: 400 });
    const media_type = m[1];
    const data = m[2];

    const prompt = `Du är en bokföringsassistent för svensk enskild firma (sole trader). Extrahera följande från detta kvitto och svara ENDAST med strikt JSON, inga kommentarer:

{
  "vendor": "<leverantörens namn>",
  "receipt_date": "YYYY-MM-DD",
  "total": <totalbelopp inkl. moms som tal>,
  "vat_amount": <momsbelopp som tal — om okänt: null>,
  "vat_rate": <25 | 12 | 6 | 0 — vilken momssats som dominerar>,
  "currency": "SEK",
  "category": "<svensk kategori, t.ex. 'Drivmedel', 'Resor', 'Måltider extern', 'Kontorsmateriel', 'IT-tjänster'>",
  "description": "<kort sammanfattning av inköpet>",
  "confidence": <0.0–1.0 hur säker du är>
}

Om något fält saknas eller är otydligt, sätt null. Inkludera aldrig text utanför JSON.`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type, data } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json({ error: `Anthropic error: ${t.slice(0, 300)}` }, { status: 502 });
    }
    const j = await r.json();
    const text = j.content?.[0]?.text || "";
    let parsed;
    try {
      // Tolerate fenced JSON or extra whitespace
      const m2 = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m2 ? m2[0] : text);
    } catch {
      return NextResponse.json({ error: "Kunde inte tolka OCR-svaret", raw: text }, { status: 502 });
    }

    const bas = suggestBasAccount(parsed.vendor || "", parsed.description || "");
    return NextResponse.json({
      ...parsed,
      bas_account: bas.account,
      ne_row: bas.ne,
      category: parsed.category || bas.label,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: e.status || 500 });
  }
}
