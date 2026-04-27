"use client";
import { useState } from "react";

/** Right-side panel on the dashboard:
 *  - "Run digest now" sends the weekly summary email immediately
 *  - "Aktivera notiser" registers the browser for Web Push
 */
export default function QuickActions() {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function runDigest() {
    setBusy("digest"); setMsg("");
    try {
      const r = await fetch("/api/digest/run", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Misslyckades");
      setMsg(`Digest skickad${j.sent ? "" : " (ingenting att skicka)"}.`);
    } catch (e) { setMsg(`Fel: ${e.message}`); }
    finally { setBusy(""); }
  }

  async function enablePush() {
    setBusy("push"); setMsg("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Webläsaren stöder inte Web Push.");
      const reg = await navigator.serviceWorker.ready;

      const r = await fetch("/api/push/subscribe");
      const { vapidPublicKey } = await r.json();
      if (!vapidPublicKey) throw new Error("VAPID-nyckel saknas — be admin lägga till VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY i Vercel-env.");

      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Notifikationer blockerade.");

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8(vapidPublicKey),
      });
      const r2 = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      const j2 = await r2.json();
      if (!r2.ok) throw new Error(j2.error || "Misslyckades");
      setMsg("Notiser aktiverade. Du får push när deadlines närmar sig.");
    } catch (e) { setMsg(`Fel: ${e.message}`); }
    finally { setBusy(""); }
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="spread">
        <div style={{ fontWeight: 600 }}>Snabbåtgärder</div>
      </div>
      <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-sm" onClick={runDigest} disabled={busy === "digest"}>{busy === "digest" ? "..." : "Skicka veckorapport nu"}</button>
        <button className="btn btn-ghost btn-sm" onClick={enablePush} disabled={busy === "push"}>{busy === "push" ? "..." : "Aktivera push-notiser"}</button>
      </div>
      {msg && <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>{msg}</div>}
    </div>
  );
}

function urlBase64ToUint8(b64) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const norm = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(norm);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
