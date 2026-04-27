import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";

/** Save (or clear) a Web Push subscription on the user's notif_prefs row.
 *  Body: { subscription } | { unsubscribe: true }
 */
export async function POST(req) {
  try {
    const { sb, user } = await requireUser();
    const body = await req.json();

    if (body.unsubscribe) {
      await sb.from("studio_notif_prefs").upsert({ user_id: user.id, push_enabled: false, webpush_subscription: null });
      return NextResponse.json({ ok: true });
    }

    const sub = body.subscription;
    if (!sub?.endpoint) return NextResponse.json({ error: "Missing subscription" }, { status: 400 });

    await sb.from("studio_notif_prefs").upsert({
      user_id: user.id,
      push_enabled: true,
      webpush_subscription: sub,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: e.status || 500 });
  }
}

/** Expose VAPID public key for the browser to subscribe with. */
export async function GET() {
  return NextResponse.json({ vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null });
}
