"use client";

/* components/Splash.jsx
 *
 * The logo animation, once per app launch, then out of the way.
 *
 * WHY sessionStorage AND NOT localStorage
 * "Once ever" means a returning user never sees the thing again, which defeats the
 * point of having made it. "Every navigation" is an obstacle. Once per launch of the
 * installed app is the honest reading of "when opening the app".
 *
 * WHY IT CAN ALWAYS BE SKIPPED
 * A splash you cannot dismiss is a splash that stands between someone and a receipt
 * they are photographing in a taxi. Tap anywhere, press Escape, or wait -- whichever
 * comes first. It also never blocks: if the video fails to decode, onError closes it.
 */

import { useEffect, useRef, useState } from "react";

const KEY = "nordbok_splash_seen";

export default function Splash({ name }) {
  const [open, setOpen] = useState(false);
  const [fading, setFading] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    let seen = true;
    try { seen = sessionStorage.getItem(KEY) === "1"; } catch { /* private mode */ }
    if (seen) return;
    try { sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setOpen(true);
    // Hard ceiling. Whatever the video does, the app is usable in 4 seconds.
    timer.current = setTimeout(close, 4000);
    return () => clearTimeout(timer.current);
  }, []);

  function close() {
    clearTimeout(timer.current);
    setFading(true);
    setTimeout(() => setOpen(false), 320);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={close}
      role="presentation"
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "var(--ground)",
        display: "grid", placeItems: "center",
        opacity: fading ? 0 : 1,
        transition: "opacity 320ms ease",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, padding: 24 }}>
        <video
          src="/logo-animation.mp4"
          autoPlay muted playsInline
          onEnded={close}
          onError={close}
          aria-hidden="true"
          style={{ width: "min(300px, 62vw)", height: "auto", borderRadius: 16 }}
        />
        <p style={{ margin: 0, textAlign: "center", fontSize: 14.5, lineHeight: 1.5, color: "var(--ink-2)" }}>
          {name ? <>Välkommen tillbaka, {name}.</> : <>Välkommen till Nordbök Studio.</>}
        </p>
      </div>
      <button
        onClick={close}
        style={{
          position: "absolute", bottom: "max(24px, env(safe-area-inset-bottom))",
          left: "50%", transform: "translateX(-50%)",
          border: 0, background: "transparent", cursor: "pointer",
          fontSize: 12.5, letterSpacing: "0.06em", textTransform: "uppercase",
          color: "var(--ink-3)",
        }}
      >
        Hoppa över
      </button>
    </div>
  );
}
