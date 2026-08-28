/* app/api/receipts/[id]/route.js
 *
 * Att rätta ett kvitto som redan är sparat.
 *
 * VARFÖR DEN HÄR ROUTEN INTE FANNS FÖRUT, OCH VARFÖR DET VAR FEL
 * Kvitton gick att skapa men aldrig ändra. Det såg ut som försiktighet. I
 * praktiken betydde det att en rad med fel momsbehandling inte gick att rätta
 * i appen alls — den enda vägen kvar var att skriva över den direkt i
 * databasen, utan spår av vad som stod där innan. Oföränderlighet som tvingar
 * fram en tystare ändring är sämre än en ändring som syns.
 *
 * TRE SAKER SKYDDAS
 *   1. Underlaget. storage_path och file_hash finns inte bland RATTNINGSBARA.
 *      Bilden ÄR verifikationen sedan 2024-07-01; går den att byta ut i
 *      efterhand bevisar kontrollsumman ingenting.
 *   2. Det som lämnats in. Rör ändringen belopp eller moms i en period som
 *      redan är deklarerad stoppas den här — det felet rättas hos
 *      Skatteverket, inte genom att skriva om historiken.
 *   3. Historiken. Rättelsen och anteckningen om vad den ersatte skrivs i
 *      samma begäran. BFL 5 kap. 5 §.
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";
import { granskaKvitto, sekMotvarde, RATTNINGSBARA } from "@/lib/kvitto-regler";

export const runtime = "nodejs";

/* Fält som påverkar en momsdeklaration. Ändras något av dem i en period som
   redan är lämnad stämmer inte längre det Skatteverket har. */
const PAVERKAR_MOMS = new Set([
  "total", "vat_amount", "vat_rate", "currency",
  "vat_treatment", "receipt_date", "business_share", "is_business",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Jämför som text: 243.38 och "243.38" kommer båda ur numeric och ska inte
   räknas som en ändring. */
const lika = (a, b) => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return String(a) === String(b);
};

export async function GET(req, { params }) {
  try {
    const { sb, user } = await requireUser();
    const { id } = await params;
    if (!UUID.test(id || "")) return NextResponse.json({ error: "Ogiltigt id." }, { status: 400 });

    const { data: kvitto, error } = await sb
      .from("studio_receipts").select("*")
      .eq("id", id).eq("user_id", user.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!kvitto) return NextResponse.json({ error: "Kvittot finns inte." }, { status: 404 });

    const { data: rattelser } = await sb
      .from("studio_receipt_corrections").select("*")
      .eq("receipt_id", id).order("created_at", { ascending: false });

    return NextResponse.json({ receipt: kvitto, rattelser: rattelser || [] });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: e.status || 500 });
  }
}

export async function PATCH(req, { params }) {
  try {
    const { sb, user } = await requireUser();
    const { id } = await params;
    if (!UUID.test(id || "")) return NextResponse.json({ error: "Ogiltigt id." }, { status: 400 });

    const body = await req.json();

    /* ── Vad står där nu? ──────────────────────────────────────────────────── */
    const { data: fore, error: lasFel } = await sb
      .from("studio_receipts").select("*")
      .eq("id", id).eq("user_id", user.id).maybeSingle();
    if (lasFel) return NextResponse.json({ error: lasFel.message }, { status: 500 });
    if (!fore) return NextResponse.json({ error: "Kvittot finns inte." }, { status: 404 });

    /* ── Bara det som får rättas, och bara det som faktiskt ändrats ────────── */
    const avvisade = Object.keys(body).filter(
      (k) => !RATTNINGSBARA.includes(k) && k !== "skal"
    );
    if (avvisade.includes("storage_path") || avvisade.includes("file_hash")) {
      return NextResponse.json({
        error: "Underlaget kan inte bytas ut. Bilden är verifikationen — är den fel, " +
               "ladda upp rätt kvitto som ett nytt och markera det här som privat.",
      }, { status: 400 });
    }

    const onskat = {};
    for (const f of RATTNINGSBARA) if (f in body) onskat[f] = body[f];
    if (!Object.keys(onskat).length) {
      return NextResponse.json({ error: "Ingenting att rätta." }, { status: 400 });
    }

    /* Hela raden granskas, inte ändringen. Sätts behandlingen om måste momsen
       bedömas mot den nya behandlingen — inte mot den som stod där förut. */
    const sammanslagen = { ...fore, ...onskat };
    const { fel, rad } = granskaKvitto(sammanslagen);
    if (fel.length) return NextResponse.json({ error: fel.join(" ") }, { status: 400 });

    const nyRad = { ...rad, ...sekMotvarde(rad) };

    const andrade = RATTNINGSBARA.filter((f) => f in nyRad && !lika(fore[f], nyRad[f]));
    /* is_deductible och SEK-motvärdet är härledda och står inte i RATTNINGSBARA,
       men de ska med i historiken när de följer med. */
    for (const h of ["is_deductible", "total_sek", "vat_sek"]) {
      if (h in nyRad && !lika(fore[h], nyRad[h])) andrade.push(h);
    }
    if (!andrade.length) {
      return NextResponse.json({ receipt: fore, oforandrad: true });
    }

    /* ── Är perioden redan lämnad? ─────────────────────────────────────────── */
    const momsAndring = andrade.some((f) => PAVERKAR_MOMS.has(f));
    if (momsAndring) {
      const datum = [fore.receipt_date, nyRad.receipt_date].filter(Boolean);
      const { data: perioder } = await sb
        .from("studio_moms_perioder")
        .select("period_key, period_start, period_end")
        .eq("user_id", user.id);

      const krock = (perioder || []).find((p) =>
        datum.some((d) => d >= p.period_start && d <= p.period_end)
      );
      if (krock) {
        return NextResponse.json({
          error:
            `Perioden ${krock.period_key} är redan deklarerad. Att ändra belopp, moms eller ` +
            `datum här gör att appen visar något annat än det Skatteverket har fått. ` +
            `Rätta i stället genom att lämna en ny momsdeklaration för ${krock.period_key} ` +
            `hos Skatteverket, och ta bort perioden här först om den markerats som lämnad av misstag. ` +
            `Sådant som inte påverkar momsen — leverantör, beskrivning, konto, verksamhet — går att rätta.`,
          period: krock.period_key,
        }, { status: 409 });
      }
    }

    /* ── Rätta, och anteckna vad rättelsen ersatte ─────────────────────────── */
    const foreDiff = {};
    const efterDiff = {};
    for (const f of andrade) { foreDiff[f] = fore[f] ?? null; efterDiff[f] = nyRad[f] ?? null; }

    const { data: uppdaterad, error: skrivFel } = await sb
      .from("studio_receipts")
      .update(nyRad)
      .eq("id", id).eq("user_id", user.id)
      .select().single();
    if (skrivFel) return NextResponse.json({ error: skrivFel.message }, { status: 500 });

    const { error: histFel } = await sb.from("studio_receipt_corrections").insert({
      user_id: user.id,
      receipt_id: id,
      fore: foreDiff,
      efter: efterDiff,
      falt: andrade,
      skal: typeof body.skal === "string" && body.skal.trim() ? body.skal.trim().slice(0, 500) : null,
    });
    /* Misslyckas anteckningen står raden ändrad utan spår. Det ska synas, inte
       sväljas — men rättelsen rullas inte tillbaka, för den nya raden är den
       riktiga och att kasta bort den vore värre. */
    if (histFel) console.error("[receipts/patch] rättelsen skrevs men inte historiken:", histFel.message);

    const behoverFx = uppdaterad.currency !== "SEK" && uppdaterad.total_sek == null;

    return NextResponse.json({
      receipt: uppdaterad,
      andrade,
      historik_sparad: !histFel,
      needs_fx: behoverFx,
      note: behoverFx
        ? `Beloppet ändrades på en rad i ${uppdaterad.currency}. Den gamla SEK-omräkningen ` +
          `gäller inte längre och är borttagen — kör omräkningen igen innan du deklarerar.`
        : null,
      ignorerade: avvisade.length ? avvisade : undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: e.status || 500 });
  }
}
