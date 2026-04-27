import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase-server";

/** Daily 07:00 UTC cron. For every user with push_enabled, find tasks due
 *  in the next 1 day that haven't been notified yet, and send a Web Push.
 *
 *  Web Push from server side traditionally needs the `web-push` npm package
 *  for VAPID signing. To keep our dependency surface minimal, we use the
 *  Web Crypto API directly — but to keep this file simple we delegate the
 *  actual signing to a small dynamic import. If `web-push` isn't installed,
 *  we no-op gracefully so the absence of the package never breaks builds.  */
export async function GET(req) {
  const auth = req.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (expected && auth !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ ok: true, skipped: "VAPID keys not configured" });
  }

  let webpush;
  try { webpush = (await import("web-push")).default; }
  catch { return NextResponse.json({ ok: true, skipped: "web-push package not installed" }); }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:contact@hopkinsmethod.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  const sb = serviceClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();

  const { data: prefs } = await sb.from("studio_notif_prefs").select("user_id, webpush_subscription").eq("push_enabled", true);
  const sent = [];
  for (const p of prefs || []) {
    if (!p.webpush_subscription?.endpoint) continue;

    const { data: tasks } = await sb.from("studio_tasks")
      .select("id, title, due_at, priority")
      .eq("user_id", p.user_id)
      .eq("status", "open")
      .lte("due_at", horizon)
      .is("notified_at", null);
    if (!tasks?.length) continue;

    for (const t of tasks) {
      const payload = JSON.stringify({
        title: t.priority === "high" ? "🔴 " + t.title : t.title,
        body: `Förfaller ${new Date(t.due_at).toLocaleString("sv-SE")}`,
        url: "/deadlines",
      });
      try {
        await webpush.sendNotification(p.webpush_subscription, payload);
        await sb.from("studio_tasks").update({ notified_at: new Date().toISOString() }).eq("id", t.id);
        sent.push(t.id);
      } catch (e) {
        // Subscription expired/invalid — clear it
        if (e.statusCode === 410 || e.statusCode === 404) {
          await sb.from("studio_notif_prefs").update({ push_enabled: false, webpush_subscription: null }).eq("user_id", p.user_id);
        }
      }
    }
  }
  return NextResponse.json({ ok: true, sent });
}
