"use client";
import { useEffect, useState } from "react";

/** Shows an "Install app" button when the browser fires `beforeinstallprompt`
 *  (Chrome/Edge on Android + desktop). On iOS Safari we show step-by-step
 *  instructions since Safari doesn't expose the install API.
 *  Renders nothing once the app is already installed. */
export default function InstallPrompt() {
  const [evt, setEvt] = useState(null);
  const [showIos, setShowIos] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already running as installed PWA?
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (isStandalone) { setInstalled(true); return; }

    const onBip = (e) => { e.preventDefault(); setEvt(e); };
    const onInstalled = () => { setInstalled(true); setEvt(null); };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari has no beforeinstallprompt — detect and show instructions
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    if (isIos && isSafari && !isStandalone) {
      const seen = sessionStorage.getItem("ios-install-shown");
      if (!seen) setShowIos(true);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  if (evt) {
    return (
      <button
        onClick={async () => {
          evt.prompt();
          const { outcome } = await evt.userChoice;
          if (outcome === "accepted") setEvt(null);
        }}
        className="btn"
        style={{ position: "fixed", right: 14, bottom: "calc(var(--nav-h) + var(--safe-bottom) + 14px)", zIndex: 60, boxShadow: "0 8px 24px rgba(13,58,42,.35)" }}
      >
        Installera som app
      </button>
    );
  }

  if (showIos) {
    return (
      <div style={{ position: "fixed", left: 12, right: 12, bottom: "calc(var(--nav-h) + var(--safe-bottom) + 14px)", zIndex: 60, background: "var(--bg-card)", border: "1px solid var(--line)", borderRadius: 12, padding: 12, boxShadow: "0 8px 24px rgba(0,0,0,.18)", fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <strong>Lägg till på hemskärmen</strong>
            <div className="muted" style={{ marginTop: 4 }}>
              Tryck på <strong>Dela</strong>-ikonen i Safari (rektangel med pil ↑) → välj <strong>"Lägg till på hemskärmen"</strong>. Då öppnas Nordbok som en riktig app.
            </div>
          </div>
          <button onClick={() => { sessionStorage.setItem("ios-install-shown", "1"); setShowIos(false); }} className="btn btn-ghost btn-sm" style={{ minHeight: 28, padding: "4px 8px" }}>×</button>
        </div>
      </div>
    );
  }

  return null;
}
