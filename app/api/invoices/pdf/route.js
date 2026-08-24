import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";
import { renderInvoiceHTML } from "@/lib/invoice-html";

/** Returns the invoice as a print-ready HTML page (browser → "Save as PDF").
 *  We deliberately don't use a server-side PDF library to keep the bundle small
 *  and the dependency surface minimal. */
export async function GET(req) {
  try {
    const { sb } = await requireUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data: invoice, error } = await sb.from("studio_invoices").select("*").eq("id", id).maybeSingle();
    if (error || !invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { data: client } = await sb.from("studio_clients").select("*").eq("id", invoice.client_id).maybeSingle();
    /* The seller on an invoice is the invoice's owner — not necessarily the person
       viewing it, now that a revisor can open someone else's books. */
    const { data: settings } = await sb.from("studio_settings").select("*")
      .eq("user_id", invoice.user_id).maybeSingle();
    const { data: items } = await sb.from("studio_invoice_items").select("*").eq("invoice_id", id).order("position");
    /* Same venture the invoice was issued under -- the printed copy and the emailed
       copy must carry an identical seller block or they are two different documents. */
    const { data: venture } = invoice.venture
      ? await sb.from("studio_venture_identity").select("*")
          .eq("user_id", invoice.user_id).eq("venture", invoice.venture).maybeSingle()
      : { data: null };

    const { data: creditOf } = invoice.credit_of
      ? await sb.from("studio_invoices").select("id, invoice_number, issue_date, total")
          .eq("id", invoice.credit_of).maybeSingle()
      : { data: null };

    const html = renderInvoiceHTML({ invoice, client, settings, items: items || [], venture, creditOf });
    return new NextResponse(html + `<script>setTimeout(()=>window.print(),300)</script>`, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: e.status || 500 });
  }
}
