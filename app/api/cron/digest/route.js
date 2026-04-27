import { NextResponse } from "next/server";
import { Resend } from "resend";
import { serviceClient } from "@/lib/supabase-server";
import { buildDigest } from "@/lib/digest";

/** Vercel Cron entry point. Runs server-side on schedule from vercel.json.
 *  Authenticated by `Authorization: Bearer ${CRON_SECRET}` (Vercel sets this header
 *  on cron requests; our env mirrors the same value). */
export async function GET(req) {
  const auth = req.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (expected && auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runDigest({ singleUser: null, force: false });
}

/** Internal helper used by both cron and the manual /api/digest/run route. */
export async function runDigest({ singleUser = null, force = false } = {}) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY missing" }, { status: 500 });
  }
  const sb = serviceClient();
  const resend = new Resend(process.env.RESEND_API_KEY);
  const today = new Date();

  // Find candidates: users with email_digest=true and (force OR digest_day=today's weekday)
  const dow = today.getDay() || 7; // Mon=1..Sun=7
  let q = sb.from("studio_notif_prefs").select("*");
  if (singleUser) q = q.eq("user_id", singleUser);
  const { data: prefs, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sentTo = [];
  const skipped = [];

  for (const p of prefs || []) {
    if (!p.email_digest) { skipped.push({ user: p.user_id, reason: "digest disabled" }); continue; }
    if (!force && Number(p.digest_day || 1) !== dow) { skipped.push({ user: p.user_id, reason: `wrong day (want ${p.digest_day}, got ${dow})` }); continue; }

    // Get user email + business profile
    const { data: u } = await sb.auth.admin.getUserById(p.user_id);
    const email = u?.user?.email;
    if (!email) { skipped.push({ user: p.user_id, reason: "no email" }); continue; }

    const yearStart = `${today.getFullYear()}-01-01`;
    const [{ data: settings }, { data: invoices }, { data: receipts }, { data: trips }, { data: tasks }] = await Promise.all([
      sb.from("studio_settings").select("*").eq("user_id", p.user_id).maybeSingle(),
      sb.from("studio_invoices").select("invoice_number,status,total,vat_amount,subtotal,issue_date,due_date,paid_at,studio_clients(name)").eq("user_id", p.user_id).gte("issue_date", yearStart),
      sb.from("studio_receipts").select("total,vat_amount,receipt_date,is_business,is_deductible,status").eq("user_id", p.user_id).gte("receipt_date", yearStart),
      sb.from("studio_trips").select("km,deduction,trip_date,is_business").eq("user_id", p.user_id).gte("trip_date", yearStart),
      sb.from("studio_tasks").select("title,due_at,status,priority").eq("user_id", p.user_id).eq("status", "open"),
    ]);

    const { subject, html, summary } = buildDigest({
      user: { email },
      settings, invoices: invoices || [], receipts: receipts || [], trips: trips || [], tasks: tasks || [],
    });

    const fromEmail = process.env.RESEND_FROM_EMAIL || "Studio <onboarding@resend.dev>";
    const result = await resend.emails.send({ from: fromEmail, to: email, subject, html });
    if (result.error) { skipped.push({ user: p.user_id, reason: result.error.message }); continue; }
    sentTo.push({ email, ...summary });
  }

  return NextResponse.json({ ok: true, sent: sentTo.length, sentTo, skipped });
}
