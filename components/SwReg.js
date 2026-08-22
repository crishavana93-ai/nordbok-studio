"use client";

/* components/SwReg.js
 *
 * Registers the service worker and — the part that was missing — makes sure a new
 * one actually takes effect.
 *
 * `updateViaCache: "none"` stops the browser serving /sw.js itself from its HTTP
 * cache. Without it a stale service worker script can survive its own replacement,
 * which is a genuinely miserable bug to chase: you deploy a fix to the caching layer
 * and the caching layer is what prevents the fix arriving.
 *
 * When a new worker takes control we reload once, guarded by a flag so two workers
 * swapping cannot put the app in a reload loop.
 */

import { useEffect } from "react";

export default function SwReg() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        // A worker already waiting from a previous visit — let it through now.
        if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");

        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              sw.postMessage("SKIP_WAITING");
            }
          });
        });

        // Check for a new build when the app is brought back to the foreground.
        const onVisible = () => { if (document.visibilityState === "visible") reg.update(); };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
      })
      .catch(() => {});

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return null;
}
